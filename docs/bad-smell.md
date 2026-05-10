# Bad Smell 清单：主路径中的单卡特殊逻辑

> 调查日期：2026-05-09（重新扫描）
> 上一次重写：2026-05-02
> 范围：`shared/`（不含 `cards/`、`i18n/`）、`server/`、`client/`
> 目的：枚举主路径里"含特定卡牌字面量 / 为单卡而生 / 用字符串前缀做 type 判定"的所有点，作为后续 sprint 清理依据
>
> 背景：CLAUDE.md 明确要求「不要为单卡改动主路径」「不要在核心文件添加针对某张卡的 if-else」。

## 状态总览（2026-05-09 复查）

| 级别 | 状态 | 备注 |
| --- | --- | --- |
| A1 B30_WoodPalisades | ✅ 已解决（`efeca3b0`） | 引入 `enablesPalisades` marker + `playerCanBuildPalisades()` |
| A2 E148_Lazybones | ✅ 已解决（`09edf30d`） | 改用通用 `RESERVED_ACTION_SPACES_KEY`，渲染层遍历所有 cardStates |
| A3 Major_Fireplace | ✅ 已解决（`04945238`） | majors 自己声明 `fireplaceIdentity`，主路径走 `isFireplaceIdentityCard()` |
| B 级 主路径 `Major_` 前缀 | ✅ 已解决（`74ff5231`） | 引入 `isMajorCardId` + 修 `parseImprovementChoice` bare 推断 |
| 卡内 `Major_` 前缀残留 | ✅ 已解决（`35ed327e`） | B95/C137/D80/D117/E156 五处 |
| `isMajorImprovement` / `alsoCountsAs` 双字段 | ✅ 已解决（`74656dd6`） | 字段合并到 `alsoCountsAs`，删除 `isEffectivelyMajor` 工具 |
| **C 级 `CUSTOM_` 前缀分支** | ⚠️ 复查反而扩散（11 处主路径 + 5 处 UI） | 仍未抽 `isCustomCardId` 工具；建议优先做 |
| **D 级 `internal/` 单卡 leaf** | ⏳ 仅 1 张真单卡（B85） | `build-farmhand-room.ts` 21 行；`recall-placed-worker.ts` / `move-farmer-to-space.ts` 已通用化或多卡共用 |
| **E 级 注释举例** | ⏳ 残存 2 处 | 大部分已在 5/6/7/S1-S8 sprint 顺手清掉 |
| **边界 `breed.ts` `'harvest'` 魔法字符串** | ⏳ 仍待办 | sourceCard 用 `'harvest'` 当哨兵，未换枚举 |
| **新发现：`ad-hoc-action-registry.ts` `card_` 前缀强约束** | ⏳ 待评估 | 用字符串前缀做 invariant assert，与 `Major_` / `CUSTOM_` 同类问题 |
| **F 级 `legacy` 标记残留**（2026-05-09 新扫） | ⚠️ 主路径 79 处 + 测试 131 处 = 221 处 | 4 类：真 fallback / 兼容字段 / 迁移留痕注释 / 测试 baseline 命名；详见下文 |
| **F5 `@deprecated` 标记**（2026-05-09 补扫 + 同日清理） | ✅ 已收口 | 3 个真 `@deprecated` 字段（engine snapshot + SQL 双列）已删；DSL 一次性迁移脚本同步退役 |

---

## A / B 级：已解决（详情参见 git log `efeca3b0` / `09edf30d` / `04945238` / `74ff5231` / `35ed327e` / `74656dd6`）

A 级 / B 级清理已完整落地，本节只保留摘要。当前主路径**没有任何**针对具体卡 ID 的字面量分支或 `Major_*` 字符串前缀判定，相关查询统一走 `shared/cards/helpers/card-type.ts` 工具链（详见本文末"卡类型工具链"小节）。

---

## C 级：`CUSTOM_` 前缀分支（自定义卡专用代码路径）⚠️

**复查发现：扩散反而比上次记录更严重。** 上次列 5 处，这次主路径 11 处 + UI 5 处，分布 9 个文件。

### 主路径复制（**11 处**，急需抽 helper）

