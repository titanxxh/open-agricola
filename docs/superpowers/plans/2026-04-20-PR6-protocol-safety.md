# PR-6 协议层安全 + 小修 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** 修复三件事：(1) Issue #7 手牌隐私真修复（per-connection state filtering），(2) playerId/playerIndex 席位绑定校验（阻止认证用户伪装为其他玩家），(3) 清理 A73 遗留的 `{ retry: 2 }` flaky 标记。

**Architecture:**
- 新增 `serializeStateForPlayer(state, viewerPlayerId): SerializedGameState`，对非 viewer 的 `occupationHand` / `minorHand` 做长度保留替换（id → `'?'`）。draft 池（`state.draft.pools`）同样按玩家过滤
- `broadcastState` / `sendStateTo` 改成 per-ws 过滤：每个连接用自己的 `playerIndex` / `userId` 产生定制 envelope
- HTTP `/api/game/*` endpoints 按请求的认证用户派生 viewer，过滤响应
- WS 命令 switch 在 case 处加 guard：`msg.playerIndex`/`msg.playerId` 必须匹配 `currentPlayerIndex`/`currentUserId` 关联的座位，否则返回 `error`
- A73 test 的 retry 标记直接删除 + 观察是否 deflake commit 已经顺带修掉了

**Tech Stack:** 无新依赖，纯 TypeScript + vitest。

---

## 前置调研

- 现有 `serializeState(state: GameState): SerializedGameState` 在 `shared/game/serialization.ts`，对所有玩家同一份输出
- `broadcastState` 在 `server/game/room-manager.ts:521-550`，用 `broadcast(room, envelope)` 对每个 ws 发同一 envelope
- `sendStateTo` 针对单个 ws（reconnect）
- 每个 `ws` 在 `room.players[]` 有 `{ ws, playerIndex, userId, name }`（line 798）
- WS 命令 switch 在 `room-manager.ts:900-985` 附近；handlers 大多直接用 `msg.playerIndex` 调 session 方法
- HTTP router `server/game-router.ts` 也直接信任 `body.playerIndex`
- 新 field `GameState.draft.pools[pid]` 同样是秘密信息，需过滤
- 其他潜在秘密字段：`player.cardStates[cardId].extraData` 部分卡可能藏私密 state——本 PR MVP 不处理（登记 follow-up）
- A73 retry 标记是 `server/__tests__/A73_AgriculturalFertilizers-session.test.ts:26` 的 describe-level
- 已确认 A92/B38/D95 的 retry 都已被 main `48240ac` 消除

## Scope

**In scope:**
1. `serializeStateForPlayer` filter 函数 + tests
2. `broadcastState` / `sendStateTo` per-connection 化
3. HTTP `/api/game/*` 对响应做 filter
4. WS 命令 playerIndex/playerId cross-check
5. HTTP command cross-check（based on authenticated user's seat in room — if HTTP path is per-user session not per-room, might need a separate mapping）
6. A73 `{ retry: 2 }` 删除 + 验证 3 次连跑

**Out of scope:**
- `player.cardStates` per-card secret audit（登记 follow-up）
- BGA-level full privacy（e.g. 隐藏对手分数细项）
- HTTP auth hardening（假设现有 `validateSession` 够用）
- 自动化测试强制 WS 帧层面验证隐私（登记 follow-up，可在 E2E 加一条）

---

## Task 1 — `serializeStateForPlayer` 纯函数 + tests (TDD)

**Files:**
- Modify: `shared/game/serialization.ts`
- Create: `shared/game/__tests__/serialization-filter.test.ts`

- [ ] **Step 1：写 failing tests**

```ts
// serialization-filter.test.ts
describe('serializeStateForPlayer', () => {
  it('masks other players hands with ? of same length', () => { ... })
  it('preserves own hand verbatim', () => { ... })
  it('masks draft.pools for non-viewers', () => { ... })
  it('preserves draft.pools[viewer]', () => { ... })
  it('preserves draft.kept and pendingPicks entirely (public)', () => { ... })
  it('null viewer → all hands masked (spectator mode future)', () => { ... })
  it('phase=playing, draft=null → identical to serializeState', () => { ... })
  it('preserves all non-secret fields (resources, fields, playedCards, actionSpaces)', () => { ... })
})
```

- [ ] **Step 2：实现**

```ts
export function serializeStateForPlayer(
  state: GameState,
  viewerPlayerId: string | null,
): SerializedGameState {
  const base = serializeState(state)
  return {
    ...base,
    players: base.players.map((p) =>
      p.id === viewerPlayerId
        ? p
        : {
            ...p,
            occupationHand: p.occupationHand.map(() => '?'),
            minorHand: p.minorHand.map(() => '?'),
          }
    ),
    draft: base.draft && viewerPlayerId
      ? {
          ...base.draft,
          pools: Object.fromEntries(
            Object.entries(base.draft.pools).map(([pid, pool]) =>
              pid === viewerPlayerId
                ? [pid, pool]
                : [pid, { occ: pool.occ.map(() => '?'), minor: pool.minor.map(() => '?') }]
            )
          ),
        }
      : base.draft,
  }
}
```

