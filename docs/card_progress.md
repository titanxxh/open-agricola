# 卡牌实现进度追踪

基于 BGA 参考项目 (`../bga-agricola`) 的完整对比。

## 总览

| | BGA 总数 | 已实现 Hook | 仅数据 | 无文件 | 5+人卡(BGA未实现) |
|---|---|---|---|---|---|
| A Deck | 180 | 47 | 29 | 104 | 12 |
| B Deck | 180 | 25 | 22 | 133 | 12 |
| C Deck | 182 | 37 | 26 | 119 | 12 |
| D Deck | 181 | 44 | 26 | 111 | 12 |
| E Deck | 169 | 38 | 31 | 100 | 0 |
| **总计** | **892** | **191** | **134** | **567** | **48** |

> Major Improvements (10张) 已全部实现，不计入上表。
> 截至 2026-04-14 更新。848 tests passing。

## 未实现卡牌总结（701 张）

### 按效果模式分类

不区分有无文件，统一按卡牌运行时行为模式分类：

| 批次 | 效果模式 | 数量 | 难度 | 基础设施 |
|---|---|---|---|---|
| 1 | 纯数据/无逻辑 + 交换/计分 | 29 | 零~极低 | ✅ |
| 2 | 一次性购买效果 (onBuy) | 142 | 低 | ✅ |
| 3 | 单事件监听：PlaceFarmer 触发 | 63 | 低-中 | ✅ |
| 4 | 单事件监听：AfterCollect + After 行动 | 55 | 低-中 | ✅ |
| 5 | 单事件监听：Harvest 各阶段 | 37 | 低-中 | ✅ |
| 6 | 单事件监听：回合/工作阶段触发 | 59 | 低-中 | ✅ |
| 7 | 单事件监听：Compute 修改器 | 17 | 低-中 | ✅ |
| 8 | 费用修改器 (computeCosts) | 25 | 中 | ✅ |
| 9 | Anytime 动作 | 20 | 中 | ✅ |
| 10 | 动物容量扩展 (computeDropZones) | 10 | 中 | ✅ |
| 11 | 资源存储/释放 (holder/stack) | 19 | 中 | ✅ |
| 12 | 收获阶段特殊 | 15 | 中 | ✅ |
| 13 | 多事件监听 | 52 | 中-高 | ✅ |
| 14 | 玩家选择交互 (SPECIAL_EFFECT) | 18 | 中-高 | 部分需新增 |
| 15 | 对手交互 | 23 | 中-高 | ✅ |
| 16 | 流程替换/特殊机制 | ~28 | 高 | 部分需新增 |
| 17 | Anytime 交换/静态 | 10 | 低 | ✅ |

### 推荐实现顺序

| 批次 | 效果模式 | 数量 | 累计实现数 | 累计率 | 理由 |
|---|---|---|---|---|---|
| 1 | 纯数据 + 交换/计分 | 29 | 220 | 24.7% | 零/极低难度，创建文件或加 exchanges 即完成 |
| 2 | 一次性购买效果 | 142 | 362 | 40.6% | 统一 onBuy 模式，5-15 行/张，BGA 直接翻译 |
| 3 | 单事件监听：PlaceFarmer | 63 | 425 | 47.6% | 最常见事件类型，放农民到行动格时触发 |
| 4 | 单事件监听：AfterCollect + After 行动 | 55 | 480 | 53.8% | 行动完成后触发，模式统一 |
| 5 | 单事件监听：Harvest 阶段 | 37 | 517 | 58.0% | 收获各子阶段触发，需按阶段分组测试 |
| 6 | 单事件监听：回合/工作阶段 | 59 | 576 | 64.6% | StartOfTurn/ReturnHome/EndWorkPhase 等 |
| 7 | 单事件监听：Compute 修改器 + Anytime 交换 | 27 | 603 | 67.6% | ComputeCardCosts/DropZones/Args 等 |
| 8 | 费用修改器 | 25 | 628 | 70.4% | computeCosts hook，模式统一 |
| 9 | Anytime 动作 | 20 | 648 | 72.6% | phases: ['anytime']，每张需独立 handler |
| 10 | 动物容量扩展 | 10 | 658 | 73.8% | computeDropZones/onComputeAnimalZones |
| 11 | 资源存储/释放 | 19 | 677 | 75.9% | counters/stack 管理，需跨回合状态 |
| 12 | 收获阶段特殊 | 15 | 692 | 77.6% | 修改收获/喂食/繁殖逻辑 |
| 13 | 多事件监听 | 52 | 744 | 83.4% | 2+ handler，最大复杂批次 |
| 14 | 玩家选择交互 | 18 | 762 | 85.4% | 需 ChoiceNode / SPECIAL_EFFECT 对应 |
| 15 | 对手交互 | 23 | 785 | 88.0% | opponent scope + PlayerSwitch |
| 16 | 流程替换/特殊机制 | ~28 | 813 | 91.1% | case-by-case，部分需新基础设施 |

