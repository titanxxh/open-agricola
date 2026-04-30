# computePostScore → computeBonusScore 双轨合并 Design

**Date**: 2026-04-30
**Status**: brainstormed, awaiting user review
**Owner**: 工程债收尾（B 子项）

---

## 1. Goal

合并 `computePostScore` 与 `computeBonusScore` 两个 scoring hook 为单一 `computeBonusScore`，删除 `CardEffect.computePostScore` 字段及对应 scoring.ts loop。`computeSharedPostScore`（跨玩家分数调整）不在合并范围内。

**成功标准**：
- `CardEffect.computePostScore` 字段 + `cardEffectHooks` 数组中相应入口 + scoring.ts 第二个 loop 完全删除
- 5 张原 `computePostScore` 卡（D100 / C31 / C135 / D132 / E159）改用 `computeBonusScore`，行为对齐原值
- 现有 11 张 `computeBonusScore` 卡（含 A136 DrudgeryReeve / C133 Soldier / E132 VeggieLover / D60 LargePottery / E134 Omnifarmer / E149 MidnightFencer 等）在新 ctx 接口下行为不变
- `pnpm test:fast` + `pnpm run lint` + `pnpm run build` + `pnpm run check:reaches` + `pnpm run check:prompt-sync` 全绿

---

## 2. Architecture

**双轨存在的原因**（合并前）：
- `computeBonusScore(state, player, ctx)`：在标准 categories 计算**之前**跑，可写 `cardStateBonusVp`，通过 `ctx.reserved` 协商资源（让 Major 卡 scoring 看到剩余可用资源）
- `computePostScore(state, player, categories)`：在所有 categories（含 cardStateBonusVp）算完**之后**跑，能看 `categories[].total`，做"看其它 category 决定加多少分"的事

**合并的关键观察**：5 张 `computePostScore` 卡需要看的 categories 在 bonus 阶段开始时**已经全部存在**（fields / pastures / grains / vegetables / sheeps / boars / cattles / empty / stables / clayRooms / stoneRooms / farmers / cards / cardsBonus 都在 line 302-311 之前已 push）。bonus 卡之间通过 `cardStateBonusVp` 累加，不向 categories 数组 push。所以快照 = bonus 之前 categories 数组的 readonly 引用即可。

**合并后**：std categories → categories 快照 → `collectBonusScores(state, player, snapshot)` → cardStateBonusVp push → sharedPostScore。两次 loop 变一次。

---

## 3. Components

### 3.1 接口扩展（`shared/cards/card-effects.ts`）

```typescript
export type ScoringContext = {
  /** Resources already consumed by prior bonus-scoring cards. */
  reserved: Partial<Resource>
  /** Snapshot of standard categories at the start of bonus phase
   *  (fields / pastures / grains / vegetables / sheeps / boars / cattles /
   *   empty / stables / clayRooms / stoneRooms / farmers / cards / cardsBonus).
   *  Read-only — bonus cards must not mutate. */
  categories: readonly ScoreCategoryResult[]   // ← NEW
}

export type BonusScoreHandler = (
  state: GameState,
  player: PlayerState,
  ctx: ScoringContext,
) => number
```

**删除**：
- `CardEffect.computePostScore?: (state, player, categories: ScoreCategoryResult[]) => number`
- `cardEffectHooks` 数组中 `'computePostScore'` 入口
- `CardEffectField` 联合类型中 `'computePostScore'` 入口

### 3.2 scoring.ts 顺序变更

```diff
  // ... std categories already pushed (fields/pastures/grains/.../cards/cardsBonus) ...

- const bonusScoreResult = collectBonusScores(state, player)
+ const categoriesSnapshot = [...categories] as readonly ScoreCategoryResult[]
+ const bonusScoreResult = collectBonusScores(state, player, categoriesSnapshot)
  const reserved = bonusScoreResult.reserved

  // ... cardStateBonusVp accumulation + push ...

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

`collectBonusScores` 函数签名添加 `categoriesSnapshot: readonly ScoreCategoryResult[]` 参数，传入每张 bonus 卡 handler 的 ctx.

### 3.3 5 张卡迁移

#### E159 OldMiser（不看 categories）
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

#### D132 HideFarmer（副作用 + reserved 协调）
```typescript
scoringPriority: 200,  // 末尾跑，确保其他 bonus 卡的 reserved 已敲定
computeBonusScore: (_state, player, ctx) => {
  const emptyCat = ctx.categories.find(c => c.key === 'empty')
  if (!emptyCat || emptyCat.total >= 0) return 0
  const penalty = Math.abs(emptyCat.total)
  const availableFood = player.resources.food - (ctx.reserved.food ?? 0)
  const canPay = Math.min(penalty, availableFood)
  if (canPay <= 0) return 0
  player.resources.food -= canPay
  return canPay
},
```

`scoringPriority: 200` 大于默认 100，确保 D132 在所有其他 bonus 卡之后跑。这样若有其他 bonus 卡 reserved food，D132 用 `availableFood = food - reserved.food` 避免 double-spend。

---

## 4. Data Flow

```
[scoring.ts 单玩家 loop]
  ├─ 标准 categories push (fields / pastures / .../farmers / cards / cardsBonus)
  ├─ categoriesSnapshot = [...categories]   // ← readonly 快照
  ├─ collectBonusScores(state, player, snapshot)
  │     ├─ 排序 bonus 卡 by scoringPriority (default 100)
  │     ├─ 每张卡 handler(state, player, { reserved, categories: snapshot })
  │     │     ├─ E159: 直接返回 -familySize
  │     │     ├─ D100: 读 snapshot 中标准 category total
  │     │     ├─ C31:  读 snapshot 中负分总和
  │     │     ├─ C135: 读 snapshot 中是否有负
  │     │     ├─ D132 (priority 200): 读 snapshot.empty + 副作用 player.food
  │     │     └─ A136 / C133 / E132 / D60 等 (priority 100): 不变
  │     └─ entries[] + reserved
  ├─ cardStateBonusVp 累加 + push category
  └─ sharedPostScore (跨玩家)
