# 卡牌实现进度

基于 BGA 参考项目（`../bga-agricola`）的完整对比。本文档是**唯一**的卡牌实现进度追踪源，
所有需要关注的卡（简化、行为偏差、成本错位、刻意偏离、待实现）按"与 BGA 对齐情况"统一在 §2 分类。

> 配套文档：`docs/card_desc_audit.md` 仅做 BGA `$this->desc` 文案对齐审计；行为/实现差异统一在本文件追踪。
>
> **维护规则（见 `AGENTS.md`）**：每次改完卡牌相关代码（无论是新实现、修 bug、改简化、改 desc、改 AI behavior、调整 hook），都必须把对应条目更新到本文件，并写明日期 / 批次 / 变更摘要。

---

## 1. 总览

| Deck | BGA 总数 | 已实现 | BGA 也无逻辑（数据 only） | BGA 有逻辑我们漏实现 | 需核心扩展 |
|---|---|---|---|---|---|
| A | 180 | 157 | 5 | 0 | 0 |
| B | 180 | 158 | 0 | 0 | 0 |
| C | 182 | 157 | 0 | 0 | 0 |
| D | 181 | 157 | 2 | 1 | 0 |
| E | 169 | 159 | 0 | 2 | 1 |
| **总计** | **892** | **818** | **7** | **3** | **1** |

**截至 2026-04-17：818/892 = 91.7%。**

> Major Improvements (10 张) 单独实现，不计入上表，全部已落地。
> 5+ 人卡（169-180 号段，~48 张）BGA 自身 `isImplemented=false`，不计入 BGA 总数。
> 若干卡通过静态 `modifier`/`modifiers`/`exchanges`/`scoreRule` 字段实现，视为已实现（例：A14, A60, A88, A123, B32, B80, B104, B145, C13, C14, D59, E153 等）。

---

## 2. 卡牌与 BGA 对齐分类

按"我们的实现 vs BGA 行为/数值是否一致"对所有需要关注的卡分类。
~810 张完全对齐的卡不逐张列；下面只列**有差异、有 TODO 或需要 owner 关注的卡**。

| 状态 | 数量 | 含义 | 处理方式 |
|---|---|---|---|
| ✅ 完全对齐 | ~803 + §2.1 列举 14 张 | 行为 + 元数据均与 BGA 一致 | 不用动 |
| 🟡 简化实现（§2.2） | 10 张 | 主路径工作，分支未做；缺啥基础设施有写 | 已知简化，按需排期 |
| ⚠ 行为偏差待修（§2.3） | 3 张 | 行为与 BGA 偏差，是 bug | 排期修 |
| ❌ 数值/元数据待修（§2.4） | 7 张 | cost / prereq / vp 与 BGA 不同 | 优先修，影响经济 |
| 🔀 刻意偏离 BGA（§2.5） | 5 张 | owner 签字过的设计差异 | **不要当 bug 修**，先开 issue |
| ⏳ 待实现 / 待评估（§2.6） | 4 张 | 未实现或需核心扩展 | 见 §2.6 优先级 |

### 2.0 近期变更（changelog 入口）

> 任何卡牌相关 commit 必须在这里加一行（见 §6 文档维护规则）。

- **2026-04-17 — A87 Conservator 完整实现**：`renovate-house` 重构为可参数化（`params.skipClayTier`），删除独立 `renovate-house-to-stone`；A87 加 `computeReplace` + `isDoable` 两个 listener；新增 i18n key `ui.interactionConservatorDirectStone`。renovation 折扣天然复用到 Conservator 分支：cost-type modifier `appliesTo: ['renovation']`（A143 Stonecutter / A123 FrameBuilder）经 `payTypedFlatCost` 与 actionId 无关；actionId-keyed `computeCosts` 监听器（D154 ChimneySweep）也命中该 branch，只是其自带 `houseType === 'clay'` 守卫（§2.3 独立 bug）当前阻止其在 wood→stone 上生效。
- **2026-04-17 §6 24 张卡逐项复核完成**：原 §6 的 23 张"未复核"全部核对，按 ✅/⚠/❌ 重排进 §2.1–§2.4；C129/C137 卡名从 WetNurse/Baker 修正为 SecondSpouse/CharcoalBurner；E132 VeggieLover 从原 §5 "刻意不同"移除（其实是 3+ 卡且行为已对齐）。
- **2026-04-17 desc 对齐 / 命名修复**：全量 BGA `$this->desc` ↔ 我们 `desc` 审计 `895/902` 已对齐（详见 `docs/card_desc_audit.md`）；`A159_JoinerOfSea` → `A159_JoineroftheSea` 改名对齐 BGA。
- **2026-04-17 Wave 9 已补完（6 张）**：`A41_VegetableSlicer` · `A85_Homekeeper` · `A106_SlurrySpreader` · `D103_CanalBoatman` · `E68_CherryOrchard` · `E93_Motivator`。本轮明确延后：`A87_Conservator`、`E149_MidnightFencer`（见 §2.6）。

