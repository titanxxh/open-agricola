# 卡牌实现进度

基于 BGA 参考项目（`../bga-agricola`）的完整对比。本文档是**唯一**的卡牌实现进度追踪源，
覆盖：覆盖率、剩余工作、刻意简化、刻意不同、BGA 行为复核 TODO、时间线。

> 配套文档：`docs/card_desc_audit.md` 仅做 BGA `$this->desc` 文案对齐审计；行为/实现差异统一在本文件追踪。
>
> **维护规则（见 `AGENTS.md`）**：每次改完卡牌相关代码（无论是新实现、修 bug、改简化、改 desc、改 AI behavior、调整 hook），都必须把对应条目更新到本文件，并写明日期 / 批次 / 变更摘要。

---

## 1. 总览

| Deck | BGA 总数 | 已实现 | BGA 也无逻辑（数据 only） | BGA 有逻辑我们漏实现 | 需核心扩展 |
|---|---|---|---|---|---|
| A | 180 | 156 | 5 | 0 | 0 |
| B | 180 | 158 | 0 | 0 | 0 |
| C | 182 | 157 | 0 | 0 | 0 |
| D | 181 | 157 | 2 | 1 | 0 |
| E | 169 | 159 | 0 | 2 | 1 |
| **总计** | **892** | **817** | **7** | **3** | **1** |

**截至 2026-04-17：817/892 = 91.6%。**

> Major Improvements (10 张) 单独实现，不计入上表，全部已落地。
> 5+ 人卡（169-180 号段，~48 张）BGA 自身 `isImplemented=false`，不计入 BGA 总数。
> 若干卡通过静态 `modifier`/`modifiers`/`exchanges`/`scoreRule` 字段实现，视为已实现（例：A14, A60, A88, A123, B32, B80, B104, B145, C13, C14, D59, E153 等）。

---

## 2. 当前轮次进度

### 2026-04-17 Wave 9 已补完（6 张）

- `A41_VegetableSlicer`
- `A85_Homekeeper`
- `A106_SlurrySpreader`
- `D103_CanalBoatman`
- `E68_CherryOrchard`
- `E93_Motivator`

> 本轮明确延后到后续批次：`A87_Conservator`、`E149_MidnightFencer`。

### 2026-04-17 desc 对齐 / 命名修复

- 全量 BGA `$this->desc` ↔ 我们 `desc` 文案审计：`895/902` 已对齐（详见 `docs/card_desc_audit.md`）。
- `A159_JoinerOfSea` → `A159_JoineroftheSea` 改名对齐 BGA。

---

## 3. 剩余 5 张卡牌（待实现 / 待评估）

### Tier 1 — BGA 自身无逻辑，我们也无逻辑（数据 only）

| Card | 类型 | BGA 状态 | 我们的处理 | 优先级 |
|---|---|---|---|---|
| A87 Conservator | Occupation | 仅 `__construct` | 已落地内部动作 `renovate-house-to-stone`；未接 `computeReplace` / `computeCosts` 入口 | MED — 下一批可收口 |
| A113 Heresy Teacher | Occupation | `isImplemented=false` | 数据-only，匹配 BGA | LOW |
| D25 Witches Dance Floor | Minor | `isImplemented=false` | 多身份卡（field+occupation+improvement），架构级改动 | LOW |
| D159 Reed Seller | Occupation | `isImplemented=false` | 需要"可阻止行动 + 拍卖式选择"系统 | LOW |

### Tier 2 — BGA 有完整实现，我们仍缺

| Card | 类型 | BGA 关键点 | 我们的状态 | 优先级 |
|---|---|---|---|---|
| E149 Midnight Fencer | Occupation | `StartHarvest` listener，第 14 轮跨玩家拿围栏，可超过 15 上限 | 未做；最复杂剩余 | MED-HIGH |

> `D155_Ebonist`、`D103_CanalBoatman`、`E93_Motivator` 已于 2026-04-17 收口。

---

## 4. 刻意简化（已实现，但某些分支未做）

> 简化原因写在各卡 `.ts` 文件顶部注释中。回归 BGA 完整规则需要的基础设施列在最后一列。

