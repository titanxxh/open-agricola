# Open Agricola 新架构（目标态）

> 本文档是经 brainstorming + 对照 BGA 后确定的**目标架构**。
> 当前实现状态以 [`ENGINE_ARCHITECTURE.md`](./ENGINE_ARCHITECTURE.md) 为准。
> 本文档是后续 sprint 的对齐基线；任何 sprint 完成后回流到这里。

## 0. 摘要

本架构在**已落地的"shared/server/client 三层 + 后端权威 + WS 全量快照"**之上做四件事：

1. **消除 `PendingAction` 多态 union**，"等什么"只问 Engine ✅ 已落地（S1 / S2）
2. **节点充血 + sub-flow stack**：参照 BGA `AbstractNode`，把 engine.ts 1828 行单体降级（S4 同期推进）
3. **Session 按游戏阶段拆 traits/mixins**：参照 BGA `States/*Trait.php` ✅ 已落地（S2 — 4 phase mixin；物理目录留 S6）
4. **引入领域聚合层**（`PlayerBoard` 派生视图）：把行动层 ~3300 行差距还回到聚合层（S4）

它**不改变**：后端权威 / 全量快照 / WS 协议 / hook 系统 / 卡牌闭环原则 / 三层物理边界。

> **当前 sprint 进度**（详见 §15）：S1 ✅（2026-05-03）/ S2 ✅（2026-05-05）/ S3 ✅（2026-05-04，PaymentSolver 收口）/ S4–S7 待启动。

---

## 1. 现状问题诊断

> 数据基线：剔除卡牌（`shared/cards/`、`Cards/*.php`）、测试、i18n、scripts、docs、workshop 后的"基础设施"代码量。

### 1.1 行数对账：核心域我们和 BGA 总量相当，但分布完全反过来

