# 卡牌实现进度

基于 BGA 参考项目 (`../bga-agricola`) 的完整对比。实现的权威来源是 `shared/cards/catalog.ts` + 各 `.ts` 文件。本文档只追踪覆盖率与剩余工作。

## 总览

| Deck | BGA 总数 | 已实现 | 剩余 (BGA 无逻辑) | 剩余 (需基础设施) |
|---|---|---|---|---|
| A | 180 | 153 | 5 | 0 |
| B | 180 | 158 | 0 | 0 |
| C | 182 | 157 | 0 | 0 |
| D | 181 | 155 | 4 | 0 |
| E | 169 | 157 | 2 | 1 |
| **总计** | **892** | **810** | **11** | **1** |

**截至 2026-04-17：810/892 = 90.8%，2063 vitest tests passing。**

> Major Improvements (10 张) 单独实现，不计入上表。
> 5+ 人卡（169-180 号段，~48 张）BGA 自身 `isImplemented=false`，不计入 BGA 总数。
> 若干卡通过静态 `modifier`/`modifiers`/`exchanges`/`scoreRule` 字段实现，视为已实现（例：A14, A60, A88, A123, B32, B80, B104, B145, C13, C14, D59, E153 等）。

## 剩余工作（12 张）

### Tier 1：BGA 无逻辑，保留数据即可（11 张）

这些卡 BGA PHP 只有 `getDesc`，无任何 listener/onBuy/args-act。保留数据即符合参考行为。

A41 VegetableSlicer · A85 Homekeeper · A87 Conservator · A106 SlurrySpreader · A113 HeresyTeacher
D25 WitchesDanceFloor · D103 CanalBoatman · D155 Ebonist · D159 ReedSeller
E93 Motivator · E149 MidnightFencer

### Tier 3：需核心类型扩展（1 张）

**E68 CherryOrchard** — 需在 `shared/game/types.ts` 给 `Field.crop` 新增 `'wood'` 作物类型，并扩展 sow/reap/field-harvest pipeline。单卡改动过深，暂缓。

---

## 已知简化

部分复杂卡采取了合理简化实现，简化内容记录在各卡文件顶部注释中：

| 卡牌 | 简化内容 | 需要什么才能做到 BGA 完整规则 |
|---|---|---|
| A3 PaperKnife | 跳过"选 3 再随机 1"中间步骤，onBuy 直接从整手随机选 1 免费打 | `select-N-from-hand` pending type |
| B3 Moonshine | XOR 折叠为"买不起则 PASS"（自动抉择） | 同上 + pass-to-opponent action |
| D95 SiteManager | 贪心：短缺时才用食物替换建材 | 支付路径支持组合选择（2^N trade combinations） |
| E16 BriarHedge | 围栏前提已加，但"每边免木"未实现 | 重写 `fencing.ts` 支持按边计费 |
| E96 Elder | 回合 1 StartOfWork 额外打出职业未实现 | 新 `stStartOfTurn allowedCards` hook |
| C22 BasketChair | 每轮开始提供一次额外 place-farmer，不召回已放农民 | 新 farmer-recall-to-card 机制 |
| C150 ParrotBreeder | 仅保留 anytime 激活信号（付 1 谷 → 得 1 谷），对手行动追踪未实现 | 跨玩家状态 + 动态 computeArgs-place-farmer |
| E125 DelayedWayfarer | 额外放置延后到下轮开始（非本轮末） | end-of-placements 信号 hook |
| D102 / E76 | 跳过 FarmHand 分支 | B85 模型需独立 FarmHand 马厩 tile |

---

## 基础设施清单

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

## 实现进度（时间线）

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

### 2026-04-17 Wave 1-8 明细

**Wave 1 (+21):** A42 · A43 · A111 · A124 · B18 · B51 · B63 · B120 · B121 · B122 · B156 · B161 · C26 · C28 · C117 · C140 · C154 · C160 · D21 · D134 · E3
**Wave 2 (+9):** A10 · C10 · C32 · D11 · D37 · D85 · E16 · E29 · E96
**Wave 3 (+5):** A27 · B155 · C95 · D95 · E109
**Wave 4 (+3):** B130 · B150 · B152
**Wave 5 (+6):** C23 · D22 · D27 · D102 · E76 · B3
**Wave 6 (+2):** D93 · D137
**Wave 7 (+2):** A3 · B146
**Wave 8 (+3):** C22 · C150 · E125

---

## 状态说明

- ✅ **已实现** — 注册了 `registerCardEffect` / `registerCardListener`，或 card 定义中含有效的 `modifier/modifiers/exchanges/scoreRule/isBaking/isCookery/counters/stack` 字段
- 🟡 **已实现但简化** — 核心效果工作，但某些分支/精确规则未实现（见"已知简化"表）
- ⏸ **数据-only（Tier 1）** — BGA 参考也无逻辑，保留数据即符合行为
- ⏸ **待核心类型扩展（Tier 3）** — E68 唯一一张，暂缓

实现清单以 `shared/cards/catalog.ts` 的 `minorImprovementCards` / `occupationCards` 数组为准；具体 hook 注册在各 `shared/cards/{Deck}/{CardId}_{Name}.ts` 文件内。
