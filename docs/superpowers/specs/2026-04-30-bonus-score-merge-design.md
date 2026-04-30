# Bonus Scoring 求解器化重构 Design

**Date**: 2026-04-30
**Status**: brainstormed, awaiting user review
**Owner**: 工程债收尾（B 子项）

---

## 1. Goal

把 bonus scoring 从"vibes-based 优先级排序"重写为"pay-style 求解器"：
- 删除 `CardEffect.computePostScore` 字段（5 张卡迁入 `computeBonusScore`）
- 删除 `CardEffect.scoringPriority` 字段（不再需要全局排序）
- 删除 `ScoringContext.reserved` 字段（求解器内部扣 `player.resources`，下游直接读 `player.resources`）
- 5 张 "costed" bonus 卡（消耗资源换 VP）改为申报 `BonusScoreLevel[]`，由求解器枚举笛卡尔积找 Pareto 最优组合
- 50 张 "free" bonus 卡保持单值返回 `number`（D60 等 resource-aware 卡靠求解器先扣资源再读 `player.resources`）
- `computeSharedPostScore`（A135 / C136 跨玩家分数调整）不变

**为什么不留 priority/reserved**：当前模型每加一张 costed bonus 卡都要懂全图（priority 数值 + reserved 累加协议），错了静默给错分数。pay-style 求解器数学上保证 Pareto 最优，每张卡只需声明自己的"levels"，零外部耦合。这跟 D95 SiteManager 用 4 个 optional bonus → 求解器自然展开 16 条变体 + `keepOnlyOptimals` 是同一个思路（见 `2026-04-23-d95-site-manager-design.md`）。

**成功标准**：
- `CardEffect.computePostScore`、`CardEffect.scoringPriority`、`ScoringContext.reserved` 字段全部删除
- 5 张 postScore 卡（D100 / C31 / C135 / D132 / E159）迁入新 hook
- 5 张 costed 卡（A136 / C99 / C133 / E132 / D132）改用 `computeCostedBonus` 返回 levels[]
- 50 张 free 卡（含 D60 resource-aware）保持 `computeBonusScore` 返回 number
- 求解器算出的 best combo 与现有 priority+reserved 贪心方案在所有现有测试场景下产生 ≥ 等同 VP（数学上 Pareto 最优 ≥ 贪心）
- `pnpm test:fast` + `lint` + `build` + `check:reaches` + `check:prompt-sync` 全绿

---

## 2. Architecture

### 2.1 现状（Before）

- 卡分两路：`computeBonusScore`（11 张）+ `computePostScore`（5 张）
- `computeBonusScore` 卡按 `scoringPriority` 升序贪心：每张读 `player.resources - ctx.reserved`，决定取多少，把消耗写回 `ctx.reserved`
- A136 priority=0 / C133 priority=10 是凭直觉调出来的
- `computePostScore` 卡在所有 categories 算完后再跑，签名 `(state, player, categories) => number`
- D60 LargePottery 用 `computeBonusScore` 但不写 reserved（只读其他卡 reserve 后剩余 clay 算 VP）
- D132 (新迁入) 直接 mutate `player.resources.food`

### 2.2 新架构（After）

- 卡分两路：`computeBonusScore`（free, 50 张, 返回 number）+ `computeCostedBonus`（costed, 5 张, 返回 levels[]）
- 求解器：枚举所有 costed 卡的 levels 笛卡尔积，过滤总 cost 超资源的组合，对每个组合算 free 卡 score（free 卡读 player.resources 中已扣后的剩余值，但**先用快照算所有组合再 commit**），取 max(costedScore + freeScore) 组合 = best combo
- best combo 一旦确定，求解器 mutate **传入的 player 对象的 `resources`**（在 `scoring.ts` 调用点这是一个 shallow clone，见 §2.3）
- 后续步骤（cardStateBonusVp push、Major 卡 scoring、sharedPostScore）直接读那个**同一个 clone 的 `resources`**，看到已扣后的剩余值
- 删除 `scoringPriority`、`ctx.reserved`

### 2.3 关键设计决策