> 批次 1-7（412 张，低-中难度）完成后实现率达 67.6%，全部基础设施已就绪。
> 批次 8-12（89 张，中难度）完成后实现率达 77.6%，模式统一可批量实现。
> 批次 13-16（121 张，中-高难度）需逐一分析，完成后实现率达 91.1%。

---

## 状态说明

- ✅ 已实现 — `registerCardEffect` / `registerCardListener` 已注册，核心逻辑可运行
- 🔧 仅数据 — 有 `.ts` 文件（名称/描述/费用/VP），但未实现 BGA 逻辑
- ❌ 无文件 — BGA 有此卡但我们尚无 `.ts` 文件
- ⬜ BGA未实现 — BGA 自身也标记为 `implemented=false`（5+人卡，A169-180, B169-180, C169-180, D169-180）

---

## 基础设施状态

所有主要基础设施均已完成：

| 基础设施 | 状态 | 说明 |
|----------|------|------|
| PlayerActionCard 行动格 | ✅ | 11 张卡已注册，含 owner 显示、meeple 渲染 |
| 动物容量修改器 | ✅ | `onComputeAnimalZones` hook，A12 已实现 |
| 烹饪/交换改良 | ✅ | `CardExchange` + `exchange-registry.ts` |
| computeBonusScore 计分 | ✅ | 45+ 张卡已实现 |
| Anytime 动作系统 | ✅ | CardListener `phases: ['anytime']` |
| Holder Card 资源堆叠 | ✅ | counters + stack 两种模式 |
| Future Meeples 扩展 | ✅ | 简单/entries 两种形式 + removeFutureMeeples |
| 对手交互机制 | ✅ | 8 张卡覆盖 4 种模式，gain-trigger-player action |
| Field Select UI | ✅ | 第 6 种 farm interaction type |
| PlayerSwitch in ActionFlow | ✅ | 懒确认机制，deferredPlayerSwitch |
| resourcesPaid 追踪 | ✅ | pay-resources 返回实际支付资源 |
| computeReplace | ✅ | 替换行动效果（day-laborer 等） |
| onGainResource (after:gain) | ✅ | 资源获取后触发（E103_Wolf） |

---

## 未实现卡牌详细分类

统一按效果模式分类，不区分有无 `.ts` 文件。

### 批次 1：纯数据 + 交换/计分（29 张）

**NO_LOGIC（22 张）— BGA 也无逻辑或逻辑在核心路径：**
A10, A41, A85, A87, A106, B10, C10, D85, E16, A113, A169-A180, B169-B180, C169-C180, D169-D180 (5+人卡构造函数only), B31(scoreOnly), C32, C105, C109, D11, D25, D37, D108, D155, D159, E29, E96, E132

**EXCHANGE_ONLY（6 张）：** E153, B32, B80, B104, C62, D162

**SCORE_ONLY（1 张）：** B31

### 批次 2：一次性购买效果（142 张）

onBuy 触发，一次性获取资源/执行行动。

**A (22):** A1, A2, A4, A5, A6, A7, A8, A9, A13, A19, A33, A36, A44, A47, A57, A69, A89, A117, A125, A135, E155, E159
**B (32):** B1, B2, B4, B5, B6, B7, B8, B9, B14, B20, B22, B33, B37, B41, B44, B45, B46, B52, B59, B66, B71, B73, B74, B78, B84, B88, B93, B96, B102, B105, B113, B119, B123, B125, B127, B141, B149, B164, B167
**C (22):** C1, C2, C3, C4, C5, C6, C7, C8, C9, C16, C38, C40, C44, C47, C50, C65, C72, C74, C77, C78, C79, C83, C108, C118, C127, C136, C139, C156, C161, C165, C166
**D (16):** D1, D2, D3, D4, D6, D9, D40, D41, D43, D44, D45, D47, D57, D62, D67, D69, D78, D91, D120, D131, D145
**E (25):** E1, E2, E3, E5, E6, E7, E8, E9, E25, E30, E36, E41, E42, E43, E44, E45, E46, E65, E76, E78, E94, E97, E98, E104, E106, E119, E120, E127, E138, E139, E145

