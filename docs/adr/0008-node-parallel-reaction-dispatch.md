# 8. NODE_PARALLEL reaction dispatch alignment

- Status: Accepted
- Date: 2026-07-02

## Context

参考实现的卡牌反应分两类：

1. `PlayerCards::getReaction($event)` 收集同一事件下可触发的卡牌，并把它们作为 `NODE_PARALLEL` 下的 card activation 交给玩家选择。卡牌方法只在 activation leaf 真正执行、`isDoable()` 预览或描述重建时调用。
2. `applyEffects()` / compute 类 hook 只做确定性聚合，不暴露玩家排序选择。

OA 之前的 action listener 已有 `ParallelNode(mode='trigger-select')`，但触发选择需要单卡 opt-in；harvest field stage hook 还有一套手写分流，把自动 flow 与可交互 flow 分开；extra-turn provider 只取第一个可用卡牌。这些差异会造成三个问题：

- 同一时机多张可选 reaction 的顺序被实现细节决定，而不是由玩家决定。
- 自动 flow 和交互 flow 被 dispatcher 预先分类，和 参考实现的 activation leaf 模型不一致。
- `M057_Taps` 与 `A092_AdoptiveParents` 等 extra-turn provider 同时存在时，后注册或后扫描的 provider 会被隐藏。

## Decision

1. Action reaction listener 的 `before` / `during` / `immediatelyAfter` / `after` 同一 trigger player / phase 下默认进入 `ParallelNode(mode='trigger-select')`。单 child 直接展开；compute / query hook 继续确定性聚合。
2. Harvest field 三个 stage hook 与 before-end card-effect step 使用同一个 `activate-card-effect` child。每个 target step 收集 activation 后进入 trigger-select，不再手写自动 / 交互分流。
3. `trigger-select` preview 支持三类 child：
   - `activate-card`
   - `activate-card-effect`
   - `activate-extra-turn`
4. Stage card-effect preview 在 cloned state/player 上运行；返回 flow 或在 clone 上产生可检测 direct mutation 都表示 activation applicable。真实 mutation 只在玩家选中 activation 后落地。
5. Extra-turn 从 first-match 改为 provider selection：
   - `collectExtraTurnContributions()` 聚合所有 `contributeExtraTurn` provider。
   - 单 provider 直接展开。
   - 多 provider 进入 one-shot trigger-select，child 是 `activate-extra-turn`。
   - provider 选中后才展开该卡自己的 flow。
6. Extra-turn skip / forced consume 从玩家级全局计数改为 per-source 计数：
   - `_extraTurnSkipCountsByCard`
   - `_extraTurnConsumedCountsByCard`
   这样多张 provider 卡并存时，消耗的是具体来源卡的一次 opportunity。

## Consequences

正面：

- 同一时机多卡 reaction 对齐 参考实现：玩家选择来源卡和触发顺序。
- `M057_Taps`、`A092_AdoptiveParents` 和未来 extra-turn provider 可以共存，不再互相遮蔽。
- Undo 后不需要保存旧 pending options；恢复到 action start / step 后重新派生 trigger-select。
- Harvest field stage hook 与 before-end hook 走同一 activation 模型，减少手写 dispatcher 差异。

约束：

- Reaction hook 应返回可重放 `ActionFlow`，状态修改落到 action leaf。尚未迁入 generic reaction dispatcher 的 direct stage hook 仍保持串行扫描，新增同类能力应优先接入 activation 模型。
- Compute / query hook 不能进入 trigger-select；费用、可达性、计分等聚合必须继续保持确定性和无玩家排序选择。
- 测试不能断言同一时机多卡按打出区顺序自动执行；必须断言 trigger-select、来源卡选择、pass / mandatory gate 和 undo 重新派生。

## Alternatives considered

- **保留单卡 opt-in**：拒绝。新卡作者需要知道何时打开开关，容易遗漏，也会继续和 参考实现 `NODE_PARALLEL` 默认语义不一致。
- **继续手写 harvest field 分流**：拒绝。自动 / 交互分类会把 dispatcher 变成规则裁定层，且不能自然覆盖 direct mutation preview。
- **Extra-turn 继续 first-match**：拒绝。多个 provider 并存时会隐藏后续 provider，玩家无法选择先用 `M057_Taps` 还是 `A092_AdoptiveParents`。
- **引入全局 skipped provider 队列**：拒绝。per-source cardState / transient counter 已能表达机会消耗，不需要把单卡机会提升成 GameState 顶层结构。
