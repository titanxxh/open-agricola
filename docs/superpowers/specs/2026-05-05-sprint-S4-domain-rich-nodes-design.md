# Sprint S4 — Domain 聚合层 + 节点充血（重新 grill 后的 design）

- **日期**：2026-05-05
- **作者**：brainstorming session（main 25a82c43，worktree `.worktree/sprint-S4` / branch `sprint-S4-domain-rich-nodes`）
- **覆盖**：`ENGINE_NEW_ARCHITECTURE.md` §15 Sprint S4
- **替代**：`docs/superpowers/specs/2026-05-03-sprint-S4-design.md`（早期预 spec；本 spec grill 后定稿）
- **跨 sprint 契约**：`docs/superpowers/specs/2026-05-03-engine-redesign-S2-S4-contracts.md` §3
- **本 spec 角色**：sprint 启动前定稿，定 scope / DoD / 排期；下一步走 `superpowers:writing-plans` 出 S4a / S4b 各自的 plan

---

## 1. 一句话目标

引入 `shared/domain/` 派生视图聚合层（PlayerBoard facade + 子聚合 + scoring namespace）替代 `shared/logic/farm/*` + `shared/actions/helpers/animal-zones.ts` + `shared/logic/scoring*.ts` 散件；同期把 `shared/engine/engine.ts`（2206 行 / 15 public）瘦身到 ≤ 700 行 / 6 public，行为下沉到 `shared/engine/nodes/*.ts` 的充血节点 class。

---

## 2. 范围拆分（核心决策 1）

S4 拆为两个**物理零重叠、可并行**的 sub-sprint：

### 2.1 S4a — Domain 聚合层

- **改**：删 `shared/logic/farm/*`、删 `shared/actions/helpers/animal-zones.ts`、迁 `shared/logic/scoring*.ts`、改 ~30 个 effect call site
- **增**：`shared/domain/{index, player-board, farmyard, pasture, animal-zones, scoring}.ts`
- **约束**：ESLint 强制 `shared/domain/**` 不 import Node API、React、`engine`、`session`、`actions/effects`
- **估算**：1.5 周 / 5 PR（详见 §4）

### 2.2 S4b — 节点充血 + engine 瘦身

- **改**：`shared/engine/engine.ts`（2206 → ≤ 700）+ `shared/engine/nodes.ts` → `shared/engine/nodes/*.ts` 11 文件
- **约束**：Engine public 接口 ≤ 6（现 15）；节点行为下沉，engine 不再 `switch (node.type)`
- **估算**：1.5 周 / 5 PR（详见 §5.6）

### 2.3 不分两个 sprint 而是 sub-sprint 的理由

- **代码面零重叠**：S4a 改 `shared/logic/` + `shared/actions/effects/*`；S4b 改 `shared/engine/*`。两个 worktree 物理隔离
- **DoD 拆开能独立验证**：S4a 验"effect 平均行数下降 ≥ 30%"；S4b 验"engine.ts ≤ 700 / public ≤ 6"。绑死同 sprint 失败时不知是哪个目标拖累
- **共属 S4**：两者都对应 §15 S4 的总目标，DoD 有重叠（最终 §15 章节回流为一个 sprint），合并 spec 让 contract 对齐 + 协调约定写在一处

---

## 3. Domain 聚合形态（核心决策 2）

跨 sprint 契约 §3.2 锁了"4 聚合存在 [L]"。本 spec 落到 **PlayerBoard facade + 子聚合**形态：

### 3.1 文件骨架

```
shared/domain/
├── index.ts              [A]  入口：export { playerBoard, Scoring }
├── player-board.ts       [A]  PlayerBoard facade class
├── farmyard.ts           [A]  Farmyard class（持 readonly PlayerState ref）
├── pasture.ts            [A]  type Pasture + 派生函数（不是 class）
├── animal-zones.ts       [A]  AnimalZones class（持 readonly PlayerState ref）
└── scoring.ts            [A]  namespace Scoring（跨 player 函数式）
```

`[A]` = 主 app + sandbox + server 三方共用（前端 sandbox 也 import）。

**契约 §3.2 的 4 聚合存在**仍满足：4 个 export 名字（`PlayerBoard / Farmyard / Pasture / AnimalZones`）都在；Pasture 形态从 class 降为 value type 是契约 [O]（open）部分的具体化，不冲 [L]。

