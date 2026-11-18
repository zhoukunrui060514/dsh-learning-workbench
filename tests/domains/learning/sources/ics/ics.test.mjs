import test from 'node:test';
import assert from 'node:assert/strict';
import {memoryPorts} from '../../../../support/ports.mjs';
import {createWorkbench} from '../../../../../src/core/workbench.mjs';
import {domains} from '../../../../../src/domains/learning/module.mjs';
import {createIcsSource} from '../../../../../src/domains/learning/sources/ics/module.mjs';

const encode = text => new TextEncoder().encode(text);
const event = lines => `BEGIN:VEVENT\r\n${lines.join('\r\n')}\r\nEND:VEVENT`;
const calendar = (events, extra=[]) => ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Invented tests//EN',...extra,...events,'END:VCALENDAR'].join('\r\n');
const range = {from:'2026-01-01T00:00:00Z',to:'2027-01-01T00:00:00Z'};
const config = {id:'fiction',path:'/invented/calendar.ics',timeZone:'Asia/Shanghai'};
function fixture(text, options={}) {
  const ports = memoryPorts(), settings={...config,...options};
  ports.control.files.set(settings.path,encode(text));
  return {ports,source:createIcsSource(settings,ports)};
}
const read = async(text,options={},window=range) => (await fixture(text,options).source.read(window)).records;

// All fixtures below are invented. No exported user calendar is loaded in tests.
test('DATE remains a date, default all-day end is next day, and explicit end is exclusive',async()=>{
  const records=await read(calendar([
    event(['UID:a','DTSTART;VALUE=DATE:20261115','SUMMARY:全天安排']),
    event(['UID:b','DTSTART;VALUE=DATE:20261116','DTEND;VALUE=DATE:20261118','SUMMARY:学习通考试：虚构测验']),
  ]));
  assert.deepEqual(records[0].data,{title:'全天安排',start:{date:'2026-11-15',timeZone:'Asia/Shanghai'},end:{date:'2026-11-16',timeZone:'Asia/Shanghai'},busy:true});
  assert.deepEqual(records[1].data,{title:'学习通考试：虚构测验',type:'exam',due:{date:'2026-11-16',timeZone:'Asia/Shanghai'}});
  assert.equal(records[0].subjectRef,null);
  assert.equal(records[0].observedAt,'2026-11-13T00:00:00Z');
});

test('UTC, TZID and floating times produce offset-bearing instants independently of server TZ',async()=>{
  const input=calendar([
    event(['UID:utc','DTSTART:20261115T010000Z','DTEND:20261115T020000Z','SUMMARY:UTC']),
    event(['UID:tz','DTSTART;TZID=Asia/Shanghai:20261115T090000','DTEND;TZID=Asia/Shanghai:20261115T100000','SUMMARY:TZID']),
    event(['UID:float','DTSTART:20261115T090000','DURATION:PT1H','SUMMARY:Floating','TRANSP:TRANSPARENT']),
  ]);
  const previous=process.env.TZ;
  try {
    process.env.TZ='Pacific/Honolulu';const a=await read(input);
    process.env.TZ='Europe/London';const b=await read(input);
    assert.deepEqual(a,b);
    assert.deepEqual(a.map(r=>r.data.start),[
      {at:'2026-11-15T01:00:00Z',timeZone:'UTC'},
      {at:'2026-11-15T09:00:00+08:00',timeZone:'Asia/Shanghai'},
      {at:'2026-11-15T09:00:00+08:00',timeZone:'Asia/Shanghai'},
    ]);
    assert.equal(a[2].data.busy,false);
  } finally { if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous; }
});

