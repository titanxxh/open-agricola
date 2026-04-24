# 子步骤原位日志设计

日期：2026-04-24

## 背景

当前 `GameCore` 在 action 结束时维护了一组 specialized delta 补记逻辑：

- `logImprovementDelta()`
- `logOccupationDelta()`
- `logBakeBreadDelta()`

这些逻辑通过比较 `actionStartPlayerSnapshot` 与当前玩家状态的差异，反推出“刚才应该写什么日志”。它们存在的根因是：engine 目前只会在 `result.type === 'ok' && result.logKey` 时自动写 action 日志；一旦某个子步骤返回 `flow`，该步骤无法在自身完成的那个时点原位写日志，只能由 session 层在 action 结束时兜底。

这种设计的主要问题：

1. 日志语义依赖“事后猜测”，不是步骤原位记录。
2. 同一 action 内若还有后续子步骤，delta 很容易混入后续支付、bonus attribution 或 returned card。
3. `GameCore` 承担了过多具体业务日志职责，session 层知道了太多 improvement / occupation / bakeBread 的专有语义。

`D95_SiteManager` 暴露了这个问题：`log.playOccupation` 由 action 结束时的总 delta 补记，错误吞入了后续大改良的支付与 bonusSources。

## 目标

本次重构目标是：

1. specialized 业务日志不再由 `GameCore` 通过 delta 补记推断。
2. 日志在“知道自己要写什么”的那个子步骤原位产出。
3. 同一子步骤无论返回 `ok` 还是 `flow`，都能在当前步骤完成时写日志。
4. `GameCore` 仅保留通用聚合日志职责，如 `log.actionDetail` 与 leaf flush。
5. 兼容现有 `logKey/logParams` 路径，避免仓库级一次性大迁移。

本次范围覆盖：

- `improvement` / `minor improvement`
- `occupation`
- `bakeBread`

明确不在本次范围内：

- `log.actionDetail`
- leaf flush 的聚合明细机制
- 通用 `cardEffectGain` / `cardEffectPay` 等既有卡牌效果日志
- 全仓所有 action 一次性迁移到新协议

## 非目标

以下事项不是这次设计的目标：

1. 不引入独立 `LogNode` / `emit-log` DSL 节点。
2. 不重写现有 flow 表达方式。
3. 不强制所有旧 action 从 `logKey/logParams` 迁走。
4. 不调整前端 log rendering 的展示语义，除非测试证明 payload 形态必须同步改动。

## 现状总结

### Engine 现状

`shared/engine/engine.ts` 当前会在两类位置自动写 action / hook 日志：

- `result.type === 'ok' && result.logKey`
- hook `entry.logKey`

但当 action 返回 `flow` 时，engine 只会插入后续 flow，不会为当前步骤写“立即业务日志”。

### Session 现状

`shared/session/game-core.ts` 用 `actionStartPlayerSnapshot` 和 scratchpad 状态在 `finalizeActionLog()` 中补记：

- `logImprovementDelta()`
- `logOccupationDelta()`
- `logBakeBreadDelta()`

其中：

- `improvement` 已经依赖 `loggedImprovementThisAction` 避免重复；
- `occupation` 目前已有半迁移版本，payload 在 `playOccupation()` 内构造，但仍借助 `extraData.occupationLog` 由 `GameCore` 转落；
- `bakeBread` 仍完全依赖 delta 推断。

## 方案概述

### 核心思想

把“子步骤即时日志”升级为 engine 的正式能力。任何 action 或 hook 只要知道“此刻应写一条业务日志”，都可以返回一组 immediate logs；engine 在当前 leaf resolve 的那个时点立刻写入这些日志，然后再继续跑 `immediatelyAfter/after` 与 follow-up flow。

### 为什么选择这个方案

相比“继续在 session 层转发 `extraData.xxxLog`”，这个方案更符合“原位产出”的要求，也避免新的 ad-hoc payload 通道继续扩散。

