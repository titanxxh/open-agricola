# Engine Redesign — S2/S3/S4 跨 Sprint 契约

- **日期：** 2026-05-03
- **覆盖：** Sprint S2 / S3 / S4（见 `docs/ENGINE_NEW_ARCHITECTURE.md` §15）
- **角色：** 三个 sprint 共同 reference 的接口契约文档；锁定跨 sprint 必须共识的接口形状与红线，不复制 §15 / §5–§10 的设计正文
- **不在范围：** sprint 内部任务清单、测试 skip 策略（沿用 §13.1）、物理目录搬迁（S6）、单卡牌实现细节
- **状态颜色图例：**
  - **[L]** 锁定 — 本文档之后不应在 sprint 内部 brainstorm 推翻
  - **[S]** 形状已定 — 接口形状定了，字段细节 sprint 启动时再 grill
  - **[O]** 启动时定 — 本次刻意不锁，sprint 启动时按 normal flow brainstorm

---

## 0. 摘要

S2/S3/S4 三个 sprint 的耦合点集中在三组接口：

1. **InteractionRequest sum type**（S2 终态）—— 决定 protocol、resolveChoice、leaf action 三方契约
2. **PaymentSolver 三 public 接口**（S3 终态）—— 决定行动层付款唯一入口
3. **`shared/domain/` 暴露面**（S4 终态）—— 决定行动层 effect 写法

S2 必须先于 S3/S4 落地（S3/S4 都依赖 InteractionRequest 已收敛）；S3 与 S4 之间无强依赖，可并行。

每条接口下面给三类信息：**接口形状 / 迁移映射 / 红线**。**不给完整 TS 签名**——sprint 启动时再依据本契约形状起草（颗粒度由 brainstorm 用户裁定）。

---

## 1. InteractionRequest Sum Type（S2 终态）

### 1.1 当前状态（2026-05-03 快照）

`shared/game/types.ts:656` 定义 `InteractionState`，sum type 用 `stateId` 区分，共 8 种：

```
idle | choice | farmSelect | selection | animalReorg
   | harvestFeed | confirmNextPlayer | confirmPlayerSwitch
```

并行存在的另一套机制：

- `PendingAction` union（`shared/game/types.ts:555`）—— S1 已部分消除（reorganize 收口），S2 完成消除
- `promptKey` 字符串（多处）—— S2 由结构化字段取代
- `InteractionCommand` 多种命令（`commitFarm` / `commitSelection` / `commitChoice` / `confirmFeed` / `confirmAnimalReorg` 等）

### 1.2 终态：8 种 kind 一览 [L]

S2 完成后 `InteractionRequest` 的 kind 集合**锁定**为：

| kind | 来源 stateId | 触发场景 |
|---|---|---|
| `choice` | `choice` | 一般选项选一 |
| `animal-reorg` | `animalReorg` | 动物重排（S1 已 prototype） |
| `confirm-next-player` | `confirmNextPlayer` | 阶段切玩家前确认 |
| `confirm-player-switch` | `confirmPlayerSwitch` | sub-flow 切玩家前确认 |
| `farm-select` | `farmSelect` | plow / sow / fence / room / stable 五种 farmType |
| `selection` | `selection` | farm-position / occupation-hand 两种 selectionType |
| `feed` | `harvestFeed` | 收获喂食（S2 推广模式） |
| `card-draft` | （新增；当前 `PendingAction.cardDraft` 仅作"挂牌"，UI 走专用 `DraftOverlay`） | simultaneous 卡牌轮抽；S2 把现有 `shared/draft/` 153 行 module 包装到 InteractionRequest（不引入 BGA 轮抽语义） |

**红线**：

- 本次 brainstorm 之后 **不再增加新 kind**；新增 kind 必须开新一轮 brainstorm 并更新本契约
- 卡牌特殊效果**不**通过新增 kind 实现，应复用现有 kind + payload
- `idle / wait / gameover` 不再属于 kind 维度，归入 protocol 层 `InteractionState.stateId`（见 §1.4）

### 1.3 各 kind 的 payload [S]

按 Q-2a 选 (iii)，仅给字段名 + 类型粗描述。具体 TS interface 留 sprint 启动时定。

