# PR-5 Card Draft (Simultaneous) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在游戏开始时增加"并行轮传 draft 阶段"——每玩家 `poolSize ∈ {7,8,9,10}` 张 occ + minor，7 轮每轮同时挑 1 occ + 1 minor 并顺时针传池。完成后按正常流程进入对局。

**Architecture:** `GameState.phase: 'draft' | 'playing'` + `GameState.draft: DraftState | null`。所有 draft 逻辑集中在独立 `shared/draft/` 目录 + GameSession 上的 `submitDraftPick` 方法，主引擎 `shared/engine/` 与 `shared/actions/` 零改动。客户端新增 `client/app/draft/DraftOverlay.tsx`，当 `phase === 'draft'` 时覆盖在游戏板上。协议层扩展 `ClientCommand.draftSubmit`。Lobby 新增 `draftMode`/`poolSize` 选项，默认 `none` 保持现有房间向后兼容。

**Tech Stack:** TypeScript、Vitest、React、Vite、WebSocket、SQLite 持久化（沿用现有 `serializeState` → JSON 链路）。

---

## 前置调研（已完成）

- BGA 参考：`/data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/States/DraftTrait.php` — OPTION_DRAFT_N_SIMULTANEOUS 系列。本 plan 实现的是 "合并池（occ+minor 同时 pick）+ 固定顺时针传池 + 7 轮"，poolSize 可配。
- 现有 `createInitialState` 在 `shared/logic/state.ts`，`dealHands` 逻辑复用；发牌数目前硬编码 7，需要允许覆盖。
- 现有 `GameState` 类型在 `shared/game/types.ts`，目前无 `phase` 字段——新增后所有 `createInitialState` 调用默认填 `'playing'`。
- 现有 `GameSession` 的 `submitDraftPick` 新方法与 `takeAction` 并列，不侵入主引擎 `Engine.step()`。
- 协议：`shared/protocol/ws.ts` 的 `ClientCommand` 是 discriminated union，新增 `{type: 'draftSubmit', ...}` 一行即可。
- Transport 接口：`client/services/` 下的 `GameTransport` 添加 `draftSubmit` 方法。
- Pending 模型：`PendingAction` union 已是 discriminated，新增 `'cardDraft'` 一项。

---

## File Structure

### 新建

- `shared/draft/types.ts` — `DraftState`, `DraftMode`, `DraftPickPayload`, `DraftPoolView` 等类型
- `shared/draft/draft-manager.ts` — 纯函数：`initDraftState`, `processSubmit`, `tryAdvanceRound`, `finalizeDraft`, `rotatePools`
- `shared/draft/__tests__/draft-manager.test.ts` — unit tests
- `server/game/__tests__/draft-session.test.ts` — session tests
- `client/app/draft/DraftOverlay.tsx` — 主覆盖层
- `client/app/draft/DraftPoolRow.tsx` — 一行卡（occ 或 minor）
- `client/app/draft/DraftHistoryPanel.tsx` — 已挑卡展示
- `client/app/draft/__tests__/DraftOverlay.test.tsx`
- `e2e-tests/card-draft.spec.ts` — 2 人局 draft 全链路

### 修改

- `shared/game/types.ts` — `GameState` 加 `phase` 与 `draft`；`PendingAction` 加 `'cardDraft'` 变体
- `shared/logic/state.ts` — `createInitialState` 默认 `phase='playing'`；新增 `createDraftInitialState(opts)` 返回 `phase='draft'` + 发牌到 `draft.pools`
- `shared/logic/state-constants.ts`（PR-4 新增，client-safe）—— 若有必要，把 `DraftMode` 等常量放这里
- `shared/protocol/ws.ts` — `ClientCommand` 加 `draftSubmit`；`StateUpdateCause` 可选加 `'draftSubmit'`
- `server/game/authoritative-session.ts` (即 GameSession) — 新方法 `submitDraftPick(pid, pick): SessionResponse`
- `server/game/room-manager.ts` — `createRoom` 接收 `draftMode` + `poolSize`；WS 路由处理 `draftSubmit` command
- `server/game-router.ts` — HTTP `/api/game/draft-submit` 镜像
- `client/services/gameTransport.ts`（或相似 transport 抽象）— 加 `draftSubmit` 方法
- `client/services/HttpGameTransport.ts`、`client/services/WsGameTransport.ts` — 实现
- `client/app/GameContainerApi.tsx` — 检测 `phase === 'draft'` 渲染 `<DraftOverlay />`
- `client/app/LobbyPage.tsx` — 房间创建 UI 加 `draftMode`/`poolSize` 选项
- `docs/ENGINE_ARCHITECTURE.md` — 新增 "Draft Phase" 段落
- `docs/card_progress.md §3` — 登记 PR-5

