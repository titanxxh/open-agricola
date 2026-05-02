# Sprint 7b1 — Pay-as-effect + C146 Multi-Select Design

**Date**: 2026-05-02
**Worktree**: `.worktree/sprint-7b1` (branch `sprint-7b1`)
**Sprint scope**: 7b 中 scope 的协议层升级子项（与 7b2 audit cleanup 解耦）

---

## 1. Goals

1. **Pay 升级为 first-class effect**：`pay` 成为独立 ActionDefinition，可被 listener 监听 (`actions:['pay'], phases:['after']`)。BGA `onPlayerAfterPay` 在我方有等价位置（vs 当前借 `'after'` + outer action 间接 gate via `_activeActionBonusSources`）。
2. **8 张 BGA `onPlayerAfterPay` / after-pay 风格卡对齐**：E123/E54/E122/E128/B18/D74/C148/C116 迁 `actions:['pay']`（C148 不做 reorganize trigger 简化保留 §2.5；E123 升级到 BGA full use-top-k）。
3. **C146 WorkshopAssistant** 从 7b deferred 撤回：复用 C104 multi-select 模式 + 前端泛化 `promptParams.needed > 1` 路由。

**Non-goal**：7b2 audit cleanup（14 张漏修 + demote + 复核）属于独立 sprint。

---

## 2. Architecture

### 2.1 现状

| Path | 当前实现 |
| --- | --- |
| `pay-resources` ActionDefinition (`shared/actions/effects/pay-resources.ts`) | 仅服务 anytime exchange / 卡牌主动 pay；用 `canPayResources` simple 判断 |
| `executePaymentSolution` (`shared/actions/helpers/payment.ts:757`) | construct/improvement/renovate/occupation 内部 pay；直 mutate；不发 hook event |
| farm-choice 快路径 (`shared/logic/farm/farm-choice.ts`) | room/fence/stable/plow 4 类，`commitFarmChoice` 直 mutate (含 pay)，不走 engine |
| 4 张 after-pay 卡 (E123/E54/E122/E128) | `phases:['after']` + outer action filter；`_activeActionBonusSources` gate |

### 2.2 升级后

| Path | 新实现 |
| --- | --- |
| `pay` ActionDefinition (新建，**删除**旧 `pay-resources`) | 统一所有 pay 路径；接 `params: {cost, costType, optionPrefix?, paymentChoice?, includeReturnedCard?}`；返 `'choice' \| 'fail' \| 'ok'`；`extraData` 透传 `resourcesPaid` / `feeIndex` / `returnedCardId` / `bonusUsed` / `bonusChoiceIndex` |
| improvement / renovation / occupation flow | `seq:[{leaf:'pay', params:{...}}, {leaf:'apply-*', params:{...}}]`，pay 失败时 seq abort 不动 mutate |
| construct / farm-choice | **完全走 engine**（方案 A 子方案）—— farmPayment ad-hoc pending 通道废弃，4 类 farm 选择走 ChoiceNode |
| `_activeActionBonusSources` | 删除（去掉全局可变状态），改为 `result.extraData.bonusUsed` 透传 |
| `PaymentSolution.bonusChoiceIndex` | **新增字段** `Record<cardId, number>`，generic（不 hardcode E123）；`hashSolution` 序列化它防 dedupe 错 |
| `pay-resources` action | 删除，全部走 `pay` |

### 2.3 卡牌迁移

| Card | 当前 | 7b1 升级 |
| --- | --- | --- |
| **E123 ResourceHoarder** | top-1 简化 (Sprint 7a F11 deferred) | 迁 `actions:['pay']` + computeCosts emit N+1 BonusChoice (k=0..N) + after-pay 读 `extraData.bonusChoiceIndex[CARD_ID]` pop top-k |
| **E54 Contraband** | `actions:['improvement-any']` + `_activeActionBonusSources` gate | 迁 `actions:['pay']` + costType filter |
| **E122 Cottar** | 同上 | 同上 |
| **E128 Saddler** | 同上 | 同上（透传 `extraData.sourceImprovementId` 解决脏点） |
| **C116 FurnitureMaker** | `after play-occupation`，**重建** lessons cost (脆弱，跟 modifier 漂移) | 迁 `actions:['pay']` + gate `costType=='occupation'`，读真实 `extraData.resourcesPaid.food` 给 wood |
| **B18 GrasslandHarrow** | onBuy 内计 reserve（无 listener） | 迁 `actions:['pay']` + gate `sourceCard==CARD_ID`（仅 B18 自己付费后），按 BGA "after payment" 算 reserve |
| **D74 RoyalWood** | wood diff 累计 + onEndTurn 退（脆弱） | 迁 `actions:['pay']` + gate `sourceAction!='farm-expansion'`，读真实 paid wood，公式改 `round((payWood-1)/2)` |
| **C148 MudWallower** | exchange/place-farmer syncHeldDownward | 迁 + 任意 `pay` 后 syncHeldDownward 统一覆盖（含 BeggingCard / cooking pay）；BGA `REORGANIZE` 简化保留 §2.5 |

