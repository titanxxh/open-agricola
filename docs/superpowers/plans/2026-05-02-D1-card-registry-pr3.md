# D1 — CardRegistry PR-3 清理 module-level shortcut 残留 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除 `getMajorCardEffect` 与 module-level shortcut 残留，引入 `getCardDefinition` 作为元数据唯一入口；让 modifier 通过 catalog → registry 派生路径走 per-session active registry。

**Architecture:** 三阶段 9 task：(1) 基础设施——majors 数据结构对齐 CardDefinition + 新增 `getCardDefinition` + registry `syncModifiersFromCatalog`；(2) 切换调用方——GameCore 构造调 sync、card-modifiers 改读 active、custom-registry 注入 modifier、isMajorCard 改 startsWith；(3) 删旧路径——codemod 30 处 `getMajorCardEffect → getCardDefinition`，删函数与类型，rename majors 数组。

**Tech Stack:** TypeScript / pnpm workspace / vitest（fast + slow project）/ ESLint。纯后端重构，前端无可见变化。

**Spec:** `docs/superpowers/specs/2026-05-02-D1-card-registry-pr3-design.md`

---

## Pre-flight：spec 不一致点修正

Spec §3.1 提到 "`majorCardEffects` 改名 `majorCardDefinitions`，类型 `CardDefinition[]`"。落地时发现字段不兼容：

- majors 用 `description: string[]`，CardDefinition 用 `desc`
- majors 缺 `name / deck / number`（CardDefinition 必需）
- majors 用 `cost: Partial<Resource> | ComplexCost`（CookingHearth/StoneOven 等用 cards-list 类型 cost），CardDefinition 仅 `Partial<Resource>`

Plan 内通过 Task 1 解决：codemod 10 个 majors 文件 + 扩展 `CardDefinition.cost` 类型 + `MajorCardEffect` 重命名为 `MajorCardData` 并 extends `CardDefinition`。

---

## File Structure

| 文件 | 责任 | Task |
|---|---|---|
| `shared/cards/types.ts` | `CardDefinition.cost` 类型扩展为 `Partial<Resource> \| ComplexCost` | 1 |
| `shared/cards/major/types.ts` | `MajorCardEffect` 重命名为 `MajorCardData`，extends `CardDefinition`，仅留 majors 独有字段（`scoring` / `cost` 必需 override） | 1 |
| `shared/cards/major/*.ts` (10 个文件) | majors 数据 codemod：`description → desc`，加 `name / deck: 'major' / number` 字段 | 1 |
| `shared/cards/major/index.ts` | `majorCardEffects` rename 暂缓（task 8 与函数同步删）；当前仅修类型为 `MajorCardData[]` | 1 / 8 |
| `shared/cards/catalog.ts` | 新增 `getCardDefinition(id): CardDefinition \| undefined` | 2 |
| `shared/cards/__tests__/get-card-definition.test.ts` (新增) | `getCardDefinition` 单元测试 | 2 |
| `shared/cards/registry.ts` | `CardImpl.modifiers` 类型 `TradeLikeModifier[] → CostModifier[]`；`modifiersByCard` 同步；新增 `syncModifiersFromCatalog(occupations, minors)`；删 `TradeLikeModifier` 类型 | 3 |
| `shared/cards/__tests__/registry-sync.test.ts` (新增) | `syncModifiersFromCatalog` 单元测试 | 3 |
| `shared/session/game-core.ts` 构造函数 | `loadByIds` 之后追加 `cardRegistry.syncModifiersFromCatalog(allOccupationCards, allMinorImprovementCards)` | 4 |
| `shared/cards/__tests__/setup-register-all.ts` | 测试 setup 默认 registry 也调用 `syncModifiersFromCatalog` | 4 |
| `shared/cards/custom-registry.ts::registerCard` | 新增把 `data.card.modifier/modifiers` 注入 `active.modifiersByCard` | 5 |
| `shared/cards/__tests__/custom-registry-modifiers.test.ts` (新增) | custom card modifier 注入单测 | 5 |
| `shared/cards/card-modifiers.ts` | 整文件简化为单行 `getActiveCardRegistry()?.getModifiers(cardId) ?? []` | 6 |
| `shared/cards/helpers/card-identity.ts::isMajorCard` | 改实现：`cardId.startsWith('Major_')` | 6 |
| `shared/cards/card-effects.ts:202` | 删除 `?? getMajorCardEffect(id)` fallback | 7 |
| **30 处 codemod** | `getMajorCardEffect(id) → getCardDefinition(id)`（清单见 Task 7 内 grep） | 7 |
| `shared/cards/major/index.ts` | 删除 `getMajorCardEffect` 函数；`majorCardEffects` rename 为 `majorCardDefinitions` | 8 |
| `shared/cards/major/types.ts` | 删除 `MajorCardData` export 中重复的 fields；保持 type 名为 `MajorCardData` 即可 | 8 |
| `shared/actions/effects/improvement.ts:7,330` + `shared/game/major-improvements.ts:1,3` | rename `majorCardEffects → majorCardDefinitions` | 8 |
| `server/custom-code/injected-helpers.ts:33-34` + `server/workshop-pr/code-gen.ts:25,63` | 工坊 sandbox stub 与 codegen list 同步 | 8 |
| `docs/master-plan.md` §8 | 加 D1 行 | 9 |

