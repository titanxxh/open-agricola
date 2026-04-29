# Card Audit vs BGA — 2026-04-28（含 2026-04-29 wide-scan + 历史 desc 审计）

> **本文件的角色**：替代原 `card_desc_audit.md`，覆盖三个维度：
> 1. **行为对齐审计**（深度池 140 张 + wide-scan 741 张，主体内容见 §1–§8）
> 2. **架构合规性审计**（§6）
> 3. **desc 文案对齐审计 + BGA-only 卡清单**（§9 历史归档）
>
> `docs/card_progress.md` 仍是卡牌实现进度的唯一权威源——本文件只是审查报告与历史快照。

外部复核 `shared/cards/{A..E}/*.ts` 全量 887 张卡 vs BGA 同号 `.php`，按 spec `docs/superpowers/specs/2026-04-28-card-impl-vs-bga-audit-design.md` 流程执行。本次审查分两阶段：
- **Phase A（2026-04-28）**：架构 + i18n + 空壳扫描，构造深度池 140 张做行为对齐
- **Phase B（2026-04-29）**：对深度池外的非深度池 ~746 张做紧凑续审

## 1. 摘要

- **扫卡总数**：886 张（双方都存在的卡对；oursOnly=0、bgaOnly=2）
- **深度池规模**：140 张（按 §2.5 / §2.6 / R1..R4 / O1 / A 嫌疑合并；详细 verdict 见 §4）
- **Wide-scan 规模**：741 张（深度池外的卡，紧凑流程；详细见 §5）

### 总 verdict 分布（合并两阶段，881 张）

| 维度 | 深度池 (140) | wide-scan (741) | 合计 (881) | 占比 |
|---|---|---|---|---|
| ✅ 完全对齐 | 64 | 475 + 48 ⚪ | **587** | **67%** |
| 🟡 简化实现 | 40 | 90 | **130** | 15% |
| ⚠ 行为偏差 | 18 | 26 | **44** | 5% |
| ❌ 数值/元数据 | 6 | 66 | **57**（PR-1A −10、PR-1B −16） | 6% |
| 🔀 刻意偏离 | 4 | 1 | **5** | 1% |
| 🔍 待 owner | 1 | 13 | **14** | 2% |

> ⚪ = 数据 only（双方都无逻辑；BGA `$this->implemented = false` + 我方文件无 effect/listener 注册），等价于 ✅
>
> 宽口径通过率（✅+🟡+⚪）= 81%；严格 ✅ 通过率 = 67%

### 关键发现（Top 8）

1. **`docs/card_progress.md` §2.3 自报"行为偏差 0 张"被审查推翻**：合计发现 **44 张行为偏差**。深度池 18 张 + wide-scan 26 张。Wide-scan 暴露 5 张玩法**完全错**的 P0 卡：
   - **B116 Shoreforester** — BGA reed bank 准备阶段填充时给 1 wood；TS 每个 round 开始无条件给 1 wood
   - **B14 Hawktower** — BGA round 12 预约一个石屋间（条件性建造）；TS 写成 +1 stone 资源
   - **B133 VillagePeasant** — BGA 给 N 个 vegetable 资源；TS 用 computePostScore 给 N VP
   - **D138 PetLover** — `noop` xor 选项不取消原始 collect，玩家同时拿空间动物 + 1 动物 + 3 food + 1 grain
   - **E134 Omnifarmer** — `computeBonusScore` 读 `storedTypes`，但代码无 listener 写入此字段，分数永远不触发

2. **§2.4 自报"数值/元数据偏差 0 张"也被推翻**：合计 **57 张**（原报 83 张；PR-1A 已修 10 张 players + PR-1B 已修 16 张 cost/vp，见 §1 verdict 表已修订为 57）。
   - **11 张 players 字段错**（深度 7 + wide 4，去重后实为 10 张唯一卡）：A154/A158/A160 + C151/C152/C153/C163 + E154 + C134 + C158——全是 `'3+'` 应 `'4+'` 同模式，破坏 2026-04-25 落地的卡池过滤 — ✅ PR-1A on branch sprint-1-pr-1a（10 张全部已修，剩 0 张 players 残留）
   - **12+ 张 cost 错** — A4 / D83（alternative-cost 机制）、C13（isBuyable discount）残留转 Sprint 5；其余 11 张 cost/vp 字段已 ✅ PR-1B on branch sprint-1-pr-1b：A38 WoolBlankets、C3/C33/C35/C48、D24/D29/D39、E32（stone 误为 clay）、E34（缺 cost）、E95、B4、B42
   - **~50 张 category 字段批量不齐**（B/C/D 三副系统性问题——schema 级而非单卡 bug）
   - **22 张缺 `extraVp` 元数据**（A 牌组，仅展示用）

3. **架构纪律保持良好**（深度池审查结论）：A1 client cardId-keyed 规则裁定 12 处全部合法；A2 `register*` 函数 0 缺失登记 §3；A3 测试 DOM 规则裁定 0 处；A4 跨层 import 0 处；S1 14 张主路径 cardId 命中绝大多数是注释/sentinel 不是 if-else 分支。

4. **§2.5 4 张刻意偏离全部通过复核**：B85 / C22 / D161 / E16 当初 owner 签字的取舍今天仍然成立。

5. **prerequisite 注册系统性缺失**（D 牌组发现）：D7/D8/D39/D53/D58 等 5+ 张 buyable 条件仅写在 `prerequisite` 字符串、未注册到 `prerequisite-registry`。玩家"白买"——支付费用但 onBuy 不触发预期效果。**P0**

6. **sharedScoring 机制不完备**：A135 AnimalReeve / C136 RanchProvost 都声明 `sharedScoring=true` 但 `computeBonusScore` 没写。

