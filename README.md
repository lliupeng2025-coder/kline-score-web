# K线计分 · 文华加权周线

任何人打开即可查看各品种加权周线的力量/趋势计分结果：

- 有效力量K线：向上=红色↑（K线下方），向下=绿色↓（K线上方）
- 有效趋势线 O1/O2/O3 金色圆点标记 + 破坏位
- BOLL(26,26,2) 与 VOL + MV(3,3) 副图，文华配色
- 点击任意周K查看该周收盘计分截面

## 架构

- 数据：Supabase Postgres（`symbols` / `weekly_bars`，匿名只读 RLS）
- 计算：本机 `right_to_left_power` 引擎逐周计分后 upsert
- 图表库：lightweight-charts v4.2.0，经 Supabase Edge Function 托管

本地源码在 D:\ywl\web（含 lightweight-charts.js 本地副本）。