| 领域 | 我们 | BGA | 差 |
|---|---:|---:|---:|
| 引擎核心 | 2575（`engine.ts` 1828 一头独大） | 1274（`Engine.php` 428 + 6 节点类 846） | **+1301** |
| Session / 状态机 | 3120（`game-core.ts` 2969 单文件） | ~4066（`game.php` 484 + 4 个 Trait 2292 + Notifications/Globals 1290） | -946 |
| **领域类型 + 聚合** | **4179**（types 1282 + logic 2897 散件） | **8643**（Models 5580 + Managers 3063 充血对象） | **−4464** |
| **行动层** | **8591**（effects 4750 + helpers 2436 + internal 712 + 顶层+factories 693） | **5302**（Actions/* 22 个文件） | **+3289** |

去掉"BGA 用 framework 包了所以无对照"的部分（HTTP/WS/连接/工坊/自定义代码），核心域总量我们 18465 vs BGA 19285——**反而少 800 行**。但行动层多 3289、聚合层少 4464——**这是同一种病的两面**：BGA 用 4500 行的充血聚合换来行动层 3300 行的瘦；我们没有聚合层，行动层只能横向堆 helper。

### 1.2 五个核心病灶

#### P1. 双状态机：Engine 节点状态 + GameCore.pending 并行存在

调用方要同时理解两套"现在等什么"：

- `EngineStepResult`：`done | blocked | choice | ok | playerSwitch`
- `PendingAction` union：`none | choice | harvestFeed | confirmNextPlayer | confirmPlayerSwitch | cardDraft`（reorganize prototype 已删 `animalReorg`）

`game-core.ts` 大量代码在做"engine.step → 翻译成 pending → 翻译回去"的双向胶水。每加一种 pending kind，路由层 / room-manager / 测试都要跟着按 kind 分发。BGA 没有这个 union，"等什么"只问节点树（`getNextUnresolved()`）。

#### P2. Engine 主文件 1828 行 + 节点贫血

我们 `engine.ts` 1828 + `nodes.ts` 仅 231。BGA `Engine.php` 428 + `AbstractNode.php` 456（35+ 个方法）+ 5 个具体节点类 ~390 行。**节点行为下沉到节点自己** vs 我们**节点是数据，行为留在 engine 主文件**。Engine public 接口 ~20 个方法（`injectBeforeNodes / buildFlowNodePublic / prependFlow / insertFlowAfterPendingChoice` 等），调用方需要懂细节才能用。

#### P3. Payment 接口爆炸

`payment.ts` 900 + `pay-helpers.ts` 647 + `room-payment.ts` 427 = **1974 行 / 33 个 export**。BGA `Actions/Pay.php` 837 行 / **8 个 public**。命名分裂：`canPayResources / canPayCost / canAffordCost / canAffordFlatCost` 4 个相近函数共存。`improvement.ts` 一个调用方就要 import 三个文件挑工具。**Deletion test**：删掉 `pay-helpers.ts`，函数没消失——只是换了 import 路径。典型浅模块。

#### P4. game-core.ts 2969 行单 class 包打 5 件事

行动阶段、收获阶段、回合切换、draft、stage hook 恢复、Engine 子流程暂存全在一个 class。BGA 同体量代码拆成 5 文件：`game.php` 484 + `ActionTrait` 211 + `DraftTrait` 1050 + `HarvestTrait` 264 + `TurnTrait` 767——**按游戏阶段拆**。reorganize prototype 引入 `pausedEngine` 8 字段 ad-hoc 暂存 + 3 个 `continueAfterReorganize_*` continuation 函数后，文件还在涨。

#### P5. 缺领域聚合层 → 行动层超 BGA 3300 行

BGA `Models/PlayerBoard.php` **2316** + `Player.php` 1028 + `PlayerCard.php` 1392 + `Managers/*` 3063 = **充血聚合 ~8400 行**，把"哪些操作能在玩家板子上做"集中。

我们对应只有 `shared/game/types.ts` 711 的 record + `shared/logic/farm/*` 散件（`farm-interaction.ts` 323 + `fence-validation.ts` 533 + `sow-validation.ts` 133 + `plow-validation.ts` 88 + `animal-zones.ts` 277 + ...）。每加一个跨字段不变量都要在 N 个 helper 里同步检查；行动层 effect 要 import 5+ 个 helper 才能算一个完整动作 → `improvement.ts` 985 行（vs BGA `Improvement.php` 229）就是这种症状的极端例子。

### 1.3 为什么是结构性重设计而不是局部清理

P1–P5 不是孤立 bug，**互为根因**：

- P5（缺聚合）→ 行动层只能横向堆 helper（P3 payment 33 export）→ 单文件臃肿（`improvement.ts` 985）
- P2（节点贫血）→ engine 主文件吃掉本该在节点里的逻辑（1828）→ 调度细节泄漏到 GameCore
- P1（双状态机）→ GameCore 写大量翻译胶水 → P4（game-core.ts 2969 单文件）

只清 P3（合并 payment）会发现没有 PlayerBoard 接住领域查询，PaymentSolver 接口设计不下去；只拆 P4（game-core 拆 traits）会发现 PendingAction 多态让 trait 间通信仍然要按 kind 分发；只做 P1（消 PendingAction）会发现节点贫血让"等什么"无处派生。

四件事必须**同方向重设计**才能互相成立。这正是 §0 列出 4 项改动的原因。

> sprint 排期见 §15——按"先验证模式 → 再清架构 → 再瘦行动 → 最后引入聚合"分 5 个 sprint 推进。

---

## 2. 设计目标与不变量

不变量（继承自现有架构）：

- 后端唯一权威 `GameState`
- 单房间单命令序列
- 全量快照同步优先（patch 是后续优化层，不是替代）
- 前端不做乐观提交
- shared / server / client 三层 ESLint 强制
- 卡牌效果在卡牌文件内部闭环

新增目标：

- **接口深度优先**：Engine、Session、Payment、Action 都按"少 public + 深行为"塑形，不再"工具袋"
- **领域聚合具名化**：`PlayerBoard` / `Pasture` / `Fence` 等领域名词成为一等模块，而不是散件 helper
- **状态机单一真相**：游戏的"现在等什么"只在 Engine 节点树里，Session/前端/测试都从同一处派生

---

## 3. 总体拓扑（目标态）

> 标注：**[A]** = 主 app client + sandbox client + server 三方共用（主 app bundle 必拉）；**[B]** = sandbox client + server 共用（主 app bundle 不拉）。**真正"只 server 用"的代码全部在 `server/*`，不在 `shared/*`。** 详见 §4。

```text
浏览器窗口 p1 / p2 / observer
        │
        │ WebSocket /ws   ← 唯一主链路
        ▼
server/connection/                       ← 从 room-manager 拆出
  ├─ ws-server.ts                          连接生命周期 / 鉴权 / 重连
  ├─ room-router.ts                        命令路由到 room
  └─ broadcaster.ts                        StateUpdateEnvelope 扇出

server/game/
  ├─ room.ts                               房间元数据 / 座位 / TTL
  ├─ authoritative-session.ts              权威 GameSession，对外只接 Command
  └─ persistence/                          持久化 adapter
      ├─ sqlite-adapter.ts
      └─ json-adapter.ts

shared/contract/                  [A]    ★ 前后端契约：types + protocol + schema
  ├─ types/
  │   ├─ game-state.ts                     GameState / PlayerState / SerializedGameState
  │   ├─ resource.ts                       Resource / AnimalType / HouseType
  │   └─ enums.ts                          SubFlowKind / CardType / Deck
  ├─ protocol/
  │   ├─ ws.ts                             ClientCommand / ServerEvent
  │   ├─ game.ts                           GameSyncPayload / StateUpdateEnvelope / Interaction
  │   └─ interaction.ts                    强类型 Interaction.subFlow.kind
  └─ serialization.ts                      纯 schema，不含执行逻辑

shared/domain/                    [A]    ★ 领域聚合层：派生视图 (只读 query)
  ├─ player-board.ts                       玩家板子（耕地/牲畜/围栏/改良）query API
  ├─ pasture.ts                            围栏 + 牧场 query
  ├─ farmyard.ts                           农场版图 query
  ├─ animal-zones.ts                       (从 actions/helpers 迁入)
  └─ scoring.ts                            派生 score breakdown (从 logic/ 迁入)

shared/cards-display/             [A]    ★ 卡牌"展示数据"：name/desc/img/cost-spec
  ├─ A/  B/  C/  D/  E/                    每张卡的 display 部分
  └─ index.ts                              卡牌目录（含工坊自定义卡 display）

shared/i18n/                      [A]    多语言键值

———————————— 上方 [A] 主 app + sandbox + server 三方共用；下方 [B] 仅 sandbox + server 共用，主 app bundle 不拉 ————————————

shared/session/                    [B]    ← 按阶段拆，从 game-core.ts 2969 行降级
  ├─ session-core.ts                       命令分发 + state 容器
  ├─ phases/
  │   ├─ action-phase.ts                   行动阶段
  │   ├─ harvest-phase.ts                  收获阶段
  │   ├─ turn-phase.ts                     回合 / first player
  │   └─ draft-phase.ts                    draft / living hand
  └─ stage-resume.ts                       stage hook 恢复 mixin

shared/engine/                    [B]
  ├─ engine.ts                             调度核心（目标 ≤ 600 行）
  ├─ engine-stack.ts                       sub-flow 栈（取代 pausedEngine）
  ├─ cursor.ts                             节点光标（持久化单元）
  ├─ nodes/
  │   ├─ abstract-node.ts                  充血基类（学 BGA AbstractNode 456 行）
  │   ├─ leaf-node.ts
  │   ├─ interaction-node.ts               唯一"等玩家输入"叶子；request 是 sum type
  │   ├─ seq-node.ts  /  parallel-node.ts  /  xor-node.ts  /  player-switch-node.ts
  ├─ dispatcher.ts                         hook 触发
  └─ log-store.ts

shared/actions/                   [B]
  ├─ effects/                              ActionDefinition 数据 + flow
  ├─ payment/                              ★ 收口：取代 payment + pay-helpers + room-payment 三件套
  │   ├─ index.ts                            PaymentSolver 单一入口
  │   ├─ solver.ts                           成本求解
  │   ├─ executor.ts                         执行
  │   └─ adapters/                           复杂 cost shape (room cost 等)
  ├─ hooks.ts                              hook 注册 + dispatch
  └─ flow.ts                               ActionFlow 构造

shared/cards/                      [B]    卡牌 effect 实现：hook 注册 + 行为函数
  ├─ A/  B/  C/  D/  E/                    每张卡的 impl 部分（与 cards-display 一一对应）
  └─ custom-registry.ts                    工坊 custom card runtime 注册

shared/custom-code/               [B]    DSL → ActionFlow + AST 校验
shared/draft/                      [B]    draft 阶段领域逻辑

server/custom-code/                      自定义代码隔离执行（不变）
```

> `shared/game/` 与 `shared/logic/` 在目标态**不复存在**：types 入 `shared/contract/`；行为入 `shared/domain/`（[A]）或 `shared/actions/`（[B]）。
>
> `shared/*` 目录 = 至少两方（server / sandbox client / 主 app client）共用。**真正只 server 用的代码（HTTP/WS 装配、auth、SQLite、连接管理、workshop 后端 PR、custom-code sidecar）全部位于 `server/*`。**

---

## 4. 前后端代码分发与 `shared/` 分层

### 4.1 两种 client 形态

客户端有两条独立的代码加载路径，受不同的边界约束：

#### 形态 A — 多人对局主路径（`client/app/`、`components/`、`services/`、`hooks/`、`contexts/`）

走 WS 连接到后端权威 GameSession，前端只渲染 + 收集输入。`shared/*` 准入清单：

| 路径 | 作用 |
|---|---|
| `shared/contract/` | types + protocol，**必须** |
| `shared/domain/` | 派生视图查询（如 `PlayerBoard.canPlow`），用于本地交互预览 |
| `shared/cards-display/` | 卡牌展示数据（name/desc/img/cost-spec），必须 |
| `shared/i18n/` | 当前 locale，必须 |

**禁入**：`shared/engine/` / `shared/session/` / `shared/actions/` / `shared/cards/`(impl) / `shared/custom-code/` / `shared/draft/`。

#### 形态 B — Sandbox hot-seat（`client/sandbox/`）

工坊单浏览器 hot-seat：浏览器内直接跑 `shared/session/` + `shared/engine/` + `shared/actions/` 的完整 in-process GameSession，**不依赖后端**。这条路径**允许 import 任何 `shared/*`**，包括 `shared/cards/`(impl) 和 `shared/custom-code/`。

形态 B 的存在理由：

- **GitHub Pages 静态部署**：访客可以纯前端体验工坊，无需后端可用
- **卡牌设计快速迭代**：作者编辑卡牌效果即时在本地试，不必往后端 push
- **离线 / 后端故障**仍可用工坊
- 这是我们相对 BGA 的真实优势——TypeScript 让"领域代码两端通跑"成为可能

#### 边界

通过**目录隔离 + bundle splitting**强制：

- 形态 A 走主 bundle，主 bundle 不能 import `shared/` 的 [B] 子集
- 形态 B 走 `client/sandbox/` 子目录 + 通过 `import()` 动态加载 `shared/session/...` —— 主 bundle 不内联 sandbox 代码
- ESLint 按"目录前缀"差异化生效（见 §4.2）
- 形态 B 编译产物只在用户访问 `?page=workshop&sandbox=local` 时按需加载

收益：

- **bundle 瘦身**：主 bundle 不含 engine/session/actions/cards-impl
- **杜绝"主路径前端做规则裁定"**：形态 A 的 ESLint 边界堵死"客户端推断 cost"诱惑
- **保留工坊离线能力**：形态 B 显式承担规则裁定，但只在"用户主动进入工坊"时生效

### 4.2 ESLint 强制（按目录前缀）

```js
// eslint.config.js（差异化覆盖）
[
  // 形态 A：主路径禁入 [B]
  {
    files: ['client/app/**', 'client/components/**', 'client/services/**',
            'client/hooks/**', 'client/contexts/**', 'client/utils/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: [
              '**/shared/engine/**',
              '**/shared/session/**',
              '**/shared/actions/**',
              '**/shared/cards/**',          // cards-display 不在禁列
              '**/shared/custom-code/**',
              '**/shared/draft/**',
            ],
            message: '主路径只允许 import shared/contract|domain|cards-display|i18n。需要完整领域请走 client/sandbox/',
          },
        ],
      }],
    },
  },
  // 形态 B：sandbox 子目录全开
  {
    files: ['client/sandbox/**'],
    rules: { 'no-restricted-imports': 'off' },
  },
]
```

附加 lint：禁止主路径用 `import('shared/session/...')` 这种字符串绕过 —— 用 `no-restricted-syntax` 检测动态 import 字面量。

violation 在 CI 报 error（不是 warn）。

### 4.3 `domain/` 的客户端安全契约

`PlayerBoard` / `Pasture` / `Farmyard` 等聚合接口要严格分两类：

- **Query**（[A]，主 app + sandbox + server 三方共用）：`countAnimals / pasturesWithCapacity / canPlow / canBuildFence / scoringBreakdown / costPreview` —— 只读派生
- **Mutate**（不在聚合自身）：状态变换在 `shared/actions/effects/*` 中完成，[B]——主 app bundle 不拉，sandbox + server 用

PlayerBoard 构造时持有 `PlayerState` 引用（不是拷贝），但**不暴露任何 setter / mutate 方法**。

```ts
// shared/domain/player-board.ts
export class PlayerBoard {
  constructor(
    private readonly player: Readonly<PlayerState>,
    private readonly state: Readonly<GameState>,
  ) {}

  // ✅ client + server 都可用
  countAnimals(type?: AnimalType): number
  canPlow(field: FieldCoord): ValidationResult
  canBuildFence(spec: FenceSpec): ValidationResult
  costPreview(action: ActionId): CostBreakdown

  // ❌ 没有 mutate 方法
}
```

server 侧的"做"由 actions/effects 持有；client 侧的"看 / 预览"由 PlayerBoard 持有。同一个查询函数 server 用来校验入参，client 用来高亮可点击格子——**单一真相、零分叉**。

### 4.4 卡牌"展示数据 vs 执行 impl"分裂

每张卡两份产物：

```
shared/cards-display/A/A123_FrameBuilder.ts   [A]   id, nameKey, descriptionKey,
                                                    imageId, costSpec, cardType,
                                                    deck, prerequisiteSpec
shared/cards/A/A123_FrameBuilder.ts           [B]   hook 注册, effect 函数,
                                                    computeCosts/computeArgs/...
```

工坊自定义卡走相同分裂：

- display 部分通过 WS `customCardDefs` payload 下发到 client
- impl 部分进 `server/custom-code/` 沙盒执行

card-display 是纯数据（无函数、无副作用），可以直接 JSON 序列化——这正是当前 `protocol/game.ts` 的 `CustomCardDef` 类型已经做的事，目标态把这种"display vs impl"对所有卡牌（含内置）一致化。

### 4.5 两个 bundle 的代码量估算

| Bundle | 入口 | 含 `shared/*` 子集 | 估算行数 | 加载时机 |
|---|---|---|---:|---|
| `client-app.bundle` | `client/main.tsx` | contract + domain + cards-display + i18n | ~22k | 首屏 |
| `client-sandbox.bundle` | `client/sandbox/index.tsx`（动态 import） | 上面 + engine + session + actions + cards-impl + custom-code + draft | ~40k | 用户进入 `?page=workshop&sandbox=local` 时 |

主收益不是行数缩减，而是：
- **正常多人对局**首屏 bundle 不背工坊代码
- **形态 A 主路径**在 ESLint 层杜绝"前端规则裁定"
- **形态 B sandbox** 显式承担"in-process 完整 GameSession"的责任，边界清晰

### 4.6 Sandbox hot-seat 实现要点

`client/sandbox/` 目录承担形态 B：

```text
client/sandbox/
  ├─ index.tsx                  动态入口；首次访问按需加载
  ├─ local-session.ts           直接 new SessionCore(...)，跑在浏览器
  ├─ local-transport.ts         实现 GameTransport，但 dispatch 是同进程同步调用，不走 WS
  ├─ scenario-export.ts         GameState 导出/导入 (JSON share link)
  └─ workshop-bridge.ts         接 client/app/WorkshopPage.tsx：选 "sandbox=local" 时切到本地 SessionCore
```

实现约束：

- **同一份 `SessionCore`**：和后端跑的 `SessionCore` 完全相同（直接 import `shared/session/session-core`），不写"简化版"——一份代码确保规则一致
- **同一份序列化**：sandbox 状态可以序列化为 `SerializedGameState`（含 engine cursor），与后端持久化格式相同；可以从后端导出后导入 sandbox 继续跑，反之亦可
- **同一份自定义卡运行时**：sandbox 直接使用 `shared/custom-code/` 解释执行，不走 `server/custom-code/` 的 sidecar（沙盒安全级别下降，因为运行在用户自己的浏览器，安全责任在用户）
- **不依赖任何 HTTP/WS**：完全离线可用，GitHub Pages 静态部署即可访问

### 4.7 与 BGA 的对照

BGA 天然前后端分离（PHP 后端 + JS 前端）：JS 不可能 import PHP。代价是 JS 必须独立维护一份"什么能点 / cost 多少"的判定，长期容易和 PHP 分叉。

我们走"shared TypeScript 分层 + 形态 A/B 双 bundle"做到：

- **多人对局正确性**：形态 A 通过 ESLint 边界保证"规则只在后端"，杜绝双份判定分叉
- **离线工坊体验**：形态 B 让同一份领域代码在浏览器内独立运行
- **零规则分叉**：两种形态用的是**同一份 `shared/session/` + `shared/engine/`**，不是"两份相似实现"

这是 BGA 做不到的形态——但前提是 §4.1–§4.4 的目录隔离 + ESLint 边界严守，否则形态 A 主路径会被工坊代码污染。

---

## 5. Engine：节点树是唯一状态机

### 5.1 节点充血（学 BGA `AbstractNode`）

每种节点是一个 class，自带：

```ts
abstract class AbstractNode {
  abstract readonly type: NodeType
  abstract isDoable(player: PlayerState, ctx: EngineContext): boolean
  abstract isAutomatic(player: PlayerState, ctx: EngineContext): boolean
  abstract resolve(input: ResolveInput, ctx: EngineContext): ResolveResult

  // 树操作（基类提供）
  parent: AbstractNode | null
  children: AbstractNode[]
  push(child: AbstractNode): void
  replace(newNode: AbstractNode): void
  isResolved(): boolean
  getNextUnresolved(): AbstractNode | null

  // 序列化（基类提供）
  toCursor(): NodeCursor
  static fromCursor(cursor: NodeCursor, registry: NodeRegistry): AbstractNode
}
```

> 基类不含 `getChoices`——"等待玩家选什么"只在 `InteractionNode` 子类上以 `request` 字段表达；其他节点（leaf / seq / parallel / xor / playerSwitch）没有"选项"概念。

**`InteractionNode` 是唯一"等待玩家输入"叶子节点**——所有形态（按钮选项、农场选格、卡池选卡、动物重组、收获喂食、确认按钮）由 `InteractionRequest` sum type 区分：

```ts
class InteractionNode extends AbstractNode {
  readonly type = 'interaction'
  readonly request: InteractionRequest         // ★ 全部等待形态的强类型 discriminator
  readonly promptKey: string                    // 仅用于 i18n，不再是 discriminator
  readonly promptParams?: Record<string, unknown>
  readonly sourceCard?: string                  // 触发来源卡（如有）

  resolve(input: { selection?: string; payload?: unknown }, ctx): ResolveResult {
    return ctx.action.resolveChoice?.(ctx, input.selection ?? 'confirm', input.payload)
      ?? { type: 'fail' }
  }
}
```

`InteractionRequest` 是强类型 sum type（kind 字段即 `SubFlowKind`）：

```ts
type InteractionRequest =
  | { kind: 'choice'
      options: ChoiceOption[] }
  | { kind: 'farm-select'
      farmType: 'plow' | 'sow' | 'fence' | 'room' | 'stable'
      selectableTiles?: FarmTilePosition[]
      selectableEdges?: string[]
      selectableFields?: { tile: FarmTilePosition; allowedCrops: CropType[]; sourceCard?: string }[]
      maxSelections?: number
      extraWood?: number }                    // fence 专用
  | { kind: 'selection'
      selectionKind: 'farm-position' | 'occupation-hand'
      selectablePositions?: FarmTilePosition[]
      selectableCards?: string[]
      minSelections?: number
      maxSelections: number }
  | { kind: 'animal-reorg'
      zones: InteractionAnimalReorgZone[] }
  | { kind: 'feed'
      remaining: number
      foodUsed: number
      feedQueue?: { index: number; remaining: number; foodUsed: number }[] }
  | { kind: 'confirm-next-player'
      nextPlayerIndex: number }
  | { kind: 'confirm-player-switch'
      fromPlayerIndex: number
      toPlayerIndex: number }
  // 未来扩展：'card-draft' / 'place-meeple' / ...
```

**为什么单一节点 + sum type，不是多种节点类型**：

- 节点的核心责任只有一个：**等玩家输入**。形态差异不在节点行为而在数据形态（"我要前端高亮哪些格子" vs "我要前端列哪些选项"）。多节点类型方案要求 Engine、协议、序列化、前端各重复 N 套调度，而 sum type 让所有调度走同一路径。
- 卡牌效果如果未来需要**新等待形态**（比如棋盘连线、拖拽顺序），加一个 request kind 即可——`InteractionNode` 实现不动、Engine 不动、协议层加一个 case、前端加一个 switch 分支。
- BGA `Pieces.php`/`Notifications.php` 的设计哲学也是"等待形态参数化"，不是"每种等待一个 PHP class"。

**触发**：Leaf action 通过 `ActionExecutionResult.type === 'request'` emit `InteractionRequest`，engine 把当前节点替换为 `InteractionNode` 并 yield 给 Session。

**消除字符串 discriminator**：reorganize prototype 用 `pending.promptKey === 'ui.interactionAnimalReorg'` 当隐式 discriminator——这扩展到所有 farm-select / selection 上是同一种病。`InteractionRequest.kind` 强类型枚举一次性消掉 `isFarmPromptKey()` / `isSelectionPromptKey()` 等所有字符串嗅探。

### 5.2 Engine 接口收敛

目标态 Engine 的 public 接口不超过 6 个方法：

```ts
class Engine {
  step(): EngineStepResult                         // 推进
  resolveChoice(choice: string, payload?: unknown) // 提交选择
  peekNextUnresolved(): AbstractNode | null        // "现在等什么"
  snapshot(): EngineSnapshot                       // 含 cursor
  restore(snapshot: EngineSnapshot): void
  getCurrentInteraction(): Interaction | null      // 派生 InteractionEnvelope
}
```

vs 当前 ~20 个 public（含 `injectBeforeNodes / buildFlowNodePublic / prependFlow / insertFlowAfterPendingChoice` 等），节点构造和 hook 注入下沉为 dispatcher 内部行为。

### 5.3 Sub-flow Stack（取代 `pausedEngine`）

> 当前 reorganize prototype 用 8 字段 ad-hoc `pausedEngine` 暂存"engine 内触发 engine"。

新架构提供一等概念：

```ts
class EngineStack {
  push(reason: SubFlowReason): EngineFrame   // 入栈当前 frame
  pop(): EngineFrame                         // 弹回上层 frame
  current(): EngineFrame                     // 栈顶
  depth(): number
  toCursor(): EngineStackCursor              // 整栈序列化
}

type EngineFrame = {
  engine: Engine
  source: EngineSource          // actionId 或 inline flow
  ownerPlayerIndex: number
  spaceId: string | null        // 真实 spaceId 或 '__subflow:reorganize' 等
  stageResume: StageResume | null
  reason: SubFlowReason         // 'reorganize' | 'feed' | 'draft-pick' ...
}
```

任何"中途触发另一段流程"的卡牌效果都走 `EngineStack.push(reason)`。子流程结束时 `pop()` + 调用对应 `stageResume`。**不再有 ad-hoc 暂存字段**。

### 5.4 Cursor 序列化（D-a 决议）

Engine 当前节点光标进 `SerializedGameState`，房间冷恢复无需重放命令历史：

```ts
type SerializedGameState = {
  // 玩家 / 行动空间 / 回合等领域字段
  engineStack: EngineStackCursor    // 空栈即无进行中子流程
}

type EngineStackCursor = {
  frames: EngineFrameCursor[]
}

type EngineFrameCursor = {
  source: { kind: 'action'; actionId: string } | { kind: 'flow'; flowSpec: FlowSpec }
  cursor: NodeCursor                // 节点树重建后定位"当前等待节点"
  ownerPlayerIndex: number
  spaceId: string | null
  stageResume: StageResume | null
  reason: SubFlowReason
}
```

恢复路径：

1. `serializeState()` 调 `engine.snapshotCursor()` 拿 cursor
2. `rehydrateState()` 不直接重建 engine——engine 在 GameSession 重建时按 cursor 重放节点树（`AbstractNode.fromCursor()`）并定位光标

`engineStack` 字段 required（不是 optional），无 cursor 即"无进行中的子流程"，对应空栈。

---

## 6. Session：按游戏阶段拆 traits/mixins

> 当前 `game-core.ts` 2969 行单 class 包打 5 件事；BGA 同体量代码拆成 `game.php` 484 + 4 个 Trait（ActionTrait 211 / DraftTrait 1050 / HarvestTrait 264 / TurnTrait 767）。

### 6.1 拆分

```ts
// shared/session/session-core.ts (~600 行目标)
class SessionCore {
  state: GameState
  engineStack: EngineStack

  // mixin 注入
  actionPhase: ActionPhase
  harvestPhase: HarvestPhase
  turnPhase: TurnPhase
  draftPhase: DraftPhase
  stageResume: StageResumeMixin

  // 唯一对外入口
  dispatch(cmd: Command): SessionResponse
}

// shared/session/phases/action-phase.ts
class ActionPhase {
  takeAction(spaceId: string, playerIndex: number): SessionResponse
  // 走 engine.step → engineStack 管理
}

// shared/session/phases/harvest-phase.ts
class HarvestPhase {
  startHarvest(): void
  continueAfterReap(): void
  continueAfterFeed(): void
  continueAfterBreed(): void
  continueAfterReorganize(playerIndex: number): void
}

// shared/session/phases/turn-phase.ts
class TurnPhase {
  startNewRound(): void
  switchToNextPlayer(): void
  finalizeRound(): void
}

// shared/session/phases/draft-phase.ts (S2 才启用)
class DraftPhase { /* ... */ }