---

## Task 1：majors 数据结构对齐 CardDefinition

**Files:**
- Modify: `shared/cards/types.ts`（CardDefinition.cost 类型扩展）
- Modify: `shared/cards/major/types.ts`（MajorCardEffect → MajorCardData，extends CardDefinition）
- Modify: `shared/cards/major/fireplace.ts`、`cooking-hearth.ts`、`well.ts`、`joinery.ts`、`basketmaker.ts`、`pottery.ts`、`clay-oven.ts`、`stone-oven.ts`（可能还有 1-2 个 — 先 ls 一下）
- Modify: `shared/cards/major/index.ts`（数组类型从 `MajorCardEffect[]` 改为 `MajorCardData[]`，namedExport 不动）

- [ ] **Step 1: 列出所有 majors 文件**

```bash
ls shared/cards/major/*.ts
```

预期：约 10 个 .ts 文件（fireplace / cooking-hearth / well / joinery / basketmaker / pottery / clay-oven / stone-oven / index / types）。

- [ ] **Step 2: 扩展 `CardDefinition.cost` 类型**

`shared/cards/types.ts` 找到 `cost?: Partial<Resource>`（约 line 40），改为：

```ts
import type { Resource, CostModifier, TradeSideEffect, ComplexCost } from '../game/types'
// ...

export type CardDefinition = {
  id: string
  name: string
  deck: string
  number: number
  category?: string
  desc: string[]
  cost?: Partial<Resource> | ComplexCost   // ← 扩展
  altCosts?: Partial<Resource>[]
  // ... 其余不变
  scoring?: {                                // ← 新增（majors 独有，但放 CardDefinition 不影响）
    resource: keyof Resource
    map: Record<string, number>
  }
}
```

> 如 `ComplexCost` import 已存在则免改 import。`scoring` 字段只 majors 用，作为 optional 加在 CardDefinition 上不影响其他卡。

- [ ] **Step 3: 重命名 MajorCardEffect → MajorCardData，extends CardDefinition**

`shared/cards/major/types.ts` 替换为：

```ts
import type { CardDefinition } from '../types'
import type { Resource, ComplexCost } from '../../game/types'
import type { CardEffectHook } from '../card-effects'
import type { CardExchange } from '../types'

export type MajorEffectHook = CardEffectHook

/** Major improvement card metadata. Majors have no effect hooks today;
 *  this type extends CardDefinition with the fields that are required
 *  rather than optional for majors (cost / vp / extraVp). */
export type MajorCardData = CardDefinition & {
  cost: Partial<Resource> | ComplexCost
  vp: number
  extraVp: boolean
  // description / desc 都在 CardDefinition 上以 desc 命名（majors codemod 已改）
}

// 兼容别名：现存调用方使用 MajorCardEffect 类型，渐进 codemod。
export type MajorCardEffect = MajorCardData
```

> 保留 `MajorCardEffect` 作为类型别名，让本 task 内不需要 codemod 200+ 个引用 `MajorCardEffect` 的位置。task 8 删除别名时再 codemod。

- [ ] **Step 4: codemod 10 个 majors 数据文件**

针对每个 majors 文件（如 `fireplace.ts`），改动模式：

```ts
// 旧
export const fireplace1: MajorCardEffect = {
  id: 'Major_Fireplace1',
  cost: { clay: 2 },
  vp: 1,
  extraVp: false,
  isCookery: true,
  isBaking: true,
  description: [                              // ← 改名
    '[Anytime]',
    '<VEGETABLE> <ARROW> 2<FOOD>',
    // ...
  ],
  exchanges: [...],
}

// 新
export const fireplace1: MajorCardData = {
  id: 'Major_Fireplace1',
  name: 'Fireplace',                          // ← 新增
  deck: 'major',                              // ← 新增
  number: 1,                                  // ← 新增
  cost: { clay: 2 },
  vp: 1,
  extraVp: false,
  isCookery: true,
  isBaking: true,
  desc: [                                     // ← rename
    '[Anytime]',
    '<VEGETABLE> <ARROW> 2<FOOD>',
    // ...
  ],
  exchanges: [...],
}
```

10 个文件每个都做：
- import 换 `MajorCardData`（保留 `MajorCardEffect` 别名也能通过编译，但建议直接换新名）
- 加 `name`（卡牌通用名，如 'Fireplace' / 'Cooking Hearth' / 'Well' / 'Joinery' / ...）
- 加 `deck: 'major'`
- 加 `number: <编号>`（fireplace1=1, fireplace2=2, cooking-hearth1=3, cooking-hearth2=4, ... — 可以从现有 ID 编号推；或简化编号为 1..N 顺序）
- `description` → `desc`

> majors 的 `name / number` 可以从 BGA 数据查（`output/bga-agricola/img` 文件名）或保持简单的 `name = id without 'Major_'`、`number = 1..10` 顺序。一致性即可，不影响业务行为（business 行为读 `id`，metadata 仅展示用）。

- [ ] **Step 5: `majorCardEffects` 数组类型修正**

`shared/cards/major/index.ts:12`：

