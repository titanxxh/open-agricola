# 烹饪/交换改良注册 (Minor Improvement Exchanges) 设计文档

## 目标

让 Minor Improvement 卡能声明式注册烹饪/交换比率，对齐 BGA 的 `exchanges` 数据模式。先实现 E63_IronOven + E64_SimpleOven 验证机制。

## 现状

### 当前硬编码

**bake-bread.ts** 的烤面包比率表：
```typescript
const bakeTable = {
  Major_Fireplace1: 2,
  Major_CookingHearth1: 3,
  Major_ClayOven: 5,
  Major_StoneOven: 4,
}
```
只有 Major Improvements，Minor 无法注册。

**exchange.ts** 的烹饪交换表：
```typescript
const cookeryTrades: Record<string, Trade[]> = {
  Major_Fireplace1: [ { from: { sheep: 1 }, to: { food: 2 } }, ... ],
  // ...
}
```
同样只有 Major Improvements。

### BGA 的模式

卡牌在构造器中声明 `$this->exchanges` 数组，每个 exchange 有 `from`, `to`, `max`, `trigger`。系统自动收集玩家所有已打出卡牌的 exchanges。

---

## 设计

### CardDefinition 新增字段

在 `shared/cards/types.ts` 的 `CardDefinition` 中增加：

```typescript
/** 卡牌提供的交换/烹饪比率 */
exchanges?: CardExchange[]
/** 是否为烹饪改良（可将动物转食物） */
isCookery?: boolean
/** 是否为烤面包改良（可将谷物转食物） */
isBaking?: boolean
```

```typescript
export type CardExchange = {
  from: Partial<Resource>
  to: Partial<Resource>
  /** 每次行动最多使用几次，undefined = 无限 */
  max?: number
  /** 触发条件：'bake-bread' = 仅烤面包时可用，'anytime' = 随时可用，undefined = 随时 */
  trigger?: 'bake-bread' | 'anytime'
}
```

### 动态交换收集

新增 `shared/cards/helpers/exchange-registry.ts`：

```typescript
export const getPlayerExchanges = (player: PlayerState, trigger?: string): Trade[] => {
  // 1. 收集 Major Improvements 的交换（从现有 cookeryTrades map）
  // 2. 收集 Minor Improvements 的交换（从 card.exchanges）
  // 3. 收集 Occupation 的交换（从 card.exchanges，如 B80）
  // 4. 按 trigger 过滤
  return trades
}

export const getPlayerBakeRates = (player: PlayerState): { cardId: string; rate: number }[] => {
  // 收集所有 isBaking 卡的 grain→food 比率
  // Major: 从 bakeTable
  // Minor: 从 card.exchanges 中 trigger='bake-bread' 的条目
  return rates
}
```

### 调用点更新

- **bake-bread.ts**: 用 `getPlayerBakeRates(player)` 替代硬编码 `bakeTable`
- **exchange.ts**: 用 `getPlayerExchanges(player)` 替代硬编码 `cookeryTrades`
- 收获喂食阶段的 `hasHarvestCooking` 检查也需要查 Minor 的 `isCookery`

---

## E63_IronOven 实现

```typescript
export const E63_IronOven = new MinorImprovement({
  id: 'E63_IronOven',
  name: 'Iron Oven',
  deck: 'E',
  number: 63,
  desc: ['[Bake Bread action:] 1 <GRAIN> → 6 <FOOD>'],
  cost: { stone: 3 },
  vp: 2,
  isBaking: true,
  exchanges: [
    { from: { grain: 1 }, to: { food: 6 }, max: 1, trigger: 'bake-bread' },
  ],
})
```

打出时（onBuy）可选执行一次烤面包。

## E64_SimpleOven 实现

```typescript
export const E64_SimpleOven = new MinorImprovement({
  id: 'E64_SimpleOven',
  name: 'Simple Oven',
  deck: 'E',
  number: 64,
  desc: ['[Bake Bread action:] 1 <GRAIN> → 3 <FOOD>'],
  cost: { clay: 2 },
  vp: 1,
  isBaking: true,
  exchanges: [
    { from: { grain: 1 }, to: { food: 3 }, max: 1, trigger: 'bake-bread' },
  ],
})
```

---

## 测试要点

1. `getPlayerBakeRates` 收集 Major + Minor 的烤面包比率
2. E63 打出后，烤面包选项包含 "1 grain → 6 food (max 1)"
3. E64 打出后，烤面包选项包含 "1 grain → 3 food (max 1)"
4. Major + Minor 同时存在时，两种比率都可用
5. 未打出的卡不出现在比率列表中

---

## 本次范围

- 新增 `CardExchange` 类型 + `exchanges`/`isBaking`/`isCookery` 字段
- 新增 `exchange-registry.ts` 交换收集器
- 修改 `bake-bread.ts` 使用动态比率
- 实现 E63 + E64 两张卡
- 暂不改 `exchange.ts` 的 cookeryTrades（A60 和 B80 留后续批次）

## 后续扩展

| 卡牌 | 需要的额外工作 |
|---|---|
| A60_OrientalFireplace | isCookery=true + exchanges + returnCards（需返还 Fireplace/CookingHearth） |
| B80_HardPorcelain | exchanges with trigger='anytime' + 修改 exchange.ts |
