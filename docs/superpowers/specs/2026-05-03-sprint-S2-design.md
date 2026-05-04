# Sprint S2 — 预 Spec（精简）

- **日期：** 2026-05-03（提前对齐草稿）
- **覆盖：** ENGINE_NEW_ARCHITECTURE.md §15 Sprint S2
- **接口契约：** `2026-05-03-engine-redesign-S2-S4-contracts.md`
- **本 spec 角色：** sprint 启动前的范围 / DoD / 风险预对齐；**真正启动时按 normal flow 重新 brainstorm + grill 一次**，本 spec 作为输入

---

## 1. 一句话目标

S2 完成 `InteractionRequest` sum type 完整推广（8 种 kind）+ `harvestFeed` / `cardDraft` 收口 + `game-core.ts` 拆 Session traits，使得 `PendingAction` union 与 `InteractionState` 8 stateId 完全消失，行动层与 protocol 层只认识"InteractionRequest + resolveChoice"一种交互模型。

---

## 2. 范围

### 2.1 in

- **InteractionRequest 推广剩余 4 kind**：`farm-select` / `selection` / `feed` / `card-draft`
- **下沉派生逻辑**：删 `GameCore.buildPlowInteraction` / `buildSowInteraction` / `buildFenceInteraction` / `buildSelectionInteraction` / `buildFarmInteraction`，逻辑下沉到对应 leaf action 的 `execute()`
- **删除字符串嗅探**：`isFarmPromptKey()` / `isSelectionPromptKey()` 类函数全删
- **协议层简化**：`InteractionState` stateId 8 → 3（`idle` / `wait` / `gameover`），`request: InteractionRequest` 单字段
- **ClientCommand 收敛**：删 `commitFarm` / `commitSelection` / `commitChoice` / `confirmFeed`，全部 `resolveChoice`
- **harvestFeed 推广**：参考 BGA `HarvestTrait` 264 行；落地 `feed` request kind
- **cardDraft 推广**：把现有 `shared/draft/draft-manager.ts`（153 行 simultaneous 模型）包装到 `card-draft` request kind；删 `PendingAction.cardDraft` 挂牌 + `'draftSubmit'` ClientCommand + `/api/game/draft-submit` HTTP 端点，统一走 `resolveChoice`；`DraftOverlay` UI 不重写，只换数据源；**不引入 BGA 风格轮抽**
- **Session 拆 traits**：`game-core.ts` 拆 `session-core.ts` + 4 个 phase mixin（仍在 `shared/session/`，不物理迁移）
- **`PendingAction` union 完全删除**

### 2.2 out

- 不做 Payment 收口（S3）
- 不做 `improvement.ts` 瘦身（S3）
- 不做 `shared/domain/` 引入（S4）
- 不做 `shared/logic/farm/*` 迁移（S4）
- 不做物理目录搬迁（S6）
- 不动卡牌 hook 注册机制
- 不动现有卡牌 desc 文案

---

## 3. 接口契约引用

- 8 种 kind 集合与 payload 字段 → 契约文档 §1.2 / §1.3
- protocol `InteractionState` 简化 → 契约文档 §1.4
- `resolveChoice` 入参规范 → 契约文档 §1.5
- `ChoiceNode` 收敛 → 契约文档 §1.6

本 sprint 只 freeze 8 种 kind 集合 [L]、stateId 三态 [L]、ClientCommand 单一 `resolveChoice` [L]；payload 字段细节按契约 [S]，sprint 启动时 grill。

---

## 4. DoD（含 §15 专项 + 共同）

| DoD | 验证方式 |
|---|---|
| `PendingAction` union 完全删除 | `grep -rn "PendingAction" shared/ server/ src/` 仅在历史注释 |
| `game-core.ts` 单文件 ≤ 800 行 | `wc -l shared/session/game-core.ts` |
| `InteractionState` 只剩 3 个 stateId | grep `stateId:` in `shared/game/types.ts` |
| `ClientCommand` 选择类只剩 `resolveChoice` | grep `commitFarm\|commitSelection\|commitChoice\|confirmFeed` 在 protocol/ws.ts 全 0 |
| `selection.ts` 不再 `choice.split(',')` | grep `\.split(','` in `shared/actions/effects/selection.ts` 全 0 |
| `ChoiceNode` 类型不复存在 | grep `ChoiceNode` in `shared/engine/` 全 0 |
| `ActionExecutionResult.type` 集合：仅 `'request'`（替代 `'choice' \| 'animalReorg'`） | grep `'choice'\|'animalReorg'` in engine result 全 0 |
| 「强制 green 子集」全绿 | `pnpm test:fast` |
| 卡牌 session 测试新增 skip 数 ≤ N（sprint 启动时定 N） | `docs/skip-tracker.md` 累计计数 |

---

## 5. 风险与缓解（最关键的 6 条）