7. **getExchangeResources 系统性简化**（D 牌组）：D35/D38/D45/D84 等只看 `player.resources.{animal}` 忽略场上动物（pasture/stable）。

8. **stub / 局部未实现 ≥ 16 张**：A135 / A165 / C62 / C105 / C109 / C136 / D62 / D94 / D108 / D131 / D157 / E58 / E134 / E139 / E149（与 §2.6 自报一致）/ E153 / E155。

### i18n 缺口

- **A4 agent**：437 个 BGA `clienttranslate(...)` 字符串完全无对应翻译（top 200 入 json）
- **脚本 S12**：71 张卡有"卡里出现但 zh/en 缺定义"的 key
- 不阻塞游戏行为，但用户体验偏差大

### 重要边界提醒

- **本次审查不修复任何 ⚠/❌ 发现**——按 spec §2，修复另起 brainstorming
- **未执行人工抽审复核**——verdict 全部来自 9 个 sub-agent（深度 5 + wide-scan 5；其中深度池 1 个跨双阶段未含），建议 owner 抽样 5–10 张做完整重审
- **wide-scan verdict 质量低于深度池**——紧凑流程每张卡 ≤60s，未做完整 5 维度对比；优先抽查 ⚠/❌
- 修复优先级见 §8

## 2. 方法

### 2.1 Phase A — 架构 + i18n + 空壳扫描 + 深度池构造（2026-04-28）

- **`scripts/audit-card-architecture.ts`**：机械信号 S1/S4/S5/S6/S7/S10/S11/S12，输出 jsonl
- **4 个 Explore sub-agent 并行**：语义信号 S2/S3, S8, S9, S12（BGA→ours i18n 缺口）
- **5 个 sub-agent 并行（深度对齐）**：按 deck 切（A=27 / B=29 / C=29 / D=26 / E=29 = 140）

### 2.2 Phase B — Wide-Scan（2026-04-29）

- **5 个 sub-agent 并行**：按 deck 切非深度池（A=152 / B=150 / C=150 / D=152 / E=137 = 741）
- **紧凑输出策略**：✅ 和 ⚪ 仅列 cardId（节省 token），🟡/⚠/❌/🔀/🔍 写 ≤5 行紧凑段
- **每张卡 ≤60s**：不做完整 5 维度对比，仅快速对比触发条件 / hooks / 资源/状态变更 / cost / players / vp / prereq

### 2.3 复现命令

```bash
pnpm tsx scripts/audit-card-architecture.ts > output/tmp/audit-summary.json
# 详见 spec docs/superpowers/specs/2026-04-28-card-impl-vs-bga-audit-design.md §5
# Phase A: 4 个 Explore agent + 5 个深度对齐 agent
# Phase B: 5 个 wide-scan agent，按 deck 切，紧凑输出
```

### 2.4 输入快照（冻结自 `output/tmp/sha-snapshot.txt`）

- 我方 SHA：`2b5ddee651d06fed067e7747b86ce47372d08c8a`
- BGA SHA：`3082e4d3586fd3571916097957c91ff2312f6430`
- BGA 远端 ahead 至：`c780b50013755a76d1833f7bec69aefc399539ec`（本次审查未跟随）
- Phase A 冻结时间：`2026-04-28T18:37:12Z`
- Phase B 沿用同一 SHA

## 3. Phase A 结果

### 3.1 机械信号命中表（S1–S10）

| 信号 | 命中数 | 高优先级命中卡（前 20） |
|---|---|---|
| **S1 主路径 cardId** | 14 | A14, A123, A143, B3, B30, B72, C22, C59, C122, D25, D82, D95, E101, E95 |
| **S4 跨层 import** | 0 | — |
| **S5 聚合字段 mutation** | 0 | — |
| **S6 行数比 >2×** | 9 | A87(3.57×), B137, B138, B155, B68, B75, C150, C88, D25(4.55×) |
| **S6 行数比 1.5–2×** | 46 | （O1 备查池） |
| **S7 卡牌外 cardId**（去除合法注册中心） | 22 | A123, A14, A143, A60, A88, B30, B4, B85, C122, C22, C30, D34, D51, D59, D60, D82, D93, D95, E10, E112, E73, E95 |
| **S10 高度疑似空壳** | 36 | A12, A129, A139, A25, B103, B115, B130, B150, B151, B152, B155, B163, B27, C120, C135, C23, C89, C95, D11, D12, D148, D163, D18, D21, D87, D95, E101, E116, E12, E159, E165, E30, E36, E53, E91, E95 |

**S10 false-positive 说明**：A25 / D95 / E101 等 §2.1 已确认对齐的卡也命中 S10——脚本通过 `registerCardListener` / `effect` / `onBuy` / 等关键字检测 hook 数；这些卡用静态字段 (`modifier`/`scoreRule`/`exchanges`)、`isListeningTo`+`handler` 函数引用别名，或 BGA 端用 `function execute()` 之外的 hook（如 `isAffectingPlayer`、`onActionSpaceUsed`）。**实际验证以 Phase A/B 详细 verdict 为准**——S10 high 36 张里只有 E149 真是 stub。

### 3.2 i18n 缺口

| 维度 | 命中 | 说明 |
|---|---|---|
| **S11 desc 对齐** | 0 diff / 0 missing | 我方源码 `desc:` 字面量经归一化后与 BGA `$this->desc` 100% 对齐（注：未追溯 i18n 间接引用） |
| **S12 卡内 i18n key zh/en 缺失** | 71 张卡 | 卡里出现的 `actions.<id>.*` / `ui.interaction*` / `prompt.*` key 在 `client/i18n/{zh,en}.ts` 至少一语缺定义 |
| **A4 BGA 有但我方完全无翻译** | 437 字符串（top 200 in json）| BGA `clienttranslate(...)` 调用的 prompt/log/系统文案找不到对应 i18n value |

