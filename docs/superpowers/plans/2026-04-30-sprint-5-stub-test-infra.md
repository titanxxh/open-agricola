# Sprint 5 stub-test 基础设施 + 机制 A 完整测试套补齐 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `shared/actions/hooks.ts` 加 `unregisterActionHook(id)` 让测试能干净反注册 stub action hook；新建 stub-based 测试文件覆盖机制 A spec §6.4 / §6.5 / §6.5b 的 3 个测试场景（A→B→A 间接循环 / cascade dispatch / ReplaceHook parity）。

**Architecture:** listener 反注册 API（`CardRegistry.registerListener` + `removeListenersWhere` + `unload`）已在 `registry.ts:67-133` 完整实现。本 spec 仅补 `unregisterActionHook(id)` 一个函数（5 行），并直接通过 `requireActiveCardRegistry()` 在测试里注册和清理 stub listener。**0 主路径改动**。

**Tech Stack:** TypeScript / Vitest / pnpm。改动：1 个新函数 + 1 个单元测试文件 + 1 个 stub-coverage session 测试文件 + 文档同步。

**Spec:** `docs/superpowers/specs/2026-04-30-sprint-5-stub-test-infra-design.md`

**Worktree:** `.worktree/sprint-5-stub-test-infra`（基于 main `c7ca1ed7`，已含机制 A + D）

---

## File Structure

**新建：**
- `shared/actions/__tests__/hooks-unregister.test.ts` — `unregisterActionHook` 单元测试
- `server/__tests__/place-farmer-jump-stub-coverage.test.ts` — 机制 A 完整测试套（3 场景）

**修改：**
- `shared/actions/hooks.ts` — 加 `unregisterActionHook(id: string): void`
- `docs/card_progress.md` — §2.0 changelog + §7 基础设施
- `docs/master-plan.md` — §8 Sprint 5 行加注
- `docs/superpowers/specs/2026-04-30-sprint-5-mech-a-place-farmer-design.md` — §8.2 排除项标 ✅ 已实现 + 交叉引用本 spec

---

## Phase 1: unregisterActionHook + 单元测试

**Files:**
- Modify: `shared/actions/hooks.ts`
- Create: `shared/actions/__tests__/hooks-unregister.test.ts`

### Task 1.1: 写单元测试

- [ ] **Step 1: 创建测试文件**

```ts
// shared/actions/__tests__/hooks-unregister.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerActionHook,
  unregisterActionHook,
  clearActionHooks,
  getRegisteredActionHooks,
} from '../hooks'

describe('unregisterActionHook', () => {
  beforeEach(() => {
    clearActionHooks()
  })

  it('removes a hook by id', () => {
    registerActionHook({
      id: 'test-hook-1',
      phases: ['after'],
      handler: () => undefined,
    })
    registerActionHook({
      id: 'test-hook-2',
      phases: ['after'],
      handler: () => undefined,
    })
    expect(getRegisteredActionHooks()).toHaveLength(2)

    unregisterActionHook('test-hook-1')

    const remaining = getRegisteredActionHooks()
    expect(remaining).toHaveLength(1)
    expect(remaining[0]!.id).toBe('test-hook-2')
  })

  it('is a no-op when id is not found', () => {
    registerActionHook({
      id: 'test-hook-x',
      phases: ['after'],
      handler: () => undefined,
    })
    expect(getRegisteredActionHooks()).toHaveLength(1)

    // Should not throw
    expect(() => unregisterActionHook('does-not-exist')).not.toThrow()

    expect(getRegisteredActionHooks()).toHaveLength(1)
  })

  it('removes only the first match if multiple registered with same id (defensive)', () => {
    // registerActionHook does not dedupe — defensive: ensure unregister only splices once
    registerActionHook({ id: 'dup', phases: ['after'], handler: () => undefined })
    registerActionHook({ id: 'dup', phases: ['after'], handler: () => undefined })
    expect(getRegisteredActionHooks()).toHaveLength(2)

    unregisterActionHook('dup')

    expect(getRegisteredActionHooks()).toHaveLength(1)
    expect(getRegisteredActionHooks()[0]!.id).toBe('dup')
  })
})
```

