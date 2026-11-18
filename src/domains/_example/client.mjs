export default function({React,charts,registerView}) {
  const h=React.createElement;
  return registerView({id:'example-overview',domain:'example',title:'示例概览',metric:'example-summary',Component:({value})=>
    h('div',null,h('h2',null,`示例总量：${value.total}`),h('p',null,'虚构数据，经来源同步、记录库存储、指标计算后显示。'),
      h(charts.DayBars,{points:value.points}),h(charts.HeatCalendar,{month:'2026-11',points:value.points}),
      h(charts.Proportion,{items:value.points.map(p=>({label:p.date,value:p.value}))}))});
}
