# UT 说明与维护清单

## 维护规则

- 每新增或修改 UT 时，必须同步更新本文件
- 记录测试目的、覆盖范围、关键断言与运行方式

## 现有 UT 列表

### src/engine/__tests__/engine.test.ts

- Engine tree flow / handles action with choice and resolves to done
  - 覆盖场景：行动返回 choice，完成选择后继续推进至 done
  - 关键断言：首次 proceed 返回 choice，resolveChoice 返回 ok，再次 proceed 返回 done
- Engine tree flow / handles action without choice
  - 覆盖场景：行动直接 ok，无 choice 分支
  - 关键断言：首次 proceed 返回 ok，再次 proceed 返回 done

### src/actions/__tests__/hook-matrix.test.ts

- hook matrix / covers all actions with all phases
  - 覆盖场景：所有 action 定义都覆盖完整 Hook 阶段列表
  - 关键断言：每个 action 的 phases 等于 actionHookPhases

### src/actions/__tests__/animals.test.ts

- animal capacity / reduces animals to capacity
  - 覆盖场景：动物数量超过围栏容量时自动裁剪
  - 关键断言：最终动物总数等于所有圈地容量总和（包含畜栏倍增）

### src/actions/__tests__/fencing.test.ts

- fencing pasture / builds a pasture and consumes wood
  - 覆盖场景：建造圈地后更新围栏数量、圈地列表与木材消耗
  - 关键断言：pastures 数量、fences 与 wood 变化符合预期

### src/actions/__tests__/fence-validation.test.ts

- fence validation / accepts closed square
  - 覆盖场景：闭合围栏通过校验并落盘
  - 关键断言：返回 ok 且 fences 数量正确
- fence validation / rejects open shape
  - 覆盖场景：非闭合围栏被拒绝
  - 关键断言：返回 ok=false
- fence validation / rejects enclosing rooms
  - 覆盖场景：围栏圈住房屋判定失败
  - 关键断言：返回错误原因
- fence validation / requires connection to existing fences
  - 覆盖场景：已有围栏时新围栏不相连被拒绝
  - 关键断言：返回连接失败原因

### src/actions/__tests__/stables.test.ts

- stables / builds a stable and consumes wood
  - 覆盖场景：建造畜栏成功并扣除木材
  - 关键断言：stableTiles 与 wood 变化正确
- stables / fails when resources are insufficient
  - 覆盖场景：资源不足时建造失败

### src/engine/__tests__/engine-chain.test.ts

- engine follow-up actions / inserts follow-up actions after hooks
  - 覆盖场景：Hook After 注入后续行动并执行
  - 关键断言：主行动与 follow-up 资源变化正确

- engine follow-up actions / keeps tree shape when parent is OrNode
  - 覆盖场景：在 Or 分支中插入 follow-up，不破坏根结构
  - 关键断言：根节点仍为 OrNode，follow-up 仅挂在目标分支
- engine follow-up actions / keeps tree shape when parent is OptionalNode
  - 覆盖场景：在 Optional 子树中插入 follow-up，不替换整棵树
  - 关键断言：OptionalNode 保持，child 被顺序包装
- engine follow-up actions / wraps root only for root insertion
  - 覆盖场景：目标节点就是 root 时插入 follow-up
  - 关键断言：仅该场景下 root 被 Sequence 包装

### src/engine/__tests__/engine-flow.test.ts

- engine flow / computeReplace chain uses latest action id
  - 覆盖场景：A->B->C 链式替换
  - 关键断言：最终执行 C
- engine flow / computeReplace stops when no further match
  - 覆盖场景：A->B 后续无匹配替换
  - 关键断言：最终执行 B
- engine flow / computeReplace and isDoable consistency
  - 覆盖场景：替换后的 action 不可执行
  - 关键断言：返回 blocked，原 action 不执行

### src/logic/__tests__/scoring.test.ts

- scoring / begging cards and empty spaces
  - 覆盖场景：基础计分项（乞讨、已打出卡、空地）联动
  - 关键断言：begging=-3*count，cards entries 正确，empty 数量正确
