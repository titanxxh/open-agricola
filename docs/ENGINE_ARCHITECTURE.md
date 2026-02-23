# Open Agricola 引擎架构总结

## 目标与边界

- 目标：以回合与行动卡为核心驱动，确保行动执行、资源变化、收获结算与日志一致
- 边界：实现现代端 Engine 树核心架构与基础模块；明确不实现 ABCDE 扩展中的卡牌逻辑与监听器细节，仅保留可扩展的 Hook 接口

## 整体结构图

```
Engine
├─ EngineTree
│  ├─ Node (抽象)
│  │  ├─ ActionNode
│  │  ├─ ChoiceNode
│  │  ├─ SequenceNode
│  │  └─ ParallelNode
│  └─ Cursor/Resolver
├─ ActionRegistry
├─ HookDispatcher
└─ Snapshot/Log
```

注：结构图描述的是概念模型，目的是定义模块边界与职责分层。

## 核心模块与职责

- Engine：驱动树推进、状态跳转、错误处理与日志落盘
- EngineTree：维护节点结构与解析游标，提供下一个待执行节点
- Node：统一节点协议，定义状态与执行接口
- ActionRegistry：actionId → ActionDefinition 映射
- HookDispatcher：执行 before/after/computeArgs/isDoable 等阶段
- FlowBuilder：将 ActionDefinition.flow 转换为可执行节点树
- Snapshot/Log：回合快照与行动日志
- PersistenceAdapter：持久化与状态还原入口
- Scoring：计分计算与计分板展示
- CardCatalog：编号卡牌数据目录（A/B/C/D/E）
- MajorCatalog：大改良卡牌定义与描述
- CardBase：Occupation / MinorImprovement 基础模型
- CardView：前端优先使用 i18n 的 name/desc 渲染
- I18nCatalog：卡牌名称与描述中文翻译
- DevControls：开发者模式重开与种子输入

## 核心节点类与接口

```
interface EngineNode {
  id: string
  type: 'action' | 'choice' | 'sequence' | 'parallel'
  getState(): 'ready' | 'resolved' | 'blocked'
  getArgs(): Record<string, unknown>
  resolve(result?: unknown): void
  isDoable(ctx: ActionExecutionContext): boolean
}

class ActionNode implements EngineNode {
  actionId: string
  execute(ctx: ActionExecutionContext): ActionExecutionResult
}

class ChoiceNode implements EngineNode {
  choices: ActionChoiceOption[]
  resolve(choice: string): void
}

class SequenceNode implements EngineNode {
  children: EngineNode[]
}

class ParallelNode implements EngineNode {
  children: EngineNode[]
  resolve(policy: 'all' | 'any'): void
}
```

注：接口定义为文档层的契约描述，不要求与 TypeScript 运行时一一对应。

## 数据模型与执行上下文

- GameState：回合、当前玩家索引、行动空间列表、日志、行动顺序、可用改良、是否结束
- PlayerState：资源、房间、家庭规模、可用工人、地块、围栏、改良、起始玩家
- ActionSpace：ActionDefinition + 空间资源 + 占用者
- ActionExecutionContext：state / player / space

核心定义参考：
- [types.ts](../src/game/types.ts)

## 主要工作流程时序图

```
UI → Engine.proceed
  → EngineTree.getNextNode
  → HookDispatcher.before
  → ActionNode.execute
  → HookDispatcher.during
  → ChoiceNode? (等待输入)
  → HookDispatcher.immediatelyAfter
  → Log/Snapshot
  → HookDispatcher.after
  → EngineTree.proceed
```

## 关键算法伪代码

### Engine 推进

```
function proceed():
  node = tree.nextUnresolved()
  if node == null:
    confirmTurn()
    return
  if !node.isDoable(ctx):
    markBlocked(node)
    return
  dispatchHooks(before)
  result = node.execute(ctx)
  dispatchHooks(during)
  if result.type == 'choice':
    savePendingChoice(result)
    dispatchHooks(computeArgs)
    return
  dispatchHooks(immediatelyAfter)
  appendLog()
  dispatchHooks(after)
  tree.resolve(node)
  proceed()
```

### Flow 构建

```
function buildFlowNode(flow):
  if flow.type == 'leaf':
    return ActionNode(flow.actionId)
  children = flow.children.map(buildFlowNode)
  if flow.type == 'seq':
    return SequenceNode(children)
  if flow.type == 'parallel':
    return ParallelNode(children)
  if flow.type == 'xor':
    return XorNode(children)
  return OrNode(children)
```

### Hook 过滤与排序

```
function runHooks(context):
  candidates = hooks.filter(h => match(actionId, phase))
  ordered = sortBy(order, id)
  for each hook in ordered:
    hook.handle(context)
```

### Replace 与 Doable

```
function applyComputeReplace():
  for each hook in orderedHooks:
    if hook returns actionId:
      actionId = result.actionId
  return actionId

function applyIsDoable(initial):
  doable = initial
  for each hook in orderedHooks:
    if hook returns doable:
      doable = result.doable
  return doable
```

## 模块化设计与接入点

- 行动注册与空间构建：[actions/index.ts](../src/actions/index.ts)
- Hook 架构入口：[hooks.ts](../src/actions/hooks.ts)
- 执行编排与 UI 交互：[App.tsx](../src/App.tsx)
- 持久化与还原：App.tsx 内的 persist/normalize 逻辑

## 性能指标与约束条件

- 单次行动执行：O(H + R)（H 为匹配 Hook 数量，R 为资源变更数量）
- EngineTree 查找下一节点：目标 O(1)~O(logN)
- 日志与快照：每回合最多 1 个快照，行动日志线性增长
- 并行节点：默认以小规模分支为前提，避免指数级状态膨胀
- 目标：本地单局 14 回合内无明显卡顿（<16ms 关键交互）

## 排除项

- 明确不实现 ABCDE 扩展中的具体卡牌逻辑
- 不实现 BGA PHP Engine 的完整树结构与卡牌监听器细节

## 与现有架构的兼容性

- ActionDefinition 与 ActionSpace 保持现有定义
- HookDispatcher 复用 actions/hooks.ts
- App.tsx 仍作为前端编排入口，Engine 作为抽象层补齐执行链路
- Scoring 由 UI 直接基于 GameState 计算，游戏结束与手动入口弹出计分板