- [ ] **Step 2: 跑测试确认 fail**

Run: `pnpm exec vitest run shared/actions/__tests__/hooks-unregister.test.ts`
Expected: FAIL — `unregisterActionHook is not a function` 或 import 失败

### Task 1.2: 实现 unregisterActionHook

- [ ] **Step 3: 修改 hooks.ts**

打开 `shared/actions/hooks.ts`，在 `clearActionHooks` 函数（line 98-100）下面加：

```ts
export const unregisterActionHook = (id: string): void => {
  const idx = actionHooks.findIndex((h) => h.id === id)
  if (idx >= 0) actionHooks.splice(idx, 1)
}
```

**实现说明**：按 id `findIndex` 找第一条匹配的 hook，splice 掉。找不到时 `idx === -1` → silently no-op。

- [ ] **Step 4: 跑测试确认 PASS**

Run: `pnpm exec vitest run shared/actions/__tests__/hooks-unregister.test.ts`
Expected: PASS（3 个测试全绿）

- [ ] **Step 5: 跑全量 fast 无回归**

`registerActionHook` / `clearActionHooks` 是现有 API，新加 `unregisterActionHook` 不动旧路径，不应破坏其他测试。

Run: `pnpm test:fast`
Expected: 全部 PASS

- [ ] **Step 6: lint + build**

Run: `pnpm run lint && pnpm run build`
Expected: 0 error

- [ ] **Step 7: 提交**

```bash
git add shared/actions/hooks.ts shared/actions/__tests__/hooks-unregister.test.ts
git commit -m "feat(hooks): add unregisterActionHook for stub-based test cleanup

Pairs with the existing registerActionHook / clearActionHooks /
getRegisteredActionHooks API set; splices a single hook by id, silently
no-op when not found. Used by Sprint 5 stub-coverage tests (next commit)
to register and tear down stub computeReplace hooks without affecting
unrelated registrations.

CardRegistry already exposes registerListener / removeListenersWhere /
unload (registry.ts:67-133), so listener-side cleanup needs no new API."
```

---

## Phase 2: stub-coverage 测试（机制 A spec §6.4 / §6.5 / §6.5b 的 3 个场景）

**Files:**
- Create: `server/__tests__/place-farmer-jump-stub-coverage.test.ts`

### Task 2.1: 创建 stub-coverage 测试文件

- [ ] **Step 1: 创建测试文件**

