import test from 'node:test';import assert from 'node:assert/strict';
import { chartSeries, calendarCells, proportions } from '../../src/ui/charts.mjs';
test('day series sorts dates, aggregates daily values and supports zero',()=>{assert.deepEqual(chartSeries([{date:'2026-11-02',value:0},{date:'2026-11-01',value:2},{date:'2026-11-01',value:3}]),[{date:'2026-11-01',value:5},{date:'2026-11-02',value:0}]);});
test('calendar fills actual month days with gaps distinct from zero',()=>{const cells=calendarCells('2024-02',[{date:'2024-02-01',value:0}]);assert.equal(cells.length,29);assert.equal(cells[0].value,0);assert.equal(cells[1].value,null);});
test('proportions do not divide by zero and reject misleading negative input',()=>{assert.equal(proportions([{label:'a',value:0}])[0].share,0);assert.equal(proportions([{label:'a',value:1},{label:'b',value:3}])[0].share,.25);assert.throws(()=>proportions([{label:'a',value:-1}]),/non-negative/);});
import { createCharts } from '../../src/ui/charts.mjs';
import { React, render, text, findAll } from '../support/react-lite.mjs';
const charts=createCharts(React);
test('day bars keep every label at 12px and thin dates out instead of shrinking them',()=>{
 const points=Array.from({length:14},(_,i)=>({date:`2026-11-${String(15+i).padStart(2,'0')}`,value:i}));
 const tree=render(React.createElement(charts.DayBars,{points})).tree;
 assert.equal(findAll(tree,n=>n.type==='svg'||n.type==='text').length,0);
 const sized=findAll(tree,n=>n.props.style?.fontSize!==undefined);assert.ok(sized.length);assert.ok(sized.every(n=>n.props.style.fontSize>=12));
 const dates=findAll(tree,n=>n.type==='span'&&/^\d\d$/.test(text(n))&&n.props.className!=='lw-bar-value').map(text);
 assert.deepEqual(dates,['15','17','19','21','23','25','27']);
});
test('heat calendar leaves future days blank so they differ from days without a record',()=>{
 const tree=render(React.createElement(charts.HeatCalendar,{month:'2026-11',today:'2026-11-15',points:[{date:'2026-11-13',value:1}]})).tree;
 const cell=day=>findAll(tree,n=>n.type==='div'&&n.props.title?.startsWith(`2026-11-${day}:`))[0];
 assert.equal(text(cell('13').children[1]),'1');assert.equal(text(cell('14').children[1]),'—');assert.equal(text(cell('16').children[1]),'');
 assert.equal(cell('16').props.title,'2026-11-16: 未到');assert.match(cell('16').props.style.border,/dashed/);
});