### 批次 3-7：单事件监听（241 张）

合并所有单一 listener handler 卡，按事件类型分批。

#### 批次 3：PlaceFarmer 触发（63 张）

包含 222 张无文件 + 19 张有文件的 LISTENER_SIMPLE 卡中 PlaceFarmer 相关的。

| 触发行动格 | 数量 | 卡牌 |
|---|---|---|
| Plow/Cultivate | 6 | A18, A24, C20, C91, D90, E17 |
| Fishing | 7 | A51, A78, A138, B40, B47, B60, E55 |
| DayLaborer | 7 | B77, B87, B91, C45, C138, D147, E59 |
| GrainSeeds/VegSeeds | 8 | A67, B62, B142, B166, C90, C131, E67, E121 |
| GrainUtilization | 1 | D101 |
| Animal Market | 10 | A46, A66, A147, B92, C15, C147, D16, D164, D165, E166 |
| BeforeCollect | 7 | A91, A107, A115, A161, C76, D105, D125 |
| 其他行动格 | 13 | A52, A114, A122, A140, A155, A163, B43, B56, B64, B90, B112, D28, D83, D110, E137, E141 |

##### AfterPlaceFarmer / ImmediatelyAfter（11 张）
A168, B24, B28, B144, C82, C126, D68, D151, E19, E115, E131

#### 批次 4：AfterCollect + After 行动（55 张）

##### AfterCollect（18 张）
A15, A23, A56, A95, A103, A146, A164, B17, B131, B147, C36, C58, C102, C114, D19, D73, D140, E15

##### After 行动（after:Plow/Sow/Fencing/Stables/Construct/Renovation/Improvement/Occupation）（31 张）

| 触发事件 | 数量 | 卡牌 |
|---|---|---|
| AfterPlow | 2 | D104, E164 |
| AfterSow | 4 | C73, D58, E50, E79 |
| AfterFencing | 4 | A34, A68, D89, E108 |
| AfterStables | 2 | D168, E114 |
| AfterConstruct | 5 | A21, A93, B111, D94, D123 |
| AfterRenovation | 3 | A45, B134, D111 |
| AfterImprovement | 8 | A131, C43, D80, E18, E31, E54, E122, E146 |
| AfterOccupation | 5 | C68, D42, E89, E157, E163 |

##### AfterExchange / AfterPay / AfterRevealAction / AfterWishChildren（6 张）
A30, A63, C61 (exchange), B18 (pay), C21 (reveal), E113 (wish children)

#### 批次 5：Harvest 各阶段（37 张）

| 阶段 | 数量 | 卡牌 |
|---|---|---|
| StartHarvest | 6 | D61, D153, E61, E117, E147, E149 |
| BeforeHarvest | 3 | C92, D32, D98 |
| HarvestFieldPhase | 4 | A104, A118, B50, E107 |
| EndHarvestFieldPhase | 3 | A61, C54, C110 |
| HarvestFeedingPhase | 6 | A62, C55, D133, E39, E48, E142 |
| EndHarvestFeedingPhase | 2 | C41, D76 |
| AfterReorganize (breeding) | 2 | C71, E90 |
| AfterHarvest | 3 | B82, C34, C66 |
| EndHarvest | 3 | A145, C124, E99 |
| EndOfRound | 3 | B53, D64, D79 |

#### 批次 6：回合/工作阶段触发（59 张）

| 阶段 | 数量 | 卡牌 |
|---|---|---|
| StartOfTurn | 12 | A90, B57, B97, B114, B118, B135, C103, C159, E88, E102, E126, E152, E168 |
| BeforeStartOfTurn | 4 | B106, C111, C157, D48 |
| StartOfWork | 6 | A76, B81, C123, C125, D54, E100 |
| StartReturnHome | 9 | A35, A100, A127, A141, A151, A152, A157, C97, E20 |
| ReturnHome | 2 | B139, D52 |
| AfterWorkPhase | 1 | B140 |
| EndWorkPhase | 6 | B158, D130, D142, E23, E26, E158 |
| Preparation | 1 | A49 |
| BeforeEndOfGame | 1 | B133 |

