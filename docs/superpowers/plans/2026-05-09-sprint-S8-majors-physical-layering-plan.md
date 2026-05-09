# Sprint S8: majors 物理分层 + cards-display _lookup 反向切断 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 解 S6c 残留 vite dev TDZ 循环（`shared/cards-display/_lookup.ts` 反向 import `cards/major` + `cards/catalog`），让 cards-display 完全单方向，majors 8 张物理分层（cards-display 纯数据 / cards/major Map effects 合成），ESLint rule 7 豁免清零。

**Architecture:** 单 sprint 4 batch 串行：B1 cards-display 纯数据层（拆 type、改 majors 文件去 hooks、聚合 _lookup-data.ts、catalog.ts 改 import _lookup-data 顺手瘦身）；B2 cards/major effects.ts + index 合成 + 删 8 镜像；B3 _lookup.ts 切断双反向 + ESLint rule 7 豁免清零；B4 客户端 use-harvest-flow.ts 改 cards-display + e2e workshop-smoke 实跑 + 文档闭环。caller helper API（majorCardDefinitions / getMajorCard / applyMajorEffectsToAllPlayers）全程不变。

**Tech Stack:** TypeScript 5.x, vitest, Playwright, vite, ESLint 9 flat config, pnpm, Node 22.

**Spec:** `docs/superpowers/specs/2026-05-09-sprint-S8-majors-physical-layering-design.md`

---

## Setup: Worktree + baseline

- [ ] **Step 0.1: 创建 sprint-S8 worktree**

```bash
cd /data00/home/xuxinhao.titan/raw/open-agricola
git fetch origin
git worktree add .worktree/sprint-S8 -b sprint-S8 origin/main
cd .worktree/sprint-S8
pnpm install
```

Expected: `.worktree/sprint-S8/` 存在，`git branch --show-current` 输出 `sprint-S8`，pnpm install 成功（Node 22）。后续所有命令默认在 `.worktree/sprint-S8` 下执行。

如果本地 main 有未 push 到 origin/main 的 commit（如 S8 spec），先 rebase：
```bash
cd /data00/home/xuxinhao.titan/raw/open-agricola/.worktree/sprint-S8
git rebase main
```

- [ ] **Step 0.2: 验证 baseline**

```bash
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm exec tsc -p tsconfig.server.json --noEmit
pnpm run lint
pnpm test:fast
```

Expected: tsc 0 error；lint 0 error；test:fast 全通过（~2277 pass + ~13 skipped 中没有 sprint-introduced active skip — S7 已清空）。

- [ ] **Step 0.3: 复现 e2e TDZ（验证起点确实 broken）**

启动 dev server（用非默认端口避开主仓库可能在跑的 dev server）：
```bash
BACKEND_PORT=5275 nohup pnpm run server > /tmp/s8-server.log 2>&1 &
nohup pnpm exec vite --port 5273 --strictPort > /tmp/s8-frontend.log 2>&1 &
until curl -s http://localhost:5275/api/health 2>/dev/null | grep -q ok; do sleep 2; done
until curl -s -o /dev/null -w "%{http_code}" http://localhost:5273/ | grep -q 200; do sleep 2; done
echo "servers ready"
```

跑 e2e：
```bash
FRONTEND_URL=http://localhost:5273 pnpm exec playwright test e2e-tests/workshop-smoke.spec.ts 2>&1 | tail -10
```

Expected: FAIL — `expect(getByTestId('workshop-root')).toBeVisible() Timeout 30000ms`；浏览器控制台报 `ReferenceError: Cannot access 'majorCardDefinitions' before initialization` at `_lookup.ts:18` (or transformed line 12).

关闭 server 之前先记录 PID：
```bash
pkill -f "pnpm run server" || true
pkill -f "vite --port 5273" || true
lsof -i:5275 -i:5273  # 应无输出
```

---

## Task 1 (B1): cards-display 纯数据层

**Files:**
- Modify: `shared/cards/major/types.ts`（拆 MajorCardDisplay / MajorHooks / MajorCardData）
- Modify: `shared/cards-display/major/{basketmaker,clay-oven,cooking-hearth,fireplace,joinery,pottery,stone-oven,well}.ts`（删 hooks，类型改 MajorCardDisplay）
- Create: `shared/cards-display/major/index.ts`（聚合 majorCardDisplayData + IDs + getMajorCardDisplay）
- Create: `shared/cards-display/_lookup-data.ts`（raw minorImprovementCardsList + occupationCardsList + 4 implemented* + IDs + isImplemented；从 catalog.ts 现有 ~888 single-card imports 整体复制）
- Modify: `shared/cards/catalog.ts`（删 ~888 single-card imports + 删 raw arrays + 4 implemented* 定义；改 import 自 `_lookup-data.ts`；保留外部 export 同名）

**Goal**: cards-display 一侧完整持有 majors display data + minor/occupation raw arrays + IDs + implemented filter，**无 hooks 引用**。catalog.ts 反向 import _lookup-data（合规：impl→display 单方向），删 catalog 自身 single-card imports 实现 ~890 行瘦身。tsc + lint + test:fast 全绿。

### 1A. 拆 types.ts

- [ ] **Step 1.1: 修改 `shared/cards/major/types.ts`**

```typescript
import type { Resource, ComplexCost } from '../../contract/types'
import type { CardEffect, CardEffectHook } from '../card-effects'
import type { CardDefinition } from '../../contract/cards'

/**
 * Hooks majors are allowed to register. Excludes `onBeforePlayerTurn`
 * because that hook returns `{ skipTurn?: boolean } | void` rather than
 * `ActionFlow | void`, and `applyMajorEffectForImprovement` assumes every
 * hook is flow-shaped.
 */
export type MajorEffectHook = Exclude<CardEffectHook, 'onBeforePlayerTurn'>

/**
 * Display-only major card metadata (no hooks). Used by cards-display/major
 * and consumed via `getMajorCardDisplay` from client tree-shake-friendly paths.
 */
export type MajorCardDisplay = CardDefinition & {
  cost: Partial<Resource> | ComplexCost
  vp: number
  extraVp: boolean
  desc: string[]
}

/**
 * Major hooks layer. Map-keyed by major id in `cards/major/effects.ts`.
 */
export type MajorHooks = Pick<CardEffect, MajorEffectHook>

/**
 * Composite type used by callers (improvement / exchange / round / catalog).
 * `cards/major/index.ts` builds these by merging display data with effects.
 */
export type MajorCardData = MajorCardDisplay & MajorHooks
```