### 3.2 接口形态（锁形状，不锁实现细节）

```ts
// shared/domain/player-board.ts
export class PlayerBoard {
  readonly farmyard: Farmyard
  readonly animals: AnimalZones
  constructor(
    private readonly player: Readonly<PlayerState>,
    private readonly state: Readonly<GameState>,
  ) {
    this.farmyard = new Farmyard(player, state)
    this.animals = new AnimalZones(player, state)
  }
  // 跨子聚合协同 OR 卡牌专属
  hasRoomFor(animal: AnimalType): boolean
  costPreview(actionId: ActionId): CostBreakdown
}

export const playerBoard = (state: GameState, idx: number): PlayerBoard =>
  new PlayerBoard(state.players[idx], state)

// shared/domain/farmyard.ts
export class Farmyard {
  constructor(private readonly player: Readonly<PlayerState>, private readonly state: Readonly<GameState>) {}
  canPlow(coord: FieldCoord): ValidationResult
  canSow(coord: FieldCoord, crop: CropType): ValidationResult
  canBuildFence(spec: FenceSpec): ValidationResult
  canBuildRoom(coord: FarmTilePosition): ValidationResult
  canBuildStable(coord: FarmTilePosition): ValidationResult
  pastures(): Pasture[]
  emptyFences(): FenceEdge[]
  selectableTiles(kind: FarmSelectKind): FarmTilePosition[]
}

// shared/domain/pasture.ts
export type Pasture = {
  readonly id: string
  readonly tiles: ReadonlyArray<FarmTilePosition>
  readonly capacity: number
  readonly hasWell: boolean
}
export function computePasturesFromFences(player: PlayerState): Pasture[]

// shared/domain/animal-zones.ts
export class AnimalZones {
  constructor(private readonly player: Readonly<PlayerState>, private readonly state: Readonly<GameState>) {}
  zones(): InteractionAnimalReorgZone[]
  countAnimals(type?: AnimalType): number
  capacityRemaining(): { sheep: number; boar: number; cattle: number }
}

// shared/domain/scoring.ts
export namespace Scoring {
  function breakdown(state: GameState, idx: number): ScoreBreakdown
  function compareBonus(state: GameState): BonusCompareResult
  function familyScore(state: GameState, idx: number): number
}
```

### 3.3 散件 → domain 映射

| 散件（删除） | 行数 | 迁入 |
|---|---:|---|
| `shared/logic/farm.ts` | 84 | 主体 `Farmyard`；跨子聚合的入 `PlayerBoard` |
| `shared/logic/farm/build-room-helper.ts` | 27 | `Farmyard.canBuildRoom` 内部 |
| `shared/logic/farm/farm-interaction.ts` | 322 | `Farmyard.selectableTiles` + `Farmyard` 私有 |
| `shared/logic/farm/fence-validation.ts` | 533 | `Farmyard.canBuildFence` + `pasture.ts` 派生函数 |
| `shared/logic/farm/occupation-hand-interaction.ts` | 19 | `PlayerBoard` 私有 |
| `shared/logic/farm/plow-validation.ts` | 88 | `Farmyard.canPlow` |
| `shared/logic/farm/sow-validation.ts` | 133 | `Farmyard.canSow` |
| `shared/logic/farm/validators.ts` | 122 | 按职责拆入 `Farmyard` / `PlayerBoard` |
| `shared/actions/helpers/animal-zones.ts` | 277 | `AnimalZones`（主体）；`InteractionAnimalReorgZone` 类型留 protocol |
| `shared/logic/scoring.ts` | 417 | `Scoring` namespace 函数 |
| `shared/logic/scoring-bonus-solver.ts` | 167 | `Scoring` 私有函数（不 export） |
| **合计** | **2189** | 散件全部消失 |

### 3.4 Scoring 独立 namespace 而不挂 PlayerBoard 的理由（核心决策 3）

scoring 是**跨 player 视图**（家庭分、bonus 跨玩家比较），硬塞进 PlayerBoard facade 会把 PlayerBoard 升级成"持有整个 state 的 god-object"，跟 facade 收口理念矛盾。函数式 namespace 调用模式自然：

```ts
import { Scoring } from 'shared/domain/scoring'
Scoring.breakdown(state, idx)
Scoring.compareBonus(state)
```