### 3.3 嫌疑名单 → 深度池

合并步骤：

| 来源 | 张数 |
|---|---|
| 必加：§2.5 刻意偏离 | 4（C22, D161, E16, B85）|
| 必加：§2.6 Tier 2 | 1（E149）|
| A 嫌疑名单（脚本 S1∪S6>2∪S10_high∪S7-filtered + A1 cardId）| 68 |
| R1 7 天内新写（30 天太宽 880+ 全命中，已收紧到 7 天）| 9 |
| R2 跨玩家 scope (`opponent`/`any`)| 48 |
| R3 multi-step `resolveChoice` | 5 |
| R4 高优先级（BGA `implemented=false` 但我方做了，非 5+ 卡）| 6（A113/C71/D11/D159/D25/E132；其中 4 张已在 §2.1）|
| R4 低优先级（5+ 卡，48 张）| 降 P2 不进 B 阶段 |
| O1 行数比 1.5–2× | 46 |
| 减去 §2.1 已 verdict ✅ 的 30 张 | -14 张 |
| **去重后总数** | **140** |

按 deck 分布：A=27 / B=29 / C=29 / D=26 / E=29

## 4. Phase A 深度池 verdict（140 张）

### 4.1 深度池构成

| 来源 | 卡列表 |
|---|---|
| §2.5 已登记刻意偏离 | C22, D161, E16, B85 |
| §2.6 Tier 2 | E149 |
| A 嫌疑（脚本 + 4 agent）| 68 张，详见 `output/tmp/a-suspects-full.txt` |
| R1 7 天新写 | B85, C150, C39, D102, D36, D95, E27, E74, E76 |
| R2 跨玩家 scope | 48 张，详见 `output/tmp/r2-cross-scope.txt` |
| R3 multi-step | A3, B3, B42, C104, D23 |
| R4 高优先级 | A113, C71, D11, D159, D25, E132 |
| O1 行数比 1.5–2× | 46 张，详见 `output/tmp/o1-line-ratio.txt` |

### 4.2 verdict 分布

| Agent | Deck | N | ✅ | 🟡 | ⚠ | ❌ | 🔀 | 🔍 |
|---|---|---|---|---|---|---|---|---|
| Phase A 1 | A | 27 | 17 | 2 | 4 | 3 | 0 | 1 |
| Phase A 2 | B | 29 | 12 | 7 | 7 | 2 | 1 | 0 |
| Phase A 3 | C | 29 | 10 | 9 | 2 | 7 | 1 | 0 |
| Phase A 4 | D | 26 | 12 | 10 | 3 | 0 | 1 | 0 |
| Phase A 5 | E | 29 | 13 | 12 | 2 | 1 | 1 | 0 |
| **合计** | | **140** | **64** | **40** | **18** | **13** | **4** | **1** |

### 4.3 ⚠ 行为偏差（18 张）

> 详见各 agent markdown 完整段落：`output/tmp/audit-agent-b{1..5}.md`

| Card | 关键发现 |
|---|---|
| **A129 Swagman** | farm-expansion 用 OR 而 BGA 是 SEQ；未设 once-per-turn flag |
| **A139 Hollow Warden** | 仅匹配 `hollow-4`，3+人模式下其它 hollow 累积格漏触发 |
| **A150 Stagehand** | construct 硬编码 `maxRooms:1`，BGA 不限制 |
| **A151 Minstrel** | sheep-market gain 未清累积；grain-utilization 用 OR 而 BGA 是 SEQ 允许同时 sow+bake |
| **B27 Toolbox** | 每次构建都触发，未实现"turn 末一次性"语义 |
| **B29 CookeryLesson** | "same turn" 被错误扩展成 "same round" |
| **B115 Tinsmith** | 多 field 时只允许选 1 个，BGA 给每 field 各加 1 |
| **B130 / B150 / B152** | `useActionSpace(other)` 语义被 inline 简化，丢"用 farmer 到另一格"的事件 |
| **B138 ForestGuardian** | 用 `gain-trigger-player` 可能没真扣对手食物（须确认） |
| **B155 ArtTeacher** | 抽 TP food 仅在 lessons 入口，遗漏其他 occupation play 路径 |
| **C23** | 触发条件偏差 |
| **C51 FishingNet** | 没真正从 trigger player 扣 food |
| **D18 SteamPlow** | 多了 sow 节点，BGA 仅 plow（`shared/cards/D/D18_SteamPlow.ts:30-37` vs `Cards/Actions/ActionFarmland.php:15-17`）|
| **D117 WoodExpert** | 强制扣 1 食物替换 wood，BGA 是给 alternative trade 让玩家选（应改用 `Bonus.optional`）|
| **D160 Midwife** | 缺"对手本轮首个 farmer"守卫，违反 desc 文本 |
| **E53** | 缺 E85 联动 + meeple-id 跟踪 |
| **E149 MidnightFencer** | stub-only（文件存在但 effect/listener 全无；与 §2.6 自报一致）|

**连带 finding**（不在深度池中但 agent 顺带发现）：
- D12 ↔ D148 互斥未在 D12 端实现：BGA 明确 `NEGATED_BY_MILKING_PLACE`，我方 D12 仅过滤 'house' 不过滤 D148 zone

### 4.4 ❌ 数值/元数据偏差（13 张）

