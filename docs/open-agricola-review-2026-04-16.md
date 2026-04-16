# `open-agricola` Code Review

日期：2026-04-16（已按当日后续实现结果更新）
范围：`/home/xuxinhao.titan/raw/open-agricola`
方法：静态审查，对照此前 `bga-agricola` review 的关注点，重点检查流程权威、卡牌封装、全局状态、同步协议、undo 与测试。

状态更新：本文已同步 2026-04-16 当日后续实现结果。其中主链路的 `requestId` 协议关联、room `version` 恢复语义、WS `undo/reconnect` 回归保护，以及 custom card session-context 护栏和前端知识下沉试点均已落地。验证基线为 `Node 22.16.0` 下 `npm test` 通过（`296` 个测试文件，`1831` 个测试通过，`15` 个跳过），`npm run build` 通过，且 `npm run test:e2e -- e2e-tests/ws-dual-player.spec.ts` 通过。

## 执行摘要

本次最初审查未发现与 `bga-agricola` review 同量级的 `Critical` 或 `High` 架构问题。当前实现的总体方向仍然是健康的：

- `server/game-session.ts` 已将 `state`、`engine`、`pending`、`history` 收敛到单一后端会话对象。
- `server/room-manager.ts` 负责把同一次 `SessionResponse` 序列化后广播给房间内所有玩家，而不是多套控制面共同推进同一局。
- 卡牌效果主路径仍然是 `shared/cards/card-effects.ts`、`shared/cards/card-listeners.ts`、`shared/actions/hooks.ts` 这套注册/调度机制。
- 计分主路径 `shared/logic/scoring.ts` 主要通过 `getCardEffect()` 和 bonus score hook 扩展，没有退化成大量卡牌特判的集中分支。
- 大多数卡牌局部状态都保存在 `player.cardStates[cardId]` 与 `extraData` 中，没有出现一个类似 BGA `Globals` 的全局可变状态总线。
- 审查时暴露的 `A28_ForestSchool` / `B109_PaperMaker` / `E33_BeaverColony` 三处通用层泄漏，现已分别收口到 `canUseOccupied`、preview-payment augmentation、`onComputeAnimalZones` 语义链中。

更准确的结论是：

> 当前不是“架构已经失控”；此前最明显的同步协议缺口已经补齐，剩余更值得记录的是两个受控残余设计点：custom card 上下文仍依赖同步前提，以及前端日志/展示层仍保留少量维护性分支知识。

## 严重度定义

- `Medium`：已经出现明确的结构性风险，短期可能还能工作，但若继续扩张，会明显侵蚀架构边界。
- `Low-Medium`：目前问题受控，但依赖较强前提，一旦系统演进，容易变脆。
- `Low`：当前主要是维护性、协议一致性或测试完备度风险，还未构成核心架构失衡。

## 按严重度排序的问题清单（含当前状态）

### 1. `Medium`（审查时，现已解决）：WebSocket 命令与 `stateUpdate` 曾缺少 request-level 关联

涉及子系统：WS 同步协议、前端传输层

审查时的代表证据：

- `src/services/gameTransport.ts` 中，收到任意 `stateUpdate` 就会 resolve 所有待决 promise
- `shared/protocol/ws.ts` 的 `ClientCommand`
- `shared/protocol/game.ts` 的 `StateUpdateEnvelope`

为什么当时值得关注：

- 当前 `WsGameTransport` 本地维护了 `pendingResolvers` 和一个自增 `id`，但该 `id` 没有真正进入协议。
- 协议层没有 `requestId` 或等价字段，因此“哪个命令对应哪个返回”实际上靠的是当前交互串行这一隐含前提。
- 现在之所以还没明显出问题，主要因为大多数前端交互是顺序发生的；一旦未来出现更复杂的自动推进、多端同步、重连补拉、异步流程，这里会成为真实的竞态点。

审查时的典型代码：

```ts
if (msg.type === 'stateUpdate') {
  const envelope = msg as StateUpdateEnvelope
  this.listeners.forEach((cb) => cb(envelope.payload))
  this.pendingResolvers.forEach(({ resolve: res }) => {
    res(envelope.payload)
  })
  this.pendingResolvers.clear()
}
```

相关文件：

- `src/services/gameTransport.ts`
- `shared/protocol/ws.ts`
- `shared/protocol/game.ts`

当前状态（2026-04-16 后续实现）：

