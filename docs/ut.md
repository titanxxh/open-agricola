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

## 运行方式

- `npm test`

## 最近变更提醒

- 计分板与计分计算为 UI 逻辑与纯函数计算，当前未新增 UT