### 2.1 ✅ 完全对齐（已逐项核对的 14 张）

> ~800 张未列卡按 `shared/cards/catalog.ts` 注册即视为已实现；下表是 2026-04-17 复核中逐张核对过、明确标 ✅ 的 14 张。

| Card | 复核要点 | 备注 |
|---|---|---|
| A101 CookeryOutfitter | 排除 Ovens | 用 `isCookery` 标志，Ovens 只有 `isBaking`，正确排除 |
| A134 FullFarmer | onBuy `1<WOOD>+1<CLAY>` + 满栏 pasture 计分 | 行为一致；def 中 `players: '1+'` ≠ BGA `'3+'`（仅元数据） |
| A142 Cordmaker | reed-bank 触发 + owner 强制 / opponent 可选 XOR | scope `any` + isOwner 判断正确 |
| A153 PigOwner | 首次 5 头猪触发，flag-once | anytime listener + `isCardFlagged` 一致 |
| B153 Housemaster | smallest-value-doubled + A60 OrientalFireplace 特例 | 包括 `min===1` 时才纳入 OrientalFireplace 的 BGA 特殊规则 |
| B159 LieutenantGeneral | round 14 用 grain；相邻判断 | 用 `triggerPlayer.fields.length >= 2` 启发式（依赖我们 plow 强制相邻规则） |
| C137 CharcoalBurner | 任意玩家打/造 bake 改良 → 1 wood + 1 food | scope `any` + `isBaking` 检测 |
| D29 MuckRake | unfenced stable 各动物 1 VP | 依赖 `stableAnimals` 仅含 unfenced 单格的现有数据约定 |
| D150 GodlySpouse | 第二个 farmer 打 family growth → 召回第一个 | `getRoundPlacementOrder().length === 2` 与 BGA `countPlacedFarmers()==2` 等价 |
| E101 Blighter | `14 - round` × scoreMap，且禁用后续 occupation | scoreMap 一致 + isDoable 阻断 |
| E144 WaresSalesman | "可把建材换 food 的卡"列表 | 4 类硬编码列表与 BGA 完全一致 |
| E154 Margrave | 任意玩家翻新 + 自己住石屋 → 2 food | 触发条件、计分一致 |
| E156 ClaypitOwner | 对手打/造印刷 clay 成本改良 → 1 food + 1 clay | 印刷成本检测覆盖 minor + major（含复合成本 fees） |
| A87 Conservator | 木屋玩家可在 House Redevelopment 上选直跳 stone（XOR） | computeReplace+isDoable 双 listener；A143/A123 走 `appliesTo:['renovation']` cost-type modifier 自动生效；D154 actionId 监听器也会命中，但其 clay-only 守卫（§2.3）当前屏蔽 wood→stone |

### 2.2 🟡 简化实现（10 张）

> 简化原因写在各卡 `.ts` 文件顶部注释中。回归 BGA 完整规则需要的基础设施列在最后一列。

| 卡牌 | 简化内容 | 完整规则需要 |
|---|---|---|
| A3 PaperKnife | 跳过"选 3 再随机 1"中间步骤；onBuy 直接从整手随机选 1 免费打 | `select-N-from-hand` pending 类型 |
| A48 ShavingHorse | 只监听 `gain`（限 `copse`/`forest`/`grove`/`resource-market-4`）+ `collect`；缺 `receive`/`reap`/exchange-after 触发 | 通用 "wood-obtained" hook 或 `after:gain` 全资源监听 |
| B3 Moonshine | XOR 折叠为"买不起则 PASS"（自动抉择） | `select-N-from-hand` + pass-to-opponent action |
| C22 BasketChair | 每轮开始提供一次额外 place-farmer，不召回已放农民 | 新 farmer-recall-to-card 机制 |
| C150 ParrotBreeder | 仅保留 anytime 激活信号（付 1 谷 → 得 1 谷）；对手行动追踪未实现 | 跨玩家状态 + 动态 computeArgs-place-farmer |
| D95 SiteManager | 贪心：短缺时才用食物替换建材 | 支付路径支持组合选择（2^N trade combinations） |
| D102 / E76 | 跳过 FarmHand 分支 | B85 模型需独立 FarmHand 马厩 tile |
| E16 BriarHedge | 围栏前提已加，但"每边免木"未实现 | 重写 `fencing.ts` 支持按边计费 |
| E96 Elder | 回合 1 StartOfWork 额外打出职业未实现 | 新 `stStartOfTurn allowedCards` hook |
| E125 DelayedWayfarer | 额外放置延后到下轮开始（非本轮末） | end-of-placements 信号 hook |