- `shared/protocol/ws.ts` 已为 `ClientCommand` 增加 `requestId`
- `shared/protocol/game.ts` 已为 `StateUpdateEnvelope` 增加 `requestId`
- `src/services/gameTransport.ts` 已改为按 `requestId` 精确 resolve/reject，不再对所有 pending promise 一次性清空
- `server/room-manager.ts` 已将命令 `requestId` 透传到 `stateUpdate` / `error`
- 已补 `src/services/__tests__/gameTransport.test.ts` 与 `server/__tests__/room-manager-ws-sync.test.ts` 回归

后续建议：

- 保持协议层 `requestId` 为 request-response 关联的唯一来源，不要退回到“默认串行就没事”的隐式假设
- 如未来扩展 patch / 增量同步，继续沿同一 request/version 语义演进，而不是另起一套旁路关联机制

### 2. `Low-Medium`（已加护栏，仍为受控残余设计点）：custom card 会话上下文仍依赖模块级可变指针

涉及子系统：custom card 注册、会话级卡牌查找

当前证据：

- `shared/cards/session-card-context.ts` 使用模块级 `currentSessionContext`
- `shared/cards/custom-registry.ts` 中仍保留 global fallback registry
- `server/game-session.ts` 依赖 `withSessionContext()` 把 lookup 绑定到当前会话

为什么仍值得记录：

- 这是当前最接近 BGA `Globals` 风格的地方，不过范围远小得多。
- 它不是整局游戏状态总线，而是 custom card 的 lookup 上下文；问题不在“现在会错”，而在它依赖一个很强的前提：命令处理必须完全同步。
- 代码注释已经明确写出这一点，因此这更像“一个当前可接受但未来会脆的设计点”。

当前实现中的典型代码：

```ts
let currentSessionContext: SessionCardContext | null = null

export function withSessionContext<T>(ctx: SessionCardContext | null, fn: () => T): T {
  const prev = currentSessionContext
  currentSessionContext = ctx
  try {
    return fn()
  } finally {
    currentSessionContext = prev
  }
}
```

相关文件：

- `shared/cards/session-card-context.ts`
- `shared/cards/custom-registry.ts`
- `server/game-session.ts`

当前状态（2026-04-16 后续实现）：

- `server/game-router.ts` 与 `server/room-manager.ts` 中会进入会话卡牌执行的主入口都已包在 `session.withCtx()`
- `shared/cards/custom-registry.ts` 已对无 session context 的 global fallback 增加显式告警；只有前端同步和少数 legacy/test 路径才显式 `allowGlobal`
- 已补 `server/__tests__/game-session-custom-context.test.ts`，覆盖同进程两个 `GameSession` 的隔离 lookup

后续建议：

- 继续保持 `GameSession` 命令处理同步化，不要在此基础上偷偷引入异步流程。
- 如果未来必须异步化，优先改成显式 session-scoped lookup，而不是继续依赖模块级当前上下文。
- 把“同步前提”继续视为设计约束，而不是当成已经消失的问题。

### 3. `Low`（审查时，现已解决）：房间同步版本号曾存在持久化与恢复不一致

涉及子系统：房间持久化、同步版本元数据

审查时的代表证据：

- `server/room-manager.ts` 保存 SQLite 房间状态时会执行 `version = version + 1`
- 但恢复房间时，内存里的 `Room.version` 又重新从 `0` 开始
- `server/db.ts` 的 `rooms` 表中已经定义了 `version` 字段

为什么当时值得关注：

- 在当前“全量 snapshot 广播”模型下，这个问题不会动摇 `GameSession` 的权威性。
- 但如果以后更依赖 `version` 做严格的 resync、patch 校验或跨重启版本连续性，这里会变成同步层缺口。
- 它更像协议元数据治理问题，而不是领域状态问题。

相关文件：

- `server/room-manager.ts`
- `server/db.ts`
- `shared/protocol/game.ts`

当前状态（2026-04-16 后续实现）：

- SQLite 房间恢复时已读回持久化 `version`
- 固定 `dev` 房间在 SQLite 模式下也已复用同一恢复语义，不再重启后回到 `0`
- `server/__tests__/room-manager-seat.test.ts` 已补 version 恢复断言

后续建议：

- 若未来引入 patch / delta sync，可直接在当前稳定 `version` 语义上继续扩展，不必再返工恢复路径

### 4. `Low`（已部分收口，仍属维护性残余）：前端仍保留少量协议和规则常量知识

涉及子系统：前端 UI、日志渲染、局部交互语义

当前证据：

- `src/app/GameContainerApi.tsx` 已减少对 `baseActionOrder` 和默认 `allowedCommands` 这类前端内建规则常量的依赖
- `src/components/board/LogPanel.tsx` 对大量 `entry.key` 做分支渲染

为什么仍值得记录：

