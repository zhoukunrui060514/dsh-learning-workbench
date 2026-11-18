import ICAL from 'ical.js';

export function calendarError(code) {
  const error = new Error(`ICS: ${code}`);
  error.code = code;
  return error;
}

export function ianaZone(name) {
  if (!name) throw calendarError('TIME_ZONE_REQUIRED');
  try {
    new Intl.DateTimeFormat('en', {timeZone:name}).format();
  } catch {
    throw calendarError('INVALID_TIME_ZONE');
  }
  return name;
}

// ICAL.js supplies recurrence and embedded VTIMEZONE support, but ships no IANA
// database. Use Node's ICU for TZIDs without a VTIMEZONE, scoped to this calendar.
function intlZone(name) {
  ianaZone(name);
  const format = new Intl.DateTimeFormat('en', {
    timeZone:name, timeZoneName:'longOffset',
  });
  const offsetAt = ms => {
    const text = format.formatToParts(ms).find(p => p.type === 'timeZoneName').value;
    if (text === 'GMT') return 0;
    const [,sign,h,m,s='0'] = /^GMT([+-])(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(text);
    return (sign === '+' ? 1 : -1) * (Number(h)*3600 + Number(m)*60 + Number(s));
  };
  const zone = new ICAL.Timezone({tzid:name});
  zone.utcOffset = time => {
    const wall = Date.UTC(time.year, time.month-1, time.day, time.hour, time.minute, time.second);
    const offsets = [...new Set([offsetAt(wall-86400000), offsetAt(wall), offsetAt(wall+86400000)])];
    const valid = offsets.filter(offset => offsetAt(wall-offset*1000) === offset);
    // RFC 5545 §3.3.5: first occurrence in a fold; pre-gap offset for a gap.
    return valid.length ? Math.max(...valid) : Math.min(...offsets);
  };
  return zone;
}

export function bindZones(calendar, configuredZone) {
  const calendarZone = configuredZone || calendar.getFirstPropertyValue('x-wr-timezone');
  if (calendarZone) ianaZone(calendarZone);
  const embedded = calendar.getTimeZoneByID.bind(calendar), zones = new Map();
  calendar.getTimeZoneByID = name => {
    ianaZone(name); // When requires an IANA name, not an opaque vendor TZID.
    if (!zones.has(name)) zones.set(name, embedded(name) || intlZone(name));
    return zones.get(name);
  };
  const localZone = () => calendar.getTimeZoneByID(ianaZone(calendarZone));
  for (const component of calendar.getAllSubcomponents('vevent')) {
    for (const name of ['dtstart','dtend','recurrence-id','exdate','rdate']) {
      for (const property of component.getAllProperties(name)) {
        // Validate before ICAL.Time normalizes an impossible source date.
        for (const value of property.toJSON().slice(3)) {
          if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}Z?)?$/.test(value))
            throw calendarError('INVALID_DATE');
          const numeric = value.replace(/Z$/, '') + (value.length === 10 ? 'T00:00:00Z' : 'Z');
          const date = new Date(numeric);
          if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0,value.length === 10 ? 10 : 19) !== value.slice(0,19))
            throw calendarError('INVALID_DATE');
        }
        for (const time of property.getValues()) {
          if (time.isDate) localZone();
          else if (time.zone === ICAL.Timezone.localTimezone) time.zone = localZone();
        }
      }
    }
  }
  return {calendarZone, zone:localZone};
}

export function when(time, calendarZone) {
  if (time.isDate) return {date:time.toString(), timeZone:ianaZone(calendarZone)};
  const offset = time.utcOffset();
  if (offset % 60) throw calendarError('SUBMINUTE_OFFSET_UNREPRESENTABLE');
  const pad = n => String(n).padStart(2,'0');
  const suffix = offset === 0 ? 'Z' : `${offset < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(offset)/3600))}:${pad(Math.abs(offset)%3600/60)}`;
  return {at:time.toString().replace(/Z$/, '') + suffix, timeZone:time.zone.tzid};
}

export function instant(time, context) {
  if (!time.isDate) return time.toUnixTime()*1000;
  const midnight = time.clone();
  midnight.isDate = false;
  midnight.zone = context.zone();
  return midnight.toUnixTime()*1000;
}

export function rangeBounds(range, now, context) {
  const parse = value => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return instant(ICAL.Time.fromDateString(value), context);
    if (!/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) throw calendarError('INVALID_RANGE');
    return Date.parse(value);
  };
  const from = range?.from === undefined ? Date.parse(now)-30*86400000 : parse(range.from);
  const to = range?.to === undefined ? Date.parse(now)+366*86400000 : parse(range.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) throw calendarError('INVALID_RANGE');
  return {from,to};
}