// shared/session/stage-resume.ts
class StageResumeMixin {
  resume(stageResume: StageResume): void   // 单一 dispatch，按 hook 名分发
}
```

### 6.2 唯一 commit 入口

```ts
type Command =
  | { kind: 'takeAction'; playerIndex: number; spaceId: string }
  | { kind: 'resolveChoice'; playerIndex: number; choice: string; payload?: unknown }
  | { kind: 'takeAnytime'; playerIndex: number; actionId: string }
  | { kind: 'commitFarm'; playerIndex: number; selection: FarmSelection }
  | { kind: 'commitSelection'; playerIndex: number; selection: SelectionPayload }
  | { kind: 'newGame' | 'loadGame' | 'undoStep' | 'undoAction' | ... }

class SessionCore {
  dispatch(cmd: Command): SessionResponse {
    switch (cmd.kind) {
      case 'takeAction':     return this.actionPhase.takeAction(cmd.spaceId, cmd.playerIndex)
      case 'resolveChoice':  return this.actionPhase.resolveChoice(cmd.choice, cmd.payload, cmd.playerIndex)
      // ...
    }
  }
}
```

**不再有** `confirmAnimalReorg / confirmHarvestFeed / confirmNextPlayer / confirmPlayerSwitch` 等 N 个具名方法。所有等待形态都是 `InteractionNode` 上不同的 `request.kind`。

### 6.3 PendingAction 完全消除

`shared/game/types.ts` 中：

- `PendingAction` union 不存在
- "等什么"由 `engine.peekNextUnresolved()` 派生
- 协议层向客户端发 `InteractionEnvelope`（见 §7）
- `SerializedGameState` 持久化 `engineStack` cursor，不持久化 pending

---

## 7. 协议层：Interaction 是唯一前端真相

> 当前 `InteractionState` 8 个 stateId（`idle / choice / farmSelect / selection / animalReorg / harvestFeed / confirmNextPlayer / confirmPlayerSwitch`）+ 7 个 commit 命令（`commitFarm / commitSelection / commitChoice / confirmFeed / confirmNextPlayer / confirmPlayerSwitch / confirmReorg`）。目标态收敛为 **3 个 stateId + 1 个 commit 命令**。

### 7.1 InteractionEnvelope 简化

```ts
type InteractionEnvelope = {
  stateId: 'idle' | 'wait' | 'gameover'
  playerIndex: number               // 等谁（idle/gameover 时无意义）
  spaceId?: string                  // 触发 wait 的行动空间（如有）
  promptKey?: string                // 纯 i18n
  promptParams?: Record<string, unknown>
  sourceCard?: string               // 由某张卡触发时归属
  request?: InteractionRequest      // ★ stateId === 'wait' 时必填，sum type 见 §5
  allowedCommands: CommandKind[]    // wait 状态固定为 ['resolveChoice', 'undoStep', 'undoAction']
  anytimeActions: AnytimeEntry[]
}
```

`InteractionRequest.kind` = `SubFlowKind`，单一来源。

### 7.2 ClientCommand 收敛

```ts
type ClientCommand =
  | { type: 'action'; spaceId: string }
  | { type: 'resolveChoice'; selection?: string; payload?: unknown }   // ★ 唯一选择命令
  | { type: 'anytime'; actionId: string }
  | { type: 'newGame' | 'loadGame' | 'undoStep' | 'undoAction' | 'devCreatePasture' | ... }