### 不动

- `shared/engine/` — 零改动
- `shared/actions/` — 零改动
- 现有卡牌文件 — 零改动
- 现有 2289 测试（2279 + 10 新 registry 测试）应保持 pass

---

## Task 1 — 数据模型 + `GameState.phase/draft` 字段

**Files:**

- Create: `shared/draft/types.ts`
- Modify: `shared/game/types.ts`

**目标：** 引入 `phase` 与 `draft` 到 `GameState`，默认 `phase='playing'`，`draft=null`。引入 `PendingAction` 的 `cardDraft` 变体。现有 2289 测试零破坏。

- [ ] **Step 1：创建 `shared/draft/types.ts`**

```ts
export type DraftMode = 'none' | 'simultaneous'

export type DraftPickPayload = {
  occCardId: string
  minorCardId: string
}

export type DraftPool = {
  occ: string[]
  minor: string[]
}

export type DraftState = {
  mode: 'simultaneous'
  round: number               // 1..totalRounds
  totalRounds: number         // 7
  poolSize: number            // 7..10
  seatOrder: string[]         // playerId[]（顺时针传池）
  pools: Record<string, DraftPool>          // 每玩家当前可选的 pool
  kept: Record<string, DraftPool>           // 每玩家已挑累积
  pendingPicks: Record<string, { occ: string | null; minor: string | null }>
}

// 客户端视角（未来做 per-player filter 时会用；MVP 与 DraftState 等价）
export type DraftView = DraftState
```

- [ ] **Step 2：修改 `shared/game/types.ts`**

- 在 `GameState` 加：
  ```ts
  phase: 'draft' | 'playing'   // 默认 'playing'
  draft: import('../draft/types').DraftState | null
  ```
- 在 `PendingAction` union 加：
  ```ts
  | { type: 'cardDraft'; round: number; totalRounds: number; allSubmitted: boolean }
  ```
- 如果 `createInitialState` 的返回类型会被检查，默认实现里要填这两个字段（Task 2 后面再做）。

- [ ] **Step 3：类型检查**

```bash
pnpm exec tsc -p tsconfig.server.json --noEmit
pnpm exec tsc -p tsconfig.app.json --noEmit
```

**Expected：** 全绿。若不绿，通常是 `createInitialState` 未返回新字段——加默认即可。

- [ ] **Step 4：测试**

```bash
pnpm test
```

**Expected：** 2289 pass / 18 skip。任何因新字段失败的断言直接补上 `phase: 'playing', draft: null`。

- [ ] **Step 5：Commit**

```bash
git add -A
git commit -m "feat(types): introduce phase and draft fields on GameState"
```

---

## Task 2 — DraftManager 纯函数（TDD）

**Files:**

- Create: `shared/draft/draft-manager.ts`
- Create: `shared/draft/__tests__/draft-manager.test.ts`

**目标：** 实现 `initDraftState`、`processSubmit`、`tryAdvanceRound`、`finalizeDraft`、`rotatePools` 五个纯函数。完全 TDD。

- [ ] **Step 1：先写失败测试**

`shared/draft/__tests__/draft-manager.test.ts`：

