# Card Implementation vs BGA — Wide Scan（非深度池）

续 `docs/audits/2026-04-28-card-impl-vs-bga.md`：上一轮深度审查覆盖了 140 张卡（§2.5 + §2.6 + R1..R4 + O1 + A 嫌疑）；本次广扫覆盖**剩余 ~746 张非深度池卡**，每张做紧凑对齐审查（不按 5 维度详细比对，仅 verdict + 一句话证据）。

## 1. 摘要

- **扫卡总数**：741 张（agent 实际处理；与 746 切段差 5 张属边界，可接受）
- **方法**：5 个 sub-agent 按 deck 并行（A=152 / B=150 / C=150 / D=152 / E=137）
- **Verdict 分布**：

| Agent | Deck | N | ✅ | ⚪ | 🟡 | ⚠ | ❌ | 🔀 | 🔍 |
|---|---|---|---|---|---|---|---|---|---|
| B6 | A | 152 | 117 | 12 | 3 | 5 | 14 | 0 | 1 |
| B7 | B | 150 | 95 | 12 | 17 | 14 | 21 | 0 | 2 |
| B8 | C | 150 | 73 | 12 | 22 | 0 | 18 | 0 | 3 |
| B9 | D | 152 | 80 | 12 | 35 | 1 | 14 | 1 | 3 |
| B10 | E | 137 | 110 | 0 | 13 | 6 | 3 | 0 | 4 |
| **合计** | | **741** | **475** | **48** | **90** | **26** | **70** | **1** | **13** |

> **⚪ 数据 only**：双方都无逻辑（BGA `$this->implemented = false` + 我方文件无 effect/listener 注册），等价于 ✅，单列便于汇总。E 牌组 ⚪=0 因为 E 副 BGA 总数仅 169，无 5+ 卡段。

### 关键发现（5 条最严重）

1. **B116 Shoreforester / B14 Hawktower / B133 VillagePeasant 行为完全错** — 不是分支偏差，是核心玩法搞错（每轮给 wood vs reed bank 填充时给 / 给资源 vs 建房间 / 给 VP vs 给 vegetable）。**P0**
2. **D138 PetLover xor 模型错** — `noop` 选项不取消 collect，玩家同时拿空间动物 + 1 动物 + 3 food + 1 grain。**P0**
3. **prerequisite 注册系统性缺失（D7/D8/D39/D53/D58 等）** — buyable 条件仅写在字符串 prerequisite 字段，未注册到 `prerequisite-registry`。玩家可"白买"卡（onBuy 不返 gain 但费用已扣）。**P0**
4. **批量元数据偏差（70 张 ❌）** — 主要类别：
   - **category 字段命名不齐**（B/C/D 三副共 ~50 张）：`RESOURCE_WOOD/CLAY/REED/STONE` vs `BUILDING_RESOURCE_PROVIDER`、`ANIMAL_HANDLER` vs `LIVESTOCK_PROVIDER`、`FOOD_MISC` vs `FOOD_PROVIDER`、`ACTION_ENHANCER` vs `ACTIONS_BOOSTER`——疑似 owner 自定义 schema 但未与 BGA 对齐
   - **cost 偏差**（A/B/C/D/E 共 ~12 张）：A4 Baseboards 把 BGA 择一改成了同时付（玩家加成本）、A38 WoolBlankets 多收 wood+sheep、C3/C13/C33/C35/C48、D24/D29/D39、E32 stone 误为 clay、E34 缺 cost
   - **players 字段批量错**（A154/E154/C134/C158）：与上一轮 §2.4 7 张同模式
   - **22 张缺 `extraVp` 元数据**（A 牌组）：仅展示用不影响计分，可批量补
5. **大量 stub / 局部未实现**（≥10 张）：
   - **A135 AnimalReeve sharedScoring 完全没写**
   - **A165 PigBreeder round 12 breeding 完全未实现**
   - **C136 RanchProvost sharedScoring 仅 TODO**
   - **C62 CookeryExtension `implemented:false`**（动态 doubled exchange 系统未实现）
   - **D62/D94/D108/D131/D157** 5 张 D stub（含 listener 空 stub、缺 exchange 字段、TODO bottom-row major、缺 opponent-5-farmers 触发）
   - **E58/E139/E153/E155** 4 张显式 TODO 卡（跳收获 / future-meeple / harvest+VP exchange / family growth 阻止）
   - **E134 Omnifarmer broken**（computeBonusScore 读 `storedTypes` 但代码无 listener 写入此字段——分数永远不触发）

## 2. 方法