- 这和 BGA review 里“前端承担大量状态名与通知名知识”属于同类风险，但程度低很多。
- 当前前端没有裁定规则，决定“能不能做”和“状态怎么变”的仍然是后端。
- 真正的问题是维护成本：协议和日志语义一旦演进，前端这些映射需要同步更新。

相关文件：

- `src/app/GameContainerApi.tsx`
- `src/components/board/LogPanel.tsx`

当前状态（2026-04-16 后续实现）：

- `src/hooks/useGameSync.ts` 已去掉默认 `allowedCommands` 占位策略
- `src/app/GameContainerApi.tsx` 已改为更多依赖后端快照顺序，而不是本地 `baseActionOrder` 重排
- `shared/protocol/game.ts` 已新增共享 `ActionDetailParts` 类型，`src/components/board/LogPanel.tsx` 对 `log.actionDetail` 至少不再完全靠组件内自定义结构猜测

后续建议：

- 继续把高频日志从“`entry.key` + 本地分支解释”推进到更结构化 payload
- 把这里当作维护性债务清理面，而不是后端权威性风险

### 5. `Low`（审查时，现已解决）：测试基础设施很强，但多人 WS undo/resync 的 E2E 保护曾偏弱

涉及子系统：测试、多人同步、undo 回归

审查时的代表证据：

- 仓库内存在大量 `server/__tests__`、`shared/**/__tests__`、`tests/*.test.ts` 与 `e2e-tests/*.spec.ts`
- `tests/pending-undo-regression.test.ts`、`tests/game-sync-pipeline.test.ts` 已覆盖很多后端与同步链路关键点
- `e2e-tests/ws-dual-player.spec.ts` 当时的 undo 场景更多是截图和打印状态，断言力度不足

为什么当时值得关注：

- 这点和 `bga-agricola` review 的“测试几乎不可见”完全不同，`open-agricola` 的测试基础是明显存在且较强的。
- 真正的缺口在于多人 WS 主链路的关键回归场景，尤其是 undo/reconnect 这类“最容易边界出错”的流程。
- 也就是说，这里不是“没有测试”，而是“最重要的联机主链路断言还可以更硬”。

相关文件：

- `tests/pending-undo-regression.test.ts`
- `tests/game-sync-pipeline.test.ts`
- `server/__tests__/room-manager-seat.test.ts`
- `e2e-tests/ws-dual-player.spec.ts`

当前状态（2026-04-16 后续实现）：

- 已补 `server/__tests__/room-manager-ws-sync.test.ts`，覆盖 action / undo / getState-resync 的 WS 服务端链路
- `e2e-tests/ws-dual-player.spec.ts` 已改为断言双窗口同一 action space 的 taken 状态、undo 回滚，以及 reconnect 后最新快照收敛
- 现阶段多人 WS 主链路保护已从“截图观察”提升到“确定性断言”

后续建议：

- 继续保持“规则正确性以后端/session 测试为主，联机主链路以 E2E 为补充”的分层策略

## 子系统逐项结论

### A. 流程权威与状态机

总体评级：健康

结论：

- 没有发现类似 BGA review 中“BGA state machine + Engine + Globals + custom turn order 多头驱动同一局”的 `Critical` 级问题。
- `GameSession` 依然是单一权威容器，`RoomManager` 只做广播与路由。
- `HTTP` 调试会话和 `WS` 房间会话是两条不同容器路径，不是在共同写同一局状态。

关键文件：

- `server/game-session.ts`
- `server/room-manager.ts`
- `server/game-router.ts`
- `shared/game/serialization.ts`

### B. 卡牌系统与封装边界

总体评级：低风险（本轮已完成一轮收口）

结论：

- 主体结构是健康的，卡牌仍主要通过 hook / listener / effect / modifier 扩展。
- 审查时定位的 `A28_ForestSchool`、`B109_PaperMaker`、`E33_BeaverColony` 三处泄漏点，现已迁回统一扩展语义，并由结构护栏测试防止回退。
- 当前这里更像“需要持续保持纪律”的边界，而不是一个仍在扩大的活动型架构问题。

关键文件：

- `shared/cards/card-effects.ts`
- `shared/cards/card-listeners.ts`
- `shared/actions/hooks.ts`
- `shared/actions/effects/occupation.ts`
- `shared/actions/effects/move-farmer-to-space.ts`
- `shared/actions/effects/animals.ts`
- `shared/actions/effects/__tests__/card-leakage-guardrails.test.ts`

### C. 状态归属与全局上下文

总体评级：低风险（存在受控残余约束）

结论：

