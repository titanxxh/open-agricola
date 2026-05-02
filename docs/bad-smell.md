# Bad Smell 清单：主路径中的单卡特殊逻辑

> 调查日期：2026-05-02
> 范围：`shared/`（不含 `cards/`、`i18n/`）、`server/`、`client/`
> 目的：枚举主路径里"含特定卡牌字面量 / 为单卡而生"的所有点，作为后续 sprint 清理依据
>
> 背景：CLAUDE.md 明确要求「不要为单卡改动主路径」「不要在核心文件添加针对某张卡的 if-else」。本清单按违反程度分级 A→E。

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

### A3. `Major_Fireplace1` / `Major_Fireplace2`（壁炉返还兼容池）

| 位置 | 代码 |
| --- | --- |
| `shared/actions/helpers/payment.ts:23` | `const FIREPLACE_COST_IDS = ['Major_Fireplace1', 'Major_Fireplace2'] as const` |
| 同上 `:35-40` | `cardMatchesCostList` 里据此识别"该 cost 是否要求返还壁炉" |
| `shared/actions/effects/improvement.ts:20` | `const FIREPLACE_MAJOR_IDS = ['Major_Fireplace1', 'Major_Fireplace2'] as const` |
| 同上 `:27-55` | `getFireplaceReturnPool` / `getPlayedCardsForCost` 用此过滤 |

**问题**：已经为 minor 抽出 `fireplaceIdentity`（D25_WitchesDanceFloor 用了），但 **major 自己的 ID 仍然硬编码**。机制半成品。

**建议修法**：让 Major Fireplace 1/2 的卡定义也声明 `fireplaceIdentity: true`，主路径只查字段即可，删掉两处 `FIREPLACE_*_IDS` 常量。

---

## B 级：基于 `Major_` 前缀的字符串分支

`shared/actions/effects/improvement.ts` 同一文件出现 4 次：

| 行 | 代码 |
| --- | --- |
| `:552` | `if (!improvement || !improvementId.startsWith('Major_'))` |
| `:685` | `if (parsed.kind === 'major' \|\| parsed.id.startsWith('Major_'))` |
| `:730` | `const majorImprovement = allowMajor && parsed.id.startsWith('Major_') ? getMajorCard(parsed.id) : undefined` |
| `:817` | `if (parsed.id.startsWith('Major_'))` |

跨文件还有：

- `shared/actions/effects/exchange.ts:240` — `if (cardId.startsWith('Major_'))`
- `shared/logic/scoring.ts:304` — `if (!cardId.startsWith('Major_')) return`（防御性，但表达"player.improvements 只装 majors"靠字符串前缀）
- `client/components/interaction/InteractionBar.tsx:30` — `cardId.startsWith('Major_')`

**问题**：不是单卡硬编码，但"靠 ID 前缀分流卡类型"是把字符串协议外漏到主路径。`parseImprovementChoice` 已经返回 `kind` 字段，scoring 那边没用上。

**建议修法**：抽 `isMajorCardId(id)` / `getCardKind(id)` 工具函数（或直接用 `parseImprovementChoice().kind`），统一所有前缀检查。

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

## 优先级建议

1. **A3（Fireplace 字面量）**：通用 marker 已存在（`fireplaceIdentity`），最低成本就能消除。改完后 D25 同款机制完整。
2. **A1（B30_WoodPalisades）**：前后端三处复制，新增 marker 字段后即可一并清掉，影响 fence 流程，需要回归测。
3. **B 级前缀检查**：纯重构，引入工具函数即可。
4. **A2（E148_Lazybones）**：需要先设计通用 cardState schema，工作量最大。
5. **C/D/E 级**：低优先级，捎带清理。