1. `initDraftState` — 2/3/4 人局，poolSize=7/8/9/10，验证形状与发牌
2. `processSubmit` 正常 pick — 更新 `pendingPicks[pid]`，pool 不变
3. `processSubmit` pick 不在 pool — 返回 error
4. `processSubmit` 重复 pick（同玩家同轮 submit 两次）— 返回 error
5. `tryAdvanceRound` 未全员提交 — `advanced: false`
6. `tryAdvanceRound` 全员提交 — kept 新增 picks、pools 顺时针旋转 1 步、round++、pendingPicks reset
7. `tryAdvanceRound` round=7 全员提交 — `finished: true`
8. `finalizeDraft` — 写 `kept` 入 `player.occupationHand/minorHand`；`phase='playing'`；`draft=null`
9. `rotatePools` 2/3/4 人局方向正确（顺时针）

```bash
pnpm exec vitest run shared/draft/__tests__/draft-manager.test.ts
```

**Expected：** 失败（函数未实现）。

- [ ] **Step 2：实现 `initDraftState`**

```ts
export function initDraftState(
  seatOrder: string[],
  hands: Record<string, DraftPool>,
  poolSize: number,
  totalRounds = 7,
): DraftState {
  const pools: Record<string, DraftPool> = {}
  const kept: Record<string, DraftPool> = {}
  const pendingPicks: Record<string, { occ: string | null; minor: string | null }> = {}
  for (const pid of seatOrder) {
    const h = hands[pid]
    if (!h || h.occ.length !== poolSize || h.minor.length !== poolSize) {
      throw new Error(`bad initial hand for ${pid}: expected ${poolSize} occ/minor`)
    }
    pools[pid] = { occ: [...h.occ], minor: [...h.minor] }
    kept[pid] = { occ: [], minor: [] }
    pendingPicks[pid] = { occ: null, minor: null }
  }
  return { mode: 'simultaneous', round: 1, totalRounds, poolSize, seatOrder, pools, kept, pendingPicks }
}
```

- [ ] **Step 3：实现 `processSubmit`**

```ts
export function processSubmit(
  draft: DraftState,
  pid: string,
  pick: DraftPickPayload,
): { draft: DraftState; error?: string } {
  if (!draft.pools[pid]) return { draft, error: `unknown player ${pid}` }
  if (!draft.pools[pid].occ.includes(pick.occCardId)) return { draft, error: `occ card not in pool` }
  if (!draft.pools[pid].minor.includes(pick.minorCardId)) return { draft, error: `minor card not in pool` }
  if (draft.pendingPicks[pid].occ !== null) return { draft, error: `already submitted this round` }
  const next = structuredClone(draft)
  next.pendingPicks[pid] = { occ: pick.occCardId, minor: pick.minorCardId }
  return { draft: next }
}
```

- [ ] **Step 4：实现 `tryAdvanceRound`**

```ts
export function tryAdvanceRound(draft: DraftState): {
  draft: DraftState
  advanced: boolean
  finished: boolean
} {
  const allSubmitted = draft.seatOrder.every((pid) =>
    draft.pendingPicks[pid].occ !== null && draft.pendingPicks[pid].minor !== null
  )
  if (!allSubmitted) return { draft, advanced: false, finished: false }

  const next = structuredClone(draft)
  // 1. kept += pick
  for (const pid of next.seatOrder) {
    const p = next.pendingPicks[pid]
    next.kept[pid].occ.push(p.occ!)
    next.kept[pid].minor.push(p.minor!)
  }
  // 2. 从 pools 中移除 picks
  for (const pid of next.seatOrder) {
    const p = next.pendingPicks[pid]
    next.pools[pid].occ = next.pools[pid].occ.filter((id) => id !== p.occ)
    next.pools[pid].minor = next.pools[pid].minor.filter((id) => id !== p.minor)
  }
  // 3. 顺时针旋转 pools
  const n = next.seatOrder.length
  const rotated: Record<string, DraftPool> = {}
  for (let i = 0; i < n; i++) {
    const from = next.seatOrder[i]
    const to = next.seatOrder[(i + 1) % n]
    rotated[to] = next.pools[from]
  }
  next.pools = rotated
  // 4. round++
  next.round += 1
  // 5. reset pendingPicks
  for (const pid of next.seatOrder) next.pendingPicks[pid] = { occ: null, minor: null }

  const finished = next.round > next.totalRounds
  return { draft: next, advanced: true, finished }
}
```