```

不存在的命令（vs 当前）：
- `commitChoice / commitFarm / commitSelection`
- `confirmReorg / confirmFeed / confirmNextPlayer / confirmPlayerSwitch`

前端按 `request.kind` 决定 `payload` 形态：

| request.kind | payload 形态 |
|---|---|
| `'choice'` | `{ value: string }`（或 `selection` 字段直接传） |
| `'farm-select'` | `{ tiles?: FarmTilePosition[]; edges?: string[]; fields?: ... }` |
| `'selection'` | `{ positions?: string[]; cards?: string[] }` |
| `'animal-reorg'` | `ZoneAssignment[]` |
| `'feed'` | `FeedSelection[]` |
| `'confirm-next-player'` / `'confirm-player-switch'` | undefined |

### 7.3 协议要点

- 不存在 `PendingAction` 类型
- 不存在 `commitFarm / commitSelection / confirmFeed / confirmNextPlayer / confirmPlayerSwitch` 等具名命令——全部 `resolveChoice`
- `InteractionEnvelope.request.kind` 是前端 switch 的唯一 discriminator
- `promptKey` 仅做 i18n，**不再当 stateId/kind 嗅探依据**——`isFarmPromptKey()` / `isSelectionPromptKey()` 在目标态不存在

---

## 8. Action 模型

### 8.1 ActionDefinition 接口（基本不变，强化 resolveChoice）

```ts
type ActionDefinition = {
  id: string
  nameKey: string
  descriptionKey?: string
  roundAvailable?: number
  gainPerRound?: Partial<Resource>

  canBeExecutedByPlayer?: (player, state) => boolean
  costPreview?: CostPreview
  isDoable?: (ctx) => boolean
  isAutomatic?: (ctx) => boolean

  execute: (ctx) => ActionExecutionResult
  resolveChoice?: (ctx, choice: string, payload?: unknown) => ActionExecutionResult

  // hook 由 hooks.ts 注册，不进 ActionDefinition
}
```

### 8.2 充血 vs 数据：刻意保留"数据 + flow"

BGA 的 Action 是充血 class（`Pay extends Models\Action`，自带 `checkBeforeEffects / checkListeners / checkModifiers / checkCostModifiers`）。我们刻意不照搬，理由：

- 我们的 `ActionFlow` 是声明式节点树，比 BGA 命令式 `actPay` 更可读
- 自定义卡 DSL → ActionFlow 的运行时转译要求 Action 必须可数据化序列化
- Hook 我们用显式注册（`hooks.ts`），更易追溯

但 Action 的"行为"分布要清理：cost 求解 → `payment/`，options 构造 → 各 effect 自身，trigger hook → `hooks.ts`。`improvement.ts` 985 行那种"5 件事缝在一起"是反模式。

---

## 9. Payment 收口

> 当前 `payment.ts` 900 + `pay-helpers.ts` 647 + `room-payment.ts` 427 = 1974 行 + **33 个 export**。
> BGA `Actions/Pay.php` 837 行 + **8 个 public**。

### 9.1 PaymentSolver 单一深 module

```ts
// shared/actions/payment/index.ts
export class PaymentSolver {
  // 唯一对外接口
  computeOptions(player: PlayerState, cost: CostShape, ctx: PaymentContext): PaymentOption[]
  canAfford(player: PlayerState, cost: CostShape, ctx: PaymentContext): boolean
  execute(player: PlayerState, option: PaymentOption, ctx: PaymentContext): PaymentResult
}

