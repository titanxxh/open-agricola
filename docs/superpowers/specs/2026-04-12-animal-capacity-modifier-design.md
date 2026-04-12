# 动物容量修改器 (Animal Capacity Modifier) 设计文档

## 目标

让卡牌能修改牧场/农场的动物容量，对齐 BGA 的 `computeDropZones` 机制。首张实现卡：A12_DrinkingTrough（每个牧场 +2 容量）。

## 现状

### 当前容量计算 (`shared/actions/effects/animals.ts`)

```
getPastureCapacity(pasture) = pasture.size * 2 * 2^pasture.stables
getTotalAnimalCapacity(player) = ∑ getPastureCapacity + 1(house) + looseStables.length
```

硬编码，无卡牌扩展点。

### BGA 的模式 (`PlayerBoard.php`)

```php
function getAnimalsDropZones() {
  $zones = [...]; // 构建基础 zones
  PlayerCards::applyEffects($this->player, 'ComputeDropZones', $args);  // 卡牌修改
  return $args['zones'];
}
```

卡牌实现 `onPlayerComputeDropZones($player, &$args)` 直接修改 zones 数组。

---

## 设计

### 新增 CardEffect hook

在 `shared/cards/card-effects.ts` 的 `CardEffect` 类型中增加：

```typescript
onComputeAnimalZones?: (player: PlayerState, zones: AnimalZone[]) => void
```

`AnimalZone` 类型定义在 `shared/actions/effects/animals.ts`：

```typescript
export type AnimalZone = {
  id: string
  zoneType: 'pasture' | 'house' | 'stable' | 'card'
  capacity: number
  animalType?: string | null
  animalCount?: number
  cardId?: string       // zoneType='card' 时使用
  pastureIndex?: number // zoneType='pasture' 时使用
}
```

### 修改容量计算流程

`animals.ts` 新增 `computeAnimalZones(player): AnimalZone[]`：

1. 构建基础 zones（pastures + house + loose stables）
2. 遍历玩家所有已打出卡牌（minorPlayed + occupationPlayed + improvements），调用每个卡的 `onComputeAnimalZones` hook
3. 返回修改后的 zones

### 调用点更新

以下函数改为使用 `computeAnimalZones()`：
- `getTotalAnimalCapacity(player)` → sum of zones.capacity
- `enforceAnimalCapacity(player)` → 用 zones 分配动物
- `server/game-session.ts: buildAnimalReorgZones(player)` → 用 zones 构建 UI 交互数据
- `server/game-session.ts: getPastureCapacities()` → 用 zones
- `server/game-session.ts: confirmAnimalReorg()` → 用 zones 验证

### 不变部分

- `getPastureCapacity()` 保留作为基础计算（被 `computeAnimalZones` 内部调用）
- `getBlockedPastureId()` 逻辑不变（E33_BeaverColony 已实现）
- 序列化/反序列化不受影响（zones 是运行时计算的，不持久化）

---

## A12_DrinkingTrough 实现

**效果**: "Each of your pastures (with or without a stable) can hold up to 2 more animals." 费用: 1 Clay

```typescript
registerCardEffect({
  id: 'A12_DrinkingTrough',
  onComputeAnimalZones: (player, zones) => {
    if (!player.minorPlayed.includes('A12_DrinkingTrough')) return
    for (const zone of zones) {
      if (zone.zoneType === 'pasture') {
        zone.capacity += 2
      }
    }
  },
})
```

---

## 测试要点

1. `computeAnimalZones` 无卡时返回基础 zones（等价于当前行为）
2. A12 打出后每个 pasture zone 的 capacity 增加 2
3. A12 不影响 house 和 stable zones
4. `getTotalAnimalCapacity` 使用新的 zones 计算
5. `enforceAnimalCapacity` 使用新的 zones 分配
6. `buildAnimalReorgZones` 返回的 capacity 值包含卡牌修改

---

## 未来扩展（本次不实现）

| 卡牌 | 修改方式 | 需要的额外机制 |
|---|---|---|
| E12_AnimalBedding | unfenced stable +1, pasture with stable +2 | 无，同一 hook |
| A86_AnimalTamer | 替换 house zone → 每房间各 1 zone | 需要访问 roomTiles |
| E11_PettingZoo | 新增 card zone | 需要邻接检查 + 新 zoneType='card' |
| E86_PenBuilder | 新增 card zone + anytime action | 需要 anytime 基础设施 |
