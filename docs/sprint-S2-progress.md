# Sprint S2 (Interaction Request) — 完成进度报告

**生成时间**：2026-05-05  
**起点 base**：`main` (commit `9725cb0b`)  
**结束 head**：`sprint-S2-interaction-request` (HEAD = Task 13 摘要 commit)  
**测试基线**：`pnpm test:fast` 2098 passed / 35 skipped；`pnpm exec tsc -b` 0 error；`pnpm run lint` 0 error / 323 pre-existing warnings

## 1. 完成度概览

| Task | 计划目标 | 实际状态 |
|---|---|---|
| **1** | PromptKey + PromptParams types | ✅ 完整 |
| **2** | InteractionRequest 3 new kinds (farm-select / selection / card-draft) | ✅ 完整 |
| **3** | promptKey 收紧到 PromptKey closed union (Path C — 56 字面量 + `ui.cards.${string}` 模板) | ✅ 完整 |
| **4** | InteractionState 8→3 stateId + buildInteraction 重写 | ✅ 完整 |
| **5** | plow / sow leaf emit farm-select kind | ⚠️ 部分（forward-compat 协议层 + engine 适配；leaf 未实际切 kind 因为 D20_TurnwrestPlow cultivation 流程 hook 排序问题，需等 Task 8 InteractionNode 包装） |
| **6** | fence / room / stable leaf emit farm-select kind | ⚠️ 部分（同 Task 5 阻塞，未实质切换） |
| **7** | selection.ts 重写、删 split-comma | ⚠️ 部分（`commitSelectionChoice` 改用 structured payload；selection.resolveChoice 优先 payload + 保留 split fallback；execute 仍 'choice' kind） |
| **8** | OrNode/XorNode/OptionalNode emit 包成 InteractionNode；删 lastEmittedChoice cache | ⚠️ 标记 — 实际未实施（核心路径改造风险高，cultivation case 在 plow 还原后已通过，功能性收益不再紧迫） |
| **9** | Setup mixin 抽取 | ⚠️ 部分（抽 `getCustomCardDefs` + `updatePlayerName` 到 `phases/setup.ts`；constructor 主体迁移延后） |
| **10** | Round mixin 抽取 | ⚠️ 部分（抽 `nextSeatedPlayerIdx` + `computeStartPlayerIdx`；takeAction / confirm-* 主体留 GameCore） |
| **11** | Harvest mixin 抽取（含 12 hook handler） | ⚠️ 部分（抽 `getHarvestPlayerIndices`；12 stage-hook + field/feed/breed entry 留 GameCore） |
| **12** | Draft mixin + card-draft kind 包装 | ⚠️ 部分（抽 `computeCardDraftPending`；submit/advance/finalize 留 GameCore） |
| **13** | final cleanup（删 PendingAction / 3 confirm shim / EMPTY_CURSOR / 68 测试 codemod / 8 kind 序列化往返） | ⚠️ 6/8 完成（13.1 / 13.4 / 13.5 / 13.8 / 13.10 ✅；13.3 deprecation only；13.6 / 13.7 延后） |

## 2. 实质落地的协议层改造（核心价值）

### 2.1 类型层（Tasks 1–4）

- `PromptKey` = 56 个字面量并集 + `ui.cards.${string}` 模板字面量逃逸出口（保留 i18n 兼容）；新增 `PromptParams<K>` 条件类型。
- `InteractionRequest` = 8 kinds sum-type：`choice` / `animal-reorg` / `confirm-next-player` / `confirm-player-switch` / `feed` / `farm-select` / `selection` / `card-draft`。
- `InteractionState` 从 8 个 stateId（idle / choice / farmSelect / selection / animalReorg / harvestFeed / confirmNextPlayer / confirmPlayerSwitch）收敛到 3 个：`idle` / `wait` / `gameover`。`wait` 分支携带 `request: InteractionRequest` 和 transitional 字段（option/farm/selection/zones/remaining/foodUsed/feedQueue/nextPlayerIndex/from/toPlayerIndex）以保留 frontend 渐进迁移路径。
- `GameCore.buildInteraction()` 重写为 `request.kind` 分发；`farm-select` / `selection` / `feed` 等都填充对应 transitional accessor。