- [ ] **Step 3：测试绿**

- [ ] **Step 4：Commit**
```bash
git add shared/game/serialization.ts shared/game/__tests__/serialization-filter.test.ts
git commit -m "feat(serialization): per-viewer state filter for hand privacy"
```

---

## Task 2 — `broadcastState` + `sendStateTo` per-connection 化

**Files:**
- Modify: `server/game/room-manager.ts`
- Modify: existing tests that assert broadcast shape (if any)

- [ ] **Step 1：读 `broadcastState`**

现状：一次 `payload = toSyncPayload(resp, session)` 给所有 ws。目标：对 `room.players` 逐个遍历，每个 ws 用其 `playerIndex` 反查 `state.players[idx].id`，调 `serializeStateForPlayer(state, playerId)` 生成定制 payload。

- [ ] **Step 2：改 `broadcast` 也支持 per-ws function**

或者直接把 `broadcastState` 改成循环：

```ts
const broadcastState = (room: Room, resp: SessionResponse, cause, requestId?) => {
  room.version += 1
  for (const p of room.players) {
    const viewerId = resp.state.players[p.playerIndex]?.id ?? null
    const payload = toSyncPayloadForViewer(resp, room.session, viewerId)
    const envelope = { type: 'stateUpdate', roomId: room.id, version: room.version, sync:'snapshot', cause, requestId, payload, emittedAt: Date.now() }
    sendTo(p.ws, envelope)
  }
  // 持久化仍然用 full state（authoritative）
  if (PERSIST_ROOMS === 'sqlite' || isFixedDevRoom(room.id)) {
    savePersistedState(room.id, serializeState(resp.state), room)
  }
  // ... gameOver 检查不变
}
```

`toSyncPayloadForViewer` 是 `toSyncPayload` 的变体，内部用 `serializeStateForPlayer`。

- [ ] **Step 3：`sendStateTo` 同样处理**

- [ ] **Step 4：同步 WS 的 broadcast 到 spectator（无座位）连接**

如果房间允许旁观者（无 `playerIndex`），他们应该收到 `viewerPlayerId=null` 的版本（全部 hands masked）。检查 `room.players` 结构，若旁观者存在于独立数组则各自 loop。本 PR 先处理 seated players。

- [ ] **Step 5：测试**

`pnpm test` + `pnpm run test:e2e` 中 ws-dual-player spec 应仍绿。

- [ ] **Step 6：新增 session test 验证隐私**

```ts
// server/__tests__/privacy-broadcast.test.ts
it('player A envelope does not contain player B hand ids', async () => {
  // spin up 2-player WS room
  // have both join
  // inspect ws.send calls
  // assert player A received {players: [..., {id:'p2', occupationHand: ['?','?','?','?','?','?','?']}]}
})
```

此测试需要 mock WebSocket send 或用 in-process transport。参考 `server/__tests__/room-manager-ws-sync.test.ts` 的测试模式。

- [ ] **Step 7：Commit**
```bash
git add server/game/room-manager.ts server/__tests__/privacy-broadcast.test.ts
git commit -m "feat(broadcast): per-connection state filtering for hand privacy"
```

---

## Task 3 — HTTP `/api/game/*` 响应过滤

**Files:**
- Modify: `server/game-router.ts`

- [ ] **Step 1：确定 HTTP 视角玩家**

HTTP 请求已通过 `validateSession` 拿到 `userId`。需要从该 userId 找到对应的 `playerId`。现状似乎是 per-user HTTP session（一个 userId → 一个 GameSession），所以玩家就是该 session 的第一个 player？或者 body 里 `playerIndex` 就是 self？

读 `game-router.ts` 开头确认 per-user session 语义。如果 HTTP 一直是单人自测用，简化做法：HTTP 响应按 `userId → state.players[0].id` 映射。若不确定，暂时保留 HTTP 为信任式（加 TODO）。

- [ ] **Step 2：若可行，过滤响应**

`callAndRespond` 的回调返回 `SessionResponse`，在返回 JSON 前把 `resp.state` 经 `serializeStateForPlayer(state, viewerPlayerId)` 过滤。

- [ ] **Step 3：HTTP body playerIndex 校验**

如果 HTTP 是 per-user session，body 里 `playerIndex` 应该与该 user 的唯一座位一致。加 guard：

```ts
const viewerIndex = resolveUserSeatIndex(userId, session)
if (body.playerIndex !== viewerIndex) {
  sendJson(res, 403, { error: 'seat mismatch' })
  return
}
```

若 HTTP per-user 且只有一个 player，`viewerIndex=0`，只允许 body.playerIndex=0。

- [ ] **Step 4：Commit**
```bash
git add server/game-router.ts
git commit -m "feat(http): filter game state responses and validate seat binding"
```

---

## Task 4 — WS 命令 playerIndex/playerId 校验

**Files:**
- Modify: `server/game/room-manager.ts` (command switch area)

