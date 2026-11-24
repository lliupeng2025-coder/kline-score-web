const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const source=html.slice(html.indexOf('async function loadDailyBreaks('),html.indexOf('// 启动保护'));

function setup(rows){
 const elements={};
 for(const id of ['dailyBreakList','dailyBreakCnt','dailyBreakNote'])elements[id]={textContent:'',innerHTML:''};
 const sandbox={
  document:{getElementById:id=>elements[id]},
  dbSelect:async()=>rows,
  previewMonday:()=> '2026-11-23',
  previewShanghaiTime:()=>({day:'2026-11-24',clock:'16:00:00'}),
  allSymbols:[{code:'srJQ00.ZF',short_name:'SR',cn_name:'白糖'}],
  normDirection:value=>['up','down'].includes(value)?value:'none',
  escapeHtml:value=>String(value??''),
  monthBreakSummary:()=> '2026-11-24 周K破坏：2025-12-31 向上2分力量线（最低 5039 ≤ 破坏位 5083）',
 };
 vm.createContext(sandbox);vm.runInContext(source,sandbox);
 return {sandbox,elements};
}
const event={symbol:'srJQ00.ZF',timeframe:'week',date:'2026-11-24',direction:'down',total_power_score:-2,
 broken_lines:[{time:'2025-12-31',direction:'up',score:2,break_level:5083,broken_time:'2026-11-24',breaker_low:5039}]};
const asset={schema:'formal-daily-breaks/v1',week_start:'2026-11-23',week_end:'2026-11-27',as_of:'2026-11-24',cleared:false,
 entries:[event,{...event,date:'2026-11-20'}],coverage:{skipped:[{symbol:'x'}]}};

test('daily panel renders only this week events with timeframe and break evidence',async()=>{
 const {sandbox,elements}=setup([{content:JSON.stringify(asset)}]);
 await sandbox.loadDailyBreaks();
 assert.match(elements.dailyBreakCnt.textContent,/共 1/);assert.match(elements.dailyBreakCnt.textContent,/截至 2026-11-24/);
 assert.match(elements.dailyBreakCnt.textContent,/1 品种缺源未判定/);
 assert.match(elements.dailyBreakList.innerHTML,/SR · 白糖/);assert.match(elements.dailyBreakList.innerHTML,/2026-11-24 · 周力量/);
 assert.match(elements.dailyBreakList.innerHTML,/2025-12-31 向上2分力量线/);
 assert.equal((elements.dailyBreakList.innerHTML.match(/month-rev-row/g)||[]).length,1);
});
test('last-trading-day clear hides all entries and explains next-week restart',async()=>{
 const {sandbox,elements}=setup([{content:JSON.stringify({...asset,cleared:true,entries:[],clear_reason:'weekly_monthly_refresh_completed'})}]);
 await sandbox.loadDailyBreaks();
 assert.match(elements.dailyBreakCnt.textContent,/已清零/);
 assert.doesNotMatch(elements.dailyBreakList.innerHTML,/白糖/);
 assert.match(elements.dailyBreakNote.textContent,/下周首个交易日15:30/);
});
test('stale previous-week asset is hidden before first daily update',async()=>{
 const {sandbox,elements}=setup([{content:JSON.stringify({...asset,week_start:'2026-11-16',week_end:'2026-11-20'})}]);
 await sandbox.loadDailyBreaks();
 assert.match(elements.dailyBreakCnt.textContent,/等待本周首个交易日15:30更新/);
 assert.doesNotMatch(elements.dailyBreakList.innerHTML,/白糖/);
 assert.match(elements.dailyBreakList.innerHTML,/上周内容已停止展示/);
});
test('missing asset and incompatible schema fail safely',async()=>{
 const empty=setup([]);await empty.sandbox.loadDailyBreaks();
 assert.match(empty.elements.dailyBreakCnt.textContent,/共 0/);
 const bad=setup([{content:JSON.stringify({schema:'old'})}]);await bad.sandbox.loadDailyBreaks();
 assert.match(bad.elements.dailyBreakCnt.textContent,/加载失败/);
 assert.match(bad.elements.dailyBreakList.innerHTML,/版本不兼容/);
});
test('daily panel is placed below the original three alert columns',()=>{
 assert.ok(html.indexOf('id="dailyBreakPanel"')>html.indexOf('id="monPendingBlock"'));
 assert.ok(html.includes('loadSymbols().then(() => { loadAlerts(); loadDailyBreaks(); })'));
 assert.match(html,/margin-top:24px/);
});
