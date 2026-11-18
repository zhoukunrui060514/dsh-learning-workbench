/** Fixed read-only surface; never forward a caller-provided action. */
export const READ_ACTIONS=Object.freeze(['library.context','course.list','course.get','course.focusProgress']);
export const WEIGHTED_METHOD='StudyHub 4.6.0 focusProgress: round(100 × mean(level weight)); new=0, weak=.15, learning=.45, familiar=.75, mastered=1; range 0–100; topics may overlap';
export function localDate(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value)throw Error('invalid StudyHub date');
  return value;
}
export function envelope(kind,externalId,courseId,now,subjectMap={},courseName) {
  return {kind,externalId,...(courseId===null?{}:{sourceSubjectRef:courseId,...(courseName===undefined?{}:{sourceSubjectName:courseName})}),subjectRef:Object.hasOwn(subjectMap,courseId)?subjectMap[courseId]:null,observedAt:now};
}
export async function readActions({library,now,subjectMap={}}) {
  const {timeZone}=await library.call('library.context',{});
  if(typeof timeZone!=='string')throw Error('missing StudyHub timeZone');
  new Intl.DateTimeFormat('en',{timeZone});
  const {courses}=await library.call('course.list',{});
  if(!Array.isArray(courses))throw Error('invalid StudyHub courses');
  const records=[],details=[];
  for(const entry of courses) {
    if(typeof entry.id!=='string'||!entry.id||typeof entry.name!=='string'||!entry.name)throw Error('invalid StudyHub course identity');
    const course=await library.call('course.get',{id:entry.id});
    if(course?.id!==entry.id||course.name!==entry.name)throw Error('StudyHub course changed during read');
    details.push(course);
    if(course.exam?.date)records.push({...envelope('deadline',`exam:${course.id}`,course.id,now,subjectMap,course.name),data:{title:`${course.name}考试`,type:'exam',due:{date:localDate(course.exam.date),timeZone}}});
    const progress=await library.call('course.focusProgress',{course:course.name});
    if(progress?.course!==course.name||!Array.isArray(progress.topics))throw Error('invalid StudyHub course focus response');
    for(const topic of progress.topics) {
      if(typeof topic.topic!=='string'||!Number.isSafeInteger(topic.cards)||topic.cards<0||!Number.isFinite(topic.mastery)||topic.mastery<0||topic.mastery>100)throw Error('invalid StudyHub topic mastery');
      records.push({...envelope('mastery-snapshot',JSON.stringify(['focus',course.id,topic.topic]),course.id,now,subjectMap,course.name),data:{asOf:now,topicRef:topic.topic,value:topic.cards?topic.mastery:null,scale:'weighted-level',numerator:null,denominator:null,method:WEIGHTED_METHOD}});
    }
    // No configured focus topics is unknown, not a course score of zero.
    if(!progress.topics.length)records.push({...envelope('mastery-snapshot',JSON.stringify(['focus',course.id,null]),course.id,now,subjectMap,course.name),data:{asOf:now,topicRef:null,value:null,scale:'weighted-level',numerator:null,denominator:null,method:WEIGHTED_METHOD}});
  }
  return {records,courses:details,timeZone};
}