Scoring 不留在 `shared/logic/`，因为 S4a 完成后 domain 是规则的一等公民；scoring 留在 logic 会形成"领域规则在两个地方"的分裂。

### 3.5 客户端安全契约（核心决策 4）

`eslint.config.js` 加新 entry，S4a PR1 引入：

```js
{
  files: ['shared/domain/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        { group: ['fs', 'fs/*', 'path', 'os', 'child_process', 'crypto'],
          message: 'shared/domain/** must run in browser sandbox; no Node API.' },
        { group: ['react', 'react-dom'],
          message: 'shared/domain/** is render-agnostic; no React.' },
        { group: ['../../engine/**', '../../session/**', '../../actions/effects/**'],
          message: 'shared/domain/** must not depend on engine/session/effects.' },
      ],
    }],
  },
},
```

最后一组（禁 reverse 依赖）防止 domain 调 effect 形成循环。

### 3.6 Effect 调用迁移 pattern

```ts
// 之前
import { canPlow } from '../../logic/farm/plow-validation'
import { computeAnimalZones } from '../helpers/animal-zones'
const zones = computeAnimalZones(state, idx)
if (canPlow(state, idx, position).ok) { ... }

// 之后
import { playerBoard } from '../../domain'
const board = playerBoard(state, idx)
const zones = board.animals.zones()
if (board.farmyard.canPlow(position).ok) { ... }
```

**红线**：
- `playerBoard()` 工厂返回的 PlayerBoard 持 readonly state ref，**绝不暴露 setter**
- 状态变更走 GameSession 入口（domain 只读派生）
- effect 不再 `import` 自 `shared/logic/farm/*`（CI 用 grep + ESLint 双守门）

---

## 4. S4a 迁移节奏（核心决策 5）

5 个 PR，先 facade 后 codemod，最后删散件：

| PR | 内容 | 文件数 | 风险 |
|---|---|---:|---|
| **PR1** | 4 聚合 + scoring namespace 骨架（行为不变 wrap）+ ESLint 边界 + `domain/__tests__/*.test.ts` 单测 | ~10 | 低（行为不变） |
| **PR2** | farm-related effect 切：`plow / sow / fencing / construct / stables / improvement-options / improvement` 等 ~10 文件 | ~10 | 中（effect 行为对照） |
| **PR3** | animal-related effect 切：`breed / exchange / reorganize` 等 ~5 文件 | ~5 | 中 |
| **PR4** | scoring-using effect 切（极少）+ session 层 / GameSession import 切 | ~5 | 低 |
| **PR5** | 删 `shared/logic/farm/` + `shared/actions/helpers/animal-zones.ts` + `shared/logic/scoring*.ts`（hard DoD signal） | 删除 ~12 | 低（前置 PR 已切完） |

PR2-3 之间合并前跑全 slow project 验证；零回归才合。

---

## 5. S4b 节点充血形态（核心决策 6）

混合充血程度：

### 5.1 三档充血

**[轻充血]** — 控制流节点（Sequence / Parallel / Or / Xor / Optional）
- 仅搬 engine.ts 中 `switch (node.type)` 各 case 入对应 class 的 `step(ctx)`
- 约 40-100 行 / 节点

**[中等充血]** — `ActionNode` / `ActivateCardNode` / `PlayerSwitchNode`
- 自带 `step` / `emit` / `toCursor` / `fromCursor`
- 约 100-150 行 / 节点

**[重充血]** — `InteractionNode`（最复杂）
- 自管整个交互生命周期：`step` / `emit` / `resolve` / `validateSelection` / `attachSourceCard`
- 吃掉 engine.ts 中 `lastEmittedChoice` / replace-aware label / sourceCard / `applyInteractionRequest` 等
- 约 200-300 行 / 节点

**[基类 BaseNode]** — 薄基类（≤ 100 行）
- 树操作（`isResolved` / `getNextUnresolved` / parent/children）
- 序列化骨架（具体 `toCursor` / `fromCursor` 在子类）
- **不学 BGA AbstractNode 35+ method 那套样板** — TS 不需要 PHP 单继承样板

### 5.2 文件骨架