| 文件 | 行 | 用途 |
| --- | --- | --- |
| `shared/domain/scoring.ts` | 156, 195, 242 | scoring 时区分自定义卡 → 走 custom-registry 取属性 |
| `shared/domain/animal-zones.ts` | 131 | zone owner 解析时 fall back 到 custom-registry |
| `shared/cards/custom-registry.ts` | 138, 139 | active card pool 切换时按前缀过滤要清理的 effect / listener |
| `shared/cards/card-effects.ts` | 239（封了局部 `isCustomCard`）, 428, 454, 483, 511 | listener 注册扫描时按前缀分流；本文件已抽 `isCustomCard` 但**仅本文件用** |
| `client/services/card-meta.ts` | 111 | 前端取卡 meta 时 fall back |
| `client/components/common/PlayerCard.tsx` | 57 | 前端展示卡编号时 fall back |

### UI 校验（5 处，结构合理但仍是字面量）

| 文件 | 行 |
| --- | --- |
| `client/app/workshop/AiCardDesigner.tsx` | 43, 1124, 1148, 1174, 1176 |

UI 校验"自定义卡 ID 必须以 CUSTOM_ 开头"是 BGA 对齐的命名 invariant，本质上是字符串前缀的**用户协议**而非内部分流，可以保留前缀字面量但应共用一个常量。

### 建议修法（按 CLAUDE.md 优先级最高）

```ts
// shared/cards/helpers/card-type.ts
export const CUSTOM_CARD_ID_PREFIX = 'CUSTOM_'
export const isCustomCardId = (id: string): boolean =>
  id.startsWith(CUSTOM_CARD_ID_PREFIX)
```

把 11 处主路径全部 replace 成 `isCustomCardId(id)`；UI 5 处也改用同一 helper（保留 prefix 校验语义）。`card-effects.ts` 已封的局部 `isCustomCard` 删掉（顶替为公共 helper）。`custom-registry.ts` 那 2 处用同一 helper 替 callback。

工作量估算：~15 min。无行为改动，纯重构。建议下次任意 sprint 顺手做。

---

## D 级：`actions/effects/internal/` 中"为单卡设立的 leaf 文件"

`internal/` 总共 13 个 leaf 文件。重新审视后真正算"为单卡而生"的只剩 1 个：

| 文件 | 行数 | 状态 |
| --- | --- | --- |
| `build-farmhand-room.ts` | 21 | ⚠️ **真单卡**——注释明指 B85_FarmHand，全仓 caller 仅 B85 |
| `move-farmer-to-space.ts` | 57 | ✅ 已 D51_Archway + E10_StrawHat 双卡共用 |
| `recall-placed-worker.ts` | 146 | ✅ 真泛化——名字描述行为而非卡牌；direct mode + choice mode 双接口适配多卡 |
| `take-from-space.ts` / `take-from-card.ts` / `store-on-card.ts` / `push-to-card-stack.ts` / `pop-card-stack.ts` / `reserve-fence-bonus.ts` / `return-to-space.ts` / `spend-worker.ts` / `future-meeples.ts` / `emit-choice.ts` / `selection.ts` | 22-50 | ✅ 已注册到通用 action registry，多卡复用或主路径共用 |

### `build-farmhand-room.ts` 处理建议

文件本身只是把 `player.familySize += 1`（增加 housing capacity 但不放物理 tile）封成一个 leaf，没共用价值。两条路径选一：

- **选项 A**：把这 21 行内联到 `shared/cards/B/B85_FarmHand.ts`，从 `internal/` 删除该文件 — 卡内闭环
- **选项 B**：参数化为 `set-virtual-room-count` leaf（接受 delta + which counter），保留在 `internal/` 但等第二张卡出现再考虑

**推荐 A**：YAGNI；如果未来真有第二张 virtual-room 卡，再走"两个 caller 才抽公共"原则提到 `internal/`。

---

## E 级：注释里的卡名"举例"（不影响行为）

仅文档/注释，无执行影响。复查后只剩 2 处（其余在 5/6/7/S1-S8 sprint 中顺手清掉了）：

| 位置 | 提到的卡 |
| --- | --- |
| `shared/actions/effects/breed.ts:30` | A165_PigBreeder（"such as A165 PigBreeder (sourceCard='A165_PigBreeder')"）|
| `shared/contract/types.ts:358` | D95_SiteManager（"e.g. D95 Site Manager treats `actionCardId === 'D95_SiteManager'`"）|

两处都是 doc comment，描述某种**调用模式的代表卡**，不是字面量分支。可以保留；如果清理建议改成"举例 X 类卡（如 ChildToys-style trigger）"。

---

## 边界 case：魔法字符串而非卡 ID

### `shared/actions/effects/breed.ts:71` / `:111` —— `sourceCard === 'harvest'`

```ts
if (sourceCard === 'harvest') {
  state.harvestBreedSummary ??= {}
  state.harvestBreedSummary[player.id] = breedSummary
  ...
}
```

