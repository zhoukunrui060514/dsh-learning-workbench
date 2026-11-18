// Fictional read-only service for package upgrade acceptance, never shipped.
export const name='workbench-upgrade-fixture';
const courses=[{id:'biology',name:'示例生理学',active:true,exam:{date:'2026-11-25'}},{id:'chemistry',name:'示例药理学',active:true,exam:{date:'2026-11-28'}},{id:'unmapped',name:'待映射课程',active:true,exam:{date:'2026-12-02'}}];
export function apply(ctx){ctx.provide('studyRuntime',{forLibrary(){return {async call(action,args){
 if(action==='library.context')return {timeZone:'Asia/Shanghai'};
 if(action==='course.list')return {courses};
 if(action==='course.get')return courses.find(c=>c.id===args.id);
 if(action==='course.focusProgress')return {course:args.course,topics:[{topic:'基础章节',cards:1,mastery:45}]};
 throw Error('unexpected action in read-only fixture');
}};}});}
