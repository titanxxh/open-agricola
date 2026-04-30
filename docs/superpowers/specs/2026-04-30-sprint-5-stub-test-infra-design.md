# Sprint 5 stub-test 基础设施 + 机制 A 完整测试套补齐 设计

**日期**: 2026-04-30
**Sprint**: 5（基础设施补齐 + 机制 A 测试套补齐）
**Worktree**: `.worktree/sprint-5-stub-test-infra`

## 1. 背景与 scope 收敛

机制 A spec §6.4 / §6.5 / §6.5b 设想用 stub 卡 / stub computeReplace hook 测：

- A→B→A 间接循环（防递归全覆盖）
- cascade dispatch (Y option) — second-place 触发其他卡 listener
- ReplaceHook parity — jump 第二格也跑 computeReplace hook

机制 A plan Phase 7 因为"缺反注册 API"被简化为只 A→A 自跳 + B150 间接 parity smoke；spec §8.2 把完整测试套登记为 follow-up。

### 1.1 探索发现的关键事实

**listener 反注册 API 早已存在**（`shared/cards/registry.ts`）：

| API | 作用 |
|---|---|
| `CardRegistry.registerListener(reg)` | 按 `reg.cardIds` 注册到对应 bucket（无 cardIds 进 `__global__` bucket） |
| `CardRegistry.removeListenersWhere(predicate)` | 按 predicate 删除 listener |
| `CardRegistry.unload(cardId)` | 清掉某 cardId 的全部 listener / effect / modifier |
| `requireActiveCardRegistry(context)` | 拿当前活跃 registry |

`active-registry.ts:18` 的注释也明确暗示这套 API 是给测试用的。

**actionHook 反注册 API 缺失**（`shared/actions/hooks.ts`）：仅 `registerActionHook(reg)` + `clearActionHooks()` 全清；**没有按 id remove**。

### 1.2 scope 实际比预期更小

| 期望 | 实际 |
|---|---|
| `unregisterCardListener(id)` 新增 | ❌ 不需要 — `removeListenersWhere` 已存在 |
| GameSession 暴露 customListener 公共 API | ❌ 不需要 — 测试直接用 `requireActiveCardRegistry` |
| `unregisterActionHook(id)` 新增 | ✅ 需要（5 行实现） |
| 3 个 stub-based 机制 A 测试场景 | ✅ 用现有 + 新加的 API 写 |

工作量预估 **~2-3 hour**（不是 0.5 day）。

## 2. 设计目标

- **不动主路径**：仅在 `hooks.ts` 加 `unregisterActionHook` 一个函数
- **复用现有 listener API**：测试通过 `requireActiveCardRegistry().registerListener(stubReg)` + `removeListenersWhere(l => l.id === STUB_ID)` 注册和清理 stub listener
- **补齐机制 A spec §6.4 / §6.5 / §6.5b 三个测试场景**

## 3. 核心实现

### 3.1 `unregisterActionHook` 新 API

文件：`shared/actions/hooks.ts`

在现有 `clearActionHooks` 旁边加：

```ts
export const unregisterActionHook = (id: string): void => {
  const idx = actionHooks.findIndex((h) => h.id === id)
  if (idx >= 0) actionHooks.splice(idx, 1)
}
```

**语义**：按 `registration.id` 单条删除。找不到 silently no-op（避免 race condition / 重复 cleanup 引发的异常）。

### 3.2 测试 helper（可选）

新文件 `shared/cards/__tests__/__fixtures__/stub-listener.ts` 提供注册/清理 stub listener 的薄包装（可选，DRY 用途）：

```ts
import type { CardListenerRegistration } from '../../card-listeners'
import { requireActiveCardRegistry } from '../../active-registry'

export const withStubListener = (reg: CardListenerRegistration, fn: () => void): void => {
  const registry = requireActiveCardRegistry('stub-listener-test')
  registry.registerListener(reg)
  try {
    fn()
  } finally {
    registry.removeListenersWhere((l) => l.id === reg.id)
  }
}
```

测试里直接用 `registry.registerListener` + `removeListenersWhere` 即可，helper 不强制；保留 §3.2 spec 留给 plan 阶段决定要不要建。

### 3.3 三个测试场景

新文件 `server/__tests__/place-farmer-jump-stub-coverage.test.ts`。

#### 3.3.1 A→B→A 间接循环

构造场景：A129 监听 farm-expansion / grain-seeds；stub 卡 X 监听 grain-seeds 跳回 farm-expansion。

期望链：玩家落 farm-expansion → A129 跳到 grain-seeds（jumpChain=['A129']）→ X listener 看到 second-place dispatch（jumpChain.includes('X')=false）→ X 触发跳回 farm-expansion（jumpChain=['A129','X']）→ farm-expansion dispatch → A129 listener 自检 `chain.includes('A129')=true` → **跳过**，链终止。