- **`computeScores` 必须是纯函数**：UI 可能多次调用（重渲染 / 状态比较）；如果 mutate 真实 `player.resources`，重复调用会重复扣资源。因此 `scoring.ts` 在调用求解器前做一次 shallow clone：
  ```typescript
  const playerForBonus = { ...player, resources: { ...player.resources } }
  ```
  把 `playerForBonus` 而非 `player` 传给求解器。**Major scoring 也读 `playerForBonus.resources`**（不读真实 `player.resources`）。求解器内部 mutate 这个 clone 是安全的——clone 在 `computeScores` 一次调用结束后就被丢弃。
- **求解器与 handlers 的契约**：求解器 + free / costed handler 只允许 mutate `player.resources`（因为 scoring.ts 给的是带 resources 浅拷贝的 clone）。其他字段（`fields`、`cardStates`、`pastures` 等）共享 reference，**必须只读**。否则 mutation 会泄漏回真实 player。
- **BGA 的 "reserve" 概念被淘汰**：BGA 的 reserve 是 PHP 实现细节限制，不是好设计；新架构通过"求解器在 clone 上 commit、下游同 clone 读"实现等效"取剩余资源"语义，更直观。
- **D60 不需特殊处理**：求解器 commit 后 D60 的 `computeBonusScore` 直接读 `player.resources.clay`（这里 `player` 实参就是 clone，已扣过）即可。
- **Major 卡 scoring**：当前在 `scoring.ts:273-277` 用 `player.resources - reserved`，改为直接 `playerForBonus.resources`（求解器已 commit 完）。
- **求解器复杂度**：5 张 costed 各自的 level 数 ≤ 16（D132 penalty 上限），笛卡尔积 ≤ 4 × 4 × 4 × 4 × 16 ≈ 4096 组合，每个组合算 50 张 free 卡 score → ~200K ops / 玩家，单次 scoring 远 < 100ms

---

## 3. Components

### 3.1 接口（`shared/cards/card-effects.ts`）

```typescript
export type ScoreCategoryResult = { /* ... 已存在 ... */ }

export type BonusScoringContext = {
  /** Snapshot of standard categories at the start of bonus phase
   *  (fields / pastures / grains / vegetables / sheeps / boars / cattles /
   *   empty / stables / clayRooms / stoneRooms / farmers / cards / cardsBonus).
   *  Read-only — bonus cards must not mutate. */
  categories: readonly ScoreCategoryResult[]
}

export type BonusScoreLevel = {
  /** Resource cost of selecting this level (subtracted from player.resources on commit). */
  cost: Partial<Resource>
  /** VP awarded for this level. */
  score: number
}

export type CardEffect = {
  ...
  // 旧字段 computeBonusScore (state, player, ctx) => number 接口签名修改
  computeBonusScore?: (
    state: GameState,
    player: PlayerState,
    ctx: BonusScoringContext,
  ) => number

  // 新字段
  computeCostedBonus?: (
    state: GameState,
    player: PlayerState,
    ctx: BonusScoringContext,
  ) => BonusScoreLevel[]

  // 删除：computePostScore, scoringPriority
}
```

**删除**：
- `CardEffect.computePostScore?: (state, player, categories) => number`
- `CardEffect.scoringPriority?: number`
- `ScoringContext.reserved` 字段（整个 type alias 改名为 `BonusScoringContext`）
- `cardEffectHooks` 数组中的 `'computePostScore'`
- `CardEffectField` 联合类型中的 `'computePostScore'`

**新增**：
- `CardEffectField` 加入 `'computeCostedBonus'`
- `cardEffectHooks` 数组加入 `'computeCostedBonus'`

### 3.2 求解器（`shared/logic/scoring-bonus-solver.ts`，新文件）