| 卡牌 | 简化内容 | 完整规则需要 |
|---|---|---|
| A3 PaperKnife | 跳过"选 3 再随机 1"中间步骤；onBuy 直接从整手随机选 1 免费打 | `select-N-from-hand` pending 类型 |
| B3 Moonshine | XOR 折叠为"买不起则 PASS"（自动抉择） | `select-N-from-hand` + pass-to-opponent action |
| D95 SiteManager | 贪心：短缺时才用食物替换建材 | 支付路径支持组合选择（2^N trade combinations） |
| E16 BriarHedge | 围栏前提已加，但"每边免木"未实现 | 重写 `fencing.ts` 支持按边计费 |
| E96 Elder | 回合 1 StartOfWork 额外打出职业未实现 | 新 `stStartOfTurn allowedCards` hook |
| C22 BasketChair | 每轮开始提供一次额外 place-farmer，不召回已放农民 | 新 farmer-recall-to-card 机制 |
| C150 ParrotBreeder | 仅保留 anytime 激活信号（付 1 谷 → 得 1 谷）；对手行动追踪未实现 | 跨玩家状态 + 动态 computeArgs-place-farmer |
| E125 DelayedWayfarer | 额外放置延后到下轮开始（非本轮末） | end-of-placements 信号 hook |
| D102 / E76 | 跳过 FarmHand 分支 | B85 模型需独立 FarmHand 马厩 tile |

---

## 5. 刻意不同（与 BGA 实现意图分歧）

> 这些卡的 desc 文案与 BGA 一致，但实现选择刻意偏离 BGA 行为。每张都需写明**为什么不同**，
> 以及未来要回归 BGA 行为时的代价。
>
> **不要**把这些当作 bug 修。改这些之前先开 issue / 跟 owner 确认。

| 卡牌 | BGA 行为 | 我们的行为 | 偏离原因 | 回归 BGA 的代价 |
|---|---|---|---|---|
| A25 Bassinet | "首次使用非累积空间且空间上只剩 1 个人（含新生儿）"——基于 *space occupancy* 跨玩家追踪 | 转译为"本回合第一个 place-farmer 之后接 family growth"——基于 *自己回合内的 action 计数* | 跨玩家+空间状态追踪需要新 hook 点；当前简化语义在 2P 场景下差异极小 | 新增 `space-empty-after-place` 监听；改 listener 模型 |
| B30 WoodPalisades | 在围栏 tile 上叠 2 木（替代 1 fence），按 fence-space 计 1 分 | 当前数据 desc 与 BGA 同步，但围栏数据模型仍按"fence count"，未实现"木代替 fence" | 围栏数据结构改造（`PastureFence` 加 token/wood 类型）影响整套 fencing 算法 | 重写 `shared/game/fences.ts` + scoring + UI 渲染 |
| B38 FutureBuildingSite | 在所有其它格子用完前，禁用紧贴房屋的正交相邻格 | 故意简化：未做"邻接禁用" | 需要 placement 阶段全局可用性裁定，影响 `place-farmer` 的 `isDoable` | `isDoable` 加一个 placement 几何裁定 hook |
| B132 EstateMaster | "用完所有 farmyard 格"后每个 harvest 蔬菜 +1 VP | 故意简化：长效条件未严格判断 | "无 unused farmyard" 状态需要每回合扫描，且与 D33/B38 类条件需统一抽象 | 抽象 `onFarmyardSaturationChange` hook |
| D161 CabbageBuyer | 按改良类型 3/2/1 售价 | 固定 2 食物 | 改良分类未对外暴露；BGA 内部走 cardType 字符串匹配 | 暴露 `card.subtype` 给 listener，或加 helper |
| E132 VeggieLover | BGA 5+ 人卡（`implemented=false`） | 我们重写为"通用蔬菜爱好者"，desc/实现都自定义 | BGA 自身没实现；我们把它当作可玩内容自行设计 | 不打算回归——保留我们的版本，但需要 desc 文案与代码长期一致 |

> 这张表 = `card_desc_audit.md` 之前的 "Architectural deferrals" 章节，已迁出到本文件。

---

## 6. BGA desc 已对齐，但实现需逐项复核（23 张）

