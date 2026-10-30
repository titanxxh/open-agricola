# 其他 shared/ 模块与游戏变体

[English](shared-other.md) | [中文](shared-other_zh.md)

> 本文件是中文翻译镜像；[shared-other.md](shared-other.md) 是唯一权威版本。

## `shared/draft/`

同时选牌的纯函数（`initDraftState`、`processSubmit`、`tryAdvanceRound`、`finalizeDraft`）；`createRoom` 用 `draftMode: 'simultaneous'` 与 `draftPoolSize: 7..10` 启用。启用 Farmers of the Moor 时，职业、FoM 小改良与已出版小改良分阶段选秀，FoM 小改良池从已实现的注册表派生，不足时拒绝开局，除非设置 `allowIncompleteFarmersOfTheMoorMinorDeal`；Community Deck 小改良只进入已出版部分。

## 单人开局手牌

`shared/session/solo-hand-selection.ts` 负责单人卡池配额与完整提交校验。Bootstrap 先过滤、去重，再检查数量。随机手牌为七职业和七小件，泥沼则为七职业、三普通小件和四 Moor 小件。`soloHandMode: 'choose-7'` 固定十职业和十普通小件候选，泥沼则固定十职业、四普通小件和六 Moor 小件，分别保留七／七或七／三／四。卡池不足就拒绝创建，多人的不完整 Moor 发牌选项不豁免此检查。

独立的 `solo-hand-selection` 阶段与请求同时提供全部候选组。`GameSession.submitSoloHandSelection` 校验本人及全部组后才发正式手牌。一次 `soloHandSubmit` 命令使用 `solo-hand` 输入窗口及现有持久回执，不暂存未确认勾选。权威候选与确认后的 `kept` 历史完整恢复，其他观看者的投影隐藏这些信息；不生成逐次轮抽历史，全部候选退出普通抽牌堆。父母候选在创建时私下固定，手牌完成后才提供；随机父母也在确认后结算。之后沿现有设置续行进入首轮 hook。

测试：`server/__tests__/standard-solo-hands-session.test.ts`、`server/connection/__tests__/solo-hand-handler.test.ts`、`shared/session/__tests__/solo-hand-selection.test.ts`；多人轮抽仍由 `server/game/__tests__/draft-session.test.ts` 覆盖。

## 游戏变体

Game Variant 改变一局游戏的设置、公开状态、行动格、阶段流程或计分；它不是卡牌来源，也不增加前端规则。

Moor Balance Rules 是默认关闭的开局选项，由 `contract/game-variants.ts` 规范化，开局后固定。指定卡牌通过 `cards/helpers/moor-balance.ts` 仅在可选计数中排除 Moor 大设施，不改变一般 major、cookery 或供应身份。农场历史资格由来源卡根据真实出牌或农场操作事实记录，后续扩展不清除资格，查询不写入。测试：`server/__tests__/moor-balance-rules-session.test.ts` 与 `e2e-tests/moor-balance-rules.spec.ts`。

