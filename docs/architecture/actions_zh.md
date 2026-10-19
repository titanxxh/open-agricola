# shared/actions/ — 行动定义

[English](actions.md) | [中文](actions_zh.md)

> 本文件是中文翻译镜像；[actions.md](actions.md) 是唯一权威版本。

本 module 负责行动定义、effect 与内部行动、农场类提交和 anytime 窗口策略。支付管线见 [payment](payment_zh.md)，hook 注册表、Stage Dispatch 与 listener 纯度见 [hooks](hooks_zh.md)。单卡规则留在卡牌文件里，只通过下面的 seam 接入本 module。

## 目录

```text
shared/actions/
├── index.ts               actionDefinitionLookup Map；自动发现基础行动与内部行动
├── flow.ts                ActionFlow：leaf、seq、parallel、xor、or 及可选 metadata
├── hooks.ts               Hook 注册与分发
├── hook-matrix.ts         buildHookMatrix() 优化矩阵
├── internal-actions.ts    mark-card-trigger 等内部引擎行动
├── effects/               基础行动，每个行动一个文件
│   └── internal/          内部 effect
├── factories/             行动工厂
├── helpers/               支付、动物、农场共享 helper
├── payment/               PaymentSolver 与执行器
└── __tests__/
```

## `ActionDefinition`

```ts
type ActionDefinition = {
  id: string
  nameKey: string
  descriptionKey?: string
  rulesKey?: string
  roundAvailable?: number
  gainPerRound?: Partial<Resource>
  canBeExecutedByPlayer?(state, player): boolean
  canBeOfferedByPlayer?(state, player): boolean
  originalActionCondition?(context): boolean
  isAlreadySatisfied?(context): boolean
  costPreview?(...): CostPreview
  isDoable?(...): boolean
  isAutomatic?(...): boolean
  execute(state, player, params?): ActionExecutionResult
  resolveChoice?(state, player, value, payload?): ActionExecutionResult
  emitLeafActionDetail?: boolean
  flow?: ActionFlow
  flowFactory?(planningContext): ActionFlow
  getBaseChoiceOptions?(...): ActionChoiceOption[]
  choicePromptKey?: PromptKey
  noChoiceLogKey?: string
}
```