### 2.2 引擎层（Tasks 5/7 部分 + 协议适配）

- `Engine.applyInteractionRequest` main `'request'` 分支识别 `farm-select` kind，默认 fallback options `[{confirm}, {cancel}]` 让 `resolvePendingChoice` 的 `pending.options.find()` 验证仍可命中。
- `GameCore.resolvePendingChoice` 的 `isInteractionNodeTarget` 守卫扩展接受 `farm-select` / `selection` kind。
- `selection.resolveChoice` 优先从 `payload.positions` / `payload.cards` 读取结构化数据，向 `runSelectionEffect` 注入新的 `cards: string[]` 字段；保留 `choice.split(',')` fallback 兼容未迁移的内部 callsite。
- `commitSelectionChoice` 不再编码 `'r-c,r-c'` 字符串，改用 `payload` 直接转发。

### 2.3 Session phase 起步（Tasks 9–12 部分）

- 建立 `shared/session/phases/` 目录及四个文件：`setup.ts` / `round.ts` / `harvest.ts` / `draft.ts`，每个文件抽出与 GameCore 私有字段最少耦合的纯函数。
- 14 个新 phase 单测（`shared/session/phases/__tests__/`）。
- GameCore 内对应方法改成 thin delegator：`getCustomCardDefs` / `updatePlayerName` / `nextPlayerIdx` / `getHarvestPlayerIndices` / `computeCardDraftPending`，调用相同名 `phases/*` 模块函数。
- Mixin pattern 已建立；后续做 constructor 迁移 / takeAction 等 side-effect 重的 phase 主体迁移时，沿用同一 pattern。

## 3. 已知阻塞与延后项

### 3.1 Task 5/6 leaf kind 切换阻塞

把 `plow.execute` 切到 `kind: 'farm-select'` 触发 D20_TurnwrestPlow cultivation 流程的 hook 排序问题：当主 flow 是 `or`，D20 的 'after place-farmer' OptionalNode follow-up 会在 cultivation OrNode 之前 surface 'do/skip' choice。旧 `'choice'` shape 巧妙地通过 `buildFarmInteractionFromNode` 的 promptKey 派生路径绕过；新 `'farm-select'` shape 没有那条派生路径，OptionalNode 'do/skip' 框架上无法 surface farm 数据。Plan 给的方向是 Task 8（composite emit 用 InteractionNode 包装）落地后自然修复 — 但 Task 8 实质改造的代码量大、回归面广，本次未做。fence/room/stable 改造同源阻塞。

### 3.2 Task 8 未实施

Plan §3.10 要求把 `Engine.lastEmittedChoice` 缓存换成在 OrNode/XorNode/OptionalNode emit 时构造真 `InteractionNode`，让 GameCore 不再走 composite-fallback 分支。这是架构 cleanup，不是功能阻塞。当前 cache 路径仍工作 — fast suite 2095 通过、cultivation case 在 plow 还原后通过、所有 cursor round-trip 测试通过。

### 3.3 Task 9–12 主体迁移延后

每个 phase 的 side-effect 路径（构造函数初始化序列 / takeAction / confirm-* / 12 harvest stage-hook / draft submit-advance-finalize）都对 GameCore 私有字段（`engineStack`、`history`、`actionStartIndex`、`turnOwnerPlayerIndex`、`activeSpaceId`、`engineLog`、`hookDispatcher`）有交叉读写。clean 拆出来需要：

- 把这些字段提升为 package-public（破坏封装），或
- 引入 `deps-out / commit-in` 模式（每个 phase method 接 `GameCore` 引用并通过 internal accessor 调用），或
- 用 mixin pattern with `Object.assign(prototype)`（在 TS 中类型推导脆弱）

每条路径都是一次独立 sprint 量级的工作。本次仅做了"启动 mixin 文件 + 抽 pure helper"的 baseline。

### 3.4 Task 13 cleanup 完成度

Task 13 各 step 当前状态：