type CostShape =
  | { kind: 'flat'; resources: Partial<Resource> }
  | { kind: 'complex'; spec: ComplexCostSpec }
  | { kind: 'room'; count: number; houseType: HouseType }

type PaymentOption = {
  resources: Partial<Resource>
  cardSources?: CardSourceMap
  modifiers?: AppliedModifier[]
}
```

### 9.2 内部细节（不对外）

```ts
// shared/actions/payment/solver.ts          - 求解算法
// shared/actions/payment/executor.ts        - 实际扣资源
// shared/actions/payment/modifiers.ts       - cost modifier hook 应用
// shared/actions/payment/adapters/room.ts   - room cost 特殊形状
// shared/actions/payment/cache.ts           - solution cache (解 N 选 M 性能)
```

调用方（`improvement.ts` / `construct.ts` / `pay.ts` / `place-farmer.ts` 等）只 import `PaymentSolver`，不再 import 三个文件挑工具。

### 9.3 命名清理

合并这些近义函数：

- `canPayResources / canPayCost / canAffordCost / canAffordFlatCost` → 一个 `PaymentSolver.canAfford(cost: CostShape)`
- `payResources / executePaymentSolution / payTypedFlatCost / payCardPreviewCostByProvider` → 一个 `PaymentSolver.execute(option)`
- `computeAllBuyableCombinations / keepOnlyOptimals / sortPaymentSolutions` → 内部细节

---

## 10. 领域聚合层 `shared/domain/`

> BGA `Models/PlayerBoard.php` **2316 行** + `Models/Player.php` 1028 + `Managers/*` 3063 = 充血聚合 ~6400 行；
> 我们对应 `shared/game/types.ts` 711 + `shared/logic/*` 2897 = ~3600 行散件。
> **这 ~3000 行差，正是行动层超 BGA 3300 行的反向来源**。

### 10.1 设计约束

PlayerState 必须 JSON 可序列化（WS 快照），不能改成真充血对象。所以 `domain/` 走**派生视图聚合**模式：

```ts
// shared/domain/player-board.ts
export class PlayerBoard {
  // 派生视图，不持有可变状态
  constructor(private readonly player: PlayerState, private readonly state: GameState) {}

  // 领域查询
  countAnimals(type?: AnimalType): number
  pasturesWithCapacity(): { id: string; capacity: number; current: number }[]
  emptyFences(): FenceEdge[]
  hasRoomFor(animal: AnimalType): boolean
  canPlow(field: FieldCoord): { ok: true } | { ok: false; reason: string }
  canBuildFence(spec: FenceSpec): ValidationResult
  scoringBreakdown(): ScoreBreakdown

  // 不变量
  private invariant_animalsInPastureOrStable(): void
}

// 工厂
export const playerBoard = (state: GameState, playerIndex: number) =>
  new PlayerBoard(state.players[playerIndex], state)
```

### 10.2 与现有散件的迁移

| 现有散件 | 迁入 | 关系 |
|---|---|---|
| `shared/logic/farm/farm-interaction.ts` (323) | `domain/farmyard.ts` | 主体迁入 |
| `shared/logic/farm/fence-validation.ts` (533) | `domain/pasture.ts` | 主体迁入 |
| `shared/logic/farm/sow-validation.ts` (133) | `domain/farmyard.ts` | 合并 |
| `shared/logic/farm/plow-validation.ts` (88) | `domain/farmyard.ts` | 合并 |
| `shared/actions/helpers/animal-zones.ts` (277) | `domain/animal-zones.ts` | 直接迁入 |
| `shared/logic/scoring.ts` (408) | `domain/scoring.ts` | 整体迁入 |
| `shared/logic/scoring-bonus-solver.ts` (167) | `domain/scoring.ts` 内部 | 合并 |
| `shared/logic/farm.ts` (84) | `domain/farmyard.ts` | 合并 |

### 10.3 调用方收益

现在散落各 effect 里的"我能不能 X / 帮我做 X"全部转到 `PlayerBoard`：

```ts
// 旧
import { computeAnimalZones } from '../helpers/animal-zones'
import { validateFenceSelection } from '../../logic/farm/fence-validation'
import { canSowField } from '../../logic/farm/sow-validation'
const zones = computeAnimalZones(player)
const ok = validateFenceSelection(player, edges)

// 新
const board = playerBoard(state, playerIndex)
const zones = board.animalZones()
const ok = board.canBuildFence({ edges })
```

### 10.4 行动层瘦身预期

`improvement.ts` 985 → 目标 ≤ 400 行，差额迁入：
- 可付性判定 → `PaymentSolver.canAfford`
- fireplace 池 → `domain/improvement-pool.ts`（新文件，~80 行）
- options 构造 → 拆 `improvement-options.ts`（~150 行）

---

## 11. Hook 系统（沿用，加 sub-flow 配合）

Hook 系统不变（`shared/actions/hooks.ts`），但加约束：

- Hook 触发产生 sub-flow 时，必须用 `EngineStack.push()`，不能再 `this.pending = ...`
- Hook 注册的 `SubFlowKind` 必须在协议层 `SubFlowKind` union 里登记（CI 校验）
- `stageResume` 仍是 hook 完成后的回调机制，但作为 EngineFrame 字段持久化

---

## 12. 持久化与房间生命周期

### 12.1 SerializedGameState 含 engine cursor

```ts
type SerializedGameState = {
  players: SerializedPlayerState[]
  actionSpaces: SerializedActionSpace[]
  round: number
  // ... 其他领域字段
  engineStack: EngineStackCursor    // 空栈即无进行中子流程
  // PendingAction 字段不存在
}
```

### 12.2 RoomManager 拆分

> 当前 `room-manager.ts` 1174 行混 4 件事。

```text
server/connection/
  ├─ ws-server.ts          连接 / 鉴权 / 重连 / 心跳
  ├─ room-router.ts        命令路由
  └─ broadcaster.ts        StateUpdateEnvelope 序列化 + 扇出

server/game/
  ├─ room.ts               房间元数据（座位、TTL、固定 dev 房）
  ├─ authoritative-session.ts  GameSession 容器
  └─ persistence/
      ├─ room-persistence.ts   抽象接口
      ├─ sqlite-adapter.ts
      └─ json-adapter.ts
```

两个 adapter（SQLite + JSON）已存在，是 real seam（"two adapters = real seam"），只是当前没显式化。新分层让"测试注入 in-memory adapter"成为可能。

### 12.3 协议层：StateUpdateEnvelope 不变

`StateUpdateEnvelope` 字段不变（`version / cause / state / interaction / ...`）。`state` 是 `SerializedGameState`，自动包含新的 `engineStack` 字段。前端按现有"snapshot 整体替换"路径处理，不需要改逻辑。

---

## 13. 测试策略（不变 + 新约束）

三层不变（unit / session / e2e）。新约束：

- **Session 测试不再调 `confirmXxx` 方法**：统一用 `session.dispatch({ kind: 'resolveChoice', choice, payload })`
- **Engine cursor 序列化覆盖**：新增"中途序列化 + 重建"测试套件（每种 SubFlowKind 至少 1 例：reorganize / feed / draft / confirm-next）
- **PlayerBoard 不变量测试**：每个领域查询方法（`countAnimals` / `emptyFences` / `canPlow`）单独单测

### 13.1 重构期间的测试 skip 策略

S1–S5 期间频繁动 commit 入口（`confirmXxx` → `resolveChoice + payload`）和 PendingAction 字段，254 个卡牌效果 session 测试会大批被打断。每个 sprint 都做完整 codemod 不现实（reorganize prototype 单 commit 已 codemod 84 处）。

#### "强制 green" 子集——每个 PR 必绿

- `tests/` 顶层：`pending-undo-regression` / `protocol-types` / `game-sync-pipeline` 等协议 + 基础设施
- `server/__tests__/` 中**无具体卡牌前缀**的：`harvest-session.test.ts` / `on-end-turn-session.test.ts` / `stage-hook-flow.test.ts` / `reorganize-engine-session.test.ts` / `harvest-feed-session.test.ts` 等机制基线
- `shared/**/__tests__/` 中"engine / 节点 / domain / payment-solver" 单测
- 当前 sprint 自带的回归测试（如 S1 的 cursor 序列化 round-trip 测试）

这些是"主路径"测试。它们 fail = 主路径行为变了，必须立刻 fix。

#### "允许 skip" 子集——sprint 期间可 skip

`server/__tests__/{A,B,C,D,E}NN_*-session.test.ts`（一卡一文件，~254 个卡牌效果测试）。

skip 机制：

- 用 `it.skip` + 一行注释：`// SKIP: S2 confirm-feed 重构期，见 docs/skip-tracker.md`
- 维护 `docs/skip-tracker.md` 简单 markdown 表：卡 ID + skip 原因 + 期望解除 sprint
- PR 描述必须列出**新增 skip 数量增量**——CI 不强校验，但 reviewer 检查
- 每个 sprint DoD 加一项："新增 skip 数 / 累计 skip 数 列在 PR 描述"