- [ ] **Step 1.2: 跑 tsc 看影响（应该全绿——已有 cards/major/* 文件仍 import MajorCardData）**

```bash
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm exec tsc -p tsconfig.server.json --noEmit
```

Expected: 0 error（cards/major/<file>.ts 仍用 `MajorCardData` 类型，含 hooks 字段，匹配 `MajorCardDisplay & MajorHooks` 合成类型）。

### 1B. cards-display/major/<8 文件>.ts 改纯 display

- [ ] **Step 1.3: 修改 `shared/cards-display/major/well.ts`**

```typescript
import type { MajorCardDisplay } from '../../cards/major/types'

export const well: MajorCardDisplay = {
  id: 'Major_Well',
  name: 'Well',
  deck: 'major',
  number: 7,
  cost: { wood: 1, stone: 3 },
  vp: 4,
  extraVp: false,
  desc: ['[Put 1 <FOOD> on the 5 next turns. At the start of each turn, collect the <FOOD>]'],
}
```

删除 `import { queueFutureMeeplesFlow }` 和整个 `onBuy` 字段。

- [ ] **Step 1.4: 修改 `shared/cards-display/major/joinery.ts`**

```typescript
import type { MajorCardDisplay } from '../../cards/major/types'

export const joinery: MajorCardDisplay = {
  id: 'Major_Joinery',
  name: 'Joinery',
  deck: 'major',
  number: 8,
  cost: { wood: 2, stone: 2 },
  vp: 2,
  extraVp: true,
  desc: [
    '[Harvest]',
    '<WOOD> <ARROW-1X> 2<FOOD>',
    '[Scoring]',
    '3/5/7<WOOD> <ARROW-1X> 1/2/3<SCORE>',
  ],
  scoring: {
    resource: 'wood',
    map: {
      '3-4': 1,
      '5-6': 2,
      '7+': 3,
    },
  },
}
```

删除 `import { createSingleHarvestExchange }` 和 `onHarvest` 字段。

- [ ] **Step 1.5: 修改 `shared/cards-display/major/pottery.ts`**

```typescript
import type { MajorCardDisplay } from '../../cards/major/types'

export const pottery: MajorCardDisplay = {
  id: 'Major_Pottery',
  name: 'Pottery',
  deck: 'major',
  number: 9,
  cost: { clay: 2, stone: 2 },
  vp: 2,
  extraVp: true,
  desc: [
    '[Harvest]',
    '<CLAY> <ARROW-1X> 2<FOOD>',
    '[Scoring]',
    '3/5/7<CLAY> <ARROW-1X> 1/2/3<SCORE>',
  ],
  scoring: {
    resource: 'clay',
    map: {
      '3-4': 1,
      '5-6': 2,
      '7+': 3,
    },
  },
}
```

- [ ] **Step 1.6: 修改 `shared/cards-display/major/basketmaker.ts`**

```typescript
import type { MajorCardDisplay } from '../../cards/major/types'

export const basketmaker: MajorCardDisplay = {
  id: 'Major_Basket',
  name: 'Basketmaker',
  deck: 'major',
  number: 10,
  cost: { reed: 2, stone: 2 },
  vp: 2,
  extraVp: true,
  desc: [
    '[Harvest]',
    '<REED> <ARROW-1X> 3<FOOD>',
    '[Scoring]',
    '2/4/5<REED> <ARROW-1X> 1/2/3<SCORE>',
  ],
  scoring: {
    resource: 'reed',
    map: {
      '2-3': 1,
      '4': 2,
      '5+': 3,
    },
  },
}
```

- [ ] **Step 1.7: 修改 `shared/cards-display/major/stone-oven.ts`**

```typescript
import type { MajorCardDisplay } from '../../cards/major/types'

export const stoneOven: MajorCardDisplay = {
  id: 'Major_StoneOven',
  name: 'Stone Oven',
  deck: 'major',
  number: 6,
  cost: { clay: 1, stone: 3 },
  vp: 3,
  extraVp: false,
  isBaking: true,
  desc: [
    '[__Bake Bread__ action:]',
    '<GRAIN> <ARROW-2X> 4<FOOD>',
    '[When you build it, you can Bake immediately]',
  ],
}
```

- [ ] **Step 1.8: 修改 `shared/cards-display/major/clay-oven.ts`**

```typescript
import type { MajorCardDisplay } from '../../cards/major/types'

export const clayOven: MajorCardDisplay = {
  id: 'Major_ClayOven',
  name: 'Clay Oven',
  deck: 'major',
  number: 5,
  cost: { clay: 3, stone: 1 },
  vp: 2,
  extraVp: false,
  isBaking: true,
  desc: [
    '[__Bake Bread__ action:]',
    '<GRAIN> <ARROW-1X> 5<FOOD>',
    '[When you build it, you can Bake immediately]',
  ],
}
```

- [ ] **Step 1.9: 修改 `shared/cards-display/major/cooking-hearth.ts`**

cooking-hearth 无 hooks，仅类型从 `MajorCardData` 改为 `MajorCardDisplay`：

```typescript
import type { MajorCardDisplay } from '../../cards/major/types'

export const cookingHearth1: MajorCardDisplay = {
  id: 'Major_CookingHearth1',
  name: 'Cooking Hearth',
  deck: 'major',
  number: 3,
  cost: {
    fee: { clay: 4 },
    cards: { type: 'Major', list: ['Major_Fireplace1', 'Major_Fireplace2'] },
  },
  vp: 1,
  extraVp: false,
  isCookery: true,
  isBaking: true,
  returnCards: ['Major_Fireplace1', 'Major_Fireplace2'],
  desc: [
    '[Anytime]',
    '<VEGETABLE> <ARROW> 3<FOOD>      <PIG> <ARROW> 3<FOOD>',
    '<SHEEP> <ARROW> 2<FOOD>      <CATTLE> <ARROW> 4<FOOD>',
    '[__Bake Bread__ action:]',
    '<GRAIN> <ARROW> 3<FOOD>',
  ],
  exchanges: [
    { from: { sheep: 1 }, to: { food: 2 }, sourceId: 'Major_CookingHearth1', triggers: ['anytime'] },
    { from: { boar: 1 }, to: { food: 3 }, sourceId: 'Major_CookingHearth1', triggers: ['anytime'] },
    { from: { cattle: 1 }, to: { food: 4 }, sourceId: 'Major_CookingHearth1', triggers: ['anytime'] },
    { from: { vegetable: 1 }, to: { food: 3 }, sourceId: 'Major_CookingHearth1', triggers: ['anytime'] },
    { from: { grain: 1 }, to: { food: 3 }, sourceId: 'Major_CookingHearth1', triggers: ['bake-bread'] },
  ],
}

export const cookingHearth2: MajorCardDisplay = {
  ...cookingHearth1,
  id: 'Major_CookingHearth2',
  number: 4,
  cost: {
    fee: { clay: 5 },
    cards: { type: 'Major', list: ['Major_Fireplace1', 'Major_Fireplace2'] },
  },
  exchanges: cookingHearth1.exchanges?.map((ex) => ({ ...ex, sourceId: 'Major_CookingHearth2' })),
}
```

- [ ] **Step 1.10: 修改 `shared/cards-display/major/fireplace.ts`**

仅类型改：

```typescript
import type { MajorCardDisplay } from '../../cards/major/types'

export const fireplace1: MajorCardDisplay = {
  id: 'Major_Fireplace1',
  name: 'Fireplace',
  deck: 'major',
  number: 1,
  cost: { clay: 2 },
  vp: 1,
  extraVp: false,
  isCookery: true,
  isBaking: true,
  fireplaceIdentity: true,
  desc: [
    '[Anytime]',
    '<VEGETABLE> <ARROW> 2<FOOD>      <PIG> <ARROW> 2<FOOD>',
    '<SHEEP> <ARROW> 2<FOOD>      <CATTLE> <ARROW> 3<FOOD>',
    '[__Bake Bread__ action:]',
    '<GRAIN> <ARROW> 2<FOOD>',
  ],
  exchanges: [
    { from: { sheep: 1 }, to: { food: 2 }, sourceId: 'Major_Fireplace1', triggers: ['anytime'] },
    { from: { boar: 1 }, to: { food: 2 }, sourceId: 'Major_Fireplace1', triggers: ['anytime'] },
    { from: { cattle: 1 }, to: { food: 3 }, sourceId: 'Major_Fireplace1', triggers: ['anytime'] },
    { from: { vegetable: 1 }, to: { food: 2 }, sourceId: 'Major_Fireplace1', triggers: ['anytime'] },
    { from: { grain: 1 }, to: { food: 2 }, sourceId: 'Major_Fireplace1', triggers: ['bake-bread'] },
  ],
}

export const fireplace2: MajorCardDisplay = {
  ...fireplace1,
  id: 'Major_Fireplace2',
  number: 2,
  cost: { clay: 3 },
  exchanges: fireplace1.exchanges?.map((ex) => ({ ...ex, sourceId: 'Major_Fireplace2' })),
}
```

- [ ] **Step 1.11: 跑 tsc 验证 cards-display/major 改动**

```bash
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm exec tsc -p tsconfig.server.json --noEmit
```

Expected: 0 error。如果 fail，多半是 `MajorCardDisplay` 字段缺失（如 `scoring` / `isBaking` / `isCookery` / `returnCards` / `fireplaceIdentity` 不在 `CardDefinition` 中）。处理方式：把这些字段加到 `MajorCardDisplay` 类型（在 types.ts 1.1 step 中扩展），或检查 CardDefinition 是否已含。

### 1C. 创建 cards-display/major/index.ts

- [ ] **Step 1.12: 创建 `shared/cards-display/major/index.ts`**

```typescript
import type { MajorCardDisplay } from '../../cards/major/types'
import { basketmaker } from './basketmaker'
import { clayOven } from './clay-oven'
import { cookingHearth1, cookingHearth2 } from './cooking-hearth'
import { fireplace1, fireplace2 } from './fireplace'
import { joinery } from './joinery'
import { pottery } from './pottery'
import { stoneOven } from './stone-oven'
import { well } from './well'

/**
 * All major improvement display data, ordered to match the legacy
 * `majorCardDefinitions` array in `shared/cards/major/index.ts`.
 * Hooks live in `shared/cards/major/effects.ts` (Sprint S8 split);
 * the composite (display + effects) is built by `cards/major/index.ts`.
 */