- [ ] **Step 5：实现 `finalizeDraft`**

```ts
export function finalizeDraft(state: GameState): GameState {
  if (!state.draft) throw new Error('no draft to finalize')
  const next = structuredClone(state)
  for (const player of next.players) {
    const k = next.draft!.kept[player.id]
    player.occupationHand = [...k.occ]
    player.minorHand = [...k.minor]
  }
  next.phase = 'playing'
  next.draft = null
  return next
}
```

- [ ] **Step 6：跑测试**

```bash
pnpm exec vitest run shared/draft/__tests__/draft-manager.test.ts
```

**Expected：** 全绿。若失败，单独定位并修。

- [ ] **Step 7：全量 test + tsc**

```bash
pnpm exec tsc -p tsconfig.server.json --noEmit
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm test
```

**Expected：** 2289 + N 新 draft 测试 passed。

- [ ] **Step 8：Commit**

```bash
git add -A
git commit -m "feat(draft): implement simultaneous draft manager pure functions"
```

---

## Task 3 — GameSession 集成 `submitDraftPick` + `createDraftInitialState`

**Files:**

- Modify: `shared/logic/state.ts`
- Modify: `server/game/authoritative-session.ts`
- Modify: `shared/session/game-core.ts`（若需要 GameCoreOptions 扩展）
- Create: `server/game/__tests__/draft-session.test.ts`

**目标：** 在 session 层用 DraftManager。新增 `createDraftInitialState(opts)` 与 `GameSession.submitDraftPick(pid, pick)`。

- [ ] **Step 1：扩展 `createInitialState`（或并行建 `createDraftInitialState`）**

在 `shared/logic/state.ts` 接受新 option：

```ts
export interface InitialStateOptions {
  // ... 现有字段
  draftMode?: DraftMode
  draftPoolSize?: number  // 7..10，仅当 draftMode='simultaneous' 时生效
}

export function createInitialState(options?: InitialStateOptions): GameState {
  // 若 draftMode === 'simultaneous'：
  //   1. 照常 shuffle 牌堆
  //   2. 发给每玩家 poolSize 张 occ + poolSize 张 minor 到 draft.pools（不进 player.occupationHand）
  //   3. 设置 phase='draft'，draft = initDraftState(...)
  // 否则：照现有路径（phase='playing', draft=null）
}
```

- [ ] **Step 2：写 session test 先**

`server/game/__tests__/draft-session.test.ts`：

1. 2 人 draft 局：完整走 7 轮，每次 `submitDraftPick`，最后 `phase === 'playing'` 且每人 7 张 hand
2. 并行提交：p1 先 submit，state.draft.pendingPicks.p1 非空，p2 尚未 → phase 仍 'draft'；p2 submit → 原子旋转 + round++
3. 重复 submit 同一玩家：第二次返回 error
4. Non-draft phase 调 `submitDraftPick` → 返回 error
5. poolSize=8 局：结束后 kept=7, 每人最后一轮持 2 张 passthrough 被丢弃
6. 3 人局 draft 完成
7. 持久化恢复：模拟 serialize → rehydrate，state.draft 字段完整

跑：
```bash
pnpm exec vitest run server/game/__tests__/draft-session.test.ts
```
**Expected：** 失败（submitDraftPick 未实现）。

- [ ] **Step 3：实现 `GameSession.submitDraftPick`**