```typescript
import type { Resource, PlayerState, GameState } from '../game/types'
import type { BonusScoreLevel, BonusScoringContext } from '../cards/card-effects'

type FreeHandler = (state: GameState, player: PlayerState, ctx: BonusScoringContext) => number
type CostedHandler = (state: GameState, player: PlayerState, ctx: BonusScoringContext) => BonusScoreLevel[]

export type SolverInput = {
  state: GameState
  player: PlayerState
  ctx: BonusScoringContext
  freeHandlers: { cardId: string; handler: FreeHandler }[]
  costedHandlers: { cardId: string; handler: CostedHandler }[]
}

export type SolverResult = {
  /** Per-card score breakdown (for cardStateBonusVp accumulation + log). */
  entries: Array<{ cardId: string; score: number; cost: Partial<Resource> }>
  /** Sum of all entry.score. */
  totalScore: number
  /** Sum of all costs (subtracted from player.resources). */
  totalCost: Partial<Resource>
}

export function solveBonusScoring(input: SolverInput): SolverResult {
  const { state, player, ctx, freeHandlers, costedHandlers } = input
  const playerResourcesSnapshot = { ...player.resources }

  // 1. Collect levels per costed card
  const allLevels: { cardId: string; levels: BonusScoreLevel[] }[] = costedHandlers.map(({ cardId, handler }) => ({
    cardId,
    levels: handler(state, player, ctx),
  }))

  // 2. Enumerate Cartesian product
  let bestScore = -Infinity
  let bestCombo: { cardId: string; level: BonusScoreLevel }[] = []
  let bestCost: Partial<Resource> = {}

  function recurse(idx: number, accCombo: { cardId: string; level: BonusScoreLevel }[], accCost: Partial<Resource>) {
    if (idx === allLevels.length) {
      // Check feasibility
      if (!canAfford(playerResourcesSnapshot, accCost)) return
      // Apply cost to a clone of player.resources for free handlers to read
      const clonedResources = subtractResources(playerResourcesSnapshot, accCost)
      const playerClone = { ...player, resources: clonedResources }
      // Compute free score on cloned state
      const costedScore = accCombo.reduce((sum, { level }) => sum + level.score, 0)
      const freeScore = freeHandlers.reduce((sum, { handler }) => sum + handler(state, playerClone, ctx), 0)
      const total = costedScore + freeScore
      if (total > bestScore) {
        bestScore = total
        bestCombo = [...accCombo]
        bestCost = { ...accCost }
      }
      return
    }
    for (const level of allLevels[idx].levels) {
      const nextCost = addResources(accCost, level.cost)
      // Pareto pruning: skip if cost already exceeds resources
      if (!canAfford(playerResourcesSnapshot, nextCost)) continue
      accCombo.push({ cardId: allLevels[idx].cardId, level })
      recurse(idx + 1, accCombo, nextCost)
      accCombo.pop()
    }
  }
  recurse(0, [], {})

  // 3. Commit: mutate player.resources
  for (const [res, amt] of Object.entries(bestCost)) {
    player.resources[res as keyof Resource] = (player.resources[res as keyof Resource] ?? 0) - (amt ?? 0)
  }

  // 4. Compute free entries on committed state (re-call so log records final scores)
  const freeEntries = freeHandlers.map(({ cardId, handler }) => ({
    cardId,
    score: handler(state, player, ctx),
    cost: {} as Partial<Resource>,
  }))
  const costedEntries = bestCombo.map(({ cardId, level }) => ({
    cardId,
    score: level.score,
    cost: level.cost,
  }))

  return {
    entries: [...freeEntries, ...costedEntries],
    totalScore: bestScore === -Infinity ? 0 : bestScore,
    totalCost: bestCost,
  }
}

function canAfford(have: Partial<Resource>, need: Partial<Resource>): boolean {
  for (const [k, v] of Object.entries(need)) {
    if ((have[k as keyof Resource] ?? 0) < (v ?? 0)) return false
  }
  return true
}

function addResources(a: Partial<Resource>, b: Partial<Resource>): Partial<Resource> {
  const out: Partial<Resource> = { ...a }
  for (const [k, v] of Object.entries(b)) {
    out[k as keyof Resource] = (out[k as keyof Resource] ?? 0) + (v ?? 0)
  }
  return out
}

function subtractResources(a: Partial<Resource>, b: Partial<Resource>): Partial<Resource> {
  const out: Partial<Resource> = { ...a }
  for (const [k, v] of Object.entries(b)) {
    out[k as keyof Resource] = Math.max(0, (out[k as keyof Resource] ?? 0) - (v ?? 0))
  }
  return out
}
```

### 3.3 scoring.ts 重构

