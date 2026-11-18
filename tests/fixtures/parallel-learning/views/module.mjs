export const id='learning-views';
export function setup({workbench}) {
 return workbench.registerMetric({id:'exams',domain:'learning',compute:({records})=>records.filter(r=>r.kind==='deadline').map(r=>[r.subjectRef,r.data.due.date,r.data.due.timeZone])});
}
