# Sprint S3 — 预 Spec（精简）

- **日期：** 2026-05-03（提前对齐草稿）
- **覆盖：** ENGINE_NEW_ARCHITECTURE.md §15 Sprint S3
- **接口契约：** `2026-05-03-engine-redesign-S2-S4-contracts.md`
- **本 spec 角色：** sprint 启动前的范围 / DoD / 风险预对齐；**真正启动时按 normal flow 重新 brainstorm + grill 一次**

---

## 1. 一句话目标

S3 把当前 1974 行 / 41 export 的 payment 三件套（`payment.ts` / `pay-helpers.ts` / `room-payment.ts`）合并为 `shared/actions/payment/` 单深 module，对外仅 `PaymentSolver.computeOptions / canAfford / execute` 三个 public，并把 `improvement.ts` 985 行瘦到 ≤ 400，使得行动层付款只有一种调用方式。

---

## 2. 范围

### 2.1 in

- **Payment 三件套合并**：`shared/actions/helpers/payment.ts` + `pay-helpers.ts` + `room-payment.ts` → `shared/actions/payment/`
- **PaymentSolver 三 public 接口**：`computeOptions` / `canAfford` / `execute`，签名按契约 §2.2 [L]
- **内部细节封禁**：旧 41 export 中非三 public 部分全部成为模块内部
- **`improvement.ts` 拆三文件**：`improvement.ts`（≤ 400）+ `improvement-options.ts` + `improvement-pool.ts`
- **行动层调用方迁移**：occupation / minor improvement / major improvement effect 全部改调 `PaymentSolver.*`
- **删除旧文件**：合并完成后 `shared/actions/helpers/payment.ts` / `pay-helpers.ts` / `room-payment.ts` 从仓库消失

### 2.2 out

- 不动 `shared/cards/helpers/payment-stats.ts`（卡牌层统计辅助，与付款核心解耦）
- 不动 hook 注册机制（`computeCosts` phase 沿用）
- 不动卡牌 hook（卡牌层不感知重构）
- 不引入 `shared/domain/`（S4）
- 不动 `selection.ts` / farm-related logic（已在 S2 / 留 S4）
- 不重新审视付款规则正确性（保持当前行为，纯重构）

---

## 3. 接口契约引用

- PaymentSolver 三 public 签名 → 契约文档 §2.2
- `Cost` / `Option` / `PaymentChoice` 形状 → 契约文档 §2.3
- 调用方迁移规则 → 契约文档 §2.4
- 内部细节封禁红线 → 契约文档 §2.5

本 sprint freeze 三 public 接口存在 [L]、helpers/payment*.ts 删除 [L]；`Cost` / `Option` 内部字段 [S]，sprint 启动时 grill。

---

## 4. DoD（含 §15 专项 + 共同）

| DoD | 验证方式 |
|---|---|
| `PaymentSolver` 是行动层付款唯一入口 | grep `from.*helpers/payment\|helpers/pay-helpers\|helpers/room-payment` 在 `shared/actions/effects/` 全 0 |
| `improvement.ts` 不再 import payment 三件套 | grep import 路径 |
| `improvement.ts` ≤ 400 行 | `wc -l` |
| `shared/actions/helpers/payment.ts` / `pay-helpers.ts` / `room-payment.ts` 不存在 | `ls` |
| `shared/actions/payment/` 模块对外 export ≤ 4 个（三 public + 类型 namespace） | grep `^export` |
| 「强制 green 子集」全绿 | `pnpm test:fast` |
| 卡牌效果 session 测试零回归（不算 S2 累计 skip） | `pnpm test:slow` 对比基线 |

---

## 5. 风险与缓解（最关键的 6 条）

