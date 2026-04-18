# B38 Future Building Site — 重新实现设计文档

日期：2026-04-18
卡牌：`B38_FutureBuildingSite`（MinorImprovement, Deck B, 38）
状态：完全重写。移除错误的 future meeples 实现，对齐 BGA 原版：纯 3VP + 农场空间锁定 + 回合 4 前可买。

---

## 1. 背景与现状

### 1.1 BGA 原版行为

B38 是一张 3VP 的 MinorImprovement，核心规则：

- **购买条件**：回合 ≤ 4 时才可购买，免费
- **空间锁定**：购买时，所有与玩家房屋（roomTiles）正交相邻的空闲农场格被标记为"锁定"
- **锁定效果**：在所有其他（非锁定）农场格被使用完之前，锁定格不能用于任何操作（耕地、建房、围栏、建马厩）
- **解锁条件**：当所有剩余空闲格都是锁定格时，限制自动解除
- **计分**：游戏结束时提供 3VP

BGA PHP 实现（`B38_FutureBuildingSite.php`）的关键逻辑：
1. `onBuy`：遍历空闲格，找出与房屋类型 tile 正交相邻的，存入 `extraDatas.locked`
2. `isListeningTo`：监听 Plow / Construct / Fencing / Stables 四个行动
3. `checkLocked`：在每个行动 after 阶段，检查操作涉及的位置是否命中锁定格；如果命中且仍有非锁定空闲格存在，则抛错回滚

### 1.2 我方现有实现的问题

当前实现（`shared/cards/B/B38_FutureBuildingSite.ts`）存在两个根本性问题：

1. **错误地添加了 future meeples 逻辑**：BGA 原版完全没有"在未来回合格放木头"的能力，这是对卡牌名称的误读。当前实现在 `onBuy` 时调用 `queueFutureMeeples` 在接下来 4 回合各放 1 木，并注册 `afterConstructListener` 在建房后移除承诺的木头——这些都不属于 B38。
2. **缺失核心能力**：卡牌的真正能力——农场空间锁定（adjacency prohibition）——被标记为"刻意偏离 BGA"跳过了。

本次重写将彻底纠正这两个问题。

---

## 2. 设计方案

### 2.1 总体方案：验证层注入 locked tiles 过滤器

选择在验证层和交互层统一注入锁定格过滤，而非 BGA 的"事后抛错回滚"方式。原因：

- 用户体验更好：锁定格在 UI 上直接不可选，不会出现"选了格子确认后被告知不行"
- 我方引擎没有 DB 事务回滚机制，after 阶段抛错可能有副作用
- 改动量可控，且引入的是通用扩展点，不是单卡 if-else

### 2.2 卡牌定义变更

```typescript
// B38_FutureBuildingSite.ts — 重写后
const CARD_ID = 'B38_FutureBuildingSite'

export const B38_FutureBuildingSite = new MinorImprovement({
  id: CARD_ID,
  name: 'Future Building Site',
  deck: 'B',
  number: 38,
  category: 'POINTS_PROVIDER',
  desc: [
    'Up until all other farmyard spaces are used, you cannot use the unused spaces that are orthogonally adjacent to your house (not even to build rooms).'
  ],
  cost: {},
  vp: 3,
  maxRound: 4,
  prerequisite: 'Play in Round 4 or Before',
  implemented: true,
})
```

移除的内容：
- `queueFutureMeeples` 调用
- `futureMeeplesNode` 返回
- `afterConstructListener` 注册
- `removeFutureMeeples` 调用
- `isCardFlagged` / `setCardFlag` 相关逻辑

### 2.3 购买限制：回合 ≤ 4

使用已有的 `maxRound` 字段（`shared/cards/types.ts`），在 `MinorImprovement` 构造参数中设置：

```typescript
maxRound: 4,
prerequisite: 'Play in Round 4 or Before',
```

`shared/cards/helpers/prerequisites.ts` 中的 `checkCardPrerequisites` 已有通用逻辑：当 `round > card.maxRound` 时返回 `false`。无需自定义 `isBuyable`。

### 2.4 锁定格计算（onBuy）

购买时一次性计算锁定格列表，存入 `player.cardStates[B38].extraData.locked`：

```typescript
onBuy: (state, player) => {
  const usedKeys = getUsedFarmyardTileKeys(player)
  const roomKeys = new Set(player.roomTiles.map(positionKey))
  const deltas = [
    { dr: -1, dc: 0 }, { dr: 1, dc: 0 },
    { dr: 0, dc: -1 }, { dr: 0, dc: 1 },
  ]
  const lockedTiles: FarmTilePosition[] = []
  for (const tile of getAllTilePositions()) {
    const key = positionKey(tile)
    if (usedKeys.has(key)) continue  // 已使用的格子跳过
    const adjacentToRoom = deltas.some(d =>
      roomKeys.has(positionKey({ row: tile.row + d.dr, col: tile.col + d.dc }))
    )
    if (adjacentToRoom) lockedTiles.push(tile)
  }
  writeCardExtraData(player, CARD_ID, 'locked', lockedTiles)
  return null  // 无后续流程节点
}
```