```ts
// server/__tests__/place-farmer-jump-stub-coverage.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/game/player'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { registerActionHook, unregisterActionHook } from '../../shared/actions/hooks'
import {
  readCardExtraData,
  writeCardExtraData,
} from '../../shared/cards/helpers/card-state'
import '../../shared/cards/A/A129_Swagman'

const driveAccepts = (
  session: GameSession,
  initialResp: ReturnType<GameSession['takeAction']>,
  maxIters = 30,
): ReturnType<GameSession['takeAction']> => {
  let resp = initialResp
  while (maxIters-- > 0 && resp.pending.type === 'choice') {
    const opts = resp.pending.options ?? []
    // accept any non-skip option to drive jumps; fall back to first option
    const skip = opts.find((o) => o.value === '__skip__')
    const nonSkip = opts.find((o) => o.value !== '__skip__')
    if (nonSkip) {
      resp = session.resolveChoice(0, nonSkip.value)
    } else if (skip) {
      resp = session.resolveChoice(0, '__skip__')
    } else if (opts.length > 0) {
      resp = session.resolveChoice(0, opts[0]!.value)
    } else {
      break
    }
  }
  return resp
}

const setup2P = (...occupations: string[]) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 5
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = { ...player.resources, food: 5, grain: 2, wood: 20, clay: 10, reed: 10, stone: 10 }
  for (const occ of occupations) player.occupationPlayed.push(occ)
  session.loadState(state)
  return { session, state: session.getState().state }
}

// ─────────────────────────────────────────────────────────────────────
// Scenario 1: A→B→A indirect cycle — jumpChain blocks A129 re-trigger
// ─────────────────────────────────────────────────────────────────────

describe('A→B→A indirect cycle — jumpChain blocks self-trigger', () => {
  const STUB_ID = '__test_jump_back_card__'
  const LISTENER_ID = 'stub-jump-back-listener'

  beforeEach(() => {
    const registry = requireActiveCardRegistry('stub-jump-test')
    registry.registerListener({
      id: LISTENER_ID,
      cardIds: [STUB_ID],
      phases: ['after'],
      actions: ['place-farmer'],
      handler: (ctx) => {
        if (ctx.space?.id !== 'grain-seeds') return
        const chain = (ctx.actionContext?.jumpChain as string[] | undefined) ?? []
        if (chain.includes(STUB_ID)) return
        const myRef = ctx.space.takenBy.find((t) => t.playerId === ctx.player.id)
        if (!myRef) return
        return {
          flow: {
            type: 'leaf',
            actionId: 'place-farmer',
            sourceCard: STUB_ID,
            actionContext: {
              viaCardJump: true,
              sourceCard: STUB_ID,
              workerId: myRef.workerId,
              targetSpaceId: 'farm-expansion',
            },
          },
          sourceCard: STUB_ID,
        }
      },
    })
  })

  afterEach(() => {
    requireActiveCardRegistry('stub-jump-test').removeListenersWhere(
      (l) => l.id === LISTENER_ID,
    )
  })

  it('A jumps to grain-seeds → stub jumps back to farm-expansion → A blocked by jumpChain', () => {
    const { session, state } = setup2P('A129_Swagman')
    state.players[0]!.occupationPlayed.push(STUB_ID)
    session.loadState(state)

    const resp = driveAccepts(session, session.takeAction(0, 'farm-expansion'))

    const farm = resp.state.actionSpaces.find((s) => s.id === 'farm-expansion')!
    const grain = resp.state.actionSpaces.find((s) => s.id === 'grain-seeds')!
    // 链终止：farmer 只占一格（最终 farm-expansion，被 stub 跳回；A 不再触发跳回 grain-seeds）
    expect(farm.takenBy.length + grain.takenBy.length).toBe(1)
    // 总跳数：A 跳一次（farm → grain）+ stub 跳一次（grain → farm）= 2，A 不再触发
    // 通过 farmer 最终位置间接验证（farm-expansion = stub 跳回结果）
    expect(farm.takenBy.length).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────
// Scenario 2: cascade dispatch (Y option) — stub observer sees second-place fire
// ─────────────────────────────────────────────────────────────────────

describe('cascade dispatch — second placement triggers third-party listener', () => {
  const STUB_OBS_ID = '__test_grain_seeds_observer__'
  const LISTENER_ID = 'stub-grain-seeds-observer-listener'
  const TRACE_KEY = 'observed'

  beforeEach(() => {
    const registry = requireActiveCardRegistry('stub-cascade-test')
    registry.registerListener({
      id: LISTENER_ID,
      cardIds: [STUB_OBS_ID],
      phases: ['after'],
      actions: ['place-farmer'],
      handler: (ctx) => {
        if (ctx.space?.id !== 'grain-seeds') return
        const prev = readCardExtraData<number>(ctx.player, STUB_OBS_ID, TRACE_KEY) ?? 0
        writeCardExtraData(ctx.player, STUB_OBS_ID, TRACE_KEY, prev + 1)
      },
    })
  })

  afterEach(() => {
    requireActiveCardRegistry('stub-cascade-test').removeListenersWhere(
      (l) => l.id === LISTENER_ID,
    )
  })

  it('stub observer sees place-farmer after fire on grain-seeds when reached via A129 jump', () => {
    const { session, state } = setup2P('A129_Swagman')
    state.players[0]!.occupationPlayed.push(STUB_OBS_ID)
    session.loadState(state)

    const resp = driveAccepts(session, session.takeAction(0, 'farm-expansion'))

    // A129 jumped to grain-seeds → observer fired ≥ 1 次
    const observed = readCardExtraData<number>(
      resp.state.players[0]!,
      STUB_OBS_ID,
      TRACE_KEY,
    )
    expect(observed).toBeGreaterThanOrEqual(1)
  })

  it('observer also fires when player directly places on grain-seeds (sanity)', () => {
    const { session, state } = setup2P()
    state.players[0]!.occupationPlayed.push(STUB_OBS_ID)
    session.loadState(state)

    const resp = driveAccepts(session, session.takeAction(0, 'grain-seeds'))

    const observed = readCardExtraData<number>(
      resp.state.players[0]!,
      STUB_OBS_ID,
      TRACE_KEY,
    )
    expect(observed).toBeGreaterThanOrEqual(1)
  })
})

// ─────────────────────────────────────────────────────────────────────
// Scenario 3: ReplaceHook parity — stub computeReplace fires on jump 2nd placement
// ─────────────────────────────────────────────────────────────────────

describe('ReplaceHook parity — stub computeReplace on grain-seeds fires when reached via jump', () => {
  it('jump second placement runs through ActionNode path including computeReplace dispatch', () => {
    let firedOnDirectGrainSeeds = false
    let firedOnJumpToGrainSeeds = false

    // 第一次跑：玩家直接落 grain-seeds，应该 fire（baseline）
    registerActionHook({
      id: 'stub-replace-grain-seeds-direct',
      phases: ['computeReplace'],
      actions: ['grain-seeds'],
      handler: () => {
        firedOnDirectGrainSeeds = true
        return undefined
      },
    })
    try {
      const { session: directSession } = setup2P('A129_Swagman')
      driveAccepts(directSession, directSession.takeAction(0, 'grain-seeds'))
    } finally {
      unregisterActionHook('stub-replace-grain-seeds-direct')
    }
    expect(firedOnDirectGrainSeeds).toBe(true)

    // 第二次跑：玩家落 farm-expansion → A129 jump 到 grain-seeds，应该也 fire
    registerActionHook({
      id: 'stub-replace-grain-seeds-jump',
      phases: ['computeReplace'],
      actions: ['grain-seeds'],
      handler: () => {
        firedOnJumpToGrainSeeds = true
        return undefined
      },
    })
    try {
      const { session: jumpSession } = setup2P('A129_Swagman')
      driveAccepts(jumpSession, jumpSession.takeAction(0, 'farm-expansion'))
    } finally {
      unregisterActionHook('stub-replace-grain-seeds-jump')
    }
    expect(firedOnJumpToGrainSeeds).toBe(true)
  })
})
```