- scoring / major bonus range
  - 覆盖场景：大改良（Joinery）区间加分
  - 关键断言：5 木头对应 2 分 bonus

### src/logic/__tests__/round-harvest.test.ts

- round harvest / reap feed breed sequence
  - 覆盖场景：收获三段连贯执行
  - 关键断言：收割产出、喂食乞讨、繁殖摘要正确
- round harvest / apply major onHarvest
  - 覆盖场景：收获结束触发大改良 harvest 效果
  - 关键断言：Joinery 消耗 1 wood 获得 2 food

### src/logic/__tests__/state-clone.test.ts

- cloneState / preserves round and cards
  - 覆盖场景：关键字段克隆后保持
  - 关键断言：round、playedCards、minorPlayed 不丢失
- cloneState / no shared reference
  - 覆盖场景：克隆后修改嵌套结构
  - 关键断言：不影响原状态（深拷贝语义）

### src/actions/__tests__/hook-matrix.test.ts

- hook matrix / collects phases from action hooks
  - 覆盖场景：仅 action hooks 参与统计
  - 关键断言：目标 action phases 等于注册阶段
- hook matrix / collects phases from card listeners
  - 覆盖场景：card listener 参与统计
  - 关键断言：目标 action phases 包含 listener phase
- hook matrix / no default full coverage
  - 覆盖场景：无 hook/listener 的 action
  - 关键断言：phases 为空，而非全覆盖
- hook matrix / sensitive to hook removal
  - 覆盖场景：清空注册后重新生成矩阵
  - 关键断言：phase 从非空回到空
- hook matrix / deterministic order
  - 覆盖场景：多来源混合注册
  - 关键断言：phase 顺序固定为 actionHookPhases 顺序

### src/app/__tests__/use-engine-flow.test.ts

- use-engine-flow / auto resolve single choice then continue
  - 覆盖场景：单选项自动选择路径
  - 关键断言：调用 resolveChoice 并最终完成
- use-engine-flow / returns choice for multiple options
  - 覆盖场景：多选项等待 UI 输入
  - 关键断言：返回 choice 状态
- use-engine-flow / triggers reorg when animals increase
  - 覆盖场景：执行后动物总量上升
  - 关键断言：返回 reorg 分支
- use-engine-flow / bubbles fail to UI
  - 覆盖场景：引擎返回 fail
  - 关键断言：错误 key 原样透传

### src/app/__tests__/use-turn-flow.test.ts

- use-turn-flow / next player index
  - 覆盖场景：轮转到下一玩家
  - 关键断言：索引按玩家数取模递增
- use-turn-flow / opened actions by round
  - 覆盖场景：根据 roundActionOrder 计算已开启行动
  - 关键断言：仅返回已到开启轮次的 action
- use-turn-flow / single start player
  - 覆盖场景：设置起始玩家
  - 关键断言：仅目标玩家 startPlayer=true

### src/app/__tests__/use-round-flow.test.ts

- use-round-flow / apply return-home phase
  - 覆盖场景：回合结束回家阶段
  - 关键断言：工人恢复、行动位占用清空
- use-round-flow / finalize round to next round
  - 覆盖场景：常规回合推进
  - 关键断言：round+1、newborn 清零、startPlayer 生效
- use-round-flow / finalize round game over
  - 覆盖场景：第 14 轮后结束
  - 关键断言：返回 gameOver 并记录结束状态
- use-round-flow / next player index
  - 覆盖场景：寻找下一个有可用工人的玩家
  - 关键断言：返回正确索引

### src/app/__tests__/use-harvest-flow.test.ts

- use-harvest-flow / run harvest flow
  - 覆盖场景：调用 harvest 核心流程并返回摘要
  - 关键断言：reap/feed/breed 摘要结构正确
- use-harvest-flow / pending feed blocks finalize
  - 覆盖场景：仍有未喂食玩家
  - 关键断言：canFinalizeHarvest 返回 false
- use-harvest-flow / applies major onHarvest
  - 覆盖场景：finalize 时执行 major harvest 效果
  - 关键断言：Joinery 的 wood->food 转换生效

### src/services/__tests__/api-contract.test.ts

