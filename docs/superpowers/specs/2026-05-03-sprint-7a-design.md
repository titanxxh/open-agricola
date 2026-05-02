# Sprint 7a — §2.2 Audit Followup（61 张 P0/P1 全 fix）

**Date:** 2026-05-03
**Branch / Worktree:** `sprint-7a-phase-1` at `.worktree/sprint-7a-banned-filter`（legacy dir name; branch ≠ phase scope —— 单 sprint 覆盖全 61 张）
**Scope:** Sprint 7 audit (`docs/sprint-7-audit-report.md`) 暴露的 61 张 P0/P1 deviations 全部 fix。串行按 mechanism family 实施，单 PR。
**Effort estimate:** ~17-20 engineer-days（3-4 周 wall-clock，单 dev）。

## 0. Goal

把 Sprint 7 audit 暴露的 61 张 ⚠/❌ deviation **全部修完**，不分 phase / 不拆 sub-sprint。Sprint 7a 完成后，`master-plan.md §0` 严格判定 `⚠=0 / ❌=0` 真正达成。剩余 BGA 对齐 gap 仅 i18n。

**用户决策（2026-05-03）：**

1. **不引入 banned 概念**：所有卡都要实装真实行为。Sprint 7a banned-filter 报告里的 (a) 4 张 + (b) 37 张不能跳过；现有 `passing: true` 标记（B22 / C1 / C9 / D1 / C6 / E5）是实现 lie，必须撤掉并补足行为。
2. **chooseOne BonusModifier**：BGA 风格（玩家 cost-step 选 1 建材）。验证 `Bonus.choices` / `BonusModifier.choices` infra 已存在（`payment.ts:572-582` 展开 candidates，A123 FrameBuilder 是生产用例）。
3. **B22 markForRemoval**：B22 内闭环（card-state counter），不引入 `Worker.markedForRemoval` 主路径字段。
4. **执行模式**：单 sprint，串行 family。Plan 把 13 family 按依赖排序，1 PR 收口。
5. **D134 placement skip**：加新 hook `onBeforePlayerTurn`（**注意：原 plan 写 `onBeforeStartOfTurn` 是错的——该 hook 已被 25+ 张卡用作 round-start 一次触发，语义不同**），listener 返回 `{ skipTurn: true }` 时 game-core 跳过该玩家本次 turn。通用扩展（未来 turn-scheduler 类卡可复用）。**flag 写到 owner（被 skip 的也是 owner），不是 trigger player——BGA `getPlayer()` 是 owner**。
6. **C11-style zone constraints**：BGA 用 per-card method `getInvalidAnimals($zone, $raiseException)`，11 张卡共用此机制（C11 / C12 / C148 / C86 / C9 / B11 / E11 / E33 / E36 / E86 + C148 partial）。新基建：`CardEffect.getInvalidAnimals?(player, zone, meeples, state)` hook，主路径 `enforceAnimalCapacity` dispatch。**新增 F-zone family 统一处理**。

**Quick-wins 验证（2026-05-03，agent 已跑）：** F0 helpers + F2 (3/4) + F12 (1/2) ✅ + 6 张卡 fix。Deferred：D134 OysterEater（决策 §决策点 5）+ C11 WildlifeReserve（决策 §决策点 6）。Plan 修订 ≥ §3 顺序后两者解锁。

## 1. 范围（13 family / 61 卡）

来源：`output/tmp/sprint-7a-audit/family-grouping.md`（基于 `output/tmp/sprint-7a-audit/banned-filter.jsonl` + Sprint 7 audit `merged.jsonl`）。

**修订（2026-05-03 quick-wins 后）：** 新增 **F-zone**（统一处理 BGA `getInvalidAnimals` 机制覆盖的 11 张 zone-constraint 卡）。F12 缩小至 B10。涉及 zone constraint 的卡从 F1/F4/F7/F11 部分迁出（继续保留主 family fix，但 zone 校验走新 hook）。