export const majorCardDisplayData: readonly MajorCardDisplay[] = [
  fireplace1,
  fireplace2,
  cookingHearth1,
  cookingHearth2,
  clayOven,
  stoneOven,
  well,
  joinery,
  pottery,
  basketmaker,
]

export const majorImprovementIdsList: readonly string[] =
  majorCardDisplayData.map((c) => c.id)

const majorDisplayMap = new Map<string, MajorCardDisplay>(
  majorCardDisplayData.map((c) => [c.id, c]),
)

/**
 * Lightweight major-only display lookup. Client paths (e.g.
 * `client/app/hooks/use-harvest-flow.ts`) should use this rather than
 * `getMajorCard` from `cards/major` to keep `cards/major/effects.ts`
 * out of the client bundle.
 */
export const getMajorCardDisplay = (id: string): MajorCardDisplay | undefined =>
  majorDisplayMap.get(id)
```

- [ ] **Step 1.13: 跑 tsc**

```bash
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm exec tsc -p tsconfig.server.json --noEmit
```

Expected: 0 error。

### 1D. 创建 _lookup-data.ts（聚合 minor/occupation raw + IDs + implemented filter）

- [ ] **Step 1.14: 创建 `shared/cards-display/_lookup-data.ts`**

把 `shared/cards/catalog.ts` 当前 L1-902 的 single-card imports（`import { A10_WoodenShed } from '../cards-display/A/A10_WoodenShed'` 等 ~888 行）整体复制到 `_lookup-data.ts`，**注意路径变化**：catalog.ts 里 import 写 `'../cards-display/A/...'`，移到 cards-display 一侧后改成 `'./A/...'`。

文件骨架（具体 imports 用 codemod 自动生成，避免手抄出错）：

```typescript
// Aggregated minor / occupation card display data + IDs + implemented filter.
// Single source of truth for cards-display single-card aggregation.
// `shared/cards/catalog.ts` re-imports these instead of maintaining its own
// duplicate list. `shared/cards-display/_lookup.ts` consumes the IDs lists
// without any reverse import into `shared/cards/`.

import type {
  MinorImprovement as MinorImprovementCard,
  Occupation as OccupationCard,
  PlayerActionCard,
} from './types'

// ── Minor / occupation single-card imports (~888 lines, copied from catalog.ts) ──
import { A10_WoodenShed } from './A/A10_WoodenShed'
import { A11_MudPatch } from './A/A11_MudPatch'
// ... (~888 lines total)
// Note: side-effect import preserved — `import './C/C39_StudioBoat'` at end of catalog.ts L902.
import './C/C39_StudioBoat'

// ── Aggregated arrays (copied from catalog.ts L904-1340 minorImprovementCards
//    and L1344-XXXX occupationCards) ──

export const minorImprovementCardsList: readonly (MinorImprovementCard | PlayerActionCard)[] = [
  A10_WoodenShed,
  // ... (full list copied verbatim from catalog.ts minorImprovementCards array)
]

export const occupationCardsList: readonly (OccupationCard | PlayerActionCard)[] = [
  // ... (full list copied verbatim from catalog.ts occupationCards array)
]

// ── Implemented filter (copied from catalog.ts L1832-1838 helpers) ──

export const isImplementedCard = (card: { implemented?: boolean }): boolean =>
  card.implemented !== false

export const implementedMinorImprovementCardsList: readonly (MinorImprovementCard | PlayerActionCard)[] =
  minorImprovementCardsList.filter(isImplementedCard)

export const implementedOccupationCardsList: readonly (OccupationCard | PlayerActionCard)[] =
  occupationCardsList.filter(isImplementedCard)

// ── ID lists (copied from catalog.ts L1840-1841) ──

export const minorImprovementIdsList: readonly string[] =
  implementedMinorImprovementCardsList.map((card) => card.id)

export const occupationIdsList: readonly string[] =
  implementedOccupationCardsList.map((card) => card.id)
```

实施方式（推荐）：写一次性 codemod 脚本 `scripts/codemod-build-lookup-data.ts`，从 `catalog.ts` 解析 single-card imports + minor/occupation raw arrays，输出到 `_lookup-data.ts`，路径改写 `'../cards-display/X/Y'` → `'./X/Y'`。这样保证两份完全一致，无人工抄写错。Codemod 仅运行一次（B1），不需保留为 CI hook。

或简单 sed/awk 批量替换：

```bash
# 把 catalog.ts 顶部 import + raw arrays 复制到 _lookup-data.ts，并改路径
sed -n '7,902p' shared/cards/catalog.ts \
  | sed -E "s|from '\\.\\./cards-display/|from './|g" \
  > /tmp/s8-_lookup-data-imports.ts

sed -n '904,1843p' shared/cards/catalog.ts > /tmp/s8-_lookup-data-arrays.ts

# 然后手工组合 imports + arrays + isImplemented + IDs 到 _lookup-data.ts
# 注意 L904-1343 是 minorImprovementCards = [...] 的内容
# L1344-XXXX 是 occupationCards = [...] 的内容
# 用 grep 找精确边界
grep -n "^export const \|^]" shared/cards/catalog.ts | head -20
```

- [ ] **Step 1.15: 跑 tsc 验证 _lookup-data.ts**

```bash
pnpm exec tsc -p tsconfig.app.json --noEmit
```

Expected: 0 error。如有 import path error，逐个修正——cards-display 单卡文件名应该完全不变，只是 `'../cards-display/'` 改 `'./'`。

### 1E. catalog.ts 改 import _lookup-data（顺手瘦身 ~900 行）

- [ ] **Step 1.16: 修改 `shared/cards/catalog.ts` 头部 + raw arrays**

删除 `shared/cards/catalog.ts` L7-902 的所有 single-card imports + L904-XXXX 的两个 raw arrays + L1832-1838 的 implemented helpers + L1840-1841 的 IDs。改用 `_lookup-data.ts` 提供的版本：

```typescript
// shared/cards/catalog.ts L1-7 改写为：
import { getCustomMinorImprovement, getCustomOccupation } from './custom-registry'
import { MinorImprovement, Occupation, PlayerActionCard } from '../cards-display/types'
import { registerCardLookups } from './registry-runtime'
import type { CardDefinition } from '../contract/cards'
import { majorCardDefinitions } from './major'
import { allCommunityCards } from './community/auto-catalog'
import {
  minorImprovementCardsList,
  occupationCardsList,
  implementedMinorImprovementCardsList,
  implementedOccupationCardsList,
  minorImprovementIdsList,
  occupationIdsList,
} from '../cards-display/_lookup-data'

// 删除原 L7-902 的 ~888 single-card imports + L902 'import "./C/C39_StudioBoat"'
// （副作用 import 已转移到 _lookup-data.ts 中）
```

替换 raw arrays（catalog L904-1343 + L1344-1830 的两个 `export const minorImprovementCards = [...]` / `occupationCards = [...]`）：

```typescript
// catalog.ts 中保留外部 export 同名（避免 caller 改动），但改用 _lookup-data 提供的 list
export const minorImprovementCards = minorImprovementCardsList
export const occupationCards = occupationCardsList

// allMinorImprovementCards / allOccupationCards 是 catalog 自身合成 community + base：
export const allMinorImprovementCards = [...minorImprovementCards, ...communityMinors]
export const allOccupationCards = [...occupationCards, ...communityOccupations]

// implemented filter 改用 _lookup-data 版本：
export const implementedMinorImprovementCards = implementedMinorImprovementCardsList
export const implementedOccupationCards = implementedOccupationCardsList
export const implementedCommunityMinors = communityMinors.filter((c) => c.implemented !== false)
export const implementedCommunityOccupations = communityOccupations.filter((c) => c.implemented !== false)

