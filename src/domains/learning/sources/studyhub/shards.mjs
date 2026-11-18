import path from 'node:path';
import { envelope } from './actions.mjs';
import { courseRatios } from './ratio.mjs';
const decoder=new TextDecoder();
const key=value=>typeof value==='string'?value.normalize('NFKC').replace(/\s+/g,' ').trim():'';
function instant(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))throw Error('invalid StudyHub timestamp');
  return new Date(value).toISOString();
}
/** store.js v5: deck objects, attempts arrays; names are relative to shards/. Read only. */
export async function readShards({libraryRoot,files,courses,timeZone,now,subjectMap={}}) {
  const indexPath=path.join(libraryRoot,'study-workspace.json');
  const before=decoder.decode(await files.read(indexPath));
  const index=JSON.parse(before);
  if(index.format!=='study-sharded'||index.version!==5)return {records:[],capabilities:[],warnings:[{code:'studyhub-shards-unsupported',message:'StudyHub 分片格式不是已适配的 study-sharded v5；未产出复习事件、到期量和可提取率掌握度，官方 action 数据仍可用。'}]};
  const load=async(field,chunk)=>{
    const names=index.shards?.[field];
    if(!Array.isArray(names))throw Error('invalid StudyHub shard index');
    const values=[];
    for(const name of names) {
      // A library manifest is data, not permission to read outside its shards directory.
      if(typeof name!=='string'||name.includes('\\')||!name.startsWith(field+'/')||name.split('/').some(part=>!part||part==='.'||part==='..')||name.includes(':'))throw Error('invalid StudyHub shard path');
      const value=JSON.parse(decoder.decode(await files.read(path.join(libraryRoot,'shards',name))));
      if(chunk){if(!Array.isArray(value))throw Error('invalid StudyHub attempt chunk');values.push(...value);}
      else values.push(value);
    }
    return values;
  };
  const decks=await load('decks',false),attempts=await load('attempts',true);
  const byId=new Map(courses.map(c=>[c.id,c])),byName=new Map();
  for(const c of courses)byName.set(key(c.name),c);
  for(const c of courses)for(const alias of c.aliases||[])if(!byName.has(key(alias)))byName.set(key(alias),c);
  // StudyHub courses.js gives legacy stated names precedence over courseId.
  const courseOf=d=>d.course!==undefined||d.folder!==undefined?byName.get(key(d.course??d.folder)):byId.get(d.courseId);
  const deckMap=new Map();
  for(const deck of decks){if(typeof deck?.id!=='string'||!deck.id||!Array.isArray(deck.cards))throw Error('invalid StudyHub deck');deckMap.set(deck.id,deck);}
  const records=[],reviewed=new Set();
  const item=(deckId,cardId)=>JSON.stringify([deckId,cardId]);
  const localDay=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'});
  for(const a of attempts) {
    if(typeof a?.id!=='string'||!a.id)throw Error('invalid StudyHub attempt identity');
    const occurredAt=instant(a.timestamp),course=courseOf(deckMap.get(a.deckId)||{});
    const itemRef=typeof a.deckId==='string'&&typeof a.quiz_id==='string'?item(a.deckId,a.quiz_id):null;
    if(itemRef&&!a.retry&&!a.updatedAfterOpening&&typeof a.grade==='number')reviewed.add(itemRef);
    let correct=null;
    if(!a.selfReported&&!a.unverified&&['graded','rubric','oral'].includes(a.assessment)) {
      if(typeof a.correct==='boolean')correct=a.correct;
      else if(Number.isInteger(a.grade)&&a.grade>=0&&a.grade<=5)correct=a.grade>=3;
    }
    if(a.elapsed_ms!=null&&(!Number.isFinite(a.elapsed_ms)||a.elapsed_ms<0))throw Error('invalid StudyHub elapsed_ms');
    records.push({...envelope('review-event',`attempt:${a.id}`,course?.id??null,now,subjectMap,course?.name),data:{occurredAt,localDate:localDay.format(new Date(occurredAt)),timeZone,itemRef,correct,durationSeconds:a.elapsed_ms==null?null:a.elapsed_ms/1000}});
  }
  for(const deck of decks) {
    const course=courseOf(deck);
    if(deck.archived||deck.systemKind||course?.active===false)continue;
    for(const card of deck.cards) {
      if(typeof card?.id!=='string'||!card.id)throw Error('invalid StudyHub card identity');
      const itemRef=item(deck.id,card.id);
      // Same new-card exclusion as mastery.cardLevel/dueOf. Keep future dates for forecasts.
      if(card.suspended||!card.review?.due_at||(!(card.review.repetitions>0)&&!reviewed.has(itemRef)))continue;
      records.push({...envelope('due-item',`due:${itemRef}`,course?.id??null,now,subjectMap,course?.name),data:{due:{at:instant(card.review.due_at),timeZone},count:1,unit:'card',itemRef}});
    }
  }
  // sm2.js counts days in the scheduler machine's local zone, not the library display zone.
  records.push(...courseRatios({decks,courses,courseOf,now,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone,settings:index.settings??{},subjectMap}));
  // A commit swaps the manifest atomically; do not publish a mixture of two library revisions.
  if(decoder.decode(await files.read(indexPath))!==before)throw Error('StudyHub library changed during read');
  return {records,capabilities:['review-event','due-item'],warnings:[]};
}