test('calendar X-WR-TIMEZONE supplies floating zone; missing and unknown zones fail visibly',async()=>{
  const events=[event(['UID:f','DTSTART:20261115T090000','DURATION:PT1H'])];
  const records=await read(calendar(events,['X-WR-TIMEZONE:Asia/Tokyo']),{timeZone:undefined});
  assert.equal(records[0].data.start.at,'2026-11-15T09:00:00+09:00');
  await assert.rejects(read(calendar(events),{timeZone:undefined}),/TIME_ZONE_REQUIRED/);
  await assert.rejects(read(calendar([event(['UID:z','DTSTART;TZID=Unknown/City:20261115T090000','DURATION:PT1H'])])),/INVALID_TIME_ZONE/);
});

test('folding, escaped text, categories and VALARM are parsed without inventing deadlines',async()=>{
  const records=await read(calendar([event([
    'UID:text','DTSTART:20261115T010000Z','DTEND:20261115T020000Z',
    'SUMMARY:Discuss exam\\, tasks\\; chapter ', ' two\\nnext\\\\line',
    'BEGIN:VALARM','ACTION:DISPLAY','TRIGGER:-PT10M','DESCRIPTION:学习通考试：alarm only','END:VALARM',
  ])]));
  assert.equal(records.length,1);assert.equal(records[0].kind,'calendar-event');
  assert.equal(records[0].data.title,'Discuss exam, tasks; chapter two\nnext\\line');
});

test('only observed prefixes classify deadlines, and module rules can replace these conventions',async()=>{
  const input=calendar([
    event(['UID:exam','SUMMARY:学习通考试：虚构章节','DTSTART:20261115T010000Z','DTEND:20261115T020000Z']),
    event(['UID:assignment','SUMMARY:学习通作业截止：虚构作业','DTSTART:20261116T155900Z','DTEND:20261116T160000Z']),
    event(['UID:unknown','SUMMARY:考试讨论','CATEGORIES:EXAM,TRAINING','DTSTART;VALUE=DATE:20261118','DTEND;VALUE=DATE:20261120']),
  ]);
  const defaults=await read(input);
  assert.deepEqual(defaults.map(r=>[r.kind,r.data.type]),[['deadline','exam'],['deadline','assignment'],['calendar-event',undefined]]);
  assert.equal(defaults[1].data.due.at,'2026-11-16T15:59:00Z');
  const custom=await read(input,{rules:[{field:'categories',equals:'EXAM',type:'exam',due:'end'}],subjectRef:'local-subject'});
  assert.deepEqual(custom.map(r=>r.kind),['calendar-event','calendar-event','deadline']);
  assert.deepEqual(custom[2].data.due,{date:'2026-11-19',timeZone:'Asia/Shanghai'});
  assert.equal(custom[2].subjectRef,'local-subject');
});

test('RRULE, EXDATE and RECURRENCE-ID override expand only the requested window with stable IDs',async()=>{
  const master=event(['UID:series','SUMMARY:Seminar','DTSTART;TZID=America/New_York:20260306T090000','DTEND;TZID=America/New_York:20260306T100000','RRULE:FREQ=DAILY;COUNT=6','EXDATE;TZID=America/New_York:20260307T090000']);
  const override=event(['UID:series','RECURRENCE-ID;TZID=America/New_York:20260309T090000','SUMMARY:Moved seminar','DTSTART;TZID=America/New_York:20260309T140000','DTEND;TZID=America/New_York:20260309T150000']);
  const cancelled=event(['UID:series','RECURRENCE-ID;TZID=America/New_York:20260310T090000','STATUS:CANCELLED']);
  const input=calendar([master,override,cancelled]);
  const a=await read(input),b=await read(input);
  assert.deepEqual(a,b);assert.equal(a.length,4);
  assert.deepEqual(a.map(r=>r.data.start.at).sort(),['2026-03-06T09:00:00-05:00','2026-03-08T09:00:00-04:00','2026-03-09T14:00:00-04:00','2026-03-11T09:00:00-04:00']);
  const original=await read(calendar([master]));
  assert.equal(a.find(r=>r.data.title==='Moved seminar').externalId,original.find(r=>r.data.start.at.startsWith('2026-03-09')).externalId);
  const subset=await read(input,{}, {from:'2026-03-08T00:00:00Z',to:'2026-03-10T00:00:00Z'});
  assert.equal(subset.length,2);
  assert.ok(subset.every(r=>a.some(other=>other.externalId===r.externalId)));
});