示例（2人游戏初始，房屋在 (1,0) 和 (2,0)）：
```
  col: 0  1  2  3  4
row 0: [L] .  .  .  .     L = locked
row 1: [R][L] .  .  .     R = room
row 2: [R][L] .  .  .
```
锁定格：(0,0)、(1,1)、(2,1)

### 2.5 锁定格动态判定

新增 `CardEffect.computeLockedFarmTiles` 扩展点：

```typescript
// card-effects.ts 新增类型字段
computeLockedFarmTiles?: (player: PlayerState) => FarmTilePosition[]
```

B38 的实现：

```typescript
computeLockedFarmTiles: (player) => {
  const locked = readCardExtraData<FarmTilePosition[]>(player, CARD_ID, 'locked')
  if (!locked || locked.length === 0) return []

  const usedKeys = getUsedFarmyardTileKeys(player)
  const lockedKeys = new Set(locked.map(positionKey))

  // 检查是否存在非锁定的空闲格
  const hasNonLockedFree = getAllTilePositions().some(tile => {
    const key = positionKey(tile)
    return !usedKeys.has(key) && !lockedKeys.has(key)
  })

  // 有非锁定空闲格 → 锁定仍生效；否则解除
  return hasNonLockedFree ? locked : []
}
```

### 2.6 收集函数

在 `card-effects.ts` 中新增通用收集函数：

```typescript
export const collectLockedFarmTileKeys = (player: PlayerState): Set<string> => {
  const allCards = [...player.improvements, ...player.occupationPlayed]
  const lockedKeys = new Set<string>()
  for (const cardId of allCards) {
    const effect = getCardEffect(cardId)
    if (!effect?.computeLockedFarmTiles) continue
    const tiles = effect.computeLockedFarmTiles(player)
    tiles.forEach(tile => lockedKeys.add(positionKey(tile)))
  }
  return lockedKeys
}
```

---

## 3. 验证层集成

### 3.1 设计原则

验证函数保持纯粹的农场几何验证，不感知卡牌系统。`lockedKeys: Set<string>` 作为可选参数由调用方传入。

### 3.2 validateRoomSelection（server/validators.ts）

新增可选参数 `lockedKeys?: Set<string>`。在 OCCUPIED 检查之后、连通性检查之前，加入：

```typescript
if (lockedKeys?.has(key)) {
  return { ok: false, code: 'LOCKED' }
}
```

### 3.3 validatePlowSelection（server/plow-validation.ts）

新增可选参数 `lockedKeys?: Set<string>`。在 FENCED 检查之后加入：

```typescript
if (lockedKeys?.has(targetKey)) {
  return { ok: false, error: { code: 'LOCKED' } }
}
```

`PlowValidationError.code` 联合类型需要加入 `'LOCKED'`。

### 3.4 validateStableSelection（server/validators.ts）

新增可选参数 `lockedKeys?: Set<string>`。在 OCCUPIED 检查之后加入：

```typescript
if (lockedKeys?.has(key)) {
  return { ok: false, code: 'LOCKED' }
}
```

### 3.5 validateFenceSelection（server/fence-validation.ts）

围栏验证的特殊性：玩家选择的是边（edge），不是格子。但新围栏围成的牧场区域会占用格子。在计算出新围栏区域的 tiles 后，检查是否命中锁定格：

```typescript
// 在 computeFencedRegions 之后
for (const region of newRegions) {
  for (const tile of region.tiles) {
    if (lockedKeys?.has(positionKey(tile))) {
      return { ok: false, code: 'LOCKED' }
    }
  }
}
```

### 3.6 调用方改动

`server/farm-choice.ts` 和 `server/game-session.ts` 中调用验证函数的地方，在调用前计算 `lockedKeys`：

```typescript
const lockedKeys = collectLockedFarmTileKeys(player)
const selection = validateRoomSelection(normalized, rooms, lockedKeys)
```

---

## 4. 交互层集成

### 4.1 buildRoomFarmInteraction（server/farm-interaction.ts）

在计算 `selectableTiles` 时过滤锁定格：

```typescript
const lockedKeys = collectLockedFarmTileKeys(player)
const selectableTiles = getAllTilePositions().filter(tile =>
  !occupied.has(positionKey(tile)) && !lockedKeys.has(positionKey(tile))
)
```

### 4.2 buildStableFarmInteraction（server/farm-interaction.ts）

同上逻辑，过滤锁定格。

### 4.3 buildPlowFarmInteraction

已通过 `validatePlowSelection` 间接生效。但需要确保调用时传入 `lockedKeys`，或者在 `validatePlowSelection` 内部获取。

由于 `buildPlowFarmInteraction` 直接调用 `validatePlowSelection(normalized, tile)`，需要额外传入 `lockedKeys`。这意味着 `buildPlowFarmInteraction` 也需要先 `collectLockedFarmTileKeys`。

### 4.4 buildFenceFarmInteraction

围栏交互选择的是边而非格子，无法在此层面过滤。锁定检查在验证层（§3.5）完成。

---

## 5. 前端 UI

### 5.1 锁定格视觉表现