#### 批次 7：Compute 修改器 + Anytime 交换（27 张）

##### Compute 修改器（17 张）

| 类型 | 数量 | 卡牌 |
|---|---|---|
| ComputeCardCosts | 3 | A75, B95, C27 |
| ComputeDropZones | 5 | A148, B12, B86, D86, E12 |
| ComputeArgsPlaceFarmer | 3 | A26, B129, E129 |
| ComputePlaceFarmerFlow | 4 | D138, E24, E92, E151 |
| ComputeCostsFencing | 1 | A88 |

##### Anytime 交换/静态（10 张）
B69, B157, C94, D106, E13, E14, A60, B101, D53, D59, E62

### 批次 8-12：中等复杂度效果模式

#### 批次 8：费用修改器 (computeCosts)（25 张）

修改 construct/renovation/fencing/occupation/card 费用。基础设施已有 `computeCosts` hook。

| 卡牌 | 说明 |
|---|---|
| A14 | 一次建 2+ 房时减免建材 |
| A123 | 木材替代黏土/石头 |
| C14 | 建造/翻新免芦苇 |
| E109 | Basket 费用减免 |
| E123 | 资源栈抵扣建造费用 |
| E27 | 存食物抵扣大改良 |
| A16 | 围栏费用减免 |
| A27 | 烤炉费用减免 |
| A149 | 自有行动格建房减免 |
| B13 | 木房建造减免 |
| B126 | 按材料类型减房费 |
| B128 | 翻新触发+费用减免 |
| B145 | 建造/翻新减 1 建材 |
| B155 | 职业费用减免 |
| C56 | 马厩食物+免费围栏 |
| C95 | 条件性卡牌费用减免 |
| C128 | 早期木房费用减免 |
| D13 | anytime 翻新减费 |
| D15 | 黏土房免费黏土 |
| D81 | 翻新后得石+少芦苇 |
| D95 | 条件性卡牌费用减免 |
| D117 | 木材抵扣改良费 |
| D121 | 黏土翻新/建造减费 |
| E60 | 职业费用减免 |
| E87 | 翻新费用减免+犁地 |
| E150 | 石房建造减费+行动格 |

#### 批次 9：Anytime 动作（20 张）

使用现有 `phases: ['anytime']` 基础设施。部分需要 args/act 交互。

A71, C18, C85, C87, C115, D71, E85, E91, A153, B35, B154, C46, C53, C64, C84, C101, C143, D46, D56, D87, D124, D129

#### 批次 10：动物容量扩展 (computeDropZones)（10 张）

使用 `onComputeAnimalZones` 或 `computeDropZones` 扩展动物容量。基础设施已有。

A11, A86, B11, B148, C11, C12, C89, D12, D148, E11

#### 批次 11：资源存储/释放 (holder/stack)（19 张）

卡牌存储资源，按条件释放。使用 `counters` / `stack` 基础设施。

B19, B48, B55, C19, D20, D126, E22, E51, E162, B21, D118, D156, E28, E47, E56, E110, E140, B137

#### 批次 12：收获阶段特殊（15 张）

修改收获/喂食/繁殖阶段逻辑。

E30, E36, D132, A59, B61, C49, C70, C98, D84, D113, E58, E68, E69, E70, E72, E110, E132

### 批次 13-16：高复杂度效果模式

#### 批次 13：多事件监听（52 张）

监听 2+ 不同事件，有独立 handler。最大的子类型。

A22, A40, A82, A92, B23, B124, C23, C57, C93, C130, C148, D22, D27, D93, D102, D132, D134, D137, A35, A50, A54, A77, A80, A96, A116, A120, A121, A129, A130, A139, A142, A167, B16, B25, B29, B49, B54, B58, B79, B89, B107, B108, B110, B116, B117, B160, B162, B168, C42, C80, C106, C107, C113, C116, C119, C121, C132, C145, C155, C163, C164, D39, D63, D65, D84, D96, D97, D109, D112, D113, D141, D143, D144, D146, D166, E47, E58, E66, E68, E69, E70, E72, E77, E111, E116, E118, E132, E140, E143, E165

#### 批次 14：玩家选择交互 (SPECIAL_EFFECT)（18 张）

