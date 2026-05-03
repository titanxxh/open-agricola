# Sprint S4 — 预 Spec（精简）

- **日期：** 2026-05-03（提前对齐草稿）
- **覆盖：** ENGINE_NEW_ARCHITECTURE.md §15 Sprint S4
- **接口契约：** `2026-05-03-engine-redesign-S2-S4-contracts.md`
- **本 spec 角色：** sprint 启动前的范围 / DoD / 风险预对齐；**真正启动时按 normal flow 重新 brainstorm + grill 一次**

---

## 1. 一句话目标

S4 引入 `shared/domain/` 聚合层（`PlayerBoard` / `Pasture` / `Farmyard` / `AnimalZones`，派生视图、不可变），同期完成节点充血（`shared/engine/nodes/*.ts` 每节点一文件、行为下沉），使行动层 effect 不再直接 import `shared/logic/farm/*`，effect 平均行数下降 ≥ 30%，engine.ts 主文件 ≤ 600 行。

---

## 2. 范围

### 2.1 in

- **新建 `shared/domain/`**：
  - `PlayerBoard`：玩家整体视图（farm + animals + cards 协同）
  - `Pasture`：牧场（围栏围出的区域）
  - `Farmyard`：农场版图（耕地、房间、栅栏等格子）
  - `AnimalZones`：动物分区视图
- **现有散件迁入**：
  - `shared/logic/farm.ts` → 拆入 `PlayerBoard` / `Farmyard`
  - `shared/logic/farm/build-room-helper.ts` / `plow-validation.ts` / `sow-validation.ts` / `farm-interaction.ts` → 入 `Farmyard`
  - `shared/logic/farm/fence-validation.ts` → 入 `Pasture`
  - `shared/logic/farm/occupation-hand-interaction.ts` → 入 `PlayerBoard`（或单独 `Hand` 聚合，sprint 启动时定）
  - `shared/logic/farm/validators.ts` → 按职责拆入对应聚合
  - `shared/actions/helpers/animal-zones.ts` → 入 `AnimalZones`
- **行动层 effect 改写**：调 `playerBoard(state, idx).xxx()` 取代直接 import 散件
- **节点充血**：
  - `shared/engine/engine.ts` 1828 行 → 主文件 ≤ 600 行
  - `shared/engine/nodes/` 每节点一文件
  - 节点内行为不再依赖 engine.ts 主文件的 switch
- **客户端安全契约**：`shared/domain/` 不 import Node API / React；S4 内用单元测试守门（ESLint 强制留 S6）

### 2.2 out

- 不做物理目录搬迁（`shared/contract/` / `shared/cards-display/` 等留 S6）
- 不重新审视农场规则（保持当前行为，纯重构 + 引入聚合）
- 不动 PaymentSolver（S3 完成的成果保持不变）
- 不动 InteractionRequest（S2 完成的成果保持不变）
- 不动卡牌 hook 注册机制
- 不引入新 hook phase

---

## 3. 接口契约引用

- 四个聚合存在 + 覆盖现有散件 → 契约文档 §3.2
- 客户端安全契约 → 契约文档 §3.3
- 调用模式 → 契约文档 §3.4
- 节点充血同期落地 → 契约文档 §3.5

本 sprint freeze 四聚合存在 [L]、节点充血同期 [L]、`shared/logic/farm/` 消失 [L]；各聚合 public 方法清单 [O]，sprint 启动时定。

---

## 4. DoD（含 §15 专项 + 共同）

| DoD | 验证方式 |
|---|---|
| `shared/logic/farm/` 目录不复存在 | `ls` |
| 行动层 effect 平均行数下降 ≥ 30% | `wc -l shared/actions/effects/*.ts` 对比 baseline |
| `engine.ts` 主文件 ≤ 600 行 | `wc -l shared/engine/engine.ts` |
| `shared/engine/nodes/*.ts` 每节点一文件 | `ls shared/engine/nodes/` 与节点 type 数一致 |
| `shared/actions/helpers/animal-zones.ts` 不存在 | `ls` |
| 行动层 effect 不再直接 import `shared/logic/farm/*` | grep import 路径全 0 |
| `shared/domain/` 不 import Node API / React | grep `from 'fs'\|from 'path'\|from 'react'` 全 0；CI lint rule |
| 「强制 green 子集」全绿 | `pnpm test:fast` |
| 卡牌效果 session 测试零回归（不算 S2 累计 skip） | `pnpm test:slow` 对比基线 |

---

## 5. 风险与缓解（最关键的 6 条）