// IDs export 改用 _lookup-data 版本：
export const minorImprovementIds = minorImprovementIdsList
export const occupationIds = occupationIdsList
```

注意 `allMinorImprovementCards` / `allOccupationCards` / `implementedCommunityMinors` / `implementedCommunityOccupations` 仍依赖 `communityMinors` 和 `communityOccupations`（catalog.ts 内部从 community 一侧聚合，不搬）—— 它们是 catalog 自身责任。

`getMinorImprovementCard` / `getOccupationCard` / `getCardDefinition` (catalog L1842-XXXX) 不改，沿用 catalog 现有逻辑。

- [ ] **Step 1.17: 跑 tsc + lint + test:fast**

```bash
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm exec tsc -p tsconfig.server.json --noEmit
pnpm run lint
pnpm test:fast
```

Expected: 全部通过。test:fast 应 ~2277 pass + ~13 skipped（baseline 同 S7 末，无新 fail）。

如果 catalog.ts 编辑出错（缺失某个 `communityMinors` 引用、`scoring` / `isBaking` 字段等），按 tsc 错误逐个修正。

- [ ] **Step 1.18: commit Batch 1**

```bash
git add shared/cards/major/types.ts \
        shared/cards-display/major/ \
        shared/cards-display/_lookup-data.ts \
        shared/cards/catalog.ts
git status  # 确认 modified/created 文件清单：
            #   M shared/cards/major/types.ts
            #   M shared/cards-display/major/{8 文件}.ts
            #   ?? shared/cards-display/major/index.ts
            #   ?? shared/cards-display/_lookup-data.ts
            #   M shared/cards/catalog.ts (~890 行减少)
git commit -m "$(cat <<'EOF'
refactor(s8): cards-display 纯数据层落地（B1）

- types.ts 拆 MajorCardDisplay (CardDefinition + cost/vp/extraVp/desc) +
  MajorHooks (Pick<CardEffect, MajorEffectHook>) + MajorCardData
  (intersect)。caller-facing API 不变，cards/major/<file>.ts 仍工作。
- cards-display/major/<8 文件>.ts 删 hooks + 类型改 MajorCardDisplay。
- 新建 cards-display/major/index.ts（majorCardDisplayData[] +
  majorImprovementIdsList + getMajorCardDisplay）。
- 新建 cards-display/_lookup-data.ts（minor/occupation raw arrays +
  implemented filter + IDs，~888 single-card imports 从 catalog.ts 移过来）。
- catalog.ts 改 import _lookup-data，删自身 ~888 single-card imports
  + 两个 raw arrays + 4 个 implemented* 定义；外部 export 同名保持
  caller 接口不变（minorImprovementCards / occupationCards / IDs / etc）。

cards-display/major 此时仍含 hooks 字段在 types-level 兼容
(MajorCardDisplay 是 MajorCardData 子集)，但实际数据无 hooks。
Caller 仍从 cards/major 取合成版本（含 hooks）— 该合成由 B2 完成。
S8 spec §2 全部 done。
EOF
)"
```

- [ ] **Step 1.19: rebase + push + dispatch CI**

```bash
git fetch origin
git rebase origin/main  # 应 fast-forward 或 already up to date
pnpm test:fast
pnpm run lint
git push -u origin sprint-S8

# CI 不会自动触发 sprint-S8 push，手动 dispatch（参考 S7 流程）
export GH_TOKEN=$(grep '^GH_TOKEN=' /data00/home/xuxinhao.titan/raw/open-agricola/.env | cut -d= -f2-)
curl -s -X POST -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/titanxxh/open-agricola/actions/workflows/ci.yml/dispatches \
  -d '{"ref":"sprint-S8"}'
echo "dispatched"
```

等 CI 完成（参考 S7 经验：~25 min；可用 ScheduleWakeup）：

```bash
sleep 60  # 等 GitHub 启动 run
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  'https://api.github.com/repos/titanxxh/open-agricola/actions/runs?per_page=3&branch=sprint-S8' \
  | jq '.workflow_runs[] | {head_sha: .head_sha[0:8], status, conclusion, html_url}'
```

Expected: B1 commit SHA 显示在最新 run，等到 status `completed` + conclusion `success`。

---

## Task 2 (B2): cards/major effects.ts + index 合成 + 删 8 镜像

**Files:**
- Create: `shared/cards/major/effects.ts`（Map: id → Partial<MajorHooks>，1:1 移植 6 张含 hooks majors 的函数体）
- Modify: `shared/cards/major/index.ts`（内部从 cards-display 取 displayData + effects 合成 majorCardDefinitions；保留 getMajorCard / applyMajorEffectsToAllPlayers helpers 不变）
- Delete: `shared/cards/major/{basketmaker,clay-oven,cooking-hearth,fireplace,joinery,pottery,stone-oven,well}.ts`（8 旧镜像）

**Goal**: hooks 物理迁到 effects.ts；cards/major 不再持有 majors single-card 文件；caller helper API 不变。

### 2A. 创建 effects.ts

- [ ] **Step 2.1: 创建 `shared/cards/major/effects.ts`**

```typescript
import type { MajorHooks } from './types'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import { createSingleHarvestExchange } from '../helpers/stage-effects'

/**
 * Hooks for 6 of 10 majors (the other 4 — fireplace1/2, cookingHearth1/2 —
 * have no hooks and are absent from this map). Lookup via
 * `majorEffects[id] ?? {}` in `cards/major/index.ts` synthesis; missing
 * keys mean the major has no hooks (synthesized object reads `.onBuy`
 * etc as `undefined`).
 *
 * Hook function bodies are 1:1 ports from the legacy
 * `shared/cards/major/{file}.ts` files (deleted in this batch).
 */
type MajorEffectsMap = Record<string, Partial<MajorHooks>>

export const majorEffects: MajorEffectsMap = {
  Major_Well: {
    onBuy: (state, player) => {
      return queueFutureMeeplesFlow(state, {
        cardId: 'Major_Well',
        playerId: player.id,
        startRound: state.round + 1,
        count: 5,
        resources: { food: 1 },
      })
    },
  },
  Major_Joinery: {
    onHarvest: createSingleHarvestExchange('wood', { food: 2 }, { sourceId: 'Major_Joinery' }),
  },
  Major_Pottery: {
    onHarvest: createSingleHarvestExchange('clay', { food: 2 }),
  },
  Major_Basket: {
    onHarvest: createSingleHarvestExchange('reed', { food: 3 }),
  },
  Major_StoneOven: {
    onBuy: () => ({
      type: 'leaf',
      actionId: 'bake-bread',
      optional: true,
      sourceCard: 'Major_StoneOven',
    }),
  },
  Major_ClayOven: {
    onBuy: () => ({
      type: 'leaf',
      actionId: 'bake-bread',
      optional: true,
      sourceCard: 'Major_ClayOven',
    }),
  },
}
```

注意：`Major_Basket` 不是 `Major_Basketmaker` —— 与 basketmaker.ts 中 `id: 'Major_Basket'` 一致（参考 spec §3.4 caller 验证；major id 与文件名映射规则）。

- [ ] **Step 2.2: 跑 tsc**

```bash
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm exec tsc -p tsconfig.server.json --noEmit
```

Expected: 0 error。

### 2B. 改 index.ts 合成

- [ ] **Step 2.3: 修改 `shared/cards/major/index.ts`**

```typescript
import type { ActionFlow, GameState, PlayerState } from '../../contract/types'
import type { MajorCardData, MajorEffectHook } from './types'
import { majorCardDisplayData } from '../../cards-display/major'
import { majorEffects } from './effects'

/**
 * Composite major card definitions (display data + hooks).
 * Built once at module init by merging `cards-display/major` (display)
 * with `./effects` (hooks). caller-facing API unchanged from S7 — same
 * shape as the legacy inline `majorCardDefinitions: MajorCardData[]`.
 */
export const majorCardDefinitions: readonly MajorCardData[] =
  majorCardDisplayData.map((display) => ({
    ...display,
    ...(majorEffects[display.id] ?? {}),
  }))

const majorDefinitionMap = new Map<string, MajorCardData>(
  majorCardDefinitions.map((effect) => [effect.id, effect]),
)

/**
 * Lightweight major-only lookup. Server paths use the unified
 * `getCardDefinition` (which queries occupation / minor / major catalogs).
 * Card / frontend code that only needs majors metadata should import this
 * instead so vite tree-shaking can drop the rest of the catalog from the
 * client bundle (`getCardDefinition` triggers all three card-data sources
 * to be retained, ballooning the bundle).
 *
 * NOTE: Client paths needing only display fields (id/name/cost/vp/desc/
 * exchanges) should use `getMajorCardDisplay` from
 * `shared/cards-display/major` instead — that path doesn't pull
 * `./effects` into the client bundle. (B4 migrates use-harvest-flow.ts.)
 */
