const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const logic = html.match(/\/\/ BEGIN MONTH_PREVIEW[\s\S]*?\/\/ END MONTH_PREVIEW/)[0];
const toFinitePrice = value => value === null || value === undefined || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
const api = vm.runInNewContext(logic+'\n({makeIncompleteMonth,previewLatestClosedWeek,previewShanghaiTime})', {toFinitePrice});
const context = {schema:'formal-month-preview/v1',month:'2026-10',holidays:['2026-10-01','2026-10-02','2026-10-05','2026-10-06','2026-10-07'],boundary_slices:{}};
const clone = x => JSON.parse(JSON.stringify(x));
const base = [{week_date:'2026-07-31',o:90,h:120,l:80,c:100,vol:1},
 {week_date:'2026-08-31',o:95,h:130,l:85,c:100,vol:1},
 {week_date:'2026-09-30',o:100,h:140,l:90,c:110,vol:1,calc_start:'2026-07-31',power_direction:'up',total_power_score:2,
 active_power_lines:[{time:'2026-07-31',direction:'up',score:2},{time:'2026-08-31',direction:'down',score:1},{time:'2026-09-30',direction:'up',score:1}],active_trend_lines:[{time:'2026-08-31',direction:'up',phase:'O1',break_level:85}]}];
const weeks = [{week_date:'2026-10-09',o:110,h:125,l:99,c:115,vol:10},
 {week_date:'2026-10-16',o:115,h:129,l:95,c:100,vol:20},
 {week_date:'2026-10-23',o:100,h:130,l:90,c:95,vol:30}];