test('override moved into range and different UIDs with the same recurrence slot stay separate',async()=>{
  const records=await read(calendar([
    event(['UID:a','DTSTART:20261101T090000Z','DURATION:PT1H','RRULE:FREQ=WEEKLY;COUNT=2','SUMMARY:A']),
    event(['UID:a','RECURRENCE-ID:20261101T090000Z','DTSTART:20261202T120000Z','DURATION:PT1H','SUMMARY:Moved A']),
    event(['UID:b','DTSTART:20261101T090000Z','DURATION:PT1H','RRULE:FREQ=WEEKLY;COUNT=2','SUMMARY:B']),
  ]),{}, {from:'2026-12-01T00:00:00Z',to:'2026-12-03T00:00:00Z'});
  assert.equal(records.length,1);assert.equal(records[0].data.title,'Moved A');
  const all=await read(calendar([
    event(['UID:a','DTSTART:20261101T090000Z','DURATION:PT1H','RRULE:FREQ=DAILY;COUNT=2','SUMMARY:A']),
    event(['UID:b','DTSTART:20261101T090000Z','DURATION:PT1H','RRULE:FREQ=DAILY;COUNT=2','SUMMARY:B']),
  ]));
  assert.equal(all.length,4);assert.equal(new Set(all.map(r=>r.externalId)).size,4);
});

test('monthly BYDAY/BYSETPOS, UNTIL, RDATE and all-day EXDATE are handled by the recurrence engine',async()=>{
  const records=await read(calendar([event([
    'UID:month','DTSTART;VALUE=DATE:20260130','RRULE:FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;UNTIL=20260430',
    'EXDATE;VALUE=DATE:20260227','RDATE;VALUE=DATE:20260501','SUMMARY:Month end',
  ])]));
  assert.deepEqual(records.map(r=>r.data.start.date),['2026-01-30','2026-03-31','2026-04-30','2026-05-01']);
});

test('RFC gap uses the offset before transition, fold chooses first occurrence, recurrence observes DST',async()=>{
  const records=await read(calendar([
    event(['UID:gap','SUMMARY:学习通考试：虚构一','DTSTART;TZID=America/New_York:20260308T023000']),
    event(['UID:fold','SUMMARY:学习通考试：虚构二','DTSTART;TZID=America/New_York:20261101T013000']),
  ]));
  assert.equal(records[0].data.due.at,'2026-03-08T02:30:00-05:00');
  assert.equal(records[1].data.due.at,'2026-11-01T01:30:00-04:00');
});

test('embedded VTIMEZONE wins over ICU and is isolated to each calendar',async()=>{
  const zone=['BEGIN:VTIMEZONE','TZID:Asia/Shanghai','BEGIN:STANDARD','DTSTART:19700101T000000','TZOFFSETFROM:+0900','TZOFFSETTO:+0900','END:STANDARD','END:VTIMEZONE'].join('\r\n');
  const events=[event(['UID:embedded','DTSTART;TZID=Asia/Shanghai:20261115T090000','DURATION:PT1H'])];
  assert.equal((await read(calendar(events,[zone])))[0].data.start.at,'2026-11-15T09:00:00+09:00');
  assert.equal((await read(calendar(events)))[0].data.start.at,'2026-11-15T09:00:00+08:00');
});