### 2.3 ⚠ 行为偏差待修（3 张）

> 不是设计取舍，是 bug——只是修起来需要动一点架构 / action-space 配置。

| Card | 偏差 | 影响 | 建议 |
|---|---|---|---|
| B143 ClayWarden | 只监听 `hollow-4`（仅 4 人空间）；3 人版 `hollow` action 空间在我们项目里整个缺失 | 3 人局：B143 永不触发（且整局没 Hollow 空间） | 新增 `hollow` 3 人版 action 空间；B143 listener 同步加 `hollow` |
| C129 SecondSpouse | 我们只检查"对方占用"；BGA 还要求"占用者是其本人**第一个**放的 farmer 且占用人数 ≤2" | 我们更宽松——对方第二/三人占的也允许抢；轻微规则违规 | listener handler 加占用者来源判断（需要 `placedFarmers` 顺序信息） |
| D154 ChimneySweep | 我们限制 `houseType === 'clay'` 才减 2 stone；BGA 不区分 | wood→stone 直接跳级翻新（A87 Conservator 等卡）减免不生效 | 去掉 `houseType` 条件；保持 `costs: { stone: -2 }` 始终返回 |

### 2.4 ❌ 数值/元数据待修（7 张）

> 卡牌**入场成本**、**前置条件**或**基础 vp** 与 BGA 不同——直接影响经济与可玩性，优先级最高。

| Card | BGA cost / prereq / vp | 我们 cost / prereq / vp | 备注 |
|---|---|---|---|
| B39 Loom | `wood: 2`；prereq `2 Occupations`；vp: 1 | `wood: 1, reed: 1`；无 prereq；vp: 1 | 成本错位 + 缺 prereq |
| D31 Storeroom | `wood: 1, stone: 2`；vp: 1 | `reed: 1`；无 vp | 整段成本错位 |
| D33 SummerHouse | `wood: 3, stone: 1`；prereq "Still in Wooden House" | `wood: 1, stone: 1`；prereq "Still in Wooden House" | 木材数量错 |
| D34 LuxuriousHostel | `wood: 1, clay: 2`；无 prereq | `stone: 1, food: 3`；prereq "Stone House" | 整张错；多了一个错的 prereq |
| D35 FodderChamber | `stone: 3, grain: 3`；vp: 2 | `wood: 1, clay: 1`；无 vp | 整段成本错位 |
| D38 MilkingStool | `wood: 1`；prereq `2 Occupations` | `wood: 1`；无 prereq | 行为已对齐，仅缺 prereq 元数据 |
| D60 LargePottery | `clay: 1, stone: 1` + 返还 `Major_Pottery`；vp: 3 | `clay: 2`；无 return-card 机制 | 缺 `returnCards` 字段 + return-major-card 通用机制 |

> 修这些卡之前先确认我们的 cost shape 能否表达 `returnCards`、`vp` 等字段（参见 `shared/cards/types.ts`）。
> Storeroom / Hostel / FodderChamber / LargePottery 的 `vp` 字段缺失，需扫一遍所有 P 类卡是否系统性遗漏。

### 2.5 🔀 刻意偏离 BGA（5 张）

> 这些卡 desc 与 BGA 一致，但实现选择刻意偏离 BGA 行为。每张都需写明**为什么不同**和**回归 BGA 的代价**。
>
> **不要**把这些当作 bug 修。改这些之前先开 issue / 跟 owner 确认。