| Family | Cards | Strategy |
| ------ | ----- | -------- |
| F0 helpers | (基建：2 helper + 1 leaf + 2 hook) | 见 §2 |
| F1 onBuy / onAfter 截断 | 12 (B22, C16, C1, C6, C156, C9, D1, C57, E5, D74, C146, C112) | per-card；填回 BGA SEQ 子节 |
| F2 counter / extraData write missing | 4 (B132, C132, D134, C39) | wire computeBonusScore + counter writes |
| F3 PLACE_FARMER from supply / mark-for-removal | 2 (B22, B161) | 复用现 `actionContext.fromSupply` + B22 内 cardState counter / B161 加 computeArgsPlaceFarmer hook |
| F4 cost / capacity / stable-flag wrong | 7 (C54, C89, B11, C9, B32, C88, C53) | per-card cost/zone/flag fix |
| F5 anytime pays from supply not card-holder | 3 (D106, D114, C57) | rewire to card-holder storage |
| F6 round-offset / futureMeeples | 3 (D106, D114, B106) | reuse `state.futureMeeples`；B106 verify-only |
| F7 harvest sub-phase wrong / missing | 6 (B11, B21, D63, C54, C63, C6) | per-card hook 选择；可能加 `onEndHarvestBreedPhase` |
| F8 chooseOne / discount logic | 6 (E87, D82, E60, E123, C88, C27) | BonusModifier.choices 改造；E123 复杂留到 F11。**注意：E87/D82 不能用永久 modifier**——E87 用 onStartReturnHome push + after pop（避免 round 8 房屋重建非 sourceCard 路径误享 -1）；D82 用 setCardFlag + computeCosts listener 在 'improvement' cost type（不是 'renovation'）返 bonuses |
| F9 4p variant action-space listener | 5 (C130, B152, C39, C15, E166) | 用新 `pairedSpaceIdFor` helper |
| F10 opponent / scope listener missing | 3 (A132, A82, E148) | scope/take-from-space 调整 |
| F11 one-pit complex cards | 8 (C146, B21, B132, C148, E123, D74, B161, A132) | 单卡复杂 |
| F12 trivial holder / zone metadata | 1 (B10) | 1 行 zone definition |
| **F-zone**（新） | **11** (C11, C12, B11, C148, C86, C9, E11, E33, E36, E86, plus E11 / Petting Zoo and similar) | **新基建：`CardEffect.getInvalidAnimals` hook**；主路径 dispatch；卡内 per-card validate logic |

**注：** 部分卡跨 family（如 B132 是 F2+F11，C146 是 F1+F11，D106/D114 是 F5+F6）。Plan 内每张卡只算 1 次。

**verify-only 卡（agent 标"likely correct, recommend session test"）：**
- B106 MoralCrusader（F6）
- B152 JuniorArtist（F9）
- C27 Blueprint（F8）

这 3 张写 1 例 session test 验证；通过则 ✅ 关闭无 code change，失败则进入对应 family fix。

## 2. 基建（F0 — helpers，~1 day）

依赖：所有 helper 必须先于消费 family 完成。

### 2.1 `pairedSpaceIdFor(state, baseId)` helper

`shared/cards/helpers/space-pairing.ts`（NEW，~30 行）。返回当前局对应的实际 spaceId 列表（含 4p 扩展变体）。

```ts
export const pairedSpaceIdFor = (state: GameState, baseId: string): string[] => {
  const VARIANTS: Record<string, string[]> = {
    hollow: ['hollow-4'],
    lessons: ['lessons-4'],
    grove: [],
    'pig-market': [],
    // ... 其他 base → 4p variant
  }
  const variants = VARIANTS[baseId] ?? []
  return [baseId, ...variants.filter((v) => state.actionSpaces.some((s) => s.id === v))]
}
```

消费：F9 5 卡（C130 / B152 / C39 / C15 / E166）。

### 2.2 `take-from-space` ActionFlow leaf

`shared/actions/effects/internal/take-from-space.ts`（NEW，~50 行）+ `shared/actions/internal-actions.ts` 注册。

