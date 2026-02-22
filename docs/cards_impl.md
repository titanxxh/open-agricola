# 卡牌实现示例与Hook覆盖清单（Open Agricola）

## 本仓实现 Hook 示例

| 卡牌 | 行动 | Hook 点 | 行为 |
|---|---|---|---|
| paper-maker | occupation | computeCosts | 职业费用 food -1 |
| field-merchant | day-laborer | computeReplace | 行动替换为 grain-seeds |
| overachiever | wish-children | isDoable | 忽略房间数量限制 |
| master-workman | cultivation | computeArgs | 追加 plow-bonus 选项 |
| wood-workshop | farm-redevelopment / house-redevelopment | computeCosts / isDoable | 翻修费用 reed -1 |
| shepherds-crook | fencing | immediatelyAfter | 围栏后获得 1 羊 |
| ash-trees | fencing | before | 围栏前获得 1 木材 |
| seed-pellets | cultivation | before | 播种前获得 1 谷物 |
| barrow-pusher | farmland | after | 犁地后追加 1 食物行动 |
| boar-spear | pig-market | during | 获得 1 野猪 |

实现入口：
- hooks：[card-hooks.ts](./src/actions/hooks/card-hooks.ts)
- 费用覆盖：[engine.ts](./src/engine/engine.ts#L70-L130)
- 连锁行动：[engine.ts](./src/engine/engine.ts#L92-L156), [tree.ts](./src/engine/tree.ts#L29-L70)

## 计分相关实现

- 计分规则集中在：[scoring.ts](./src/logic/scoring.ts)
- 计分板 UI（单表格：行=计分项，列=玩家）：[ScoringPad.tsx](./src/components/board/ScoringPad.tsx)
