// Read-only extraction of StudyHub 4.6.0 lib/sm2.js memoryState/algorithm/dayDiff.
// Copyright (c) 2026 Eric Wang, MIT; see STUDYHUB-LICENSE.txt.
import { envelope } from './actions.mjs';
const DAY_MS=864e5;
const clamp=(value,min,max)=>Math.min(Math.max(value,min),max);
const round8=value=>Math.round(value*1e8)/1e8;
function dayNumber(ms,timeZone) {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(ms));
  const values=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return Date.UTC(Number(values.year),Number(values.month)-1,Number(values.day))/DAY_MS;
}
export function retrievability(review,{now,timeZone,settings={}}) {
  const weights=settings.w;
  if(weights!==undefined&&(!Array.isArray(weights)||weights.length!==21||weights.some(w=>!Number.isFinite(w))))throw Error('invalid StudyHub FSRS weights');
  const decay=-clamp(weights?.[20]??0.1542,0.1,0.8);
  const factor=round8(Math.exp(Math.pow(decay,-1)*Math.log(0.9))-1);
  const b=review&&typeof review==='object'&&!Array.isArray(review)?review:{};
  const at=Date.parse(now);
  let stability=Number(b.stability),lastReview;
  const difficulty=Number(b.difficulty);
  if(Number.isFinite(stability)&&stability>0&&Number.isFinite(difficulty)&&difficulty>0) {
    stability=clamp(stability,1e-3,36500);
    const last=b.last_review?Date.parse(b.last_review):NaN;
    lastReview=Number.isFinite(last)?last:null;
  } else {
    const interval=Number(b.interval_days);
    if(!Number.isFinite(interval)||interval<=0)return null; // New: no memory state, not a probability of zero.
    stability=clamp(interval,1e-3,36500);
    const due=b.due_at?Date.parse(b.due_at):NaN;
    lastReview=(Number.isFinite(due)?due:at)-stability*DAY_MS;
  }
  const elapsed=lastReview===null?0:Math.max(0,Math.round(dayNumber(at,timeZone)-dayNumber(lastReview,timeZone)));
  return round8(Math.pow(1+factor*elapsed/stability,decay));
}
export function courseRatios({decks,courses,courseOf,now,timeZone,settings={},subjectMap={}}) {
  const counts=new Map(courses.map(c=>[c.id,{total:0,remembered:0}]));
  // Validate custom weights even for an empty library; don't silently accept an unusable model.
  retrievability(null,{now,timeZone,settings});
  for(const deck of decks) {
    if(deck.archived||deck.systemKind)continue;
    const count=counts.get(courseOf(deck)?.id);if(!count)continue;
    for(const card of deck.cards) {
      if(card.suspended)continue;
      count.total++;
      const recall=retrievability(card.review,{now,timeZone,settings});
      if(recall!==null&&recall>=0.9)count.remembered++;
    }
  }
  return courses.map(course=>{
    const {total,remembered}=counts.get(course.id);
    return {...envelope('mastery-snapshot',`recall:${course.id}`,course.id,now,subjectMap,course.name),data:{asOf:now,topicRef:null,scale:'ratio',value:total?remembered/total:null,numerator:total?remembered:null,denominator:total||null,
      method:`StudyHub 4.6.0 lib/sm2.js FSRS-6 R>=0.9; exact course membership; active cards (including new, excluding suspended/archived/system); new has no recall estimate; parked courses included; local calendar days in ${timeZone}; decay=${-clamp(settings.w?.[20]??0.1542,0.1,0.8)}; SM-2 memoryState migration; 8-digit rounding`}};
  });
}