```diff
  // ... std categories already pushed (fields/pastures/.../cards/cardsBonus) ...

- const bonusScoreResult = collectBonusScores(state, player)
- const reserved = bonusScoreResult.reserved
+ const categoriesSnapshot = [...categories] as readonly ScoreCategoryResult[]
+ const bonusCtx: BonusScoringContext = { categories: categoriesSnapshot }
+ const allCards = [...player.improvements, ...player.minorPlayed, ...player.occupationPlayed]
+ const freeHandlers = allCards
+   .map(cardId => ({ cardId, effect: getCardEffect(cardId) }))
+   .filter(({ effect }) => effect?.computeBonusScore)
+   .map(({ cardId, effect }) => ({ cardId, handler: effect!.computeBonusScore! }))
+ const costedHandlers = allCards
+   .map(cardId => ({ cardId, effect: getCardEffect(cardId) }))
+   .filter(({ effect }) => effect?.computeCostedBonus)
+   .map(({ cardId, effect }) => ({ cardId, handler: effect!.computeCostedBonus! }))
+ const solverResult = solveBonusScoring({ state, player, ctx: bonusCtx, freeHandlers, costedHandlers })

  // ... cardStateBonusVp accumulation ...
  let cardStateBonusVp = 0
  if (player.cardStates) {
    Object.entries(player.cardStates).forEach(([cardId, cardState]) => {
      if (cardId === '__pendingChoice__') return
      const vp = cardState.counters?.bonusVp ?? 0
      if (vp > 0) cardStateBonusVp += vp
    })
  }
- for (const entry of bonusScoreResult.entries) {
+ for (const entry of solverResult.entries) {
    cardStateBonusVp += entry.score
  }

  if (cardStateBonusVp > 0) {
    categories.push({ key: 'cardStateBonusVp', total: cardStateBonusVp, entries: [...] })
  }

  // ... beggings, no change ...

- // Post-scoring card hooks
- const allCards = [...player.improvements, ...player.minorPlayed, ...player.occupationPlayed]
- let postScoreVp = 0
- for (const cardId of allCards) {
-   const effect = getCardEffect(cardId)
-   if (effect?.computePostScore) {
-     postScoreVp += effect.computePostScore(state, player, categories)
-   }
- }
- applyPostScoreAdjustment(categories, postScoreVp)

  // ... sharedPostScore unchanged ...
```

Major 卡 scoring（line 273-277）：
```diff
  if (card.scoring) {
-   const resourceCount = Math.max(
-     0,
-     (player.resources[card.scoring.resource] ?? 0) - (reserved[card.scoring.resource] ?? 0),
-   )
+   const resourceCount = Math.max(0, player.resources[card.scoring.resource] ?? 0)
    const bonusScore = scoreByMap(resourceCount, card.scoring.map)
    ...
  }
```

注意：求解器在 `collectBonusScores` 替换后已 commit 了 `playerForBonus.resources -= totalCost`（在 `scoring.ts` 是 clone，不动真 player），Major 卡 scoring 改读同一个 `playerForBonus.resources` 即可。**关键顺序**：求解器必须在 Major scoring 之前跑——这本来就是当前顺序（bonus → cardStateBonusVp → ... → cards/cardsBonus 实际是更早 push 的，但 Major scoring 用 `playerForBonus.resources` 当下值，求解器扣了之后下次读自然是更新后值）。

**为什么用 clone 而不是真 mutate**：`computeScores` 是纯函数（UI 多次调用不应重复扣资源）。在调用求解器之前，scoring.ts 做一次 shallow clone：

```typescript
const playerForBonus = { ...player, resources: { ...player.resources } }
const bonusScoreResult = solveBonusScoring({ state, player: playerForBonus, ctx, freeHandlers, costedHandlers })
// ... Major scoring 读 playerForBonus.resources
```

求解器内部 mutate `playerForBonus.resources` 是安全的；handlers 只允许 mutate `resources`，不得改 `fields` / `cardStates` / `pastures` 等（共享 reference）。

**Wait — 顺序检查**：当前 scoring.ts 顺序：
1. 标准 categories push (line 200-260)
2. **Major scoring (line 268-288)** — 读 `player.resources - reserved`
3. cards / cardsBonus push (line 302-311)
4. `collectBonusScores` (line 263) ← 实际在 Major scoring 之前

让我重新读 scoring.ts 确认。

实际 scoring.ts 顺序见 3.3 spec 章节实现时复核。求解器必须在 Major scoring 前跑（这样 Major scoring 看到求解器扣后的 `player.resources`）。如果当前顺序已经是 collectBonusScores 在 Major scoring 之前，则保持；否则调换顺序使求解器先跑。

### 3.4 5 张 costed 卡迁移

