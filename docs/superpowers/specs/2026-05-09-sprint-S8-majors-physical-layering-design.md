# Sprint S8 Design: majors 物理分层 + cards-display _lookup 反向切断

**Goal**：解 S6c 残留的 vite dev TDZ 循环依赖 — `shared/cards-display/_lookup.ts` 反向 import `cards/major` + `cards/catalog` 在 vite dev mode 下触发 `ReferenceError: Cannot access 'majorCardDefinitions' before initialization`。majors 8 张物理迁到 cards-display + cards/major hooks/data 分层（与 minors/occupations 物理模型对齐），同步清零 ESLint rule 7 的 3 个豁免。

**驱动**：S7 Batch 4 实跑 `e2e-tests/workshop-smoke.spec.ts` 暴露浏览器 3 次 `ReferenceError`，stack 指向 `_lookup.ts:18` 的 `majorCardDefinitions.map(...)`。在 commit `6b99c4fa`（仅 Batch 1+2 修改）上同样复现，确认 S6c 残留而非 S7 引入。S6c 写好 e2e spec 但**从未实跑**，bug 一直藏着；S7 Batch 4 是首次实跑。

详见 `docs/ENGINE_NEW_ARCHITECTURE.md` §15 已知遗留 #3（已升级为 deferred bug 含 3 个候选修复路径）。

---

## §0 范围决策

S8 完成后达成：
- ✅ e2e `workshop-smoke.spec.ts` 在 sprint-S8 worktree 本地实跑通过（浏览器 0 个 `'majorCardDefinitions before initialization'` 错误）
- ✅ `shared/cards-display/_lookup.ts` 完全单方向（仅 import cards-display 内部 + types/contract，**0 反向 import**）
- ✅ ESLint rule 7 三个豁免（`shared/cards-display/major/**` + `_lookup.ts` + `types.ts`）全部移除
- ✅ majors 8 张物理分层完成：`cards-display/major/<file>` 仅纯 display data；`cards/major/effects.ts` 持 hooks
- ✅ 5 处 caller helper API 不变（`majorCardDefinitions` / `getMajorCard` / `applyMajorEffectsToAllPlayers` 同语义）
- ✅ 客户端 main bundle size 不上升（预期 -2-5 KB gzip 因 majors hooks tree-shake）

**不在 S8**：
- 把 catalog.ts 整体迁到 cards-display 一侧（β 选择只搬 ID 列表，完整数据查询仍走 catalog —— catalog 不再被 _lookup 反向 import 即视为 β 完成）
- minors/occupations 的 `_impl` register-all 机制改用与 minors 一致——majors 用最轻量 Map 模式（A 选择）
- e2e 加入 CI（仍是手动跑；S6c spec §5.2 已声明）
- workshop-pr.spec.ts 等其他 e2e 实跑（仅验证 workshop-smoke，足够 close 已知遗留 #3）

**总估算**：~1-1.5 day。

---

## §1 Batch 切分

S8 单 sprint，4 batch 串行 push（每 batch 独立 commit + push + workflow_dispatch CI 全绿才进下一）。

```
Batch 1: cards-display 纯数据层落地（新建 _lookup-data.ts + cards-display/major/index.ts；cards-display/major/<8 文件> 删 hooks 改纯数据；type 拆 MajorCardDisplay/MajorHooks/MajorCardData）
Batch 2: cards/major effects.ts + index 合成（创建 effects.ts；改 index.ts 内部从 cards-display 取数据 + 从 effects 取 hooks 合成 majorCardDefinitions；删 cards/major/<8 文件>.ts 旧镜像）
Batch 3: _lookup.ts 切断双反向 + ESLint rule 7 豁免清零（_lookup.ts 改本地 import；删 ignores；caller-side reverify）
Batch 4: 客户端 use-harvest-flow.ts 改 cards-display + e2e 实跑 + 文档闭环
```

batch 之间有依赖：B1 必须先建好 cards-display 一侧；B2 才能合成；B3 才能切断 _lookup；B4 才能 e2e。

---

## §2 Batch 1: cards-display 纯数据层落地

### §2.1 新建 `shared/cards-display/_lookup-data.ts`

聚合 minor/occupation 完整数据 + IDs 列表（与 catalog.ts 现有 import 模式相同，但 0 反向）：