| 风险 | 概率 | 影响 | 缓解 | 回滚信号 |
|---|---|---|---|---|
| 散件迁移波及面广，effect 改写过程中行为意外漂移 | 高 | 高 | 迁移分两步：(1) 在 `shared/domain/` 加 facade，行为不变，effect 不改；(2) effect 逐文件切换调用方式，每切一文件跑全 slow project | slow project 卡牌测试无故失败 ≥ 1 |
| 节点充血与 domain 同期落地，PR 链过长且互相 block | 中 | 中 | 拆两条 PR 链：domain 引入（不动 engine）+ 节点充血（不动 effect）；最后用一条 PR 把 effect 切到 domain | 任一链超过 2 周仍未合 |
| `Farmyard` / `Pasture` 边界划不清（围栏既属于 Farmyard 格子又属于 Pasture 区域） | 中 | 中 | sprint 启动时先做边界 audit；倾向 `Farmyard` 持有"格子级"信息，`Pasture` 是 `Farmyard` 之上的派生视图 | audit 发现 ≥ 3 个 method 必须放两处 |
| `shared/domain/` 不可变约定被违反（隐性持久化到 GameState） | 中 | 高 | 聚合用 freeze 包装；行动层调用时禁止 `playerBoard(...).xxx = y`；TS 用 `readonly` 属性 + 单元测试守门 | grep `playerBoard.*=\|\.xxx = ` 出现 |
| `shared/logic/round.ts` / `scoring.ts` / `state.ts` 等其他 logic 散件被误拖进 domain | 中 | 中 | 范围严格限定 farm + animals 相关；其他 logic 散件不动，留 S6 物理分层一并处理 | sprint PR 出现 round/scoring 改动 |
| effect 平均行数下降目标（≥ 30%）未达成（domain 抽象不够好） | 中 | 中 | sprint 启动时取一个最复杂 effect（如 `improvement.ts` 中的 fence / room 相关）做 spike，验证 30% 可达 | spike 后实测下降 < 15% |

---

## 6. 测试 skip 边界

- **允许 skip**：与 S3 一致，本 sprint 严格**不允许**新增 skip
- **不允许 skip**：
  - 「强制 green 子集」
  - 全部农场相关单元测试（plow / sow / fence / room）
  - 全部 farm 行动卡牌的 session 测试
- **PR 描述要求**：每个 PR 列「新增 skip 数」必须为 0；effect 改写 PR 必须列「effect 行数变化」表

---

## 7. 前置依赖

- **S2 必须完成**：`InteractionRequest` 8 kind freeze（farm-select / selection 等 kind 的 leaf action 已经下沉，S4 改 effect 时面对的是稳定的 kind 形状）
- **S3 不强制完成但建议完成**：S3 后 effect 已经清爽（`improvement.ts` 拆三文件），S4 改 effect 时面对的代码更可控
- **如果 S3 与 S4 并行**：S4 不得动 payment 相关代码；S3 不得动 farm logic 相关代码
- ADR-0003 / ADR-0004 草稿（sprint 启动时起草，不阻塞实施）

---

## 8. 待 sprint 启动时 grill 的开放问题

1. **聚合粒度是否需要再拆**：`PlayerBoard` 是否应进一步拆出 `Hand`（手牌） / `Cards`（已打卡）/ `Family`（家庭成员）？倾向不拆——避免聚合爆炸；BGA 也是把这些放一起。
2. **`Pasture` vs `Farmyard` 的方法重叠**：围栏既是 `Farmyard` 格子级数据也是 `Pasture` 区域级派生。重叠 method 放哪一边？倾向 `Pasture` 是 `Farmyard.computePastures()` 的返回，不持有独立状态。
3. **节点充血每节点一文件的拆分顺序**：先拆 `SequenceNode` / `ParallelNode`（最常用）还是先拆 `ChoiceNode → InteractionNode`（已 S2 改名）？拆分顺序影响 PR 链稳定性。
4. **`engine.ts` 600 行如何分配**：剩下来的 600 行职责是什么？倾向只剩 `step()` / `EngineStack` / cursor 序列化，节点 dispatch 完全下沉。
5. **`AnimalZones` 是否还需要独立聚合**：如果 `AnimalZones` 的 method 都是 `PlayerBoard.animals` 的派生，是否合并进 `PlayerBoard`？倾向独立—— BGA 也有专门的 animal zones 计算模块。
6. **客户端安全契约的强度**：S4 内是 lint rule 还是仅口头约定？倾向 lint rule（不等 S6）；CI 加 deny `import.*from 'fs'` 在 `shared/domain/` 子树。
7. **节点充血是否破坏现有节点 type discriminator**：现有 `node.type === 'sequence'` 等字符串判断在哪里出现？充血后是否改 instanceof 检查？倾向保留 type 字符串（序列化必需），但内部行为下沉到 class method。

---

## 9. 估算（提示性）

- domain 聚合 facade 引入（行为不变）：~3 PR
- 节点充血 + engine.ts 瘦身：~4 PR（节点多）
- effect 逐文件切换到 domain：~5 PR（effect 多）
- 散件物理迁移 + 删除 `shared/logic/farm/`：~2 PR
- 客户端安全 lint rule：~1 PR
- 行数指标 + 测试基线对比：~1 PR

**估算总量：16 PR 上下，2 周。** 改动面最广，PR 链管理重要。
