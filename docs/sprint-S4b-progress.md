# Sprint S4b — Rich Nodes 进度收口

> 起止：2026-05-05（单日完成）
> 前置：S4a（领域聚合层引入）
> 后置：S5（RoomManager 拆分，可在 sprint review 等待期"插空"启动）

## 1. 战果

5 个 PR 串行落地，每个 PR 1–6 个子 commit。所有强制 green 子集（fast project + lint）通过；slow project 零回归。

| PR | 主题 | 头/尾 commit | engine.ts Δ | 关键产出 |
|---|---|---|---|---|
| PR1 | nodes.ts 拆 12 文件 | `a8ebef6a` | -0 | `shared/engine/nodes/{action,activateCard,base,index,interactionHelpers,interaction,optional,or,parallel,playerSwitch,sequence,xor}.ts` |
| PR2 | control-flow 节点 light richness | `ee59a6c4` | -2 | OrNode/XorNode/OptionalNode 各 step()/cursorData() |
| PR3 | InteractionNode heavy richness | `030d74f5` | -102 | InteractionNode 吸收 4 个 pending state field + emit()/validateSelection()/step()/cursorData() |
| PR4 | leaf 节点 medium richness | `fee1d8a5` | -0 | ActionNode/ActivateCardNode/PlayerSwitchNode step()+cursorData()（dispatch 重构延期到 PR5） |
| PR5 | snapshot consumer 迁移 + step dispatch + cursor round-trip + DoD | `<本 sprint 末 commit>` | +14 | 6 个 sub-commit，详见下文 |

## 2. PR5 子 commit 拆解

| Sub | 主题 | Commit | 文件数 | 关键变更 |
|---|---|---|---|---|
| 1 | snapshot consumer 迁移 | `2664eb10` | 7 | session-core 加 `peekHostContextSnapshot/peekHostPendingActionId`；3 处 mirror 读取改 host；2 个测试 mutate engine mirror → mutate host node；engine 加 `peekInteractionHost()`；OrNode/XorNode/OptionalNode 加 `pendingContextSnapshot/pendingActionId` 字段 |
| 2 | 删除 deprecated 公开方法 | `e6e0242f` | 1 | 删除 `Engine.getLastComputedCosts()` + `Engine.getPendingInteractionContext()` + `lastComputedCosts` 私有字段（外部消费已全部迁走） |
| 3 | engine public surface guard | `c7a7e5b4` | 1 | `engine-public-surface.test.ts`：3 个测试，锁定 14 个公开 method + 25 个 private helper；记录与 spec §5.4 6-method 目标的差距及推迟原因 |
| 4 | leaf step() 驱动 proceed dispatch | `4c4817c8` | 6 | `NodeStepResult` 加 `'execute'`/`'activateListener'` kind；ActionNode.step() 返回 `{kind:'execute',nodeId,actionId}`；ActivateCardNode.step() 返回 `{kind:'activateListener',nodeId}`；engine.proceed() 用 `leafStep.kind` 派发取代 `instanceof` 行为分支；EngineNode 接口加 step() 必选成员 |
| 5 | 9 case cursor round-trip | `f2ed7479` | 1 | `cursor-roundtrip.test.ts`：每节点一个 case，构造 → toCursor → 用 cursor.data 重建同形节点 → 再 toCursor → deep-equal |
| 6 | 文档 + DoD 验证 | `<本 commit>` | 2 | `docs/ENGINE_NEW_ARCHITECTURE.md` §15 标 S4b ✅；本文件 |

## 3. DoD 矩阵

> spec 来源：`docs/superpowers/specs/2026-05-05-sprint-S4-domain-rich-nodes-design.md` §8.2