- api contract / persistGame strips function fields
  - 覆盖场景：持久化 actionSpaces 序列化
  - 关键断言：execute/canBeExecutedByPlayer/resolveChoice 不落盘

### server/__tests__/payload-validation.test.ts

- payload validation / rejects invalid resource key
  - 覆盖场景：非法 resource
  - 关键断言：返回 INVALID_RESOURCE
- payload validation / rejects invalid tile payload
  - 覆盖场景：tile 缺 row/col
  - 关键断言：返回 INVALID_TILE
- payload validation / accepts valid payload
  - 覆盖场景：合法资源与 tile 请求
  - 关键断言：校验通过返回 null

## 运行方式

- `pnpm test`

### shared/actions/effects/__tests__/exchange.test.ts

BGA-aligned 资源交易系统测试，覆盖 Trade 机制的完整功能。

- canAffordTrade / returns true when player has exact resources for trade
  - 覆盖场景：玩家资源刚好满足交易需求
  - 关键断言：返回 true
- canAffordTrade / returns true when player has more than required resources
  - 覆盖场景：玩家资源超过交易需求
  - 关键断言：返回 true
- canAffordTrade / returns false when player lacks resources
  - 覆盖场景：玩家资源不足
  - 关键断言：返回 false
- canAffordTrade / handles multiple resource types in trade
  - 覆盖场景：交易涉及多种资源类型
  - 关键断言：所有资源满足才返回 true
- canAffordTrade / respects times parameter
  - 覆盖场景：多次执行交易的资源验证
  - 关键断言：times 超出可支付范围返回 false

- getMaxTradeTimes / calculates max based on available resources
  - 覆盖场景：根据玩家资源计算最大交易次数
  - 关键断言：返回资源允许的最大次数
- getMaxTradeTimes / respects trade max limit
  - 覆盖场景：交易有 max 限制时
  - 关键断言：不超过 trade.max
- getMaxTradeTimes / handles multiple resource constraints
  - 覆盖场景：交易消耗多种资源
  - 关键断言：取所有资源约束的最小值

- applyTrade / deducts from resources and adds to resources
  - 覆盖场景：执行交易后资源变化
  - 关键断言：from 扣除、to 增加
- applyTrade / applies trade multiple times
  - 覆盖场景：多次执行同一交易
  - 关键断言：资源变化按 times 倍增
- applyTrade / handles zero times gracefully
  - 覆盖场景：times=0 时不执行交易
  - 关键断言：资源不变

- convertResources / returns new resources without mutation
  - 覆盖场景：纯函数转换资源，不修改原对象
  - 关键断言：原对象不变，返回新对象
- convertResources / handles negative results (overdraft)
  - 覆盖场景：资源不足时的转换结果
  - 关键断言：允许负值（由调用方验证）

- hasValidResources / returns true for all non-negative resources
  - 覆盖场景：所有资源非负
  - 关键断言：返回 true
- hasValidResources / returns false for any negative resource
  - 覆盖场景：存在负资源
  - 关键断言：返回 false

- getPossibleTradeTimes / returns array from 0 to max times
  - 覆盖场景：生成所有可能的交易次数
  - 关键断言：返回 [0, 1, ..., max]

- reverseTrade / swaps from and to
  - 覆盖场景：反转交易方向
  - 关键断言：from/to 互换
- reverseTrade / preserves max, source, sourceId
  - 覆盖场景：反转时保留元数据
  - 关键断言：max/source/sourceId 不变

- exchangeResources (legacy) / exchanges resources correctly
  - 覆盖场景：向后兼容的旧版交换函数
  - 关键断言：资源正确交换

### shared/actions/effects/__tests__/pay.test.ts

BGA-aligned 支付系统测试，覆盖 ComplexCost、PaymentSolution、Pareto 优化等核心算法。

- payResources (legacy) / deducts resources from player
  - 覆盖场景：旧版直接扣减资源
  - 关键断言：资源正确扣除
- payResources (legacy) / ignores zero or negative costs
  - 覆盖场景：零或负成本不扣减
  - 关键断言：资源不变

- applyCostOverride / returns base when no override provided
  - 覆盖场景：无覆盖时返回原成本
  - 关键断言：返回 base