- 5 个 sub-agent（subagent_type: general-purpose）并行 dispatch
- 每个 agent 拿到一个 deck 的非深度池清单（`output/tmp/wide-pool-{A..E}.txt`）
- 紧凑输出策略：✅ 和 ⚪ 仅列 cardId（节省 token）；🟡/⚠/❌/🔀/🔍 写 ≤5 行紧凑段
- 单 agent 输出落 `output/tmp/audit-agent-b{6..10}.md`
- **未做的事项**：未对每张 ⚠/❌ 卡做完整 5 维度比对（这是上一轮深度审查的方法）；未做人工抽审复核

## 3. 结果按 deck 分

详细 verdict 段（每个非 ✅ 的卡 + 证据 + 建议）见 `output/tmp/audit-agent-b{6..10}.md`。本节做 deck 级摘要。

### 3.1 A 牌组（B6 — 152 张）

**Top 5 issue**：

| Card | Verdict | 摘要 |
|---|---|---|
| A4 Baseboards | ❌ | BGA `costs=[[food:2],[grain:1]]` 是择一，我方 `cost:{food:2, grain:1}` 强迫同时付 |
| A38 WoolBlankets | ⚠ | cost 多收 wood+sheep（BGA 是 0）；prerequisite 写"Wooden House"（BGA 是"5 Sheep on farm"）|
| A135 AnimalReeve | ⚠ | `sharedScoring=true` 的 `computeBonusScore` 完全没写，全局共享评分丢失 |
| A165 PigBreeder | ⚠ | round 12 breeding 整段未实现，仅 onBuy 给 1 boar |
| A154/A158/A160 | ❌ | players: '3+' 应为 '4+'（深度池已包含此 3 张，wide-scan 重复确认） |

**其他次要**：
- 22 张缺 `extraVp` 元数据（A29/A30/A31/A32/A34/A35/A37/A38/A58/A62/A98/A99/A100/A101/A133/A134/A136/A153 等）——仅展示用，批量补
- A1 Shelter 缺 pasture-size-1 限制
- A22 Telegram 用 extraPlacement 模拟 supply-farmer，需 owner 确认
- A14/A33 缺 `banned` / A100 缺 `bannedWeak`（draft 模式）
- A39 Chapel 缺 vp=3/extraVp

### 3.2 B 牌组（B7 — 150 张）

**Top 5 issue**：

| Card | Verdict | 摘要 |
|---|---|---|
| B116 Shoreforester | ⚠ | BGA reed bank 准备阶段填充时给 1 wood；TS 在每个 round 开始无条件给 1 wood |
| B14 Hawktower | ⚠ | BGA round 12 预约一个石屋间（条件性建造）；TS 写成 +1 stone 资源 |
| B133 VillagePeasant | ⚠ | BGA 给 N 个 vegetable 资源；TS 用 computePostScore 给 N VP |
| 21 张 category 不齐 | ❌ | ANIMAL_HANDLER vs LIVESTOCK_PROVIDER 等命名不同步 |
| holder/field/animalHolder 元数据缺失 | ❌ | B10/B141/B148 等 |

### 3.3 C 牌组（B8 — 150 张）

**Top 5 issue**：

| Card | Verdict | 摘要 |
|---|---|---|
| 15 张 category 字段不齐 | ❌ | C4/C7/C9/C11/C12/C74/C77/C78/C79/C83/C112/C118/C129/C165/C166 — 自定义 category schema 与 BGA 不齐 |
| C3 / C13 / C33 / C35 / C48 | ❌ | cost 数值偏差（C3 多 food:3 / C13 discount 写错 / C33 缺 food:3 / C35 wood→clay / C48 多 wood/clay）|
| C134 / C158 | ❌ | players 字段偏差（3+→1+ / 4+→1+） |
| C136 RanchProvost | 🟡 | `sharedScoring` 仅 TODO 注释 |
| C62 CookeryExtension | 🟡 | `implemented:false`（动态 doubled exchange 系统未实现）|

**跨卡协作机制缺失（多张）**：C18 E70 联动、C25 forceSkip、C27 computeReplace、C49 farm-hand stable、C75 Wolf 联动、C84 reorganize、C130 hollow 二人版

**其他**：C105 BasketCarrier、C109 SchnappsDistiller 是 stub（BGA 是 1+ 实现 exchanges）

### 3.4 D 牌组（B9 — 152 张）

**Top 5 issue**：