```typescript
import {
  MinorImprovement as MinorImprovementCard,
  Occupation as OccupationCard,
  PlayerActionCard,
} from './types'
// ~600-700 个 single-card imports，沿用 catalog.ts 现有 list 模式
import { A1_Shelter } from './A/A1_Shelter'
// ... 略

// 完整 arrays（含数据；caller 通过 _lookup.ts 间接消费）
export const minorImprovementCardsList: readonly (MinorImprovementCard | PlayerActionCard)[] = [
  /* 所有 minor display 单卡 const */
] as const

export const occupationCardsList: readonly (OccupationCard | PlayerActionCard)[] = [
  /* 所有 occupation display 单卡 const */
] as const

// IDs 列表（_lookup.ts 直接 re-export）
export const minorImprovementIdsList: readonly string[] =
  minorImprovementCardsList.map((c) => c.id)

export const occupationIdsList: readonly string[] =
  occupationCardsList.map((c) => c.id)
```

实施方式：从现有 `shared/cards/catalog.ts` 的 import block 一次性 codemod 复制（catalog.ts 已 import 全部 cards-display 单卡文件）。规模 ~600-700 单卡 import + 2 个完整 array + 2 个 ID 数组。

### §2.2 新建 `shared/cards-display/major/index.ts`

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

export const majorCardDisplayData: readonly MajorCardDisplay[] = [
  fireplace1, fireplace2, cookingHearth1, cookingHearth2,
  clayOven, stoneOven, well, joinery, pottery, basketmaker,
] as const

export const majorImprovementIdsList: readonly string[] =
  majorCardDisplayData.map((c) => c.id)

export const getMajorCardDisplay = (id: string): MajorCardDisplay | undefined =>
  majorCardDisplayData.find((c) => c.id === id)
```

### §2.3 修改 `shared/cards-display/major/<8 文件>.ts`

每个文件删除 hooks 字段（`onBuy` / `onHarvest` / `onPlay` 等），类型从 `MajorCardData` 改为 `MajorCardDisplay`。

示例 `well.ts`：
```typescript
// Before
import type { MajorCardData } from '../../cards/major/types'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'

export const well: MajorCardData = {
  id: 'Major_Well', name: 'Well', deck: 'major', number: 7,
  cost: { wood: 1, stone: 3 }, vp: 4, extraVp: false,
  desc: ['[Put 1 <FOOD> on the 5 next turns. ...]'],
  onBuy: (state, player) => queueFutureMeeplesFlow(state, { ... }),
}

// After
import type { MajorCardDisplay } from '../../cards/major/types'

export const well: MajorCardDisplay = {
  id: 'Major_Well', name: 'Well', deck: 'major', number: 7,
  cost: { wood: 1, stone: 3 }, vp: 4, extraVp: false,
  desc: ['[Put 1 <FOOD> on the 5 next turns. ...]'],
}
```

### §2.4 修改 `shared/cards/major/types.ts`

新增 `MajorCardDisplay` + `MajorHooks` + 保留 `MajorCardData` 作为合成类型：

```typescript
export interface MajorCardDisplay {
  id: string
  name: string
  deck: 'major'
  number: number
  cost: ResourceCost
  vp: number
  extraVp?: boolean
  desc: readonly string[]
  exchanges?: readonly CardExchange[]
  // 任何其他纯 display 字段
}

export interface MajorHooks {
  onBuy?: (state: GameState, player: PlayerState) => ActionFlow | null
  onHarvest?: (state: GameState, player: PlayerState) => ActionFlow | null
  onPlay?: (state: GameState, player: PlayerState) => ActionFlow | null
  // 其他 hook phases
}

export type MajorCardData = MajorCardDisplay & MajorHooks
export type MajorEffectHook = keyof MajorHooks
```

具体字段以 `git diff` 当前 `MajorCardData` interface 为准；split 时谨慎保持向后兼容。

### §2.5 Batch 1 DoD

- ✅ `shared/cards-display/_lookup-data.ts` 创建并通过 tsc + lint
- ✅ `shared/cards-display/major/index.ts` 创建
- ✅ `shared/cards-display/major/<8 文件>.ts` 全部移除 hooks，类型为 `MajorCardDisplay`
- ✅ `shared/cards/major/types.ts` 拆型完成
- ⚠️ Batch 1 期间 `cards/major/index.ts` 暂未改 → 现有 caller 仍工作（`majorCardDefinitions` 仍来自 cards/major/<file> 旧镜像；尚未删旧镜像）
- ✅ tsc + lint + test:fast 全绿

---

## §3 Batch 2: cards/major effects.ts + index 合成

### §3.1 新建 `shared/cards/major/effects.ts`

```typescript
import type { MajorHooks } from './types'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import { createSingleHarvestExchange } from '../helpers/stage-effects'

type MajorEffectsMap = Record<string, Partial<MajorHooks>>

