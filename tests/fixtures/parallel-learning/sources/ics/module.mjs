export const id='ics';
export function setup({workbench,ports}) {
 return workbench.registerSource({id,domain:'learning',kind:id,title:id,capabilities:()=>['deadline'],read:async()=>({fetchedAt:ports.clock.now(),records:[{kind:'deadline',externalId:'exam',subjectRef:'anatomy',observedAt:ports.clock.now(),data:{title:'Exam',due:{date:'2026-12-02',timeZone:'Asia/Shanghai'},type:'exam'}}]})});
}