```ts
submitDraftPick(pid: string, pick: DraftPickPayload): SessionResponse {
  if (this.state.phase !== 'draft' || !this.state.draft) {
    return { ok: false, error: 'not in draft phase', state: this.state, pending: {type:'none'} }
  }
  const r1 = processSubmit(this.state.draft, pid, pick)
  if (r1.error) return { ok: false, error: r1.error, state: this.state, pending: {type:'none'} }
  this.state.draft = r1.draft
  const r2 = tryAdvanceRound(this.state.draft)
  this.state.draft = r2.draft
  if (r2.finished) {
    this.state = finalizeDraft(this.state)
    // hand control to Engine: round=1, normal setup
  }
  this.persistIfNeeded()
  return { ok: true, state: this.state, pending: this.computePending(), scores: ... }
}
```

`computePending` 逻辑：
```ts
if (state.phase === 'draft') {
  const allSubmitted = state.draft!.seatOrder.every(p =>
    state.draft!.pendingPicks[p].occ !== null
  )
  return { type: 'cardDraft', round: state.draft!.round, totalRounds: state.draft!.totalRounds, allSubmitted }
}
// 现有 playing 逻辑不变
```

- [ ] **Step 4：跑测试**

```bash
pnpm exec vitest run server/game/__tests__/draft-session.test.ts
pnpm test  # 全量
```

**Expected：** 全绿。

- [ ] **Step 5：Commit**

```bash
git add -A
git commit -m "feat(session): integrate draft phase into GameSession"
```

---

## Task 4 — 协议扩展 + Transport

**Files:**

- Modify: `shared/protocol/ws.ts`
- Modify: `client/services/gameTransport.ts`（接口）
- Modify: `client/services/HttpGameTransport.ts`
- Modify: `client/services/WsGameTransport.ts`
- Modify: `server/game/room-manager.ts`（WS 路由）
- Modify: `server/game-router.ts`（HTTP 路由）

- [ ] **Step 1：`ClientCommand` 加 `draftSubmit`**

```ts
// shared/protocol/ws.ts
export type ClientCommand =
  | /* 现有 */
  | { type: 'draftSubmit'; playerId: string; pick: DraftPickPayload }
```

- [ ] **Step 2：Transport 接口**

```ts
// client/services/gameTransport.ts
interface GameTransport {
  // ...
  draftSubmit(playerId: string, pick: DraftPickPayload): Promise<SessionResponse>
}
```

- [ ] **Step 3：HTTP 实现 + endpoint**

server `/api/game/draft-submit`：

```ts
// server/game-router.ts handleRequest switch
case 'draft-submit': {
  const body = await readJson(req)
  const session = getOrCreateSession(userId)
  const resp = session.submitDraftPick(body.playerId, body.pick)
  writeJson(res, 200, resp)
  return
}
```

client `HttpGameTransport.draftSubmit`：POST 到上面 endpoint，返回 JSON。

- [ ] **Step 4：WS 实现**

server 在 `room-manager.ts` WS 消息路由中加 case：

```ts
case 'draftSubmit': {
  const resp = room.session.submitDraftPick(msg.playerId, msg.pick)
  broadcastState(room, resp, 'action', msg.requestId)
  break
}
```

client `WsGameTransport.draftSubmit`：发 `{type: 'draftSubmit', ...}` 命令，等 stateUpdate 回来。

- [ ] **Step 5：类型检查 + 单元测试**

```bash
pnpm exec tsc -p tsconfig.server.json --noEmit
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm test
```

- [ ] **Step 6：Commit**

```bash
git add -A
git commit -m "feat(protocol): wire draftSubmit through WS and HTTP transports"
```

---

## Task 5 — 房间创建流程支持 `draftMode`/`poolSize`

**Files:**

- Modify: `server/game/room-manager.ts`
- Modify: `shared/protocol/game.ts`（如有 `CreateRoomOptions`）
- Modify: `server/workshop.ts`（sandbox 创建路径，如适用）

- [ ] **Step 1：扩展 `createRoom` 参数**

```ts
function createRoom(id: string, opts: {
  // ... 现有
  draftMode?: DraftMode
  draftPoolSize?: number
})
```

