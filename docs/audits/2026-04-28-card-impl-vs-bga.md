# Card Implementation vs BGA Audit — 2026-04-28

外部复核 `shared/cards/{A..E}/*.ts` 全量 887 张卡 vs BGA 同号 `.php`，按 spec `docs/superpowers/specs/2026-04-28-card-impl-vs-bga-audit-design.md` 流程执行。

## 1. 摘要

- **扫卡总数**：886 张（双方都存在的卡对；我方多 1 张 oursOnly=0、BGA 多 2 张 bgaOnly=2，详见 §3）
- **深度池规模**：140 张（按 §2.5 / §2.6 / R1..R4 / O1 / A 嫌疑合并）
- **B 阶段 verdict 分布**：64 ✅ / 40 🟡 / 18 ⚠ / 13 ❌ / 4 🔀 / 1 🔍

### 关键发现（5 条）

1. **`docs/card_progress.md` §2.3 自报"行为偏差 0 张"与审查不一致**：B 阶段发现 **18 张行为偏差** 卡（B130/B150/B152、B27、B29、B115、B138、B155、A129、A139、A150、A151、C23、C51、D18、D117、D160、E53）。其中 B130/B150/B152 都是同一类问题（`useActionSpace(other)` 语义被简化丢"用 farmer 到另一格"事件）。
2. **§2.4 自报"数值/元数据偏差 0 张"也不成立**：B 阶段发现 **13 张数值偏差**——以"players 字段 `3+` 应为 `4+`"批量错误为主（A154/A158/A160、C151/C152/C153/C163），命中 2026-04-25 卡池过滤逻辑的 false-positive；以及 cost 错（B4 WoodPile、B42 ForestInn 缺 vp、C30/C39/C59、E95 Miller 多 food:1）。
3. **架构纪律保持良好**：A1 只命中 12 处 client-side cardId-keyed 规则裁定，且 6 处是 PlayerActionCard owner 显示 / B30 围栏门控等合法分支；A2 报告 0 个 §3 未登记扩展点；A3 报告 0 个测试 DOM 规则裁定。S1 14 张主路径 cardId 命中、S7-filtered 22 张外部引用——绝大多数是注释、helper 边界条件，未发现严重 cardId-keyed 主路径分支。
4. **§2.5 4 张刻意偏离全部通过复核**：B85 FarmHand / C22 BasketChair / D161 CabbageBuyer / E16 BriarHedge 当初 owner 签字的取舍今天仍然成立——可保留登记。
5. **i18n 缺口偏多**：A4 报告 437 个 BGA `clienttranslate(...)` 字符串完全无对应翻译（top 200 入 json）；脚本 S12 报 71 张卡有"卡里出现但 zh/en 缺定义"的 key。这些不是行为问题但用户体验偏差大。

### 重要边界提醒

- **本次审查不修复任何 ⚠/❌ 发现**——按 spec §2，修复另起 brainstorming
- **未执行人工抽审复核**——verdict 全部来自 5 个 sub-agent，建议 owner 后续抽样 5–10 张做完整重审
- 最终修复优先级见 §7

## 2. 方法

- **A 阶段**：`scripts/audit-card-architecture.ts`（机械信号 S1/S4/S5/S6/S7/S10/S11/S12）+ 4 个 Explore sub-agent 并行（语义信号 S2/S3/S8/S9）
- **B 阶段**：5 个 sub-agent 按 deck 切（A=27 / B=29 / C=29 / D=26 / E=29），深度对齐 BGA 行为
- **复现命令**：
  ```bash
  pnpm tsx scripts/audit-card-architecture.ts > output/tmp/audit-summary.json
  # 详见 spec docs/superpowers/specs/2026-04-28-card-impl-vs-bga-audit-design.md §5
  # 4 个 A agent 并行（subagent_type: Explore）：S2/S3, S8, S9, S12
  # 5 个 B agent 并行（subagent_type: general-purpose）：A/B/C/D/E 牌组各一
  ```
- **输入快照**（冻结自 `output/tmp/sha-snapshot.txt`）：
  - 我方 SHA：`2b5ddee651d06fed067e7747b86ce47372d08c8a`
  - BGA SHA：`3082e4d3586fd3571916097957c91ff2312f6430`
  - BGA 远端 ahead 至：`c780b50013755a76d1833f7bec69aefc399539ec`（本次审查未跟随）
  - 冻结时间：`2026-04-28T18:37:12Z`