| Card | 偏差 |
|---|---|
| **A154 / A158 / A160** | `players` 元数据应为 '4+'，代码写 '3+' |
| **A14 Carpenter's Hammer**（也归 🔍）| BGA 标 `banned=true`，我方未带等价字段 |
| **B4 WoodPile** | 硬编码 gain wood=3，应为"在累计格上 farmer 数"；并写错 cost: food:2（BGA 是 passing 免费）|
| **B42 ForestInn** | 缺 `vp:1` 元数据 + 缺 round ≤ 6 的 isBuyable 守卫 |
| **C30** | cost 错 |
| **C39** | cost + prerequisite 错 |
| **C59** | cost 错 |
| **C151 / C152 / C153 / C163** | `players='3+'` 应 `'4+'`，会让这些卡进 3p 卡池但 BGA 限定 4+ |
| **E95 Miller** | Occupation 卡多了 `cost: { food: 1 }`，BGA 端没有该字段 |

> **重大警示**：A154/A158/A160 + C151/C152/C153/C163 共 7 张 `players` 字段错误，会让 2026-04-25 落地的"卡池按人数过滤"逻辑出现 false-positive——这些卡会进 3 人局卡池但 BGA 限定 4+。**优先级 P0**。
>
> ✅ **已由 Sprint 1 PR-1A 修复**（branch `sprint-1-pr-1a`）：A154/A158/A160 + C151/C152/C153/C163 共 7 张深度池 players 字段错全部已修。本节标题"13 张"为 PR-1A 之前的初始统计未减——实际剩 6 张待修（A14、B4、B42、C30、C39、C59、E95 中的 cost/vp 类，详见 §1 verdict 表已更新为深度池 6 张），由后续 PR 处理。

### 4.5 🔀 刻意偏离（4 张，与 §2.5 比对）

| Card | §2.5 已登记 | 取舍今天是否还成立 | 复核结论 |
|---|---|---|---|
| **B85 FarmHand** | ✅ | 是 | anytime + capacity 自然阻塞模型仍合理 |
| **C22 BasketChair** | ✅ | 是 | (a) 同轮再激活、(b) JobContract 假人清理两点未做，但 JobContract 未实现，无实际影响 |
| **D161 CabbageBuyer** | ✅ | 是 | farm-redev / standalone renovate 触发的卡很少；BGA tracker 复杂度高；建议保留 |
| **E16 BriarHedge** | ✅ | 是 | 折扣本体已对齐 BGA；`canStartFencing` 入口守卫的 2-3 wood 边角场景影响窄 |

**未发现新的"未登记的刻意偏离"**——所有 ⚠/❌ 都是真 bug 或元数据错。

### 4.6 🟡 简化实现（40 张）

主要分类（详见 b{1..5}.md）：
- **B 牌组（7 张）**：B103/B128/B151/B152/B26/B163/B75
- **C 牌组（9 张）**：C71/C117/C120/C135/C145/C146/C70/C88/C89/C164
- **D 牌组（10 张）**：D12/D21/D36/D63/D77/D82/D87/D128/D134/D148
- **E 牌组（12 张）**：E30/E36/E49/E66/E72/E73/E91/E112/E118/E132/E148/E161
- **A 牌组（2 张）**：A132 Publican（缺 deferred feasibility check）、A19 Handplow（缺 round-track field token 可视化）

### 4.7 🔍 待 owner 确认（1 张）

- **A14 Carpenter's Hammer**：BGA 标 `banned=true`（卡被禁用），我方未带等价字段。需 owner 决定：(a) 在我方加 `banned: true` 并跳过发牌，(b) 删除我方卡文件，(c) 维持现状。

## 5. Phase B Wide-Scan verdict（741 张）

> Wide-scan 用紧凑流程，verdict 质量不如深度池——优先抽查 ⚠/❌ 各 5–10 张。详细每张卡的紧凑段见 `output/tmp/audit-agent-b{6..10}.md`。

### 5.1 verdict 分布

| Agent | Deck | N | ✅ | ⚪ | 🟡 | ⚠ | ❌ | 🔀 | 🔍 |
|---|---|---|---|---|---|---|---|---|---|
| Phase B 6 | A | 152 | 117 | 12 | 3 | 5 | 14 | 0 | 1 |
| Phase B 7 | B | 150 | 95 | 12 | 17 | 14 | 21 | 0 | 2 |
| Phase B 8 | C | 150 | 73 | 12 | 22 | 0 | 18 | 0 | 3 |
| Phase B 9 | D | 152 | 80 | 12 | 35 | 1 | 14 | 1 | 3 |
| Phase B 10 | E | 137 | 110 | 0 | 13 | 6 | 3 | 0 | 4 |
| **合计** | | **741** | **475** | **48** | **90** | **26** | **70** | **1** | **13** |

### 5.2 ⚠ 行为偏差 wide-scan 新增（26 张）

**Top 5 P0 严重玩法 bug**：
- **B116 Shoreforester** — BGA reed bank 准备阶段填充时给 1 wood；TS 每个 round 开始无条件给 1 wood
- **B14 Hawktower** — BGA round 12 预约一个石屋间（条件性建造）；TS 写成 +1 stone 资源
- **B133 VillagePeasant** — BGA 给 N 个 vegetable 资源；TS 用 computePostScore 给 N VP
- **D138 PetLover** — `noop` xor 选项不取消原始 collect → 玩家同时拿空间动物 + 1 动物 + 3 food + 1 grain bonus（`shared/cards/D/D138_PetLover.ts:42-62`）
- **E134 Omnifarmer** — `computeBonusScore` 读 `storedTypes`，但代码无 listener/effect 写入此字段——分数永远不触发

**A 牌组（5 张）**：A38 WoolBlankets（cost 多收+prereq 错）、A165 PigBreeder（round 12 breeding 完全未实现）、A135 AnimalReeve（sharedScoring 没写）、A1 Shelter（缺 pasture-size-1）、A22 Telegram（extraPlacement 模拟需 owner 确认）

**B 牌组其余（11 张）**：详见 `output/tmp/audit-agent-b7.md`

