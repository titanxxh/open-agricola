# shared/engine/ — 节点树引擎

[English](engine.md) | [中文](engine_zh.md)

> 本文件是中文翻译镜像；[engine.md](engine.md) 是唯一权威版本。

节点树是唯一的状态机：引擎游标决定等待什么输入，不存在 `PendingAction` union。

## 文件

```text
shared/engine/
├── engine.ts              Engine 类
├── engine-stack.ts        EngineStack 子流程帧栈
├── engine-resolve.ts      resolveChoice 路径
├── engine-proceed.ts      step 与推进路径
├── dispatcher.ts          Hook 与 listener 分发
├── tree.ts                节点树构造
├── registry.ts            ActionDefinition 注册与查找
├── log-store.ts           缓冲日志
├── types.ts               EngineContext、EngineFrame、EngineStackCursor
└── nodes/
    ├── base.ts            BaseNode 与共享 metadata / pending 状态
    ├── action-node.ts     原子行动 leaf
    ├── sequence-node.ts
    ├── parallel-node.ts
    ├── xor-node.ts
    └── or-node.ts
```

## 节点类型

- 领域 `ActionFlow` 遵循参考实现的节点代数，只暴露 `leaf`、`seq`、`parallel`、`xor`、`or`。`optional`、`promptKey`、`sourceCard`、`choiceLabel*` 与 `targetPlayerId` 是 metadata，不是节点类型；运行时专用节点从不进入卡牌 flow。
- 运行时树有五种具体节点：`ActionNode`、`SequenceNode`、`ParallelNode`、`XorNode`、`OrNode`。跨玩家归属、可选状态、触发选择、listener 激活与 pending 状态通过节点 metadata、内部 leaf、pending envelope 和帧状态表达，不用包装节点。
- `targetPlayerId` 编译为目标子树上的 `ownerPlayerId`；显式指定的子节点 owner 优先。所有动态插入路径都携带当前有效 owner，游标持久化 owner，不从 `currentPlayerIndex` 推断。`injectBeforeFlows()` 只排出当前玩家拥有的节点，其他节点交回 Session driver。
- `XorNode` 保存 `selectedChildId` 并只走完该分支；被 OR/XOR 直接选中的 leaf 保存 `selectedBranchChoice`。该 leaf 未发出自身请求就完成时，其尾随反应以此为 `choice`；发出自身请求的 leaf 以提交的值完成。被选中的序列分支的第一个 leaf 在选择时执行并返回 flow 时，该 flow 插在 leaf 之后、分支后续兄弟节点之前；它的尾随反应仍排在 XOR 之后。`ParallelNode(mode='trigger-select')` 实现反应选择（[Listener 纯度](hooks_zh.md#listener-纯度)）；`resolveAfterSelection` 让它只选一次。
- 共享 metadata：`ownerPlayerId`；`optional` / `optionalActive` / `optionalPromptKey`（XOR 与 OR 保留直接的 `__skip__`）；`mandatory`，`afterHostCommit` 子节点与动态返回的 flow 递归继承，之后无法执行的 leaf 返回 mandatory-blocked，Session 进入只能撤销的 `engine-blocked`；`selectedChildId`；`pending: PendingEnvelope | null`。
- leaf 返回的每个请求都会打开 pending envelope，其选项来自 `interactionRequestChoices()`；提交后才执行完成反应。`InteractionRequest` 是协议形状，不是节点。
- `before` 反应 leaf 可返回按命名空间和来源组织的 `beforeHostContributions`；引擎通过 `continuationParentHostNodeId` 把它们写入尚未开始的宿主 `actionContext`。没有有效 before 宿主的贡献会失败，同一来源重复贡献时替换原条目。它们随宿主经历 pending、恢复与撤销，嵌套或另行授予的行动不继承它们。

## Engine 公开 API

`Engine` 向 `GameCore` 暴露一个小 interface：

- `step(ctx)`：推进到下一个未解决的节点，遇到 pending 输入停止。
- `resolveChoice(value, ctx, payload?)`：提供玩家输入并继续。
- `peekPendingEnvelope()`：当前 `PendingEnvelope`，或 null。
- `peekPendingHost()`：承载该 envelope 的节点，用于查找 `sourceCard`、`actionContext` 与 owner。
- `injectBeforeFlows(flows, ctx?)`：插入 hook flow。
- `snapshot()` / `restore(snapshot)`：序列化与重建节点树，包括节点状态、pending envelope、owner、可选与触发 metadata。
- `hasPendingChoiceCompositeAncestor()`：供 anytime 处理判断是否处于分支祖先中。
- `describe()` / `describeFlow()`：纯描述（[ActionChoiceOption 与预览](contract_zh.md#actionchoiceoption-与预览)）。

`GameCore.engineDeps()` 与每次引擎 `proceed` 共用 `syncDynamicActionSpaces()`，为执行目录中缺少定义的棋盘格补注册；卡牌只通过公开机制创建格子，从不触碰 Session 注册表。缺少定义是内部不变量错误，会回滚权威命令。

测试：`shared/engine/__tests__/{engine,engine-flow,tree-selected-branch,restore-regressions,optional-node-context,resolve-choice-continuations}.test.ts`。

## EngineStack

`engine-stack.ts` 中的 `EngineStack` 持有 `EngineFrame[]`：

```ts
type EngineFrame = {
  engine: Engine
  source: SubFlowReason
  ownerPlayerIndex: number
  spaceId?: string
  stageResume?: StageResume
  reason: SubFlowReason
}
```

- API 为 `push`、`pop`、`current`、`depth`、`peekPendingEnvelope`、`peekPendingHost` 与 `toCursor`。`push` / `pop` 创建与离开嵌套 frame（子流程与确认）；hook 与 anytime flow 通过 `Engine.injectBeforeFlows()` 进入当前 frame，农场行动的 `farm-select` 请求作为 pending envelope 留在当前 frame 的行动节点上。任何代码都不直接修改 `pending`。
- 喂食帧在 `feedingResume` 中保留付款续行；反应选择和动物整理期间它与同一帧一起恢复，只有完整 flow 结束后才消费。
- `EngineStackCursor` 序列化到 `PersistedSessionSnapshot.sessionCursor.engineStackCursor`；公开与 Replay 的 `SerializedGameState.engineStack` 保持为空。
- 撤销历史保存整个栈的独立游标（每一帧、帧身份、原因、阶段续行、延迟切换与 resolve 边界）；`undoStep()` / `undoAction()` 重建它而不推进。
- `SubFlowKind` 为 `choice`、`animal-reorg`、`confirm-next-player`、`confirm-player-switch`、`feed`、`farm-select`、`selection` 或 `card-draft`。`post-reap-anytime` 等合成窗口同时出现在 `SubFlowReason` 与 `PendingSyntheticKind`。

测试：`shared/engine/__tests__/engine-stack.test.ts`。