相比“把日志也建模成 flow 节点”，这个方案侵入更小，不会把现有 action DSL 和测试体系整体推翻。

## 协议设计

### 1. ActionExecutionResult 扩展

在 `ActionExecutionResult` 的 `ok` 与 `flow` 分支上新增可选字段：

- `immediateLogs?: Array<{ key: string; params?: Record<string, unknown> }>`

语义：

- 表示“当前步骤已经完成了一条业务事件，这些日志应在当前步骤完成时立即落库”
- 对 `ok` 和 `flow` 都有效
- `player` 字段仍由 engine append 时统一注入

保留现有字段：

- `logKey`
- `logParams`
- `extraData`

原因：兼容旧 action，不把本次改造成 repo-wide break change。

### 2. Hook result 扩展

在 hook 的 action result entry 上新增同样的 `immediateLogs` 通道。

语义与 action 一致：

- listener 若要在当前阶段立即产生日志，可直接返回
- engine 在消费 hook result 时统一处理

### 3. Engine 内部归一化

engine 新增一个内部归一化逻辑：

1. 如果旧字段 `logKey/logParams` 存在，转换成一条 immediate log
2. 如果 `immediateLogs` 存在，直接并入
3. 统一 append

这样可以保证：

- 旧 action 不用改也能工作
- 新 action 可以只写 `immediateLogs`
- engine 内部的日志消费路径只有一套

## 时序设计

### Action 结果日志时序

当 action 执行得到 `result` 后，engine 按如下顺序处理：

1. 归一化并 append `result` 自带的 immediate logs
2. 执行 `immediatelyAfter`
3. 执行 `after`
4. 消费 hook 返回的 immediate logs
5. 插入 hook flow / follow-up flow

这一定义确保 action 本身的日志先于其 follow-up flow 出现。

对于本次目标场景，关键效果如下：

- `playOccupation` 日志出现在 D95 送出的 `improvement-any` 之前
- `playImprovement` 日志出现在该改良的 `onBuy` follow-up flow 之前
- `bakeBread` 日志出现在烤面包步骤完成时，而不是 action 收尾时

### Hook 日志时序

hook 产生日志的时序保持与当前 hook 生命周期一致：

- action immediate logs 先落
- hook immediate logs 随各自 phase 结果落

本次重构不改变 hook phase 顺序，只改变日志返回协议。

## 迁移设计

### A. improvement

`finalizeMajorImprovementPurchase()` / `finalizeMinorImprovementPurchase()` 改为：

1. 完成支付、returned card 处理、玩家区落牌
2. 立即构造 `log.playImprovement` / `log.playMinorImprovement`
3. 无论最终返回 `ok` 还是 `flow`，都把该日志放入 `immediateLogs`
4. 继续保留 `extraData.improvementPayment`，供后续逻辑和测试使用

重构后，“购买改良”与“该改良 onBuy 继续触发后续 flow”是两件事：

- 购买步骤负责日志
- onBuy flow 只负责后续效果

### B. occupation

`playOccupation()` 已经能在支付成功后构造 payload。本次改为：

1. 删除 `extraData.occupationLog`
2. 普通 `ok` 路径直接返回 `immediateLogs`
3. 返回 `flow` 时同样携带 `immediateLogs`

`GameCore.emitActionResultExtraLogs()` 将被删除。

### C. bakeBread

烤面包的实际 leaf/action 在执行成功时，直接生成：

- `log.bakeBread`

payload 包含：

- `count`
- `food`

不再依赖 `GameCore.logBakeBreadDelta()` 从资源前后差异猜测。

## Session 层收缩

### 删除的 specialized delta 逻辑

迁移完成后，从 `GameCore` 中移除：

- `logImprovementDelta()`
- `logOccupationDelta()`
- `logBakeBreadDelta()`
- `emitActionResultExtraLogs()`

以及与其强绑定的 specialized 状态位：