- **`choice`**：`options: ActionChoiceOption[]`、`spaceId`、`playerIndex`、可选 `costOverride`、可选 `sourceCard` —— 沿用当前 `InteractionState.choice` 形状
- **`animal-reorg`**：`zones: InteractionAnimalReorgZone[]` —— S1 已 prototype，形状继承
- **`confirm-next-player`**：`nextPlayerIndex` —— 直接对应当前 `InteractionState`
- **`confirm-player-switch`**：`fromPlayerIndex`、`toPlayerIndex` —— 直接对应
- **`farm-select`**：`farm: { farmType: 'plow' | 'sow' | 'fence' | 'room' | 'stable'; ... }` + `options` + 标准上下文字段 —— 取代当前 `farmSelect` + `buildPlowInteraction` / `buildSowInteraction` / `buildFenceInteraction` / `buildFarmInteraction`
- **`selection`**：`selection: { selectionType: 'farm-position' | 'occupation-hand'; ... }` + `options` + 标准上下文字段 —— 取代当前 `selection` + `buildSelectionInteraction`
- **`feed`**：`remaining: number`、`foodUsed: number`、可选 `feedQueue: { index; remaining; foodUsed }[]` —— 来自 `harvestFeed`
- **`card-draft`**：沿用现有 `shared/draft/` 的 simultaneous 模型（**不引入 BGA 风格轮抽**）。字段直接来自 `DraftState`：`mode: 'simultaneous'`、`round`、`totalRounds`、`poolSize`、`seatOrder`、`pools: Record<pid, { occ; minor }>`、`pendingPicks`、`kept`（per-connection 视角化由后续 issue #7 处理，本次不做） —— 当前 `shared/draft/draft-manager.ts` 153 行纯函数 module 不动

**易混淆 kind 边界判定 [L]**

`choice` / `selection` / `farm-select` 三者容易混淆。S2 落地时按以下判定，**不得**让相同语义跨 kind 实现：

| 维度 | `choice` | `selection` | `farm-select` |
|---|---|---|---|
| 本质语义 | 走哪条**分支** | 从池子里挑出**子集** | 在农场上执行**操作 + 目标位置** |
| 选几个 | 恰好 1 | `min..max` 范围（多选） | 取决于 farmType（plow=1 格 / fence=多格 / room=1+ 格 ...） |
| payload 主字段 | `options: ActionChoiceOption[]` | `selection: { kind: 'farm-position' \| 'occupation-hand'; selectableXxx[]; min/max }` | `farm: { farmType: 'plow' \| 'sow' \| 'fence' \| 'room' \| 'stable'; ...specific }` |
| 选项预生成？ | 是（options 在 request 里） | 是（selectableXxx 在 request 里） | 否（合法位置在 client 由 farm validators 派生） |
| 典型用例 | "取 3 木 vs 取 1 木 + 1 砖"、"是 / 否" 分支 | 选 N 张职业牌弃掉、选 N 个农场格子 sow | 第一张 plow、围一圈栅栏、盖房间 |

**判定规则**：

1. 如果是从**预先列举**的离散方案里挑 1 个 → `choice`
2. 如果是从**可枚举元素集**里挑 ≥ 1 个，且元素是数据（非农场操作）→ `selection`
3. 如果**结果是改农场结构**（plow / sow / fence / room / stable）→ `farm-select`
4. 卡牌效果若需要"在农场上选格子做某事"——大多数场景应是 `farm-select` 而非 `selection`（除非 select 出来的格子只是用作引用、不改变结构）

**字段标准化要求 [L]**：

- 所有 kind 必须有 `kind` discriminator 字段
- 共享上下文字段名统一：`playerIndex`、`spaceId`（适用时）、`anytimeActions`、`allowedCommands`
- payload 字段**不得**用 `Record<string, unknown>` 承载结构化数据；现有 `promptParams: Record<string, unknown>` 需在 S2 内拆成具名字段或下沉到 `promptKey` 元数据

### 1.4 protocol 层 `InteractionState` 简化 [L]

- stateId 8 → **3**：`idle` / `wait` / `gameover`
- `request: InteractionRequest` 单字段承载所有 kind
- `pending: PendingAction` 字段从 `GameSyncPayload` 删除（`shared/protocol/game.ts:42`）

### 1.5 `resolveChoice` 入参规范 [L]

- `ClientCommand` 选择类命令收敛为单一 `resolveChoice`，删除 `commitFarm` / `commitSelection` / `commitChoice` / `confirmFeed` / `confirmAnimalReorg`
- 入参 `payload` 必须是结构化字段；**禁止** `choice.split(',')` 字符串拼接（当前 `selection.ts` 仍在用，S2 内整改）
- payload 的形状由对应 kind 决定（discriminated union），不混合 kind