BGA 使用 `args{X}/act{X}` 方法实现多步选择。需要 ChoiceNode 或 XOR flow 对应。

A3, A58, A72, A137, B3, B115, B146, D93, D102, D132, D137, E71, C57, D71, E22, E85

#### SPECIAL_EFFECT 卡牌分析（BGA args/act 交互模式）

BGA 的 SPECIAL_EFFECT 是一种流程节点，卡牌定义 `args{Method}()` 返回 UI 数据 + `act{Method}()` 处理玩家选择。共 ~40 张卡使用交互式 args/act 模式。

##### 按选择类型分组

**1. 田地/作物选择（17 张）— 选择 1+ 个田地进行操作**

我们已有 `field-select` farm interaction 基础设施，可直接复用。

| 卡牌 | 状态 | 操作 |
|---|---|---|
| A58 | 🔧 | 选蔬菜田收 1 菜换 3 食+1 分（ReturnHome r8/10/12） |
| A70 | ✅ | 选蔬菜田取 1 菜到仓库（EndOfRound） |
| A71 | 🔧 | 选源田(≥2作物)+目标空田，移 1 作物（anytime） |
| A84 | ✅ | 选谷田吃 1 谷作为繁殖费（ReturnHome） |
| A112 | ✅ | 选谷田额外收获（HarvestFieldPhase） |
| B115 | 🔧 | 选已播田放额外 1 作物（AfterSow） |
| B165 | ✅ | 选谷田吃 1 谷换食物（anytime） |
| C18 | 🔧 | 选种植田弃所有作物+犁 1 田（anytime） |
| C57 | 🔧 | 选蔬菜田(≥2菜)弃 1 菜→4 食（anytime） |
| C63 | ✅ | 选谷田吃 1 谷（anytime/harvest） |
| C69 | ✅ | 选正好 3 谷的田换 1 菜（anytime） |
| D70 | ✅ | 选 1-2 蔬菜田各加 1 菜（HarvestFieldPhase） |
| D71 | 🔧 | 选收获后仅 1 作物的田弃之+播种（anytime） |
| D72 | ✅ | 选田额外收获（HarvestFieldPhase） |
| E4 | ✅ | 选谷田全弃，每谷得 2 木（onBuy） |
| E71 | 🔧 | 选邻接牧场的已播田加 1 作物（AfterSow） |
| E73 | ✅ | 选≥2作物的田一次全收（HarvestFieldPhase） |
| E112 | ✅ | 选谷田跳过正常收获改从仓库拿（HarvestFieldPhase） |

> 其中 10 张已实现(✅)，8 张未实现(🔧)。未实现的可复用 `field-select` 基础设施。

**2. 数量选择（8 张）— 选一个数字 0-N**

需要简单数量选择 UI。可用 XOR flow（每个数量一个选项）或新增 `quantity-select` choice 类型。

| 卡牌 | 状态 | 操作 |
|---|---|---|
| A102 | ✅ | 选购买数量（从卡牌栈，1 食/个） |
| A136 | ✅ | 选几组建材计分（1-3 组） |
| B83 | ✅ | 选购买数量（从卡牌栈，1 黏土/个） |
| C133 | ✅ | 选几组资源计分 |
| D132 | 🔧 | 选几个空地付食物（避免扣分） |
| E22 | 🔧 | 选存多少食物到卡上 |
| E74 | ✅ | 选用几根免费围栏 |
| E85 | 🔧 | 选移多少食物到卡上 |

> 5 张已实现，3 张未实现。

**3. 资源类型多选（4 张）— 选 N 种不同资源**

需要资源类型选择 UI。可用 XOR 或多选 choice。

| 卡牌 | 状态 | 操作 |
|---|---|---|
| C104 | ✅ | 选 6-9 种不同资源各得 1 |
| D137 | 🔧 | 选至多 2 种货物购买（after Lessons） |
| E5 | 🔧 | 选 2 种不同建材从累积格取 |
| E78 | 🔧 | 选至多 4 种建材等量互换 |

> 1 张已实现，3 张未实现。

**4. 马厩/农场位置选择（4 张）— 选农场格子**

需要农场格子选择 UI。可复用 farm interaction 的 stables 模式。