WS 连接已知 `currentPlayerIndex` 和 `currentUserId`。对每个 player-indexed command，guard：

- `msg.playerIndex !== currentPlayerIndex` → 拒绝
- `msg.playerId` 不属于 `currentUserId` 的座位 → 拒绝

- [ ] **Step 1：列出所有 player-indexed commands**

```bash
grep -n "msg\.playerIndex\|msg\.playerId" server/game/room-manager.ts
```

应该看到约 10 个：action / choice / anytime / farm / reorg / feed / devSetResources / devDrawCard / devPlayCard / draftSubmit。

- [ ] **Step 2：在 switch 内统一 guard**

```ts
const assertSelfSeat = (expectedPlayerIndex: number): boolean => {
  if (expectedPlayerIndex !== currentPlayerIndex) {
    sendCommandError('seat mismatch')
    return false
  }
  return true
}

// in each case:
case 'action': {
  if (!assertSelfSeat(msg.playerIndex)) return
  // ... rest
}
```

`draftSubmit` 用 `playerId`，换成：
```ts
const expectedPid = currentRoom?.session.getState().players[currentPlayerIndex]?.id
if (msg.playerId !== expectedPid) { sendCommandError('seat mismatch'); return }
```

Dev commands（devSetResources 等）要考虑是否允许，MVP 保持同样严格（dev mode 是本地测试，通常只有一个玩家，guard 不会出问题）。

- [ ] **Step 3：测试**

`server/__tests__/room-manager-ws-sync.test.ts` 等测试确认仍绿。新加测试验证：

```ts
it('rejects command with wrong playerIndex', async () => { ... })
it('rejects draftSubmit with wrong playerId', async () => { ... })
```

- [ ] **Step 4：Commit**
```bash
git add server/game/room-manager.ts server/__tests__/ws-seat-binding.test.ts
git commit -m "feat(ws): cross-check playerIndex/playerId with connection seat"
```

---

## Task 5 — 删 A73 `{ retry: 2 }` 标记

**Files:**
- Modify: `server/__tests__/A73_AgriculturalFertilizers-session.test.ts`

- [ ] **Step 1：删标记**

```bash
# line 26: describe('A73_AgriculturalFertilizers session', { retry: 2 }, () => {
sed -i "s/, { retry: 2 }//" server/__tests__/A73_AgriculturalFertilizers-session.test.ts
```

- [ ] **Step 2：连跑 5 次验证不 flaky**

```bash
for i in 1 2 3 4 5; do
  pnpm exec vitest run server/__tests__/A73_AgriculturalFertilizers-session.test.ts || { echo "FAIL at $i"; break; }
done
```

若任一次失败：恢复标记，登记 follow-up issue（A73 root-cause），本 task 保持 no-op 并在 PR description 说明。若 5 次都过：commit。

- [ ] **Step 3：Commit**
```bash
git add server/__tests__/A73_AgriculturalFertilizers-session.test.ts
git commit -m "test(flaky): drop A73 retry marker — root-cause resolved by de-flake"
```

---

## Task 6 — 最终验证 + 文档同步

**Files:**
- Modify: `docs/ENGINE_ARCHITECTURE.md`（隐私段落）
- Modify: `docs/card_progress.md §3`

- [ ] **Step 1：完整验证**
```bash
pnpm install
pnpm run lint
pnpm exec tsc -p tsconfig.server.json --noEmit
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm test
pnpm run build
pnpm run check:reaches -- --strict
pnpm run check:no-dsl -- --strict
pnpm run check:prompt-sync -- --strict
pnpm run check:bundle-size
```

- [ ] **Step 2：本地 smoke**
```bash
./restart-intranet.sh
sleep 8
curl -sI http://localhost:5173/ | head -1
curl -s http://localhost:5175/api/health
pkill -f 'node_modules/.bin/(tsx|vite)' || true
```

- [ ] **Step 3：update docs**

ENGINE_ARCHITECTURE.md：说明"每个连接收到按玩家过滤后的状态（他人手牌为 `?` 占位）"，Issue #7 标 resolved。card_progress.md §3：登记 PR-6 条目。GitHub Issue #7：关闭 or comment "Resolved by PR-6"。

- [ ] **Step 4：Commit**
```bash
git add docs/
git commit -m "docs: sync architecture notes for PR-6 protocol safety"
```

---

## Self-Review

- **Privacy filter** ✅ Task 1-3
- **Seat binding** ✅ Task 4-3（HTTP + WS）
- **A73 cleanup** ✅ Task 5
- **无破坏性改动**：现有 2378 测试应全绿；新增测试覆盖隐私 + 座位 guard
- **无 placeholder**：所有命令可执行
- **risk**: `toSyncPayloadForViewer` 是否已有类似函数可复用？若无，新增时严格复用 `serializeStateForPlayer`

## Deferred

- `player.cardStates[cardId]` per-card secret audit（登记 follow-up issue）
- HTTP 访问控制进一步加强（本 PR 仅做 playerIndex 校验）
- E2E 层 WS 帧层面隐私断言（PR-5 Task 8 未加，登记 follow-up）