```ts
const STUB_ID = '__test_jump_back_card__'
const LISTENER_ID = 'stub-jump-back-listener'

beforeEach(() => {
  const registry = requireActiveCardRegistry('stub-test')
  registry.registerListener({
    id: LISTENER_ID,
    cardIds: [STUB_ID],
    phases: ['after'],
    actions: ['place-farmer'],
    handler: (ctx) => {
      if (ctx.space?.id !== 'grain-seeds') return
      const chain = (ctx.actionContext?.jumpChain as string[]) ?? []
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
  requireActiveCardRegistry('stub-test').removeListenersWhere((l) => l.id === LISTENER_ID)
})

it('jumpChain blocks A129 from re-firing on second indirect-cycle hop', () => {
  const session = setupWithA129()
  const state = session.getState().state
  state.players[0]!.occupationPlayed.push(STUB_ID)
  session.loadState(state)

  let resp = session.takeAction(0, 'farm-expansion')
  let safety = 30
  while (resp.pending.type === 'choice' && safety-- > 0) {
    const accept = resp.pending.options.find((o) => o.value !== '__skip__')
    if (!accept) break
    resp = session.resolveChoice(0, accept.value)
  }

  // 链终止：farmer 在某一格，整体只占 1 格
  const farm = resp.state.actionSpaces.find((s) => s.id === 'farm-expansion')!
  const grain = resp.state.actionSpaces.find((s) => s.id === 'grain-seeds')!
  expect(farm.takenBy.length + grain.takenBy.length).toBe(1)
})
```

#### 3.3.2 cascade dispatch (Y option)

构造：stub 卡 Y 监听 grain-seeds 的 place-farmer after，handler **不**返回 flow，只在 cardStates 写痕迹。验证：A129 跳过去后，Y listener 真的被 dispatch（second-place 触发其他卡 listener — Y 选项落地）。

```ts
const STUB_Y_ID = '__test_grain_seeds_observer__'
const TRACE_KEY = 'observed'

it('second placement triggers third-party place-farmer after listener', () => {
  const registry = requireActiveCardRegistry('stub-test')
  registry.registerListener({
    id: 'stub-grain-seeds-observer',
    cardIds: [STUB_Y_ID],
    phases: ['after'],
    actions: ['place-farmer'],
    handler: (ctx) => {
      if (ctx.space?.id !== 'grain-seeds') return
      const prev = readCardExtraData<number>(ctx.player, STUB_Y_ID, TRACE_KEY) ?? 0
      writeCardExtraData(ctx.player, STUB_Y_ID, TRACE_KEY, prev + 1)
    },
  })

  try {
    const session = setupWithA129()
    const state = session.getState().state
    state.players[0]!.occupationPlayed.push(STUB_Y_ID)
    session.loadState(state)

    let resp = session.takeAction(0, 'farm-expansion')
    let safety = 20
    while (resp.pending.type === 'choice' && safety-- > 0) {
      const accept = resp.pending.options.find((o) => o.value !== '__skip__')
      if (!accept) break
      resp = session.resolveChoice(0, accept.value)
    }

    // A129 jumped to grain-seeds → Y observer fired
    const observed = readCardExtraData<number>(resp.state.players[0]!, STUB_Y_ID, TRACE_KEY)
    expect(observed).toBeGreaterThanOrEqual(1)
  } finally {
    registry.removeListenersWhere((l) => l.id === 'stub-grain-seeds-observer')
  }
})
```

#### 3.3.3 ReplaceHook parity on jump 第二格

构造：注册 stub `computeReplace` action hook 监听 grain-seeds，handler 标记 fired。验证：A129 跳到 grain-seeds → engine 跑 ActionNode → applyComputeReplace → stub hook 看到 dispatch。

```ts
it('stub computeReplace on grain-seeds fires when reached via A129 jump', () => {
  let fired = false
  registerActionHook({
    id: 'stub-replace-grain-seeds',
    phases: ['computeReplace'],
    actions: ['grain-seeds'],
    handler: (ctx) => {
      fired = true
      return undefined  // 不实际替换 actionId（避免污染流程）
    },
  })

  try {
    const session = setupWithA129()
    let resp = session.takeAction(0, 'farm-expansion')
    let safety = 20
    while (resp.pending.type === 'choice' && safety-- > 0) {
      const accept = resp.pending.options.find((o) => o.value !== '__skip__')
      if (!accept) break
      resp = session.resolveChoice(0, accept.value)
    }
    expect(fired).toBe(true)
  } finally {
    unregisterActionHook('stub-replace-grain-seeds')
  }
})
```

### 3.4 关键不变量

- **stub listener 通过 active registry 隔离**：`registerListener` + `removeListenersWhere` 是 in-memory 改 registry；同 worker 串行测试间不互相污染（每个测试 afterEach 清自己的 stub）
- **stub action hook 通过 `unregisterActionHook` 按 id 清理**：避免 `clearActionHooks()` 全清污染其他卡
- **stub cardId 命名约定 `__test_*__`**：跟现有 `__test_filler__` 约定一致；玩家手动 push 到 `occupationPlayed` 让 listener 在 `playerHasAnyCard` 检查时通过
- **测试不依赖 GameSession 公共 API**：直接用 `requireActiveCardRegistry`，不需要 GameSession 暴露 customListener 注入入口