```ts
{
  type: 'leaf',
  actionId: 'take-from-space',
  sourceCard,
  params: { spaceId: string, resource: ResourceKey, amount: number }
}
// effect: state.actionSpaces[spaceId].resources[resource] -= amount; player.resources[resource] += amount
```

消费：F1 3 卡（C156 / E5 / 部分 C146）+ F10 1 卡（A82）。

### 2.3 (Optional) `onEndHarvestBreedPhase` hook

如果 F7 family 内 ≥2 张需要"breed phase 结束后"hook，则 `card-effects.ts` 加 `CardEffectHook` value `'onEndHarvestBreedPhase'` + `game-core` 在 breed phase 结束位 dispatch。如仅 1 卡（B11 Feedyard），inline 在 onAfterBreed 等现有 hook 即可。Implementation 时决定。

### 2.4 (Optional) `markForRemoval` (B22-only) — card-state counter

不是真 helper，仅 B22 内部模式登记：

- onBuy 派 `place-farmer-from-supply` leaf（已有 fromSupply）后，listener 在落子 commit 后写 `cardStates.B22.extraData.markedSpaceId = chosenSpaceId`
- `onBeforeReturnHome` 或 `onReturnHome` listener 读 markedSpaceId、找对应 worker、`isActive = false` + 还原到 supply、清 flag

文档登记到 §2.5 / ENGINE_ARCHITECTURE.md（pattern fashion，非新基建）。

### 2.5 `onBeforePlayerTurn` hook + `{ skipTurn: true }` 返回值（D134）

新 `CardEffectHook` value `'onBeforePlayerTurn'`（或同等 listener phase）。Game-core 在 `nextPlayer` / 切到 active player 前 dispatch 该 hook 给所有玩家的所有持卡，listener 返回 `{ skipTurn: true }` 时 game-core 跳过该玩家本次 turn 并进入下一玩家。

主路径改动：
- `shared/cards/card-effects.ts`：`CardEffectHook` 加 `'onBeforePlayerTurn'` value
- `shared/session/game-core.ts:nextPlayer` (or equivalent)：循环 dispatch + skip 逻辑

消费：D134 OysterEater（receiver `cardStates.X.extraData.skipNextPlacement` flag → 返 `{ skipTurn: true }` + 清 flag）。

未来通用扩展：其他 turn-scheduler 类卡可复用（family-grouping.md 没列具体卡，但符合 BGA `Globals::setSkipNext` 通用机制）。

### 2.6 `getInvalidAnimals` hook（F-zone 11 张）

新 `CardEffect.getInvalidAnimals?: (player, zone, meeples, state) → Meeple[]` hook。镜像 BGA `Cards/{deck}/{cardId}.php::getInvalidAnimals($zone, $raiseException)`。

主路径改动（**非破坏性 dispatch**——agent A 实施时纠正，原 plan 想"主路径自动 remove invalid meeples"，但我方动物模型是聚合（type+count），无 instance id，自动 remove 会破坏 25+ 张已有动物卡的 capacity 语义）：
- `shared/cards/card-effects.ts`：`CardEffect` 加 `getInvalidAnimals?` 字段
- `shared/actions/helpers/animal-zones.ts`：暴露 `computeInvalidAnimalsForZone(state, player, zone)` helper；`enforceAnimalCapacity` 末尾**仅 dispatch 不调整**——返回 invalid list 由调用方决定怎么处理
- 单卡 listener：在 `before:reorganize` / `before:place-farmer` 等阶段调 helper，依结果做 reject reorg / 提示 UI / cardStates listener 自调整。**完全卡内闭环**

每卡 implementation 等价 BGA `getInvalidAnimals` logic（见 `Cards/C/C11_WildlifeReserve.php:38-61` 等 11 张原卡）；执行响应（怎么 reject）卡内自取自管。

消费（F-zone 11 卡）：