#### A136 DrudgeryReeve
```typescript
computeCostedBonus: (_state, player, _ctx) => {
  const wood = player.resources.wood ?? 0
  const clay = player.resources.clay ?? 0
  const stone = player.resources.stone ?? 0
  const reed = player.resources.reed ?? 0
  const maxSets = Math.min(wood, clay, stone, reed, 3)
  const BONUS_BY_SETS = [0, 1, 3, 5]
  return Array.from({ length: maxSets + 1 }, (_, k) => ({
    cost: k === 0 ? {} : { wood: k, clay: k, stone: k, reed: k },
    score: BONUS_BY_SETS[k] ?? 0,
  }))
},
// onBuy 不变
// 删除 scoringPriority
```

#### C133 Soldier
```typescript
computeCostedBonus: (_state, player, _ctx) => {
  const wood = player.resources.wood ?? 0
  const stone = player.resources.stone ?? 0
  const maxPairs = Math.min(wood, stone)
  return Array.from({ length: maxPairs + 1 }, (_, k) => ({
    cost: k === 0 ? {} : { wood: k, stone: k },
    score: k,
  }))
},
// 删除 scoringPriority
```

#### E132 VeggieLover
```typescript
computeCostedBonus: (_state, player, _ctx) => {
  const grain = player.resources.grain ?? 0
  const veg = player.resources.vegetable ?? 0
  const maxStacks = Math.min(grain, veg, 3)
  const BONUS_BY_STACKS = [0, 2, 4, 6]
  return Array.from({ length: maxStacks + 1 }, (_, k) => ({
    cost: k === 0 ? {} : { grain: k, vegetable: k },
    score: BONUS_BY_STACKS[k] ?? 0,
  }))
},
```

#### C99 GardenDesigner
```typescript
computeCostedBonus: (_state, player, _ctx) => {
  const emptyFields = player.fields.filter(f => fieldIsEmpty(f)).length
  if (emptyFields === 0) return [{ cost: {}, score: 0 }]
  const food = player.resources.food ?? 0
  // Each empty field can take 0/1/4/7 food → 0/1/2/3 VP
  // Levels = each combination of how many fields take which option
  // Simplified: enumerate (numAt7, numAt4, numAt1) where numAt7+numAt4+numAt1 ≤ emptyFields
  const levels: BonusScoreLevel[] = []
  for (let n7 = 0; n7 <= emptyFields; n7++) {
    for (let n4 = 0; n4 + n7 <= emptyFields; n4++) {
      for (let n1 = 0; n1 + n4 + n7 <= emptyFields; n1++) {
        const foodCost = 7 * n7 + 4 * n4 + 1 * n1
        if (foodCost > food) continue
        const score = 3 * n7 + 2 * n4 + 1 * n1
        levels.push({ cost: { food: foodCost }, score })
      }
    }
  }
  // Pareto prune: same cost, lower score → remove
  return paretoOptimal(levels)
},
```

注：C99 levels 比其他 4 张多（emptyFields × 3 选项），但 emptyFields ≤ 5，最多 ~30 raw levels。`paretoOptimal()` helper（卡内 dedup）保留每个 food cost 下的 max VP，剪枝后通常 ≤ 8 levels。求解器笛卡尔积 4 × 4 × 4 × 8 × 16 ≈ 8K，可接受。

```typescript
// shared/cards/helpers/pareto-bonus.ts (new helper, C99 用)
function paretoOptimal(levels: BonusScoreLevel[]): BonusScoreLevel[] {
  // 单资源场景：同 cost 取 max score
  // 多资源场景需 dominance 检查（本 spec C99 只有 food，单维度足够）
  const key = (cost: Partial<Resource>) => JSON.stringify(cost)
  const best = new Map<string, BonusScoreLevel>()
  for (const lv of levels) {
    const k = key(lv.cost)
    const ex = best.get(k)
    if (!ex || lv.score > ex.score) best.set(k, lv)
  }
  return [...best.values()]
}
```

#### D132 HideFarmer (新迁入)
```typescript
computeCostedBonus: (_state, _player, ctx) => {
  const emptyCat = ctx.categories.find(c => c.key === 'empty')
  if (!emptyCat || emptyCat.total >= 0) return [{ cost: {}, score: 0 }]
  const penalty = Math.abs(emptyCat.total)
  return Array.from({ length: penalty + 1 }, (_, k) => ({
    cost: k === 0 ? {} : { food: k },
    score: k,  // offset penalty: each food paid → +1 VP back
  }))
},
```