export const majorEffects: MajorEffectsMap = {
  // 1:1 移植自现有 cards/major/<file>.ts 的 hooks 函数体；display 字段（id/name/cost/...）已在 cards-display/major/<file>.ts。
  // 涉及 6 张含 hooks 的 majors：Well / Joinery / Pottery / Basketmaker / StoneOven / ClayOven。
  // fireplace1/2、cookingHearth1/2 无 hooks，不在此 map（lookup 时 effects[id] === undefined，合成时不加字段）。

  Major_Well: {
    onBuy: (state, player) => queueFutureMeeplesFlow(state, {
      cardId: 'Major_Well',
      playerId: player.id,
      startRound: state.round + 1,
      count: 5,
      resources: { food: 1 },
    }),
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
  // Major_StoneOven + Major_ClayOven 的 onBuy 是内联 ActionFlow object literal（与 well 不同，不依赖 internal helper）。
  // 实施时打开 shared/cards/major/stone-oven.ts 和 clay-oven.ts，把 onBuy 函数体逐字 copy 到此处对应 key 下。
}
```

实施细节：依次打开现有 `shared/cards/major/{well,joinery,pottery,basketmaker,stone-oven,clay-oven}.ts`，把每个文件的 `onBuy` / `onHarvest` 函数（包括 closure 引用的 internal helpers 的 import）1:1 移到 `effects.ts`。所有 `actions/effects/internal/*` 和 `cards/helpers/stage-effects` 的 import 集中到 `effects.ts` 顶部。

### §3.2 修改 `shared/cards/major/index.ts`

```typescript
import type { ActionFlow, GameState, PlayerState } from '../../contract/types'
import type { MajorCardData, MajorEffectHook } from './types'
import { majorCardDisplayData } from '../../cards-display/major'
import { majorEffects } from './effects'

export const majorCardDefinitions: readonly MajorCardData[] =
  majorCardDisplayData.map((d) => ({
    ...d,
    ...(majorEffects[d.id] ?? {}),
  }))

const majorDefinitionMap = new Map<string, MajorCardData>(
  majorCardDefinitions.map((effect) => [effect.id, effect]),
)

export const getMajorCard = (id: string): MajorCardData | undefined =>
  majorDefinitionMap.get(id)

// applyMajorEffectsToAllPlayers / applyMajorEffectForImprovement / applyMajorEffectsForPlayer
// 沿用现有实现，不改（它们读 majorDefinitionMap 不变）
```

### §3.3 删除 `shared/cards/major/<8 文件>.ts` 旧镜像

```bash
rm shared/cards/major/{basketmaker,clay-oven,cooking-hearth,fireplace,joinery,pottery,stone-oven,well}.ts
```

### §3.4 验证 5 处 caller 不变

| 文件 | 验证 |
|---|---|
| `shared/cards/catalog.ts:5` | `import { majorCardDefinitions } from './major'` 仍 work（合成版） |
| `shared/cards/catalog.ts:1863` | `?? majorCardDefinitions.find((c) => c.id === id)` 仍可用 |
| `shared/session/round.ts:1` | `applyMajorEffectsToAllPlayers` 同语义 |
| `shared/actions/effects/improvement-options.ts:6` | `import { majorCardDefinitions, getMajorCard }` 仍 work |
| `shared/actions/effects/improvement.ts:13`、`exchange.ts:25` | `getMajorCard` 返回值含 hooks（合成）|
| `shared/cards/__tests__/setup-register-all.ts:31,43` | `defaultRegistry.registerEffects(majorCardDefinitions)` 仍 work |

### §3.5 Batch 2 DoD

- ✅ `shared/cards/major/effects.ts` 创建并 tsc clean
- ✅ `shared/cards/major/index.ts` 改用合成模式，caller API 不变
- ✅ `shared/cards/major/<8 文件>.ts` 删除（git diff 显示 8 个文件 D 状态）
- ✅ tsc + lint + test:fast + test:slow（baseline 30 flaky 范围内）全绿
- ✅ majorCardDefinitions.length === 10（合成数量正确）
- ⚠️ 此时 _lookup.ts 仍 import cards/major（合成版），TDZ 仍可能在 dev mode 复现（B3 才完整修复）

---

## §4 Batch 3: _lookup.ts 切断双反向 + ESLint 豁免清零

### §4.1 修改 `shared/cards-display/_lookup.ts`

```typescript
// Before (S6c 残留)
import { majorCardDefinitions } from '../cards/major'           // ← 反向 1
import {
  minorImprovementCards, minorImprovementIds,
  occupationCards, occupationIds,
} from '../cards/catalog'                                       // ← 反向 2

export const majorImprovementIds = majorCardDefinitions.map(c => c.id)
// ...

// After (S8)
import { majorImprovementIdsList } from './major'               // ← 本地
import { minorImprovementIdsList, occupationIdsList } from './_lookup-data'  // ← 本地

export const majorImprovementIds = majorImprovementIdsList
export const minorImprovementIds = minorImprovementIdsList
export const occupationIds = occupationIdsList
// 其他 export（minorImprovements / occupations 完整 array）改从 cards-display 单卡聚合，或保留通过 catalog 间接获得 - 详见 §4.2
```

### §4.2 处理 `_lookup.ts` 仍需要的 `minorImprovements` / `occupations` 完整 array

`_lookup.ts` 当前 export `minorImprovements: MinorImprovement[]` 和 `occupations: Occupation[]`（完整对象数组，含 cards-display 数据 + custom）。

选项 §4.2-A：在 `_lookup-data.ts` 同时聚合完整 arrays（不只 IDs）—— 然后 `_lookup.ts` 全部本地 import。

选项 §4.2-B：把 `getMinorImprovement` / `getOccupation` 改为 lookup-by-id（直接查 `cards-display/<deck>/<file>` 的单卡 const），不需要完整 array 在 `_lookup.ts` export。

按 YAGNI，§4.2-A 更直接（聚合一次，多处复用）。`_lookup-data.ts` 聚合完整 arrays + IDs 列表（成本：一次 import 数百单卡文件，与 catalog.ts 现状相当）。

### §4.3 修改 `eslint.config.js` rule 7

删除 `ignores`：
```javascript
// Before
{
  files: ['shared/cards-display/**/*.{ts,tsx}'],
  ignores: [
    'shared/cards-display/major/**',
    'shared/cards-display/_lookup.ts',
    'shared/cards-display/types.ts',
  ],
  rules: { 'no-restricted-imports': [...] },
}