**E 牌组（5 张）**：E134 Omnifarmer + 4 张 E 详细列表见 `output/tmp/audit-agent-b10.md`

### 5.3 ❌ 数值/元数据偏差 wide-scan 新增（70 张；PR-1A 已修 3 张 players → 实际剩 67 张）

**P0 cost 偏差（12 张）**：

| Card | 偏差 |
|---|---|
| **A4 Baseboards** | BGA `costs=[[food:2],[grain:1]]` 是择一，我方 `cost:{food:2, grain:1}` 强迫同时付（玩家加成本） |
| **A38 WoolBlankets** | cost 多收 wood+sheep（BGA 是 0）；prerequisite 写"Wooden House"（BGA 是"5 Sheep on farm"）|
| **C3** | 多 food:3 |
| **C13** | discount 应 stone:2 写成 stone:1 |
| **C33** | 缺 food:3 |
| **C35** | wood:1 写成 clay:1 |
| **C48** | 多 wood/clay |
| **D24** | 缺 food:1 |
| **D29** | 缺 wood:1 |
| **D39** | 缺 wood:1 |
| **E32** | cost 类型错（BGA `STONE=>2,REED=>1`，TS 写成 `clay:2, reed:1`，stone 误为 clay） |
| **E34** | 缺 cost（BGA `WOOD=>1`，TS `cost: {}`） |

**P0 players 字段错（4 张，与深度池 7 张同模式）** — ✅ 全部已修，Sprint 1 PR-1A on branch sprint-1-pr-1a：
- A154 应 4+ / E154 应 4+ / C134 应 3+ / C158 应 4+（注：A154 在深度池 §4.4 已计入并已修，wide-scan 这条为重复确认；PR-1A 实际唯一修复 = E154/C134/C158 共 3 张 wide-scan 新增 + 7 张深度池 = 合计 10 张）

**P1 prerequisite/altCosts 缺失（多张）**：
- D83 缺 altCosts grain:1 / D30 缺 prerequisite "3 Occupations"

**~50 张 category 字段批量不齐（B/C/D 三副）**：

| Deck | 张数 | 示例 |
|---|---|---|
| B | 21 | ANIMAL_HANDLER vs LIVESTOCK_PROVIDER、RESOURCE_WOOD vs BUILDING_RESOURCE_PROVIDER、FOOD_MISC vs FOOD_PROVIDER、ACTION_ENHANCER vs ACTIONS_BOOSTER |
| C | 15 | C4/C7/C9/C11/C12/C74/C77/C78/C79/C83/C112/C118/C129/C165/C166 |
| D | 8 | D3/D9/D24/D39/D84/D113/D118/D152 |

我方有自定义 category schema 但与 BGA 不一一对应。**修复路线**：建 BGA→ours 映射表跑迁移脚本，或扩展我方 schema 接受 BGA 命名作为别名。**P1**（不影响游戏行为，仅影响卡组统计 / UI 分组）。

**P2 A 牌组缺 `extraVp` 元数据（22 张）**：A29/A30/A31/A32/A34/A35/A37/A38/A58/A62/A98/A99/A100/A101/A133/A134/A136/A153 等——仅展示用，可批量补。

### 5.4 系统性问题（非单卡 bug）

#### 5.4.1 prerequisite 注册系统性缺失（D 牌组 5+ 张）

D7/D8/D39/D53/D58 等卡的 buyable 守卫只写在 `prerequisite: '...'` 字符串里，未通过 `registerPrerequisite(...)` 注册 handler。玩家点击购买时支付了费用但 onBuy 未触发预期效果（"白买"）。

**修复路线**：跑全量 `prerequisite` 字符串扫描，列出未注册 handler 的卡 → 逐张补 `registerPrerequisite`。**P0**

#### 5.4.2 sharedScoring 机制不完备

A135 AnimalReeve / C136 RanchProvost 都依赖 `sharedScoring=true` 但 `computeBonusScore` 没写。

**修复路线**：审视 `sharedScoring` 触发链路 → 列出所有声明 `sharedScoring:true` 的卡 → 逐张补 `computeBonusScore`。**P1**

#### 5.4.3 getExchangeResources 系统性简化

D35/D38/D45/D84 等卡的 `getExchangeResources()` 只看 `player.resources.{animal}` 忽略场上动物（pasture/stable）。BGA 通常包含场上+supply。

**修复路线**：建一个共享 helper `getEffectiveExchangeAnimals(player, kind)` 包含场上+supply → D 牌组 8+ 张卡迁移。**P1**

#### 5.4.4 跨卡协作机制缺失（C 牌组）

- C18 E70 联动、C25 forceSkip、C27 computeReplace、C49 farm-hand stable、C75 Wolf 联动、C84 reorganize、C130 hollow 二人版

### 5.5 stub / 未实现卡（≥16 张）

| Card | 状态 |
|---|---|
| A135 AnimalReeve | sharedScoring 完全没写 |
| A165 PigBreeder | round 12 breeding 整段未实现 |
| C62 CookeryExtension | `implemented:false` 动态 doubled exchange 系统未实现 |
| C105 BasketCarrier | BGA 是 1+ 实现 (exchanges)，TS 仅 stub |
| C109 SchnappsDistiller | 同上 |
| C136 RanchProvost | sharedScoring 仅 TODO 注释 |
| D62 | TODO harvest exchange |
| D94 | listener 空 stub |
| D108 | 仅声明卡无 exchange 字段 |
| D131 | TODO bottom-row major via minor |
| D157 | 缺 opponent-5-farmers 触发 |
| E58 LunchtimeBeer | 跳收获未实现（显式 TODO）|
| E134 Omnifarmer | computeBonusScore 读未写入字段 |
| E139 BunnyBreeder | future-meeple 未实现 |
| E149 MidnightFencer | stub-only（与 §2.6 自报一致）|
| E153 StoneSculptor | harvest+VP exchange 未支持 |
| E155 Visionary | family growth 阻止未实现 |