Forward 给 `new GameSession({ ..., draftMode, draftPoolSize })` 或等价 session 构造路径。

- [ ] **Step 2：持久化**

验证 `serializeState` 输出含 `phase` + `draft`；`rehydrateState` / 客户端 `rehydrateStateForClient` 不对 draft 字段做特殊处理（纯数据 passthrough）。写一条 reconnect session test 确认 draft 中途重启服务器不丢状态。

- [ ] **Step 3：测试**

```bash
pnpm test
```

- [ ] **Step 4：Commit**

```bash
git add -A
git commit -m "feat(room): accept draftMode and poolSize on room creation"
```

---

## Task 6 — Client DraftOverlay 组件

**Files:**

- Create: `client/app/draft/DraftOverlay.tsx`
- Create: `client/app/draft/DraftPoolRow.tsx`
- Create: `client/app/draft/DraftHistoryPanel.tsx`
- Create: `client/app/draft/__tests__/DraftOverlay.test.tsx`
- Modify: `client/app/GameContainerApi.tsx`

**目标：** 覆盖层展示 draft pool、接收玩家选择、提交后等待其他玩家。

- [ ] **Step 1：写 failing render test**

```ts
// DraftOverlay.test.tsx
test('renders current pool and history', () => {
  // mock state.phase='draft', state.draft={round:2, pools:{p1:{...}}, kept:{p1:{...}}}
  // render <DraftOverlay state meId="p1" onSubmit={mock} />
  // expect pool rows + history panel
})
test('submit disabled until both occ and minor selected', ...)
test('shows waiting state after submit', ...)
```

- [ ] **Step 2：实现 `DraftPoolRow`**

列出 `poolIds: string[]`，每张卡用现有 `PlayerCard` 或自定义小卡视觉；单击触发 `onSelect(cardId)`。外部传 `selected: string | null` 控制高亮。

- [ ] **Step 3：实现 `DraftOverlay`**

```tsx
export function DraftOverlay({ state, meId, onSubmit }: Props) {
  const myPool = state.draft!.pools[meId]
  const myKept = state.draft!.kept[meId]
  const myPending = state.draft!.pendingPicks[meId]

  const [selOcc, setSelOcc] = useState<string | null>(null)
  const [selMinor, setSelMinor] = useState<string | null>(null)

  const alreadySubmitted = myPending.occ !== null
  const canSubmit = !alreadySubmitted && selOcc && selMinor

  // reset selection when round advances
  useEffect(() => { setSelOcc(null); setSelMinor(null) }, [state.draft!.round])

  return (
    <div className="draft-overlay">
      <h2>Draft — Round {state.draft!.round} / {state.draft!.totalRounds}</h2>
      {alreadySubmitted ? (
        <div className="waiting">Waiting for other players ({numSubmitted}/{numTotal}) …</div>
      ) : (
        <>
          <DraftPoolRow type="occ" ids={myPool.occ} selected={selOcc} onSelect={setSelOcc} />
          <DraftPoolRow type="minor" ids={myPool.minor} selected={selMinor} onSelect={setSelMinor} />
          <button disabled={!canSubmit} onClick={() => onSubmit({occCardId: selOcc!, minorCardId: selMinor!})}>
            Confirm picks
          </button>
        </>
      )}
      <DraftHistoryPanel kept={myKept} />
    </div>
  )
}
```

- [ ] **Step 4：在 `GameContainerApi.tsx` 挂接**

```tsx
if (state.phase === 'draft') {
  return <DraftOverlay state={state} meId={myPlayerId} onSubmit={(pick) => transport.draftSubmit(myPlayerId, pick)} />
}
// 现有逻辑保持
```

- [ ] **Step 5：样式**

加 `.draft-overlay` CSS（简单 modal，半透明背景，居中容器）。MVP 先复用现有 PlayerCard 的视觉。

- [ ] **Step 6：测试**

```bash
pnpm exec vitest run client/app/draft/__tests__/
pnpm run lint
pnpm run build
```

