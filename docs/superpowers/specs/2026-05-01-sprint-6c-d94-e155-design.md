# Sprint 6c — D94 + E155 实施 Design

> **Sprint 6c (subset)**：把 D94 HenpeckedHusband 与 E155 Visionary 两张已 stub 但基础设施齐备的卡补成正确实现，按 BGA 行为对齐。
>
> **C62 CookeryExtension** 因需新增 `computeExchanges` hook + per-harvest used-flag 追踪（~1.5-2d 机制扩展），推迟到未来 sprint，不在本 sprint 范围。

**Goal**：补 D94 / E155 两张卡的实际行为，纯卡内闭环，无主路径改动。

**Architecture**：复用 6a 已落地的 `family-growth` 统一 action、`isDoable` phase、`after` phase listener、`return-first-worker-home` action、`recordRoundPlacement` helper、listener 系统的 `trueAction` filter。无新 hook、无新 action、无 effects/ 改动。

**Tech Stack**：TypeScript（shared/cards/{D,E}/）+ vitest session 测试（server/__tests__/）。

**Worktree 时机**：等 Sprint 6b 落地 main 后开 `.worktree/sprint-6c-d94-e155-fix`，基于最新 main。

**总工时**：~0.8d（D94 ~0.5d / E155 ~0.3d）。

---

## 1. D94 Henpecked Husband

### 1.1 BGA 行为

源：`bga-agricola/modules/php/Cards/D/D94_HenpeckedHusband.php`

```php
public function isListeningTo($event)
{
  return $this->isActionEvent($event, 'Construct') && $event['trueAction'];
}

public function onPlayerAfterConstruct($player, $event)
{
  if ($player->countPlacedFarmers() != 2) {
    return;
  }
  return [
    'countAsUse' => true,
    'action' => SPECIAL_EFFECT,
    'args' => ['cardId' => $this->id, 'method' => 'returnFarmer'],
  ];
}

public function returnFarmer()
{
  $player = $this->getPlayer();
  $first = Globals::getPlacedFarmers()[$player->getId()][0];
  if (in_array(Farmers::getMany($first)->first()['location'],
              ['ActionMeetingPlace', 'ActionMeetingPlaceSolo'])) {
    return;
  }
  Farmers::cleanupJobContractFake();
  $player->returnHomeOne($first);
  Notifications::returnHomeOne($player, Farmers::getMany($first));
}
```

要点：
- 监听 `Construct` 事件 + `trueAction` 过滤
- 触发条件：`player->countPlacedFarmers() == 2`（即第二人放置后立即触发 build-rooms）
- 收回家：第一个放置的 farmer，除非他在 Meeting Place

### 1.2 现有基础设施（已具备）

- `shared/actions/effects/construct.ts` — action id `'construct'` = build-rooms（不是 build-stables / build-fences）
- `shared/cards/helpers/round-placement.ts` — `getRoundPlacementOrder(player)` / `getRoundPlacementDetails(player)` / `recordRoundPlacement(...)` / `resetRoundPlacements(...)`
- `shared/actions/effects/return-first-worker-home.ts` — action id `'return-first-worker-home'`，已含 Meeting Place 例外（`MEETING_PLACE_IDS = new Set(['meeting-place'])`）+ `removeWorkerRef` + 可选 `flagSourceCard` / `logCardTrigger` params
- `shared/cards/card-listeners.ts:160-163` — listener 系统默认按 `actionContext.trueAction !== false` 过滤（即 trueAction 默认 true 时触发，false 时不触发）

### 1.3 实现

**文件**：`shared/cards/D/D94_HenpeckedHusband.ts`（替换现有 stub listener）

```ts
import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { getRoundPlacementOrder } from '../helpers/round-placement'

const CARD_ID = 'D94_HenpeckedHusband'

const listener: CardListenerRegistration = {
  id: 'D94-after-construct',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['construct'],
  // listener 系统默认按 actionContext.trueAction 过滤，无需手动写 trueAction filter
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (getRoundPlacementOrder(context.player).length !== 2) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'return-first-worker-home',
        sourceCard: CARD_ID,
        params: { logCardTrigger: true },
      },
      sourceCard: CARD_ID,
    }
  },
}

export const D94_HenpeckedHusband = new Occupation({
  id: CARD_ID,
  name: 'Henpecked Husband',
  deck: 'D',
  number: 94,
  category: 'ACTIONS_BOOSTER',
  desc: ["Each time you take a __Build Rooms__ action with the second person you place, return the first person you placed home, unless it is on the __Meeting Place__ action space."],
  cost: {},
  players: '1+',
})

export const D94_HenpeckedHusband_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
```