### 3.5 4 张 free 卡迁入（postScore → bonus）

#### E159 OldMiser
```typescript
computeBonusScore: (_state, player) => -familySize(player),
```

#### D100 LordoftheManor
```typescript
computeBonusScore: (_state, _player, ctx) => {
  const standardCategories = ['fields', 'pastures', 'grains', 'vegetables', 'sheeps', 'boars', 'cattles']
  return ctx.categories.filter(cat => standardCategories.includes(cat.key) && cat.total >= 4).length
},
```

#### C31 WritingChamber
```typescript
computeBonusScore: (_state, _player, ctx) => {
  const negativeTotal = ctx.categories.reduce((sum, cat) => sum + Math.min(0, cat.total), 0)
  return Math.min(7, Math.abs(negativeTotal))
},
```

#### C135 Constable
```typescript
computeBonusScore: (_state, _player, ctx) => {
  return ctx.categories.some(cat => cat.total < 0) ? 0 : 3
},
```

### 3.6 D60 LargePottery（resource-aware free 卡）

```typescript
computeBonusScore: (_state, player, _ctx) => {
  const clay = player.resources.clay ?? 0
  if (clay >= 7) return 4
  if (clay >= 6) return 3
  if (clay >= 5) return 2
  if (clay >= 3) return 1
  return 0
},
// 删除 ctx?.reserved 引用 — 求解器已扣，player.resources.clay 是剩余值
```

---

## 4. Data Flow

```
[scoring.ts 单玩家 loop]
  ├─ 标准 categories push (fields / .../farmers / cards / cardsBonus)
  ├─ categoriesSnapshot = [...categories]
  ├─ ★ solveBonusScoring(state, player, ctx, freeHandlers, costedHandlers)
  │     ├─ Enumerate costed levels Cartesian product
  │     │   (5 张 costed 卡，每张 0..N 个 level)
  │     ├─ For each combination:
  │     │   ├─ totalCost = sum levels.cost
  │     │   ├─ feasible? player.resources >= totalCost
  │     │   ├─ playerClone = clone with resources -= totalCost
  │     │   ├─ freeScore = sum free handlers(playerClone, ctx)
  │     │   ├─ totalScore = costedScore + freeScore
  │     │   └─ track best
  │     ├─ Commit: player.resources -= bestCost
  │     ├─ Re-call free handlers on real player → record final entries
  │     └─ Return { entries, totalScore, totalCost }
  ├─ cardStateBonusVp accumulate (counters.bonusVp + solverResult.entries)
  ├─ Major 卡 scoring（直接读 player.resources，已扣）
  └─ sharedPostScore（不变）
```

注：求解器内部对每个候选组合 clone player → 算 free score，找到最优后**再 commit 真 player**（mutate），最后再调一次 free handlers 让 entries 含正确分数（用于日志/UI）。

---

## 5. Error Handling

- 求解器：所有候选组合 cost 都超资源时，best combo = 全 level 0（cost {}, score 0），不 mutate 资源
- handler 抛错（custom card）：try/catch 跳过，最优解中该卡 score = 0（已存在逻辑沿用）
- D60 / Major scoring 读 `player.resources` 时若被求解器扣到 < 0：`Math.max(0, ...)` 兜底（求解器保证不超资源，理论不会触发）
- C99 levels 数 > 100 时（emptyFields > 5 不可能，标准农场 1-5 fields）：理论上限内，无需特殊保护

---

## 6. Testing

### 6.1 求解器单元测试（`shared/logic/__tests__/scoring-bonus-solver.test.ts`，新文件）

- **空 input**：0 free + 0 costed → totalScore=0, totalCost={}
- **纯 free**：1 卡返回 5 → totalScore=5, totalCost={}
- **纯 costed 单卡**：A136 模式（max=2 sets）+ 充足资源 → 选 max=2 → score=3, cost={wood:2,clay:2,stone:2,reed:2}
- **costed 资源不足**：A136 max=2 但只有 1 wood → 选 1 set → score=1
- **多 costed 协调**：A136 + C133 互争 wood/stone → 求解器选 Pareto 最优组合
- **resource-aware free + costed**：A136 + D60 模式 → 求解器枚举 A136 取 0/1/2/3 套，每个组合下 D60 看剩余 clay 算 → 选最优
- **commit 后 player.resources 真扣**：断言 mutate 发生
- **Pareto 剪枝**：相同 cost 不同 score 的 level 只保留 max-score（C99 helper）