export const getMajorCard = (id: string): MajorCardData | undefined =>
  majorDefinitionMap.get(id)

const applyMajorEffectForImprovement = (
  state: GameState,
  player: PlayerState,
  improvementId: string,
  hook: MajorEffectHook,
): ActionFlow | null => {
  const effect = majorDefinitionMap.get(improvementId)
  const handler = effect?.[hook]
  if (handler) {
    return handler(state, player) ?? null
  }
  return null
}

const applyMajorEffectsForPlayer = (
  state: GameState,
  player: PlayerState,
  hook: MajorEffectHook,
) => {
  player.improvements.forEach((improvementId) => {
    applyMajorEffectForImprovement(state, player, improvementId, hook)
  })
}

export const applyMajorEffectsToAllPlayers = (
  state: GameState,
  hook: MajorEffectHook,
) => {
  state.players.forEach((player) => {
    applyMajorEffectsForPlayer(state, player, hook)
  })
}
```

- [ ] **Step 2.4: 跑 tsc**

```bash
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm exec tsc -p tsconfig.server.json --noEmit
```

Expected: 0 error（cards/major/<file>.ts 旧镜像仍存在但已被 index.ts 不再 import — TS6133 unused 错误？不会，因为它们没被 import 但仍可独立 export，tsc 不报错；ESLint 也不会扫描 dead exports 文件）。

### 2C. 删 8 旧镜像

- [ ] **Step 2.5: 删除 `shared/cards/major/<8 文件>.ts`**

```bash
rm shared/cards/major/basketmaker.ts \
   shared/cards/major/clay-oven.ts \
   shared/cards/major/cooking-hearth.ts \
   shared/cards/major/fireplace.ts \
   shared/cards/major/joinery.ts \
   shared/cards/major/pottery.ts \
   shared/cards/major/stone-oven.ts \
   shared/cards/major/well.ts

ls shared/cards/major/  # 应只剩: effects.ts  index.ts  types.ts
```

Expected: `shared/cards/major/` 只剩 3 个文件。

- [ ] **Step 2.6: 跑 tsc + lint + test:fast**

```bash
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm exec tsc -p tsconfig.server.json --noEmit
pnpm run lint
pnpm test:fast
```

Expected: 全部通过。

如有 lint error 提到 `shared/cards/major/<file>.ts` 不存在（caller 还在 import），意味着某 caller 直接 import single-card 路径（如 `shared/cards/major/well`），而非 `cards/major` index。需 grep 修复：

```bash
grep -rn "from ['\"].*shared/cards/major/[^'\"]*['\"]" --include="*.ts" 2>/dev/null \
  | grep -v "/major/index\|/major/types\|/major/effects" | head
```

应无 output。如有，把 import 改成 `'shared/cards/major'`（index 入口）。

### 2D. 跑 test:slow 验证 majors session 测试无 regression

- [ ] **Step 2.7: 跑 test:slow**

```bash
pnpm test:slow 2>&1 | tail -10
```

Expected: 与 S7 末 baseline 持平（~30 flaky 范围内）。重点关注 majors-related 测试：

```bash
pnpm exec vitest run server/__tests__/B25_BreadPaddle-session.test.ts \
                       server/__tests__/E91_PlowBuilder-session.test.ts \
                       'shared/cards/major/__tests__/*.test.ts' 2>&1 | tail -10
```

Expected: 100% 通过（这些测试直接验证 majors hooks）。

- [ ] **Step 2.8: commit Batch 2**

```bash
git add shared/cards/major/ \
        # 删除的文件需显式 git rm 才进 staging：
        ;
git rm shared/cards/major/basketmaker.ts \
       shared/cards/major/clay-oven.ts \
       shared/cards/major/cooking-hearth.ts \
       shared/cards/major/fireplace.ts \
       shared/cards/major/joinery.ts \
       shared/cards/major/pottery.ts \
       shared/cards/major/stone-oven.ts \
       shared/cards/major/well.ts 2>/dev/null || true
git add -A shared/cards/major/

git status  # 期望:
            #   ?? shared/cards/major/effects.ts
            #   M  shared/cards/major/index.ts
            #   D  shared/cards/major/{8 文件}.ts

git commit -m "$(cat <<'EOF'
refactor(s8): cards/major effects.ts + index 合成 + 删 8 镜像（B2）

- 新建 effects.ts: Map<MajorId, Partial<MajorHooks>>，1:1 移植 6 张
  含 hooks majors 的函数体（well onBuy / joinery+pottery+basket onHarvest /
  stoneOven+clayOven onBuy）。fireplace1/2、cookingHearth1/2 无 hooks，
  不在 map 中。
- index.ts 改用合成模式：majorCardDefinitions = displayData.map(d =>
  ({ ...d, ...effects[d.id] ?? {} }))，caller-facing API 不变
  (majorCardDefinitions / getMajorCard / applyMajorEffectsToAllPlayers
  全部同语义)。
- 删 cards/major/{8 文件}.ts 旧镜像（已迁到 cards-display/major/<file>
  + effects.ts 两份）。

cards/major/ 目录现在仅 3 文件：effects.ts + index.ts + types.ts。
caller 5 处（improvement-options/improvement/exchange/round/use-harvest-flow）
+ catalog.ts:5 + setup-register-all.ts:31 全部不动。

S8 spec §3 全部 done. _lookup.ts 反向 import 仍未切断 — B3 完成。
EOF
)"
```

- [ ] **Step 2.9: rebase + push + dispatch CI**

```bash
git fetch origin
git rebase origin/main
pnpm test:fast
pnpm run lint
git push

export GH_TOKEN=$(grep '^GH_TOKEN=' /data00/home/xuxinhao.titan/raw/open-agricola/.env | cut -d= -f2-)
curl -s -X POST -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/titanxxh/open-agricola/actions/workflows/ci.yml/dispatches \
  -d '{"ref":"sprint-S8"}'

sleep 60
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  'https://api.github.com/repos/titanxxh/open-agricola/actions/runs?per_page=3&branch=sprint-S8' \
  | jq '.workflow_runs[] | {head_sha: .head_sha[0:8], status, conclusion}'
```

等到 CI 全绿才进 B3。

---

## Task 3 (B3): _lookup.ts 切断双反向 + ESLint rule 7 豁免清零

**Files:**
- Modify: `shared/cards-display/_lookup.ts`（删 2 个反向 import，改本地 + cards-display 内部）
- Modify: `eslint.config.js`（rule 7 删 ignores）

**Goal**: `_lookup.ts` 0 反向 import；ESLint rule 7 豁免清零（cards-display/major + _lookup.ts，types.ts 视情况）；cards-display 边界完全单方向。

### 3A. 切断 _lookup.ts 反向 import

- [ ] **Step 3.1: 修改 `shared/cards-display/_lookup.ts`**

```typescript
import type {
  MinorImprovement as MinorImprovementCard,
  Occupation as OccupationCard,
  PlayerActionCard,
} from './types'
import { majorImprovementIdsList } from './major'
import {
  minorImprovementCardsList,
  minorImprovementIdsList,
  occupationCardsList,
  occupationIdsList,
} from './_lookup-data'
import {
  getCustomMinorImprovement,
  getCustomOccupation,
} from '../cards/custom-registry'

export const majorImprovementIds = majorImprovementIdsList

export type MinorImprovement = MinorImprovementCard | PlayerActionCard

export const minorImprovements: MinorImprovement[] = [...minorImprovementCardsList]

export const minorImprovementIds = minorImprovementIdsList

export const getMinorImprovement = (id: string) =>
  minorImprovements.find((improvement) => improvement.id === id)
  ?? getCustomMinorImprovement(id)

export type Occupation = OccupationCard | PlayerActionCard

export const occupations: Occupation[] = [...occupationCardsList]

export const occupationIds = occupationIdsList

export const getOccupation = (id: string) =>
  occupations.find((occupation) => occupation.id === id)
  ?? getCustomOccupation(id)