- [ ] **Step 7：bundle size 验证**

```bash
pnpm run check:bundle-size
```

**Expected：** 主 bundle 仍在 550KB / 170KB 预算内（DraftOverlay 预计只增 ~5KB）。

- [ ] **Step 8：Commit**

```bash
git add -A
git commit -m "feat(client): DraftOverlay UI for simultaneous draft phase"
```

---

## Task 7 — Lobby UI 加 `draftMode`/`poolSize` 选项

**Files:**

- Modify: `client/app/LobbyPage.tsx`

**目标：** 创建房间时能选 draftMode 和 poolSize。

- [ ] **Step 1：读现状**

```bash
grep -n "createRoom\|roomOptions" client/app/LobbyPage.tsx | head
```

- [ ] **Step 2：加 UI**

```tsx
<label>
  Draft Mode:
  <select value={draftMode} onChange={(e) => setDraftMode(e.target.value as DraftMode)}>
    <option value="none">None</option>
    <option value="simultaneous">Simultaneous (BGA-style)</option>
  </select>
</label>
{draftMode === 'simultaneous' && (
  <label>
    Pool Size:
    <select value={poolSize} onChange={(e) => setPoolSize(Number(e.target.value))}>
      {[7, 8, 9, 10].map(n => <option key={n} value={n}>{n} per deck</option>)}
    </select>
  </label>
)}
```

- [ ] **Step 3：Forward 到 `createRoom` 请求**

- [ ] **Step 4：测试 + 构建**

```bash
pnpm test && pnpm run lint && pnpm run build
```

- [ ] **Step 5：Commit**

```bash
git add client/app/LobbyPage.tsx
git commit -m "feat(lobby): expose draftMode and poolSize options on room create"
```

---

## Task 8 — E2E + 集成测试

**Files:**

- Create: `e2e-tests/card-draft.spec.ts`

**目标：** Playwright 两浏览器，开启 draft 局，走完 7 轮，进入 round 1。

- [ ] **Step 1：写 e2e**

```ts
import { test, expect } from '@playwright/test'

test('two-player simultaneous draft 7 rounds', async ({ browser }) => {
  const ctx1 = await browser.newContext()
  const ctx2 = await browser.newContext()
  const p1 = await ctx1.newPage()
  const p2 = await ctx2.newPage()

  // p1 creates room with draftMode=simultaneous poolSize=7
  await p1.goto('http://localhost:5173/?player=p1')
  await p1.getByLabel(/draft mode/i).selectOption('simultaneous')
  await p1.getByLabel(/pool size/i).selectOption('7')
  await p1.getByRole('button', { name: /create/i }).click()
  const roomId = await p1.evaluate(() => new URLSearchParams(location.search).get('room'))

  // p2 joins
  await p2.goto(`http://localhost:5173/?player=p2&room=${roomId}&transport=ws`)
  await p1.waitForSelector('.draft-overlay')
  await p2.waitForSelector('.draft-overlay')

  for (let i = 0; i < 7; i++) {
    // each player picks first card of each type
    await p1.locator('.draft-pool-row.occ .card').first().click()
    await p1.locator('.draft-pool-row.minor .card').first().click()
    await p1.getByRole('button', { name: /confirm/i }).click()
    await p2.locator('.draft-pool-row.occ .card').first().click()
    await p2.locator('.draft-pool-row.minor .card').first().click()
    await p2.getByRole('button', { name: /confirm/i }).click()
    // wait for next round (or end)
  }

  // both end up in main game
  await expect(p1.locator('.action-board')).toBeVisible()
  await expect(p2.locator('.action-board')).toBeVisible()
})
```

- [ ] **Step 2：跑**

需要先启动 `./restart-intranet.sh`，然后 `pnpm run test:e2e -- card-draft`。

**Expected：** 通过。若 UI 交互细节与 Task 6 的 DOM 结构不匹配，修正 selector。

- [ ] **Step 3：Commit**

```bash
git add e2e-tests/card-draft.spec.ts
git commit -m "test(e2e): two-player simultaneous draft flow"
```

---

## Task 9 — 最终验证 + 文档同步

**Files:**

- Modify: `docs/ENGINE_ARCHITECTURE.md`
- Modify: `docs/card_progress.md §3`

- [ ] **Step 1：完整验证**

```bash
pnpm install
pnpm run lint                                    # exit 0
pnpm exec tsc -p tsconfig.server.json --noEmit
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm test                                        # 2289 + N pass
pnpm run build
pnpm run check:reaches -- --strict
pnpm run check:no-dsl -- --strict
pnpm run check:prompt-sync -- --strict
pnpm run check:bundle-size
```

- [ ] **Step 2：Local smoke**

```bash
./restart-intranet.sh
sleep 8
curl -sI http://localhost:5173/ | head -1
curl -s http://localhost:5175/api/health
pkill -f 'node_modules/.bin/(tsx|vite)' || true
```

- [ ] **Step 3：`docs/ENGINE_ARCHITECTURE.md`**

新增 "Draft Phase" 段落：

```
## Draft Phase（PR-5）

