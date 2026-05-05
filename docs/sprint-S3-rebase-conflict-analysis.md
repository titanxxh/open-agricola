# sprint-S3-payment-solver Rebase 冲突分析

**生成时间**：2026-05-05  
**起点 base**：`main` (commit `9725cb0b`)  
**目标 head**：`sprint-S2-interaction-request` (commit `6ac8ab8d`)  
**待 rebase**：`sprint-S3-payment-solver` (commit `0dc2af82`，相对 main 共 32 commits)

## 1. 概览

S2 与 S3 都是从 main 平行开出的 sprint：

- **S2**：协议层 / 引擎层重构 — 把 `{ type: 'choice' ... }` 改造为 `{ type: 'request', request: { kind: 'choice' | 'farm-select' | 'selection' | ... } }`，引入 `InteractionRequest` sum-type，收紧 `PromptKey` 闭 union，把 `InteractionState` 从 8 个 stateId 收敛到 3 个（idle / wait / gameover）。
- **S3**：支付域深模块化 — 把分散在 `shared/actions/helpers/{payment.ts,pay-helpers.ts,room-payment.ts}` 三个文件 1974 行的 PaymentSolver 内部细节集中到 `shared/actions/payment/`，对外只暴露 `PaymentSolver` 命名空间（4 个 public + clearCache + isComplexCost）。

两个 sprint 改动**正交但物理重叠**：S2 改"协议形状"，S3 改"模块归属与命名"，但 S3 的所有 commit 都触碰了 S2 也改过的同一段代码（以 `pay-helpers.ts` 中的 `buildPaymentChoiceResult` 为代表）。

## 2. 重叠文件清单（已确认实际编辑过）

| 文件 | S3 改动行数 | S2 改动行数 | 冲突预期 |
|---|---|---|---|
| `shared/actions/helpers/pay-helpers.ts` | 811 | 11 | **高**：S3 删整个文件；S2 改 `buildPaymentChoiceResult` 返回 shape |
| `shared/actions/effects/improvement.ts` | 610 | 8 | **中**：S3 拆分成 3 个文件；S2 仅改少量 import |
| `shared/actions/effects/pay.ts` | 48 | 8 | **中**：S3 切 PaymentSolver 命名空间；S2 改 'choice'→'request' |
| `shared/actions/effects/stables.ts` | 29 | 20 | **中**：同上 |
| `shared/actions/effects/construct.ts` | 7 | 20 | 低-中 |
| `shared/actions/effects/exchange.ts` | 7 | 4 | 低 |
| `shared/actions/effects/fencing.ts` | 7 | 20 | **中**：S2 farm-select 协议层 + S3 命名空间切换 |
| `shared/actions/effects/occupation.ts` | 9 | 4 | 低 |
| `shared/actions/effects/plow.ts` | 7 | 20 | 低-中 |
| `shared/actions/effects/__tests__/pay.test.ts` | 多 | 4 | 中 |
| `shared/session/game-core.ts` | **2** (单行 import) | 1954 | 低（S3 仅 1 行 import 路径迁移，S2 不动该 import） |

## 3. 实际探测：S3 → S2 rebase 第 6 个 commit 即冲突

在临时 worktree 跑 `git rebase sprint-S2-interaction-request` 模拟，S3 第 6 个 commit (`7c5439ff` "drop 7 dead exports") 在 `pay-helpers.ts` 的 `buildPaymentChoiceResult` 撞上 S2 的 `'choice'`→`'request'` 改造：

```
<<<<<<< HEAD (S2 + S3 已应用前 5 commit)
  const orderedSolutions = sortPaymentSolutions(solutions)
  const options = orderedSolutions.map((solution, idx) => ({
=======
  const orderedSolutions = sortSolutions(solutions)
  return {
    type: 'choice',
    promptKey: 'prompt.selectPayment',
    options: orderedSolutions.map((solution, idx) => ({
>>>>>>> 7c5439ff (refactor(payment): drop 7 dead exports)
```

S3 那一边还在用 `{ type: 'choice', promptKey, options }` 旧 shape；S2 那一边已经把整个函数返回值改成 `{ type: 'request', request: { kind: 'choice', options }, promptKey }`，且函数名从 `sortSolutions` 改成 `sortPaymentSolutions`。

按时间顺序 S3 的 32 commits 中预计还会撞类似冲突约 6–8 次（每次接到一个改 `pay-helpers.ts` 的新 commit 都会）。

## 3a. 实际 rebase 探测（2026-05-05）

确认 第 1 个冲突点（commit `7c5439ff`）后，继续 `git rebase --continue`，第 2 个冲突点出现在 commit `268b5aa7 refactor(payment): move internals into payment/internal/`。这次冲突更大：S3 把 `pay-helpers.ts` 中 ~20 个 helper 函数（`resolveActionPreviewCost` / `canAffordActionPreviewCost` / `payCardPreviewCost` 等）整体迁出到 `payment/internal/`，但 S2 在原文件中保留并扩展了多个 helper —— 整个文件遍布冲突 marker。