- `player.cardStates[cardId]` 与 `extraData` 基本承担了卡牌局部状态职责，没有退化为整局共享的全局状态总线。
- custom card 的 `currentSessionContext` 仍是一个需要明确约束的窄口设计点，但现在已经有入口审计、fallback 告警和隔离测试做护栏。

关键文件：

- `shared/game/types.ts`
- `shared/cards/helpers/card-state.ts`
- `shared/cards/session-card-context.ts`
- `shared/cards/custom-registry.ts`

### D. 同步协议与前端边界

总体评级：低风险（主要协议缺口已补齐）

结论：

- 前端不是第二套规则引擎，整体仍然是“后端裁定 + 前端被动渲染”。
- `requestId` 协议关联已经补齐；当前剩余的主要问题是少量 UI 侧维护性知识，而不是同步层竞态缺口。

关键文件：

- `src/services/gameTransport.ts`
- `shared/protocol/ws.ts`
- `shared/protocol/game.ts`
- `src/app/GameContainerApi.tsx`
- `src/hooks/useGameSync.ts`

### E. undo、日志与 UI 重建

总体评级：低风险

结论：

- 与 BGA review 相比，这里明显更干净。undo 的权威恢复仍然在后端完成，前端主要消费快照和历史元数据。
- 当前更像是日志展示层与 `entry.key` 的维护性耦合，而不是领域回滚与 UI 刷新深度绑死。

关键文件：

- `server/game-session.ts`
- `src/hooks/useGameSync.ts`
- `src/components/board/LogPanel.tsx`

### F. 测试与工程化

总体评级：健康（主链路回归已补强）

结论：

- 自动化测试基础设施是这个项目的明显优点，不存在“测试几乎不可见”的问题。
- 多人 WS 主链路的 action / undo / reconnect 关键断言已补齐；后续更适合按新增特性继续增量补场景，而不是把这里继续当作一个开放问题。

关键文件：

- `tests/pending-undo-regression.test.ts`
- `tests/game-sync-pipeline.test.ts`
- `server/__tests__/room-manager-seat.test.ts`
- `e2e-tests/ws-dual-player.spec.ts`

## 建议的后续优先级

### 已完成（2026-04-16 后续实现）

- `shared/actions/effects/occupation.ts` 不再直接识别 `B109_PaperMaker`
- `shared/actions/effects/move-farmer-to-space.ts` 不再直接识别 `A28_ForestSchool`
- `shared/actions/effects/animals.ts` 不再直接识别 `E33_BeaverColony`
- `ClientCommand` / `StateUpdateEnvelope` 已增加显式 `requestId`
- `WsGameTransport` 已改为按请求精确 resolve/reject
- SQLite 房间与固定 `dev` 房间的 `version` 恢复语义已统一
- 已补 transport/server/E2E 三层 `undo/reconnect` 回归保护
- custom card session-context 已补入口护栏、global fallback 告警与隔离测试
- `useGameSync` / `GameContainerApi` / `LogPanel` 已完成一轮前端知识下沉试点
- 验证基线已更新为 `npm test`、`npm run build`、以及 `npm run test:e2e -- e2e-tests/ws-dual-player.spec.ts` 通过

### 仍建议关注（非阻塞）

- 若未来命令处理跨入真实异步边界，优先评估 `AsyncLocalStorage` 或显式 session-scoped lookup，替换模块级 `currentSessionContext`
- 若日志协议继续演进，优先把 `LogPanel` 中高频 `entry.key` 分支进一步下沉为更结构化 payload / schema

## 总结

`open-agricola` 当前最重要的结论不是“问题很多”，而是“主设计是对的；这轮 review 暴露的主链路同步缺口已经补齐，剩余更像受控的长期边界约束与维护性问题”。

与 `bga-agricola` 那份 review 相比，这里没有看到：

- 多套状态源共同驱动流程
- 大量核心模型中散落的单卡 if-else 网络
- 类似 `Globals` 的全局可变状态总线
- 通知、撤销、UI 刷新互相缠死
- 测试基础设施几乎缺席

当前真正值得继续警惕的，是两类受控残余设计点，以及一类需要持续防回退的已处理点：

- custom card 上下文依赖“引擎绝对同步”这一设计前提
- 前端日志与展示层仍保留少量 `entry.key` 分支式维护成本
- 已收口的 card leakage 与同步协议改造需要继续靠回归测试和代码审查维持，避免后续回退

只要继续沿着当前收口方向推进，并把上述两个残余设计点控制在“明确约束 + 小步演进”的范围内，项目大概率不会走向 `bga-agricola` review 里那种“边界没被持续强化，复杂度开始反噬架构”的状态。
