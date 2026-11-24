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

function sugarFixture(){
 const months = JSON.parse(fs.readFileSync(path.join(__dirname,'../outputs/web_snapshot_monthly/bars_SRJQ00.ZF.json'),'utf8')).bars;
 const weekly = JSON.parse(fs.readFileSync(path.join(__dirname,'../outputs/web_snapshot/bars_srJQ00.ZF.json'),'utf8')).bars;
 const baseMonth = months[months.length-1], byDate = new Map(months.map(x=>[x.month_date,x]));
 const needed = new Set(baseMonth.active_power_lines.map(x=>x.time));
 const closedMonths = months.filter(x=>needed.has(x.month_date)||x===baseMonth)
   .map(x=>({...x,week_date:x.month_date}));
 const november = weekly.filter(x=>x.week_date>='2026-11-01'&&x.week_date<='2026-11-20');
 const ctx = {schema:'formal-month-preview/v1',month:'2026-11',holidays:[],boundary_slices:{}};
 const preview = api.makeIncompleteMonth(closedMonths,november,'srJQ00.ZF',ctx,'2026-11-24T09:00:00Z');
 return {months,weekly,baseMonth,closedMonths,november,ctx,preview,byDate};
}

test('the two user examples use only completed weeks and sum OHLCV',()=>{
 const a=api.makeIncompleteMonth(base,weeks,'TEST',context,'2026-10-15T07:00:00Z');
 assert.deepEqual([a.preview_start,a.week_date,a.o,a.h,a.l,a.c,a.vol,a.preview_week_count],['2026-10-08','2026-10-09',110,125,99,115,10,1]);
 const b=api.makeIncompleteMonth(base,weeks,'TEST',context,'2026-10-24T04:00:00Z');
 assert.deepEqual([b.week_date,b.o,b.h,b.l,b.c,b.vol],['2026-10-23',110,130,90,95,60]);
 assert.equal(api.previewLatestClosedWeek('2026-10-23T07:29:59Z',new Set(context.holidays)),'2026-10-16');
 assert.equal(api.previewLatestClosedWeek('2026-10-23T07:30:00Z',new Set(context.holidays)),'2026-10-23');
});
test('preview breaks existing powers at equality and updates weekly month reversal',()=>{
 const before=JSON.stringify(base), w=clone(weeks); w[2].l=80;
 const p=api.makeIncompleteMonth(base,w,'TEST',context,'2026-10-24T04:00:00Z');
 assert.equal(p.active_power_lines.length,0);assert.equal(p.preview_broken_lines.length,3);
 assert.equal(p.total_power_score,0);assert.equal(p.power_direction,'none');assert.equal(p.bar_power_score,null);assert.equal(p.power_reversal,true);
 assert.equal(p.preview_reversal_time,'2026-10-23');
 assert.equal(JSON.stringify(p.active_trend_lines),JSON.stringify(base[2].active_trend_lines));assert.equal(JSON.stringify(base),before);
});
test('each broken power records its first breaking weekly bar, not a later extreme',()=>{
 const w=clone(weeks); w[1].h=130; w[2].h=999; w[2].l=80;
 const p=api.makeIncompleteMonth(base,w,'TEST',context,'2026-10-24T04:00:00Z');
 const down=p.preview_broken_lines.find(x=>x.time==='2026-08-31');
 const up=p.preview_broken_lines.find(x=>x.time==='2026-07-31');
 assert.equal(down.broken_time,'2026-10-16');assert.equal(down.breaker_high,130);assert.equal(down.break_level,130);
 assert.equal(up.broken_time,'2026-10-23');assert.equal(up.breaker_low,80);assert.equal(up.break_level,80);
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
test('sugar 2026-11-20 reverses down and names both broken monthly power lines',()=>{
 const {preview}=sugarFixture();
 assert.equal(preview.power_direction,'down');assert.equal(preview.total_power_score,-2);
 assert.equal(preview.power_reversal,true);assert.equal(preview.preview_reversal_time,'2026-11-20');
 assert.equal(preview.active_power_lines.length,2);assert.equal(preview.preview_broken_lines.length,2);
 const actual=JSON.parse(JSON.stringify(preview.preview_broken_lines.map(x=>[x.time,x.direction,x.score,x.break_level,x.broken_time,x.breaker_low])));
 assert.deepEqual(actual,[['2025-12-31','up',2,5083,'2026-11-20',5039],['2026-08-31','up',1,5108,'2026-11-20',5039]]);
});
test('market loader returns the sugar reversal and break evidence',async()=>{
 const {baseMonth,closedMonths,november,ctx}=sugarFixture();
 const helper=html.slice(html.indexOf('async function loadWeeklyMonthReversals('),html.indexOf('async function loadAlerts('));
 const sandbox={toFinitePrice,getMonthPreviewContext:async()=>ctx,dbSelectAll:async table=>{
   if(table==='weekly_bars')return november.map(x=>({...x,symbol:'srJQ00.ZF'}));
   const needed=new Set(baseMonth.active_power_lines.map(x=>x.time));
   return closedMonths.filter(x=>needed.has(x.month_date)).map(({week_date,...x})=>({...x,symbol:'srJQ00.ZF'}));
 }};
 vm.createContext(sandbox);vm.runInContext(logic+'\n'+helper,sandbox);
 const baseWithSymbol={...baseMonth,symbol:'srJQ00.ZF'};
 const result=await sandbox.loadWeeklyMonthReversals({'srJQ00.ZF':[baseWithSymbol]},['srJQ00.ZF'],'2026-11-24T09:00:00Z','2026-11-20');
 assert.equal(result.cutoff,'2026-11-20');assert.equal(result.rows.length,1,JSON.stringify(result));
 assert.equal(result.rows[0].symbol,'srJQ00.ZF');
 assert.equal(result.rows[0].power_direction,'down');assert.equal(result.rows[0].preview_broken_lines.length,2);
 const duringUpdate=await sandbox.loadWeeklyMonthReversals({'srJQ00.ZF':[baseWithSymbol]},['srJQ00.ZF'],'2026-11-27T08:00:00Z','2026-11-20');
 assert.equal(duringUpdate.cutoff,'2026-11-20');assert.equal(duringUpdate.rows.length,1,JSON.stringify(duringUpdate));
 assert.equal(duringUpdate.skipped,0);
});
test('break summary names the source power, breaker week and threshold',()=>{
 const {preview}=sugarFixture();
 const source=html.slice(html.indexOf('function monthBreakSummary('),html.indexOf('function renderSnapshot('));
 const sandbox={DIR_TEXT:{up:'向上',down:'向下',none:'无'},fmt:(v,d=2)=>Number(v).toFixed(d),preview};
 vm.runInNewContext(source+'\nthis.summary=monthBreakSummary(preview)',sandbox);
 const text=sandbox.summary;
 assert.match(text,/2026-11-20 周K破坏/);assert.match(text,/2025-12-31 向上2分力量线/);
 assert.match(text,/2026-08-31 向上1分力量线/);assert.match(text,/最低 5039 ≤ 破坏位 5083/);assert.match(text,/最低 5039 ≤ 破坏位 5108/);
});
test('future weekly perturbation cannot alter historical preview, real fixtures preserve original months',{skip:!process.env.MONTH_PREVIEW_FIXTURES},()=>{
 const fixtures=process.env.MONTH_PREVIEW_FIXTURES;
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