### 2.4 C146 WorkshopAssistant

无新基建，复用 C104 模式：

```ts
onBuy: (state, player) => {
  const n = Math.min(6, countAllImprovements(player))
  if (n === 0) return
  if (n === 6) return /* gain flow with 6 pairs */
  return {
    type: 'choice',
    promptKey: 'ui.interactionWorkshopAssistantSelect',
    promptParams: { needed: n },
    options: PAIRS.map((k) => ({ value: k, labelKey: `cards.C146.pair.${k}` })),
  }
},
resolveChoice: ({ player }, choice) => {
  const selected = [...new Set(choice.split(','))]
  const n = Math.min(6, countAllImprovements(player))
  if (selected.length !== n) return /* re-emit */
  return /* gain flow with selected pairs */
},
```

前端 `<CollectorMultiSelect>` 路由泛化为 `pendingChoice.promptParams.needed > 1` → 自动多选 UI（当前只 C104 用 `needed` 参数，无歧义；spec 加 caveat 注释）。

---

## 3. Type & API Changes

### 3.1 `PaymentSolution`（`shared/game/types.ts`）

```ts
type PaymentSolution = {
  // ... 既有字段不变 ...
  bonusUsed?: string                                    // CSV cardIds (保留兼容旧 callsite)
  bonusChoiceIndex?: Record<string, number>             // 新增 (per-card chosen index)
}
```

### 3.2 `pay` ActionDefinition

```ts
export const payAction: ActionDefinition = {
  id: 'pay',
  nameKey: 'actions.pay.name',
  descriptionKey: 'actions.pay.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, params, sourceCard, state }) => {
    const { cost, costType, optionPrefix, paymentChoice, includeReturnedCard } = params as PayParams
    // 1. 用 resolveCostPaymentSelection 走 ComplexCost / typed-flat / paymentSolution 三分支
    // 2. 多 solution 时返 type:'choice' (engine 处理)
    // 3. 单 solution 时执行 payment + 返 type:'ok' + extraData
    return { type: 'ok', resourcesPaid, returnedCardId, bonusUsed, bonusChoiceIndex, extraData: {...} }
  },
  resolveChoice: (...) => /* engine 标准 */,
}
```

### 3.3 删除 `pay-resources`

`shared/actions/effects/pay-resources.ts` 删除；所有 callsite (anytime exchange / sourceCard pay) 迁移到 `pay`。

### 3.4 删除 `_activeActionBonusSources`

- `shared/game/types.ts` `PlayerState._activeActionBonusSources?: string[]` 删除
- `shared/actions/helpers/payment.ts:780` 等 callsite 删除
- listener 改为通过 `context.extraData.bonusUsed` 读

### 3.5 farm-choice → engine 化

- `shared/logic/farm/farm-choice.ts` 4 类（room/fence/stable/plow）改为 emit ChoiceNode
- `commitFarmChoice` (game-core.ts) 改为 dispatch ChoiceNode resolve
- `actionContext.farmPayment` 字段废弃

---

## 4. Implementation Order (PR-by-PR)

| PR | 内容 | 工时 |
| --- | --- | --- |
| **PR-1** | 新 `pay` ActionDefinition + 删除 `pay-resources` 整合 + `PaymentSolution.bonusChoiceIndex` 字段 + `hashSolution` 适配 + 单元测试覆盖 ComplexCost / typed-flat / paymentSolution 三分支 | 6h |
| **PR-2** | improvement flow 重写 (seq) + E123/E54/E122/E128 迁移 + E123 use-top-k 升级 + `_activeActionBonusSources` 删除 → `extraData.bonusUsed` 透传 + improvement.ts 现有测试 regression | 12h |
| **PR-3** | renovation + occupation flow 重写 + **C116 迁移** | 6h |
| **PR-4** | **construct + farm-choice 完全走 engine** + farmPayment ad-hoc 废弃 + **B18/D74/C148 迁移** + farm regression test | 20h |
| **PR-5（并行）** | C146 实现 + 前端 `<CollectorMultiSelect>` 泛化 + i18n keys + C104 补 session test | 8h |
| docs sync | spec/plan/card_progress §2.0/§2.5/§3 | 2h |

**合计 ~54h ≈ 7 工时日**（wall-clock 1-1.5 周；PR-1→2→3→4 串行 + PR-5 并行）

---

## 5. Testing Strategy