test('range includes overlapping events, excludes upper bound and defaults to a finite horizon',async()=>{
  const input=calendar([event(['UID:forever','DTSTART:20260101T230000Z','DURATION:PT2H','RRULE:FREQ=DAILY'])]);
  const records=await read(input,{}, {from:'2026-11-15',to:'2026-11-16'});
  assert.equal(records.length,1);assert.equal(records[0].data.start.at,'2026-11-14T23:00:00Z');
  const defaults=(await fixture(input).source.read()).records;
  assert.ok(defaults.length>300 && defaults.length<400);
});

test('file and HTTP ports are read-only; snapshot ID stable, location changes separate caches',async()=>{
  const input=calendar([event(['UID:same','DTSTART;VALUE=DATE:20261115'])]);
  const ports=memoryPorts(), wb=createWorkbench(ports);wb.registerDomain(domains[0]);
  ports.control.files.set(config.path,encode(input));
  const url='https://calendar.invalid/private/fictional-token/basic.ics';
  ports.control.responses.set(url,{bytes:encode(input),contentType:'text/calendar'});
  const configs=[config,{id:'remote',url,timeZone:'Asia/Shanghai'}];
  const dispose=setup({workbench:wb,ports,config:{calendars:configs}});
  const ids=wb.snapshot().sources.map(s=>s.id);
  for(const id of ids){await wb.sync(id,range);await wb.sync(id,range);}
  const snapshot=wb.snapshot();
  assert.deepEqual(snapshot.sources.map(s=>s.records.length),[1,1]);
  assert.equal(JSON.stringify(snapshot).includes(url),false);
  assert.equal(JSON.stringify(snapshot).includes(config.path),false);
  assert.equal(ids[0],createIcsSource(config,ports).id);
  assert.notEqual(ids[0],createIcsSource({...config,path:'/different.ics'},ports).id);
  dispose();await wb.close();
});

test('read and parser failures do not expose private URL even through cause; last good snapshot survives',async()=>{
  const ports=memoryPorts(),wb=createWorkbench(ports);wb.registerDomain(domains[0]);
  const url='https://calendar.invalid/private/never-print-this/basic.ics';
  const source=createIcsSource({id:'remote',url,timeZone:'Asia/Shanghai'},ports);
  ports.http.get=async()=>({bytes:encode(calendar([event(['UID:x','DTSTART;VALUE=DATE:20261115'])]))});
  wb.registerSource(source);await wb.sync(source.id,range);
  ports.http.get=async()=>{throw Object.assign(new Error(`failed GET ${url}`),{cause:new Error(url)});};
  await assert.rejects(wb.sync(source.id,range),error=>{
    assert.equal(error.code,'READ_FAILED');assert.equal(error.cause,undefined);
    assert.ok(!error.stack.includes(url));return true;
  });
  assert.equal(wb.snapshot().sources[0].records.length,1);
  assert.equal(wb.snapshot().sources[0].status,'error');
  assert.ok(!JSON.stringify(wb.snapshot()).includes(url));
  ports.http.get=async()=>({bytes:encode(calendar([event(['UID:broken',`DTSTART:${url}`])]))});
  await assert.rejects(source.read(range),error=>!error.stack.includes(url)&&!error.cause);
  await wb.close();
});

test('missing UID fails instead of generating unstable IDs',async()=>{
  await assert.rejects(read(calendar([event(['DTSTART;VALUE=DATE:20261115'])])),/UID_REQUIRED/);
});


test('impossible dates and times fail instead of normalizing to a different day',async()=>{
  for(const value of ['20260230T090000Z','20261115T250000Z'])
    await assert.rejects(read(calendar([event(['UID:bad',`DTSTART:${value}`,'DURATION:PT1H'])])),/INVALID_DATE/);
});

test('UTC recurrence-id and local recurrence-id identify the same original slot',async()=>{
  const master=event(['UID:utc-override','DTSTART;TZID=America/New_York:20260306T090000','DURATION:PT1H','RRULE:FREQ=DAILY;COUNT=2']);
  const original=await read(calendar([master]));
  const moved=await read(calendar([master,event(['UID:utc-override','RECURRENCE-ID:20260307T140000Z','DTSTART:20260307T180000Z','DURATION:PT1H'])]));
  assert.equal(moved.find(r=>r.data.start.at==='2026-03-07T18:00:00Z').externalId,original[1].externalId);
});