#### S7 统一回归

S6 物理分层完成后专设 S7"卡牌效果测试回归"：

- 解除所有 skip
- 254 个卡牌测试全部 green
- 期间发现的卡牌实际行为退化各自修复（不是 codemod 修——而是规则修复）

---

## 14. 与当前架构的差异速查

| 维度 | 当前 | 目标 |
|---|---|---|
| "等什么"真相 | `GameCore.pending` + `Engine.tree` 双状态机 | Engine 节点树唯一 |
| commit 入口 | N 个 `confirmXxx` 方法 | 单一 `dispatch({ kind: 'resolveChoice', ... })` |
| Sub-flow 暂存 | ad-hoc `pausedEngine` 8 字段 | `EngineStack.push/pop` |
| Sub-flow discriminator | `pending.promptKey === 'ui.interactionAnimalReorg'` 字面量 | `interaction.subFlow.kind: SubFlowKind` 强类型 |
| Engine public 接口 | ~20 个方法 | ≤ 6 个 |
| 节点 | 贫血 + dispatcher | 充血 `AbstractNode` 基类 |
| Engine 序列化 | 内存独立 snapshot，房间持久化不含 | cursor 进 `SerializedGameState`（D-a） |
| Session | `game-core.ts` 2969 行单 class | `session-core.ts` ≤ 600 + 4 个 phase mixin |
| Payment | 3 文件 33 export 工具袋 | `PaymentSolver` 单深 module，3 个 public |
| 领域聚合 | 散件 helper（`logic/farm/*`、`actions/helpers/*`） | `domain/` 派生视图（`PlayerBoard` 等） |
| Improvement effect | `improvement.ts` 985 行 5 件事 | ≤ 400 行 + 拆出 options/pool |
| RoomManager | 1174 行 4 职责 | `connection/` + `game/` + `persistence/` 三层 |
| 协议层 PendingAction | 一等 union | ❌ 删除 |
| 协议层 InteractionCommand | `confirmReorg/Feed/Next/Switch` 等 | 全合并为 `resolveChoice` |
| 协议层 InteractionState | 8 个 stateId（idle/choice/farmSelect/selection/animalReorg/harvestFeed/confirmNextPlayer/confirmPlayerSwitch） | 3 个 stateId（idle/wait/gameover）+ `request: InteractionRequest` sum type |
| Leaf 等待节点 | `ChoiceNode` 单一类型，复杂等待靠 promptKey 字符串嗅探派生 stateId | `InteractionNode` 单一类型 + `InteractionRequest` 7 种 kind sum type |
| Leaf 触发等待 | `ActionExecutionResult.type === 'choice'`（+ `'animalReorg'` 旁支） | `type === 'request'` + `request: InteractionRequest` 一致接口 |
| 复杂选择 payload | `choice.split(',')` 字符串拼接（如 `selection.ts`）；或额外 `commitFarm` / `commitSelection` 命令携带 | `payload` 通道直接传结构化数据，按 `request.kind` 决定形态 |

---

## 15. Sprint 演进路线

按"先验证模式 → 再清架构 → 再瘦行动 → 再引入聚合 → 最后物理分层 + 测试回归"排。**剩余 sprint 的并行机会见 §15bis**——双 owner 节奏可把 S4–S7 从 5–7 周压到 4–5 周。

每个 sprint 共同 DoD（除强制 green 子集外）：

- 「强制 green 子集」（见 §13.1）保持全绿
- 卡牌效果 session 测试可 skip，PR 描述列「新增 skip 数 / 累计 skip 数」
- skip 必须登记在 `docs/skip-tracker.md`

### Sprint S1：消除 PendingAction 残留 + 引入 InteractionNode 骨架 + 落地 D-a 序列化 ✅ 完成（2026-05-03）

> **完成总结**（详见 `docs/sprint-S1-progress.md`）
>
> - ✅ Tasks 1–11 全部落地（含 Task 11 reviewer C-1 / I-1 follow-ups）
> - ✅ R1–R4 残留清掉：`pausedEngine` → `EngineStack`；`subFlowKind` 强类型；`stageResume.extra` 自描述化；`__subflow:reorganize` 命名收口
> - ✅ `InteractionNode` 骨架引入 + 4 种 kind 起步（`choice` / `animal-reorg` / `confirm-next-player` / `confirm-player-switch`）；`ChoiceNode` 类型不复存在；`ActionExecutionResult.type` 收敛为 `'request'`，`'animalReorg'` result type 删除
> - ✅ D-a：`Engine.snapshotCursor()` + cursor 进 `SerializedGameState`
> - ✅ Task 11 reviewer C-1：`resolveChoice` 验证客户端 `value` 命中 `InteractionNode.choices`，恢复 BGA 等价拒绝行为；5 个 sow-fail 测试 un-skip
> - **基线**：fast 0 fail / 35 skip；slow 0 fail / 13 skip
>
> 以下为 sprint 启动时的 spec 内容，作为历史记录保留。


- 推广 reorganize 模式到 `confirmNextPlayer` + `confirmPlayerSwitch`
- 清掉 reorganize prototype 的 R1–R4 残留：
  - R1: `pausedEngine` 升级为 `EngineStack`
  - R2: `subFlowKind` 强类型替代 `promptKey` 字面量 discriminator
  - R3: 3 个 `continueAfterReorganize_*` 用 `stageResume.extra` 自描述化
  - R4: `__reorganize__` 收口为 `__subflow:reorganize` 命名约定
- **引入 `InteractionNode` 骨架**（不全推广，仅承载本 sprint 范围的三种 kind）：
  - `InteractionNode` 替代 `ChoiceNode`（节点 type 从 `'choice'` 改为 `'interaction'`）
  - `InteractionRequest` sum type 引入，本 sprint 仅实现 `'choice'` / `'animal-reorg'` / `'confirm-next-player'` / `'confirm-player-switch'` 4 种 kind
  - farm-select / selection / feed / card-draft 4 种 kind 延后到 S2
  - `ActionExecutionResult.type === 'choice'` → `'request'`，删除 `'animalReorg'` result type