test('the two user examples use only completed weeks and sum OHLCV',()=>{
 const a=api.makeIncompleteMonth(base,weeks,'TEST',context,'2026-10-15T07:00:00Z');
 assert.deepEqual([a.preview_start,a.week_date,a.o,a.h,a.l,a.c,a.vol,a.preview_week_count],['2026-10-08','2026-10-09',110,125,99,115,10,1]);
 const b=api.makeIncompleteMonth(base,weeks,'TEST',context,'2026-10-24T04:00:00Z');
 assert.deepEqual([b.week_date,b.o,b.h,b.l,b.c,b.vol],['2026-10-23',110,130,90,95,60]);
 assert.equal(api.previewLatestClosedWeek('2026-10-23T07:29:59Z',new Set(context.holidays)),'2026-10-16');
 assert.equal(api.previewLatestClosedWeek('2026-10-23T07:30:00Z',new Set(context.holidays)),'2026-10-23');
});
test('preview only breaks existing powers at equality; no new score/reversal/trend',()=>{
 const before=JSON.stringify(base), w=clone(weeks); w[2].l=80;
 const p=api.makeIncompleteMonth(base,w,'TEST',context,'2026-10-24T04:00:00Z');
 assert.equal(p.active_power_lines.length,0);assert.equal(p.preview_broken_lines.length,3);
 assert.equal(p.total_power_score,0);assert.equal(p.power_direction,'none');assert.equal(p.bar_power_score,null);assert.equal(p.power_reversal,false);
 assert.equal(JSON.stringify(p.active_trend_lines),JSON.stringify(base[2].active_trend_lines));assert.equal(JSON.stringify(base),before);
});
test('zero signed remaining sum uses latest surviving direction',()=>{
 const b=clone(base);b[2].active_power_lines=[{time:'2026-07-31',direction:'up',score:1},{time:'2026-08-31',direction:'down',score:1}];
 const p=api.makeIncompleteMonth(b,weeks.slice(0,1),'TEST',context,'2026-10-15T07:00:00Z');
 assert.equal(p.total_power_score,0);assert.equal(p.power_direction,'down');
});
test('missing weeks, duplicate weeks, invalid price and stale context fail visibly',()=>{
 const now='2026-10-24T04:00:00Z';
 assert.throws(()=>api.makeIncompleteMonth(base,weeks.slice(1),'T',context,now),/周线缺失/);
 assert.throws(()=>api.makeIncompleteMonth(base,[...weeks,weeks[0]],'T',context,now),/日期重复/);
 assert.throws(()=>api.makeIncompleteMonth(base,[{...weeks[0],vol:null},...weeks.slice(1)],'T',context,now),/OHLC/);
 assert.throws(()=>api.makeIncompleteMonth(base,weeks,'T',{...context,month:'2026-09'},now),/辅助数据/);
});
test('unfinished week/month-end and no finished week do not create fake candles',()=>{
 assert.equal(api.makeIncompleteMonth(base,[],'T',context,'2026-10-08T08:00:00Z'),null);
 assert.equal(api.makeIncompleteMonth(base,weeks,'T',context,'2026-10-30T07:30:00Z'),null);
 assert.equal(api.previewLatestClosedWeek('2026-10-01T04:00:00Z',new Set(['2026-10-01','2026-10-02'])),'2026-09-30');
});
test('boundary week uses exact daily slice, rejects unavailable or future/mismatched slice',()=>{
 const b=clone(base);b[b.length-1].week_date='2026-11-30';b[b.length-1].active_power_lines=[];
 const w=[{week_date:'2026-12-04',o:999,h:1200,l:50,c:101,vol:500}];
 const ctx={schema:'formal-month-preview/v1',month:'2026-12',holidays:[],boundary_slices:{}};
 assert.throws(()=>api.makeIncompleteMonth(b,w,'T',ctx,'2026-12-05T04:00:00Z'),/跨月周/);
 ctx.boundary_slices.T={start:'2026-12-01',end:'2026-12-04',dates:['2026-12-01','2026-12-02','2026-12-03','2026-12-04'],price_source:'wenhua_day_exact',o:100,h:110,l:90,c:101,vol:40};
 const p=api.makeIncompleteMonth(b,w,'T',ctx,'2026-12-05T04:00:00Z');assert.deepEqual([p.o,p.h,p.l,p.c,p.vol],[100,110,90,101,40]);
 ctx.boundary_slices.T.end='2026-12-11';assert.throws(()=>api.makeIncompleteMonth(b,w,'T',ctx,'2026-12-05T04:00:00Z'),/跨月周/);
});
test('future weekly perturbation cannot alter historical preview, real fixtures preserve original months',()=>{
 const fixtures=process.env.MONTH_PREVIEW_FIXTURES;
 if(!fixtures)throw Error('set MONTH_PREVIEW_FIXTURES to captured read-only API fixtures');
 for(const code of ['rbJQ00.SF','auJQ00.SF']){
  const months=JSON.parse(fs.readFileSync(path.join(fixtures,code+'_monthly.json'))).map(x=>({...x,week_date:x.month_date}));
  const weekly=JSON.parse(fs.readFileSync(path.join(fixtures,code+'_weekly.json'))),before=JSON.stringify(months);
  const first=api.makeIncompleteMonth(months,weekly,code,context,'2026-10-15T07:00:00Z');
  const changed=weekly.map(x=>x.week_date>'2026-10-09'?{...x,h:99999,l:0,c:1,vol:999999}:x);
  assert.equal(JSON.stringify(api.makeIncompleteMonth(months,changed,code,context,'2026-10-15T07:00:00Z')),JSON.stringify(first));
  assert.equal(JSON.stringify(months),before);
  const latest=api.makeIncompleteMonth(months,weekly,code,context,'2026-10-25T04:00:00Z');assert.equal(latest.week_date,'2026-10-23');
 }
});
test('Fibonacci keeps price lines at actual prices and moves labels above chart',()=>{
 const source=html.slice(html.indexOf('function drawFib('),html.indexOf('function drawArrow('));
 const lines=[], ctx={setLineDash(){},beginPath(){},moveTo(...a){lines.push(a)},lineTo(){},stroke(){},fillText(){throw Error('price label must be outside candle canvas')}};
 const env={fibState:{t0:'2026-01-01',f382:61.8,f500:50,f618:38.2},chart:{timeScale:()=>({timeToCoordinate:()=>30})},fmt:(v)=>v.toFixed(2)};
 vm.runInNewContext(source+'\ndrawFib(ctx,{width:800,height:300},x=>x)',{...env,ctx});
 assert.deepEqual(lines,[[30,61.8],[30,50],[30,38.2]]);
 const legend={hidden:true,children:[],replaceChildren(){this.children=[]},append(x){this.children.push(x)}};
 const document={getElementById:()=>legend,createElement:()=>({style:{}})};
 const render=html.slice(html.indexOf('function renderFibLegend('),html.indexOf('function drawFib('));
 const sandbox={...env,document};vm.createContext(sandbox);
 vm.runInContext(render+'\nrenderFibLegend()',sandbox);
 assert.equal(legend.hidden,false);
 assert.deepEqual(legend.children.slice(1).map(x=>x.textContent),['38.2%  61.80','50%  50.00','61.8%  38.20']);
 sandbox.fibState=null;vm.runInContext('renderFibLegend()',sandbox);
 assert.equal(legend.hidden,true);assert.equal(legend.children.length,0);
 assert.ok(html.indexOf('id="fibLegend"')<html.indexOf('id="chart"'));
});