### 1.4 测试

**文件**：`server/__tests__/D94_HenpeckedHusband-session.test.ts`

| # | 场景 | 断言 |
|---|---|---|
| 1 | 第一 farmer 放 forest，第二 farmer 放 build-rooms 并 construct | forest space 上该玩家 worker 被移除；player 在 reserve 有 1 个 farmer；log 含 `cardEffectTrigger` for D94 |
| 2 | 第一 farmer 放 meeting-place，第二 farmer 放 build-rooms | meeting-place space 上的 worker 不动；player 仍是 0 个 in reserve（即不收回） |
| 3 | 仅放第一个 farmer 在 build-rooms | listener 不触发（length=1） |
| 4 | family-size=3 已经 grown，第三个 farmer 放 build-rooms（length=3） | listener 不触发（仅 length==2 触发） |

测试模式：`GameSession` 直接造 state（玩家 family=2，初始 placement empty），driveAction 顺序调用 place-farmer + construct，断言 `resp.state` 上 placement 已正确 mutate。

### 1.5 plan 阶段需 verify

- build-rooms action space flow 顺序：先 `place-farmer` → `construct`，确保 listener after construct 时 `getRoundPlacementOrder(player).length` 已经是 2（不是 1）
- `return-first-worker-home` 的 Meeting Place 检测目前用 `MEETING_PLACE_IDS = new Set(['meeting-place'])` — 确认我们的 meeting-place space id 是 `'meeting-place'`（不是 `'meeting-place-family'` 或其他）；如果有多个 ID，扩展该 Set
- `actionContext.trueAction !== false` 默认 true 的兜底是否覆盖普通 build-rooms action space 调用（即 player 直接占 build-rooms space 时 trueAction 应为 true）

---

## 2. E155 Visionary

### 2.1 BGA 行为

源：`bga-agricola/modules/php/Cards/E/E155_Visionary.php` + `bga-agricola/modules/php/Actions/WishChildren.php`

`E155_Visionary.php`：
```php
public function onBuy($player)
{
  if (Globals::getTurn() <= 4) {
    return $this->gainNode([STONE => 1, VEGETABLE => 1, PIG => 2]);
  }
}
// Rest of functionality in Actions/WishChildren.php -> isDoable()
```

`WishChildren.php` isDoable 中：
```php
if ($player->hasPlayedCard('E155_Visionary')) {
  $othersHaveGrown = true;
  foreach (Players::getAll() as $player2) {
    if ($player->getId() == $player2->getId()) continue;
    if ($player2->countFarmers() == 2) {
      $othersHaveGrown = false;
      break;
    }
  }
  if (Globals::getTurn() < 11 && !$othersHaveGrown) {
    return false;
  }
}
```

要点：
- `onBuy` 在 round ≤ 4 给 1 stone + 1 vegetable + 2 boar — **当前代码已实现**
- isDoable 限制：round < 11 且任一对手仍是 2 family（未 grow）→ 该玩家 family-growth 不可用

### 2.2 现有基础设施（已具备）

- `shared/actions/hooks.ts` — `'isDoable'` phase 已注册 + `ActionHookResult.doable?: boolean` 已支持
- `shared/cards/E/E101_Blighter.ts:9-17` — `phases: ['isDoable']` + `return { doable: false }` 是阻断 action 的标准模式
- `shared/actions/effects/wish-children.ts` — Sprint 6a 已统一为 `family-growth` action（含 legacy alias `wish-children-growth` / `grow-family-without-room`）；listener `actions: ['family-growth']` 即覆盖所有 family-growth 入口
- `shared/game/player.ts` — `familySize(p)` 返回 active workers + reserve workers 总数；初始 family=2

### 2.3 实现

**文件**：`shared/cards/E/E155_Visionary.ts`（追加 `isDoableListener`，保留现有 `onBuy` effect）