### 5.6 🔍 待 owner 确认 wide-scan 新增（13 张）

主要分类：
- **4 张 E 显式 TODO 卡**（E58/E139/E153/E155）：建议收入 §2.5 刻意偏离或排期实现
- **A22 Telegram**：用 extraPlacement 模拟 BGA 的 supply-farmer，需 owner 确认
- **C 牌组的 sharedScoring 通用机制**
- **A14/A33 banned 字段**（与深度池 A14 同）
- **A100 bannedWeak（draft 模式）**

## 6. 架构合规性总评

- **§3 基础设施清单完备性（A2 输出）**：✅ 0 个 register* 函数未在 §3 登记。`registerPrerequisite` / `registerSelectionEffect` / `registerPlayerActionSpace` 全部已记。
- **主路径分支清零（S1）**：⚠ 14 张卡名出现在主路径文件——但 Phase A 无逐项验证为"真 if-else 分支"。建议人工逐张快读：A123 / A14 / A143 / B3 / B30 / B72 / C22 / C59 / C122 / D25 / D82 / D95 / E101 / E95 在 `pay.ts` / `improvement.ts` / `game-core.ts` 中的命中是否合法（注释、sentinel、还是真 if-else）。
- **跨层依赖清零（S4）**：✅ 0 张卡 import `server/*` 或 `client/*`
- **测试 DOM 规则裁定清零（S9）**：✅ 0 张违规
- **client/* cardId-keyed 规则裁定（S2/S3）**：12 处命中，agent A1 已逐条标注。多数是 PlayerActionCard owner 显示 / B30 围栏门控等合法分支，未见严重违规。

## 7. 回流到 card_progress.md 的清单

预定 commit 改动（已落地于 commits `2f68602c` + `0d92e711`）：
- **§2.0 changelog**：加两行说明本次审查的两阶段
- **§2.3 行为偏差**：从 0 张 → 44 张
- **§2.4 数值/元数据偏差**：从 0 张 → 83 张（PR-1A 已修 10 张 players → 实际剩 73 张；§1 verdict 表已更新为 73）
- **§2.5 刻意偏离**：4 张状态保持；表加"复核日期 2026-04-28"
- **§2.2 简化实现**：从 0 张 → 130 张
- **§2.6 待实现**：E149 验证为"我方有 stub 文件但无逻辑"，wide-scan 新增 ≥15 张 stub
- **§3 基础设施**：sharedScoring 机制不完备，应加 limitation 备注（待落地）
- **§1 总览数字**：合并两阶段 verdict 887/881 张 → 587 ✅ / 130 🟡 / 44 ⚠ / 57 ❌（PR-1A −10、PR-1B −16）/ 5 🔀 / 14 🔍

## 8. 后续建议（不自动开 issue）

> 本审查不修复任何发现。下列建议供 owner 手动 issue 化、按优先级排期。
>
> **Sprint 1 PR-1B 已落地（cost/vp 字段对齐，2026-04-29，branch sprint-1-pr-1b）**：A38 / B4 / B42 / C3 / C30 / C33 / C35 / C39 / C48 / C59 / D24 / D29 / D39 / E32 / E34 / E95 共 16 张。A4 / D83（costs[][]）/ C13（isBuyable discount）deferred to Sprint 5。

| 优先级 | 主题 | 张数 / 工作量 |
|---|---|---|
| **P0** | wide-scan 5 张行为完全错（B116 / B14 / B133 / D138 / E134）| 5 张 / 1-2 day |
| **P0** | 11 张 players 字段错（深度 7 + wide 4：A154/A158/A160 + C151/C152/C153/C163 + E154 + C134 + C158）(actual 10 unique cards) — ✅ PR-1A on branch sprint-1-pr-1a | 改字段；跑卡池过滤回归测试 / < 0.5 day |
| **P0** | A4 Baseboards cost 模型错（择一→同时付）— 待 Sprint 5（alternative-cost 机制） | 1 张 / 0.5 day |
| **P0** | A38 / A165 / A135 cost+prereq+breeding+sharedScoring — A38 cost ✅ PR-1B on branch sprint-1-pr-1b；A38 prereq + A165/A135 残留 | 3 张 / 1-2 day |
| **P0** | D7/D8/D39/D53/D58+ prerequisite 注册"白买"bug | 5+ 张 / 1-2 day |
| **P0** | C3/C13/C33/C35/C48 + D24/D29/D39 + E32/E34 cost 错 — ✅ PR-1B on branch sprint-1-pr-1b（C13 isBuyable discount + D83 altCosts 等转 Sprint 5） | 12 张 / 2 day |
| **P0** | B4 WoodPile gain 硬编码 + cost 错 — cost ✅ PR-1B；gain 行为转 Sprint 5 | 1 张 / 0.5 day |
| **P0** | E95 Miller cost 多 food:1 — ✅ PR-1B on branch sprint-1-pr-1b | 1 张 / 0.1 day |
| **P0** | E149 MidnightFencer 实现 | 按 BGA `StartHarvest` listener 写完 / 2-3 day |
| **P1** | B130/B150/B152 useActionSpace(other) 语义 | 3 张 / 1-2 day |
| **P1** | A129/A139/A150/A151 行为偏差 | 4 张 / 1-2 day |
| **P1** | D18/D117/D160 行为偏差 | 3 张 / 1 day |
| **P1** | B27 Toolbox + B29 CookeryLesson | 2 张 / 0.5-1 day |
| **P1** | E53 + B115 + B138 + B155 + C23 + C51 + B 牌组其余 11 张 | 17 张 / 2-3 day |
| **P1** | B42 ForestInn vp + 守卫 — vp ✅ PR-1B；isBuyable round ≤ 6 守卫转 Sprint 5 | 1 张 / 0.3 day |
| **P1** | A135 / C136 sharedScoring 机制 | 1-2 day（含通用扫描）|
| **P1** | category 字段批量映射 | ~50 张 / 1-2 day |
| **P1** | getExchangeResources helper 统一 | 8+ 张 / 1-2 day |
| **P2** | A14 banned 字段 | owner 决策后实施 / 0.2 day |
| **P2** | E30 ChildsToy 破坏性 isNewborn mutation | 1 张 / 0.5 day |
| **P2** | D12 ↔ D148 互斥（连带）| 0.2 day |
| **P2** | i18n 缺口（71 + 437 项）| 1-2 day（非阻塞）|
| **P2** | 22 张 A 牌组缺 extraVp（仅展示用）| 0.5 day |
| **P2** | 15 张 stub / TODO 卡（A135 已含 P1）| 视情况 |
| **P3** | 130 张简化实现（深度 40 + wide 90）| 视情况 |

## 附录 A：原始脚本输出

> 以下路径为本次审查跑出的过程产物，位于 worktree 的 `output/tmp/` 下，**不进 git**。后续可能被清理或被新一次审查覆盖。

- 脚本 jsonl：`output/tmp/audit-card-arch-2026-04-28.jsonl`（886 行）
- 脚本 summary：`output/tmp/audit-summary.json`
- Phase A agent 输出：
  - `output/tmp/audit-agent-a1.json`（12 处 client 规则裁定）
  - `output/tmp/audit-agent-a2.json`（3 个 register* 函数全部已登记 §3）
  - `output/tmp/audit-agent-a3.json`（0 处测试 DOM 规则裁定）
  - `output/tmp/audit-agent-a4.json`（200 处 BGA i18n 缺口）
- Phase A 深度对齐 agent 输出：
  - `output/tmp/audit-agent-b1.md`（A 牌组 27 张）
  - `output/tmp/audit-agent-b2.md`（B 牌组 29 张）
  - `output/tmp/audit-agent-b3.md`（C 牌组 29 张）
  - `output/tmp/audit-agent-b4.md`（D 牌组 26 张）
  - `output/tmp/audit-agent-b5.md`（E 牌组 29 张）
- Phase B wide-scan agent 输出：
  - `output/tmp/audit-agent-b6.md`（A 牌组 152 张）
  - `output/tmp/audit-agent-b7.md`（B 牌组 150 张）
  - `output/tmp/audit-agent-b8.md`（C 牌组 150 张）
  - `output/tmp/audit-agent-b9.md`（D 牌组 152 张）
  - `output/tmp/audit-agent-b10.md`（E 牌组 137 张）
- 深度池：`output/tmp/deep-pool-2026-04-28.json`
- 深度池切段：`output/tmp/b-allocation.txt`
- Wide-scan 切段：`output/tmp/wide-pool-{A..E}.txt`
- R 池：`output/tmp/r1-recent.txt` / `r2-cross-scope.txt` / `r3-multistep.txt` / `r4-high.txt` / `r4-low.txt` / `o1-line-ratio.txt`
- A 嫌疑：`output/tmp/a-suspects-full.txt`
- SHA 快照：`output/tmp/sha-snapshot.txt`

## 附录 B：sub-agent prompt

详见 `docs/superpowers/plans/2026-04-28-card-impl-vs-bga-audit.md` Phase 6 + Phase 8 + Phase 12。注意 plan 原本是 4 个 B agent，实施时因 D+E 合并 55 张超出单 agent ≤30 张建议（plan §8 风险条款），调整为 5 个（A/B/C/D/E 各一）。Wide-scan（Phase 12）同样 5 个 agent 按 deck 切。

## 附录 C：本审查未做的事项

- **未对每张 wide-scan ⚠/❌ 做完整 5 维度对比**——紧凑流程仅一句话证据；建议 owner 抽查 ⚠+❌ 各 5–10 张
- **未执行人工抽审复核**（plan §5.6 / §8 风险表建议 5–10 张）——verdict 全部来自 sub-agent
- 未跟随 BGA 远端 ahead 的 commits（`c780b500`）——本审查冻结到 `3082e4d3`
- 未审查 Major Improvements / Community / Workshop 卡（按 spec §2 out-of-scope）
- 未评判 i18n 翻译质量（仅"齐不齐"裁定）
- 未实施任何修复（按 spec §2 修复另起 brainstorming）

---

## 9. 历史归档：desc 文案级审计（2026-04-17 起跑，被本次审查 §3.2 取代）

> 本节是原 `docs/card_desc_audit.md` 的归档内容，留作快照参考。新生效的 desc 对齐审计统一走本文件 §3.2 的 `scripts/audit-card-architecture.ts` S11 信号。

对比 `shared/cards/**/*.ts` 中 `desc` / `description` 字段与 BGA 参考仓库 `bga-agricola/modules/php/Cards/` 中 `$this->desc` 的差异。

> **比对方法**（脚本 `/tmp/audit_descs.py`，已不在仓库）：按文件名抓 BGA `Major_*.php` / `[A-E]\d+_*.php`，按文件名抓我们的 TS（major 文件按 `id: 'Major_xxx'` 抓，其它按文件名 `[A-E]\d+_*.ts`），逐字符串比较。归一化规则：JS 转义解码 / 弯引号→直引号 / NBSP→普通空格 / 连续空白合并、首尾去空白。其它（标点、`<TOKEN>`、`__斜体__`、Unicode `→`）一律严格相等。
>
> **2026-04-28 起接班**：本文件 §3.2 的 S11 信号在 `scripts/audit-card-architecture.ts` 中重新实现了归一化对比逻辑（与上述 `/tmp/audit_descs.py` 等价），结果 0 diff / 0 missing。

### 9.1 历史 totals（2026-04-17 跑出）

| Deck | BGA cards | Matched | Mismatched | Missing in ours | Extra in ours |
|---|---|---|---|---|---|
| A | 180 | 179 | 0 | 1 | 0 |
| B | 180 | 180 | 0 | 0 | 0 |
| C | 182 | 181 | 0 | 1 | 0 |
| D | 181 | 179 | 0 | 2 | 0 |
| E | 169 | 166 | 1 | 2 | 0 |
| Major | 10 | 10 | 0 | 0 | 0 |
| **Total** | **902** | **895** | **1** | **6** | **0** |

> 之前一版（164 mismatch + 7 missing）的所有图标 token、`<PIG>` / `<ARROW>` / `__…__` / "(including you)" / "from the general supply" / Major 重写、A60 等问题已经全部对齐。
>
> 本轮新增对齐：`A159_JoinerOfSea` → `A159_JoineroftheSea`（文件名 / `CARD_ID` / 常量 / listener id / 测试全部改名）。

### 9.2 真 desc mismatches（仅 1 张）

#### E68_CherryOrchard — 文案描述模型不同（实现已对齐意图）

| | 文案 |
|---|---|
| Ours | `This card is a field that can only grow <WOOD>. During each harvest, you receive 1 <WOOD> from this card. When you harvest the last <WOOD>, you also receive 1 <VEGETABLE>.` |
| BGA  | `This card is a field on which you can only sow and harvest wood as you would grain. Each time you harvest the last <WOOD> from this card, you also get 1 <VEGETABLE>.` |

实现已经按"虚拟 sowable field"实现（`onComputeSowableFields` + `onSowExtraField` 用 `wood` 作物，参见 `shared/cards/E/E68_CherryOrchard.ts`），与 BGA 的 "sow & harvest wood as you would grain" 模型一致。差异只是描述措辞——可以直接把 desc 改成 BGA 原文。

### 9.3 Naming-only divergences（内容一致，仅 ID/文件名不同）

| Ours | BGA | 状态 |
|---|---|---|
| ~~`A159_JoinerOfSea`~~ → `A159_JoineroftheSea` | `A159_JoineroftheSea` | ✅ 已对齐（已改名） |
| `C54_MarketBooth` | `C54_MarketStall` + `C54_MarketBooth` | BGA 同时保留两个文件：`C54_MarketBooth.php`（新印本）与 `C54_MarketStall.php`（legacy，文件头注释 `// LEGACY - REPRINTINGS OF THIS CARD RENAME IT MARKET BOOTH`）。我们只持有 `MarketBooth`，与 BGA 新印本一致。 |
| `D11_LawnFertilizer` | `D11_LawnFertilizer` + `D11_LawnFertilzer`（typo） | ✅ 我们用的是正确拼写 `D11_LawnFertilizer`，与 BGA 新印本逐字相同；BGA 那个拼错的 legacy 文件 (`LawnFertilzer`) 在 BGA 里已 `implemented = false`，我们不需要做任何事。 |