| Card | BGA constraint |
| ---- | -------------- |
| C11 WildlifeReserve | 1 sheep + 1 boar + 1 cattle |
| C12 CattleFarm | dynamic cap = `count(pastures)` |
| B11 Feedyard | dynamic cap = `count(pastures)` |
| C148 MudWallower | PIG only + dynamic cap by rooms held |
| C86 LivestockFeeder | grain-based dynamic |
| C9 AutomaticWaterTrough | filter by `getValidAnimals()` zone type |
| E11 PettingZoo | adjacent room conditional |
| E33 BeaverColony | pasture restriction（BGA 移到 PlayerBoard.php 主路径 — 我方可继续放卡内 hook） |
| E36 HerbalGarden | pasture restriction（同 E33） |
| E86 PenBuilder | anytime add validation |

注意：F-zone 涉及的卡有些与其他 family 重叠（如 B11 也是 F4/F7、C148 也是 F11、C9 也是 F1/F4）。这些卡的**主 family fix** 仍在原 family 内，**zone constraint 部分**走 F-zone hook。Implementation 时分两 commit：
- 主 family commit（如 B11 在 F4/F7 commit 内修 onEndHarvestBreedPhase）
- F-zone commit（B11 加 `getInvalidAnimals` hook 实现）

## 3. 实施序（plan 内按依赖排）

### 3.1 串行依赖

```
F0 helpers (含 onBeforePlayerTurn + getInvalidAnimals hook)
  → F2 + F12 quick wins (D134 现可解锁)
  → F8 chooseOne
  → F1 batch (含 C9 主 fix，但 C9 的 zone constraint 等 F-zone)
  → F4 batch
  → F7 batch
  → F5 + F6 holder/futureMeeples
  → F9 + F10
  → F-zone batch (11 张卡 getInvalidAnimals impl，C11 现可解锁)
  → F3 + F11 + verify-only
  → docs sync → PR
```

### 3.2 各 family 工作量（来自 family-grouping.md）

| Family | Cards | Days | 备注 |
| ------ | ----- | ---- | ---- |
| F0 helpers | 2 helper + 1 leaf + 2 hook | 1.5 | 串行先做（含 onBeforePlayerTurn + getInvalidAnimals） |
| F2 counter writes | 4 | 0.5-1 | B132 saturation; D134 用新 onBeforePlayerTurn hook |
| F12 zone metadata | 1 (B10 only; C11 推 F-zone) | 0.1 | B10 single-line |
| F-zone (新) | 11 | 2-3 | per-card getInvalidAnimals 实现，BGA 直接镜像 |
| F8 chooseOne | 5 (E123 推 F11) | 1 | E60 trade-style 实现待定 |
| F1 onBuy 截断 | 12 | 4-5 | per-card 工作量大 |
| F4 cost/capacity | 7 | 3-4 | per-card |
| F7 harvest phase | 6 | 2-3 | 部分跨 F1/F4 已修 |
| F5 holder pay | 3 | 1-1.5 | D106/D114 复杂 |
| F6 futureMeeples | 3 | 1-1.5 | B106 verify-only |
| F9 4p variants | 5 | 1.5-2 | 用 pairedSpaceIdFor |
| F10 opponent scope | 3 | 1-1.5 | A82 用 take-from-space |
| F11 one-pits | 8 | 5-7 | C146 / B132 / E123 / D74 / A132 / B21 / C148 / B161 |
| F3 place-farmer-from-supply | 2 | 1-2 | B22 内 markedSpaceId / B161 加 computeArgsPlaceFarmer hook |
| docs sync | — | 0.5 | §2.0 / §2.3 / §8 / §0 / §8 master-plan |
| **Total** | 61 + 3 verify | **19-23 day** | F-zone 加 2-3 day，hook 加 0.5 day |

### 3.3 Cross-family cards 计入

某张卡跨 2 family 时归入"主 family"避免重复：
- B132 → F2（saturation flag write 是主 fix；F11 为 cross-family ref）
- C146 → F11（pair-chooser 是核心；F1 onBuy 是 SE 派发）
- D106 / D114 → F5（card-holder 是核心；F6 futureMeeples 是 implementation 细节）
- B161 → F3（computeArgsPlaceFarmer hook；F11 ref）
- C9 → F1（onBuy 多分支 + zone gate；F4 ref）