| 卡牌 | 状态 | 操作 |
|---|---|---|
| B85 | ✅ | 选 2×2 格子建 FarmHand 马厩 |
| D102 | 🔧 | 选哪个马厩回收（得木+谷+食+改良） |
| E76 | 🔧 | 选至多 3 个马厩回收（每个得 3 木） |
| E148 | ✅ | 选行动格放马厩 |

> 2 张已实现，2 张未实现。

**5. 行动格选择（2 张）— 选一个行动格执行**

需要行动格选择 UI + 嵌套完整行动流程。实现最复杂。

| 卡牌 | 状态 | 操作 |
|---|---|---|
| D51 | ✅ | 选空行动格移农民过去执行（BeforeReturnHome） |
| E10 | ✅ | 选空行动格移农民（EndWorkPhase r3/r6） |

> 2 张均已实现。

**6. 手牌选择（2 张）— 从手牌中选卡**

需要手牌选择 UI。

| 卡牌 | 状态 | 操作 |
|---|---|---|
| A3 | 🔧 | 选 3 张职业，随机 1 张可免费打 |
| B146 | 🔧 | 弃 1 张手牌得额外建材 |

> 均未实现。

**7. 农民回收（1 张）**

| 卡牌 | 状态 | 操作 |
|---|---|---|
| D93 | 🔧 | 选已占行动格召回自己农民（付 1 羊+2 食） |

**8. 复合多步（3 张）**

| 卡牌 | 状态 | 操作 |
|---|---|---|
| C146 | ✅ | 买时选资源对放卡上 → 对手翻新时选拿哪对 |
| D161 | ✅ | 翻新后自动报价买菜 |
| E76 | 🔧 | FarmHand 判断 → 马厩选择（多步） |

##### 与我们现有机制的映射

| BGA SPECIAL_EFFECT 类型 | 我们的实现机制 | 可用性 |
|---|---|---|
| 田地选择 | `field-select` farm interaction | ✅ 已有 |
| 数量选择 | XOR flow (每个数量一个选项) | ✅ 可用 |
| 资源类型多选 | XOR flow 或 `resolveChoice` | ✅ 可用 |
| 马厩位置选择 | `stables` farm interaction | ✅ 已有 |
| 行动格选择 | `resolveChoice` 已有实现 (D51/E10) | ✅ 已有 |
| 手牌选择 | 需新增 `card-select` choice 类型 | ❌ 未实现 |
| 农民回收 | 需新增 `farmer-recall` choice 类型 | ❌ 未实现 |
| 复合多步 | seq + 多个 ChoiceNode | ✅ 可用 |

##### 基础设施缺口

1. **手牌选择 UI**：A3、B146 需要从手牌中选卡。需要新的 `card-select` pending state + 前端列表选择组件。影响 2 张卡。
2. **农民回收 UI**：D93 需要选择已放置的农民召回。需要在行动格上标注可选择状态。影响 1 张卡。
3. **数量滑块**：D132、E22、E85 的数量选择用 XOR 可能选项太多（如 E22 可存 0-15 食物）。可考虑新增 `quantity-input` choice 类型，但 XOR 也可凑合。

> 大部分 SPECIAL_EFFECT 卡（~30/40）可用现有机制实现，仅 3 张需要新基础设施。

#### 批次 15：对手交互（23 张）— 按交互模式分组

##### PASSIVE_BENEFIT — 被动收益（11 张）

对手做 X 时，卡主自动获得资源，无需选择。

| 卡牌 | 触发事件 | 效果 |
|---|---|---|
| B143 | 对手使用 Hollow | 卡主得 1 黏土 |
| B159 | 对手犁相邻田 | 卡主得 1 食物 |
| B163 | 任何人建房（卡主仅 2 房） | 卡主得 3 木 +2 黏土 +1 芦苇 +1 石 |
| C137 | 任何人建烘焙改良 | 卡主得 1 木 +1 食物 |
| D77 | 任何人翻新为石 | 卡主每新石房得 1 黏土 |
| D160 | 对手首次放农民在家庭成长 | 卡主得 1 谷物 |
| D163 | 对手翻新为石/建石房 | 卡主得 1 石头 |
| E49 | 任何人建木房 | 卡主得 1 食物 |
| E144 | 任何人打食物转换卡 | 卡主得对应建材 +1 芦苇 |
| E156 | 对手打含黏土费用的改良 | 卡主得 1 食物 +1 黏土 |
| E160 | 对手使用 Fishing | 对手得 1 食物，卡主得 1 蔬菜 |