### 9.4 Truly missing in ours（BGA-only，非 legacy）

| Card | Deck | BGA 状态 | 描述 |
|---|---|---|---|
| A113_HeresyTeacher | A | `implemented = false`（BGA 侧）；我们 `implemented = true` | "Each time you use a 'Lessons' action space, you get 1 vegetable in each of your fields with at least 3 grain and no vegetable. Place the vegetable below the grain." — 2026-04-18 我们借 Field.stacks 多堆模型落地（详见 `docs/card_progress.md` §2.1）。desc 与 BGA 逐字一致。 |
| C54_MarketStall | C | implemented (legacy 名) | 见 §9.3——我们用的是 `C54_MarketBooth`，desc 一致。 |
| D75_WoodField | D | implemented | "You can plant `<WOOD>` on this card as though it were 2 fields, but it is considered 1 field. Sow and harvest `<WOOD>` on this card as you would `<GRAIN>`." |
| E80_RockGarden | E | implemented | "You can only plant `<STONE>` on this card. Plant as though it were 3 fields, but it is considered 1 field. Sow and harvest `<STONE>` on this card as you would vegetables." |
| E132_Shearer | E | `implemented = false` | "In the field phase of each harvest, if you have at least 1/4/7 sheep, you get 1/2/3 food. (Keep the sheep.) During scoring, you get 1 bonus point for every 3 sheep." |

> **D75 / E80 是真正"BGA 实现了我方完全无文件"的卡**——本次审查 §3.4（深度池构造）的 R4 信号未捕获到（R4 只找 `implemented=false` 反向），是历史 desc 审计的独有发现。可作 §2.6 待实现池的补充。
>
> E132 在 BGA 自己是 `implemented = false`；D75 / E80 是 sowable field 类，与 E68_CherryOrchard 同款套路（用 `onComputeSowableFields` + `onSowExtraField`）可以套着实现。
>
> A113（BGA 自己仍 `implemented = false`）我们于 2026-04-18 先于 BGA 实现——借 `Field.stacks` 多堆模型，详见 `docs/card_progress.md` §2.1 + §3。

### 9.5 Major cards — 已全部对齐 ✅

10 张 Major 全部逐行对齐（fireplace1/2 与 cookingHearth1/2 通过 spread 复用同一份 `description`，与 BGA 两个 PHP 文件复制粘贴的文本完全相等）。之前 audit 提到的 "ours uses prose with `→` + explicit `(max N)`" 已经全部改成 `<ARROW>` / `<ARROW-1X>` / `<ARROW-2X>` 的 token 形式。