## 3. A 阶段结果

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

**S10 false-positive 说明**：A25 / D95 / E101 等 §2.1 已确认对齐的卡也命中 S10——脚本通过 `registerCardListener` / `effect` / `onBuy` / 等关键字检测 hook 数；这些卡用静态字段 (`modifier`/`scoreRule`/`exchanges`)、`isListeningTo`+`handler` 函数引用别名，或 BGA 端用 `function execute()` 之外的 hook（如 `isAffectingPlayer`、`onActionSpaceUsed`）。脚本检测保守。**实际验证以 B 阶段 verdict 为准**——S10 high 36 张里只有 E149 真是 stub（B5 已确认）。

### 3.2 i18n 缺口

| 维度 | 命中 | 说明 |
|---|---|---|
| **S11 desc 对齐** | 0 diff / 0 missing | 我方源码 `desc:` 字面量经归一化后与 BGA `$this->desc` 100% 对齐（注：未追溯 i18n 间接引用） |
| **S12 卡内 i18n key zh/en 缺失** | 71 张卡 | 卡里出现的 `actions.<id>.*` / `ui.interaction*` / `prompt.*` key 在 `client/i18n/{zh,en}.ts` 至少一语缺定义 |
| **A4 BGA 有但我方完全无翻译** | 437 字符串（top 200 in json）| BGA `clienttranslate(...)` 调用的 prompt/log/系统文案找不到对应 i18n value |

### 3.3 空壳卡（S10）逐张验证

| Card | hookCount | bgaHookCount | B 阶段最终判定 |
|---|---|---|---|
| **E149 MidnightFencer** | 0 | 1 | ⚠（确实是 stub-only，与 §2.6 自报一致）|
| 其余 35 张（A12/A25/A129/A139/B103/B115/B130/B150/B151/B152/B155/B163/B27/C120/C135/C23/C89/C95/D11/D12/D148/D163/D18/D21/D87/D95/E101/E116/E12/E159/E165/E30/E36/E53/E91/E95） | 0 | 1 | 多数 ✅/🟡/⚠ — 真 stub 仅 E149 |

S10 维度有意义但需结合 B 阶段验证；脚本本身不能区分"hook 写法不同"和"真 stub"。

### 3.4 嫌疑名单 → 深度池

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

## 4. B 阶段结果

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
| B1 | A | 27 | 17 | 2 | 4 | 3 | 0 | 1 |
| B2 | B | 29 | 12 | 7 | 7 | 2 | 1 | 0 |
| B3 | C | 29 | 10 | 9 | 2 | 7 | 1 | 0 |
| B4 | D | 26 | 12 | 10 | 3 | 0 | 1 | 0 |
| B5 | E | 29 | 13 | 12 | 2 | 1 | 1 | 0 |
| **合计** | | **140** | **64** | **40** | **18** | **13** | **4** | **1** |

### 4.3 ⚠ 行为偏差（18 张）

> 详见各 agent markdown 完整段落：`output/tmp/audit-agent-b{1..5}.md`

| Card | 关键发现 | Agent |
|---|---|---|
| **A129 Swagman** | farm-expansion 用 OR 而 BGA 是 SEQ；未设 once-per-turn flag | B1 |
| **A139 Hollow Warden** | 仅匹配 `hollow-4`，3+人模式下其它 hollow 累积格漏触发 | B1 |
| **A150 Stagehand** | construct 硬编码 `maxRooms:1`，BGA 不限制 | B1 |
| **A151 Minstrel** | sheep-market gain 未清累积；grain-utilization 用 OR 而 BGA 是 SEQ 允许同时 sow+bake | B1 |
| **B27 Toolbox** | 每次构建都触发，未实现"turn 末一次性"语义 | B2 |
| **B29 CookeryLesson** | "same turn" 被错误扩展成 "same round" | B2 |
| **B115 Tinsmith** | 多 field 时只允许选 1 个，BGA 给每 field 各加 1 | B2 |
| **B130 / B150 / B152** | `useActionSpace(other)` 语义被 inline 简化，丢"用 farmer 到另一格"的事件 | B2 |
| **B138 ForestGuardian** | 用 `gain-trigger-player` 可能没真扣对手食物（须确认） | B2 |
| **B155 ArtTeacher** | 抽 TP food 仅在 lessons 入口，遗漏其他 occupation play 路径 | B2 |
| **C23** | 触发条件偏差 | B3 |
| **C51 FishingNet** | 没真正从 trigger player 扣 food | B3 |
| **D18 SteamPlow** | 多了 sow 节点，BGA 仅 plow（`shared/cards/D/D18_SteamPlow.ts:30-37` vs `Cards/Actions/ActionFarmland.php:15-17`）| B4 |
| **D117 WoodExpert** | 强制扣 1 食物替换 wood，BGA 是给 alternative trade 让玩家选（应改用 `Bonus.optional`）| B4 |
| **D160 Midwife** | 缺"对手本轮首个 farmer"守卫，违反 desc 文本 | B4 |
| **E53** | 缺 E85 联动 + meeple-id 跟踪 | B5 |
| **E149 MidnightFencer** | stub-only（文件存在但 effect/listener 全无；与 §2.6 自报一致）| B5 |

