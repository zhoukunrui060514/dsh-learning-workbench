export const id='example';
export const client=true;
export const domains=[{id:'example',title:'示例领域',recordKinds:['activity']}];
export function setup({workbench,ports}) {
  const removeSource=workbench.registerSource({id:'example-daily',domain:'example',kind:'fixture',title:'虚构活动数据',capabilities:()=>['activity'],
    check:async()=>({ok:true}),read:async()=>({records:[2,3].map((value,i)=>({kind:'activity',externalId:`day-${i}`,observedAt:ports.clock.now(),data:{date:`2026-11-${12+i}`,value}})),fetchedAt:ports.clock.now()})});
  const removeMetric=workbench.registerMetric({id:'example-summary',domain:'example',title:'示例汇总',compute:({records})=>{const activities=records.filter(r=>r.kind==='activity');return {total:activities.reduce((n,r)=>n+r.data.value,0),points:activities.map(r=>r.data)};}});
  return ()=>{removeMetric();removeSource();};
}
