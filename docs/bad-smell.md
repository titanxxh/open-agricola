# Bad Smell 清单：主路径中的单卡特殊逻辑

> 调查日期：2026-05-02
> 最近更新：2026-05-02（A3 + B 级 + card-type 工具统一已完成）
> 范围：`shared/`（不含 `cards/`、`i18n/`）、`server/`、`client/`
> 目的：枚举主路径里"含特定卡牌字面量 / 为单卡而生"的所有点，作为后续 sprint 清理依据
>
> 背景：CLAUDE.md 明确要求「不要为单卡改动主路径」「不要在核心文件添加针对某张卡的 if-else」。本清单按违反程度分级 A→E。

## 状态总览

| 级别 | 状态 | 备注 |
| --- | --- | --- |
| A1 B30_WoodPalisades | ⏳ 待办 | 前后端三处字面量复制 |
| A2 E148_Lazybones | ⏳ 待办 | 前端按卡名读 cardStates |
| A3 Major_Fireplace | ✅ 已解决（`04945238`） | majors 自己声明 `fireplaceIdentity`，主路径走 `isFireplaceIdentityCard()` |
| B 级 主路径 `Major_` 前缀 | ✅ 已解决（`74ff5231`） | 引入 `isMajorCardId` + 修 `parseImprovementChoice` bare 推断 |
| 卡内 `Major_` 前缀残留 | ✅ 已解决（`35ed327e`） | B95/C137/D80/D117/E156 五处 |
| `isMajorImprovement` / `alsoCountsAs` 双字段 | ✅ 已解决（`74656dd6`） | 字段合并到 `alsoCountsAs`，删除 `isEffectivelyMajor` 工具 |
| C 级 `CUSTOM_` 前缀分支 | ⏳ 待办 | 5 处复制，结构合理但缺统一工具 |
| D 级 internal/ 单卡 leaf | ⏳ 待办 | 注释提及 B85/D51/E10/D93 |
| E 级 注释里的举例卡名 | ⏳ 待办 | 仅文档影响 |
| 边界 `breed.ts:70` 魔法字符串 | ⏳ 待办 | `'harvest'` 区分调用来源 |

---

## A 级：主路径出现具体卡牌 ID 字面量

### A1. `B30_WoodPalisades`（Wood Palisades 准入）

字面量被三处独立 `includes(...)` 复制：

| 位置 | 代码 |
| --- | --- |
| `shared/logic/farm/farm-choice.ts:145` | `allowPalisades: (normalized.minorPlayed ?? []).includes('B30_WoodPalisades')` |
| `shared/session/game-core.ts:2795` | 同上字面量（围栏分支） |
| `client/app/GameContainerApi.tsx:1865` | `hasWoodPalisadesCard={!!currentPlayer?.minorPlayed?.includes('B30_WoodPalisades')}` |
| `client/components/interaction/InteractionBar.tsx:318/361/488` | 接收 `hasWoodPalisadesCard` prop 并按此切换 UI |

**问题**：主路径泄漏了"哪张卡能开 palisade"。前后端各一份字面量，新增同效果卡时三处都要改。

**建议修法**：参照 `fireplaceIdentity` 思路，给 minor 加 `allowsPalisades?: boolean` marker；主路径改成"任一已打 minor 含此 marker"。

---

### A2. `E148_Lazybones`（Lazybones 预占 stable 显示）

| 位置 | 代码 |
| --- | --- |
| `client/components/board/ActionBoard.tsx:457` | `(player.cardStates?.['E148_Lazybones']?.extraData as { spaces?: string[] }).spaces` |

**问题**：前端直接按卡名读 `cardStates`，是单卡耦合到主路径渲染层的典型反模式。

**建议修法**：定义通用 cardState schema（如 `reservedSpaces: { spaces: string[]; visualKind: 'stable' }`），前端循环全部 `cardStates` 找带此 schema 的项；或后端将占用信息合并到 `ActionSpace.extraData`。

---

### A3. `Major_Fireplace1` / `Major_Fireplace2`（壁炉返还兼容池） ✅ 已解决

> 解决于 commit `04945238`。

### 原问题