> `card_desc_audit.md` 只验证了 desc 文本相等，**不**验证实现真的覆盖 desc 描述的所有分支。
> 下列卡是已知"desc 一致但实现可能漏分支"的候选，每次回归这部分时把状态打 ✅ 或迁到上面"刻意简化"表。

| Card | 待复核要点 | 状态 |
|---|---|---|
| A48 ShavingHorse | "5+ optional / 7+ mandatory" 阈值 | 未复核 |
| A101 CookeryOutfitter | 排除 Ovens 分支 | 未复核 |
| A134 FullFarmer | 入场 `1 <WOOD>` + `1 <CLAY>` | 未复核 |
| A142 Cordmaker | "buy 1 veg for 2 food" 收费分支 | 未复核 |
| A153 PigOwner | "first time you have 5 after play" 触发时机 | 未复核 |
| B39 Loom | harvest 阶梯食物（1/4/7 sheep → 1/2/3 food） | 未复核 |
| D38 MilkingStool | harvest 阶梯食物（1/3/5 cattle → 1/2/3 food） | 未复核 |
| B143 ClayWarden | 3/4 人数 +1 clay/food | 未复核 |
| B153 Housemaster | "smallest value counts double" | 未复核 |
| B159 LieutenantGeneral | round 14 例外（grain 替代） | 未复核 |
| C129 WetNurse | round 12-13 限制窗口 | 未复核 |
| C137 Baker | bake-improvement 触发面 | 未复核 |
| D29 MuckRake | "exactly 1 per animal type, different stables" | 未复核 |
| D31 Storeroom | `½ per pair rounded up` | 未复核 |
| D33 SummerHouse | 仍扣未用空格分 | 未复核 |
| D34 LuxuriousHostel | stone-house bonus 仅一张 | 未复核 |
| D35 FodderChamber | 人数阶梯 | 未复核 |
| D60 LargePottery | `[Anytime] <CLAY> → 2<FOOD>` | 未复核 |
| D150 GodlySpouse | mandatory vs optional | 未复核 |
| D154 ChimneySweep | "Renovating to stone costs 2 stone less" | 未复核 |
| E101 Blighter | "complete stages left" 计算口径 | 未复核 |
| E144 WaresSalesman | "cards that turn resources to food" 范围 | 未复核 |
| E154 Margrave | "2 food each time any player renovates" | 未复核 |
| E156 ClaypitOwner | "or builds" 触发面 | 未复核 |

---

## 7. 基础设施清单（已落地）

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

## 8. 实现进度时间线

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

## 9. 状态符号

- ✅ **已实现** — 注册了 `registerCardEffect` / `registerCardListener`，或 card 定义中含有效的 `modifier/modifiers/exchanges/scoreRule/isBaking/isCookery/counters/stack` 字段
- 🟡 **已实现但简化** — 核心效果工作，但某些分支/精确规则未实现（见第 4 节）
- ⏸ **数据-only（Tier 1）** — BGA 参考也无逻辑，保留数据即符合行为（见第 3 节 Tier 1）
- ⏸ **待核心类型扩展（Tier 3）** — 目前为空（E68 已实现）
- ❓ **未复核** — desc 与 BGA 一致，但实现细节未做一致性检查（见第 6 节）

实现清单以 `shared/cards/catalog.ts` 的 `minorImprovementCards` / `occupationCards` 数组为准；具体 hook 注册在各 `shared/cards/{Deck}/{CardId}_{Name}.ts` 文件内。

---

## 10. 文档维护规则

- **本文件是卡牌实现进度的唯一权威来源。** 不要再创建 `cards_impl.md` / `IMPLEMENTATION_STATUS.md` 等并行文档。
- 任何卡牌相关 commit（包括但不限于：实现新卡、改 desc、调 hook、删/改测试、改通用机制并影响某类卡）都必须**同步**改本文件，至少：
  - 在 §2 加一行说明本次变更
  - 把对应卡片从 §3 / §4 / §5 / §6 中迁出或更新状态
  - 必要时更新 §1 总览数字
  - 必要时把新加的通用机制加进 §7 基础设施
- desc 文案级的对齐审计走 `docs/card_desc_audit.md`，不在本文件展开。