`sourceCard` 字段类型是 string（卡 ID），但主路径传 `'harvest'` 当哨兵区分"这次 breed 是收获相位触发的 vs 卡触发的"。两个用途共享同一字段：

1. **卡触发** (line 30 注释)：`sourceCard='A165_PigBreeder'` 等真卡 ID，决定动物归属 / 计分 source
2. **收获触发** (line 71)：`sourceCard='harvest'` 哨兵，启用 `harvestBreedSummary` 累计 + 多 round 14 listener 加挂

### 建议修法

把 `sourceCard?: string` 改成 `breedTrigger: { kind: 'harvest' } | { kind: 'card', cardId: string }`，调用点显式传 discriminated union。两处 `=== 'harvest'` 改成 `breedTrigger.kind === 'harvest'`。

工作量：~30 min（含 caller 修 + 测试）。

---

## 新发现（2026-05-09）

### `shared/actions/helpers/ad-hoc-action-registry.ts:6` —— `id.startsWith('card_')` invariant

```ts
if (!def.id.startsWith('card_')) {
  // throw / warn
}
```

ad-hoc action ID 必须以 `card_` 开头是个 namespace invariant（防止 ad-hoc action 与内置 action 命名冲突），但 enforced via 字符串字面量 startsWith 检查。**与 `Major_` / `CUSTOM_` 是同类问题**——namespace 协议靠字符串前缀维护。

### 建议修法

抽常量 + helper（与 C 级修法同模式）：

```ts
export const AD_HOC_ACTION_ID_PREFIX = 'card_'
export const isAdHocActionId = (id: string): boolean =>
  id.startsWith(AD_HOC_ACTION_ID_PREFIX)
```

工作量：~5 min。可以与 C 级合并为一个"前缀 namespace helper"sprint。

### 4 张 deferred 卡的"为单卡新基建"暗示（不属本表）

S7 spec §0 列出 C6 / C146 / E123 / C148 各需独立基建（CropStack stone kind / cross-player listener / pay leaf 主路径迁移 / reorg dispatcher hook）。这些是**还没写**的扩展点，不是"已写 + 单卡污染"，已登记到 `docs/card_progress.md` §2.5 末"deferred 基建依赖"表，**不属本文件追踪范围**。

---

## F 级：`legacy` 标记残留（2026-05-09 全仓扫描）

**全仓总量 210 处**：主路径 79 + 测试 131。文档 11 处随 2026-05-09 架构文档合并（旧 `ENGINE_ARCHITECTURE.md` / `ENGINE_NEW_ARCHITECTURE.md` → 新 `ARCHITECTURE.md`）一并消解。

按"性质"分 4 类，按修复优先级排：

### F1. 真 fallback 路径（带 if/else 双轨）—— P1，等主路径迁移

| 文件 | 行 | Legacy 路径用途 | 触发条件 / 删除条件 |
| --- | --- | --- | --- |
| `shared/cards/E/E123_ResourceHoarder.ts` | 83-128 | `actions: ['construct', 'renovate-house']` 旧 listener path（fallback to k=1） | 等 construct/renovate-house 主路径迁到 pay leaf；与 S3 PaymentSolver 收口的尾部清理同步进展 |
| `shared/cards/custom-registry.ts` | 67-71 | per-session registry 找不到 → fall back to global maps | 等所有调用方走 session context（含前端）后删 global map |
| `shared/actions/effects/internal/selection.ts` | 35, 45 | "Prefer structured payload (S2 Task 7); fall back to legacy split-comma" / `'r-c'` 字符串格式兼容 | 所有 caller 改传 structured payload + position 用对象格式 |
| `shared/actions/effects/pay.ts` | 244, 321, 324 | "silent cost-replacement treatment they had in the legacy" / "legacy mutate-in-place path" / "legacy D83-style upper-flow tests compatible" | pay leaf 完全替代 `executePaymentSolution` 直调路径后删 |
| `shared/session/session-core.ts` | 2222, 2295, 2324, 2355, 2367, 2401, 2626, 2709, 2711, 2746, 2756, 3192, 3333 | animal-reorg / next-player switch / choice 等多个 confirmXxx 仍 fall back to legacy `state.pending`-driven path | 全部 pending 改成 typed `InteractionRequest` 后删（S1/S2 主体已完，confirmXxx legacy 路径是收尾） |
| `shared/engine/engine-proceed.ts`, `engine-resolve.ts` | `includeLegacyLogKey` 选项 + `legacyEntry` 注入 | 默认 `true`，把 result.logKey 转成 immediate log entry 与新 entries 合并 | 所有 listener 直接产 immediate logs（不再用顶层 `logKey`）后删 |
| `shared/actions/effects/pay.ts` | 59-61 | `_activeActionBonusSources` 字段是 legacy 字段（仍在维护） | 所有 source-tracking 改走 result.extraData.bonusUsed（pay leaf 路径已用）后删字段 |