test('THISANDFUTURE moves subsequent slots, including slots originally beyond the read range',async()=>{
  const master=event(['UID:range','DTSTART:20261110T090000Z','DURATION:PT1H','RRULE:FREQ=DAILY;COUNT=5','SUMMARY:Original']);
  const change=event(['UID:range','RECURRENCE-ID;RANGE=THISANDFUTURE:20261112T090000Z','DTSTART:20261111T090000Z','DURATION:PT2H','SUMMARY:Moved']);
  const records=await read(calendar([master,change]),{}, {from:'2026-11-11T00:00:00Z',to:'2026-11-13T00:00:00Z'});
  assert.equal(records.length,3);
  assert.deepEqual(records.map(r=>r.data.start.at).sort(),['2026-11-11T09:00:00Z','2026-11-11T09:00:00Z','2026-11-12T09:00:00Z']);
  const last=records.find(r=>r.data.start.at==='2026-11-12T09:00:00Z');
  assert.equal(last.data.title,'Moved');assert.equal(last.data.end.at,'2026-11-12T11:00:00Z');
  const original=await read(calendar([master]));
  assert.equal(last.externalId,original.find(r=>r.data.start.at==='2026-11-13T09:00:00Z').externalId);
});

for (const withStart of [false,true]) {
  test(`THISANDFUTURE cancellation ${withStart ? 'with' : 'without'} DTSTART removes subsequent slots on sync`,async()=>{
    const master=event(['UID:cancel-range','DTSTART:20261113T090000Z','DURATION:PT1H','RRULE:FREQ=DAILY;COUNT=3']);
    const cancellation=event([
      'UID:cancel-range','RECURRENCE-ID;RANGE=THISANDFUTURE:20261114T090000Z','STATUS:CANCELLED',
      ...(withStart ? ['DTSTART:20261114T090000Z'] : []),
    ]);
    const {ports,source}=fixture(calendar([master]));
    const wb=createWorkbench(ports);wb.registerDomain(domains[0]);wb.registerSource(source);
    const window={from:'2026-11-01T00:00:00Z',to:'2026-12-01T00:00:00Z'};
    try {
      const before=await wb.sync(source.id,window);
      assert.equal(before.records.length,3);
      ports.control.files.set(config.path,encode(calendar([master,cancellation])));
      const after=await wb.sync(source.id,window);
      assert.equal(after.status,'ready');
      assert.deepEqual(after.records.map(r=>r.data.start.at),['2026-11-13T09:00:00Z']);
      assert.equal(after.records[0].externalId,before.records[0].externalId);
    } finally { await wb.close(); }
  });
}