// After
{
  files: ['shared/cards-display/**/*.{ts,tsx}'],
  // ignores 删除
  rules: { 'no-restricted-imports': [...] },
}
```

### §4.4 验证

- `shared/cards-display/major/<8 文件>.ts` 现在仅 import types + cards-display 内部 → 不违反 rule 7
- `shared/cards-display/_lookup.ts` 现在仅 import 本地 + types → 不违反 rule 7
- `shared/cards-display/types.ts` 现状自身被 rule 7 限制（不引 actions/engine/session/cards/[A-E] 等）；如未违反则可清豁免

如 `types.ts` 本身违反 rule 7 → 单独评估（可能需要保留 `types.ts` 这一项豁免，记入 follow-up；但其他两项必须清）。

### §4.5 Batch 3 DoD

- ✅ `_lookup.ts` 0 反向 import（grep `from '../cards/'` 在 _lookup.ts 中无结果）
- ✅ `eslint.config.js` rule 7 ignores ≤ 1 项（types.ts 视情况）
- ✅ tsc + lint（含 rule 7 启用后）+ test:fast + test:slow + build + check:bundle-size 全绿
- ✅ B3 commit 推 main 后立即在本地手动跑一次 e2e workshop-smoke（提前验证 TDZ 是否消失，不必等 B4）

---

## §5 Batch 4: 客户端 use-harvest-flow.ts + e2e 实跑 + 文档闭环

### §5.1 修改 `client/app/hooks/use-harvest-flow.ts`

```typescript
// Before
import { getMajorCard } from '../../../shared/cards/major'

// 用法: const major = getMajorCard(cardId); pushFromExchanges(cardId, label, major?.exchanges)

// After
import { getMajorCardDisplay } from '../../../shared/cards-display/major'

// 用法: const major = getMajorCardDisplay(cardId); pushFromExchanges(cardId, label, major?.exchanges)
```

只改一行 import + 调用站名。客户端 vite tree-shake 后不再拉 `cards/major/effects.ts` 和 `actions/effects/internal/future-meeples`。

### §5.2 e2e 实跑 + 验证

```bash
cd .worktree/sprint-S8
BACKEND_PORT=5275 nohup pnpm run server > /tmp/s8-server.log 2>&1 &
nohup pnpm exec vite --port 5273 --strictPort > /tmp/s8-frontend.log 2>&1 &
until curl -s http://localhost:5275/api/health | grep -q ok; do sleep 2; done
until curl -s -o /dev/null -w "%{http_code}" http://localhost:5273/ | grep -q 200; do sleep 2; done