| 位置 | 代码 |
| --- | --- |
| `shared/actions/helpers/payment.ts:23` | `const FIREPLACE_COST_IDS = ['Major_Fireplace1', 'Major_Fireplace2'] as const` |
| 同上 `:35-40` | `cardMatchesCostList` 里据此识别"该 cost 是否要求返还壁炉" |
| `shared/actions/effects/improvement.ts:20` | `const FIREPLACE_MAJOR_IDS = ['Major_Fireplace1', 'Major_Fireplace2'] as const` |
| 同上 `:27-55` | `getFireplaceReturnPool` / `getPlayedCardsForCost` 用此过滤 |

`fireplaceIdentity` marker 当时只对 minor 生效（D25_WitchesDanceFloor），major 自己的 ID 仍硬编码——机制半成品。

### 解决方案

- `shared/cards/major/fireplace.ts`：fireplace1 加 `fireplaceIdentity: true`（fireplace2 通过 spread 继承）
- `shared/cards/helpers/card-type.ts` 新增 `isFireplaceIdentityCard(id)` 工具，聚合 majors + minors 查询
- `shared/actions/effects/improvement.ts`：删 `FIREPLACE_MAJOR_IDS`，`getFireplaceReturnPool` / `getPlayedCardsForCost` 改用工具
- `shared/actions/helpers/payment.ts`：删 `FIREPLACE_COST_IDS`，`cardMatchesCostList` 改用工具

主路径再无 `Major_Fireplace*` 字面量；行为保持不变。

---

## B 级：基于 `Major_` 前缀的字符串分支 ✅ 已解决

> 解决于 commit `74ff5231`（主路径 7 处）+ `35ed327e`（单卡 5 处残留）。

### 原问题

`shared/actions/effects/improvement.ts` 同一文件出现 4 次：

| 行 | 代码 |
| --- | --- |
| `:552` | `if (!improvement \|\| !improvementId.startsWith('Major_'))` |
| `:685` | `if (parsed.kind === 'major' \|\| parsed.id.startsWith('Major_'))` |
| `:730` | `const majorImprovement = allowMajor && parsed.id.startsWith('Major_') ? getMajorCard(parsed.id) : undefined` |
| `:817` | `if (parsed.id.startsWith('Major_'))` |

跨文件还有：`exchange.ts:240`、`scoring.ts:304`、`InteractionBar.tsx:30`，以及单卡内 5 处（B95/C137/D80/D117/E156）。

### 解决方案

- `shared/cards/helpers/card-type.ts`：新增 `getCardPrimaryType(id)` / `isMajorCardId(id)` / `isMinorCardId(id)` / `isOccupationCardId(id)`，内部基于 `getMajorCard(id)` lookup（不再字符串前缀）
- `parseImprovementChoice` (`improvement.ts`) 在 bare 形式下用 `isMajorCardId` 推断 kind，原本的 `|| parsed.id.startsWith('Major_')` fallback 全部消掉
- B1 `improvement.ts:552` 的双保险防御直接删（`getMajorCard` 返 undefined 已挡）
- B5 `exchange.ts:240` / B6 `scoring.ts:304` 改用 `isMajorCardId`
- B7 `InteractionBar.tsx:30` 直接复用同文件已有的 `getAnyCardDisplayName`（i18n 三 pool fallback），删除 `renderReturnedCardName` + `resolveAnyCardName`
- 主路径所有 `startsWith('Major_')` 字面量清零；剩 1 处在 `card-type.ts` 注释里作为反例提示

### 附带成果：字段统一

发现两套并存且**语义不一致**的"判定 effectively-major"机制：`isMajorImprovement: boolean`（`isEffectivelyMajor()` 用）vs `alsoCountsAs: CardType[]`（`cardCountsAs()` 用）。覆盖矩阵：

| 卡 | `isMajorImprovement` | `alsoCountsAs:['major']` |
| --- | :---: | :---: |
| A60 / D59 | ✅ | ✅ |
| D60 | — | ✅ |
| D25 / C60 | ✅ | — |

导致两个**实际 bug**：
- D60_LargePottery 触发 D161_CabbageBuyer 时算成 minor → cost 2 food（应为 1）
- D25_WitchesDanceFloor / C60_SmallPottersOven 不计入 cookery prereq

修复（commit `74656dd6`）：
- 给 D25 / C60 补 `alsoCountsAs: ['major']`（修两个 bug）
- 删 `isMajorImprovement` 字段 + `isEffectivelyMajor()` 工具 + `card-identity.ts`
- D161 改用 `cardCountsAs(id, 'major')`

`alsoCountsAs` 是 BGA 对齐的字段（mirror `getOtherCardTypes()`）。

---