### 6.2 5 张 costed 卡 session 测试更新

- `A136_DrudgeryReeve-session.test.ts`：现有断言不变（最优 = max sets），但底层走求解器
- `C133_Soldier-session.test.ts`：同上
- `E132_VeggieLover-session.test.ts`：同上
- `C99_GardenDesigner-session.test.ts`：同上
- 新增 `D132_HideFarmer-session.test.ts`：构造 empty=-3 + food=5 → 求解器扣 3 food, +3 VP

### 6.3 4 张 free 卡迁入测试

- `E159_OldMiser-session.test.ts`：existing if any，新增 `computeBonusScore` 路径断言
- `D100_LordoftheManor-session.test.ts`：构造 4-cap 多个 category 断言
- `C31_WritingChamber-session.test.ts`：负分总和 cap=7
- `C135_Constable-session.test.ts`：有/无负分两 case

### 6.4 D60 + 求解器协调测试

- `D60_LargePottery-reserved.test.ts`（rename）：A136 取 K 套时 D60 看剩余 clay 算 VP，求解器找 max(A136.score + D60.score)

### 6.5 回归

- 现有 50 张 free bonus 卡 session 测试不受影响（接口变化但 `_ctx` 忽略）
- Major 卡 scoring 测试（ClayOven / StoneOven 等）不受影响（player.resources 现在是求解器扣后值，scoring 公式不变）

### 6.6 TDD 顺序

1. **C1（红）** 写求解器单元测试 + 5 张 costed 卡的 session 测试断言新接口 → 全部失败
2. **C2（绿）** 写 `solveBonusScoring()` + 替换 scoring.ts 的 `collectBonusScores` 调用 → 求解器测试转绿
3. **C3（绿）** 5 张 costed 卡迁 `computeCostedBonus` + 4 张 postScore 卡迁 `computeBonusScore` + D60 改 `player.resources` 直读 → session 测试转绿
4. **C4（清理）** 删除 `CardEffect.computePostScore` / `CardEffect.scoringPriority` / `ScoringContext.reserved` + Major scoring 改 `player.resources` 直读 + 影响面文件清理
5. **C5（docs）** card_progress.md §2.0 + §3 + ENGINE_ARCHITECTURE.md + CUSTOM_CARD_SANDBOX.md + llmPrompts.ts + audit script

---

## 7. 影响面清理（C4 阶段处理）

- `client/services/llmPrompts.ts` —— LLM prompt 中 `computePostScore` / `scoringPriority` / `ctx.reserved` 引用清理；新增 `computeCostedBonus` + `BonusScoreLevel` 文档
- `shared/custom-code/__tests__/ast-validator.test.ts` —— sandbox 允许字段名更新（删 computePostScore / scoringPriority，加 computeCostedBonus）
- `scripts/audit-card-architecture.ts` —— 检测脚本中的 hook 关键字
- `docs/CUSTOM_CARD_SANDBOX.md` —— hook 列表 + 示例
- `docs/ENGINE_ARCHITECTURE.md` —— 如有提到 scoring/bonus hook 列表
- `docs/card_progress.md` §2.0 changelog + §3 基础设施清单加"bonus scoring 求解器（2026-04-30）"
- `tests/llm-card-gen/fixtures/M4_endgame-vp.ts` —— fixture 内引用清理

---

## 8. Out of Scope

- `computeSharedPostScore`（A135 / C136）：跨玩家分数调整，签名不同，不动
- BGA `orderComputeCardCosts` ranking：本 spec 无关，既往 deliberate divergence 不动
- 求解器记忆化 / 进一步剪枝优化：本 spec 实现 brute-force + 简单 Pareto 即可，未来如性能瓶颈再优化

---

## 9. 工时估算

- C1（红测试 + 求解器规约）：~1.5h
- C2（求解器实现）：~2h
- C3（5 costed + 4 postScore + D60 + Major scoring 迁移）：~2h
- C4（删字段 + 影响面清理 + 全套测试再过）：~1.5h
- C5（docs）：~30min
- CI 等待：~10min
- **总计**：~7-8h（一天）