### 1.6 与 `ChoiceNode` 的兼容期 [L]

- S1 已把 engine 内部 `ChoiceNode` 类型改名为 `InteractionNode`（type discriminator 从 `'choice'` 改 `'interaction'`）
- S2 内 `ChoiceNode` 类型在代码中**完全不复存在**（§15 S2 专项 DoD）
- S2 内 `ActionExecutionResult.type` 集合：`'request'` 单一 kind 替代 `'choice' | 'animalReorg'`

### 1.7 向后扩展规则 [L]

新增 kind 的硬要求：

1. 必须先发起 brainstorm，更新本契约文档（不得直接在 sprint 内偷加）
2. 必须有 ≥ 2 个真实使用点（避免 over-fit 单卡）
3. 不得污染 `payload: Record<string, unknown>`；必须给具名字段

新增 payload 字段的要求：

1. 仅在对应 kind 的 union member 上加（不全局加）
2. 必须配 schema 测试

### 1.8 等价 ADR 占位

- **ADR-0001：消除 PendingAction union** —— 已合入；本 sprint 是其完整落地。决议要点：节点状态机即真相，`pending` 是冗余；ChoiceNode→InteractionNode 是命名收敛而非新概念

---

## 2. PaymentSolver 三 public 接口（S3 终态）

### 2.1 当前状态（2026-05-03 快照）

| 文件 | 行数 | export 数 |
|---|---|---|
| `shared/actions/helpers/payment.ts` | 900 | 16 |
| `shared/actions/helpers/pay-helpers.ts` | 647 | 17 |
| `shared/actions/helpers/room-payment.ts` | 427 | 8 |
| 合计 | 1974 | **41** |

§1.2 P3 病灶："Payment 接口爆炸"——41 个工具袋接口对外。

调用方耦合最深：

- `shared/actions/effects/improvement.ts`（985 行）—— S3 同期瘦身 ≤ 400
- 各 effect 文件（占用、minor、major 卡牌）

### 2.2 终态：三个 public 接口 [L]

合并到 `shared/actions/payment/` 模块，**对外仅三个 public**：

```
PaymentSolver.computeOptions(state, idx, cost, ctx) → Option[]
PaymentSolver.canAfford(state, idx, cost, ctx)     → boolean
PaymentSolver.execute(state, idx, cost, choice, ctx) → state'
```

**红线**：

- 行动层付款只能调这三个；任何 effect 直接 import `pay-helpers` / `room-payment` 在 S3 完成后属于 lint error
- `computeOptions` / `canAfford` 必须共享内部计算（不重复枚举）
- `execute` 必须从 `computeOptions` 返回的 `Option[]` 里挑（`choice` 是 `Option` 的 ID 或子集），杜绝外部独立构造 payment 路径

### 2.3 `Cost` / `Option` / `PaymentChoice` 类型 [S]

- `Cost`：现有 `Partial<Resource>` 加 hook 修饰（`computeCosts` phase 已锁，沿用）
- `Option`：付款分解 + 来源 tag（资源 / 卡牌效果 / 房间转换 / hook 替换）
- `PaymentChoice`：玩家选择（option ID + 必要 disambiguation）
- 内部字段细节 [O]，sprint 启动时 grill

### 2.4 调用方迁移规则 [L]

S3 完成后：

| 调用方 | 当前调 | S3 后调 |
|---|---|---|
| `improvement.ts` | `payment.ts` + `pay-helpers.ts` + `room-payment.ts` 散件 | `PaymentSolver.*` |
| occupation effects | 同上 | `PaymentSolver.*` |
| minor improvement effects | 同上 | `PaymentSolver.*` |
| 卡牌 hook（`computeCosts`） | 不变 | 不变（hook 修饰 Cost，PaymentSolver 内部调用 hook） |

`improvement.ts` 拆分为 [S]：

- `improvement.ts`（≤ 400）—— effect 入口
- `improvement-options.ts` —— 候选构造
- `improvement-pool.ts` —— 池子管理

### 2.5 内部细节明确不对外 [L]

S3 完成后，`shared/actions/payment/` 内部的：

- 资源转换路径枚举
- 房间相关付款的特殊处理
- pay-helpers 里的辅助函数
- 现 41 export 中的非三 public 部分

——全部成为模块内部，不对外 export。`shared/actions/helpers/payment.ts` / `pay-helpers.ts` / `room-payment.ts` 三文件**删除**。