FRONTEND_URL=http://localhost:5273 pnpm exec playwright test e2e-tests/workshop-smoke.spec.ts
# Expected: 1 passed (≤30s)
# 浏览器控制台 0 个 'majorCardDefinitions before initialization' 错误
# data-testid="workshop-root" 可见
```

### §5.3 文档闭环

更新 `docs/ENGINE_NEW_ARCHITECTURE.md`：
- L18 进度行加 `S8 ✅（2026-05-XX，majors 物理分层 + cards-display _lookup 反向切断 + ESLint rule 7 豁免清零）`
- §15 已知遗留 #2（cards-display/major/** ESLint 豁免）→ 标 closed by S8
- §15 已知遗留 #3（e2e workshop-smoke deferred bug）→ 标 closed by S8
- §15 加 Sprint S8 收口段（DoD + 关键演进 + bundle 收益）

`docs/skip-tracker.md` 不动（S7 已清空）。

### §5.4 Batch 4 DoD

- ✅ `client/app/hooks/use-harvest-flow.ts` 改 import 完成
- ✅ e2e workshop-smoke 本地实跑通过
- ✅ `pnpm run build` + `pnpm run check:bundle-size` 全绿；客户端 main bundle size **≤ S7 末水平**（理想 -2-5 KB gzip）
- ✅ ENGINE_NEW_ARCHITECTURE.md §15 已知遗留 #2 + #3 标 closed
- ✅ 全 4 batch GitHub Actions 全绿

---

## §6 整体 DoD

- ✅ `shared/cards-display/_lookup.ts` 0 反向 import（仅本地 + types/contract）
- ✅ ESLint rule 7 三个豁免移除（cards-display/major/** + _lookup.ts；types.ts 视情况）
- ✅ majors 8 张物理分层完成：cards-display 纯数据，cards/major effects.ts 持 hooks
- ✅ majorCardDefinitions 合成版本（cards/major/index.ts）caller API 同语义
- ✅ 5 处 caller 完全不动
- ✅ e2e workshop-smoke 在 sprint-S8 worktree 本地实跑通过
- ✅ 客户端 main bundle size 不上升（理想 -2-5 KB）
- ✅ `pnpm test:fast` + `pnpm test:slow`（baseline 30 flaky 内）+ tsc + lint + build + check:bundle-size 全绿
- ✅ 全 4 batch 推到 main 后 GitHub Actions 全绿
- ✅ `docs/ENGINE_NEW_ARCHITECTURE.md` §15 加 S8 收口段；已知遗留 #2 + #3 标 closed

---

## §7 风险与缓解

1. **Caller API 行为偏差**：合成版 `majorCardDefinitions[i].onBuy` 函数引用与原内联版不一致 → caller 中的 `=== majors[i].onBuy` 引用比较失效。**缓解**：grep `=== .*\.onBuy` / `=== .*\.onHarvest`；当前 5 处 caller 全部走 `?.()` 调用而非引用比较，应安全；B2 后立即跑 test:slow 验证。

2. **ESLint rule 7 移除后 cards-display/types.ts 复活违规**：types.ts 历来引用 `actions/effects` 类型？**缓解**：B3 在删 ignores 前先 grep `from '\\.\\./` 在 types.ts 中确认；如违规则保留 types.ts 一项豁免（spec §6 DoD 已允许）。

3. **`_lookup-data.ts` 完整 array 聚合 import 量大**：~600-700 单卡文件 import → vite dev cold start 额外开销。**缓解**：catalog.ts 早就如此，性能影响可忽略；如确需优化可分 deck 拆 _lookup-data-{a,b,c,d,e}.ts。

4. **majors hooks 在 effects.ts copy 时遗漏字段**：onBuy 内部 closure 状态？**缓解**：B2 实施时严格 1:1 copy 函数体；test:slow 跑全套 majors session 测试（B25_BreadPaddle / Major_Joinery harvest / Major_Well future-meeples 等），baseline diff 比较。

5. **e2e 仍 fail（修复未根除 TDZ）**：可能其他循环路径触发。**缓解**：B3 push 后立即 e2e 验证（不等 B4），失败时回滚 B3 重新 brainstorm。

---

## §8 文档同步

S8 完成后更新：
- `docs/ENGINE_NEW_ARCHITECTURE.md` L18：进度行 S8 ✅
- `docs/ENGINE_NEW_ARCHITECTURE.md` §15：已知遗留 #2（majors ESLint 豁免）→ closed by S8；#3（e2e workshop-smoke deferred）→ closed by S8；新增 Sprint S8 收口段（DoD + 关键演进 + bundle 收益）
- `docs/master-plan.md` §8：不更新（与 S6/S7 同 — architecture sprint 不在 cards-track 表）
