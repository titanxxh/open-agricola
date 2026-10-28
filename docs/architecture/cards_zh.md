# shared/cards/ — Card Source 闭环

[English](cards.md) | [中文](cards_zh.md)

> 本文件是中文翻译镜像；[cards.md](cards.md) 是唯一权威版本。

本 module 负责每张卡的唯一源文件，以及卡牌接入的通用 seam：hook 与 listener（[hooks](hooks_zh.md)）、局部状态、Card Field 和能力 metadata。卡牌能力留在它自己的文件里闭环。

## Card Source 与投影

卡牌作者只维护一个 Card Source（[ADR 0002](../adr/0002-card-source-manifest-projection.md)）：

```ts
export const CardName = defineOccupationCard({   // the constant shares the file name
  meta: { id, name, deck, number, category, desc, cost, players },
  impl: { modifiers, listeners, effect, prerequisiteCheck, reaches },
})
```

| 概念 | 形态 | 读者 |
|---|---|---|
| Card Source | `shared/cards/{A..E,M,major,community}/{Card}.ts`，包含 `meta` 与可选 `impl` | 服务端、沙盒和测试；主 client bundle 禁止引用 |
| Card Display | 由 Card Source `meta` 生成的 `public/cards-manifest.json` | 主 client bundle 通过 `client/services/card-meta` 读取 |
| Card Impl | Card Source `impl`，汇集到生成的 `ALL_CARD_IMPLS`（`shared/cards/register-all.ts`，包括大改良）与 `CardRegistry` | 服务端和沙盒；主 client bundle 禁止引用 |

- `meta` 即 Card Definition：可序列化、前端可见、无运行时行为的字段。允许声明式规则字段（`cost`、`prerequisite`、`*Prerequisites`、`cardField`、`isCookery`、能力 metadata）；不允许 `modifier(s)`、`listeners`、`effect` 与 `prerequisiteCheck`。`desc` 与 `prerequisite` 是印刷文字；可本地化的 `rules` 是补充裁定，不影响运行时。静态条件用 `*Prerequisites`，动态条件用 `impl.prerequisiteCheck`。
- `impl` 包含 `modifiers`、`listeners`、`effect`、`prerequisiteCheck`、helper 调用与 `reaches`。构建器可以把 `reaches` 投影到 manifest 顶层，但不能放进 `meta`。
- `scripts/build-cards-manifest.ts` 用 TypeScript AST 静态提取 `meta`，运行时从不导入 Card Source；`meta` 只含 JSON 类字面量和同文件的简单常量。
- `definePlayerActionCard` 声明 `playerActionCardType`；发牌池与 UI 据此区分，不靠卡号或 i18n 猜测。
- 生产卡牌描述中的资源、动物、地形和分数通过 `ResourceText` token 渲染为图标；`__…__` 只标记精确的卡名、行动名和行动格名。`scripts/__tests__/card-description-icons.test.ts` 与 `card-description-double-underscore.test.ts` 负责门禁。
- 卡面、触发标签、日志预览和 Replay 共用 `client/components/common/cardText.ts`：官方名字和文字字段读取已加载的语言包；自定义预览/房间/回放 metadata 由共享 catalog 按字段归一化，跳过空译文，卡牌自有的提示用 `{card:<id>}` 引用卡名。玩家名按 `client/utils/player-name.ts` 中的生成名来源处理（[client](client_zh.md)）。

测试：`shared/cards/__tests__/card-source-representatives.test.ts`、`scripts/check-generated-cards-sync.ts`。

## 生成目录与注册表