注：测试假设 A129 的 listener 默认配置（farm-expansion ↔ grain-seeds 互跳）。`driveAccepts` helper 自动 accept 任何 non-skip option 推进 chain — 包括 A129 的 optional jump prompt。

⚠ **可能需要调整**：
- 如果 Scenario 1 的 stub jump 由于"没 cost"导致 SEQ 无 prompt（不像 A129 有 optional choice），engine 可能直接执行 stub jump 不走 choice 路径 — `driveAccepts` 仍会推进。如果出现"链没终止"，看 actual 状态调试
- 如果 Scenario 3 的"baseline + jump"两次跑共享 GameSession state 有干扰，分两个独立 it 测试

- [ ] **Step 2: 跑测试**

Run: `pnpm exec vitest run server/__tests__/place-farmer-jump-stub-coverage.test.ts`
Expected: 4 个测试全 PASS（Scenario 1 一个 + Scenario 2 两个 + Scenario 3 一个）

如果 fail：
- 看 Scenario 1 的 farm.takenBy / grain.takenBy 实际值打印调试
- 看 Scenario 3 的 driveAccepts 是否真的推到了 jump 第二格 dispatch（可在 stub handler 里 console.log 验证）
- 如果 Scenario 3 的 baseline 不 fire，说明 `state.round=5` grain-seeds 不可达 — 检查 round availability