- `descriptionKey` 是印刷行动文字；`rulesKey` 是独立的本地化补充裁定，不影响合法性与执行。
- Hook 不属于 `ActionDefinition`。通用变体规则注册到当前 Core 的 `ActionHookRegistry`；卡牌反应用 Card Listener。
- `getBaseChoiceOptions` 是 opt-in 的选择管线：基础选项、注入 `computeChoiceCandidates`、按 `value` 去重、按 `costPreview.canExecute` 过滤。零候选失败，一个直接结算，两个及以上弹选择。它与 `execute() → choice → computeArgs.extraOptions` 路径互斥。
- `flowFactory` 是纯数据计划，执行与描述共用。
- `canBeOfferedByPlayer` 在显式可选 offer 中区分非支付资格与支付能力：有资格但付不起时选项仍可见、Accept 禁用；资格本身不授权执行。
- `originalActionCondition` 与 `isAlreadySatisfied` 见 [公开 ActionNode 执行顺序](hooks_zh.md#公开-actionnode-执行顺序)与[当前步骤准入与 blocked 恢复](hooks_zh.md#当前步骤准入与-blocked-恢复)。

测试：`shared/engine/__tests__/engine-choice-candidates.test.ts`、`shared/actions/effects/__tests__/improvement-offer.test.ts`。

## Effect 与内部行动

- `shared/actions/index.ts` 只导入顶层基础 effect 和 `effects/internal/` 来构造 `actionDefinitionLookup`。`scripts/check-effects-file-list.ts` 是顶层 effect 文件的唯一白名单，`shared/actions/effects/__tests__/architecture-guard.test.ts` 复用它。
- 每个行动一个文件。effect 文件不堆叠多卡逻辑：宿主行动子步骤用 `internalChildren`，内部 effect 放 `effects/internal/`，纯 helper 放 `shared/actions/helpers/`。
- listener 需要的状态修改若没有现成 leaf，就新增可复用的内部行动，不在 handler 里直接改（[Listener 纯度](hooks_zh.md#listener-纯度)）。

通用内部行动及其契约：

| 行动 | 契约 |
|---|---|
| `collect` | 从累积格取物的唯一入口，部分领取和跨格领取通过 `actionContext: { spaceId?, resource?, amount? }`。卡牌提供的累积格声明 `gainPerRound`，货物存于 `ActionSpace.resources`。 |
| `gain` | 结算前先确定接收者。付款方出资的 gain 先校验完整转账再移动资源，事件保留付款方来源。显式资源参数与行动格配置的基础收益分开识别。 |
| `return-to-space` | 把货物返还到 `actionContext.targetSpaceId` 指定的格；支付与移动事件使用同一目标。 |
| `place-farmer-on-space` | 在固定目标上额外放一名工人，通常随后展开目标 flow；`params.executeTarget: false` 只放工人、不展开目标。`allowOccupied` 只放宽占用，不绕过封锁、轮次开放、可执行性或工人供应。卡牌不在 handler 里写 `ActionSpace.takenBy`。 |
| 无人物使用与固定目标跳转 | 卡牌可不放置、不消耗人物而执行完整行动格 flow（`place-farmer.actionContext.viaCardJump`），或把绑定工人跳转到固定目标（`jumpLeaf`）。查询与执行绑定同一工人；费用、否决、联动封锁和防递归仍生效。 |
| 授予的规则行动 | 卡牌授予规则行动时直接调用该行动；授予某行动不展开平时提供它的整个行动格。 |
| `pass-minor-card-to-left` | 把已打出的小改良移入左侧玩家手牌，清除其卡牌状态，发出公开 `card.passed` 与私有手牌变更。后续触发读取 `card.passed`。 |
| `individual-food-cost` | 职业的强制个人食物费用，独立于职业费用和 PaymentSolver：支付现有食物，缺口用乞讨补；缺粮时需显式确认；预览与结算读取实时库存。 |
| `take-from-card` | 先扣来源卡 counter，再把入账交给一个 `receive` 子节点，因此 Receive reaction 能观察从卡上移出的货物，Gain reaction 观察不到。 |
| `pop-card-stack` / `claim-farmyard-goods-tokens` / `claim-field-goods-tokens` | 移除卡上栈顶或可领取的农场货物标记，把真实货物交给一个 `receive` 子节点入账。农场格标记按来源领取，可选附带已提交坐标；非货物栈项只改变栈。 |
| `special-effect` | listener 返回 leaf 的通用修改分发器：counter、flag、infobox、卡堆、supply token 与农场格状态。它从不向供应区入账货物。`countCardUse: false` 标记不应计为卡牌使用的整理操作。 |
| `receive` | 已有货物进入供应区的唯一入账方式（[ADR 0030](../adr/0030-existing-goods-enter-supply-through-receive.md)）。它在一次 transaction 中为一名玩家结算到期的未来货物（见 [阶段 hook](hooks_zh.md#阶段-hook)），也为来源动作已从卡上移除的货物入账（`params.fromCard`）。`gain` 只表示从公共供应区获得新货物。 |
| `activate-card` / `activate-card-effect` / `activate-extra-turn` | listener、阶段效果和额外回合 provider 的激活 leaf，见 [阶段 hook](hooks_zh.md#阶段-hook)与[Listener 纯度](hooks_zh.md#listener-纯度)。 |
| `reap` | 普通收获与私人田间阶段收获，见 [阶段 hook](hooks_zh.md#阶段-hook)。 |

- 职业可用性、选择提交和直接 / 免费打出共用同一个前置门禁。改良费用预览与支付以授予的 `sourceCard` 或实体行动格 ID 作为 `actionCardId`。
- 选择类后续行动在 `actionContext` 中携带语义来源（例如 `extraCropPlacement`）；后续卡牌读取该标记，不读来源卡 ID。
- 资源获得类 listener 订阅实际入账的行动（`gain`、`collect`、`receive`、`reap`、`exchange`），不订阅把入账交给 `receive` 的来源动作；同一次移动不能两次到达同一个 listener。关心卡牌自身 counter 或栈的 listener 可以订阅来源动作。

测试：`shared/actions/effects/__tests__/{collect,gain,place-farmer-on-space,place-farmer-jump,take-from-card,pop-card-stack,special-effect,farmyard-goods-claim}.test.ts`、`server/__tests__/{empty-accumulation-admission,receive-existing-goods}-session.test.ts`。

## 农场类提交

每种农场类型都在 `shared/actions/effects/` 下自己的 `ActionDefinition.resolveChoice` 中闭环：

- **房间**（`construct.ts`）：`room-payment.ts` 展开逐房间费用变体；印刷的“每间房”折扣使用 `scope:'unit'`。屋内动物按真实房间保存在 `houseAnimals`。
- **马厩 / 犁地**（`stables.ts`、`plow.ts`）：typed-flat 支付；马厩定价由默认价、`exactCost` 或 `costOverride` 与一次完整的农场选择查询得出单价。`plow.actionContext.allowedTiles` / `adjacencyPolicy` 只影响本次犁地。
- **围栏**（`fencing.ts`）：校验边、来源、连通性与区域；通过农场选择的 `computeCosts` pass 计算费用；把 trade、bonus、provider 与预算传入 `pay:fence:*`。`before` 贡献按来源写回宿主：木材折扣不增加实体，卡上围栏由玩家显式选择，只为本次新建的普通围栏消耗。
- **播种**（`sow.ts`）：没有支付组合。`maxSelections` 计算 Logical Field，`maxSeedSelections` 限制作物槽；行动作物许可与田地 owner 的许可取交集；`isUnconditionalSow` 保留显式限制。

首轮 payload 为 `fence: {edges, palisadeEdges, extraWood, fenceSources?}`、`room: {rooms}`、`stable: {stables}`、`plow: {tile}`、`sow: {crops}`，以 `{type:'choice', value:'confirm', payload}` 提交。第二轮支付把 payload 保存在 `pending.actionContext.farmPayload`。建房与围栏的入口可执行性会拒绝没有可达提交的状态。

### 围栏段与 policy

- `FenceSegment.type`（普通围栏或 palisade）与 `FenceSegment.source`（谁的 token）相互独立。借用围栏是 `source.kind='borrowed'` 的普通段。
- 围栏主路径从不按卡牌 ID 或单卡开关分支。卡牌行为使用 `fencePolicy`：`allowedSegmentTypes`、`sourcePolicy`、`segmentBounds`、`newPastureBounds`、`newRegionBounds`、`pastureBounds`、`connectionPolicy`、`allowedNewRegionTiles`、`allowTerrainInNewRegions`、`suppressTerrainRegions`、`costPolicy`、`paymentBudget`、`cancelPolicy`、`preserveAnimalTotals`、`promptHintKey`。
- `sourcePolicy: { kind: 'borrowed', donorCaps }` 要求 `fenceSources` 覆盖每条新普通边；服务端按出借方实时库存重新 clamp 上限，并消耗出借方供应。
- `newPastureBounds` / `newRegionBounds` 限制新牧场或新区域的数量与总面积。`pastureBounds` 是另一项检查：`newPastures` 限制牧场数的净增量，`changedPastures` 限制新建或改形的牧场数，`newPastureSize` 限制其中每个牧场的面积。
- `segmentBounds.total` 合并限制普通围栏与 palisade。`canStartFencing` 用 `validateFenceSelection()` 预检至少一个合法提交，后者仍是最终原子校验。
- `costPolicy` 只设置本次行动的基础单价，`computeCosts.fence` 折扣仍生效。`paymentBudget` 只过滤最终支付，不限制几何。`promptHintKey` 只是文案。

测试：`shared/actions/__tests__/fencing.test.ts`、`shared/actions/effects/__tests__/{fence-resolveChoice,fencing-entry-guard,construct-resolveChoice,sow-permissions}.test.ts`。

## Anytime 窗口策略

`shared/session/anytime-policy.ts` 的 `computeAnytimePolicy()` 在每次 `buildInteraction()` 时计算一次 card listener 的 anytime 可用性；客户端从不导入它。`GameCore.getAnytimePolicyInput()` 提供活动上下文、`stageResume`、请求类型与请求的 `anytimeWindow`。

- flow 或请求可声明 `{ allowed: true, blockedIds? }` 或 `{ allowed: false }`。声明只属于当前等待节点；父节点、兄弟节点和续行都不授予权限。
- 优先级：无上下文；供暖；engine-blocked；下一玩家确认（禁用 exchange）；玩家切换确认；动物整理；当前节点的显式窗口；默认的阶段 hook 链封锁；普通允许。metadata 不能覆盖前面的硬封锁；格式错误的窗口关闭。
- 三个消费者共享同一快照：`buildAnytimeEntries()` 过滤条目；`buildInteraction()` 只在允许且非空时暴露 `takeAnytimeAction`；`takeAnytimeAction()` 在注入前执行该策略。
- 卡牌条目共用当前步骤准入（[当前步骤准入与 blocked 恢复](hooks_zh.md#当前步骤准入与-blocked-恢复)）；根 `optional` 不能绕过，新行动使用自身的来源、参数、费用与执行者。
- 嵌套 anytime flow 插在当前 pending 树之前；父级以同一个 `PendingEnvelope` 返回。
- 重入：Anytime Ability 的 sequence 进行中时，该玩家在所有帧中都不能再进入同一条目。`allowAnytimeReentry` 只解除这一限制，目前只有系统 `exchange` 设置它。同一能力内的货物或目标选项共用其条目。
- 每个已接受命令在现有 `anytimeActionId` 序列上冻结 Turn 归属与 parent activation ID。序列等全部后代及必需的动物整理完成后才发出 `anytime.completed`，包括同一 frame 注入的流程。事实复用已捕获的 `actionEvents` 和普通 `after` trigger-select；嵌套发动的完成不代表父发动完成。身份、归属与父链接随 Session cursor 和撤销恢复；清理 leaf 不携带完成标记。见 `server/__tests__/anytime-completion-session.test.ts`。
- 替代回合的 anytime 行动（`replacesTurn`）只在工作阶段空闲时可用，完整 flow 和回合结束 hook 结束后才轮转。
- **兑换批次**：`effects/exchange.ts` 的 `executeExchangeBatch()` 在任何支付前，按原数量和顺序校验配方与来源额度、资源和已安置动物余额。前项配方所得可支付后项，未领取的反应奖励不可预支。任一项非法即拒绝整份提交，不截断次数或部分成交。普通 direct、单项、bulk 和已提交的喂食配方共用该执行器，每项收据记录其支付前库存。引擎先执行批次反应，再执行必要的动物整理。配方可在指定交互类型中禁用 anytime（`blockedAnytimeInteractionKinds`）；繁殖期间动物烹饪配方不可用。`bulk:` 这类紧凑选项值使用请求的 `structuredChoicePrefixes`。
- **兑换目录**：`getExchangeCatalog()` 按显式窗口解析声明配方与运行时配方。声明查询与收获次数账本位于 `helpers/exchange-recipes.ts`，供普通兑换、收获工坊机会和喂食共用，取消不消耗次数。每个已解析配方持有自身的收获使用轮次，anytime 配方不因外层喂食获得收获限次。普通 anytime 兑换仅在 feeding phase 或有显式 `harvestExchangeRound` 授权时纳入收获配方；更宽泛的 harvest 大相位本身不授予权限。`feed` 请求按 `(sourceId, exchangeIndex)` 发布 `exchangeCatalog`；提交同时匹配已提供目录与实时目录。
- 动物整理是系统子流程，从不作为 anytime 条目。工作阶段空闲回合与 `confirm-next-player` 是当前玩家的窗口；`confirm-player-switch` 与阶段 hook 链默认封锁，除非当前节点开启窗口。`computeResourceCommitments()` 的限制在命令边界执行（[ADR 0019](../adr/0019-resource-commitments-preserve-unsettled-trades.md)）。

测试：`shared/session/__tests__/anytime-policy.test.ts`、`server/__tests__/{anytime-reentry-session,anytime-nested-pending,anytime-policy-negative,anytime-admission-session,exchange-batch-session}.test.ts`。