##### OWNER_OPTIONAL — 卡主可选（9 张）

对手做 X 时，卡主可选择性行动。

| 卡牌 | 触发事件 | 可选效果 |
|---|---|---|
| A154 | 对手收取食物累积格 | 付 1 谷物给对手，得 1 分 |
| A158 | 对手使用 Traveling Players | 交换 1 谷/羊/菜 → 4/5/7 食物 |
| A159 | 对手使用 Fishing/ReedBank | 付 1 木给对手，得 2-3 食物 |
| C149 | 对手翻新为石 | 付 2 食物，免费建 1 黏土房 |
| C152 | 对手使用 Traveling Players | 付 1 食物给对手，免费打 1 职业 |
| C153 | 对手翻新 | 付 2 木，得 1 谷 +1 食 +1 分 |
| C167 | 对手使用 Fencing | 买 1 羊/猪/牛，付 1/2/2 食物 |
| D128 | 对手建房 | 付 1 食物给对手，建 1 房（付全价） |
| D149 | 对手使用 Quarry | 必选：1 食物 或 建 1 免费马厩 |

##### FORCED_PAYMENT — 强制支付（1 张）
B138: 对手收取 5+ 木时，必须付 1 食物给卡主

##### GRANT_ACTION — 授予行动（1 张）
C151: 对手使用 Grain Utilization 时，卡主可选执行播种

##### META_EFFECT — 多阶段效果（1 张）
A160: 对手使用 Traveling Players → 卡主自动得 1 食 +1 木 + 可选付 2 食买 1 菜

### 批次 16：流程替换/特殊机制（~28 张）

不归入以上类别的复杂卡 + SPECIAL 类型：

**流程替换/假农民等：**
A20, B26, B160, C23, C112, C129, C140, C150, C158, C160, D17, D18, D21, D24, D50, E105

**SPECIAL 类型：**
PlayerActionCard (2): C22, C39
FieldDetails (3): B68, D75, E80
GetBaseCosts (1): B36
ComplexBuy (2): A20, E125

**理由**：最大批次。每张需创建文件 + 1 个 listener，逻辑清晰。

**建议按事件类型分子批实现（见上方详细分组）：**
1. PlaceFarmer 触发（56 张）— 最常见，放农民到特定行动格时触发
2. AfterCollect（17 张）— 收取后效果
3. After 行动（31 张）— after:Plow/Sow/Fencing/Construct 等
4. Harvest 阶段（34 张）— StartHarvest/Feeding/EndHarvest 等
5. 回合/工作阶段（47 张）— StartOfTurn/ReturnHome/EndWorkPhase 等
6. Compute 修改器 + Anytime + 静态（19 张）

---

## 各 Deck 已实现卡牌列表

### A Deck（47 张已实现）

A12, A17, A25, A28, A29, A31, A32, A37, A38, A39, A48, A53, A55, A64, A65, A70, A73, A74, A79, A81, A83, A84, A94, A97, A98, A99, A101, A102, A105, A108, A109, A110, A112, A119, A126, A128, A132, A133, A134, A136, A143, A144, A150, A156, A162, A165, A166

### B Deck（25 张已实现）

B27, B30, B34, B38, B39, B42, B65, B67, B70, B72, B75, B76, B83, B85, B94, B98, B99, B100, B103, B109, B132, B136, B151, B153, B165

### C Deck（37 张已实现）

C17, C24, C25, C29, C30, C31, C33, C35, C37, C48, C51, C52, C59, C60, C63, C67, C69, C75, C81, C86, C88, C96, C99, C100, C104, C120, C122, C133, C134, C135, C141, C142, C144, C146, C162, C168

### D Deck（44 张已实现）

D5, D7, D8, D10, D14, D23, D29, D30, D31, D33, D34, D35, D36, D38, D49, D51, D55, D60, D66, D70, D72, D74, D82, D88, D92, D99, D100, D107, D114, D115, D116, D119, D122, D127, D135, D136, D139, D150, D152, D154, D157, D158, D161, D167

### E Deck（38 张已实现）

E4, E10, E21, E32, E33, E34, E35, E37, E38, E40, E52, E53, E57, E63, E64, E73, E74, E75, E81, E82, E83, E84, E86, E95, E101, E103, E112, E124, E128, E130, E133, E134, E135, E136, E148, E154, E161, E167