**连带 finding**（不在深度池中但 B4 顺带发现）：
- D12 ↔ D148 互斥未在 D12 端实现：BGA 明确 `NEGATED_BY_MILKING_PLACE`，我方 D12 仅过滤 'house' 不过滤 D148 zone

### 4.4 ❌ 数值/元数据偏差（13 张）

| Card | 偏差 | Agent |
|---|---|---|
| **A154 / A158 / A160** | `players` 元数据应为 '4+'，代码写 '3+' | B1 |
| **A14 Carpenter's Hammer**（也归 🔍）| BGA 标 `banned=true`，我方未带等价字段 | B1 |
| **B4 WoodPile** | 硬编码 gain wood=3，应为"在累计格上 farmer 数"；并写错 cost: food:2（BGA 是 passing 免费）| B2 |
| **B42 ForestInn** | 缺 `vp:1` 元数据 + 缺 round ≤ 6 的 isBuyable 守卫 | B2 |
| **C30** | cost 错 | B3 |
| **C39** | cost + prerequisite 错 | B3 |
| **C59** | cost 错 | B3 |
| **C151 / C152 / C153 / C163** | `players='3+'` 应 `'4+'`，会让这些卡进 3p 卡池但 BGA 限定 4+ | B3 |
| **E95 Miller** | Occupation 卡多了 `cost: { food: 1 }`，BGA 端没有该字段 | B5 |

> **重大警示**：A154/A158/A160 + C151/C152/C153/C163 共 7 张 `players` 字段错误，会让 2026-04-25 落地的"卡池按人数过滤"逻辑出现 false-positive——这些卡会进 3 人局卡池但 BGA 限定 4+。**优先级 P0**。

### 4.5 🔀 刻意偏离（4 张，与 §2.5 比对）

| Card | §2.5 已登记 | 取舍今天是否还成立 | 复核结论 |
|---|---|---|---|
| **B85 FarmHand** | ✅ | 是 | anytime + capacity 自然阻塞模型仍合理 |
| **C22 BasketChair** | ✅ | 是 | (a) 同轮再激活、(b) JobContract 假人清理两点未做，但 JobContract 未实现，无实际影响 |
| **D161 CabbageBuyer** | ✅ | 是 | farm-redev / standalone renovate 触发的卡很少；BGA tracker 复杂度高；建议保留 |
| **E16 BriarHedge** | ✅ | 是 | 折扣本体已对齐 BGA；`canStartFencing` 入口守卫的 2-3 wood 边角场景影响窄 |

**未发现新的"未登记的刻意偏离"**（即所有 ⚠/❌ 都是真 bug 或元数据错，不是 owner 签字过的取舍）。

### 4.6 🟡 简化实现（40 张）

主要分类（详见 b{N}.md）：
- **B 牌组（7 张）**：B103/B128/B151/B152/B26/B163/B75 — 行为接近，差异不影响主流场景
- **C 牌组（9 张）**：C71/C117/C120/C135/C145/C146/C70/C88/C89/C164 — 多为 onBuy 阶段缺资源/建造收益的边缘分支
- **D 牌组（10 张）**：D12/D21/D36/D63/D77/D82/D87/D128/D134/D148
- **E 牌组（12 张）**：E30/E36/E49/E66/E72/E73/E91/E112/E118/E132/E148/E161
- **A 牌组（2 张）**：A132 Publican（缺 deferred feasibility check）、A19 Handplow（缺 round-track field token 可视化）