### F2. 历史迁移留痕注释（已删 legacy 代码后留的说明）—— P3

注释只描述"现在的实现替代了 legacy XYZ"，本身无 fallback 代码，不影响行为：

| 文件 | 行 | 性质 |
| --- | --- | --- |
| `shared/cards/registry.ts` | 6, 130 | "PR-3 deletes the legacy global layer" / "after the legacy `getMajorCardEffect` fallback is removed" |
| `shared/session/session-core.ts` | 280, 559, 566, 632, 1147, 1152, 1283, 1507 | "Replaces the legacy ..." / "the legacy `this.pending` is gone (Task 10)" 等 8 处 S1/S2 迁移说明 |
| `shared/engine/nodes/interaction-node.ts` | 11, 59, 69 | "mirrors the legacy engine-private `pending` field" |
| `shared/contract/types.ts` | 190, 730 | "receiving the same `PaymentInfo` it did under the legacy ..." / "the legacy stateId switches" |
| `shared/domain/farmyard.ts` | 25, 156, 1395 | "Legacy types preserved for the inlined validators" / "previously private in legacy modules" / "mirror legacy `validatePlowSelection` behavior" —— S4a 把 `shared/logic/farm/` 拆完留的 |
| `shared/actions/effects/breed.ts` | 22, 74, 100 | "replays the legacy `breedAnimals` semantics" / "Match legacy applyBreedPhase log entry" / "preserves the legacy `'animalReorg'`" |

**处理建议**：S1/S2/S3/S4 已完，迁移留痕注释完成它的引导作用——**可以一次性 grep 删**（保留代码不动）。预估 ~30 行注释清理，10 min。

### F3. 测试里的 `legacy` 命名（baseline / mock 标识）—— P3 / 不动

131 处分布在 ~20 个测试文件，多数是：
- "legacy baseline" 测试名（对照新实现）
- mock cardStates / mock pending 取名为 legacyXxx
- 注释 "this asserts legacy shape pre-Sx codemod"

**性质**：测试自身命名约定，不是代码坏味道。**建议不动**——除非测试本身已弃用。

### F4. 文档里的 `legacy` —— ✅ 2026-05-09 已收口

原 11 处分布在旧 `ENGINE_NEW_ARCHITECTURE.md` 自身的 sprint 迁移说明里。新 `ARCHITECTURE.md` 只描述当前实现态，不写 legacy 对照，旧文档随合并删除自动归零。

### F5. `@deprecated` / `deprecated` 标记（2026-05-09 补扫 + 同日清理）—— 已收口

#### F5.1 真 `@deprecated` 字段 —— ✅ 2026-05-09 已清理

| 位置 | 字段 | 清理动作 |
| --- | --- | --- |
| `shared/engine/engine.ts:301-309`（已删） | `lastEmittedChoice` snapshot alias | 扫 prod DB 2262 个 rooms.state_json 全 0 含此字段 → 删字段定义 + 删 restore alias 接受逻辑 + 清相关注释 |
| `server/db.ts` `effect_dsl` 双列 | SQL 列 | v7 migration 早已 `ALTER TABLE DROP COLUMN`（本地 schema_version v8 验证 effect_dsl/effect_code/compiled_code 三列均不在）；删 `@deprecated` 注释（misleading），保留 v2/v3/v7 migration 历史本身（不可变） |
| `scripts/migrate-dsl-to-code.ts` + `__tests__/` + `package.json` `migrate:dsl-to-code` | 一次性迁移脚本 | 与 effect_dsl 列同时退役（DB 中已无该列，脚本无法运行）→ 整套删除 |
| `scripts/check-no-dsl.ts` allowlist | DSL 关键字守卫的豁免列表 | 移除已删除的 `migrate-dsl-to-code` + `docs/superpowers` 引用 |

**验证**：fast 测试 2283 全过 / lint 0 error / build OK。

#### F5.2 注释自描述（无残留代码）—— 不动

- `server/__tests__/_helpers/legacy-confirms.ts:8, 23, 36` —— 3 处 test helper 注释，描述自己**替代**已删除的 `confirmNextPlayer()` / `confirmPlayerSwitch()` shim + `'choice' PendingAction` predicate（S2 Task 13.7 已删）
- `shared/session/session-core.ts:173` —— 注释提 "the deprecated union"（PendingAction union 已删 S1 Task 13.6）

