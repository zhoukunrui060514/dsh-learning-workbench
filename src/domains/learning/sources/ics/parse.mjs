import ICAL from 'ical.js';
import {createHash} from 'node:crypto';
import {bindZones, calendarError, instant, rangeBounds, when} from './time.mjs';

// Observed Chaoxing export conventions, not keyword guessing. Exams mark the
// opening of an exam window; assignment DTSTART marks its submission cutoff.
export const defaultRules = Object.freeze([
  {field:'summary',prefix:'学习通考试：',type:'exam',due:'start'},
  {field:'summary',prefix:'学习通作业截止：',type:'assignment',due:'start'},
]);

function rulesFor(config) {
  const rules = config.rules ?? defaultRules;
  if (!Array.isArray(rules) || rules.some(r =>
    !['summary','categories','description'].includes(r.field) ||
    !['exam','assignment'].includes(r.type) || !['start','end'].includes(r.due) ||
    (typeof r.prefix !== 'string' && typeof r.equals !== 'string')))
    throw calendarError('INVALID_CLASSIFICATION_RULE');
  return rules;
}

function classify(event, rules) {
  return rules.find(rule => event.component.getAllProperties(rule.field).some(property =>
    property.getValues().some(value => typeof value === 'string' &&
      (rule.equals !== undefined ? value === rule.equals : value.startsWith(rule.prefix)))));
}

function slotId(time) {
  return time.isDate ? time.toString() : String(time.toUnixTime());
}

function externalId(uid, recurrenceId) {
  // UID and the ORIGINAL recurrence slot survive title edits and moved instances.
  return createHash('sha256').update(JSON.stringify([uid,recurrenceId])).digest('hex');
}

export function parseCalendar(text, config, range, observedAt) {
  let calendar;
  try { calendar = new ICAL.Component(ICAL.parse(text)); }
  catch { throw calendarError('INVALID_ICAL'); } // parser errors can echo private input
  if (calendar.name !== 'vcalendar') throw calendarError('EXPECTED_VCALENDAR');
  const context = bindZones(calendar, config.timeZone);
  const bounds = rangeBounds(range, observedAt, context), rules = rulesFor(config);
  const components = calendar.getAllSubcomponents('vevent');
  const groups = new Map(), records = [];
  let zeroDurationCount = 0;
  for (const component of components) {
    const uid = component.getFirstPropertyValue('uid');
    if (typeof uid !== 'string' || !uid) throw calendarError('UID_REQUIRED');
    if (!groups.has(uid)) groups.set(uid, []);
    groups.get(uid).push(component);
  }
  const emit = (uid, slot, item, start, end) => {
    if (item.component.getFirstPropertyValue('status') === 'CANCELLED') return;
    if (start.isDate !== end.isDate) throw calendarError('MIXED_DATE_TYPES');
    const first = instant(start, context), last = instant(end, context);
    if (last < first || (start.isDate && last === first)) throw calendarError('EVENT_END_REQUIRED');
    const rule = classify(item, rules);
    const base = {externalId:externalId(uid,slot),observedAt,subjectRef:config.subjectRef ?? null};
    const title = item.summary || '';
    if (rule) {
      const due = (rule.due === 'end' ? end : start).clone();
      if (rule.due === 'end' && due.isDate) due.day -= 1; // exclusive DTEND -> final date
      const at = instant(due, context);
      if (at >= bounds.from && at < bounds.to)
        records.push({...base,kind:'deadline',data:{title,type:rule.type,due:when(due,context.calendarZone)}});
    } else {
      if (last === first) {
        if (first >= bounds.from && first < bounds.to) zeroDurationCount++;
        return;
      }
      if (first < bounds.to && last > bounds.from) {
        const normalizedEnd = start.isDate ? end : end.convertToZone(start.zone);
        const transparency = item.component.getFirstPropertyValue('transp');
        // RFC default is OPAQUE (busy), including when TRANSP is absent.
        const busy = transparency === 'TRANSPARENT' ? false : transparency === 'OPAQUE' || !transparency ? true : null;
        records.push({...base,kind:'calendar-event',data:{title,start:when(start,context.calendarZone),end:when(normalizedEnd,context.calendarZone),busy}});
      }
    }
  };
  for (const [uid, group] of groups) {
    const masters = group.filter(c => !c.hasProperty('recurrence-id'));
    if (masters.length > 1) throw calendarError('DUPLICATE_UID');
    const exceptions = group.filter(c => c.hasProperty('recurrence-id'));
    // Single-slot overrides are emitted independently, so moving an occurrence
    // into the range works even if its original recurrence slot is outside it.
    for (const component of exceptions) {
      const event = new ICAL.Event(component, {exceptions:[]});
      if (component.getFirstPropertyValue('status') !== 'CANCELLED') {
        if (!event.startDate) throw calendarError('DTSTART_REQUIRED');
        emit(uid,slotId(event.recurrenceId),event,event.startDate,event.endDate);
      }
    }
    if (!masters.length) continue;
    const event = new ICAL.Event(masters[0], {exceptions:[],strictExceptions:true});
    if (masters[0].getFirstPropertyValue('status') === 'CANCELLED') continue;
    if (!event.startDate) throw calendarError('DTSTART_REQUIRED');
    if (!event.isRecurring()) {
      if (!exceptions.length) emit(uid,null,event,event.startDate,event.endDate);
      continue;
    }
    let shiftedEarlier = 0;
    for (const component of exceptions) {
      const exception = new ICAL.Event(component, {exceptions:[]});
      if (!exception.modifiesFuture()) continue;
      event.relateException(exception);
      if (component.getFirstPropertyValue('status') === 'CANCELLED') continue;
      if (!exception.startDate) throw calendarError('DTSTART_REQUIRED');
      shiftedEarlier = Math.max(shiftedEarlier, instant(exception.recurrenceId,context)-instant(exception.startDate,context));
    }
    const excluded = new Set(exceptions.map(c => {
      const value = c.getFirstPropertyValue('recurrence-id');
      return value.isDate ? value.toString() : String(value.toUnixTime());
    }));
    const iterator = event.iterator();
    for (let next = iterator.next(); next; next = iterator.next()) {
      if (instant(next,context) >= bounds.to + shiftedEarlier) break;
      if (excluded.has(next.isDate ? next.toString() : String(next.toUnixTime()))) continue;
      // A cancellation only needs its recurrence boundary, not replacement dates.
      // Resolve the active range before ICAL tries to calculate shifted times.
      const rangeId = event.findRangeException(next);
      if (rangeId && event.exceptions[rangeId].component.getFirstPropertyValue('status') === 'CANCELLED') continue;
      const detail = event.getOccurrenceDetails(next);
      emit(uid,slotId(next),detail.item,detail.startDate,detail.endDate);
    }
  }
  const warnings = zeroDurationCount ? [{
    code:'ics-zero-duration-skipped',
    message:`已跳过读取范围内 ${zeroDurationCount} 个零时长普通日程实例；未添加持续时间，其他记录已同步。`,
  }] : [];
  return {records,warnings};
}
