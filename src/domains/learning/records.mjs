/** Shared learning wire contract. Detailed semantics: docs/contracts.md §7. */
export const recordKinds=['review-event','due-item','mastery-snapshot','deadline','calendar-event'];
/**
 * @typedef {{date:string,timeZone:string}} LocalDate YYYY-MM-DD + IANA zone
 * @typedef {{at:string,timeZone:string}} Instant Offset-bearing RFC3339 + IANA zone
 * @typedef {LocalDate|Instant} When Exactly one of date/at
 * @typedef {{kind:string,externalId:string,observedAt:string,subjectRef:string|null,sourceSubjectRef?:string,sourceSubjectName?:string,data:object}} LearningRecord
 * @typedef {{occurredAt:string,localDate:string,timeZone:string,itemRef:string|null,correct:boolean|null,durationSeconds:number|null}} ReviewEventData
 * @typedef {{due:When,count:number,unit:'card'|'question',itemRef:string|null}} DueItemData
 * @typedef {{asOf:string,topicRef:string|null,value:number|null,scale:'ratio'|'weighted-level',numerator:number|null,denominator:number|null,method:string}} MasterySnapshotData
 * @typedef {{title:string,type:'exam'|'assignment',due:When}} DeadlineData
 * @typedef {{title:string,start:When,end:When,busy:boolean|null}} CalendarEventData
 */