```
shared/engine/
├── engine.ts             ≤ 700 行（stretch ≤ 600）
├── engine-stack.ts       (S1 已存在)
├── nodes/
│   ├── index.ts          re-export 所有节点
│   ├── base.ts           BaseNode 基类
│   ├── action-node.ts    [中等]
│   ├── interaction-node.ts [重]
│   ├── sequence-node.ts  [轻]
│   ├── parallel-node.ts  [轻]
│   ├── or-node.ts        [轻]
│   ├── xor-node.ts       [轻]
│   ├── optional-node.ts  [轻]
│   ├── activate-card-node.ts [中等]
│   └── player-switch-node.ts [中等]
├── dispatcher.ts         (现 hooks 派发)
├── log-store.ts          (不动)
└── types.ts              (节点 + Engine 共享类型)
```

### 5.3 engine.ts 瘦身去向（2206 → ≤ 700）

| 来源 | 当前 engine 占用 | 去向 |
|---|---:|---|
| `switch (node.type)` 各 case | ~600 | 各节点 class 的 `step()` |
| `lastEmittedChoice` / emit cache / replace-aware label | ~250 | `InteractionNode.emit()` 私有 |
| `attachChoiceLabel` / `getChoiceLabel` / `resolveChoiceSourceCard` 等 | ~300 | `InteractionNode` 私有 |
| `sanitizePreviewResources` / preview 系列 | ~200 | `ActionNode.previewEffect()` / `SequenceNode.previewEffect()` |
| `findActionNode` / `cloneNode` / `collectNodeIds` 等 tree-walk | ~150 | `BaseNode` 基类 |
| `applyInteractionRequest` 长 switch | ~200 | 各 InteractionNode kind 处理 |
| `buildFlowNodePublic` / `buildActivateCardNodes` 等 builder | ~100 | 各节点 class 静态工厂 |
| `proceed` (step loop) + `EngineStack` 调度 | ~300 | **engine.ts 保留** |
| `snapshot` / `restore` | ~150 | **engine.ts 保留** |
| `resolveChoice` 入口 | ~50 | **engine.ts 保留** |
| **engine.ts 余量** | **~650** | step loop + EngineStack + snapshot/restore + resolveChoice |

### 5.4 Engine public 接口 15 → 6

| 当前（15） | S4b 后 |
|---|---|
| `proceed` (改名 `step`) | ✅ |
| `resolveChoice` | ✅ |
| `peekNextUnresolved` | ✅ |
| `peekInteraction` | ✅ |
| `snapshot` | ✅ |
| `restore` | ✅ |
| `peekPendingChoiceFromComposite` | ❌ 内部化（InteractionNode） |
| `getLastComputedCosts` | ❌ 内部化（ActionNode） |
| `getPendingInteractionContext` | ❌ 内部化（InteractionNode） |
| `injectBeforeNodes` | ❌ 内部化（dispatcher） |
| `injectInteraction` | ❌ 内部化（InteractionNode 静态工厂） |
| `buildFlowNodePublic` | ❌ 删（用各节点 class 静态工厂） |
| `prependFlow` | ❌ 内部化（EngineStack） |
| `hasPendingChoiceCompositeAncestor` | ❌ 删 |
| `insertFlowAfterPendingChoice` | ❌ 内部化（InteractionNode） |

最终 6 个 public：`step / resolveChoice / peekNextUnresolved / peekInteraction / snapshot / restore`。

### 5.5 节点 type discriminator 保字符串

充血后**仍保留 `node.type: 'sequence' | 'interaction' | ...` 字符串字段**——序列化必需。但**内部不再 switch type**：

```ts
// 序列化用 type 字符串
const cursor = { type: node.type, ... }
const node = NODE_REGISTRY[cursor.type].fromCursor(cursor)

// 内部行为用 method
node.step(ctx)        // ✅ 替代 switch (node.type)
node.emit(ctx)
```

`shared/engine/engine.ts` 中 `switch (node.type)` 出现 **0 次**（grep 验证，DoD D14）。

### 5.6 S4b PR 拆分

