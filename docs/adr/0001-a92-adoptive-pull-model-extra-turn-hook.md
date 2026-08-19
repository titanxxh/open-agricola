# 1. A92 Adoptive Parents: pull 模型 + 通用 extra-turn 轮转扩展点

- Status: Accepted
- Date: 2026-05-30

## Context

`A092_AdoptiveParents` 的规则是"付 1 food 让本轮新出生的后代当轮就能行动一次"。这本质上要给玩家一次**额外放工机会**。

OA 原实现是 **push 模型**：在每次 place-farmer 的 `after`-hook 里内联追加 `seq[pay, gain(死代码), place-farmer]`，连续执行、不经过轮转。这与 参考实现的 **pull 模型**根本不符，导致玩家放完一个普通工人后立即连放第二个，**破坏 Agricola 严格交替放工规则**（双人对战中会让 A92 玩家插队抢行动格）。

实证发现两个底层约束（探针测试通过）：

1. OA 没有 参考实现 `skippedPlayers`（本轮出局集合）的等价概念，轮转纯靠 `workersAvailable<=0`。
2. `nextSeatedPlayerIdx` 与轮转循环只认 `workersAvailable>0` 的玩家 —— `workersAvailable===0` 但持有 A92+后代的玩家会被**直接跳过、永远拿不到 turn**，因此后代在出生轮无法行动。

要忠实对齐 参考实现，必须让轮转能"看见"这类玩家并给他一次选择窗口。这无法在卡牌文件内闭环，必须动轮转主路径。

## Decision

引入一个**通用的 extra-turn 轮转扩展点**，A92 是第一个消费者：

1. 新增单个 CardEffect hook `contributeExtraTurn?(state, player): ActionFlow | void`。
2. 新增聚合 `hasPendingExtraTurn(state, player)` = 任一卡 `contributeExtraTurn` 返回非 void。
3. 把轮转 gating 的 `workersAvailable<=0 就跳过/结束` 改为 `workersAvailable<=0 && !hasPendingExtraTurn`，覆盖三处：`nextSeatedPlayerIdx`、轮转 while 循环、`allWorkersUsed` 回合结束判定。
4. 轮转放行进 turn 后，把 `contributeExtraTurn` 返回的 flow 作为 pending 交互推给玩家。

A92 据此实现 参考实现双入口：

- **能力 A（anytime grow-only）**：`phases:['anytime']` listener，flow = `seq[pay 1 food, promote-newborn]`（不含 place-farmer，靠正常轮转交替）。
- **能力 B（轮转额外行动）**：`contributeExtraTurn` 返回 `XOR[ seq[pay, promote, place-farmer] , 放弃 ]`。

统一判定 `adoptiveAvailable = 持卡 + newbornCount>0 + !forfeitedThisRound`，对齐 参考实现 `hasAdoptiveAvailable()`。"放弃"写 `cardStates.A92.forfeitedThisRound`（参考实现 `skippedPlayers` 的卡内局部等价），回合开始清空，避免轮转死循环。

## Consequences

正面：
- 忠实对齐 参考实现的交替语义，修复 push 模型的插队 bug。
- `contributeExtraTurn` / `hasPendingExtraTurn` 是通用扩展点，未来 Telegram / GuestRoom / WorkPermit / DelayedWayfarer 等"额外放工"卡可统一复用，而非各自打补丁。
- 出局状态留在卡内 `cardStates`，不污染 `GameState` 主结构与 snapshot。

负面 / 风险：
- 改了 `round.ts` 轮转主路径三处 gating，必须同时正确，否则死循环或回合提前结束。需 session 测试三处都覆盖。
- `forfeitedThisRound` 的清空时机若遗漏，会导致后续轮次 A92 永久失效。

## Alternatives considered

- **保留 push 模型，仅修死代码**：拒。无法修复破坏交替的核心 bug。
- **新增全局 `GameState.skippedPlayers` 字段（真·对齐 参考实现）**：拒。动 GameState 主结构、影响 snapshot/patch 协议，超出单卡范围；卡内 `cardStates` forfeit 标记已足够。
- **双 hook（boolean 判定 + flow 产出分离）**：拒。两处判定逻辑需人工保持一致，易漂移。单 hook 返回 flow 是单一真相源。
- **扩展 `onBeforePlayerTurn` 返回 `{skipTurn?, flow?}`**：拒。skip 与 extra-turn 语义混合，且 gating 仍需单独聚合判定。

## 2026-07-02 amendment: provider selection

后续实现 `M057_Taps` 后，extra-turn 不再只有 A92 一个 provider。`contributeExtraTurn` 的职责保持不变：每张卡声明“我现在能贡献什么额外行动 flow”。聚合层从 first-match 升级为 provider selection：

1. `collectExtraTurnContributions()` 收集所有 provider。
2. `hasPendingExtraTurn()` 只看是否存在 provider。
3. `collectExtraTurnFlow()` 在单 provider 时直接展开；多 provider 时生成 one-shot `ParallelNode(mode='trigger-select')`，让玩家先选择来源卡。
4. skip / forced consume 改为按 cardId 记录机会消耗，避免 A92 与 M057 并存时一个全局计数错误吞掉另一张卡的机会。

这个 amendment 不改变本 ADR 的核心决策：extra-turn 仍是轮转层主动消费的通用 hook，而不是 `onBeforePlayerTurn` 或单卡 after-listener push flow。