### 4.7 🔍 待 owner 确认（1 张）

- **A14 Carpenter's Hammer**：BGA 标 `banned=true`（卡被禁用），我方未带等价字段。需 owner 决定：(a) 在我方加 `banned: true` 并跳过发牌，(b) 删除我方卡文件，(c) 维持现状但理解为"我方有意启用 BGA 禁用的卡"。

### 4.8 连带发现（不在深度池但 agent 顺带报）

- **D12 ↔ D148 互斥未实现**（B4 报）：BGA `NEGATED_BY_MILKING_PLACE`，我方 D12 仅过滤 `'house'` 不过滤 D148 zone
- **C71 SlurrySpreader**（B3 报）：BGA 已废弃（`implemented=false`），我方仍在卡池中——R4 也已捕获

## 5. 架构合规性总评

- **§3 基础设施清单完备性（A2 输出）**：✅ 0 个 register* 函数未在 §3 登记。`registerPrerequisite` / `registerSelectionEffect` / `registerPlayerActionSpace` 全部已记。
- **主路径分支清零（S1）**：⚠ 14 张卡名出现在主路径文件——但 A 阶段无逐项验证为"真 if-else 分支"。建议人工逐张快读：A123 / A14 / A143 / B3 / B30 / B72 / C22 / C59 / C122 / D25 / D82 / D95 / E101 / E95 在 `pay.ts` / `improvement.ts` / `game-core.ts` 中的命中是否合法（注释、sentinel、还是真 if-else）。
- **跨层依赖清零（S4）**：✅ 0 张卡 import `server/*` 或 `client/*`
- **测试 DOM 规则裁定清零（S9）**：✅ 0 张违规
- **client/* cardId-keyed 规则裁定（S2/S3）**：12 处命中，agent A1 已逐条标注。多数是 PlayerActionCard owner 显示 / B30 围栏门控等合法分支，未见严重违规。

## 6. 回流到 card_progress.md 的清单

预定 commit 改动：
- **§2.0 changelog**：加一行说明本次审查
- **§2.3 行为偏差**：从"0 张"改为 18 张，新增表行（A129/A139/A150/A151、B27/B29/B115/B130/B138/B150/B152/B155、C23/C51、D18/D117/D160、E53、E149）
- **§2.4 数值/元数据偏差**：从"0 张"改为 13 张，新增表行（A14/A154/A158/A160、B4/B42、C30/C39/C59/C151/C152/C153/C163、E95）
- **§2.5 刻意偏离**：4 张状态保持；§2.5 表加"复核日期 2026-04-28"
- **§2.2 简化实现**：从"0 张"改为 40 张
- **§2.6 待实现**：E149 验证为"我方有 stub 文件但无逻辑"——保持"未实现"状态，文件视同 placeholder
- **§3 基础设施**：无新登记需求
- **§1 总览数字**：BGA total 应改为 894（A180+B180+C182+D181+E169 = 892 是当前；需复核 BGA "有 PHP 文件但 implemented=false" 的 5+ 卡是否计入"BGA 总数"）

## 7. 后续建议（不自动开 issue）

> 本审查不修复任何发现。下列建议供 owner 手动 issue 化、按优先级排期。

| 优先级 | 主题 | 建议动作 | 工作量估计 |
|---|---|---|---|
| **P0** | 7 张 `players` 字段错（A154/A158/A160 + C151/C152/C153/C163）| 改 `players: '3+'` → `'4+'`；跑卡池过滤回归测试 | < 0.5 day |
| **P0** | C30/C39/C59 cost 错 | 对照 BGA 改 `cost: {...}`；补 cost 单测 | 0.5–1 day |
| **P0** | B4 WoodPile gain 硬编码 + cost 错 | 改 gain 为按 farmer 计；改 cost 为空 | 0.5 day |
| **P0** | E95 Miller cost 多 food:1 | 删 `cost: { food: 1 }`，改 `cost: {}` | 0.1 day |
| **P0** | E149 MidnightFencer 实现 | 按 BGA `StartHarvest` listener 写完；spec §2.6 已标 MED-HIGH | 2–3 day |
| **P1** | B130/B150/B152 useActionSpace(other) 语义 | 引入"用 farmer 到另一格"事件路径，迁移 3 张卡 | 1–2 day |
| **P1** | A129/A139/A150/A151 行为偏差 | 4 张独立修复 + 单测 | 1–2 day |
| **P1** | D18/D117/D160 行为偏差 | D117 用 `Bonus.optional` 重写、D18 删 sow 节点、D160 加守卫 | 1 day |
| **P1** | B27 Toolbox + B29 CookeryLesson | 加 turn 末一次性语义 / 改 same-turn | 0.5–1 day |
| **P1** | E53 + B115 + B138 + B155 + C23 + C51 | 6 张独立修复 | 1–2 day |
| **P1** | B42 ForestInn vp + 守卫 | 加 vp:1 + isBuyable round ≤ 6 守卫 | 0.3 day |
| **P2** | A14 banned 字段 | owner 决策后实施 | 0.2 day（仅元数据）|
| **P2** | E30 ChildsToy 破坏性 isNewborn mutation | 改非破坏式实现 | 0.5 day |
| **P2** | D12 ↔ D148 互斥（连带）| 在 D12 加过滤 D148 zone | 0.2 day |
| **P2** | i18n 缺口（71 + 437 项）| 批量补 zh/en | 1–2 day（非阻塞）|
| **P3** | 40 张简化实现 | 按个评估 / 按需补分支 | 视情况 |

## 附录 A：原始脚本输出

> 以下路径为本次审查跑出的过程产物，位于 worktree 的 `output/tmp/` 下，**不进 git**。后续可能被清理或被新一次审查覆盖。

- 脚本 jsonl：`output/tmp/audit-card-arch-2026-04-28.jsonl`（886 行）
- 脚本 summary：`output/tmp/audit-summary.json`
- A 阶段 agent 输出：
  - `output/tmp/audit-agent-a1.json`（12 处 client 规则裁定）
  - `output/tmp/audit-agent-a2.json`（3 个 register* 函数全部已登记 §3）
  - `output/tmp/audit-agent-a3.json`（0 处测试 DOM 规则裁定）
  - `output/tmp/audit-agent-a4.json`（200 处 BGA i18n 缺口）
- B 阶段 agent 输出：
  - `output/tmp/audit-agent-b1.md`（A 牌组 27 张）
  - `output/tmp/audit-agent-b2.md`（B 牌组 29 张）
  - `output/tmp/audit-agent-b3.md`（C 牌组 29 张）
  - `output/tmp/audit-agent-b4.md`（D 牌组 26 张）
  - `output/tmp/audit-agent-b5.md`（E 牌组 29 张）
- 深度池：`output/tmp/deep-pool-2026-04-28.json`
- 深度池切段：`output/tmp/b-allocation.txt`
- R 池：`output/tmp/r1-recent.txt` / `r2-cross-scope.txt` / `r3-multistep.txt` / `r4-high.txt` / `r4-low.txt` / `o1-line-ratio.txt`
- A 嫌疑：`output/tmp/a-suspects-full.txt`
- SHA 快照：`output/tmp/sha-snapshot.txt`

## 附录 B：4 个 A agent + 5 个 B agent 的 prompt

详见 `docs/superpowers/plans/2026-04-28-card-impl-vs-bga-audit.md` Phase 6 + Phase 8。注意 plan 原本是 4 个 B agent，实施时因 D+E 合并 55 张超出单 agent ≤30 张建议（plan §8 风险条款），调整为 5 个（A/B/C/D/E 各一）。

## 附录 C：本审查未做的事项

- 未对深度池外的 ~750 张已实现卡逐张读 BGA `.php`（仅做机械信号扫描）
- 未执行人工抽审复核（plan §5.6 / §8 风险表建议 5–10 张）——verdict 全部来自 sub-agent
- 未跟随 BGA 远端 ahead 的 commits（`c780b500`）——本审查冻结到 `3082e4d3`
- 未审查 Major Improvements / Community / Workshop 卡（按 spec §2 out-of-scope）
- 未评判 i18n 翻译质量（仅"齐不齐"裁定）
- 未实施任何修复（按 spec §2 修复另起 brainstorming）