- applyCostOverride / applies negative overrides (discounts)
  - 覆盖场景：负值覆盖实现折扣
  - 关键断言：成本减少
- applyCostOverride / clamps to zero minimum
  - 覆盖场景：折扣超过成本
  - 关键断言：最小为 0

- canPayResources (legacy) / returns true when player has enough resources
  - 覆盖场景：资源充足
  - 关键断言：返回 true
- canPayResources (legacy) / returns false when player lacks resources
  - 覆盖场景：资源不足
  - 关键断言：返回 false

- keepOnlyOptimals / removes dominated solutions
  - 覆盖场景：Pareto 优化过滤被支配解
  - 关键断言：仅保留最优解
- keepOnlyOptimals / keeps solutions that are optimal in different resources
  - 覆盖场景：多维度各有优势的解
  - 关键断言：保留所有非被支配解
- keepOnlyOptimals / removes solution dominated in all dimensions
  - 覆盖场景：某解在所有维度都被支配
  - 关键断言：该解被移除

- computeAllBuyableCombinations / returns empty array when cannot afford fee
  - 覆盖场景：无法支付费用
  - 关键断言：返回空数组
- computeAllBuyableCombinations / returns solution when can afford exact fee
  - 覆盖场景：资源刚好满足费用
  - 关键断言：返回有效解
- computeAllBuyableCombinations / handles fees array (choose one)
  - 覆盖场景：多选一费用（fees 数组）
  - 关键断言：返回可支付的选项解
- computeAllBuyableCombinations / uses trades to convert resources before payment
  - 覆盖场景：通过交易转换资源后支付
  - 关键断言：交易后能支付费用
- computeAllBuyableCombinations / applies bonus discounts
  - 覆盖场景：折扣降低实际成本
  - 关键断言：支付资源减少
- computeAllBuyableCombinations / handles multiple trades
  - 覆盖场景：多个交易选项组合
  - 关键断言：生成所有有效组合
- computeAllBuyableCombinations / handles empty cost (free)
  - 覆盖场景：无成本（免费）
  - 关键断言：返回零支付解
- computeAllBuyableCombinations / filters to optimal solutions only
  - 覆盖场景：自动过滤非最优解
  - 关键断言：结果仅含 Pareto 最优解

- canPayCost / handles simple Resource cost (backward compatible)
  - 覆盖场景：向后兼容简单成本格式
  - 关键断言：与 canPayResources 行为一致
- canPayCost / handles ComplexCost with fee
  - 覆盖场景：ComplexCost 格式
  - 关键断言：正确判断可支付性
- canPayCost / handles ComplexCost with trades
  - 覆盖场景：含交易的 ComplexCost
  - 关键断言：考虑交易转换后判断

- executePaymentSolution / deducts resources from player
  - 覆盖场景：执行支付方案扣减资源
  - 关键断言：资源正确扣除

- getCheapestSolution / returns solution with minimum total resources
  - 覆盖场景：从多个解中选择总资源最少的
  - 关键断言：返回总支付量最小的解

- Integration: Complex payment scenarios / handles bakery scenario: grain to food
  - 覆盖场景：烤面包（谷物换食物）
  - 关键断言：交易后能支付食物成本
- Integration: Complex payment scenarios / handles fireplace scenario: animal to food
  - 覆盖场景：壁炉（动物换食物）
  - 关键断言：交易后能支付食物成本
- Integration: Complex payment scenarios / handles multiple fees choice
  - 覆盖场景：多选一费用
  - 关键断言：能选择可支付的选项
- Integration: Complex payment scenarios / handles renovation cost with material trade
  - 覆盖场景：房屋升级成本
  - 关键断言：正确处理费用+材料组合

- Card-based payment / generates card payment solution when player has required card
  - 覆盖场景：玩家拥有所需卡牌时生成卡牌支付方案
  - 关键断言：方案包含 cardUsed 字段
- Card-based payment / does not generate card solution when player lacks required card
  - 覆盖场景：玩家缺少所需卡牌时不生成卡牌支付方案
  - 关键断言：方案不包含 cardUsed 字段