| 卡牌 | BGA 行为 | 我们的行为 | 偏离原因 | 回归 BGA 的代价 |
|---|---|---|---|---|
| A25 Bassinet | "首次使用非累积空间且空间上只剩 1 个人（含新生儿）"——基于 *space occupancy* 跨玩家追踪 | 转译为"本回合第一个 place-farmer 之后接 family growth"——基于 *自己回合内的 action 计数* | 跨玩家+空间状态追踪需要新 hook 点；当前简化语义在 2P 场景下差异极小 | 新增 `space-empty-after-place` 监听；改 listener 模型 |
| B30 WoodPalisades | 在围栏 tile 上叠 2 木（替代 1 fence），按 fence-space 计 1 分 | 当前数据 desc 与 BGA 同步，但围栏数据模型仍按"fence count"，未实现"木代替 fence" | 围栏数据结构改造（`PastureFence` 加 token/wood 类型）影响整套 fencing 算法 | 重写 `shared/game/fences.ts` + scoring + UI 渲染 |
| B38 FutureBuildingSite | 在所有其它格子用完前，禁用紧贴房屋的正交相邻格 | 故意简化：未做"邻接禁用" | 需要 placement 阶段全局可用性裁定，影响 `place-farmer` 的 `isDoable` | `isDoable` 加一个 placement 几何裁定 hook |
| B132 EstateMaster | "用完所有 farmyard 格"后每个 harvest 蔬菜 +1 VP | 故意简化：长效条件未严格判断 | "无 unused farmyard" 状态需要每回合扫描，且与 D33/B38 类条件需统一抽象 | 抽象 `onFarmyardSaturationChange` hook |
| D161 CabbageBuyer | 按改良类型 3/2/1 售价 | 固定 2 食物 | 改良分类未对外暴露；BGA 内部走 cardType 字符串匹配 | 暴露 `card.subtype` 给 listener，或加 helper |

> **历史记录**：~~E132 VeggieLover~~ 之前被误标为"刻意不同"。实际上它是 BGA 3+ 人卡（不是 5+），desc 与行为（harvest 1G+1V→6F、scoring 1/2/3 stack→2/4/6 VP）都已与 BGA 对齐。2026-04-17 移除。

### 2.6 ⏳ 待实现 / 待评估（4 张）

#### Tier 1 — BGA 自身无逻辑，我们也无逻辑（数据 only）

| Card | 类型 | BGA 状态 | 我们的处理 | 优先级 |
|---|---|---|---|---|
| A113 Heresy Teacher | Occupation | `isImplemented=false` | 数据-only，匹配 BGA | LOW |
| D25 Witches Dance Floor | Minor | `isImplemented=false` | 多身份卡（field+occupation+improvement），架构级改动 | LOW |
| D159 Reed Seller | Occupation | `isImplemented=false` | 需要"可阻止行动 + 拍卖式选择"系统 | LOW |

#### Tier 2 — BGA 有完整实现，我们仍缺

| Card | 类型 | BGA 关键点 | 我们的状态 | 优先级 |
|---|---|---|---|---|
| E149 Midnight Fencer | Occupation | `StartHarvest` listener，第 14 轮跨玩家拿围栏，可超过 15 上限 | 未做；最复杂剩余 | MED-HIGH |

> `D155_Ebonist`、`D103_CanalBoatman`、`E93_Motivator` 已于 2026-04-17 收口。

---

## 3. 基础设施清单（已落地）

| 设施 | 状态 | 说明 |
|---|---|---|
| PlayerActionCard 行动格 | ✅ | 11 张卡，含 owner 显示、meeple 渲染 |
| `onComputeAnimalZones` | ✅ | 动物容量修改器 |
| `CardExchange` + `exchange-registry` | ✅ | 烹饪/交换改良 |
| `computeBonusScore` | ✅ | 45+ 张计分卡 |
| Anytime 动作系统 | ✅ | CardListener `phases: ['anytime']` |
| Holder / Counter / Stack | ✅ | 资源堆叠两种模式 |
| `queueFutureMeeplesFlow` | ✅ | Future meeples 两种形式 + remove |
| 对手交互 (`scope: 'opponent'`) | ✅ | 8 张卡覆盖 4 种模式 |
| `field-select` farm interaction | ✅ | 第 6 种 farm interaction type |
| PlayerSwitch in ActionFlow | ✅ | `deferredPlayerSwitch` |
| `resourcesPaid` 追踪 | ✅ | `pay-resources` 返回实际支付 |
| `computeReplace` + decline | ✅ | day-laborer / A94 / D21 等 |
| `onGainResource` (after:gain) | ✅ | E103_Wolf 等 |
| `onEndTurn` 阶段 hook | ✅ | person-action turn 收束点 |
| `PrerequisiteHandler(player, state?)` | ✅ | 2026-04-17 扩展了 state 参数（C32 全局检查需要） |
| `stable-removal` helper | ✅ | D102 / E76 |
| `recall-placed-worker` action | ✅ | D93（通用农民回收） |
| `discard-from-hand` action | ✅ | B146（通用弃手牌） |

---

## 4. 实现进度时间线