```ts
// 旧
export const majorCardEffects: MajorCardEffect[] = [
  fireplace1, fireplace2, cookingHearth1, cookingHearth2,
  // ...
]

// 新
export const majorCardEffects: MajorCardData[] = [
  fireplace1, fireplace2, cookingHearth1, cookingHearth2,
  // ...
]
```

> 数组名仍为 `majorCardEffects`，task 8 才 rename 为 `majorCardDefinitions`。

- [ ] **Step 6: 跑 fast 测试 + lint**

```bash
pnpm test:fast
pnpm run lint
```

预期：fast 全绿；lint 0 error。如有 ts 错误（少 desc / cost 类型不匹配等）按错误信息修。

- [ ] **Step 7: Commit**

```bash
git add shared/cards/types.ts shared/cards/major/
git commit -m "refactor(D1): align majors data shape with CardDefinition

10 majors files: rename description->desc, add name/deck='major'/number
required fields. CardDefinition.cost extended to allow ComplexCost.
MajorCardEffect renamed to MajorCardData and now extends CardDefinition;
old name kept as type alias for back-compat (deleted in Task 8)."
```

---

## Task 2：catalog 加 `getCardDefinition` 入口

**Files:**
- Create: `shared/cards/__tests__/get-card-definition.test.ts`
- Modify: `shared/cards/catalog.ts`（在文件末尾追加）

- [ ] **Step 1: 写失败的单元测试**

`shared/cards/__tests__/get-card-definition.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { getCardDefinition } from '../catalog'

describe('getCardDefinition', () => {
  it('returns occupation definition by id', () => {
    const def = getCardDefinition('A93_BedMaker')
    expect(def?.id).toBe('A93_BedMaker')
    expect(def?.name).toBeDefined()
  })

  it('returns minor improvement definition by id', () => {
    const def = getCardDefinition('A28_ForestSchool')
    expect(def?.id).toBe('A28_ForestSchool')
    expect(def?.name).toBeDefined()
  })

  it('returns major card definition with metadata fields', () => {
    const def = getCardDefinition('Major_Fireplace1')
    expect(def?.id).toBe('Major_Fireplace1')
    expect(def?.isCookery).toBe(true)
    expect(def?.exchanges?.length ?? 0).toBeGreaterThan(0)
    expect(def?.vp).toBe(1)
  })

  it('returns undefined for unknown id', () => {
    expect(getCardDefinition('Unknown_Card_999')).toBeUndefined()
  })
})
```

- [ ] **Step 2: 跑测试确认 fail**

```bash
pnpm exec vitest run shared/cards/__tests__/get-card-definition.test.ts
```

预期：fail，原因 `'getCardDefinition' is not exported from '../catalog'`。

- [ ] **Step 3: 在 catalog.ts 实现 getCardDefinition**

`shared/cards/catalog.ts` 文件末尾追加：

```ts
import { majorCardEffects } from './major'

/**
 * Unified lookup entry for any card definition (occupation / minor / major).
 * Returns the CardDefinition view; for majors the underlying object is
 * MajorCardData (a CardDefinition superset). Callers needing majors-only
 * fields (e.g. `scoring`) may type-narrow.
 */
export const getCardDefinition = (id: string): CardDefinition | undefined => {
  return (
    getMinorImprovementCard(id) ??
    getOccupationCard(id) ??
    majorCardEffects.find((c) => c.id === id)
  )
}
```

> 注意：`getMinorImprovementCard / getOccupationCard` 已存在；`majorCardEffects` 在 task 1 已是 `MajorCardData[]`（extends CardDefinition），所以 `find` 返回类型兼容 `CardDefinition | undefined`。

> 如果 catalog.ts 没 import `CardDefinition`，加一行 `import type { CardDefinition } from './types'`。

- [ ] **Step 4: 跑测试确认 pass**

```bash
pnpm exec vitest run shared/cards/__tests__/get-card-definition.test.ts
pnpm test:fast
```

预期：4 unit tests pass；fast 全绿。

- [ ] **Step 5: Commit**

```bash
git add shared/cards/catalog.ts shared/cards/__tests__/get-card-definition.test.ts
git commit -m "feat(D1): add getCardDefinition unified catalog entry

Single lookup entry covering occupation / minor / major cards. Returns
CardDefinition view; majors auto-narrow via MajorCardData extends
CardDefinition. Replaces the role getMajorCardEffect played for metadata
queries (Task 7 codemod)."
```

---

## Task 3：CardRegistry `syncModifiersFromCatalog` + 类型修正

**Files:**
- Modify: `shared/cards/registry.ts`
- Create: `shared/cards/__tests__/registry-sync.test.ts`

- [ ] **Step 1: 写失败的单元测试**