- **Parent Cards**（[ADR 0005](../adr/0005-parent-cards-dedicated-expansion-runtime.md)）是 `shared/parents/*` 中的结构化数据，素材由 `public-assets.ref` 固定，与 Card Source 投影分离；选择、奖励与支线任务由后端权威裁定，并使用非公开种子。
- **Through the Seasons** 把四个季节格保留在版图上，只启用当前季节；其 modifier 注册在每个 Core 的 `ActionHookRegistry`，从不写玩家 `cardStates`。新回合编号一提交季节就推进，早于准备阶段；准备阶段先做普通回合增长，再做该季节的累积调整（先 `applyRoundGrowth()`，后 `applySeasonPreparationAdjustments()`），调整结果不低于零。季节收益与建筑 hook 通过 `actionContext` 把来源带到原有结果事实（[ADR 0034](../adr/0034-seasonal-adjustments-belong-to-settlement-events.md)）；`server/__tests__/seasonal-grants-session.test.ts` 覆盖 pending、恢复和撤销边界。准备阶段在结算时记录常规增长与季节实际差值；受影响但净增长为零的结果仍保留公开事实，不额外制造资源移动。
- **Farmers of the Moor**（[ADR 0007](../adr/0007-farmers-of-the-moor-variant-runtime.md)）通过 [domain](domain_zh.md) 的通用 seam 增加地形、扩展、马、供暖与自己的大改良供应。多人局不使用同时选秀时，`createInitialPlayers()`（`shared/session/state-bootstrap.ts`）给每位玩家发 4 张 FoM 小改良加 3 张已出版小改良；额外、自定义与 Community Deck 小改良只进入已出版部分；只有设置 `allowIncompleteFarmersOfTheMoorMinorDeal` 时，FoM 小改良池不足才会让每位玩家的 FoM 部分等量减少。单人开局采用上面的足额配比。
- 真实 Moor 特殊行动共用 `shared/moor/special-action-flow.ts` 的 `buildMoorSpecialActionFlow`：正常与借用取牌行动、卡牌赠送和定时 offer 均先校验选定行动与目标，再进入 before。before 来源按 owner 分组，使用原生 activation 与 trigger-select；主体提交前重新校验。基础提交后，原生完成帧在必须后续开始前冻结 after 来源与原始收据。共享引擎完成边界等待支付、onBuy 与动物整理，再按 owner 合入终点规则反应。仅取牌不进入该生命周期，也不产生放工或行动格使用。见 [ADR 0032](../adr/0032-unified-moor-special-action-lifecycle.md) 与 `server/__tests__/{moor-granted-lifecycle,moor-completion-window}-session.test.ts`。
- **Snake Opening** 只反转第 1 轮的工作轮转（[轮转、额外回合与供应人物](session_zh.md#轮转额外回合与供应人物)）。
- 实际参与者为一人时，`shared/moor/solo-supply.ts` 把十张牌保存在一份有序供给中，位置为暗堆、当前牌或已知弃牌。准备阶段翻牌或提供一次保留／替换；耗尽后只在准备阶段取回最后弃牌。真实用牌在必须后续期间锁定当前牌，随后结算弃牌或当轮一次的两食物留牌，再进入共享 after 窗口。留牌记录在全部回合结束效果之后清理。视角投影仅公开当前牌、弃牌与堆顶牌背行动图标，不公开暗牌身份或顺序；新牌面披露同时设置受保护观察与撤销边界。所有 Moor 对局固定首轮大改良，单人包含 Infirmary。测试：`server/__tests__/standard-solo-moor-session.test.ts`。

- 牌面行动候选以权威牌资格和具体行动、目标校验为准。展示区分单人当前牌、市场牌和借用的正面牌，不改变归属。受信任的卡牌后续保留自身时机及人员条件，普通公开特殊行动入口仍检查工作阶段及健康人员。

## `shared/custom-code/`

工坊卡只通过已部署的 Workshop Capability Contract 准入（[ADR 0025](../adr/0025-workshop-capability-contract-is-fail-closed-and-opened-by-tests.md)）。

- `ast-validator.ts` 用 AST 校验自定义卡 TypeScript：只允许批准的导入，禁止被禁 API、网络与 I/O；`effect` 必须是对象字面量；listener phase 与 effect key 必须在契约白名单内。
- `validate-and-compile.ts` 统一源码准入、编译和 manifest 提取脚本，服务端与浏览器只提供各自执行边界。`registrar.ts` 通过传入的执行器注册同一组 hook、metadata 和 listener；适配器不扩大能力契约。
- `sandbox-listener-actions.ts` 是部署名称契约、validator、服务端与浏览器 manifest 共用的唯一行动列表；GitHub 参考资料不能扩大它。
- `flow-admission.ts`、`contract-admission.ts` 与 `listener-result-validator.ts` 在进入引擎前拒绝契约之外的输出：未列出的行动、归属其他卡的节点与 listener、未开放的节点字段、类型错误的已开放字段与参数、未文档化的参数、类型错误的查询结果，以及写入其他卡或其他玩家的动物区。原生卡的 flow 不受检查。
- listener 返回 `costs` 时必须同时返回匹配的 `costAttribution`。沙盒约束记录在 [`docs/CUSTOM_CARD_SANDBOX.md`](../CUSTOM_CARD_SANDBOX.md)；运行时隔离位于 `server/custom-code/`（[server/custom-code/ — 隔离执行](server_zh.md#servercustom-code--隔离执行)）。

测试：`shared/custom-code/__tests__/`、`server/__tests__/workshop-contract-*-session.test.ts`。

## `shared/i18n/` 与 `shared/utils/`

`shared/i18n/` 负责同步翻译/catalog API 与语言包校验；`PromptKey` 位于 `shared/contract/prompt-keys.ts`。译文与 BGA 导入工具由独立的 [open-agricola-i18n](https://github.com/titanxxh/open-agricola-i18n) 仓库维护，每种语言只有一个源 JSON 和一个完整运行时 JSON。`i18n.ref` 固定提交与清单哈希；`scripts/prepare-language-packs.ts` 校验语言包/源文件后写入被 Git 忽略的构建缓存。`AGRICOLA_I18N_DIR` 可提供内容与引用一致的本地语言仓库。

`client/services/language-pack.ts` 从清单发现语言，只下载当前语言的完整包，校验身份和哈希后才注册；切换成功后才提交 locale。官方卡面、父母牌、UI、提示和日志共用 catalog。工坊/房间/回放的自定义卡按传入卡牌归一化，不修改全局词典。英文补齐与旧 key 归一化发生在语言仓库构建时。工坊 PR 生成会从待提交的 Card Source 移除译文，在投稿描述中另附初始语言补丁；草稿更新后需重新导出补丁，并在合入前固定匹配的语言包版本。测试：`scripts/__tests__/language-pack-boundary.test.ts`、`client/services/__tests__/language-pack.test.ts`、`e2e-tests/card-localization.spec.ts`。

`shared/utils/` 存放不含业务规则的通用 helper；`rng.ts` 负责指定种子的生成器与 HMAC-SHA256 宽种子流。