| 批次 | 日期 | 新增 hooks | 累计 | 累计率 |
|---|---|---|---|---|
| 1+2 | 04-15 | +134 | 325 | 36.4% |
| 3 | 04-15 | +72 | 397 | 44.5% |
| 4 | 04-15 | +56 | 453 | 50.8% |
| 5 | 04-15 | +34 | 487 | 54.6% |
| 6 | 04-15 | +39 | 526 | 59.0% |
| 7 | 04-15 | +24 | 550 | 61.7% |
| 8 | 04-15 | +15 | 565 | 63.3% |
| 9 | 04-15 | +22 | 587 | 65.8% |
| 10 | 04-16 | +10 | 597 | 66.9% |
| 11 | 04-16 | +18 | 615 | 68.9% |
| 12 | 04-16 | +15 | 630 | 70.6% |
| 13 | 04-16 | +71 | 701 | 78.6% |
| 14 | 04-16 | +5 | 706 | 79.1% |
| 15 | 04-16 | +23 | 729 | 81.7% |
| 16 w1 | 04-16 | +13 | 742 | 83.2% |
| misc + A19/A89 | 04-16/17 | +17 | 759 | 85.1% |
| Wave 1 listener | 04-17 | +21 | 780 | 87.4% |
| Wave 2 modifier/prereq | 04-17 | +9 | 789 | 88.5% |
| Wave 3 compute-cost | 04-17 | +5 | 794 | 89.0% |
| Wave 4 chain-action | 04-17 | +3 | 797 | 89.4% |
| Wave 5 tier-2 low | 04-17 | +6 | 803 | 90.0% |
| Wave 6 farmer-recall + goods | 04-17 | +2 | 805 | 90.2% |
| Wave 7 card-select | 04-17 | +2 | 807 | 90.5% |
| Wave 8 high-complexity | 04-17 | +3 | 810 | 90.8% |
| D155 exchanges fixup | 04-17 | +1 | 811 | 90.9% |
| Wave 9 + desc align | 04-17 | +6 | 817 | 91.6% |

### 2026-04-17 Wave 1-9 明细

- **Wave 1 (+21):** A42 · A43 · A111 · A124 · B18 · B51 · B63 · B120 · B121 · B122 · B156 · B161 · C26 · C28 · C117 · C140 · C154 · C160 · D21 · D134 · E3
- **Wave 2 (+9):** A10 · C10 · C32 · D11 · D37 · D85 · E16 · E29 · E96
- **Wave 3 (+5):** A27 · B155 · C95 · D95 · E109
- **Wave 4 (+3):** B130 · B150 · B152
- **Wave 5 (+6):** C23 · D22 · D27 · D102 · E76 · B3
- **Wave 6 (+2):** D93 · D137
- **Wave 7 (+2):** A3 · B146
- **Wave 8 (+3):** C22 · C150 · E125
- **Wave 9 (+6):** A41 · A85 · A106 · D103 · E68 · E93

---

## 5. 状态符号

§2 分类表使用以下符号：

- ✅ **完全对齐** — 行为与元数据均与 BGA 一致（§2.1）
- 🟡 **简化实现** — 主路径工作，分支未做；缺啥基础设施有写明（§2.2）
- ⚠ **行为偏差待修** — 不是设计取舍，是 bug，只是修起来要动架构（§2.3）
- ❌ **数值/元数据待修** — cost / prereq / vp 与 BGA 不同（§2.4）
- 🔀 **刻意偏离 BGA** — owner 签字过的设计差异，**不要当 bug 修**（§2.5）
- ⏳ **待实现 / 待评估** — 数据-only 或核心扩展（§2.6）

实现清单以 `shared/cards/catalog.ts` 的 `minorImprovementCards` / `occupationCards` 数组为准；
具体 hook 注册在各 `shared/cards/{Deck}/{CardId}_{Name}.ts` 文件内。

---

## 6. 文档维护规则

- **本文件是卡牌实现进度的唯一权威来源。** 不要再创建 `cards_impl.md` / `IMPLEMENTATION_STATUS.md` 等并行文档。
- 任何卡牌相关 commit（包括但不限于：实现新卡、改 desc、调 hook、删/改测试、改通用机制并影响某类卡）都必须**同步**改本文件，至少：
  - 在 §2.0 加一行说明本次变更
  - 把对应卡片在 §2.1–§2.6 之间迁出 / 迁入 / 更新状态
  - 必要时更新 §1 总览数字
  - 必要时把新加的通用机制加进 §3 基础设施
- desc 文案级的对齐审计走 `docs/card_desc_audit.md`，不在本文件展开。