## C 级：`CUSTOM_` 前缀分支（自定义卡专用代码路径）

| 位置 |
| --- |
| `shared/logic/scoring-bonus-solver.ts:73, 100, 147` |
| `shared/actions/helpers/animal-zones.ts:123` |
| `shared/actions/effects/fencing.ts:34` |
| `client/components/common/PlayerCard.tsx:57` |
| `client/services/card-meta.ts:111` |

**问题**：判断"是不是工坊自定义卡，走 custom-registry"的分流，结构上合理，但和 B 级一样靠字符串前缀。

**建议修法**：统一一个 `isCustomCardId()` / `getCardSource(id)` 工具函数，消除 `startsWith('CUSTOM_')` 复制。

---

## D 级：`actions/effects/internal/` 中"为单卡设立的 leaf 文件"

文件名/接口本身泛化，但顶部注释明说是为某张卡而生：

| 文件 | 注释中点名的卡 |
| --- | --- |
| `shared/actions/effects/internal/build-farmhand-room.ts:5` | B85_FarmHand |
| `shared/actions/effects/internal/move-farmer-to-space.ts:8` | D51_Archway、E10_StrawHat |
| `shared/actions/effects/internal/recall-placed-worker.ts:16` | D93_SheepInspector |

**问题**：文件没硬编码卡牌字面量，但"主路径里为单卡新建 leaf"是 CLAUDE.md 反对的扩散方向。

**建议处理**：review 这些 leaf —— 是该挪到 cards/ 目录附近，还是该参数化进通用 leaf。move-farmer-to-space 已经被两张卡共用，相对健康。

---

## E 级：注释里的卡名"举例"（不影响行为）

仅文档/注释，无执行影响。如果后续清理，建议改成"举例 X 类卡"的描述而不是点名具体卡。

| 位置 | 提到的卡 |
| --- | --- |
| `shared/actions/effects/improvement.ts:461` | E95_Miller |
| 同上 `:770/:778` | D131（bottom-row majors） |
| 同上 `:800` | E78_Y（路径示例） |
| `shared/actions/helpers/payment.ts:678/679/686` | A14、A143、D82、A123、C122 |
| `shared/actions/helpers/pay-helpers.ts:169` | A88_HedgeKeeper |
| `shared/actions/effects/breed.ts:29` | A165_PigBreeder |
| `shared/game/types.ts:333` | D95_SiteManager |
| `shared/protocol/game.ts:33` | A123_FrameBuilder |
| `shared/session/game-core.ts:2499` | C22_BasketChair |

---

## 边界 case：魔法字符串而非卡 ID

`shared/actions/effects/breed.ts:70` —— `if (sourceCard === 'harvest')`

不是卡牌 ID，但是"主路径用魔法字符串 `'harvest'` 区分调用来源"。建议换枚举或显式的 `harvestSummary?: boolean` 选项。

---

## 后续优先级

1. **A1（B30_WoodPalisades）**：前后端三处复制，新增 marker 字段后即可一并清掉，影响 fence 流程，需要回归测。
2. **A2（E148_Lazybones）**：需要先设计通用 cardState schema，工作量最大。
3. **C/D/E 级 + 边界 case**：低优先级，捎带清理。

---

## 卡类型工具链（清理后的现状参考）

未来涉及"卡类型"的检查统一走以下工具，**不要**再用 `id.startsWith('Major_')` / `id.startsWith('Minor_')` 等前缀字面量：

| 用途 | 工具 | 位置 |
| --- | --- | --- |
| 这个 ID 在哪个池里（major/minor/occupation） | `getCardPrimaryType(id)` | `shared/cards/helpers/card-type.ts` |
| 这个 ID 是不是 majors 池里的 | `isMajorCardId(id)` | 同上 |
| 卡（含 dual-type）是否"算作"某类型 | `cardCountsAs(id, 'major')` | 同上 |
| 玩家场上"算作"某类型的卡 | `collectCardsAs(player, 'major')` | 同上 |
| 卡名翻译（自动选 i18n namespace） | `getAnyCardDisplayName(locale, id)` | `client/components/common/cardText.ts` |
| Fireplace 兼容卡（满足返还需求） | `isFireplaceIdentityCard(id)` | `shared/cards/helpers/card-type.ts` |

声明字段：
- `alsoCountsAs?: CardType[]` —— minor/occupation 也算作其它类型（dual-type）
- `fireplaceIdentity?: boolean` —— 满足"返还壁炉"cost slot