**不动**——历史叙述，删了反而丢失迁移上下文。

#### F5.3 测试拒收 deprecated 字段（回归保护）—— 保留

- `shared/custom-code/__tests__/ast-validator.test.ts:83` —— `it('rejects scoringPriority as a deprecated meta field')`
- 主路径已 0 处 `scoringPriority`（2026-04-30 Bonus scoring hook 双轨合并时删干净）
- ast-validator 黑名单防止 LLM 生成的自定义卡复活此字段

**保留**——回归保护必要。

### F 级处理优先级

1. **F1 真 fallback**：等对应主路径 sprint 推进（不要单独清理——清掉会破坏兼容期）
2. **F2 注释清理**：可立即批量做（~10 min），但收益小
3. **F3 测试命名**：不动
4. **F4 文档**：不动
5. **F5.1 真 `@deprecated` 字段**：需 owner 决定 + 生产数据迁移；engine `lastEmittedChoice` 扫 DB 后可决；SQL `effect_dsl` 双列需备份 → DROP COLUMN
6. **F5.2 / F5.3**：不动

---

## 后续优先级

1. **C 级 `CUSTOM_` 前缀**（最严重 / 最易做）：抽 `isCustomCardId()` helper，11 处主路径 + 5 处 UI 共用。~15 min。
2. **新发现 `card_` ad-hoc action 前缀**：抽 `isAdHocActionId()` helper。~5 min。**建议与 1 合并 commit**。
3. **D 级 `build-farmhand-room.ts`**：内联到 B85_FarmHand 卡内，删 `internal/` 文件。~10 min。
4. **边界 case `breed.ts 'harvest'`**：换 discriminated union `breedTrigger`。~30 min（含测试）。
5. **E 级 注释举例**：可选，捎带清理。~5 min。
6. **F2 legacy 注释清理**（可选）：批量删除"Replaces the legacy XYZ" 等迁移留痕注释。~10 min。
7. **F1 真 fallback**：跟随对应主路径 sprint 自然清理，不单独立项。
8. ~~F5.1 真 `@deprecated` 字段~~ ✅ 已于 2026-05-09 同日清理。

合计 ~1h（不含 F1）即可清完所有可立即处理的 P3 坏味道。

---

## 卡类型工具链（清理后的现状参考）

未来涉及"卡类型 / namespace"的检查统一走以下工具，**不要**再用 `id.startsWith('Major_')` / `id.startsWith('Minor_')` / `id.startsWith('CUSTOM_')` / `id.startsWith('card_')` 等前缀字面量：

| 用途 | 工具 | 位置 |
| --- | --- | --- |
| 这个 ID 在哪个池里（major/minor/occupation） | `getCardPrimaryType(id)` | `shared/cards/helpers/card-type.ts` |
| 这个 ID 是不是 majors 池里的 | `isMajorCardId(id)` | 同上 |
| 卡（含 dual-type）是否"算作"某类型 | `cardCountsAs(id, 'major')` | 同上 |
| 玩家场上"算作"某类型的卡 | `collectCardsAs(player, 'major')` | 同上 |
| 卡名翻译（自动选 i18n namespace） | `getAnyCardDisplayName(locale, id)` | `client/components/common/cardText.ts` |
| Fireplace 兼容卡（满足返还需求） | `isFireplaceIdentityCard(id)` | `shared/cards/helpers/card-type.ts` |
| 玩家是否能建 palisade（B30 同款能力） | `playerCanBuildPalisades(player)` | 同上 |
| 卡在某些 action space 上预占 marker（E148 同款能力） | `RESERVED_ACTION_SPACES_KEY` + `getReservedActionSpaces` / `setReservedActionSpaces` | `shared/cards/helpers/card-state.ts` |
| **是不是自定义卡 ID（待添加）** | `isCustomCardId(id)` | `shared/cards/helpers/card-type.ts`（C 级清理后） |
| **是不是 ad-hoc action ID（待添加）** | `isAdHocActionId(id)` | `shared/actions/helpers/ad-hoc-action-registry.ts`（C 级清理后） |

声明字段：
- `alsoCountsAs?: CardType[]` —— minor/occupation 也算作其它类型（dual-type）
- `fireplaceIdentity?: boolean` —— 满足"返还壁炉"cost slot
- `enablesPalisades?: boolean` —— 解锁在 fence edge 上放木栅栏（wooden palisades）