- Card-based payment / returns cardUsed from executePaymentSolution
  - 覆盖场景：执行支付方案返回使用的卡牌
  - 关键断言：返回 cardUsed 并正确扣减资源

- returnCardToBoard / removes card from improvements
  - 覆盖场景：从大改良列表移除卡牌
  - 关键断言：卡牌从 improvements 中移除
- returnCardToBoard / removes card from minorPlayed
  - 覆盖场景：从小改良列表移除卡牌
  - 关键断言：卡牌从 minorPlayed 中移除
- returnCardToBoard / handles non-existent card gracefully
  - 覆盖场景：处理不存在的卡牌
  - 关键断言：不抛出错误

- Integration: Cooking Hearth upgrade scenario / can pay clay cost without Fireplace
  - 覆盖场景：无壁炉时支付全额粘土成本
  - 关键断言：生成纯资源支付方案
- Integration: Cooking Hearth upgrade scenario / can upgrade from Fireplace with reduced clay cost
  - 覆盖场景：从壁炉升级支付折扣价
  - 关键断言：生成包含 cardUsed 的方案
- Integration: Cooking Hearth upgrade scenario / generates resource-only solutions when player lacks required card
  - 覆盖场景：玩家缺少所需卡牌时仅生成资源方案
  - 关键断言：无卡牌支付方案

### tests/pay-optimizations.test.ts

支付系统性能优化测试，验证 LRU 缓存和哈希去重的正确性与性能提升。

- LRU Cache / caches identical queries
  - 覆盖场景：相同查询命中缓存
  - 关键断言：第二次查询直接返回缓存结果
- LRU Cache / invalidates on resource change
  - 覆盖场景：资源变化后缓存失效
  - 关键断言：新资源生成新缓存键
- LRU Cache / respects max size limit
  - 覆盖场景：缓存达到上限时淘汰旧条目
  - 关键断言：LRU 淘汰策略正确执行
- Hash Deduplication / removes duplicate solutions
  - 覆盖场景：哈希去重移除重复解
  - 关键断言：O(1) 时间复杂度去重
- clearPaymentCache / resets cache state
  - 覆盖场景：手动清空缓存
  - 关键断言：缓存被完全清空
- Benchmark: Simple cost
  - 覆盖场景：简单成本计算性能
  - 关键断言：优化版与基准版结果一致
- Benchmark: Multiple fees
  - 覆盖场景：多选一费用计算性能
  - 关键断言：优化版显著快于基准版
- Benchmark: Complex trades
  - 覆盖场景：复杂交易组合性能
  - 关键断言：缓存命中时 10x+ 加速

### tests/pay-dp.test.ts

动态规划支付算法基准测试，对比不同实现策略的性能。

- DP vs Recursive / produces same results
  - 覆盖场景：DP 和递归算法结果一致性
  - 关键断言：两种实现返回相同解集
- DP Optimization / avoids redundant computation
  - 覆盖场景：DP 避免重复计算
  - 关键断言：时间复杂度从指数降为多项式
- Benchmark: Single fee
  - 覆盖场景：单一费用基准测试
  - 关键断言：记录各版本耗时
- Benchmark: Multiple fees
  - 覆盖场景：多选一费用基准测试
  - 关键断言：对比 Baseline/Optimized/DP/Cache 四种实现
- Benchmark: Complex
  - 覆盖场景：复杂支付场景（多交易+多折扣）
  - 关键断言：缓存版本达到 738x 加速
- Benchmark: With target
  - 覆盖场景：带目标资源的支付计算
  - 关键断言：验证目标导向优化效果

### tests/dp-trace.test.ts

动态规划算法追踪测试，验证 DP 状态转移正确性。

- DP Trace / tracks state transitions
  - 覆盖场景：DP 状态转移记录
  - 关键断言：每个状态转移可追溯
- DP Trace / handles edge cases
  - 覆盖场景：边界条件（零资源、最大交易次数）
  - 关键断言：正确处理边界情况
- DP Trace / validates memoization
  - 覆盖场景：记忆化验证
  - 关键断言：已计算状态不重复计算

## 最近变更提醒

- 计分板与计分计算为 UI 逻辑与纯函数计算，当前未新增 UT