| PR | 内容 | base 风险 |
|---|---|---|
| **PR1** | 拆 `nodes.ts` → `nodes/*.ts` 11 文件骨架（行为完全不变，只搬位置 + 加 BaseNode） | 极低 |
| **PR2** | 控制流轻充血（5 节点 step 搬入）+ engine.ts 删 5 个 case | 中 |
| **PR3** | InteractionNode 重充血（吃 emit / cache / sourceCard / label 共 ~750 行）+ engine.ts 大瘦身 | 高 |
| **PR4** | ActionNode / ActivateCardNode / PlayerSwitchNode 中等充血 | 中 |
| **PR5** | 收口：Engine public 收敛到 6 / `flowNodeCounter` 整理 / 序列化测试覆盖 | 低 |

---

## 6. S4a ‖ S4b 协调约定（核心决策 7）

### 6.1 唯一交点

S4b 的 `InteractionNode` 在 farm-select kind emit 时需要计算 `selectableTiles`（plow 哪些 / sow 哪些 / fence 哪些）。这些查询 S4a 完成后会迁到 `playerBoard().farmyard.selectableTiles(kind)`。

### 6.2 约定

- S4b 期间，`InteractionNode` 临时保留 `import { ... } from '../logic/farm/*'`，标注 `// TODO(S4a-merge): switch to playerBoard().farmyard.selectableTiles()`
- S4a 合 main 后，S4b owner 跑一次 ~3 文件的 codemod commit，统一切到 domain
- 此 codemod commit 不属于 S4a / S4b 任一 PR 链——是 S4 总收口的最后一笔（与 §15 §15bis 描述一致）

### 6.3 物理隔离验证

| 文件 / 目录 | S4a 改 | S4b 改 |
|---|---|---|
| `shared/actions/effects/*` | ✅ | ❌ |
| `shared/logic/farm/*` | ✅（删） | ❌ |
| `shared/actions/helpers/animal-zones.ts` | ✅（删） | ❌ |
| `shared/logic/scoring*.ts` | ✅（迁） | ❌ |
| `shared/domain/*` | ✅（新建） | ❌ |
| `shared/engine/engine.ts` | ❌ | ✅（瘦身） |
| `shared/engine/nodes.ts` → `nodes/*.ts` | ❌ | ✅（拆 + 充血） |
| `eslint.config.js` | ✅（domain 边界） | ❌ |
| `tests/*` 协议测试 | ❌ | ❌ |
| `docs/sprint-S4a-progress.md` | ✅ | ❌ |
| `docs/sprint-S4b-progress.md` | ❌ | ✅ |

零物理重叠。

### 6.4 排期（双 owner）