### 2.6 等价 ADR-0006 占位

- **ADR-0006：Payment 收口为单深 module** —— 决议要点：33→3 export 是 deep module 设计 + 卡牌 hook 已是唯一对外扩展点

---

## 3. `shared/domain/` 暴露面（S4 终态）

### 3.1 当前状态（2026-05-03 快照）

`shared/logic/farm/` 散件：

```
build-room-helper.ts
farm-interaction.ts
fence-validation.ts
occupation-hand-interaction.ts
plow-validation.ts
sow-validation.ts
validators.ts
```

加上 `shared/logic/farm.ts`、`shared/actions/helpers/animal-zones.ts`，构成"农场 / 动物"领域的现状散件。

§1.2 P5 病灶："缺领域聚合层 → 行动层超 BGA 3300 行"。

### 3.2 终态：四个聚合 [L]

新建 `shared/domain/`，引入四个聚合（**派生视图、不可变、无 setter**）：

| 聚合 | 职责 | 覆盖当前散件 |
|---|---|---|
| `PlayerBoard` | 玩家整体视图（farm + animals + cards 的协同） | `logic/farm.ts` 大部分 |
| `Pasture` | 牧场（围栏围出的区域）| `logic/farm/fence-validation.ts`、`actions/helpers/animal-zones.ts` 部分 |
| `Farmyard` | 农场版图（耕地、房间、栅栏等格子）| `logic/farm/build-room-helper.ts`、`plow-validation.ts`、`sow-validation.ts`、`farm-interaction.ts` |
| `AnimalZones` | 动物分区视图 | `actions/helpers/animal-zones.ts` 主体 |

### 3.3 客户端安全契约 [L]

沿用 ENGINE_NEW_ARCHITECTURE §4.3：

- `shared/domain/` **禁止** import Node API（fs / path / os 等）
- **禁止** import React / Vite-only API
- 必须可 tree-shake 进客户端 sandbox bundle
- 由 ESLint 在 S6 强制（S4 内仅口头约定 + 单元测试守门）

### 3.4 调用模式 [L]

行动层 effect 改写后：

```ts
// 之前
import { canPlow } from '../../logic/farm/plow-validation'
import { computeAnimalZones } from '../helpers/animal-zones'
canPlow(state, idx, position)
computeAnimalZones(state, idx)

// 之后
import { playerBoard } from '../../domain'
playerBoard(state, idx).farmyard.canPlow(position)
playerBoard(state, idx).animals.zones
```

**红线**：

- 行动层 effect 不再直接 import `shared/logic/farm/*`（S4 完成后该目录不复存在）
- 聚合方法必须是**派生**（输入 state，输出视图），**不持久化**到 GameState
- 不暴露 setter；状态变更仍走 `GameSession` 唯一入口

### 3.5 节点充血（S4 同期）[L]

§5.1 节点充血与 domain 聚合层一起在 S4 落地（同一 sprint，因为节点充血后会调用 domain 聚合）：

- `shared/engine/nodes/*.ts` 每节点一文件
- 行为下沉到节点（不再在 engine.ts 主文件里 switch type）
- engine.ts 主文件 ≤ 600 行（§15 S4 DoD）

### 3.6 行动层瘦身预期 [S]

- effect 平均行数下降 ≥ 30%（§15 S4 DoD）
- `shared/logic/farm/` 目录消失（§15 S4 DoD）
- 具体每个 effect 的行数指标 [O]

### 3.7 等价 ADR 占位

- **ADR-0003：节点充血 vs 节点贫血** —— 决议要点：节点贫血是 engine.ts 1828 行单体的根因
- **ADR-0004：领域聚合层** —— 决议要点：行动层超 BGA 3300 行的反向来源

---

## 4. 跨 Sprint 接口依赖图

```
S1（在跑）：reorganize 模式推广 + InteractionNode 骨架（4 kind）
              │
              ▼ S2 启动前提：S1 引入的 4 kind 已稳定
S2：InteractionNode 完整化 + Session 拆 traits
              │
              ▼
S4：shared/domain + 节点充血

S3：PaymentSolver 收口（独立 worktree，与 S1 / S2 并行）
   - 与 S1 / S2 PR 链无重合（S3 触及 actions/helpers/payment*.ts +
     actions/effects/improvement.ts；S1 / S2 触及 engine / session /
     protocol / 其他 effect）
   - PaymentSolver 不感知 InteractionRequest 8 kind 集合；effect 层
     负责 Option[] → ActionChoiceOption[] 的转换
              │
              ▼（S3 完成后的 effect 入口稳定，对 S4 改写有利但非强前置）
S5/S6/S7：room-manager 拆分 / 物理分层 / 测试回归
```