## 4. Test strategy

每张卡 ≥1 例 session test（断言 state / pending / scores / log，不断言 DOM）。helpers 各 ≥3 例 unit test。verify-only 卡也写 1 例 session test。

总 ~70 例新 session test + ~10 例 unit test。

## 5. Files touched (大致)

- 新文件：`shared/cards/helpers/space-pairing.ts`、`shared/actions/effects/internal/take-from-space.ts`
- 修改：61 张卡 fix（每张 1 文件）+ 内部 actions registry + types extension（如 zone schema）
- 测试：~70 个 session test 文件 + 10 个 unit test
- 文档：`docs/card_progress.md` §2.0 / §2.3 / §2.5（B22 markForRemoval pattern 登记）/ §8；`docs/master-plan.md` §0 / §8；`docs/ENGINE_ARCHITECTURE.md`（如新增 hook）。

## 6. Out of scope

- i18n 缺口（437 BGA `clienttranslate` + 71 卡内 key）—— 单独 sprint
- 14 张 stale-name 名单（Sprint 7 audit 已识别 typo）—— 已在 Sprint 7 docs sync 处理
- §2.4 微残（C13 discount stone:1 / D30 prereq）—— 单独 fix，不在 7a 范围
- §2.6 D159 Reed Seller —— 需要 "可阻止行动 + 拍卖式选择" 系统，单独评估

## 7. Risk / open questions

- **F11 复杂卡爆基建需求**：C146 pair-chooser SE / D74 wood-spent rollover / B161 computeArgsPlaceFarmer 可能引入新 hook phase 或 engine 改动。Implementation 时 fallback：基建大改的卡降级 §2.5 deliberate divergence + Sprint 7b。
- **C11 zone schema 扩展**：`perTypeCap` / `constraints` 字段如果太多场景，可能引发 zone system 改造。先用 listener 模式 fallback（在 `onAddAnimalToZone` listener 内 enforce 类型上限）。
- **PR review 量大**：61 张卡 + 测试 + helpers + docs 一次性 review。Implementation 时按 family 顺序 commit，便于 reviewer 分批理解。
- **Wall-clock 长**：3-4 周单 dev。如果中途 user 想暂停或部分 cherry-pick，分支可保留 + 部分 cards 单独 PR cherry-pick。

## 8. Definition of Done

- [ ] F0 helpers + unit tests
- [ ] F1-F12 各 family 卡修完 + session test 各 1 例（含 verify-only 3 卡）
- [ ] B22 markForRemoval pattern 文档登记
- [ ] `card_progress.md` §2.0 changelog + §2.3 ✅ 标 + §2.5 (B22 pattern) + §8 timeline
- [ ] `master-plan.md` §0 ⚠/❌ residual `50/11 → 0/0` + §8 progress row
- [ ] 本地 fast / lint / build 全过
- [ ] PR opened, rebase merged to main
- [ ] master-plan §0 严格判定 ⚠=0 / ❌=0 真正达成

## 9. Sequence (high-level — full plan via writing-plans)

1. F0 helpers + unit test（~1 day）
2. F2 + F12 quick wins（~1-1.3 day）
3. F8 chooseOne 改造（~1 day）
4. F1 onBuy 截断 batch（~4-5 day，最大 family）
5. F4 cost/capacity batch（~3-4 day）
6. F7 harvest phase batch（~2-3 day，与 F1/F4 部分重叠）
7. F5 + F6 holder/futureMeeples（~2-3 day）
8. F9 + F10 + F3 listener 调整（~3-5 day）
9. F11 one-pits（~5-7 day，最难）
10. verify-only 3 卡（~0.5 day）
11. docs sync + PR + rebase merge（~1 day）

每完成一 family，commit 一组（family + 测试），便于后期 review。

总 ~17-20 day。