| 周 | Owner A (S4a) | Owner B (S4b) |
|---|---|---|
| 1 前半 | PR1: 4 聚合骨架 + ESLint + scoring namespace（行为不变 wrap） | PR1: 拆 nodes/*.ts 11 文件骨架（不动行为） |
| 1 后半 | PR2: farm-related effect 切 | PR2: 控制流节点轻充血 |
| 2 前半 | PR3: animal-related effect 切 | PR3: InteractionNode 重充血（最重 PR） |
| 2 后半 | PR4: scoring-using effect 切 + session import | PR4: ActionNode / ActivateCardNode / PlayerSwitchNode 中等充血 |
| 3 前半 | PR5: 删 logic/farm/ + helpers/animal-zones（hard DoD signal） | PR5: Engine public 收敛 + 序列化测试 |
| 3 中段 | （rebase + 收口） | 跨路 codemod（~3 处 InteractionNode 临时 import）+ S4 总收口 commit |

**总墙钟 ~3 周**（5 PR 链 + 跨路收口 codemod）。单 sub-sprint 内含 PR / review 时长约 1.5 周；双 owner 并行让 S4a + S4b 共享前 2.5 周窗口，第 3 周用于 codemod 收口 + 文档回流。

---

## 7. 测试策略

### 7.1 S4a 测试新增

| 类型 | 内容 |
|---|---|
| **Unit**（`shared/domain/__tests__/*.test.ts`）| 每个聚合 public method 至少 1 happy + 1 edge；总数 ~80-100 例 |
| **Session 测试** | 不新增（已有的 plow / sow / fence / scoring session 测试覆盖整体）|
| **回归基线** | `pnpm test:fast` + slow project 零回归 |

### 7.2 S4b 测试新增

| 类型 | 内容 |
|---|---|
| **Unit**（`shared/engine/nodes/__tests__/*.test.ts`）| 每节点 class 的 `step` / `emit` / `resolve` / `toCursor` / `fromCursor` 单测 |
| **Cursor round-trip** | 每节点 `serialize → deserialize → step 等价` 至少 1 例（9+ 例覆盖 9 节点） |
| **Engine integration** | `engine.test.ts` / `engine-flow.test.ts` / `engine-pipeline.test.ts` / `engine-chain.test.ts` / `resolveChoice-payload.test.ts` 全保留，零回归 |
| **Public 接口收敛验证** | 单测断言 `Engine.prototype` own enumerable methods ≤ 6 |

### 7.3 强制 green 子集

每 PR 必须绿（CLAUDE.md §13.1 沿用）：

- `pnpm test:fast`
- `pnpm exec tsc -b`（0 error）
- `pnpm run lint`（0 error）
- `pnpm run lint:i18n`（missing 0）
- `pnpm run check:reaches/-no-dsl/-bundle-size/-catalog-types/-community-deck`

### 7.4 Slow project

S4a 完成后跑一次全量 `pnpm test:slow`（254 卡 session 测试），零回归是 hard DoD。S4b 完成后再跑一次。

### 7.5 重构期间测试 skip 边界

S4 严格**不允许新增 skip**——这是 S2/S3 之后的高质量基线。卡牌效果 session 测试零回归。

---

## 8. DoD

### 8.1 S4a DoD

| # | 验证 |
|---|---|
| D1 | `shared/logic/farm/` 目录不复存在（`ls` 验证） |
| D2 | `shared/actions/helpers/animal-zones.ts` 不复存在 |
| D3 | `shared/logic/scoring*.ts` 不复存在（迁入 `shared/domain/scoring.ts`） |
| D4 | `shared/domain/{index, player-board, farmyard, pasture, animal-zones, scoring}.ts` 6 文件存在 |
| D5 | ESLint `shared/domain/**` 禁 import Node API / React / engine / session / effects 全开（CI 强制） |
| D6 | 行动层 effect 不再 `import` 自 `shared/logic/farm/*` 或 `shared/actions/helpers/animal-zones`（grep 0 命中） |
| D7 | `pnpm test:fast` + slow project 零回归 |
| D8 | effect 平均行数下降 ≥ 30%（baseline = S3 后的 effect 行数 / 文件数；commit S4a 完成时实测对比） |
| D9 | 「强制 green 子集」全绿 |

### 8.2 S4b DoD

| # | 验证 |
|---|---|
| D10 | `shared/engine/engine.ts` ≤ 700 行（stretch ≤ 600） |
| D11 | `shared/engine/nodes/*.ts` 11 文件存在；旧 `shared/engine/nodes.ts` 不复存在 |
| D12 | Engine public 接口 ≤ 6（`step / resolveChoice / peekNextUnresolved / peekInteraction / snapshot / restore`） |
| D13 | 节点 type discriminator 保字符串字段（cursor round-trip 测试通过） |
| D14 | engine.ts 中 `switch (node.type)` 出现 0 次（grep 验证） |
| D15 | 每节点 cursor round-trip 单测覆盖（9+ 例） |
| D16 | 「强制 green 子集」全绿 + engine integration 测试零回归 |

### 8.3 S4 总收口 DoD

| # | 验证 |
|---|---|
| D17 | S4a + S4b 都合 main + 跨路 codemod commit（InteractionNode 临时 import 切到 domain）合 main |
| D18 | `ENGINE_NEW_ARCHITECTURE.md` §15 S4 章节加 "✅ 完成（YYYY-MM-DD）" 回流 |
| D19 | ADR-0003（节点充血）+ ADR-0004（领域聚合层）正式落 `docs/adr/` |

---

## 9. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 | 回滚信号 |
|---|---|---|---|---|
| **R1**：S4a 散件迁移波及 ~30 effect，行为意外漂移 | 高 | 高 | H 节奏：先 facade（PR1 行为不变 wrap）→ effect 切批（PR2-4）→ 删散件（PR5）；每批合并前跑全 slow project | slow project 卡牌测试无故失败 ≥ 1 |
| **R2**：S4b InteractionNode 重充血 PR 太大（~750 行搬迁） | 中 | 高 | PR3 内分两 commit：先搬 emit / cache（不改行为），再切 sourceCard / label；reviewer 可逐 commit 看 | 单 PR review 超 3 天 |
| **R3**：S4a + S4b 并行时 InteractionNode 临时 import 没及时收口 | 中 | 中 | S4b PR3 强制 grep `from.*logic/farm` 出现 ≤ 5 处；S4a 合 main 时 S4b owner 在当周内跑收口 codemod | S4a 合 main 后 ≥ 1 周仍有未切的 import |
| **R4**：effect 平均行数下降 ≥ 30% 这个 DoD 未达成 | 中 | 中 | S4a PR2 完成后取最复杂 effect（improvement-options.ts 364 / fencing.ts 277）做 spike；< 15% 则调整 domain 接口 | spike 实测下降 < 15% |
| **R5**：节点 type discriminator 改名导致序列化破坏 | 低 | 高 | 死锁规则：S4b 不允许改 `node.type` 字符串值；nodes/*.ts 中 `readonly type = 'sequence'` 等字面量必须与 cursor 字符串一致；cursor round-trip 单测每节点覆盖 | engine cursor round-trip 测试 fail |
| **R6**：双 owner 节奏 review 互相 block | 中 | 中 | S4a / S4b 各自指定主 reviewer（不同人）；PR 描述列「与另一路是否冲突」一行 | 任一路连续 3 个 PR 等 review > 1 天 |
| **R7**：scoring namespace 跨 player 调用形态用着不舒服 | 低 | 低 | spike：在 PR1 同期改一个调用 scoring 的 effect / session 测试到新形态，验证 ergonomics；不舒服降级回 logic/scoring（不阻塞 S4a 主体） | spike 后 owner 拒绝接受 namespace 形态 |

---

## 10. 不在范围（明确排除）

- 不改任何卡牌实现（卡牌闭环原则）
- 不动 hook 注册机制（`shared/actions/hooks.ts` 已稳定）
- 不引入新 hook phase
- 不改 ActionFlow 节点协议（`ActionExecutionResult.type` 已 S2 落定）
- 不改 GameSession 主入口（dispatch 路径不动）
- 不动协议层（InteractionRequest 8 kind 已 S2 锁定）
- 不动 server/（room-manager / persistence 留 S5）
- 不动 cards/ 目录拆分（display vs impl 留 S6）
- 不重写 game-core.ts / session-core.ts（已 S2 拆 phase mixin，物理迁移留 S6）

---

## 11. 决议清单（前面 7 问的固化）

| # | 决策 | 选项 | 落点 |
|---|---|---|---|
| 1 | sprint scope | **B**：拆 S4a + S4b | §2 |
| 2 | 聚合形态 | **Q**：PlayerBoard facade + 子 class（Pasture 是 farmyard 派生 value type） | §3 |
| 3 | scoring 归属 | **Y**：独立 `shared/domain/scoring.ts` namespace | §3.4 |
| 4 | client safety | **J**：ESLint `no-restricted-imports` S4a PR1 引入 | §3.5 |
| 5 | S4a PR 节奏 | **H**：先全聚合骨架，再批量切 effect，最后删 logic/farm/ | §4 |
| 6 | S4b 充血程度 | **O**：混合（控制流轻 / 交互重 / Action 中等） | §5.1 |
| 7 | S4a/S4b 排期 | **W**：并行（双 worktree） | §6 |

---

## 12. 等价 ADR 占位

- **ADR-0003：节点充血 vs 节点贫血** — 决议要点：节点贫血是 engine.ts 单体的根因；混合充血（轻/重/中等）平衡了 BGA AbstractNode 风格与 TS 简洁性。
- **ADR-0004：领域聚合层** — 决议要点：行动层超 BGA 3300 行的反向来源；PlayerBoard facade + 子聚合避免单 god-object 重演 game-core.ts 病灶；scoring 独立 namespace 避开 PlayerBoard 跨 player 污染。

S4 收口时将 ADR-0003 / ADR-0004 正式落 `docs/adr/`。

---

## 13. 下一步

1. 用户审阅本 spec
2. 启动 `superpowers:writing-plans` 写 **S4a plan**（5 PR / 4-5 task / TDD）
3. 启动 `superpowers:writing-plans` 写 **S4b plan**（5 PR / 4-5 task / TDD）
4. 各 sub-sprint 在自己 worktree 跑 `superpowers:subagent-driven-development` 执行