`shared/cards/__tests__/registry-sync.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { CardRegistry } from '../registry'
import { allOccupationCards, allMinorImprovementCards } from '../catalog'

describe('CardRegistry.syncModifiersFromCatalog', () => {
  it('writes occupation.modifier (singular) into modifiersByCard', () => {
    const registry = new CardRegistry()
    registry.syncModifiersFromCatalog(allOccupationCards, allMinorImprovementCards)
    // A28 ForestSchool 是 minor improvement，带 modifier (单数)
    const mods = registry.getModifiers('A28_ForestSchool')
    expect(mods).toHaveLength(1)
    expect(mods[0]?.type).toBe('trade')
  })

  it('writes minor.modifiers (plural array) into modifiersByCard', () => {
    const registry = new CardRegistry()
    registry.syncModifiersFromCatalog(allOccupationCards, allMinorImprovementCards)
    const mods = registry.getModifiers('A123_FrameBuilder')
    expect(mods.length).toBeGreaterThan(0)
  })

  it('skips cards with no modifier and no modifiers field', () => {
    const registry = new CardRegistry()
    registry.syncModifiersFromCatalog(allOccupationCards, allMinorImprovementCards)
    expect(registry.getModifiers('A1_Shelter')).toEqual([])
  })

  it('does not include majors (no modifier field on any major)', () => {
    const registry = new CardRegistry()
    registry.syncModifiersFromCatalog(allOccupationCards, allMinorImprovementCards)
    expect(registry.getModifiers('Major_Fireplace1')).toEqual([])
  })
})
```

- [ ] **Step 2: 跑测试确认 fail**

```bash
pnpm exec vitest run shared/cards/__tests__/registry-sync.test.ts
```

预期：fail，原因 `Property 'syncModifiersFromCatalog' does not exist on type 'CardRegistry'`。

- [ ] **Step 3: 实现 syncModifiersFromCatalog + 类型修正**

`shared/cards/registry.ts`：

a. 顶部 import 改为：

```ts
import type { CardListenerRegistration } from './card-listeners'
import type { CardEffect } from './card-effects'
import type { CardDefinition } from './types'
import type { CostModifier } from '../game/types'
```

b. 删除 `TradeLikeModifier` 类型导出，全部替换为 `CostModifier`：

```ts
// 删除
export type TradeLikeModifier = {
  type: string
  cardId: string
  [key: string]: unknown
}

// 替换 CardImpl.modifiers 类型
export type CardImpl = {
  listeners?: CardListenerRegistration[]
  effect?: CardEffect
  modifiers?: CostModifier[]            // ← 类型修正
  reaches?: readonly string[]
}

// 替换 modifiersByCard 类型
private readonly modifiersByCard = new Map<string, CostModifier[]>()  // ← 类型修正
```

c. `getModifiers` 返回类型同步：

```ts
getModifiers(cardId: string): CostModifier[] {           // ← 类型修正
  return this.modifiersByCard.get(cardId) ?? []
}
```

d. 在 class 内合适位置（推荐 `unload` 方法之后、getter 方法之前）新增：

```ts
/**
 * Populate modifiersByCard from catalog card definitions. Reads
 * `card.modifier` (singular) and `card.modifiers` (plural) fields and
 * merges them. Majors don't carry modifier fields, so they're skipped
 * naturally (callers don't pass majors anyway).
 *
 * Called once per session by GameCore after loadByIds; replaces the old
 * card-modifiers.ts catalog-direct-query path.
 */
syncModifiersFromCatalog(
  occupations: readonly CardDefinition[],
  minors: readonly CardDefinition[],
): void {
  for (const card of [...occupations, ...minors]) {
    const mods: CostModifier[] = [
      ...(card.modifiers ?? []),
      ...(card.modifier ? [card.modifier] : []),
    ]
    if (mods.length > 0) {
      this.modifiersByCard.set(card.id, mods)
    }
  }
}
```

- [ ] **Step 4: 跑测试确认 pass**

```bash
pnpm exec vitest run shared/cards/__tests__/registry-sync.test.ts
pnpm test:fast
```

预期：4 unit tests pass；fast 全绿（loadImpl 路径仍正常工作，sync 是新方法，未与现有路径冲突）。

- [ ] **Step 5: Commit**

```bash
git add shared/cards/registry.ts shared/cards/__tests__/registry-sync.test.ts
git commit -m "feat(D1): CardRegistry.syncModifiersFromCatalog + type fix

Adds per-session modifier injection by deriving from catalog
occupation/minor card definitions (modifier + modifiers fields).
TradeLikeModifier placeholder type removed; modifiersByCard now keyed
to CostModifier[] matching the actual CostModifier domain type."
```

---

## Task 4：GameCore 构造调用 sync + 测试 setup 同步

**Files:**
- Modify: `shared/session/game-core.ts`（构造函数末尾）
- Modify: `shared/cards/__tests__/setup-register-all.ts`

- [ ] **Step 1: GameCore 构造内调用 sync**

`shared/session/game-core.ts` 找到构造函数中 `loadByIds` 之后的位置（spec 标 line 305-315 范围，运行时用 grep 重定位）：

```bash
grep -n "loadByIds\|setActiveCardRegistry" shared/session/game-core.ts | head
```

定位到 `cardRegistry.loadByIds(...)` 那行后面追加：

```ts
// Sync modifier definitions from catalog into per-session registry.
// Replaces the legacy card-modifiers.ts catalog-direct-query path.
this.cardRegistry.syncModifiersFromCatalog(
  allOccupationCards,
  allMinorImprovementCards,
)
```

文件顶部 import 加（如未导入）：

```ts
import { allOccupationCards, allMinorImprovementCards } from '../cards/catalog.ts'
```

- [ ] **Step 2: 测试 setup 同步**

