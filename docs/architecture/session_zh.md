# shared/session/ — 会话层

[English](session.md) | [中文](session_zh.md)

> 本文件是中文翻译镜像；[session.md](session.md) 是唯一权威版本。

`GameCore` 协调 `GameState`、`EngineStack`、历史、阶段推进、交互构造、撤销与响应。`phases/` 中的阶段函数是纯 helper，不是 mixin；所有协调都汇聚在 `GameCore`。

## 文件

```text
shared/session/
├── session-core.ts        GameCore 命令入口
├── serialization.ts       SerializedGameState 序列化
├── state-bootstrap.ts     初始状态构造
├── stats.ts               统计与日志
└── phases/
    ├── setup.ts
    ├── round.ts
    ├── harvest.ts
    └── draft.ts
```

## GameCore 入口

`GameCore` 持有 `state`、`engineStack`、带行动起点快照的步骤历史，以及终局计分缓存。`GameSession`（`server/game/authoritative-session.ts`）是薄包装，注入隔离的自定义卡执行器，并构造按视角过滤或调试用的 payload。对服务端暴露的命令：

```text
takeAction(playerIndex, spaceId)
takeSpecialAction(playerIndex, cardId, actionId, payload?)
takeAnytimeAction(playerIndex, actionId)
resolveChoice(playerIndex, value, payload?)
commitSelectionChoice(playerIndex, payload)
resolveOrdinaryCardDrawChoice(playerIndex, choiceId, keepCardId)
performRoundEnd()
loadState(raw)
undoStep() / undoAction()
```

## 统一的 SessionResponse

```ts
type SessionResponse = {
  ok: boolean
  state: GameState
  interaction: InteractionState
  historyLength: number
  hasActionStartSnapshot: boolean
  scores?: PlayerScoreSummary[]
  actionAvailability?: Record<string, boolean>
  cardAvailability?: Record<string, boolean>
  error?: string
}
```

- Session 测试直接断言这一结构；WebSocket 路径通过 `GameSession.buildSyncPayload()` 序列化并按视角过滤。
- 每个修改命令都经过一个结算边界（[ADR 0015](../adr/0015-provisional-cross-player-continuation-resolution.md)）。输入拒绝恢复完整的命令检查点，包括历史与行动起点 metadata；已接受的必选阻塞保留其效果。仅凭 `ok:false` 或 `recoverable:true` 不能判定为拒绝。规则上合法但破坏守卫的命令保留其持久的暂定恢复与失败记忆；在受守卫范围内提交的非法输入两者都不获得。
- 失败记忆比较规则状态时排除恢复与完成的记账事件（`continuation.restored`、`anytime.completed`）。完成反应产生的状态变化和领域事实仍能重新开放失败命令；仅完成无效果的 anytime flow 不会。

测试：`server/__tests__/{authoritative-command-settlement,rejected-pending-input}.test.ts`。

## 轮转、额外回合与供应人物

**额外回合**（[ADR 0001](../adr/0001-a92-adoptive-pull-model-extra-turn-hook.md)、[ADR 0008](../adr/0008-node-parallel-reaction-dispatch.md)）：