- `loggedImprovementThisAction`
- `loggedOccupationThisAction`
- `loggedBakeBreadThisAction`

若其中某个标志仍被 `log.actionDetail` 的聚合去重需要，则仅保留其聚合用途，不再承担 specialized 业务日志职责。

### 保留的 session 逻辑

本次保留：

- `actionStartPlayerSnapshot`
- `buildActionDetailParts()`
- `flushLeafActionDetail()`
- `logActionDetail()`

这些属于通用聚合 detail 机制，不是 specialized 子步骤业务日志。

## 兼容性策略

### 旧路径兼容

为降低风险：

1. engine 在一段时间内同时支持
   - 旧的 `logKey/logParams`
   - 新的 `immediateLogs`
2. 本次只把目标范围内的日志迁到新协议
3. 其他 action 暂不改动

### 去重规则

engine 归一化时必须遵守：

- 同一结果的 `logKey/logParams` 与 `immediateLogs` 不能重复 append
- 迁移到新协议的 action 不再同时返回旧字段和新字段

## 测试计划

### 1. improvement 原位日志

增加或改写测试，覆盖：

- major improvement 返回 `flow` 时，仍能在当前步骤立刻出现 `log.playImprovement`
- minor improvement 返回 `flow` 时，仍能立刻出现 `log.playMinorImprovement`
- payload 只包含购买步骤自己的 `costResources` / `returnedCards` / `bonusSources`

### 2. occupation + follow-up improvement

保留并扩展 D95 回归：

- 第二张职业走 `lessons`
- 后续买 `Major_Fireplace1`
- `log.playOccupation.costResources === { food: 1 }`
- `bonusSources` 不包含后续大改良的 attribution

### 3. bakeBread 原位日志

覆盖：

- 烤面包成功时原位出现 `log.bakeBread`
- 不再依赖 session 层 delta 补记

### 4. 兼容旧 `logKey/logParams`

确保：

- 未迁移 action 仍按旧路径正常写日志
- 引入 `immediateLogs` 后不会出现重复日志

### 5. specialized delta 删除后的回归

验证删除 `GameCore` specialized delta 补记后：

- 相关日志仍完整出现
- 顺序正确
- payload 不串后续步骤

## 实施顺序建议

1. 扩展 engine 与类型协议，增加 `immediateLogs`
2. engine 内部实现旧字段到 `immediateLogs` 的归一化
3. 迁移 `improvement`
4. 迁移 `occupation`
5. 迁移 `bakeBread`
6. 删除 `GameCore` specialized delta 补记
7. 补齐和清理测试

这个顺序的好处是：

- 先搭协议
- 再迁业务
- 最后删兜底

避免一开始就拆掉安全网，导致排查范围过大。

## 风险与缓解

### 风险 1：日志顺序变化

把日志前移到子步骤完成时，可能让部分测试或人工预期里的日志顺序变化。

缓解：

- 明确把“当前步骤日志先于 follow-up flow”作为新规范
- 测试显式断言关键顺序，不依赖含糊的“最终 somewhere 存在”

### 风险 2：旧路径与新路径重复记日志

缓解：

- engine 内统一归一化
- 迁移目标 action 不同时返回旧字段与新字段
- 增加重复日志测试

### 风险 3：`GameCore` 的聚合 detail 与 specialized 日志去重逻辑耦合

缓解：

- 本次只删 specialized delta 逻辑
- `actionDetail` leaf-flush 相关逻辑单独评估，必要时保留局部状态，但去掉业务含义

## 决策总结

本设计采用“engine-level immediate logs”方案：

- 不再在 `GameCore` 里通过 delta 推断 specialized 业务日志
- 不新增独立 `LogNode`
- 保留 `logKey/logParams` 兼容旧路径
- 让 `improvement` / `occupation` / `bakeBread` 都迁移为子步骤原位产生日志

这是在“满足原位产出原则”和“控制改造爆炸半径”之间的折中最优解。