`shared/cards/__tests__/setup-register-all.ts` 找到默认 registry 构造与 publish 处（grep `setActiveCardRegistry` 或 `new CardRegistry`），在 publish 之前追加：

```ts
defaultRegistry.syncModifiersFromCatalog(
  allOccupationCards,
  allMinorImprovementCards,
)
```

补 import：

```ts
import { allOccupationCards, allMinorImprovementCards } from '../catalog'
```

- [ ] **Step 3: 跑全量测试确认 sync 正确接入**

```bash
pnpm test:fast
pnpm exec vitest run --project slow
pnpm run lint
```

预期：fast / slow / lint 全绿。**关键回归点**：254 个单卡 session 测试中带 modifier 的卡（A28 ForestSchool / A14 CarpentersHammer / A123 FrameBuilder / B15 CarpentersBench / 等）行为完全不变（因 sync 后 registry 数据等价于旧 catalog 直查）。

- [ ] **Step 4: Commit**

```bash
git add shared/session/game-core.ts shared/cards/__tests__/setup-register-all.ts
git commit -m "feat(D1): wire syncModifiersFromCatalog into GameCore + test setup

GameCore constructor now calls syncModifiersFromCatalog after loadByIds
so per-session registry holds occupation/minor modifiers. Test setup
mirrors this so unit tests reading getCardModifiers without booting a
full GameSession see the same data."
```

---

## Task 5：custom-registry 注入 modifiers + 单测

**Files:**
- Modify: `shared/cards/custom-registry.ts`（registerCard 函数）
- Create: `shared/cards/__tests__/custom-registry-modifiers.test.ts`

- [ ] **Step 1: 写失败的单元测试**

`shared/cards/__tests__/custom-registry-modifiers.test.ts`：

```ts
import { describe, expect, it, beforeEach } from 'vitest'
import { CardRegistry } from '../registry'
import { setActiveCardRegistry } from '../active-registry'
import { registerCustomCard } from '../custom-registry'
import { getCardModifiers } from '../card-modifiers'
import type { CostModifier } from '../../game/types'

describe('custom-registry modifier injection', () => {
  beforeEach(() => {
    setActiveCardRegistry(new CardRegistry())
  })

  it('injects card.modifier (singular) into active.modifiersByCard', () => {
    const modifier: CostModifier = {
      type: 'trade',
      cardId: 'CUSTOM_TestModifier',
      appliesTo: ['occupation'],
      from: { wood: 1 },
      to: { food: 1 },
    } as any
    registerCustomCard({
      // 完整 fixture 形态参考 custom-registry.ts 中 registerCard 接受的 data 结构
      card: { id: 'CUSTOM_TestModifier', modifier } as any,
      // listeners / effect 留空
    } as any)
    expect(getCardModifiers('CUSTOM_TestModifier')).toHaveLength(1)
  })

  it('injects card.modifiers (plural) into active.modifiersByCard', () => {
    const mods: CostModifier[] = [
      { type: 'trade', cardId: 'CUSTOM_M2', appliesTo: ['plow'], from: { wood: 1 }, to: { food: 1 } } as any,
    ]
    registerCustomCard({
      card: { id: 'CUSTOM_M2', modifiers: mods } as any,
    } as any)
    expect(getCardModifiers('CUSTOM_M2')).toHaveLength(1)
  })

  it('skips when neither modifier nor modifiers present', () => {
    registerCustomCard({
      card: { id: 'CUSTOM_NoMod' } as any,
    } as any)
    expect(getCardModifiers('CUSTOM_NoMod')).toEqual([])
  })
})
```

> 测试中 `registerCustomCard` 的 fixture 形态以 custom-registry.ts 实际接受的 data 结构为准；如果 import 名不同（如 `registerCard` 而非 `registerCustomCard`）请按实际改。

- [ ] **Step 2: 跑测试确认 fail**

```bash
pnpm exec vitest run shared/cards/__tests__/custom-registry-modifiers.test.ts
```

预期：前两个测试 fail（getCardModifiers 返回空数组）；第三个测试可能已通过（无注入也是空）。

- [ ] **Step 3: 实现 modifier 注入路径**

`shared/cards/custom-registry.ts` 找到 `registerCard` / `registerCustomCard` 函数（grep `registerCard\b` 定位），在已有的 `active.addListener / setEffect` 调用附近追加：

```ts
// 注入 modifier (单数 + 复数) 到 active registry
const card = data.card  // 或具体的 card 字段路径，按现有结构
const allMods = [
  ...(card.modifiers ?? []),
  ...(card.modifier ? [card.modifier] : []),
]
if (allMods.length > 0) {
  // CardRegistry 暴露的 set modifier API；如尚无，加一个 setModifiers
  active.setModifiersForCard(card.id, allMods)
}
```

如 `CardRegistry` 没有 `setModifiersForCard` 方法，在 `registry.ts` 内补：

```ts
setModifiersForCard(cardId: string, modifiers: CostModifier[]): void {
  if (modifiers.length > 0) {
    this.modifiersByCard.set(cardId, modifiers)
  } else {
    this.modifiersByCard.delete(cardId)
  }
}
```

> 实现路径以 `shared/cards/custom-registry.ts:43` 现有的 `sessionCtx.registerCard(data)` 调用为参考；如果 sessionCtx 已有自己的 modifier 注入接口，复用即可，**不要**重复双重注入。先 grep 现状再决定。