## 4. 范围与排除项

### 4.1 范围内

- `shared/actions/hooks.ts` 加 `unregisterActionHook(id)` + 单元测试
- 新文件 `server/__tests__/place-farmer-jump-stub-coverage.test.ts` 含 3 个测试场景
- 文档同步：
  - 机制 A spec §8.2 排除项里"Stub-based 完整测试套"那条改为"已实现，详见 docs/superpowers/specs/2026-04-30-sprint-5-stub-test-infra-design.md"
  - card_progress.md §2.0 加 changelog 条目；§7 基础设施加 `unregisterActionHook` 登记
  - master-plan.md §8 加新行（如果决定单独算 Sprint 5 子项）

### 4.2 明确排除

- **`unregisterCardListener(id)` 包装函数**：不加 — `CardRegistry.removeListenersWhere(l => l.id === ID)` 直接用即可，再加包装是无意义抽象
- **GameSession 公共 customListener API**：不加 — 测试直接用 `requireActiveCardRegistry`
- **测试 helper `withStubListener`**：放进 plan 阶段决定要不要建（如果三个测试场景代码重复够多，再加 helper）
- **机制 B / C 的 stub-based 测试**：不在本 spec 范围；但他们可以用本 spec 加的 `unregisterActionHook` 与现有 registry API

### 4.3 风险点

| 假设 | 验证方式 |
|---|---|
| `requireActiveCardRegistry('stub-test')` 在 vitest 测试 setup 阶段已经被填充（GameSession 构造时）| 看 `shared/cards/__tests__/setup-register-all.ts` 是否每个测试 fast project 默认加载 — 已确认（active-registry.ts 注释提到） |
| stub listener 注册到 active registry 后，在多个 GameSession 实例间是否共享 | 是。`active-registry.ts` 是 module-private 单例。同一 vitest worker 内的多个 GameSession 共用 registry。afterEach 清理避免跨测试污染 |
| `actionHooks` 全局数组在 vitest worker 内共享，stub computeReplace 不影响其他测试 | 是。`unregisterActionHook` 在 afterEach / try-finally 内确保清掉 |
| stub cardId（`__test_X__`）不会被 catalog 验证脚本拒绝 | 看 `register-all.ts` 是否扫描 catalog；stub 不在 catalog 里只在 active registry — 不影响（grep 现有 `__test_filler__` 用法验证） |

## 5. 文档同步

### 5.1 `docs/card_progress.md`

- §2.0 加：`2026-04-30 Sprint 5 stub-test 基础设施 + 机制 A 完整测试套补齐：hooks.ts 加 unregisterActionHook(id)；新文件 server/__tests__/place-farmer-jump-stub-coverage.test.ts 含 3 个 stub-based 测试（A→B→A 间接循环 / cascade dispatch / ReplaceHook parity）。详见 docs/superpowers/specs/2026-04-30-sprint-5-stub-test-infra-design.md`
- §7 加：`unregisterActionHook(id) — 按 id 反注册 action hook（按 id splice actionHooks 数组）。配合现有 CardRegistry.registerListener / removeListenersWhere / unload 让 stub-based 测试能干净注册和清理 stub`

### 5.2 `docs/superpowers/specs/2026-04-30-sprint-5-mech-a-place-farmer-design.md`

§8.2 排除项里"Stub-based 完整测试套（A→B→A 间接循环 / cascade dispatch / 直接 stub computeReplace parity）"那条改为：

```
- ~~**Stub-based 完整测试套（A→B→A 间接循环 / cascade dispatch / 直接 stub computeReplace parity）**~~：✅ 已在 Sprint 5 stub-test-infra 子项实现。详见 `docs/superpowers/specs/2026-04-30-sprint-5-stub-test-infra-design.md` + `server/__tests__/place-farmer-jump-stub-coverage.test.ts`
```

### 5.3 `docs/master-plan.md`

§8 Sprint 5 行加注 "+ stub-test infra (~3h)"；spec / plan 列加新 spec 路径。

## 6. 提交粒度

- commit 1: `feat(hooks)`: add unregisterActionHook for stub-based test cleanup（含单元测试）
- commit 2: `test(jump)`: full stub-based coverage — A→B→A indirect cycle, cascade dispatch, ReplaceHook parity（新建 place-farmer-jump-stub-coverage.test.ts）
- commit 3: `docs`: sync stub-test infra landing across card_progress / master-plan / mech-A spec §8.2

每 commit 单独跑 `pnpm test:fast` + `pnpm run lint` + `pnpm run build`。push 走 fast-forward（机制 B 已 push 后再做 ff merge）。