**预估剩余工作量**：单个 `268b5aa7` 冲突约 30–45 分钟（逐 helper 决定保留 S2 / 应用 S3-mv），后续还有 ~4–6 个类似规模冲突（`555207ff split improvement.ts` / `f1dbc007 delete legacy helpers shim` 等）。**总耗时估算 1.5–2 小时 dedicated focus session**，超出本会话剩余预算，rebase 已 abort。

**建议**：单独排期一个 dev-day 专门处理 S3 rebase，按路线 B 的"squash 成 3 个语义节点"执行可大幅压缩冲突点（从 6–8 次降到 3 次）。

## 4. 解决路线

### 路线 A：逐 commit rebase（用户原始指示）

```bash
git checkout sprint-S3-payment-solver
git rebase sprint-S2-interaction-request
# 每次冲突后：
#   - 取 S2 的协议 shape（'request' + InteractionRequest）
#   - 把 S3 的命名变化（sortSolutions → sortPaymentSolutions、PaymentSolver namespace）应用到 S2 shape 上
#   - git add -u && git rebase --continue
```

优点：保留 S3 的细粒度 commit history，每个 commit 都自洽。  
缺点：约 6–8 次手工冲突解决，每次需理解 S3 当时的语义意图，约 60–90 分钟集中工作。

### 路线 B：S3 关键节点合并提交

把 S3 commit list 折叠成 3 个语义节点：

1. **添加 PaymentSolver 命名空间**（commits 1–10：types module + namespace + canAfford 委托 + payment/internal 拆分）
2. **caller 端 import 切换**（commits 11–22：improvement / stables / construct / plow / renovation / fence / pay / occupation / exchange / cards / tests 都切到 namespace）
3. **删 helpers 层 shim + 文档同步**（commits 23–32：split improvement.ts + 删 helpers/{payment,pay-helpers,room-payment} + finalize lint）

把 S3 reset 成这 3 个 squashed commit，再 rebase 到 S2。冲突仍在，但仅 3 次集中解决（每次范围更广更需小心，但 history 更易跟踪）。

优点：rebase 操作流程短。  
缺点：丢失 S3 的细粒度 commit message。

### 路线 C：在 S2 上反向 cherry-pick S3 的"成果"

放弃 S3 commit history，直接把 S3 的 head 状态作为一次大 commit 应用到 S2：

```bash
git checkout sprint-S2-interaction-request
git checkout sprint-S3-payment-solver -- shared/actions/payment/  # 复制 payment/ 子目录
# 手工把 helpers/pay-helpers.ts 的删除 + 各 caller 的 import 切换应用上来
# 一次大 commit
```

优点：最简单，单次操作。  
缺点：history 不保留 S3 的演进过程；S3 的 lint guard / docs / ADR-0006 等成果分散到一个大 commit 中。

## 5. 建议

**推荐路线 B（3 个 squashed commits）**：

- S2 完成全部 task（包括尚未完成的 Task 9–13 mixin 抽取 / final cleanup）后再 rebase。
- 在做 Task 13 final cleanup 时同时处理 `pay-helpers.ts` 中 `buildPaymentChoiceResult` 等 shape 升级，使得 rebase 时 S3 commit 1 阶段（添加 namespace）几乎无冲突。
- S3 commit 2 阶段（caller import 切换）冲突应当少（caller 文件 S2 只改 leaf execute 的 promptKey/request shape，与 import 行不重叠）。
- S3 commit 3 阶段（删 helpers shim）需要确认 S2 已不再依赖那 3 个 helpers 文件 — 这是 Task 13 cleanup 的自然产物。

## 6. 当前 S2 进度（决定何时启动 rebase）

| Task | 状态 |
|---|---|
| Task 1–4 | ✅ 完成 |
| Task 5 | ⚠️ 部分（forward-compat farm-select 协议层 + engine 适配；plow/sow leaf 未实际切换 kind） |
| Task 6 | ⚠️ 部分（fence/room/stable leaf 未切换；与 Task 5 同源） |
| Task 7 | ⚠️ 部分（selection 接受 structured payload，仍兼容 split-comma） |
| Task 8 | ⚠️ 部分（lastEmittedChoice cache 与 InteractionNode 包装未做） |
| Task 9–12 | ⏳ 未开工（Setup / Round / Harvest / Draft mixin 抽取；体量最大） |
| Task 13 | ⏳ 未开工（final cleanup） |

**rebase 启动前置条件**：建议至少 Task 13 完成 — 因为 cleanup 会产出最终的 `pay-helpers.ts` shape，是 rebase 路线 B commit 1 阶段的关键 anchor。