- [ ] **Step 4: 跑测试确认 pass**

```bash
pnpm exec vitest run shared/cards/__tests__/custom-registry-modifiers.test.ts
pnpm test:fast
```

预期：3 unit tests pass；fast 全绿。

- [ ] **Step 5: Commit**

```bash
git add shared/cards/custom-registry.ts shared/cards/registry.ts shared/cards/__tests__/custom-registry-modifiers.test.ts
git commit -m "feat(D1): custom-registry injects card modifiers into active registry

Custom workshop cards now go through the same path as built-in cards:
modifier / modifiers fields are written into active.modifiersByCard,
so getCardModifiers(customId) returns the right CostModifier[] without
falling back to catalog (which never knew custom ids)."
```

---

## Task 6：card-modifiers.ts 单行化 + isMajorCard 改 startsWith

**Files:**
- Modify: `shared/cards/card-modifiers.ts`（整文件）
- Modify: `shared/cards/helpers/card-identity.ts:11`（isMajorCard）

- [ ] **Step 1: 简化 card-modifiers.ts**

`shared/cards/card-modifiers.ts` 整个替换为：

```ts
import type { CostModifier } from '../game/types'
import { getActiveCardRegistry } from './active-registry'

/**
 * Card modifier lookup. Reads from per-session active CardRegistry.
 * GameCore constructor populates modifiersByCard via syncModifiersFromCatalog;
 * custom-registry adds custom-card modifiers at runtime.
 */
export const getCardModifiers = (cardId: string): CostModifier[] => {
  return getActiveCardRegistry()?.getModifiers(cardId) ?? []
}
```

> 删除原有的 catalog 直查代码（getMinorImprovementCard / getOccupationCard import 也删）。

- [ ] **Step 2: isMajorCard 改 startsWith**

`shared/cards/helpers/card-identity.ts`：

```ts
// 旧（line 1 import 与 line 11 调用）
import { getMajorCardEffect } from '../major'
// ...
if (getMajorCardEffect(cardId)) return true

// 新
// 删除 import { getMajorCardEffect } from '../major'
// ...
if (cardId.startsWith('Major_')) return true
```

> 文件其他地方若还有用 `getMajorCardEffect`，仍保留 import；当前 grep 只发现 line 11 一处。

- [ ] **Step 3: 跑全量测试**

```bash
pnpm test:fast
pnpm exec vitest run --project slow
pnpm run lint
```

预期：fast / slow / lint 全绿。254 个单卡 session 测试覆盖了各 modifier 卡和 majors 行为，这一步是整个 D1 中最容易暴露 sync/path 错误的点。

- [ ] **Step 4: Commit**

```bash
git add shared/cards/card-modifiers.ts shared/cards/helpers/card-identity.ts
git commit -m "refactor(D1): card-modifiers single-line via active registry; isMajorCard via prefix

card-modifiers.ts shrinks to a one-liner reading from per-session
active.getModifiers. isMajorCard switches to cardId.startsWith('Major_')
matching the established naming convention - no longer needs to query
catalog to decide card type."
```

---

## Task 7：删 card-effects.ts fallback + codemod 30 处 `getMajorCardEffect → getCardDefinition`

**Files:**
- Modify: `shared/cards/card-effects.ts:202-203`（删 fallback）
- Modify: 30 处调用方（清单见 Step 2 grep）

- [ ] **Step 1: 删 card-effects.ts fallback**

`shared/cards/card-effects.ts:198-205`：

```ts
// 旧
export const getCardEffect = (id: string): CardEffect | null => {
  const active = getActiveCardRegistry()
  return active?.getEffect(id) ?? getMajorCardEffect(id) ?? null
}

// 新
export const getCardEffect = (id: string): CardEffect | null => {
  return getActiveCardRegistry()?.getEffect(id) ?? null
}
```

文件顶部删除 `import { getMajorCardEffect } from './major'`。

- [ ] **Step 2: 列出 30 处 codemod 位置**

```bash
grep -rn "getMajorCardEffect" --include="*.ts" 2>/dev/null | grep -v test | grep -v ".bak" | grep -v "shared/cards/major/index.ts"
```

预期清单（已 task 1/6 部分清掉的不再列）：

- `shared/logic/scoring.ts:5,302`
- `shared/session/game-core.ts:88,2265`
- `shared/actions/effects/exchange.ts:21,240`
- `shared/actions/effects/improvement.ts:7,207,550,684,730,816`
- `shared/cards/helpers/card-type.ts:2,22`
- `shared/cards/helpers/cookery.ts:4,21`
- `shared/cards/helpers/prerequisites.ts:4,33,38`
- `shared/cards/B/B153_Housemaster.ts:2,23`
- `shared/cards/B/B75_WoodWorkshop.ts:5,60`
- `shared/cards/C/C137_CharcoalBurner.ts:5,24`
- `shared/cards/C/C60_SmallPottersOven.ts:5,16`
- `shared/cards/D/D80_BrickHammer.ts:6,16`
- `shared/cards/D/D117_WoodExpert.ts:6,33`
- `shared/cards/E/E156_ClaypitOwner.ts:5,25`
- `server/custom-code/injected-helpers.ts:33-34`（注释 + stub 函数；保留 stub 但改注释）
- `server/workshop-pr/code-gen.ts:25,63`（list 中含 getMajorCardEffect；改为 getCardDefinition）