```

---

## 5. Error Handling

- `computeBonusScore` handler 抛错时，custom card 路径 console.warn skip（已存在逻辑），其他卡按现有 try/catch 行为；不变。
- 接口扩展不会破坏现有 11 张 bonus 卡：它们的 handler 接受 `ctx` 但不读 `ctx.categories`，新增字段 transparent。
- D132 边界：`ctx.reserved.food` 可能 undefined 时 `?? 0`；`emptyCat` 不存在时 early return；`canPay <= 0` 时不 mutate food。

---

## 6. Testing

### 6.1 新增/更新测试（`shared/logic/__tests__/scoring.test.ts`）

为 5 张卡各加一组测试：
- **D100**：构造 player 让 fields=4 + pastures=4 + grains=2，断言 +2（fields/pastures 满 4）
- **C31**：构造 empty=-10 → +7（cap）；empty=-3 → +3
- **C135**：构造 empty=0 → +3；empty=-1 → +0
- **D132**：
  - case A：empty=-3 + food=5 + reserved.food=0 → 扣 3 food，return 3
  - case B：empty=-3 + food=5 + reserved.food=4 → 扣 1 food，return 1
  - case C：empty=0 → return 0，不扣 food
- **E159**：familySize=4 → -4；familySize=2 → -2

### 6.2 回归（不需要改）

- 现有 11 张 `computeBonusScore` 卡的 session 测试（A136 / C133 / E132 / D60 / E134 / E149 等）—— ctx 加 `categories` 是字段扩展，handler 不读时不受影响

### 6.3 TDD 顺序

1. **C1（红）**：写 5 张卡的红测试（断言 `getCardEffect(id).computeBonusScore` 存在 + 行为正确）→ 全部失败
2. **C2（绿）**：扩 `BonusScoreHandler` ctx + scoring.ts 加 snapshot + 5 张卡迁移 → 红测试转绿
3. **C3（清理）**：删 `CardEffect.computePostScore` + `cardEffectHooks` 数组入口 + scoring.ts postScore loop + influence 文件
4. **C4（docs）**：同步 card_progress.md §2.0 + §3 + ENGINE_ARCHITECTURE.md（如有 hook 列表）+ CUSTOM_CARD_SANDBOX.md + llmPrompts.ts + audit script

---

## 7. 影响面清理（C3 阶段处理）

需同步删除/改的位置：

1. `client/services/llmPrompts.ts` —— LLM prompt 中 `computePostScore` 入口移除
2. `shared/custom-code/__tests__/ast-validator.test.ts` —— sandbox 允许字段名更新
3. `scripts/audit-card-architecture.ts` —— 检测脚本中 `computePostScore` 关键字移除
4. `docs/CUSTOM_CARD_SANDBOX.md` —— hook 列表更新
5. `tests/llm-card-gen/fixtures/M4_endgame-vp.ts` —— fixture 内 `computePostScore` 改为 `computeBonusScore`（如有）
6. `docs/ENGINE_ARCHITECTURE.md` —— hook 列表（如有）
7. `docs/card_progress.md` §2.0 changelog 加一行 + §3 基础设施清单更新

---

## 8. Out of Scope

- `computeSharedPostScore`（A135 / C136）：跨玩家分数调整，签名 `(state, owner, summaries) => Array<{playerId, score}>` 与 BonusScoreHandler 完全不同，不合并。
- `scoringPriority` 机制本身：现有，不改。本次仅给 D132 设 200 让它在其他 bonus 卡之后跑。
- BGA `orderComputeCardCosts` ranking：与本 spec 无关；既往登记的 deliberate divergence 不动（见 memory `feedback_no_hook_ordering`）。

---

## 9. 工时估算

- C1（红测试）：~30 min
- C2（接口扩展 + scoring.ts 改 + 5 卡迁移）：~1 hour
- C3（删字段 + 影响面清理 + 测试再过）：~30 min
- C4（docs 同步）：~15 min
- CI 等待：~8 min
- **总计**：~2.5 hour（半天预留 buffer）
