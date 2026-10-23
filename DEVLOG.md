# DEVLOG · 开发记录

## 2026-10-24 凌晨 → 清晨：从 demo 到垂直切片

### 起点
前一晚建仓：纯代码 synthwave 霓虹隧道节奏跑酷（f4450b0 建仓、d3925b9 擦身奖励）。608 行单文件 `game.js`，核心循环完整但流程与内容单薄。

### 冲刺（本次会话，06:25–08:40）

**架构**（59bfa06）
- 608 行拆为 9 个 ES 模块：core / state / scene / audio / track / entities / sectors / ui / main，单向依赖；`ui` 只碰 DOM，业务回调由 `main` 注入避免循环
- 顺手修：`A.init` 从未创建 `noiseBuf`（hi-hat / crash 一直引用 undefined）

**内容层**（59bfa06）
- SECTOR 区段系统：每 800m 一道发光区段门 + fov 冲击 + 大字公告；5 区段各有名称/主题色/障碍配方/封锁密度
- 新障碍「扫描闸」：竖杆在车道间 sin 往返，S2 起解锁
- OVERDRIVE：连击 20 触发 8 秒过载（得分翻倍 + 无敌 + BPM+8）

**流程**（59bfa06）
- ESC/P/按钮暂停（AudioContext suspend 无缝）、失焦自动暂停、音量滑条、回标题、结算统计 + 新纪录、标题回廊悬停机位

**测试**（59bfa06 → 54d9935）
- `test/logic.test.mjs` 16 项：区段边界、配方约束（扫描闸单车道/不封死三车道）、分布统计（占比 ±8pp、扫描闸密度递增）

**修复**（f5c9564 / 914006d）
- GPU 泄漏：实体与轨道段回收时 geometry/material dispose（行进中 Tube 回收是最高频泄漏点）
- 万米崩溃：区段门序号无限增长 vs 5 段配置表——`state.sector` 与 `die()` 访问 clamp 到终段
- rAF 异常静默：循环内 try/catch 转发 `document.title`（LOOP ERR 前缀）

**体验**（64a6508 / c3db1ab / 1633e17 / 暂停面板批）
- FOV 随速度拉伸（78°→84°）
- 全屏 CSS 反馈闪（撞击红闪/过门白闪/过载金闪）
- 区段环境粒子（浮尘/上升火花/下落碎屑/电花瞬移）
- 触控重写：下半屏点击变道 + 上滑 28px 跳（对齐了文案与实现）
- 区段换和弦：每区段独立和声走向，琶音随根音平移；拾取音落入区段和声
- 暂停面板操作速查、结算快捷键提示

### 踩坑实录
1. ES 模块拆分漏一个 `export`（obGroup）→ import 链全断、页面静默黑屏——逐模块 `await import()` 探针定位最快
2. `spawnGate` 引用未导入的 `TUBE_RADIUS`：800m 前门逻辑不执行所以一切"正常"，一接近就每帧炸——rAF 循环必须包错误转发
3. python http.server 的启发式缓存让改码后浏览器拿旧模块（reload 也无效）→ `serve.py` 发 no-cache 头
4. 随距离无限增长的序号进配置表索引必须 clamp
5. three.js 对象回收必须 dispose，remove 只摘场景

### 验证账目
- 16/16 逻辑单测；万米压力跑 + 三局连续自然对局（堆内存 28→34→24MB 无泄漏）；手机竖屏 390×844 视口实测；超表长区段（8000m+）全链路
- IAB 内嵌 84 FPS；7 张实机截图 `docs/screenshots/`