- [ ] **Step 3: 逐文件 codemod**

每个文件做：

```ts
// 旧
import { getMajorCardEffect } from '../major'
// ...
const card = getMajorCardEffect(cardId)

// 新
import { getCardDefinition } from '../catalog'   // 注意路径，按相对位置算
// ...
const card = getCardDefinition(cardId)
```

> 注意：**`getCardDefinition` 返回 `CardDefinition | undefined`**，旧 `getMajorCardEffect` 返回 `MajorCardData | undefined`。读字段时多数兼容（id/cost/vp/isCookery/isBaking/exchanges/extraVp 都在 CardDefinition 上）。如果某调用方读 `scoring` 等 majors 独有字段，可类型断言 `(card as MajorCardData)?.scoring`。grep 一遍确认无 majors-only 字段读取。

> `improvement.ts:330` 引用了 `majorCardEffects` 数组本身，task 7 不动，task 8 rename。

> `server/custom-code/injected-helpers.ts:33-34` 是 sandbox stub（让 custom code 调用 `getMajorCardEffect` 时返回 undefined 不报错）。改为 stub `getCardDefinition` 同语义。

```ts
// server/custom-code/injected-helpers.ts:33-34
// 旧
// --- getMajorCardEffect — stub (sandbox has no access to major cards) ---
function getMajorCardEffect(_cardId) { return undefined }

// 新
// --- getCardDefinition — stub (sandbox has no access to card catalog) ---
function getCardDefinition(_cardId) { return undefined }
```

`server/workshop-pr/code-gen.ts:25,63`：

```ts
// 旧
'getMajorCardEffect',  // line 25
getMajorCardEffect: `import { getMajorCardEffect } from '../major'`,  // line 63

// 新
'getCardDefinition',
getCardDefinition: `import { getCardDefinition } from '../cards/catalog'`,
```

- [ ] **Step 4: 跑全量测试**

```bash
pnpm test:fast
pnpm exec vitest run --project slow
pnpm run lint
```

预期：fast / slow / lint 全绿。

> 如果有任何 `Cannot find name` 错误，跟着 tsc 输出找漏改的 `getMajorCardEffect`，逐个修。

- [ ] **Step 5: Commit**

```bash
git add shared/ server/
git commit -m "refactor(D1): codemod getMajorCardEffect to getCardDefinition

Remove fallback in card-effects.ts::getCardEffect and migrate ~30 call
sites across scoring / actions / cards / helpers / sandbox to the
unified getCardDefinition entry. CardDefinition extension makes most
field reads field-compatible (cost/vp/isCookery/exchanges/etc); majors-
only field reads (scoring) use type narrowing."
```

---

## Task 8：删 `getMajorCardEffect` 函数 + `MajorCardEffect` 类型 + rename `majorCardEffects → majorCardDefinitions`

**Files:**
- Modify: `shared/cards/major/index.ts`
- Modify: `shared/cards/major/types.ts`
- Modify: `shared/actions/effects/improvement.ts:7,330`
- Modify: `shared/game/major-improvements.ts:1,3`
- Modify: 所有显式导入 `MajorCardEffect` 类型的文件（grep 找）

- [ ] **Step 1: 删除 `getMajorCardEffect` 函数 + `majorEffectMap` + rename array**

`shared/cards/major/index.ts`：

```ts
// 旧
import type { MajorCardEffect, MajorEffectHook } from './types'
// ...
export const majorCardEffects: MajorCardData[] = [...]   // task 1 已改类型
const majorEffectMap = new Map<string, MajorCardEffect>(
  majorCardEffects.map((effect) => [effect.id, effect]),
)
export const getMajorCardEffect = (id: string) => majorEffectMap.get(id)

// 新
import type { MajorCardData } from './types'
// 删除 majorEffectMap / getMajorCardEffect
export const majorCardDefinitions: MajorCardData[] = [...]
```

> 数组 rename 后旧名 `majorCardEffects` 不再存在，依赖位置（`improvement.ts:7,330`、`major-improvements.ts:1,3`）需要 codemod。

- [ ] **Step 2: 删 `MajorCardEffect` 类型别名**

`shared/cards/major/types.ts`：

```ts
// 删除底部
// export type MajorCardEffect = MajorCardData
```

- [ ] **Step 3: codemod `majorCardEffects` 引用方**

```bash
grep -rn "\bmajorCardEffects\b" --include="*.ts" 2>/dev/null | grep -v test
```

预期：
- `shared/actions/effects/improvement.ts:7`（import） + `:330`（用法）
- `shared/game/major-improvements.ts:1,3`

每处替换 `majorCardEffects` → `majorCardDefinitions`。

- [ ] **Step 4: codemod `MajorCardEffect` 类型引用方**

```bash
grep -rn "\bMajorCardEffect\b" --include="*.ts" 2>/dev/null | grep -v test
```

每处替换 `MajorCardEffect` → `MajorCardData`。

- [ ] **Step 5: 跑全量测试**

