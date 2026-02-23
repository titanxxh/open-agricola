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

- `npm test`

## 最近变更提醒

- 计分板与计分计算为 UI 逻辑与纯函数计算，当前未新增 UT