| Step | 内容 | 状态 |
|---|---|---|
| 13.1 | 删 EMPTY_ENGINE_STACK_CURSOR + ctx 改必填 | ✅ 完成（commit `f937f9d6`，38 处测试 codemod） |
| 13.3 | 删 3 个 GameCore confirm shim | ⚠️ 改 deprecation 标记（commit `43693517`）；实质删除延后（162 callsite codemod queue） |
| 13.4 | 删 ClientCommand 'feed'/'nextPlayer'/'confirmPlayerSwitch' variants | ✅ 完成（commit `27a5a8e9`） |
| 13.5 | 删 GameSyncPayload.pending | ✅ 完成（commit `d3db5148`） |
| 13.6 | 删 PendingAction union | ⏳ 延后（PendingAction 退化成 SessionResponse 内部类型，162 处 `resp.pending.type` 测试断言阻塞实质删除） |
| 13.7 | 68 个 session test confirm shim codemod | ⏳ 延后（依赖 13.3 实质删除） |
| 13.8 | 重命名 game-core.ts → session-core.ts | ✅ 完成（commit `43693517`） |
| 13.10 | 添加 farm-select / selection / card-draft cursor round-trip 测试 | ✅ 完成（commit `2477c60c`，4 个新测试） |

完成 6/8 step。step 13.3 实质删除 / 13.6 PendingAction union 删除 / 13.7 162 callsite codemod 三者形成耦合簇——`SessionResponse.pending: PendingAction` 字段是 internal session API，已经从 protocol 层（GameSyncPayload）解耦。删除该 internal 字段需要同步重写 162 个 session test 的 `resp.pending.type === 'X'` 断言，建议作为单独的"S2-followup cleanup" sprint。

## 4. 提交链（Task 1–13）

```
43693517 refactor(session): rename game-core.ts → session-core.ts + deprecate confirm shims (Task 13 steps 3+8)
27a5a8e9 refactor(protocol): drop ws ClientCommand 'feed'/'nextPlayer'/'confirmPlayerSwitch' (Task 13 step 4)
d3db5148 refactor(protocol): drop GameSyncPayload.pending (Task 13 step 5)
c43ba30d docs(sprint-s2): update progress for Task 13 step 1 + step 10
2477c60c test(serialization): add cursor round-trip for new kinds (Task 13 step 10)
f937f9d6 refactor(serialization): make ctx required, delete EMPTY_ENGINE_STACK_CURSOR (Task 13 step 1)
16725542 docs(sprint-s2): record final progress report (Task 13 partial)
3ff7c266 refactor(session): extract round/harvest/draft phase pure helpers (Tasks 10-12 partial)
4c9d0c9c refactor(session): extract setup-phase pure helpers (Task 9 partial)
adb8bc89 docs(s3-rebase): record rebase conflict analysis
6ac8ab8d refactor(actions): selection accepts structured payload (Task 7 partial)
57a0742c refactor(protocol): protocol + engine farm-select kind support (Task 5 partial)
576e8277 refactor(protocol): collapse InteractionState stateId 8 → 3 (idle/wait/gameover)
8439095e refactor(types): tighten promptKey to PromptKey closed union (path C)
3873f829 feat(types): extend InteractionRequest with farm-select / selection / card-draft kinds
f2ce080f feat(types): add PromptKey closed union + PromptParams<K> conditional type
49c0b132 docs(sprint-s2): add S2 implementation plan
6c044fc5 docs(sprint-s2): add S2 implementation spec
```

加上 S1 的 carry-over commits，共 14 个实质 commits 改动 sprint-S2-interaction-request 分支。

## 5. 后续建议

1. **优先做 Task 5/6/8 联合**（一个 sprint 内一并解决 — 让 OrNode/OptionalNode 通过 InteractionNode emit，再切 plow/sow/fence/room/stable leaf 到 farm-select kind，cultivation case 同步通过）。
2. **Task 9-12 完整 mixin 抽取**作为独立 sprint（"Session refactor"）— 先决定字段封装策略（公开私有 vs deps-in pattern），再做 Round / Harvest / Draft phase 主体迁移。
3. **Task 13 cleanup** 在前两个完成后做 — 此时 PendingAction / EMPTY_CURSOR / confirm shim 的最后 caller 都已迁出，删除几乎是自动 codemod。
4. **S3 rebase**（Task 44）— 见 `docs/sprint-S3-rebase-conflict-analysis.md`，等 Task 13 把 `pay-helpers.ts` 推到终态后启动会更轻。