```bash
pnpm test:fast
pnpm exec vitest run --project slow
pnpm run lint
```

预期：fast / slow / lint 全绿。如果 tsc 报 `Cannot find name 'getMajorCardEffect'` / `'majorCardEffects'` / `'MajorCardEffect'`，说明 task 7 漏改某处，按错误位置补改。

- [ ] **Step 6: Commit**

```bash
git add shared/cards/major/ shared/actions/effects/improvement.ts shared/game/major-improvements.ts
git commit -m "refactor(D1): remove getMajorCardEffect + MajorCardEffect alias; rename array

The shortcut function getMajorCardEffect and the historic MajorCardEffect
type alias are gone - all metadata queries now flow through
getCardDefinition. The underlying array is renamed majorCardEffects ->
majorCardDefinitions to reflect that it holds CardDefinition-compatible
metadata, not effect bundles. tsc strict acts as the verifier for any
missed call site."
```

---

## Task 9：全量回归 + master-plan §8 + push CI

**Files:**
- Modify: `docs/master-plan.md`（§8 加 D1 行）

- [ ] **Step 1: 全量回归**

```bash
pnpm test:fast
pnpm exec vitest run --project slow
pnpm run lint
```

预期：fast 全绿，slow 全绿（A4_Baseboards / D131 等 pre-existing failure 与 D1 无关），lint 0 error。

> 如果发现 sprint D3 同样有的 pre-existing failure（A4_Baseboards 2 个），记录但不修。

- [ ] **Step 2: 更新 master-plan §8**

`docs/master-plan.md` §8 sprint 进度表追加（参考 D3 行格式）：

```markdown
| D1 | 2026-05-02 | CardRegistry PR-3：清理 module-level shortcut 残留（删 getMajorCardEffect → getCardDefinition；catalog modifier sync 进 active registry） | done |
```

- [ ] **Step 3: Commit + Push + 等 CI**

```bash
git add docs/master-plan.md
git commit -m "docs(D1): master-plan §8 - D1 sprint complete

CardRegistry PR-3 cleanup landed: getMajorCardEffect / MajorCardEffect
removed, getCardDefinition now the unified metadata entry, modifier
lookup goes through per-session active registry (catalog-derived at
GameCore construct + custom-card runtime injection)."

git push origin D1-card-registry
```

由于本仓库 CI 配 `pull_request: branches: [main]` + `push: branches: [main, ui]`，feature branch push 不触发 CI。开 PR 触发：

```bash
export $(grep '^GH_TOKEN=' .env | xargs)
gh pr create --base main --head D1-card-registry --title "D1: CardRegistry PR-3 cleanup" \
  --body "$(cat <<'EOF'
## Summary
- 删 `getMajorCardEffect` 与 `MajorCardEffect` 类型别名
- 引入 `getCardDefinition` 作为元数据唯一入口（30 处 codemod）
- modifier 走 per-session active registry：GameCore 构造时从 catalog 派生，custom-registry 运行时注入
- majors 数据结构对齐 CardDefinition（10 文件 codemod）

## Test plan
- [x] `pnpm test:fast` 全绿
- [x] `pnpm exec vitest run --project slow` 全绿（pre-existing A4 failure 与 D1 无关）
- [x] `pnpm run lint` 0 error
- [x] 254 个单卡 session 测试覆盖 modifier 卡 + majors 行为
EOF
)"
```

> 如果 `gh` CLI 不可用，用 curl POST `/repos/.../pulls`。

等待 CI workflow 全绿（按 CLAUDE.md 硬性要求）：

```bash
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  'https://api.github.com/repos/titanxxh/open-agricola/actions/runs?per_page=3' \
  | jq '.workflow_runs[] | {name, head_sha, status, conclusion, html_url}'
```

预期：CI workflow `conclusion: success`。Deploy Backend / Deploy Frontend 不在 feature branch 跑（仅 push 到 main 时触发，按项目设计）。

- [ ] **Step 4: 完成报告**

返回最终报告（中文，≤300 字）：

1. 9 个 task 各 commit SHA + 一句话摘要
2. 全量回归结果（fast / slow / lint）
3. PR URL + CI 状态
4. master-plan.md §8 已加 D1 行
5. 任何偏离 plan 的地方

---

## 全局回归与 DoD 校验

- [ ] `grep -rn "getMajorCardEffect" --include="*.ts" .` 仅剩 0 命中（包含 server/custom-code stub 已 rename）
- [ ] `grep -rn "MajorCardEffect" --include="*.ts" .` 仅剩 0 命中（type alias 已删）
- [ ] `grep -rn "TradeLikeModifier" --include="*.ts" .` 0 命中
- [ ] `getCardDefinition` 是 catalog 元数据唯一入口
- [ ] `getCardEffect` 单一路径（无 fallback）
- [ ] `getCardModifiers` 单行实现，仅读 active.modifiersByCard
- [ ] `card-modifiers.ts` 不再 import `getOccupationCard / getMinorImprovementCard`
- [ ] 全量测试 fast / slow / lint 全绿
- [ ] 新增单测：`get-card-definition.test.ts` / `registry-sync.test.ts` / `custom-registry-modifiers.test.ts` 通过
- [ ] master-plan.md §8 已加 D1 行
- [ ] PR CI 全绿
