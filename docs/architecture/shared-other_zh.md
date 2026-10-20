# 其他 shared/ 模块与游戏变体

[English](shared-other.md) | [中文](shared-other_zh.md)

> 本文件是中文翻译镜像；[shared-other.md](shared-other.md) 是唯一权威版本。

## `shared/draft/`

同时选牌的纯函数（`initDraftState`、`processSubmit`、`tryAdvanceRound`、`finalizeDraft`）；`createRoom` 用 `draftMode: 'simultaneous'` 与 `draftPoolSize: 7..10` 启用。启用 Farmers of the Moor 时，职业、FoM 小改良与已出版小改良分阶段选秀，FoM 小改良池从已实现的注册表派生，不足时拒绝开局，除非设置 `allowIncompleteFarmersOfTheMoorMinorDeal`；Community Deck 小改良只进入已出版部分。

## 游戏变体

Game Variant 改变一局游戏的设置、公开状态、行动格、阶段流程或计分；它不是卡牌来源，也不增加前端规则。

- **Parent Cards**（[ADR 0005](../adr/0005-parent-cards-dedicated-expansion-runtime.md)）是 `shared/parents/*` 中的结构化数据，素材由 `public-assets.ref` 固定，与 Card Source 投影分离；选择、奖励与支线任务由后端权威裁定，并使用非公开种子。
- **Through the Seasons** 把四个季节格保留在版图上，只启用当前季节；其 modifier 注册在每个 Core 的 `ActionHookRegistry`，从不写玩家 `cardStates`。新回合编号一提交季节就推进，早于准备阶段；准备阶段先做普通回合增长，再做该季节的累积调整（先 `applyRoundGrowth()`，后 `applySeasonPreparationAdjustments()`），调整结果不低于零。
- **Farmers of the Moor**（[ADR 0007](../adr/0007-farmers-of-the-moor-variant-runtime.md)）通过 [domain](domain_zh.md) 的通用 seam 增加地形、扩展、马、供暖与自己的大改良供应。不使用同时选秀时，`createInitialPlayers()`（`shared/session/state-bootstrap.ts`）给每位玩家发 4 张 FoM 小改良加 3 张已出版小改良；额外、自定义与 Community Deck 小改良只进入已出版部分；只有设置 `allowIncompleteFarmersOfTheMoorMinorDeal` 时，FoM 小改良池不足才会让每位玩家的 FoM 部分等量减少。
- 真实 Moor 特殊行动共用 `shared/moor/special-action-flow.ts` 的 `buildMoorSpecialActionFlow`：正常与借用取牌行动、卡牌赠送和定时 offer 均先校验选定行动与目标，再进入 before。before 来源按 owner 分组，使用原生 activation 与 trigger-select；主体提交前重新校验。基础提交后，原生完成帧在必须后续开始前冻结 after 来源与原始收据。共享引擎完成边界等待支付、onBuy 与动物整理，再按 owner 合入终点规则反应。仅取牌不进入该生命周期，也不产生放工或行动格使用。见 [ADR 0032](../adr/0032-unified-moor-special-action-lifecycle.md) 与 `server/__tests__/{moor-granted-lifecycle,moor-completion-window}-session.test.ts`。
- **Snake Opening** 只反转第 1 轮的工作轮转（[轮转、额外回合与供应人物](session_zh.md#轮转额外回合与供应人物)）。

## `shared/custom-code/`

工坊卡只通过已部署的 Workshop Capability Contract 准入（[ADR 0025](../adr/0025-workshop-capability-contract-is-fail-closed-and-opened-by-tests.md)）。

- `ast-validator.ts` 用 AST 校验自定义卡 TypeScript：只允许批准的导入，禁止被禁 API、网络与 I/O；`effect` 必须是对象字面量；listener phase 与 effect key 必须在契约白名单内。
- `sandbox-listener-actions.ts` 是 prompt、validator、服务端与浏览器 manifest 和文档同步（`pnpm run check:prompt-sync`）共用的唯一行动列表；GitHub 参考资料不能扩大它。
- `flow-admission.ts`、`contract-admission.ts` 与 `listener-result-validator.ts` 在进入引擎前拒绝契约之外的输出：未列出的行动、归属其他卡的节点与 listener、未开放的节点字段、类型错误的已开放字段与参数、未文档化的参数、类型错误的查询结果，以及写入其他卡或其他玩家的动物区。原生卡的 flow 不受检查。
- listener 返回 `costs` 时必须同时返回匹配的 `costAttribution`。沙盒约束记录在 [`docs/CUSTOM_CARD_SANDBOX.md`](../CUSTOM_CARD_SANDBOX.md)；运行时隔离位于 `server/custom-code/`（[server/custom-code/ — 隔离执行](server_zh.md#servercustom-code--隔离执行)）。

测试：`shared/custom-code/__tests__/`、`server/__tests__/workshop-contract-*-session.test.ts`。

## `shared/i18n/` 与 `shared/utils/`

`shared/i18n/` 存放 UI 文案 key 与资源；`PromptKey` 位于 `shared/contract/prompt-keys.ts`。`shared/utils/` 存放不含业务规则的通用 helper；`rng.ts` 负责指定种子的生成器与 HMAC-SHA256 宽种子流。