| 文件 | 职责 |
|---|---|
| `shared/cards/catalog.generated.ts` | 从 Card Source 生成：`catalogCardDefinitions`、卡牌列表（`minorImprovementCardsList`、`occupationCardsList`、`implemented*CardsList`）与 ID 列表 |
| `shared/cards/register-all.ts` | 生成的 `ALL_CARD_IMPLS`，即解析后的 Card Impl 映射（`scripts/generate-register-all.ts`） |
| `shared/cards/catalog.ts` | 目录 facade，例如不含社区卡的 `minorImprovementCards` / `occupationCards` |
| `shared/cards/active-registry.ts` | 临时同步的 `CardRegistry` 作用域；没有持久默认值 |
| `shared/cards/registry.ts` | 带 `loadByIds` 与 `unload` 的 `CardRegistry`，用于按房间加载 |
| `shared/cards/custom-registry.ts` | `CUSTOM_*` 卡在服务端与沙盒的运行时实现、会话上下文、效果、listener 与 modifier |
| `shared/cards/custom-card-metadata.ts` | 前端的 `CUSTOM_*` Card Display、美术 URL 与 O 编号 |

- 生产路径只通过生成目录与 `CardRegistry` 访问卡牌；测试可以导入单个 Card Source。Card Definition 是带 `kind: 'minor' | 'occupation' | 'playerAction' | 'major'` 的纯数据。
- 生成目录必须保持同步（`pnpm run check:generated-cards-sync`）；工坊 PR 生成基于已拉取的上游生成文件打补丁，从不读部署机本地的卡牌树。
- 带实现的大改良源码经两条生成路径进入后端：`scripts/generate-register-all.ts` 把它加入 `ALL_CARD_IMPLS`；`major/runtime.generated.ts` 提供 `majorCardSources`，`shared/cards/major/index.ts` 把其中的 `impl.effect` 合并进大改良 Card Definition。
- 服务端与沙盒只注册自定义卡的运行时部分；主客户端只注册展示 metadata，从不导入自定义运行时注册表。

## `cardStates` 中的局部状态