### 4.1 关键路径

- **S1 → S2** 是关键路径：S2 必须等 S1 的 4 kind 稳定
- **S2 → S4** 是关键路径：S4 改写 effect 时 InteractionRequest 形状必须已 freeze
- **S3 独立**：与 S1 / S2 / S4 均无强前置；可在任意时间启动并并行推进

### 4.2 S3 提前启动的依据（2026-05-04 决议）

之前版本把 S3 列为 S2 的强后置，重新审视后发现**三条理由都不成立**：

| 旧理由 | 重新分析 |
|---|---|
| "InteractionRequest freeze 才能定 PaymentSolver `ctx`" | `ctx` 承载的是调用语境（`actionId` / `spaceId` / `sourceCard`），与 InteractionRequest kind 集合无关 |
| "PendingAction 删除避免兼容旧 pending" | PaymentSolver 不读 `pending`；effect 层负责把 `Option[]` 塞进 pending/InteractionRequest |
| "拆 traits 才能让 PaymentSolver 不适配单 class" | 当前 `helpers/payment.ts` 已与 `game-core.ts` 解耦 |

**真实耦合点（弱）**：当 cost 有多 option 需玩家选时，effect 把 `Option[]` 转 `ActionChoiceOption[]` 塞进 `choice` request——此转换在 effect 层，对 PaymentSolver 透明。

### 4.3 并行机会

- **S3 与 S1 并行**：触及文件几乎不重合；唯一交集是若 S3 的迁移 PR 改了 effect 内部 import，可能与 S1 的 effect codemod（推广 reorganize 模式）冲突——以最小冲突为目标，S3 内 effect 修改限定在 `improvement.ts` 拆分相关
- **S3 与 S2 并行**：同理，S2 的 effect 改造主要针对 `selection.ts` / farm-related effect，与 S3 的 `improvement.ts` 无重合
- **S3 与 S4 并行**：domain 聚合层不 import payment；payment 不 import domain

---

## 5. 红线与未锁清单

| 项 | 状态 | 说明 |
|---|---|---|
| InteractionRequest 8 种 kind 集合 | **[L]** | 不再增加 |
| 各 kind discriminator 字段统一为 `kind` | **[L]** | |
| InteractionState stateId 简化为 3 个 | **[L]** | |
| ClientCommand 选择类只剩 `resolveChoice` | **[L]** | |
| `ChoiceNode` 类型完全消除 | **[L]** | |
| 各 kind payload 完整 TS interface | **[S]** | sprint 启动时定字段细节 |
| `card-draft` kind 字段清单 | **[O]** | S2 启动时按 BGA `DraftTrait` 复核 |
| PaymentSolver 三 public 接口存在 | **[L]** | |
| Cost / Option / PaymentChoice 内部字段 | **[S]** | |
| `improvement.ts` 拆三文件 | **[S]** | |
| `shared/actions/helpers/payment*.ts` 删除 | **[L]** | |
| `shared/domain/` 四个聚合存在 | **[L]** | |
| 各聚合 public 方法清单 | **[O]** | S4 启动时定 |
| 节点充血与 domain 同期落地 | **[L]** | |
| ESLint 强制 domain 客户端安全 | **[O]** | S6 强制；S4 内单元测试守门 |
| 各 effect 改写后行数指标 | **[O]** | |
| Session traits 4 个 phase mixin 边界 | **[O]** | S2 启动时按 BGA `HarvestTrait` / `DraftTrait` 边界对齐 |

---

## 6. 与 §15 / §17 的对应

本契约不重复 ENGINE_NEW_ARCHITECTURE 设计正文，对应关系：

- §1 InteractionRequest ↔ §5.1 / §6.3 / §7.1 / §7.2
- §2 PaymentSolver ↔ §9
- §3 shared/domain ↔ §10 + §5.1（节点充血）
- §4 依赖图 ↔ §15 sprint 顺序
- 等价 ADR 占位 ↔ §17（0003 / 0004 / 0006）

ADR 草稿不在本次范围；§17 列出的 ADR-0003 / 0004 / 0006 在 sprint 真正启动时按 brainstorm → ADR 流程起草。
