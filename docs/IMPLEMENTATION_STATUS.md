# 实现情况总结

## 1. 架构

前后端职责已分离：后端持有唯一权威 `GameState`，前端仅做渲染与输入收集。
前端采用 4 个浏览器窗口分别代表 4 位玩家（`?player=1..4` 或 `?player=p1..p4`）。

| 目录 | 职责 |
|---|---|
| `shared/` | 引擎、行动、效果、Hook、卡牌、状态、计分、i18n（前后端共用） |
| `server/` | GameSession（权威状态）、HTTP API、WebSocket 房间管理、校验 |
| `src/` | React UI、API 调用 hook、渲染组件 |

## 2. 当前能力

### 2.1 核心流程
- 1~14 回合主流程、行动轮转、回合结束、游戏结束。
- 收获三阶段：收割、喂食、繁殖（严格按顺序执行：所有玩家收割完成后才开始喂食，所有玩家喂食完成后才开始繁殖）。
- 动物重整与待安置处理。

### 2.2 引擎与 Hook
- Flow 节点树：leaf/seq/parallel/or/xor/optional。
- 8 个 Hook 相位：before/during/immediatelyAfter/after/computeCosts/computeArgs/computeReplace/isDoable。
- Hook 覆盖矩阵由真实注册数据动态生成。

### 2.3 卡牌
- 248 个卡牌定义文件（A/B/C/D/E）。
- 大改良核心卡已接入主要效果。
- 详见 `docs/cards_impl.md`。

### 2.4 后端 API
- `GameSession`：持有 GameState + Engine，暴露命令式方法。
- HTTP 端点：`/api/game/*`（takeAction/resolveChoice/validate/confirmReorg/confirmFeed/confirmNextPlayer/performRoundEnd）。
- 统合了原本分散的 `/api/plow/validate` 等校验接口到 `/api/game/validate`；校验通过时直接写回 GameSession 状态（开垦/围栏/房间/马厩/播种等会立即生效）。
- WebSocket：`ws://localhost:5175/ws`（createRoom/joinRoom + 实时状态广播）。
- 房间管理：每房间独立 GameSession，支持多客户端。

### 2.5 前端
- `GameContainerApi`：API 驱动，不运行本地引擎。
- 使用 URL 参数锁定玩家视角：`?player=1..4` 或 `?player=p1..p4`。

## 3. 测试与质量

- 单测框架：vitest。
- 21 个测试文件，68 个用例全部通过（含 Playwright e2e 测试）。
- `npm run build` 全量通过。

## 4. 已知边界

- 部分卡牌仅完成数据接入，复杂行为待补全。
- WebSocket 多人流程尚未端到端测试。
- 撤销功能支持 API 模式（撤销步骤、撤销行动）；撤销回合功能已移除以避免混淆。
- API 模式行动日志已覆盖资源变化、播种与改良/烤面包记录（播种支持新开垦田地且无选择禁用确认）。
- 新增 Playwright 端到端测试 `e2e-tests/actions.spec.ts`，用于自动化验证行动卡逻辑与撤销功能。已修复开发者面板选择器不匹配导致的超时问题。
- 新增 Playwright 端到端测试 `e2e-tests/harvest.spec.ts`，用于验证收获阶段执行顺序正确性。
- 非当前玩家视角不显示可选高亮与播种控件。
- 非当前玩家窗口为只读视图，交互按钮全部禁用。
- `GameContainerApi` 的动物重整 UI 交互（adjustReorgAnimal）待完善。

### 2.6 行动卡映射 (Action Card Mapping)
- 已生成 `docs/card_actions_mapping.json`，包含 30 个行动卡的执行前置条件（preconditions）与预期行为（behavior）。
- 该映射用于辅助测试用例的结构化编写，涵盖资源变化、状态校验与 Flow 节点逻辑。

## 5. 下一步方向

- 完善 WebSocket 多人端到端流程（创建房间 → 加入 → 对局 → 结算）。
- 持续完善撤销覆盖范围与异常场景。
- 持续补全高频卡牌行为。
- 已移除本地引擎模式，仅保留 API 驱动。

## 6. BGA-Agricola 资源支付系统参考

### 6.1 当前实现 (pay.ts)

当前实现的资源支付逻辑较为简单：

```typescript
// shared/actions/effects/pay.ts
payResources(player, cost)  // 直接扣减数值
canPayResources(player, cost)  // 验证资源是否足够
applyCostOverride(base, override)  // 成本覆盖（用于卡牌效果）
```

**特点**：
- 资源以数值形式存储 (`player.resources.wood = 5`)
- 直接加减数值，无木块追踪
- 成本结构简单，仅支持固定成本

### 6.2 BGA 版本实现 (Pay.php)

BGA 版本有完整的支付系统，核心文件：`modules/php/Actions/Pay.php`

#### 成本结构 (Cost Format)

```php
$costs = [
    'fee' => [resource => amount],      // 必付费用
    'fees' => [fee1, fee2, ...],        // 多选一费用
    'trades' => [                       // 可重复的交易选项
        ['max' => maxTimes, 'nb' => units, resource => amount, ...]
    ],
    'cards' => [type => X, list => [...]],  // 卡牌抵换
    'bonuses' => [                     // 一次性折扣
        ['optional' => bool, resourceType => amount, ...]
    ]
]
```

#### 组合计算算法

`computeAllBuyableCombinations()` - 计算玩家所有可用支付组合：
1. 遍历 `fees` 作为基础
2. 迭代所有 `trades` 组合
3. 应用 `bonuses` 折扣
4. 过滤资源不足组合
5. 移除被其他组合"支配"的不优解

#### 资源模型

BGA 以**单个木块 (meeple)** 追踪资源：

```php
// Meeples.php
public static function useResource($player_id, $resourceType, $amount)
{
    $resource = self::getResourceOfType($player_id, $resourceType);
    foreach ($resource as $id => $res) {
        $deleted[] = $res;  // 保存完整对象用于通知
        self::DB()->delete($id);
    }
    return $deleted;
}
```

#### 支付类型

| 类型 | 方法 | 说明 |
|------|------|------|
| 普通支付 | `useResource()` | 从玩家储备中删除 |
| 支付给其他玩家 | `payResourceTo()` | 转移资源到另一玩家 |
| 从田地支付 | `payResourcesFromFields()` | 从田地中取资源 |
| 从卡牌支付 | `payResourcesFromCards()` | 归还卡牌抵换 |
| 卡牌抵换 | 支付卡牌代替资源 | 支持 Major 改良卡 |

### 6.3 对比总结

| 特性 | open-agricola | bga-agricola |
|------|---------------|---------------|
| 复杂度 | 简单直接 | 完整状态机 |
| 资源模型 | 数值计数 | 逐个木块追踪 |
| 支付组合 | 无 | 智能计算可用组合 |
| 成本结构 | 固定成本 | fees + trades + bonuses + cards |
| 卡牌抵换 | 无 | 完整支持 |
| 玩家间支付 | 无 | 完整支持 |

### 6.4 改进方向

**短期（当前系统可支持）**：
- 扩展 `applyCostOverride` 支持更复杂的成本修改规则
- 增加卡牌抵换机制（参考 BGA 的 `cards` 成本结构）

**中期（需要架构调整）**：
- 实现 `computeAllBuyableCombinations` 算法，支持多选一费用和 trades
- 扩展 bonuses 支持一次性折扣

**长期（重大重构）**：
- 将资源模型从数值改为木块追踪
- 实现玩家间资源转移
- 实现从田地/卡牌支付资源