在农场格子渲染中，当格子被锁定时：
- 覆盖半透明灰色遮罩（`rgba(0, 0, 0, 0.3)` 左右）
- 叠加锁图标（居中，适当大小）
- 在非交互模式下也可见（玩家随时能看到哪些格子被锁定）

### 5.2 数据来源

锁定格信息已包含在 `PlayerState.cardStates[B38].extraData.locked` 中，前端通过 state snapshot 可直接读取。前端需要复用 `computeLockedFarmTiles` 的动态判定逻辑（该函数在 `shared/` 中，前后端共用）。

### 5.3 交互模式下的行为

当玩家进入耕地/建房/建马厩选择模式时，锁定格：
- 不在 `selectableTiles` 中（后端已过滤）
- 视觉上保持灰色遮罩 + 锁图标
- 鼠标悬停不显示高亮，点击无响应

---

## 6. 测试计划

### 6.1 Session 测试（server/__tests__/B38_FutureBuildingSite.test.ts）

| # | 用例 | 驱动方式 | 关键断言 |
|---|---|---|---|
| 1 | 回合 ≤ 4 购买成功 + 锁定格计算 | `takeAction('improvement')` | `cardStates[B38].extraData.locked` 包含正确坐标；`vp` 字段 |
| 2 | 回合 5+ 不可购买 | `takeAction('improvement')` | `ok: false` 或卡牌不在可买列表 |
| 3 | 耕地：锁定格被拒绝 | `confirmFarmChoice('plow', lockedTile)` | `ok: false, code: 'LOCKED'` |
| 4 | 耕地：非锁定空闲格通过 | `confirmFarmChoice('plow', freeTile)` | `ok: true` |
| 5 | 建房：锁定格被拒绝 | `confirmFarmChoice('room', [lockedTile])` | `ok: false, code: 'LOCKED'` |
| 6 | 建马厩：锁定格被拒绝 | `confirmFarmChoice('stable', [lockedTile])` | `ok: false, code: 'LOCKED'` |
| 7 | 围栏：新牧场含锁定格被拒绝 | `confirmFarmChoice('fence', edges)` | `ok: false, code: 'LOCKED'` |
| 8 | 解锁：非锁定格用完后锁定格可用 | 先占满非锁定格，再操作锁定格 | `ok: true` |
| 9 | 终局计分 3VP | 触发计分 | 卡牌贡献 3 分 |

### 6.2 E2E 测试（e2e-tests/B38_FutureBuildingSite.spec.ts）

| # | 用例 | 关键断言 |
|---|---|---|
| 10 | 锁定格视觉标识 | 购买 B38 后，锁定格显示灰色遮罩 + 锁图标 |
| 11 | 锁定格不可点击 | 进入耕地/建房/建马厩模式时，锁定格不可被选中 |
| 12 | 围栏模式错误提示 | 围栏选择涉及锁定格时，给出合理的错误提示 |
| 13 | 解锁后可点击 | 所有非锁定格用完后，原锁定格恢复正常可选 |
| 14 | 卡牌购买限制 | 回合 5+ 时 B38 显示为不可购买 |

---

## 7. 文件变更清单

| 文件 | 变更类型 | 说明 |
|---|---|---|
| `shared/cards/B/B38_FutureBuildingSite.ts` | 重写 | 移除 future meeples，新增锁定逻辑 + computeLockedFarmTiles |
| `shared/cards/card-effects.ts` | 小改 | `CardEffect` 类型加 `computeLockedFarmTiles` 字段；新增 `collectLockedFarmTileKeys` 函数 |
| `server/validators.ts` | 小改 | `validateRoomSelection` / `validateStableSelection` 加可选 `lockedKeys` 参数 |
| `server/plow-validation.ts` | 小改 | `validatePlowSelection` 加可选 `lockedKeys` 参数；`PlowValidationError.code` 加 `'LOCKED'` |
| `server/fence-validation.ts` | 小改 | `validateFenceSelection` 新牧场区域锁定检查 |
| `server/farm-interaction.ts` | 小改 | `buildRoomFarmInteraction` / `buildStableFarmInteraction` / `buildPlowFarmInteraction` 过滤锁定格 |
| `server/farm-choice.ts` | 小改 | 调用验证时传入 `lockedKeys` |
| `server/game-session.ts` | 小改 | 调用验证时传入 `lockedKeys` |
| `src/components/board/FarmBoard.tsx` + `src/hooks/useFarmSelection.ts` | 小改 | 锁定格渲染：灰色遮罩 + 锁图标 |
| `server/__tests__/B38_FutureBuildingSite.test.ts` | 新建 | Session 测试 9 例 |
| `e2e-tests/B38_FutureBuildingSite.spec.ts` | 新建 | E2E 测试 5 例 |
| `docs/card_progress.md` | 更新 | 移除 §2.5 刻意偏离条目，更新实现状态 |

---

## 8. 不做的事情

- 不修改 future meeples 基础设施（`shared/actions/effects/future-meeples.ts`）——其他卡仍在使用
- 不在核心验证函数中硬编码 B38 卡牌 ID——通过通用的 `lockedKeys` 参数传入
- 不在前端补规则逻辑——前端只负责读取锁定状态并渲染