- D-a：`Engine.snapshotCursor()` + cursor 进 `SerializedGameState`
- 范围**不拆**：上述 7 件事必须一起做——InteractionNode 接口形状靠 confirmNextPlayer/confirmPlayerSwitch 两个真实推广用例 + 已存在的 reorganize 用例同时锁定，单做某一项无法验证抽象
- 专项 DoD：
  - 删除 `PendingAction.confirmNextPlayer / confirmPlayerSwitch` + `InteractionCommand` 对应命令
  - 删除 `ActionExecutionResult.type = 'animalReorg'`
  - `ChoiceNode` 类型在代码中不复存在（统一 `InteractionNode`）
  - 「强制 green 子集」全绿（含新增的 cursor 序列化 round-trip 测试）

### Sprint S2：InteractionNode 完整推广 + harvestFeed + cardDraft + Session 拆 traits ✅ 完成（2026-05-05）

> **完成总结**（详见 `docs/sprint-S2-progress.md`）
>
> - ✅ Tasks 1–13 全部落地
> - ✅ InteractionRequest 推广剩余 kind：`farm-select`（plow/sow/fence/room/stable）/ `selection`（farm-position/occupation-hand）/ `feed`（harvestFeed）/ `card-draft`（cardDraft）；GameCore.build{Plow,Sow,Fence,Selection,Farm}Interaction 全删；`isFarmPromptKey()` / `isSelectionPromptKey()` 字符串嗅探消除
> - ✅ 协议层 InteractionState 简化：8 stateId → 3（idle / wait / gameover）；`request: InteractionRequest` 单字段
> - ✅ ClientCommand 收敛：`commitFarm / commitSelection / commitChoice / confirmFeed` 全删 → 全部 `resolveChoice`；`/api/game/draft-submit` HTTP 端点同步删除
> - ✅ **`PendingAction` union 完全删除**（Task 13.6）：union + `SessionResponse.pending` + `getCurrentPending` / `clonePending` / `computeCardDraftPending` 全部移除；测试侧 ~600 处 `pending.X` + ~330 处 `pending.type` 全部 codemod 到 `interaction.X` / `state.draft`；`HistoryEntry.pending` 收紧为 `hadChoicePending: boolean`
> - ✅ `confirmNextPlayer / confirmPlayerSwitch / confirmHarvestFeed` shim 全删（Task 13.7）；105 + 24 callsite codemod 完成
> - ✅ Session 拆 traits：`game-core.ts` → `session-core.ts` + 4 个 phase mixin（`shared/session/phases/{round,harvest,draft,setup}.ts`）；物理迁移留 S6
> - ✅ `OrNode/XorNode/OptionalNode` emit 元数据下沉到节点自身字段；`Engine.lastEmittedChoice` cache 删除
> - **基线**：fast 2098 passed / 35 skipped；tsc 0 error；lint 0 error / 323 warnings
>
> 以下为 sprint 启动时的 spec 内容，作为历史记录保留。


- **InteractionNode 推广剩余 kind**：
  - 实现 `'farm-select'` request kind（含 plow/sow/fence/room/stable 5 种 farmType）
  - 实现 `'selection'` request kind（含 farm-position/occupation-hand）
  - 实现 `'feed'` request kind（harvestFeed 用）
  - 实现 `'card-draft'` request kind（cardDraft 用，沿用 `shared/draft/`）
  - 删除 GameCore.buildPlowInteraction / buildSowInteraction / buildFenceInteraction / buildSelectionInteraction / buildFarmInteraction —— 这些"集中派生"逻辑下沉到对应 leaf action 的 `execute()`
  - 删除 `isFarmPromptKey()` / `isSelectionPromptKey()` 等字符串嗅探
- **协议层 InteractionState 简化**：8 stateId → 3（idle / wait / gameover）；`request: InteractionRequest` 单字段
- **ClientCommand 收敛**：删除 `commitFarm / commitSelection / commitChoice / confirmFeed`，全部 `resolveChoice`
- 推广模式到 `harvestFeed`（参考 BGA `HarvestTrait` 264 行）→ 实际就是 `feed` request kind
- `cardDraft` 包装到 `card-draft` request kind：复用现有 `shared/draft/draft-manager.ts` 153 行 simultaneous 模型，删 `'draftSubmit'` ClientCommand + `/api/game/draft-submit` HTTP 端点，统一走 `resolveChoice`；**不引入 BGA 风格轮抽**（pass-card-around）
- `game-core.ts` 拆成 `session-core.ts` + 4 个 phase mixin（仍在原 `shared/session/` 目录，物理迁移留 S6）
- 专项 DoD：
  - `PendingAction` union 完全删除
  - `game-core.ts` 单文件 ≤ 800 行
  - 协议层 `InteractionState` 只剩 3 个 stateId
  - `ClientCommand` 选择类命令只剩 `resolveChoice`
  - `selection.ts` 不再用 `choice.split(',')` 字符串拼接（payload 走结构化字段）

### Sprint S3：Payment 收口 + Improvement 瘦身 ✅ 完成（2026-05-04）

- ✅ `payment.ts` + `pay-helpers.ts` + `room-payment.ts`（1974 行 / 41 export）合并为 `shared/actions/payment/`
- ✅ `PaymentSolver` namespace 6 成员：4 core public（`computeOptions / canAfford / execute / pickAuto`）+ 2 utility（`clearCache / isComplexCost`）；详见 ADR-0006 D5
- ✅ `improvement.ts` 1014 → 575（拆出 `improvement-options.ts` 364 + `improvement-pool.ts` 86）；plan ≤ 400 目标超 175 行（Task 9 commit message 记录权衡）
- ✅ ESLint `no-restricted-imports` 守门：`shared/actions/effects/**` 与 `shared/cards/**` 禁 import `helpers/payment*`
- ✅ 0 卡牌测试新增 skip；强制 green 子集 baseline 一致（1 pre-existing failure 与 S3 无关）
- **完成度量**：21 commits on `sprint-S3-payment-solver` branch；ADR-0006 全部 6 个子决议（D1-D6）落地
- **依赖关系**：与 S1 / S2 / S4 均无强前置（详见 `docs/superpowers/specs/2026-05-03-engine-redesign-S2-S4-contracts.md` §4.2）。在独立 worktree 推进，effect 改写严格限定在 `improvement.ts` 拆分相关

### Sprint S4：领域聚合层 `shared/domain/` + 节点充血

S4 拆分为两条独立轨道并行推进：

#### S4a：领域聚合层 `shared/domain/` ✅ S4a 完成（2026-05-05）

> **完成总结**（详见 `docs/sprint-S4a-progress.md`）
>
> - ✅ PR1：scaffold `shared/domain/{index,player-board,farmyard,pasture,animal-zones,scoring}.ts`，wrap-only
> - ✅ PR2：farm 类 effects（plow/sow/fence/room/stable）切换到 `playerBoard().farmyard.xxx()`
> - ✅ PR3：animal-zones 消费方（C11/C12/C148/E33/E11/A86/B11/...）切换到 `playerBoard().animals.xxx()`
> - ✅ PR4：protocol / session-core / client / cards-effects 类型 import 切换到 `shared/domain`
> - ✅ PR5：5 处 PR5-deferred external import + 2 处临时 re-export 全部 inline；删除 11 个 legacy 文件（~2189 LoC）—— `shared/logic/farm/` 目录不复存在；`shared/actions/helpers/animal-zones.ts` 不复存在；`shared/logic/scoring*.ts` 不复存在
> - ✅ DoD D1-D9 全过：D1-D6 ✅；D7 zero regression（slow 33 fail / 1690 pass，比 PR4 baseline 少 1 fail）；D8 effect 行数变化 -0.16%（drop 主体在 PR2/PR3，PR5 仅清 legacy）；D9 强制 green 子集全绿
> - **基线**：fast 326 passed / 0 fail；tsc 0 error；lint 0 error / 316 warnings；bundle within budget
>
> **架构成果**：`shared/domain/` 成为 farm/animal/scoring 的唯一权威；effects/cards/session 不再 reach into `logic/farm/*` / `helpers/animal-zones` / `logic/scoring*`；ESLint guard 保护 domain 不依赖 engine/session/effects。

#### S4b：节点充血 + Engine 公开 API 收敛（并行推进，独立 worktree）

- 节点充血（学 BGA `AbstractNode`）—— `shared/engine/nodes/*.ts` 每节点一文件，行为下沉
- Engine public 收敛到 6 / `flowNodeCounter` 整理 / 序列化测试覆盖
- 专项 DoD：engine.ts 主文件 ≤ 600 行；节点 cursor round-trip 测试覆盖每节点

#### Sprint S4 整体 DoD

- ✅ S4a：`shared/logic/farm/` + `shared/actions/helpers/animal-zones.ts` + `shared/logic/scoring*.ts` 目录/文件不复存在
- 行动层 effect 平均行数下降 ≥ 30%（注：S4a PR2/PR3 已完成主要 drop；PR5 仅清 legacy；最终对比 pre-S4a `main` 基线衡量）
- engine.ts 主文件 ≤ 600 行（S4b 负责）