- [ ] **Step 3: 跑全量 fast**

Run: `pnpm test:fast`
Expected: 全部 PASS

- [ ] **Step 4: lint + build**

Run: `pnpm run lint && pnpm run build`
Expected: 0 error

- [ ] **Step 5: 提交**

```bash
git add server/__tests__/place-farmer-jump-stub-coverage.test.ts
git commit -m "test(jump): full stub-based coverage of mech-A spec deferred scenarios

Three scenarios deferred to follow-up by mech-A spec §8.2 are now
exercised via stub registrations through the existing CardRegistry
(registerListener / removeListenersWhere) and the new
unregisterActionHook for action hooks:

- A→B→A indirect cycle: stub card listening on grain-seeds jumps back
  to farm-expansion. jumpChain self-check on A129's listener prevents
  it from re-firing on the third hop, terminating the chain.
- cascade dispatch (Y option): stub observer card with a place-farmer
  after handler on grain-seeds sees its trace counter increment when a
  player reaches grain-seeds via A129 jump (and on direct placement,
  for parity sanity).
- ReplaceHook parity: stub action hook on computeReplace phase for
  grain-seeds fires both on direct placement and on jump second
  placement, confirming jump's second placement runs the full
  ActionNode path with hook dispatch.

Stub teardown is handled in afterEach / try-finally to avoid leaking
into other tests in the same vitest worker."
```

---

## Phase 3: 文档同步

**Files:**
- Modify: `docs/card_progress.md`
- Modify: `docs/master-plan.md`
- Modify: `docs/superpowers/specs/2026-04-30-sprint-5-mech-a-place-farmer-design.md`

### Task 3.1: 更新 mech-A spec §8.2

- [ ] **Step 1: 标记 deferred 项已完成**

打开 `docs/superpowers/specs/2026-04-30-sprint-5-mech-a-place-farmer-design.md`，定位 §8.2 "明确排除"列表里 "Stub-based 完整测试套" 那一行（机制 A spec 自己加的，agent 在 mech-A Phase 7 commit `d3ce5ece` 末尾追加的；如果 mech-A 还有未删 follow-up 行，根据现状调整）。

把这条改成：

```markdown
- ~~**Stub-based 完整测试套（A→B→A 间接循环 / cascade dispatch / 直接 stub computeReplace parity）**~~：✅ 已在 Sprint 5 stub-test-infra 子项实现（2026-04-30）。详见 `docs/superpowers/specs/2026-04-30-sprint-5-stub-test-infra-design.md` + `server/__tests__/place-farmer-jump-stub-coverage.test.ts`
```

如果原条目格式不同，保留原描述并加 ✅ + cross-ref 即可。

### Task 3.2: card_progress.md

- [ ] **Step 2: §2.0 加 changelog**

在 `docs/card_progress.md` §2.0 顶部加：

```
- **2026-04-30 Sprint 5 stub-test 基础设施 + 机制 A 完整测试套补齐**：`shared/actions/hooks.ts` 加 `unregisterActionHook(id: string)` 5 行（按 id splice `actionHooks` 数组；找不到时 silently no-op）；新建 `server/__tests__/place-farmer-jump-stub-coverage.test.ts` 含 3 个 stub-based 测试场景：A→B→A 间接循环 / cascade dispatch (Y option) / ReplaceHook parity on jump second placement。listener 反注册早就有（CardRegistry.registerListener / removeListenersWhere / unload，registry.ts:67-133），所以本批不需要新增 listener 反注册 API；GameSession 也不需要暴露公共 customListener 注入入口（测试直接用 requireActiveCardRegistry）。spec：docs/superpowers/specs/2026-04-30-sprint-5-stub-test-infra-design.md。
```