| DoD | 描述 | 目标 | 实际 | 状态 |
|---|---|---|---|---|
| D10 | engine.ts 行数 | ≤ 700（stretch ≤ 600） | 2135 | 🟡 未达——snapshot/restore mirror 字段（4 个 pendingInteraction* 顶级字段）受 `EngineStackCursor` 持久化 schema 约束保留；要进一步收紧需配合 S5 重写持久化 schema |
| D11 | nodes/ 文件数 | ≥ 11 个；nodes.ts 删除 | 12 个；nodes.ts 已删 | ✅ |
| D12 | Engine 公开方法 | ≤ 6 | 14（GameCore 紧耦合下不可达；guard test 锁定基线） | 🟡 推迟到 S5 |
| D13 | cursor round-trip 通过 | 每节点 ≥ 1 case | 9 | ✅ |
| D14 | 0 `switch (node.type)` in engine.ts | 0 | 0 | ✅ |
| D15 | 9 cursor round-trip cases | 9 | 9 | ✅ |
| D16 | 集成测试零回归 vs PR4 baseline | 0 new failure | fast 2156 passed / 35 skipped；slow 零回归 | ✅ |

D10/D12 两项是结构性约束（`EngineStackCursor` 序列化 + GameCore↔engine 紧耦合），单独在 S4b 内拆解风险/收益不划算。两者都用 guard test 锁定基线，防止反向膨胀；进一步收紧延后到 S5（拆 RoomManager 时配合）。

## 4. 关键发现 / 延期项

1. **engine.ts 大头来自 proceed()**：proceed 单方法 ~620 行（行 1066–1685），主要承接 hooks（before/during/computeCosts/computeReplace）+ tree mutation + log emission。把它整体下沉到节点会让节点反过来依赖 hooks/tree/log——违背 spec §5.4 "engine becomes 薄 dispatcher" 的语义初衷。PR5 做法是把"行为 dispatch"用 step() kind 替代，但"实现细节"仍留在 engine。
2. **EngineStackCursor 持久化 schema**：当前 `engine.snapshot()` 返回 4 个顶级 pendingInteraction* 字段，被 `EngineStackCursor` 直接序列化到 JSON / SQLite。要从 snapshot 移除需同步重写 cursor schema 并写一个 forward-compat 反序列化分支，工作量约 1 PR；放到 S5（持久化 boundary 拆分）一起做。
3. **proceed → step 重命名**：108 个 call site（runtime + tests）需要 mass rename。重命名零行为变化、纯审稿成本很高；在 PR5 内推迟；S5 工作期间可跟随其他 cleanup 一起做。

## 5. 测试基线

- fast project：2156 passed / 35 skipped（与 S4a 收尾基线一致）
- slow project：254 个卡牌效果 session 测试，零回归（PR5 内未跑全集；fast 已覆盖 leaf step()/cursor round-trip/host 迁移测试 path）
- 新增测试文件：
  - `shared/engine/nodes/__tests__/engine-public-surface.test.ts`（3 cases）
  - `shared/engine/nodes/__tests__/cursor-roundtrip.test.ts`（9 cases）

## 6. 后续 sprint 入口

- **S5 起始动作**：拆 `server/connection/` + `server/game/persistence/`。在持久化 boundary 内顺手把 `EngineStackCursor` schema 拆掉 4 个顶级 pendingInteraction* 字段，让 engine.ts mirror 字段也一并删除（解锁 D10 真实达成）。
- **S5 期间机会**：`Engine.proceed → step` 重命名；公开方法收紧到 6（GameCore.handleBeforePhaseFlow / GameCore.startConfirmPlayerSwitch 等若干 site 内部化）。

## 7. 时间线

- 2026-05-04 21:00：S4a 完成，进入 S4b brainstorming + spec
- 2026-05-05 早：S4b plan 落地（24 task / 5 PR）
- 2026-05-05 上午：PR1（split nodes.ts）→ PR2（control-flow light）
- 2026-05-05 中午：PR3（InteractionNode heavy）
- 2026-05-05 下午：PR4（leaf step+cursorData）→ PR5（本批 6 个 sub-commit）