```ts
import { Occupation } from '../types'
import type { CardImpl } from '../registry'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { familySize } from '../../game/player'

const CARD_ID = 'E155_Visionary'

const isDoableListener: CardListenerRegistration = {
  id: 'E155-isdoable-family-growth',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['family-growth'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.state.round >= 11) return
    const others = context.state.players.filter((p) => p.id !== context.player.id)
    const someoneNotGrown = others.some((p) => familySize(p) === 2)
    if (someoneNotGrown) return { doable: false }
  },
}

export const E155_Visionary = new Occupation({
  id: CARD_ID,
  name: 'Visionary',
  deck: 'E',
  number: 155,
  category: 'GOODS_-_GET',
  desc: ['If you play this card in round 4 or before, you get 1 <STONE>, 1 <VEGETABLE>, and 2 <PIG>. You cannot grow your family until round 11, unless all other players already have.'],
  players: '4+',
})

export const E155_Visionary_impl = {
  effect: {
    id: CARD_ID,
    onBuy: (state) => {
      if (state.round <= 4) {
        return {
          type: 'leaf' as const,
          actionId: 'gain',
          sourceCard: CARD_ID,
          params: { stone: 1, vegetable: 1, boar: 2 },
        }
      }
    },
  },
  listeners: [isDoableListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
```

### 2.4 测试

**文件**：`server/__tests__/E155_Visionary-session.test.ts`

| # | 场景 | 断言 |
|---|---|---|
| 1 | round 5 / 对手 family=2 | E155 玩家尝试 family-growth → action 不可用（pending or canBeExecutedByPlayer 拒绝） |
| 2 | round 5 / 对手 family=3（已 grown） | E155 玩家可 family-growth |
| 3 | round 11 / 对手 family=2 | E155 玩家可 family-growth（round ≥ 11 解锁） |
| 4 | round ≤ 4 onBuy | 玩家立即得 stone+1 / vegetable+1 / boar+2（regression） |
| 5 | round 5 onBuy | 玩家不得资源（regression） |

### 2.5 plan 阶段需 verify

- listener `actions: ['family-growth']` 是否真的对 6a 的统一 action 生效（包括 wish-children action space / D92 ChildOmbudsman / E22 urgent / 其他 grow-family 入口都触发同一 isDoable phase）
- isDoable phase 的 listener 何时被调用：是 action 列表展示时？还是 action 实际触发时？(确保从 UI / API 层都看到 `doable: false`)
- `familySize(p)` 是否含 reserve（即 2 = 初始未 grown / >2 = 已 grown）

---

## 3. Commit 序列

1. **`feat(D94): replace stub with construct-after listener triggering return-first-worker-home`**
   - 改 `shared/cards/D/D94_HenpeckedHusband.ts`
   - 加 `server/__tests__/D94_HenpeckedHusband-session.test.ts`（4 case）
   - 跑 `pnpm test:fast` 全绿

2. **`feat(E155): block family-growth before round 11 unless all opponents have grown`**
   - 改 `shared/cards/E/E155_Visionary.ts`（追加 `isDoableListener`，保留 `onBuy`）
   - 加 `server/__tests__/E155_Visionary-session.test.ts`（5 case）
   - 跑 `pnpm test:fast` 全绿
   - 同步 `docs/card_progress.md`：§2 加日期/卡条目；§3-§6 把 D94/E155 从 stub/待实现迁出；§1 总览数字 +2

> 单 sprint 内不打独立 docs commit（量太小），文档同步并入第 2 个 commit。

---

## 4. Out of Scope

- C62 CookeryExtension（需 `computeExchanges` hook + per-harvest used-flag，~1.5-2d，未来 sprint）
- 任何对 `wish-children.ts` / `construct.ts` / `return-first-worker-home.ts` / `round-placement.ts` 的修改（这些是基础设施，Sprint 6c 仅消费）
- 主路径文件（pay.ts / improvement.ts / game-session.ts）

---

## 5. 风险

| 风险 | 缓解 |
|---|---|
| build-rooms action space flow 顺序 placement 与 construct 颠倒，导致 listener 触发时 `length` 已是 1 不是 2 | plan 阶段 grep verify action space flow；如颠倒则改 listener 触发条件（length == 1 + actionId 仍为 construct） |
| Meeting Place ID 在 codebase 不止一个（如 `meeting-place-family` / `meeting-place-solo`） | plan 阶段 grep `'meeting-place'` 全 ID 列表，必要时扩展 `MEETING_PLACE_IDS` Set |
| `family-growth` 监听不覆盖 6a 的 legacy alias（`wish-children-growth` / `grow-family-without-room`） | plan 阶段 grep 这些 alias 是否仍在 callsite 用；如有，listener `actions` 数组加上对应 id |

---

## 6. DoD

- [ ] D94 listener 实现 + 4 个 session 测试通过
- [ ] E155 listener 实现 + 5 个 session 测试通过
- [ ] `pnpm test:fast` 全绿
- [ ] `pnpm run lint` 无新 error
- [ ] `pnpm run build` 通过
- [ ] `docs/card_progress.md` 同步
- [ ] 推 main + CI 验证（CI / Deploy Backend / Deploy Pages）