### Sprint S5：RoomManager 拆 connection/persistence

- 拆 `server/connection/` + `server/game/persistence/`
- 引入 in-memory persistence adapter 给测试用
- 专项 DoD：`room-manager.ts` 不复存在，三个新目录承接职责

### Sprint S6：物理分层（contract / cards-display / client/sandbox / ESLint 边界）

纯搬迁，零行为变化：

- 创建 `shared/contract/`：迁入当前 `shared/game/types.ts` + `shared/protocol/*` + 部分 `shared/game/` record
- 拆 `shared/cards/*.ts` → `shared/cards-display/*.ts`（display 字段）+ `shared/cards/*.ts`（impl 部分保留）
- 创建 `client/sandbox/` 目录骨架，把工坊 hot-seat 改成走这个入口（动态 import `shared/session/...`）
- 配 ESLint：主路径白名单 [A] only，sandbox 子目录全开
- 验证 `pnpm run build` 产出两个 chunk：`client-app.bundle` + `client-sandbox.bundle`
- 专项 DoD：
  - `shared/game/` `shared/logic/` 目录不复存在
  - 主路径 ESLint violation 为 0
  - 主 bundle 不含 `shared/session/` `shared/engine/` `shared/actions/` `shared/cards/` impl
  - 「强制 green 子集」零回归（行为零变化）

### Sprint S7：卡牌效果测试回归

解除整个重构期间累积的 skip：

- 走完 `docs/skip-tracker.md` 列出的所有 skip 卡牌
- 每张卡按现行规则 codemod 调用方式（`confirmXxx` → `resolveChoice + payload`）
- 卡牌实际行为退化（不是测试 codemod 出问题，是真规则坏了）记录到 `docs/card_progress.md` §5（刻意不同）或修复
- 专项 DoD：`skip-tracker.md` 清空；254 个卡牌效果 session 测试全绿；fast + slow project 都全绿

---

## 15bis. 剩余 sprint 并行执行方案

S1–S3 已串行完成。S4–S7 之间存在两组**互不重叠的修改面**，双 owner 配置下可显著缩短总工期。

### 15bis.1 依赖图

```text
S4 (domain + 节点充血) ───────┐
   touch: shared/logic/farm/  │ 删 logic/farm 是 S6 物理分层的前提
          shared/engine/      │
          shared/actions/     │
                              ▼
                          S6 (物理分层 contract / cards-display / sandbox)
                              touch: 全 shared/* + client/sandbox/
                              │
                              ▼
                          S7 后半段 (behavior-regression skip 解锁)

S5 (server room-manager 拆) ──┐ 与 S4 / S6 完全无重叠（server-only）
   touch: server/connection/  │ 任意时点可插入
          server/game/        │
          server/persistence/ │
                              ▼ 
                          独立合并

S7 前半段 (shape-mismatch skip codemod) ── S4 完成后即可启动
                              ▲ 与 S6 cards-display 拆分有目录冲突
                              │ 需协调 batch（每个 deck 合一批 S6 → S7 跟 codemod）
```

### 15bis.2 三个并行窗口

**窗口 1：S4 ‖ S5（最优 — 零物理重叠）**

| 维度 | S4 | S5 |
|---|---|---|
| 主要 touch 目录 | `shared/logic/`、`shared/engine/`、`shared/actions/effects/` | `server/room-manager.ts`、`server/connection/`、`server/game/persistence/` |
| 估算文件数 | ~80 | ~10 |
| 估算行数变化 | 净 -1500（删 > 增） | 净 +200（重排 + in-memory adapter） |
| 互相依赖 | 无 | 无 |
| 摩擦点 | 极小（仅 server/game/authoritative-session.ts 可能因 GameSession imports 重排冲突，rebase 简单） | 同左 |

可在两个 worktree 同步推进，2 周内同时收口。

**窗口 2：S6 ‖ S7-shape**

| 维度 | S6 | S7 前半段 |
|---|---|---|
| 主要 touch 目录 | `shared/cards/*` → 拆 `shared/cards-display/*`（每张卡 +1 file，含 824 张内置卡） | `server/__tests__/{A,B,C,D,E}NN_*-session.test.ts` 中 shape-mismatch 类 skip（~150 张） |
| 摩擦点 | **会撞 `shared/cards/*` 目录**：S6 拆 display vs impl 时，S7 同期改卡牌测试的 import 路径 |
| 缓解 | 按 deck 分批：S6 每合一个 deck 的 cards-display 拆出，S7 跟着 codemod 该 deck 的测试。共 5 deck（A/B/C/D/E），分 5 个 batch 走 |
| 估算节省 | 约 0.5 周 |

**窗口 3：S7 后半段（无并行）**

解 "behavior-regression" 类 skip 需要稳定的 contract 边界（即 S6 完成）。串行执行。

### 15bis.3 节奏建议

**双 owner 路径（推荐）**：

| 周 | Owner A | Owner B |
|---|---|---|
| 1–2 | **S4** domain 聚合 + 节点充血 | **S5** server 三层拆分 |
| 3 | **S6** 启动（S4 已合 / cards-display 按 deck 拆） | S5 收尾 + S6 review |
| 4 | S6 收口 | **S7 前半段** shape-mismatch codemod（按 deck batch 跟 S6） |
| 5 | S7 后半段 behavior-regression 修复 | — |

**总周数：约 5 周**（vs 单线 7 周，节省 2 周）。

**单 owner 路径**：

按 §15 顺序串行 S4 → S5 → S6 → S7，5–7 周。**S5 可在 S4 PR review 等待期"插空"做**——它 server-only 且独立，不阻塞 S4 主线。

### 15bis.4 风险与协调

| 风险 | 缓解 |
|---|---|
| S4 + S5 并行：两边都可能动 `server/game/authoritative-session.ts` 的 GameSession imports | S5 不动行为，仅重排目录；rebase 简单。约定 S5 owner 先 freeze authoritative-session import 形态后再开 PR |
| S6 + S7 cards 目录撞工 | 按 deck 切 batch（A→B→C→D→E）；每 deck S6 先合，S7 当周跟。避免 S6 + S7 同 deck 同时改 |
| S7 真规则退化超预期 | 退化登记到 `docs/card_progress.md` §2.5（刻意不同）或修复。预留缓冲：单 owner 路径 +1 周，双 owner 路径 +0.5 周 |
| 双 owner PR review 互相阻塞 | S4 / S5 PR 拆细（每周 ≥ 2 PR），review 队列不超过 2 个。S6 因 churn 大，每个 deck 一 PR |

### 15bis.5 决策

- 当前若有两个 owner 可分配 → 走双 owner 路径，**先开 S4 ‖ S5**；S5 worktree 已做过 server-only 改动（S2 拆 GameSession 时验证过），并行风险低
- 若单 owner → 仍按 §15 顺序，**S5 插空策略**保持机会（S4 PR 等 review 时启动）

---

## 16. 不在范围

- 不引入"领域 patch / 增量同步"协议（性能瓶颈出现后再说，仍以全量快照为基线）
- 不改 hook 注册机制（`shared/actions/hooks.ts` 设计已被 bad-smell 审计验证）
- 不改卡牌闭环原则（卡牌行为仍在卡牌文件内）
- 不改 i18n / workshop / 自定义代码沙盒
- 不改 ESLint 三层边界
- 不引入新的传输层（HTTP 仍为辅助通道）

---

## 17. 决策溯源（与 ADR 关联）

| 决策 | ADR | 不重新讨论的原因 |
|---|---|---|
| 消除 PendingAction union | `0001-eliminate-pending-action-union.md` | ✅ S1 / S2 已落地：union 完全删除（Task 13.6），8 kind sum type 上线 |
| Engine cursor 进 SerializedGameState (D-a) | `0002-engine-cursor-in-serialized-state.md` | ✅ S1 已落地：`Engine.snapshotCursor()` + `SerializedGameState.engineStack` |
| 节点充血（学 BGA AbstractNode） | `0003-rich-node-vs-anemic-node.md`（待写） | 节点贫血是 engine.ts 1828 行单体的根因（S4 同期推进） |
| 引入 `shared/domain/` 聚合层 | `0004-domain-aggregate-layer.md`（待写） | 行动层超 BGA 3300 行的反向来源（S4 范围） |
| 不照搬 BGA 充血 Action | `0005-action-as-data-not-class.md`（待写） | 自定义卡 DSL 要求 Action 数据化 |
| Payment 收口为单深 module | [`0006-payment-solver-deep-module.md`](./adr/0006-payment-solver-deep-module.md)（Accepted 2026-05-04） | ✅ S3 已落地：`PaymentSolver` namespace 6 成员，`payment/internal/` 深模块 |

ADR 在 sprint 落地时同步建立；本文档在每个 sprint 完成后回流更新。