- `contributeExtraTurn?: (state, player) => ActionFlow | void` 是 `CardEffect` hook，由 `shared/session/phases/round.ts` 的轮转显式消费，`runCardEffectHook` 不会执行它。
- `collectExtraTurnContributions()` 是唯一来源；`hasPendingExtraTurn()` 据此判断，`collectExtraTurnFlow()` 构造交互。三个门禁把待处理的额外回合视为资格：`nextSeatedPlayerIdx`、`roundWorkComplete` 与轮转跳过循环。
- `startPendingExtraTurnIfAny(core)` 是唯一注入路径，工作阶段入口、确认下一玩家的轮转、加载状态与撤销恢复共用，且只在当前座位的空栈中注入。带 `extraTurnBeforeWorkers: true` 的 provider 与普通放人及合法的沼泽特殊行动并列出现；其余 provider 在普通工人用完后才运行。供应类 provider 只有在普通工人用完后才能放弃；选择普通放人会保留之后的机会，除非该卡要求占用第一个回合，此时它在 `onEndTurn` 中消耗该机会。待处理的普通抽牌会推迟注入。
- 可重复的 provider 可定义 `countExtraTurns`。跳过与强制消耗按来源卡计入 `PlayerState` 字段，`countPendingExtraTurns()` 复用 provider 聚合，而不用玩家级计数器；只有在必须自动推进时，非交互回退才按稳定卡序消耗一个来源。
- `onBeforePlayerTurn` 返回 `{ skipTurn: true }` 时，轮转在该玩家回合开始前跳过他。
- Snake Opening（单座位时忽略）让每位玩家以 3 食物开局。第 1 轮中，`nextWorkRotationIdx()` 在工作轮转第一次要越过本轮工作顺序起点时反转，发出 `snakeOpening.reversed`，并在该工作阶段内保持反向；反向轮转从刚行动的座位开始，该座位会先被再次考虑；其他顺序使用正向 helper。

**供应人物：**

- 供应放人使用 `place-farmer` 加 `actionContext.workerSource: { kind: 'supply', disposition, workerId? }`。执行时在显示目标前锁定一个有限的工人 ID；提交、事件、联动占用、移动与撤销都保留它。卡牌驱动的放人在当前 Turn Scope 中记录人员行动身份。
- `inactiveWorkersInSupply()` 排除预留、待放置、临时人物与已移除 token；`availableWorkers()` 包括召回的临时人物，而家庭人数、住房、喂食与计分只用永久成员。
- `returnSupplyWorkers()` 在所有 `onBeforeReturnHome` 之后、`onStartReturnHome` 之前执行，移除该 ID 的所有位置并按处置方式处理；被召回或移动的人物保留其处置方式，没有到期归还轮次的预留在归家后仍然保留。此前 `recordReturnHomePlacements()` 在 `__roundPlacement__` 中记录最终位置；归家效果读取 `getReturnHomePlacements()` 或 `getReturningPersonPlacements()`（排除合成占位与已移除人物），从不读实时占用。
- 预留与放置机会是两回事；预留卡在其声明的时机释放预留（例如在目标轮的 StartOfTurn 树中）。供应机会使用普通的当前步骤准入：已接受但没有合法目标的使用会阻塞，直到显式撤销，没有未来目标预检或退款。
- 额外住房到期时先清除其容量；住房不足时只永久移除稳定家庭顺序中的第一名活动成员（`removedFromSupply`、清除引用、发出 `to=removed` 的 `worker.returned`）。

测试：`server/__tests__/{supply-workers-session,snake-opening-session}.test.ts`。

## Turn Scope 与行动执行作用域

轮转机会、Turn Scope 与行动执行作用域是三种独立的生命周期。“在你的回合”与“同一回合”读取 Turn Scope；“实际建造 / 犁 / 播了什么”读取当前行动的作用域或 transaction。

| 规则情形 | 轮转机会 | Turn Scope | 行动执行作用域 |
|---|---|---|---|
| 轮转选出的普通放人或沼泽特殊行动 | 消耗当前机会 | 开启新作用域 | 每个完整规则行动一个 |
| 贡献的额外回合 | 开启额外机会 | 开启新作用域 | 每个完整规则行动一个 |
| 经 `move-farmer-to-space` 的工人移动（每名移动的工人） | 无新机会 | 每名移动的工人开启新作用域 | 每个完整规则行动一个 |
| 仍属于当前回合的即时规则行动 | 无新机会 | 继承当前作用域 | 开启新作用域 |
| 不算回合的阶段或 anytime 规则行动 | 无新机会 | 无 | 开启新作用域 |
| 单纯的获得、支付、选择或 listener 激活 | 无新机会 | 若存在则继承 | 留在外层作用域 |