- [ ] **Step 3: §7 基础设施加新条**

在 §7 基础设施段加：

```
### unregisterActionHook (Sprint 5 stub-test-infra)

`shared/actions/hooks.ts` 暴露 `unregisterActionHook(id: string)`，按 id splice 单条 hook；找不到时 silently no-op。配合现有 `CardRegistry.registerListener` / `removeListenersWhere` / `unload`（registry.ts:67-133）让 stub-based 测试能干净注册和清理 stub listener / hook，避免 `clearActionHooks()` 全清污染其他卡的 hook 注册。机制 A spec §6.4 / §6.5 / §6.5b 的 3 个 stub 场景由此落地。
```

### Task 3.3: master-plan.md

- [ ] **Step 4: §8 加注**

`docs/master-plan.md` §8 Sprint 5 行实际工时栏加 `+ ~3h (stub-test-infra)`；spec / plan 列加新 spec / plan 路径（`docs/superpowers/specs/2026-04-30-sprint-5-stub-test-infra-design.md` + `docs/superpowers/plans/2026-04-30-sprint-5-stub-test-infra.md`）。

### Task 3.4: 提交

- [ ] **Step 5: 跑全量 fast / lint / build 终验**

Run: `pnpm test:fast && pnpm run lint && pnpm run build`
Expected: 全部 PASS / 0 error

- [ ] **Step 6: 提交**

```bash
git add -f docs/card_progress.md docs/master-plan.md docs/superpowers/specs/2026-04-30-sprint-5-mech-a-place-farmer-design.md
git commit -m "docs: sync stub-test-infra landing across card_progress / master-plan / mech-A spec

card_progress §2.0 changelog entry; §7 new infrastructure section for
unregisterActionHook + listener registry test usage.

master-plan §8 Sprint 5 row gains stub-test-infra spec/plan reference and
+~3h actual time.

mech-A spec §8.2 marks the previously-deferred stub-based test suite as
complete with cross-reference to this sprint's spec and the new test
file."
```

---

## Phase 4: push + CI 验证（人工，按机制 A / D / B 模式）

- [ ] **Step 1: git fetch 看远端 main**

Run: `git -C /data00/home/xuxinhao.titan/raw/open-agricola fetch origin && git -C /data00/home/xuxinhao.titan/raw/open-agricola log --oneline HEAD..origin/main`

- 输出空：可 fast-forward
- 输出有提交：先列差异等用户确认（rebase 或 merge）

- [ ] **Step 2: fast-forward merge 到 main + push**

```bash
git -C /data00/home/xuxinhao.titan/raw/open-agricola checkout main
git -C /data00/home/xuxinhao.titan/raw/open-agricola merge --ff-only sprint-5-stub-test-infra
git -C /data00/home/xuxinhao.titan/raw/open-agricola push origin main
```

- [ ] **Step 3: 等 GitHub Actions（CLAUDE.md 硬性要求）**

```bash
sleep 30
export $(grep '^GH_TOKEN=' /data00/home/xuxinhao.titan/raw/open-agricola/.env | xargs) && \
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  'https://api.github.com/repos/titanxxh/open-agricola/actions/runs?branch=main&per_page=5' \
  | jq '.workflow_runs[] | {name, head_sha: .head_sha[0:8], status, conclusion, html_url}'
```

等所有 run completed + success。

- [ ] **Step 4: 清理 worktree**

```bash
git -C /data00/home/xuxinhao.titan/raw/open-agricola worktree remove .worktree/sprint-5-stub-test-infra
git -C /data00/home/xuxinhao.titan/raw/open-agricola branch -d sprint-5-stub-test-infra
```