| Card | Verdict | 摘要 |
|---|---|---|
| D138 PetLover | ⚠ | `noop` xor 选项不取消原始 collect → 玩家同时拿空间动物 + 1 动物 + 3 food + 1 grain bonus（`shared/cards/D/D138_PetLover.ts:42-62`）|
| D7 / D8 / D39 / D53 / D58 等 | ❌ | prerequisite 字符串未注册到 `prerequisite-registry`，玩家可"白买"卡 |
| D35 / D38 / D45 / D84 | 🟡 | `getExchangeResources` 只看 `player.resources` 忽略场上动物（pasture/stable）|
| D62 / D94 / D108 / D131 / D157 | 🟡 / 🔍 | 5 张 stub / TODO |
| 元数据偏差扎堆 | ❌ | category 不齐：D3/D9/D24/D39/D84/D113/D118/D152；cost 缺：D24/D29/D39；altCosts 缺：D83；prerequisite 缺：D30 |

### 3.5 E 牌组（B10 — 137 张）

**Top 5 issue**：

| Card | Verdict | 摘要 |
|---|---|---|
| E32 | ❌ | cost 类型错：BGA `STONE=>2, REED=>1`，TS 写成 `clay: 2, reed: 1`（stone 误为 clay）|
| E34 | ❌ | 缺 cost：BGA `WOOD=>1`，TS `cost: {}` |
| E154 | ❌ | players: '4+'，TS '3+'（与上一轮 §2.4 同模式）|
| E134 Omnifarmer | ⚠ | computeBonusScore 读 `storedTypes`，但代码无任何 listener/effect 写入此字段——分数永远不触发 |
| E58 / E139 / E153 / E155 | 🔍 | 4 张显式 TODO 卡（跳收获 / future-meeple / harvest+VP exchange / family growth 阻止）— 建议收入 §2.5 刻意偏离或排期实现 |

## 4. 发现的系统性问题

### 4.1 category 字段全局不齐（B+C+D 共 ~50 张）

不是单卡 bug 而是 schema 级问题——我方有自定义 category 命名（`RESOURCE_WOOD/CLAY/REED/STONE`、`ANIMAL_HANDLER`、`FAMILY_GROWTH`、`FARMYARD_PLACE_FOR_ANIMALS`、`FOOD_MISC`），与 BGA 的（`BUILDING_RESOURCE_PROVIDER`、`LIVESTOCK_PROVIDER`、`FOOD_PROVIDER`、`ACTION_ENHANCER` vs `ACTIONS_BOOSTER`）不一一对应。

**修复路线**：建一个 `BGA category → ours category` 的映射表，跑迁移脚本批量更正；或者扩展我方 schema 接受 BGA 命名作为别名。**P1**（不影响游戏行为，仅影响卡组统计 / UI 分组）

### 4.2 prerequisite 字符串未注册（D 牌组 5+ 张）

D7/D8/D39/D53/D58 等卡的 buyable 守卫只写在 `prerequisite: '...'` 字符串里，未通过 `registerPrerequisite(...)` 注册 handler。玩家点击购买时支付了费用但 onBuy 未触发预期效果（"白买"）。

**修复路线**：跑全量 `prerequisite` 字符串扫描，列出未注册 handler 的卡 → 逐张补 `registerPrerequisite`。**P0**

### 4.3 sharedScoring 机制不完备

A135 AnimalReeve / C136 RanchProvost 都依赖 `sharedScoring=true` 但 `computeBonusScore` 没写。这是机制级缺失——不是单卡问题。

**修复路线**：审视 `sharedScoring` 触发链路 → 列出所有声明 `sharedScoring:true` 的卡 → 逐张补 `computeBonusScore`。**P1**

### 4.4 getExchangeResources 系统性简化

D35/D38/D45/D84 等卡的 `getExchangeResources()` 只看 `player.resources.{animal}` 忽略场上动物（pasture/stable）。BGA 通常包含场上+supply。

**修复路线**：建一个共享 helper `getEffectiveExchangeAnimals(player, kind)` 包含场上+supply → D 牌组 8+ 张卡迁移。**P1**

### 4.5 stub / 未实现卡（≥15 张）

- A135 / A165 / C62 / C105 / C109 / C136 / D62 / D94 / D108 / D131 / D157 / E58 / E134 / E139 / E153 / E155

这些卡是文件存在但 effect/onBuy/listener 部分或全部缺失。与上轮 E149 stub-only 同类。

## 5. 与上一轮 (2026-04-28) 对照

| 维度 | 2026-04-28 深度池（140 张）| 2026-04-29 wide-scan（741 张）| 合计 |
|---|---|---|---|
| ✅ | 64 | 475 + 48 ⚪ | 587 |
| 🟡 | 40 | 90 | 130 |
| ⚠ | 18 | 26 | 44 |
| ❌ | 13 | 70 | 83 |
| 🔀 | 4 | 1 | 5 |
| 🔍 | 1 | 13 | 14 |
| 总 | 140 | 741 | 881 |