- Turn Scope 在放人、沼泽特殊行动或卡牌驱动的行动格使用之前开始，覆盖该回合的每个规则行动、尾随效果、必需的整理和回合结束 hook，之后清除活动快照。显式的 after-turn 发动只保留捕获的身份，不重新开启作用域或快照。移动工人产生的回合把普通人员行动的触发身份传给这些 hook，并在选择下一名工人前关闭。
- 执行“在你的回合”效果需要 owner 的活动作用域；可执行性查询可以投影当前轮转玩家即将开启的作用域。
- 同一回合的多个规则行动共享 Turn Scope，各用独立的行动作用域。按行动的差值使用行动 transaction。
- Anytime 接受时捕获当前 Turn token；只有原玩家交棒窗口能捕获刚结束的 token，否则显式标为 before-turn/outside-turn。空栈的新玩家不继承 `lastToken`；回合前形成的资格等下一真实 Turn 结束。后代继承冻结的归属，每 Turn 的消费者据此判定，不从后来的状态猜测。
- 同一人物的 `jumpLeaf` 跳转与不放人的 `viaCardJump` 使用留在外围 Turn Scope（如有）中；只有 `move-farmer-to-space` 用 `turn-scope` begin / end 包住每次移动。
- `actionContext.trueAction` 只表示一个效果对 listener 而言是否算作执行了具名行动；它不开启回合，也不开启行动作用域。
- **人员放置序号**按 Work Placement Chronology 中的正常人员放置计数：同一工人移动不推进；正常放置临时或召回的人物会推进。`isCurrentActionSecondPersonPlacement()` 优先使用当前上下文的 `placedWorkerId`。
- `recordRoundPlacement()` 从该顺序返回临时 `PersonUseReceipt`，包含实际 worker ID 与序号；搬迁不返回。普通放人将它冻结在可序列化的行动帧中，卡牌授予的放人将它保留在结果中，直到既有整格 `place-farmer.after` 续行。仅在卡上使用人员时，在成功修改处发出 `worker.useCompleted`，使其反应先于后续同级奖励完成。各边界保留自己的完成时点，不维护持久的使用计数。测试：`server/__tests__/person-use-completion-session.test.ts`。

测试：`server/__tests__/{person-placement-order-session,move-farmer-before-placement-session}.test.ts`。

## 逐玩家喂养结算

`handleFeedResolved()` 解析已提供目录与实时配方，完整校验批次后，把原等待帧替换为普通 Exchange flow。私有 `feedingResume` 保存剩余需求、已付食物、转换成本和玩家队列。完整批次反应与必需的动物整理结束后，才支付剩余食物、补乞讨和供暖。快照恢复与撤销同时恢复续行和引擎游标，不重做已完成兑换或重复扣除已付食物。

批次后仍有合法 anytime 行动时，新的 feed 等待保存同一续行。提交空批次结束该机会；再次兑换则累计转换成本，不重复支付已付食物。没有可用 anytime 行动时自动继续结算。这样反应奖励可以用于新批次，卡牌行动也可在剩余食物付款前完成。

测试：`server/__tests__/{exchange-batch-session,harvest-session,harvest-feed-conversion-listener-session}.test.ts`。

## 快照数据与可执行规则恢复

见 [ADR 0028](../adr/0028-session-recovery-preserves-authoritative-snapshot-data.md)。新局创建负责初始发牌。加载或恢复 Session 时保留现有的空手牌、已存的卡牌身份、缺失的可选规则字段、动物安置与历史；从不重新发牌，非法的必需输入会被拒绝，而不是转成新局。`rehydrateState()` 只解码数据；所属 Core 随后重建已知的可执行定义与引擎游标，不替换捕获的数据。撤销、命令检查点、暂定检查点与进程恢复共用这一契约。

测试：`server/__tests__/session-recovery-data.test.ts`。