| 风险 | 概率 | 影响 | 缓解 | 回滚信号 |
|---|---|---|---|---|
| 41 export 中存在隐性"非付款"工具被外部 import（合并后破坏外部代码） | 高 | 中 | sprint 启动第一天做 import audit，列出所有外部使用点；非付款工具迁出到合适位置（不强行塞进 payment module） | audit 发现 ≥ 3 处难分类的 export |
| `room-payment.ts` 的"房间转换为付款"逻辑跨 effect 调用（不只是 improvement） | 中 | 中 | 在 PaymentSolver 内部用专门 sub-module；不让 effect 直接调；sprint 启动时审计所有调用点 | effect 必须直接调 room-payment 内部函数才能写出来 |
| `computeOptions` 与 `canAfford` 内部计算不能完全共享（性能 / 行为漂移） | 中 | 中 | 内部用单一 enumeration core；canAfford 是 computeOptions 的"first hit"包装；用 fuzz test 守门 | 性能下降 ≥ 30% 或 fuzz 出行为差异 |
| `improvement.ts` 拆分时卡牌行为意外漂移 | 高 | 高 | 拆分前先把 improvement 现有测试覆盖率拉到 ≥ 80%；拆分后逐 PR 跑全量 slow project | slow project 任意卡牌测试无故失败 |
| hook `computeCosts` phase 在 PaymentSolver 内部触发顺序与现状不同 | 中 | 中 | sprint 启动时锁定 hook 触发点（在 `computeOptions` 入口、各 hook phase 顺序与现状一致）；用 hook 触发点单元测试守门 | 任一卡牌 hook 行为漂移 |
| 重构期间外部代码（前端 dev panel / 调试 HTTP）import 旧 export 失败 | 中 | 低 | sprint 启动时全仓 grep 一次旧 export 的所有 import；codemod 一次性切换 | dev 启动报 import 错 |

---

## 6. 测试 skip 边界

- **允许 skip**：本 sprint 严格**不允许**新增 skip（S3 是纯重构，不应产生新失败）
- **不允许 skip**：
  - 「强制 green 子集」
  - 全部 payment 相关单元测试
  - improvement 卡牌的 session 测试
- **PR 描述要求**：每个 PR 列「新增 skip 数」必须为 0；如非 0 必须挂"暂时 skip 票据"说明何时解

---

## 7. 前置依赖

- **S2 必须完成**：
  - `InteractionRequest` 8 kind freeze（PaymentSolver 的 `ctx` 形状依赖此）
  - `PendingAction` 删除（避免 PaymentSolver 内部还要兼容旧 pending）
  - `game-core.ts` 拆 traits 完成（避免 PaymentSolver 还要适配单 class）
- ADR-0006 草稿（sprint 启动时起草，不阻塞实施）

---

## 8. 待 sprint 启动时 grill 的开放问题

1. **`PaymentSolver` 的 `ctx` 形状**：是否承载 hook 触发结果？还是 hook 在 PaymentSolver 内部触发，ctx 仅承载"调用方语境"（spaceId / sourceCard / actionId）？倾向后者。
2. **`Option` 类型是否区分"自动"vs"手动"**：有些付款无歧义可自动选；有些必须玩家选。是否在 Option 上加 `requiresChoice: boolean`？还是在 `computeOptions` 返回 `{ auto: Option | null; choices: Option[] }`？
3. **`canAfford` 是否复用 `computeOptions`**：实现简洁但性能差。是否需要专门的"短路 first-hit"路径？
4. **`improvement-pool.ts` 的边界**：池子管理（哪些已被 minor / major 拿走）属于 PaymentSolver 还是 improvement domain？倾向后者。
5. **payment module 的 export 风格**：`PaymentSolver` 是 namespace 还是 class？还是 plain functions（`computeOptions(...)`）？卡牌闭环原则下 plain functions 更合适，但 namespace 利于 grep / 文档可读性。
6. **错误处理**：`execute` 在 invalid choice 时抛错还是返回 `{ ok: false; reason }`？倾向 `Result<state>` 风格，但要与 `GameSession.takeAction` 现有错误模型一致。

---

## 9. 估算（提示性）

- import audit + 非付款工具迁移：~2 PR
- PaymentSolver 三 public 接口落地（保留旧 helpers 共存期）：~3 PR
- 调用方逐文件迁移到 PaymentSolver：~3 PR
- `improvement.ts` 拆三文件：~2 PR
- 删除旧 helpers / 旧 export：~1 PR
- 测试覆盖率拉满 + fuzz 守门：~1 PR

**估算总量：12 PR 上下，1.5 周。** 纯重构 sprint，进度更稳定。