| 风险 | 概率 | 影响 | 缓解 | 回滚信号 |
|---|---|---|---|---|
| `farm-select` payload 设计不兼容 5 种 farmType（plow/sow/fence/room/stable）的差异 | 中 | 高（要回头改 protocol） | sprint 启动时先做 5 种 farmType 的字段差异 audit；payload 用 `farm: { farmType; ...specific }` 嵌套而非平铺 | 5 种之中 ≥ 1 种需要破坏性 payload 改动 |
| cardDraft 包装到 InteractionRequest 时 `DraftOverlay` UI 状态过渡 / 历史房间快照不兼容 | 中 | 低 | UI 数据源切换前后 snapshot 写一组对照测试；持久化房间（含 `phase: 'draft'` 的存档）走 rehydrate 兼容路径 | 已存在的 draft 中房间 rehydrate 后 UI 黑屏 |
| ClientCommand 切换到 `resolveChoice` 后 e2e 测试大面积 skip | 高 | 中 | 提前建 `docs/skip-tracker.md`；codemod 工具一次性把测试切到新命令；e2e 用契约层断言（state / pending / log），不断言按钮文案 | 累计 skip > 阈值（sprint 启动时定） |
| Session traits 拆分时 4 个 phase mixin 边界划错（method 漂移到错的 phase） | 中 | 中 | sprint 启动时按 BGA `BaseTrait` / `HarvestTrait` / `RoundTrait` / `DraftTrait` 对照划边界 | 任一 mixin > 600 行（说明仍是单 class） |
| `promptKey` / `promptParams` 拆解为具名字段时旧文案 i18n key 失配 | 中 | 低 | 保留 i18n key，只改 payload 字段；i18n key 单独留兼容期 | i18n 测试整批失败 |
| 强制 green 子集回归（cursor 序列化 round-trip 测试在 InteractionRequest 重构中破） | 低 | 高 | 把 cursor round-trip 测试列为本 sprint 第一周必跑；任何破裂立刻定位 | 强制 green 子集挂 ≥ 1 项 |

---

## 6. 测试 skip 边界

- **允许 skip**：卡牌效果 session 测试（254 个）中依赖旧 `confirmXxx` 命令的子集；逐项登记 `docs/skip-tracker.md`
- **不允许 skip**：
  - 「强制 green 子集」（§13.1）—— 任何破裂 = sprint 失败
  - cursor 序列化 round-trip 测试（S1 引入，S2 必须保持绿）
  - protocol-level 单元测试（InteractionState / ClientCommand 形状）
- **PR 描述要求**：每个 PR 列「新增 skip 数 / 累计 skip 数」

---

## 7. 前置依赖

- S1 已完成：`InteractionNode` 骨架 + 4 kind（`choice` / `animal-reorg` / `confirm-next-player` / `confirm-player-switch`）
- S1 已完成：`PendingAction.confirmNextPlayer` / `confirmPlayerSwitch` 删除
- S1 已完成：cursor 进 `SerializedGameState`（D-a 决议）
- `docs/skip-tracker.md` 已建立（S1 内或 S2 启动第一天建）
- ADR-0001 / ADR-0002 已合入

---

## 8. 待 sprint 启动时 grill 的开放问题

1. **`card-draft` 是否暴露 per-connection 视角（issue #7）**：当前 `DraftView = DraftState` 全员可见对手 picks；是否在本 sprint 顺手做视角化，还是仍留 issue #7？倾向留——本 sprint 仅做 InteractionRequest 包装。
2. **`feed` payload 是否拆 `feedQueue` 为独立 kind**：当前 `harvestFeed` 把"逐玩家喂食队列"塞 `feedQueue` 字段；是否更适合用嵌套 sub-flow + 单玩家 `feed` request？
3. **Session traits 4 mixin 的命名与边界**：候选 `Setup / Round / Harvest / Draft` 还是 `Setup / Work / Harvest / Breeding`？BGA 对照后定。
4. **`farm-select` 5 种 farmType 是否再分 sub-kind**：当前 sub-kind 在 `farm` 字段内嵌；是否提升为顶层 kind（`farm-plow` / `farm-sow` / ...）？决策点：哪种更利于 leaf action 的 `execute()` 简洁。
5. **`promptKey` 完全删除 vs 保留为 i18n key**：删除会破坏现有 i18n；保留则 protocol 仍带字符串。倾向后者，但要锁定其作用域。

---

## 9. 估算（提示性）

- 8 种 kind 的 payload schema 落地：~3 PR
- harvestFeed 推广 + Session HarvestTrait：~2 PR
- cardDraft 包装到 InteractionRequest（不重写规则）：~1 PR
- Session 拆 traits + game-core 瘦身：~2 PR
- ClientCommand 收敛 + selection.ts 字符串拼接清理：~1 PR
- 测试 codemod + skip 登记：~1 PR

**估算总量：10 PR 上下，1.5 周。** 真实估算 sprint 启动时复核。