### 5.1 PR-1 单元测试
- `pay` ActionDefinition 三分支：simple `Partial<Resource>` / ComplexCost typed-flat / ComplexCost paymentSolution
- `bonusChoiceIndex` 在 multi-choice candidate 路径填充
- `hashSolution` dedupe 在 choiceIndex 不同时不冲突

### 5.2 PR-2 (improvement)
- E123 5 case session test：N=0 / N=1 / N=2 (k=0/1/2) / 复合 cost / after-pay slice(k)
- E54/E122/E128 迁移后现有 session test 通过
- improvement onBuy fail 时 player.improvements 不动 (apply-improvement-finalize idempotent on pay fail)

### 5.3 PR-3 (renovation/occupation/C116)
- C116 5 case：lessons / lessons-4 / B109 PaperMaker 折扣 / B27 Toolbox modifier / 默认 cost
- 删 lessons/lessons-4 硬编码后 modifier loop 行为等价
- renovation 多 solution choice 走 engine ChoiceNode

### 5.4 PR-4 (construct/farm/B18/D74/C148)
- B18 case：reserve=0 / reserve=2 / reserve=4 (round value)
- D74 case：paid=2/3/4/5 (round((n-1)/2))，区分 farm-expansion vs 其他 place-farmer
- C148 case：BeggingCard pay pig / cooking pay pig / 不付 pig 不触发
- farm-choice engine 化 regression：room/fence/stable/plow 4 类完整流程

### 5.5 PR-5 (C146)
- C146 4 case：n=0 / n=6 自动 / n=3 玩家选 / n=3 选不全 re-emit
- C104 补 3 case session test (顺手)

### 5.6 跨卡 regression
跑 `pnpm test:slow` 全量，确认所有 BonusModifier / `'after'` listener / pay-relevant 卡通过。

---

## 6. Risks

1. **ComplexCost UI 双轨 → 收敛**：farm-choice engine 化后 farmPayment ad-hoc pending 通道废弃，所有 ComplexCost 走 engine ChoiceNode。前端 `PaymentChoicePrompt` 需统一识别 `pay:room/pay:fence/pay:improvement/pay:renovate` prefix。
2. **`apply-improvement-finalize` idempotent**：当前 `playImprovement` 流程先 mutate (push card, incMajorBuilt) 再 pay。改 seq 后必须把 mutate 全下沉到 finalize leaf，且 finalize 仅在 pay 成功后跑。
3. **`_activeActionBonusSources` 删除**：6+ callsite (improvement.ts:122/376/427、occupation.ts:24/149) 需要 review 重写为 `extraData.bonusUsed` 读。漏一处会让 E123/E54/E122/E128 行为漂移。
4. **D74 wood diff → real paid wood**：D74 当前用 `player.resources.wood` diff 累计 woodSpent 触发场景广（construct/stables/improvement-any），迁移到 `actions:['pay']` 后只在真实 pay 时累加，**未必等价**。需要 5 case session test 覆盖（特别是 stables 走 pay 路径吗？）。

---

## 7. §2.5 Deliberate Divergence (新增登记)

| 项目 | BGA | 我们 | 理由 |
| --- | --- | --- | --- |
| **C148 reorganize auto-pick** | 弹 `REORGANIZE` 让玩家手动选哪只 pig 离开（决定 cap 缩否） | `syncHeldDownward` auto pick `min(held, boar)`（保 cap） | 玩家最优策略等价（cap 大无 trade-off）；省 1-2d dispatcher 改动 |

---

## 8. Out of Scope (推 7b2 / 后续)

- 14 张漏修 audit fix（C135 + 13 P1）→ 7b2
- 7 张 demote docs sync → 7b2
- 2 张复核（C116/D100）→ 7b2（C116 在 7b1 已迁，D100 仍 7b2）
- C148 reorganize trigger（dispatcher push reorganize node）→ §2.5 deliberate
- §2.5 27 张 simplification re-review → 独立 audit sprint

---

## 9. Definition of Done

- [ ] 5 PR 全部合入 main，CI 通过
- [ ] `pay-resources` 删除，所有 callsite 迁 `pay`
- [ ] `_activeActionBonusSources` 删除，所有 callsite 改 `extraData.bonusUsed`
- [ ] farmPayment ad-hoc pending 通道废弃
- [ ] 8 张 after-pay 卡迁 `actions:['pay']`：E123/E54/E122/E128/C116/B18/D74/C148（C148 用 syncHeldDownward 作为 handler，简化保留 §2.5 reorganize trigger）
- [ ] E123 BGA full use-top-k 实现
- [ ] C146 WorkshopAssistant 实现 + C104 session test 补
- [ ] `pnpm test:fast` + `pnpm test:slow` + `pnpm run lint` + `pnpm run build` 全绿
- [ ] `docs/card_progress.md` §2.0 / §2.5 / §3 同步
- [ ] `docs/master-plan.md` §8 加 Sprint 7b1 行