游戏开启时可选进入 draft 阶段（lobby 选 draftMode=simultaneous，poolSize=7..10）。

- phase: 'draft' | 'playing' 字段在 GameState
- DraftManager 独立于主引擎，纯函数式
- 并行玩家提交：每玩家 submitDraftPick，server 等全员提交后原子推进一轮
- 7 轮后转 phase='playing'，kept 写入 hands，主引擎从 round 1 开始
- 隐私现阶段信任式（见 issue #7）
```

- [ ] **Step 4：`docs/card_progress.md §3`**

追加 2026-04-20 PR-5 条目。

- [ ] **Step 5：Commit**

```bash
git add -A
git commit -m "docs: sync architecture notes for PR-5 card draft"
```

- [ ] **Step 6：Branch summary**

```bash
git log main..HEAD --oneline
git diff main..HEAD --stat | tail -20
```

---

## Self-Review

### Spec coverage

- Simultaneous draft 合并池 ✅（Task 1-3）
- poolSize 7..10 ✅（Task 3 `createDraftInitialState`、Task 5 room 参数、Task 7 lobby）
- 并行玩家动作 ✅（Task 2 `processSubmit` + `tryAdvanceRound`）
- 独立 DraftManager 不改主引擎 ✅（架构约束贯穿）
- 协议 draftSubmit ✅（Task 4）
- Pending 'cardDraft' ✅（Task 1 types + Task 3 computePending）
- UI overlay ✅（Task 6）
- Lobby toggle + backward compat ✅（Task 5, 7）
- 持久化 ✅（Task 3 Step 2 + Task 5 Step 2）
- 隐私 MVP 信任式 + issue #7 ✅（已提 issue）

### Placeholder scan

- 所有 code block 为可执行示例
- sed/grep 命令都给了具体 pattern
- 无 "TBD" 或 "later"

### Type consistency

- `DraftState`, `DraftPool`, `DraftPickPayload`, `DraftMode` 定义统一在 `shared/draft/types.ts`
- `GameState.phase`, `GameState.draft` 定义统一
- `SessionResponse` 沿用现有 shape

### Risk

- Task 3 持久化：确认 `serializeState` 对新字段 passthrough 即可（纯数据），零改动现有序列化函数
- Task 6 PlayerCard 复用：若 `PlayerCard` 需要 card 完整 meta 而 manifest 不足，退化到直接展示 `{nameKey, id}`
- Task 8 E2E：必须启动 dev server；若 e2e 环境不支持 Playwright，session test 已覆盖核心逻辑

## Pending / Deferred

- 隐私 per-connection filter（issue #7）
- BGA 其它 draft 模式（LIVING_HAND / OCCUPATION_FIRST）
- 方向交替（每轮改方向）
- Lobby UI 视觉精细化
- Draft 结束后的 summary 动画