test('zero-duration ordinary events warn without leaking URL; valid events and instant deadlines sync',async()=>{
  const url='https://calendar.invalid/private/fictional-secret/basic.ics';
  const valid=event(['UID:valid','SUMMARY:Session','DTSTART:20261115T090000Z','DURATION:PT1H']);
  const zero=[
    event([`UID:${url}`,`SUMMARY:${url}`,'DTSTART:20261115T100000Z']),
    event(['UID:explicit','DTSTART:20261115T110000Z','DTEND:20261115T110000Z']),
    event(['UID:duration','DTSTART:20261115T120000Z','DURATION:PT0S']),
  ];
  const deadline=event(['UID:deadline','SUMMARY:学习通考试：虚构考试','DTSTART:20261115T130000Z']);
  const explicitDeadline=event(['UID:explicit-deadline','SUMMARY:学习通作业截止：虚构作业','DTSTART:20261115T140000Z','DTEND:20261115T140000Z']);
  const ports=memoryPorts(),wb=createWorkbench(ports);wb.registerDomain(domains[0]);
  const source=createIcsSource({id:'warning',url,timeZone:'Asia/Shanghai'},ports);
  wb.registerSource(source);
  const set=events=>ports.control.responses.set(url,{bytes:encode(calendar(events)),contentType:'text/calendar'});
  try {
    set([valid,deadline,explicitDeadline,...zero]);
    const first=await wb.sync(source.id,range);
    assert.equal(first.status,'ready');assert.equal(first.error,null);
    assert.deepEqual(first.records.map(r=>r.kind),['calendar-event','deadline','deadline']);
    assert.equal(first.records[1].data.due.at,'2026-11-15T13:00:00Z');
    assert.equal(first.records[2].data.due.at,'2026-11-15T14:00:00Z');
    assert.deepEqual(first.warnings,[{code:'ics-zero-duration-skipped',message:'已跳过读取范围内 3 个零时长普通日程实例；未添加持续时间，其他记录已同步。'}]);
    assert.ok(!JSON.stringify(first).includes(url));
    const repeat=await wb.sync(source.id,range);
    assert.deepEqual(repeat.warnings,first.warnings);
    assert.deepEqual(repeat.records,first.records);
    set([valid,...zero.slice(0,1)]);
    const fewer=await wb.sync(source.id,range);
    assert.equal(fewer.records.length,1); // replace also removes the old deadline
    assert.equal(fewer.warnings.length,1);assert.match(fewer.warnings[0].message,/1 个/);
    set([valid]);
    const clean=await wb.sync(source.id,range);
    assert.deepEqual(clean.warnings,[]);assert.equal(clean.records.length,1);
    assert.equal(clean.records[0].externalId,first.records[0].externalId);
  } finally {await wb.close();}
});

test('negative durations remain failures, including classified deadlines',async()=>{
  for(const end of ['DTEND:20261115T080000Z','DURATION:-PT1H']) {
    for(const summary of ['Ordinary','学习通考试：虚构考试']) {
      const {source}=fixture(calendar([event(['UID:negative',`SUMMARY:${summary}`,'DTSTART:20261115T090000Z',end])]));
      await assert.rejects(source.read(range),/EVENT_END_REQUIRED/);
    }
  }
});

test('zero-duration recurring slots only warn in range; moved valid slot retains its identity',async()=>{
  const master=event(['UID:zero-series','DTSTART:20261114T090000Z','RRULE:FREQ=DAILY;COUNT=4']);
  const override=event(['UID:zero-series','RECURRENCE-ID:20261116T090000Z','DTSTART:20261116T100000Z','DURATION:PT1H']);
  const cancelled=event(['UID:zero-series','RECURRENCE-ID:20261117T090000Z','STATUS:CANCELLED']);
  const {source}=fixture(calendar([master,override,cancelled]));
  const window={from:'2026-11-15T00:00:00Z',to:'2026-11-18T00:00:00Z'};
  const result=await source.read(window);
  assert.equal(result.records.length,1);assert.equal(result.records[0].data.start.at,'2026-11-16T10:00:00Z');
  assert.equal(result.warnings.length,1);assert.match(result.warnings[0].message,/1 个/);
  const original=await read(calendar([master.replace('RRULE:', 'DURATION:PT1H\r\nRRULE:')]),{},window);
  assert.equal(result.records[0].externalId,original.find(r=>r.data.start.at==='2026-11-16T09:00:00Z').externalId);
  const empty=await source.read({from:'2026-12-01T00:00:00Z',to:'2026-12-02T00:00:00Z'});
  assert.deepEqual(empty.records,[]);assert.deepEqual(empty.warnings,[]);
});

function setup({workbench,ports,config}){const stops=config.calendars.map(c=>workbench.registerSource(createIcsSource(c,ports)));return ()=>stops.reverse().forEach(stop=>stop());}