```

注意：
1. `import { majorCardDefinitions } from '../cards/major'` 替换为 `import { majorImprovementIdsList } from './major'`（local cards-display）。 不再需要 `.map(c => c.id)`，因为 `majorImprovementIdsList` 已经是 IDs 数组。
2. `import { ... } from '../cards/catalog'` 替换为 `import { ... } from './_lookup-data'`（local cards-display）。
3. `import { getCustomMinorImprovement, getCustomOccupation } from '../cards/custom-registry'` **保留**——`custom-registry` 是 runtime registration，需 cards/ → cards-display 反向是合规（runtime overlay 模式），不在 ESLint rule 7 限制范围。

但 wait — `custom-registry` import 不在 cards/major/<file> 也不在 catalog.ts，是独立的 runtime helper。它与 `_lookup.ts` 之间是**反方向**：cards-display/_lookup.ts → cards/custom-registry。这条 import 是 ESLint rule 7 限制的（cards-display 不能 import cards/）。

需评估：custom-registry 是否真的在 dev-mode 触发 TDZ？grep 它 imports 什么：

```bash
grep "^import" shared/cards/custom-registry.ts | head
```

Expected: `import { getActiveCardRegistry } from './active-registry.ts'` + `import { ... } from './session-card-context.ts'` + `import type { ... } from '../cards-display/types'`. 不含 cards/major 或 cards/catalog —— 不会形成 TDZ 与 _lookup.ts。

但 ESLint rule 7 仍会报 cards-display/_lookup.ts → cards/custom-registry 违规。处理方式：

**Option A**: 在 `_lookup-data.ts` 顶层加 `getCustomMinorImprovement` / `getCustomOccupation` re-export（forwarding seam，类似 `cards/registry-display.ts`）：

```typescript
// _lookup-data.ts 末尾追加：
export {
  getCustomMinorImprovement,
  getCustomOccupation,
} from '../cards/custom-registry'  // ← 反向 import 集中在 _lookup-data，rule 7 豁免它
```

但这把反向移到了 _lookup-data.ts 而不是 _lookup.ts。tsc 上 OK，运行时也 OK（custom-registry 不引 cards/major），但 ESLint 仍会报 _lookup-data.ts。

**Option B**: 把 custom-registry 整体移到 cards-display 一侧（runtime overlay 是 display 范畴）。但这是 spec 范围外的大改动，不做。

**Option C**: 给 _lookup.ts 保留 cards/custom-registry import + 单独评估是否给 _lookup.ts 留一条 ESLint exception 仅针对 custom-registry。但 spec §0 说 "cards-display 完全单方向"——这条 exception 与 spec 矛盾。

**Recommendation**: Option A — 把反向集中到 _lookup-data.ts，作为单一 forwarding 点；_lookup.ts 自身 0 反向 import（满足 spec §0）。然后 rule 7 给 _lookup-data.ts 加豁免（一项）—— 取代现有 _lookup.ts 豁免。豁免**总数**仍是 1，但语义是合理的（forwarding seam）。

按 Option A 调整 _lookup.ts 的 custom-registry import：

```typescript
// _lookup.ts 改为：
import { getCustomMinorImprovement, getCustomOccupation } from './_lookup-data'
```

并在 _lookup-data.ts 末尾追加 re-export（见上文）。

- [ ] **Step 3.2: 修改 `shared/cards-display/_lookup-data.ts` 末尾追加 forwarding**

```typescript
// 在 _lookup-data.ts 末尾追加：

// ── Custom card registry forwarding ──
// Runtime overlay registry lives in `shared/cards/custom-registry.ts` (impl
// side). cards-display references it via this module to keep `_lookup.ts`
// 0-reverse-import. ESLint rule 7 carves out `_lookup-data.ts` instead of
// `_lookup.ts` (single forwarding seam). custom-registry has no transitive
// import to cards/major or cards/catalog, so no TDZ risk.
export {
  getCustomMinorImprovement,
  getCustomOccupation,
} from '../cards/custom-registry'
```

- [ ] **Step 3.3: 跑 tsc + grep 验证 _lookup.ts 0 反向**

```bash
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm exec tsc -p tsconfig.server.json --noEmit

grep "from ['\"]\\.\\./cards" shared/cards-display/_lookup.ts
# Expected: 0 lines (no reverse import)

grep "from ['\"]\\.\\./cards" shared/cards-display/_lookup-data.ts
# Expected: 1 line — `export { ... } from '../cards/custom-registry'` (the forwarding seam)
```

### 3B. ESLint rule 7 豁免调整

- [ ] **Step 3.4: 修改 `eslint.config.js`**

定位 rule 7 区块（about line 145-180，files: 'shared/cards-display/**/*.{ts,tsx}'）。删除 `cards-display/major/**` 和 `_lookup.ts` 两项 ignores，新增 `_lookup-data.ts`（forwarding seam），评估 `types.ts`：

```javascript
// 修改后 rule 7（替换原 ignores 块）:
{
  files: ['shared/cards-display/**/*.{ts,tsx}'],
  ignores: [
    // _lookup-data.ts is the single forwarding seam for cards/custom-registry
    // (runtime overlay; no transitive imports to cards/major or cards/catalog,
    // so safe under vite dev ESM cycle resolution). Sprint S8 collapsed
    // _lookup.ts + cards-display/major/** exemptions into this one.
    'shared/cards-display/_lookup-data.ts',
    // types.ts owns the CardBase class hierarchy; reverse imports if any
    // are inherent to display root types — keep exemption.
    'shared/cards-display/types.ts',
  ],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: [
            '**/shared/actions/**',
            '**/shared/engine/**',
            '**/shared/session/**',
            '**/shared/cards/[A-E]/**',
            '**/shared/cards/community/**',
            '**/shared/cards/__stubs__/**',
          ],
          message: 'cards-display must not import impl layers (actions/engine/session) or cards/<deck>/ impl files',
        },
      ],
    }],
  },
},
```

参考现有 rule 7 完整文本（`eslint.config.js:159-180`），只改 `ignores` 数组内容，不改 rule body。

- [ ] **Step 3.5: 跑 lint 验证 0 error**

```bash
pnpm run lint
```

Expected: 0 error。如果 cards-display/major/<file>.ts 被 rule 7 catch 报 import 违规，意味着 majors 仍引 actions/effects/internal — 检查 B1 是否漏删某 hook import。

如果 types.ts 被 catch，评估具体违规：是否真需要保留 types.ts 豁免，或可清掉。grep types.ts 顶部：

```bash
grep "^import" shared/cards-display/types.ts | head
```

如 types.ts 仅 import contract/types 等纯类型，则可从 ignores 删除（最终 ESLint 豁免仅余 _lookup-data.ts 一项）。

- [ ] **Step 3.6: 本地手动跑 e2e 提前验证 TDZ 是否消失**

```bash
BACKEND_PORT=5275 nohup pnpm run server > /tmp/s8-b3-server.log 2>&1 &
nohup pnpm exec vite --port 5273 --strictPort > /tmp/s8-b3-frontend.log 2>&1 &
until curl -s http://localhost:5275/api/health 2>/dev/null | grep -q ok; do sleep 2; done
until curl -s -o /dev/null -w "%{http_code}" http://localhost:5273/ | grep -q 200; do sleep 2; done

FRONTEND_URL=http://localhost:5273 pnpm exec playwright test e2e-tests/workshop-smoke.spec.ts 2>&1 | tail -10

pkill -f "pnpm run server" || true
pkill -f "vite --port 5273" || true
```

Expected: e2e PASS（workshop-root 可见，浏览器 0 错误）。

如果**仍** fail，意味着 _lookup.ts 还有未识别的反向 chain。先 grep `_lookup-data.ts` 看是否有其他 cards/ import；先回滚 ESLint 改动，再回到 §3.1 调试。

如 e2e PASS：B3 已实质解决 TDZ，B4 改 client-side 是 tree-shake 优化 + 文档闭环（不再是关键路径）。

### 3C. commit + push + CI

- [ ] **Step 3.7: 跑全套验证**

```bash
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm exec tsc -p tsconfig.server.json --noEmit
pnpm run lint
pnpm test:fast
pnpm test:slow 2>&1 | tail -3  # baseline 30 flaky 范围内
pnpm run build
pnpm run check:bundle-size
```

Expected: 全部通过。bundle 大小不上升（理想下降 ~2 KB，因 _lookup.ts 不再导致 cards/major 完整 bundle）。

- [ ] **Step 3.8: commit Batch 3**

```bash
git add shared/cards-display/_lookup.ts \
        shared/cards-display/_lookup-data.ts \
        eslint.config.js