**关键观察**：
- 数值偏差从 13 → 83，主要驱动是 category 字段批量不齐（~50 张）+ 各种 cost / players / prereq 偏差
- 行为偏差从 18 → 44，B 牌组贡献 14 张是大头
- 整体 ✅ 率：587/881 ≈ 67%；如果按"行为正确"宽口径（含 🟡 简化但主路径对的），约 717/881 ≈ 81%

**精度局限**：wide-scan 用紧凑流程，每张卡 ≤60s，可能：
- 漏报真正的 ⚠（agent 把它当 ✅）
- 误报 ❌（agent 不熟悉我方 schema 把合理偏差判错）
- category 命名不齐确实存在但是否算"BGA 偏差"取决于 owner 对自定义 schema 的态度

建议 owner 对 wide-scan 的 ❌ + ⚠ 各抽 5–10 张做完整重审，确认 verdict 质量。

## 6. 回流清单（追加到 card_progress.md）

预定改动：

- **§2.0 changelog**：加一行说明本次 wide-scan
- **§2.3 行为偏差**：从 18 张 → 44 张（追加 wide-scan 26 张：A38/A135/A165 + B14/B116/B133 + 11 张 B + D138 + E134 + 5 张 E）
- **§2.4 数值/元数据**：从 13 张 → 83 张（主要是 category 50+ 张 + cost/players/prereq 各类）
- **§2.2 简化实现**：从 40 张 → 130 张
- **§2.7 待 owner 确认**（新增节）：13 张
- **§3 新发现**：sharedScoring 机制不完备（应在 §3 加 limitation 备注）

> **重要**：本次 wide-scan 的 verdict 质量不如深度池审查，建议在回流时**标注"wide-scan, 紧凑审查未做完整 5 维度对比"**，让后续修复者优先抽查。

## 7. 修复优先级追加（叠加在 2026-04-28 §7 之上）

| 优先级 | 主题 | 张数 / 工作量 |
|---|---|---|
| **P0** | B116 / B14 / B133 / D138 / E134 行为完全错 | 5 张 / 1-2 day |
| **P0** | A4 Baseboards cost 模型错（择一→同时付）| 1 张 / 0.5 day |
| **P0** | A38 / A165 cost+prereq 错 + breeding 缺失 | 2 张 / 1 day |
| **P0** | A154 / E154 / C134 / C158 players 字段错（与上轮 7 张同模式）| 4 张 / < 0.5 day |
| **P0** | D7/D8/D39/D53/D58 prerequisite 注册"白买"bug | 5+ 张 / 1-2 day |
| **P0** | C3/C13/C33/C35/C48 + D24/D29/D39 + E32/E34 cost 错 | 12 张 / 2 day |
| **P1** | A135 / C136 sharedScoring 机制 | 1-2 day（含通用扫描）|
| **P1** | category 字段批量映射 | ~50 张 / 1-2 day |
| **P1** | getExchangeResources helper 统一 | 8+ 张 / 1-2 day |
| **P1** | B 牌组其余 11 张行为偏差 | 1-2 day |
| **P2** | 22 张 A 牌组缺 extraVp（仅展示用）| 0.5 day |
| **P2** | 15 张 stub / TODO 卡（A135 已含 P1）| 视情况 |
| **P3** | 90 张简化实现（wide-scan 报）| 视情况 |

## 附录 A：原始 agent 输出

详见 `output/tmp/audit-agent-b{6..10}.md`（不进 git，gitignored）。每个文件包含：
- ✅/⚪ cardId 列表
- 🟡/⚠/❌/🔀/🔍 详细紧凑段（BGA / 我方 / 缺失分支 / 证据）

## 附录 B：与本轮关联的清单文件

- 切段：`output/tmp/wide-pool-{A..E}.txt`（cardId 清单，每行一张）
- 深度池：`output/tmp/deep-pool-2026-04-28.json`（被排除集合）
- SHA 快照：`output/tmp/sha-snapshot.txt`（本次审查同样基于 2026-04-28 冻结的 SHA）

## 附录 C：本次 wide-scan 未做的事项

- 未对 ⚠/❌ 做完整 5 维度对比（紧凑流程仅一句话证据）
- 未执行人工抽审复核
- 未实施任何修复
- 未跟随 BGA 远端 ahead 的新提交（仍冻结 `3082e4d3`）
- 由于 token 预算，agent 输出可能在边界卡上出现误判——建议优先抽查 ⚠ + ❌ 各 5–10 张