- 持续计数、一次性标记和局部状态放在 `player.cardStates[cardId]`，不放 `PlayerState` 顶层。卡牌打出前就需要的历史使用显式的手牌区 listener（[Hook 系统](hooks_zh.md#hook-系统)），不用全局统计。
- 共享例外是多张卡和农场几何都依赖的事实：`player.farmyardSpaceStates`（封锁格、农场格与田地货物标记、非田作物格；放置锁与已用 / 未用状态分开）与 `player.farmyardExtensions`。
- 后续玩家选择是显式续行：卡牌返回的 flow 中由 leaf 发出请求，并在 `pending` envelope 中等待，从不使用隐藏的共享槽。
- 卡上工人使用 `shared/cards/helpers/card-held-workers.ts`；归家时释放。`family-growth` 可通过 `actionContext.holdNewbornOnCard` 把新生儿直接放到卡上。
- 只读的 UI 标记（`extraData.farmTerrainMarkers`）与跨玩家公开标记（`extraData.publicCardMarkers`，在 `cardBonusVp` 中以独立 `marker` 计分条目展示）由通用逻辑渲染。持有者未打出来源卡时，标记计分身份仍与卡牌奖励分离。
- 公开卡牌标记可提供翻译键 `labelKey`，并保留 `label` 作为字面回退文本。投影保留翻译键，客户端按当前语言解析，不改变已保存的标记归属或计分。
- **可见性**（[ADR 0023](../adr/0023-explicit-card-state-visibility-and-presentation.md)）：卡牌状态默认是内部的。原生 `presentation` 声明与 `getStatePresentation(player)` 把事实开放给公开 adapter；序列化记录规范化的 `cardStatePresentation`，rehydrate 时剥离。玩家私有的 `privateData` 属于存储它的玩家，而不是当前持有者。视角快照、事件、历史与座位视角 Replay 只暴露公开事实和观看者自己的私有数据，对卡牌所有者也是如此；权威状态、恢复、撤销、debug 完整状态与全开 Replay 保留原始状态。`card.stateChanged` 事件只带 key 不带值，投影也会去掉历史事件中的值，但不改写 Frame。
- `getRuleContributions(player)` 暴露只读的组件预留与空格减免；消费者合并不重复的来源、取整有限值、拒绝负数与非数字并封顶扣减。通用马厩发现与归还按 `sourceCardId` 分发，只有来源卡改变自身的建造状态。查询的输入与结果都与存储分离，原生卡与工坊卡相同。

测试：`server/__tests__/card-state-visibility-session.test.ts`。

## `shared/cards/helpers/` 中的 helper

- `pay-gain-node.ts`：先付后得、付后追加行动、退回后获得的模板。
- `reserved-resources.ts`：`evaluateWithReservedResources()` 在扣除资源预留后判断行动；`evaluateWithGrantedResources()` 在加入先行奖励后判断行动。两者向 evaluator 传入玩家副本和对应状态视图，不改变已存储资源。
- `stage-effects.ts`：阶段效果标记，以及经现有兑换执行器的每卡一次可选收获兑换。
- `card-state.ts`、`round-placement.ts`：一次性状态、原始 Work Placement Chronology 与人员放置序号（[Turn Scope 与行动执行作用域](session_zh.md#turn-scope-与行动执行作用域)）。
- `turn-token.ts`：活动 Turn Scope 身份与卡牌的“本 Turn 已用”记录。`isUsedThisTurnOrGap` / `markUsedThisTurnOrGapLeaf` 另把玩家两次自己 Turn 之间的间隔（其他玩家的 Turn、收获、回合结束与开始）视为单独一份记录；只有普通放人准入显式传入 `turnScopeProjection` 时，才把下一 Turn 视为未使用；真实 anytime、pending 与替代查询仍读取当前间隙。`action-snapshot.ts`：Turn 起点快照（[Turn Scope 与行动执行作用域](session_zh.md#turn-scope-与行动执行作用域)）。
- `card-held-workers.ts`、`card-field.ts`：卡上工人（[cardStates 中的局部状态](#cardstates-中的局部状态)）与 Card Field（[Card Field 与 Logical Field seam](#card-field-与-logical-field-seam)）。

## Card Field 与 Logical Field seam

见 [ADR 0017](../adr/0017-logical-field-ownership-boundary.md)。

```ts
cardField?: {
  allowedCrops: readonly ('grain' | 'vegetable' | 'wood' | 'stone')[]
  capacity: number
}
```

- `makeCardFieldImpl(cardId, def, options?)` 注册 Card Field owner 并派生播种接入；卡牌只添加配置与可选的 `onReap` / `onCropRemoved` 回调。虚拟列由 `deriveVirtualTileCol(cardId, slotIdx)` 得出。
- 面向卡牌的 interface 有三个入口：`getLogicalFields(player)`（Farmyard Field 加上每张已打出 Card Field 的不可变投影，含空的固定槽）、`getFarmyardFields(player)`（几何、围栏、相邻与占用），以及带具名 `place`、`insertBottom`、`grow`、`remove` 与原子 `replace` 的 `mutateLogicalFields(state, player, options?)`，它先校验目标，再通过所属 adapter 写入。
- 存储接受所有合法田地货物。`allowedCrops` 是普通播种能力，不是存储 schema：`place` 默认执行该白名单，卡牌效果可显式绕过；播种与 `replace` 始终执行；`insertBottom` 在顶层之下加入规则授予的作物，不新增槽，也不受播种白名单限制。
- `fieldOperationFlow` 的 `move` 接受 `sourceCrops`；目标续行在保存位置或修改田地之前重新检查来源作物与数量、目标占用与 `allowedCrops`。
- Card Field 槽保存顶层 `{ crop, remaining }` 与可选的 `below` 层。普通收割每个有作物的槽取一个；额外与整田收获继续深入下层。
- Card Field 只有一个稳定的 Logical Field id 和一个 `groupKey`；槽保持稳定坐标。基础田地计分只计 Farmyard Field。
- `onReap` 只在收割时执行；`onCropRemoved` 在每次真实移除时执行。两者都在共享修改之后、按作物各执行一次，返回的 flow 并入普通 parallel 反应。selection 会先解决移除回调返回的 flow，再进入它的下一个父级续行。
- `reap` 是两种存储 owner 共用的唯一收割实现（[阶段 hook](hooks_zh.md#阶段-hook)）。多槽 Card Field 收割每个有作物的槽，但每个 Logical Field 与作物只计一次。
- `card-field.ts` 内部的底层 adapter 是唯一触碰 `PlayerState.fields` 的 Card Impl 代码；`check:card-impl-boundaries` 在其他生产卡牌与 helper 源码中拒绝任何名为 `fields` 的属性或下标访问，无论接收者是谁，没有白名单。

测试：`shared/cards/__tests__/{AB,CD,EM}-logical-field-boundary.test.ts`、`shared/actions/effects/__tests__/{reap,sow-permissions}.test.ts`。

## 命名、能力与边界

- 卡牌文件使用 `{Deck}_{Number}_{Name}.ts`，导出同名常量；`major/fireplace.ts` 这类大改良家族文件导出其中的每张实体卡。
- 卡牌能力留在自己的文件里。`shared/actions/effects/pay.ts`、`shared/actions/effects/improvement.ts`、`shared/session/session-core.ts` 与 `server/game/authoritative-session.ts` 等核心文件从不为单卡修改；没有集中的卡牌效果注册表，也没有前端卡牌规则。
- 只有同一个 helper 或通用机制能服务至少两张当前或近期目标卡时才抽取；在此之前逻辑留在卡牌文件内。
- 跨卡身份与能力查询使用类型化 metadata 和已打出卡 helper：`getPlayedCardDefinitions(player)`、`collectCardDefinitionsAs(player, type)` 与 `playerHasCardCapability(player, capability, { asType? })`，只读取已打出区域；`asType` 复用 `cardCountsAs` 处理双类型身份。已注册的能力 metadata（`shared/cards/helpers/card-type.ts` 中的 `CardCapability` union，例如 `fireplaceIdentity`、`joineryIdentity`、`blocksRenovation` 与 `animalHolder`）位于 `meta`，不增加前端行为。`ovenIdentity` 是 OA 的烤炉家族身份，不代表一定有烤面包兑换；升级卡可保留计分身份，并用 `firewoodBuildTrigger: false` 退出建造触发。
- `check:card-impl-boundaries` 属于 `pnpm run check:architecture`，拒绝生产 Card Source 在运行时读取其他非大改良卡的 ID。显式例外是 `Major_*`、`reaches`、`allowedPurchases` 与前置候选列表。
- 印刷文字点名其他卡牌时，卡牌可在 `reaches` 中声明 named printed target，只读取其公开事实（存在、owner、是否打出），从不读其私有状态；检查器例外只绑定一对精确的来源与目标。
- metadata 审计必须为新增的 metadata 字段补 fixture。

## 小改良传牌

`CardDefinition.passing?: boolean` 标记购买后传给下家的小改良。改良宿主通过内部 `pay` child 完成支付，再在 `completeInternalChildren` 中提交购买：卡进入下一玩家的 `minorHand`（不进 `minorPlayed`），不计入 `totalMinorBuilt`，不安装 modifier，发出 `card.passed` 而不是 `card.played`，`onBuy` 仍经 `afterHostCommitListeners` 中的 `activate-card-effect` 执行。“卡牌进场”反应自然跳过它。客户端为 `card.passed` 播放动画，mapper 派生 `log.cardPassed`。

`actions/helpers/minor-card-passing.ts` 负责购买及显式 `pass-minor-card-to-left` 行动的传递终点和公开事件。只有一名真实参与者时，卡移出游戏并发出 reason 为 `passed` 的 `card.destroyed`，不回到本人手牌或普通抽牌供给。支付和完整的 `onBuy` continuation 仍各执行一次；已有对局恢复时保留耗尽的空手牌。多人传递使用真实下家并保留普通交牌事件。Session 回归位于 Clay Embankment、Shifting Cultivation 与 Savings Deposit 的测试文件。