git commit -m "$(cat <<'EOF'
refactor(s8): _lookup.ts 切断双反向 + ESLint rule 7 豁免精简（B3）

- _lookup.ts 改为 0 反向 import（imports 只来自 ./types + ./major +
  ./_lookup-data，全部 cards-display 内部）。
  - majorCardDefinitions.map(c => c.id) → 直接用 majorImprovementIdsList
    from './major'。
  - cards/catalog 反向 import → cards-display/_lookup-data 本地。
  - cards/custom-registry → forwarding via _lookup-data 末尾 re-export
    (runtime overlay seam，无 transitive 反向到 cards/major 或 catalog)。
- _lookup-data.ts 末尾追加 custom-registry forwarding re-export，作为
  cards-display ← impl 单一 seam。
- eslint.config.js rule 7 ignores 从 3 项 [cards-display/major/**,
  _lookup.ts, types.ts] 缩到 ≤2 项 [_lookup-data.ts (seam),
  types.ts (视情况)]；cards-display/major/** + _lookup.ts 豁免清除。

vite dev TDZ 应已消除（手动 e2e workshop-smoke 在 B3 末验证通过）。
B4 仍负责客户端 tree-shake 优化 + 文档闭环。

S8 spec §4 全部 done。
EOF
)"
```

- [ ] **Step 3.9: rebase + push + dispatch CI**

```bash
git fetch origin
git rebase origin/main
pnpm test:fast
pnpm run lint
git push

curl -s -X POST -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/titanxxh/open-agricola/actions/workflows/ci.yml/dispatches \
  -d '{"ref":"sprint-S8"}'

sleep 60
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  'https://api.github.com/repos/titanxxh/open-agricola/actions/runs?per_page=3&branch=sprint-S8' \
  | jq '.workflow_runs[] | {head_sha: .head_sha[0:8], status, conclusion}'
```

等到 CI 全绿。

---

## Task 4 (B4): 客户端 use-harvest-flow.ts + e2e 实跑 + 文档闭环

**Files:**
- Modify: `client/app/hooks/use-harvest-flow.ts`（getMajorCard → getMajorCardDisplay）
- Modify: `docs/ENGINE_NEW_ARCHITECTURE.md`（L18 进度行 + §15 已知遗留 #2 + #3 closed + Sprint S8 收口段）

**Goal**: 客户端 main bundle 不再拉 cards/major hooks（vite tree-shake）；e2e workshop-smoke 在 sprint-S8 worktree 本地实跑通过；S6 已知遗留 #2 + #3 文档闭环。

### 4A. client tree-shake

- [ ] **Step 4.1: 修改 `client/app/hooks/use-harvest-flow.ts`**

定位 file 中的 `import { getMajorCard }` 和 `getMajorCard(cardId)` 调用站。改为：

```typescript
// 替换原 import:
// - import { getMajorCard } from '../../../shared/cards/major'
// + import { getMajorCardDisplay } from '../../../shared/cards-display/major'

// 替换原调用站:
// - const major = getMajorCard(cardId)
// + const major = getMajorCardDisplay(cardId)
//   pushFromExchanges(cardId, cardLabel(cardId), major?.exchanges)  // 用法不变
```

具体行号通过 grep 定位：

```bash
grep -n "getMajorCard\|cards/major" client/app/hooks/use-harvest-flow.ts
```

按 grep 输出修改对应行。

- [ ] **Step 4.2: 跑 tsc + lint + test:fast + check:bundle-size**

```bash
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm run lint
pnpm test:fast
pnpm run build
pnpm run check:bundle-size
```

Expected: 全部通过。`pnpm run build` 输出中 main bundle size 应该 ≤ S7 末水平（理想 -2~5 KB gzip）。

如 build size 反而上升（稀有），不阻塞 — `check:bundle-size` 限额 550 KB raw / 170 KB gzip 仍宽松，记入 follow-up。

### 4B. e2e 实跑

- [ ] **Step 4.3: 启动 dev server + 跑 e2e**

```bash
BACKEND_PORT=5275 nohup pnpm run server > /tmp/s8-b4-server.log 2>&1 &
nohup pnpm exec vite --port 5273 --strictPort > /tmp/s8-b4-frontend.log 2>&1 &
until curl -s http://localhost:5275/api/health 2>/dev/null | grep -q ok; do sleep 2; done
until curl -s -o /dev/null -w "%{http_code}" http://localhost:5273/ | grep -q 200; do sleep 2; done

FRONTEND_URL=http://localhost:5273 pnpm exec playwright test e2e-tests/workshop-smoke.spec.ts 2>&1 | tee /tmp/s8-e2e.log | tail -10
```

Expected: `1 passed (Xs)`。检查日志确认 0 个 `'majorCardDefinitions before initialization'` errors。

```bash
grep -E "PAGEERROR|Error|FAIL" /tmp/s8-e2e.log | head
```

Expected: 0 行（或无 majorCardDefinitions 相关错误）。

```bash
pkill -f "pnpm run server" || true
pkill -f "vite --port 5273" || true
lsof -i:5275 -i:5273  # 应无输出
```

如果 e2e 仍 fail，回到 B3 §3.6 调试（很可能 _lookup.ts 还有未发现的反向链）。但通常 B3 已验证通过 → B4 稳定通过。

### 4C. 文档闭环

- [ ] **Step 4.4: 更新 `docs/ENGINE_NEW_ARCHITECTURE.md` L18 进度行**

定位 L18（"当前 sprint 进度（详见 §15）"），加 S8 ✅:

```markdown
> **当前 sprint 进度**（详见 §15）：S1 ✅（2026-05-03）/ S2 ✅（2026-05-05）/ S3 ✅（2026-05-04，PaymentSolver 收口）/ S4a ✅（2026-05-04）/ S4b ✅（2026-05-05，rich-node + step() dispatch + cursor round-trip 落地）/ S4c ✅（2026-05-08，Engine API 收敛 14 → 6 + mirror 字段删除 + engine.ts 447 行）/ S5 ✅（2026-05-06，RoomManager 拆 connection/persistence 三层）/ S6 ✅（2026-05-08，物理分层 + cards-display split + sandbox lazy + 5 ESLint error 级规则）/ S7 ✅（2026-05-09，B104 引擎修复 + E70 public API rewrite + 825 cards-impl 桥清理；e2e smoke 暴露 S6c 残留 TDZ — 见 §15 deferred）/ S8 ✅（2026-05-XX，majors 物理分层 + cards-display _lookup 双反向切断 + ESLint rule 7 豁免精简到 ≤2 项）。
```

替换 `2026-05-XX` 为实际日期。

- [ ] **Step 4.5: 更新 `docs/ENGINE_NEW_ARCHITECTURE.md` §15 已知遗留**

定位"已知遗留（S6 closeout 时回流）"段（约 L1160）。

将 #2（cards-display/major ESLint 豁免）标 closed：

```markdown
2. **`shared/cards-display/major/**` 被 ESLint excluded** — ✅ **已闭环（S8 Batch 3, 2026-05-XX）**：majors 物理迁到 cards-display/major（仅 display data，0 hooks 引用）+ cards/major/effects.ts 持 hooks Map。ESLint rule 7 豁免 cards-display/major/** + _lookup.ts 全部清除；现 ≤2 项豁免（_lookup-data.ts forwarding seam + types.ts 视情况）。
```

将 #3（e2e workshop-smoke deferred）标 closed：

```markdown
3. **e2e workshop-smoke** — ✅ **已闭环（S8 Batch 4, 2026-05-XX）**：vite dev TDZ 循环 (`_lookup.ts` 反向 import `cards/major` + `cards/catalog`) 通过 majors 物理分层 + _lookup 切断双反向消除。e2e workshop-smoke 在 sprint-S8 worktree 实跑通过（浏览器 0 个 'majorCardDefinitions before initialization' 错误，data-testid='workshop-root' 可见）。S6c 原计划"hoisting major hooks"（rule 7 注释 L154）也在 S8 完成。
```

- [ ] **Step 4.6: 在 §15 末尾追加 Sprint S8 收口段**

在 §15 现有"Sprint S7"收口段之后追加：

```markdown
### Sprint S8（majors 物理分层 + cards-display _lookup 双反向切断） ✅ 完成（2026-05-XX）

> **DoD 达成**：
> - ✅ Batch 1 (commit `<B1 SHA>`): cards-display 纯数据层 — types.ts 拆 MajorCardDisplay/MajorHooks/MajorCardData；cards-display/major/<8 文件> 删 hooks 改 MajorCardDisplay；新建 cards-display/major/index.ts + cards-display/_lookup-data.ts；catalog.ts 改 import _lookup-data，删自身 ~888 single-card imports + 4 个 implemented* 定义（catalog.ts 瘦身 ~890 行）。
> - ✅ Batch 2 (commit `<B2 SHA>`): cards/major effects.ts (Map 1:1 移植 6 张 hooks) + index.ts 合成模式；删 cards/major/<8 文件>.ts 旧镜像。caller helper API 全部不变。
> - ✅ Batch 3 (commit `<B3 SHA>`): _lookup.ts 切断双反向（cards/major + cards/catalog → cards-display 本地）；ESLint rule 7 ignores 3 项 → ≤2 项（_lookup-data.ts forwarding seam + types.ts 视情况）。
> - ✅ Batch 4 (commit `<B4 SHA>`): client/app/hooks/use-harvest-flow.ts 改 getMajorCardDisplay (cards-display)，让 vite tree-shake majors hooks 离开 client bundle；e2e workshop-smoke 实跑通过；文档闭环。

#### Sprint S8 关键演进

- **majors 物理分层**：8 张 majors 现物理分两层 — `cards-display/major/<file>.ts` 纯 display data（id/name/cost/vp/desc/exchanges 等），`cards/major/effects.ts` 集中 6 张含 hooks majors 的函数体（map 模式，封闭集合）。`cards/major/index.ts` 在 module init 合成 `majorCardDefinitions: MajorCardData[]`，caller-facing API 与 S7 末完全一致。
- **catalog.ts 瘦身**：从 ~1860 行减到 ~970 行，~888 single-card imports + 4 个聚合 array 定义迁到 `cards-display/_lookup-data.ts`（impl→display 合规反向）。catalog.ts 仍是统一 facade（`getCardDefinition` 等），但内部数据源是 cards-display。
- **`_lookup.ts` 完全单方向**：cards-display 边界完全单方向（仅 import cards-display 内部 + types/contract）。唯一允许的 impl→display 反向集中在 `_lookup-data.ts` 末尾（custom-registry forwarding seam，runtime overlay 模式无 TDZ 风险）。
- **客户端 bundle**：vite tree-shake majors hooks 离开 client chunk（`use-harvest-flow.ts` 改 `getMajorCardDisplay`），main bundle 微减 ~2-5 KB gzip（实测见 build 输出）。

#### Sprint S8 已知遗留

无（spec §0 声明的"不在 S8" 项目均按 plan 排除：catalog 整体迁移 / minors register-all 改造 / e2e 入 CI / workshop-pr.spec 实跑 — 都需独立 brainstorm，与 S8 无依赖）。
```

替换 `<B1 SHA>` / `<B2 SHA>` / `<B3 SHA>` / `<B4 SHA>` 为实际 commit SHA（前 8 位）。

### 4D. commit + push + CI

- [ ] **Step 4.7: commit Batch 4**

```bash
git add client/app/hooks/use-harvest-flow.ts \
        docs/ENGINE_NEW_ARCHITECTURE.md
git commit -m "$(cat <<'EOF'
refactor(s8): client tree-shake + e2e 实跑 + 文档闭环（B4）

- client/app/hooks/use-harvest-flow.ts: getMajorCard
  (shared/cards/major) → getMajorCardDisplay (shared/cards-display/major)。
  vite tree-shake majors hooks 离开 main bundle (~2-5 KB gzip)。
- e2e-tests/workshop-smoke.spec.ts 在 sprint-S8 worktree 本地实跑通过：
  data-testid='workshop-root' 可见；浏览器 0 个 'majorCardDefinitions
  before initialization' 错误；S6c TDZ 已消除。
- docs/ENGINE_NEW_ARCHITECTURE.md:
  - L18 进度行加 S8 ✅。
  - §15 已知遗留 #2 (cards-display/major ESLint) + #3 (e2e
    workshop-smoke) 标 closed by S8。
  - §15 加 Sprint S8 收口段（DoD + 关键演进 + 4 batch SHA）。

S8 spec §5 + §6 全部 done。
EOF
)"
```

- [ ] **Step 4.8: rebase + push + dispatch CI**

```bash
git fetch origin
git rebase origin/main
pnpm test:fast
pnpm run lint
git push

curl -s -X POST -H "Authorization: Bearer $GH_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/titanxxh/open-agricola/actions/workflows/ci.yml/dispatches \
  -d '{"ref":"sprint-S8"}'

sleep 60
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  'https://api.github.com/repos/titanxxh/open-agricola/actions/runs?per_page=3&branch=sprint-S8' \
  | jq '.workflow_runs[] | {head_sha: .head_sha[0:8], status, conclusion}'
```

Expected: 全绿。

---

## Closeout: PR + merge

- [ ] **Step C.1: 创建 PR**

```bash
gh pr create --title "Sprint S8: majors physical layering + cards-display _lookup reverse-import elimination" \
  --body "$(cat <<'EOF'
## Summary
- B1: cards-display 纯数据层（types 拆型；cards-display/major 删 hooks；新建 cards-display/major/index.ts + _lookup-data.ts；catalog.ts 改 import _lookup-data 顺手瘦身 ~890 行）
- B2: cards/major effects.ts (Map 1:1 hooks) + index 合成 + 删 8 旧镜像
- B3: _lookup.ts 0 反向 import + ESLint rule 7 ignores 3→≤2 项
- B4: client use-harvest-flow.ts → getMajorCardDisplay tree-shake；e2e workshop-smoke 实跑通过；文档闭环

Closes ENGINE_NEW_ARCHITECTURE.md §15 known leftovers #2 + #3.

## Test plan
- [x] tsc app + server clean
- [x] lint clean
- [x] test:fast (~2277 pass + ~13 skipped)
- [x] test:slow (~30 flaky baseline 内)
- [x] build + check:bundle-size pass (main ≤ S7 末水平)
- [x] e2e workshop-smoke 本地实跑通过
- [x] GitHub Actions all green on sprint-S8 (4 commits)
EOF
)"
```

- [ ] **Step C.2: merge 到 main**

按用户决定时机。merge 后：

```bash
git checkout main
git pull --rebase origin main
git branch -D sprint-S8
git worktree remove .worktree/sprint-S8
```

- [ ] **Step C.3: 等 main CI 全绿**

```bash
sleep 60
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  'https://api.github.com/repos/titanxxh/open-agricola/actions/runs?per_page=5&branch=main' \
  | jq '.workflow_runs[] | {name, head_sha: .head_sha[0:8], status, conclusion, html_url}'
```

Expected: 最新 3 个 run（CI / Deploy Backend / Deploy Frontend）全绿。

---

## 整体 DoD（与 spec §6 对齐）

- [ ] `shared/cards-display/_lookup.ts` 0 反向 import（grep `from '\.\./cards' shared/cards-display/_lookup.ts` 应 0 行）
- [ ] ESLint rule 7 ignores ≤2 项（_lookup-data.ts seam + types.ts 视情况；cards-display/major/** 和 _lookup.ts 已移除）
- [ ] majors 8 张物理分层完成（cards-display/major 纯数据 + cards/major/effects.ts 持 hooks）
- [ ] caller helper API 不变（majorCardDefinitions / getMajorCard / applyMajorEffectsToAllPlayers 全部同语义）
- [ ] e2e workshop-smoke 在 sprint-S8 worktree 本地实跑通过
- [ ] 客户端 main bundle size ≤ S7 末水平（理想 -2-5 KB）
- [ ] `pnpm test:fast` + `pnpm test:slow`（~30 flaky 内）+ tsc + lint + build + check:bundle-size 全绿
- [ ] 全 4 batch 推到 main 后 GitHub Actions 全绿
- [ ] `docs/ENGINE_NEW_ARCHITECTURE.md` §15 已知遗留 #2 + #3 标 closed；新增 Sprint S8 收口段
