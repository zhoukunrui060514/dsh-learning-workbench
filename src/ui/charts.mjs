export function chartSeries(points) {
  const days = new Map();
  for (const {date,value} of points) {
    if (!Number.isFinite(value)) throw Error('chart value must be finite');
    days.set(date,(days.get(date) || 0)+value);
  }
  return [...days].sort(([a],[b])=>a.localeCompare(b)).map(([date,value])=>({date,value}));
}
export function calendarCells(month, points) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw Error('expected YYYY-MM');
  const [y,m] = month.split('-').map(Number), count = new Date(Date.UTC(y,m,0)).getUTCDate();
  const values = new Map(chartSeries(points).map(p=>[p.date,p.value]));
  return Array.from({length:count},(_,i)=>{const date=`${month}-${String(i+1).padStart(2,'0')}`;return {date,value:values.has(date)?values.get(date):null};});
}
export function proportions(items) {
  if (items.some(x=>!Number.isFinite(x.value)||x.value<0)) throw Error('proportion values must be non-negative');
  const total=items.reduce((n,x)=>n+x.value,0);
  return items.map(item=>({...item,share:total ? item.value/total : 0}));
}
/** Inject host React; no bundled second React or chart package. */
export function createCharts(React) {
  const h=React.createElement;
  const empty=()=>h('p',null,'暂无数据');
  const table=rows=>h('details',null,h('summary',null,'查看每天的数量'),h('table',null,h('tbody',null,...rows.map(([label,value])=>h('tr',{key:label},h('th',{scope:'row'},label),h('td',null,value))))));
  const fill='var(--lw-chart, #729eaf)',line='var(--lw-line, #888)';
  // Bars are HTML so labels keep their 12px size at any width: dates thin out to at most eight, and values hide
  // in narrow charts (the table below keeps every number).
  function DayBars({points,title='每日数量'}) {
    const rows=chartSeries(points);if(!rows.length)return empty();
    const min=Math.min(0,...rows.map(p=>p.value)),max=Math.max(0,...rows.map(p=>p.value)),span=max-min||1;
    const top=value=>(max-Math.max(value,0))/span*100,step=Math.ceil(rows.length/8),values=rows.length<=16;
    return h('figure',{className:'lw-bars'},h('figcaption',null,title),
      h('div',{role:'img','aria-label':title,style:{display:'grid',gridTemplateColumns:`repeat(${rows.length},minmax(0,1fr))`,gap:2,height:140,paddingTop:20,borderBottom:min<0?undefined:`1px solid ${line}`}},
        ...rows.map(p=>h('div',{key:p.date,title:`${p.date}: ${p.value}`,style:{position:'relative'}},
          min<0&&h('span',{style:{position:'absolute',left:0,right:0,top:`${top(0)}%`,borderTop:`1px solid ${line}`}}),
          h('span',{style:{position:'absolute',left:'15%',right:'15%',top:`${top(p.value)}%`,height:`${Math.abs(p.value)/span*100}%`,background:fill}}),
          values&&h('span',{className:'lw-bar-value',style:{position:'absolute',left:'-50%',right:'-50%',bottom:`${100-top(p.value)}%`,textAlign:'center',fontSize:12,lineHeight:'18px'}},p.value)))),
      h('div',{'aria-hidden':'true',style:{display:'grid',gridTemplateColumns:`repeat(${rows.length},minmax(0,1fr))`,gap:2,fontSize:12,lineHeight:'18px',marginTop:4}},
        ...rows.map((p,i)=>h('span',{key:p.date,style:{textAlign:'center',whiteSpace:'nowrap',color:'var(--lw-muted, GrayText)'}},i%step===0?p.date.slice(-2):''))),
      table(rows.map(p=>[p.date,p.value])));
  }
  // `today` splits days with no record ("—") from days still to come (left blank), so the two differ in text, not colour.
  function HeatCalendar({month,points,today,title='每日活动'}) {
    const cells=calendarCells(month,points),max=Math.max(1,...cells.map(c=>c.value??0));
    const offset=(new Date(`${month}-01T00:00:00Z`).getUTCDay()+6)%7;
    return h('figure',null,h('figcaption',null,`${title} · ${month}`),h('div',{style:{display:'grid',gridTemplateColumns:'repeat(7, minmax(30px, 1fr))',gap:4}},
      ...['一','二','三','四','五','六','日'].map(d=>h('span',{key:d},d)),
      ...cells.map((c,i)=>{const future=today!==undefined&&c.date>today;
        return h('div',{key:c.date,title:`${c.date}: ${future?'未到':c.value??'无记录'}`,style:{gridColumn:i===0?offset+1:undefined,padding:6,border:`1px ${future?'dashed':'solid'} ${line}`,borderRadius:6,minWidth:0,background:c.value===null?'transparent':`rgba(70,130,145,${.12+.55*Math.max(0,c.value)/max})`}},
          c.date.slice(-2),h('small',{style:{display:'block',color:'var(--lw-ink, CanvasText)',minHeight:'1.5em'}},future?'':c.value??'—'));})));
  }
  function Proportion({items,title='占比'}) {
    const rows=proportions(items);if(!rows.length)return empty();
    return h('figure',null,h('figcaption',null,title),...rows.map(r=>h('div',{key:r.label},h('span',null,`${r.label}：${r.value} (${(r.share*100).toFixed(1)}%)`),h('div',{style:{height:10,width:`${r.share*100}%`,background:fill}}))));
  }
  return {DayBars,HeatCalendar,Proportion};
}
