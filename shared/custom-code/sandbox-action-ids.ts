/**
 * 沙盒卡牌（Workshop / LLM card-gen）可以 dispatch 的 actionId 白名单。
 *
 * 单一真相源：getWorkshopSandboxContract 的 actionId 表、
 * docs/CUSTOM_CARD_SANDBOX.md 的 action-ids 块都对照此常量
 * （由 scripts/check-prompt-sync.ts 在 CI strict 模式校验）。
 *
 * 不含 card_ 前缀 ad-hoc actionId —— 那些由 registerAdHocAction 注册，
 * 仅主仓库单卡可用，沙盒卡牌不能 dispatch。
 */
import { REAL_RESOURCE_KEYS } from '../contract/resource-keys.ts'

export const SANDBOX_ALLOWED_ACTION_IDS = [
  'gain',
  'pay',
  'bonus-vp',
  'bake-bread',
  'store-on-card',
  'take-from-card',
  'push-to-card-stack',
  'special-effect',
  'future-meeples',
  'plow', 'sow', 'fence', 'stables', 'construct', 'renovate-house',
  'improvement', 'occupation', 'family-growth', 'breed', 'reap',
  'exchange', 'set-first-player', 'selection', 'emit-choice', 'reorganize',
] as const

export type SandboxActionId = (typeof SANDBOX_ALLOWED_ACTION_IDS)[number]

/**
 * Prompt 描述元数据（单一真相源）：actionId 的中文说明与 params 形态。
 * `getWorkshopSandboxContract` 运行时 import 此 map 提供 actionId 描述。
 * `Record<SandboxActionId, …>` 保证新增 actionId 必须补描述，否则 tsc 报错。
 */
export const sandboxActionIdMeta: Record<SandboxActionId, {
  desc: string; params: string; paramKeys: readonly string[]; contextKeys: readonly string[]
}> = {
  gain: { desc: '获得资源', params: '资源对象，可用 recipientPlayerId/recipientMode/payerId 指定已有玩家', paramKeys: [...REAL_RESOURCE_KEYS, 'recipientPlayerId', 'recipientMode', 'payerId'], contextKeys: [] },
  pay: { desc: '支付资源', params: '资源对象或 {cost: ComplexCost}；宿主执行付款、预留和选择，不含 cards/归因/playedCards 内部覆盖', paramKeys: [...REAL_RESOURCE_KEYS, 'cost', 'costType', 'optionPrefix', 'paymentChoice', 'sourceActionId', 'includeReturnedCard', 'reserveResources', 'trackSourceCardPaymentStats'], contextKeys: [] },
  'bonus-vp': { desc: '+1 VP（固定，不接受 amount）', params: '{}', paramKeys: [], contextKeys: [] },
  'bake-bread': { desc: '烤面包（grain → food）', params: '{}', paramKeys: [], contextKeys: [] },
  'store-on-card': { desc: '在本卡 cardStates[cardId].counters 上存资源', params: '资源对象，如 { grain: 6 }', paramKeys: [...REAL_RESOURCE_KEYS], contextKeys: [] },
  'take-from-card': { desc: '从本卡 counters 取资源给玩家（不足则失败）', params: '资源对象，如 { grain: 1 }', paramKeys: [...REAL_RESOURCE_KEYS], contextKeys: [] },
  'push-to-card-stack': { desc: '向本卡 cardStates[cardId].stack 推入一个字符串项', params: "{ item: 'someString' }", paramKeys: ['item'], contextKeys: [] },
  'special-effect': { desc: 'cardStates mutation 统一入口', params: 'discriminated union，{ kind, ... }；仅 contract.specialEffectKinds', paramKeys: ['kind', 'key', 'amount', 'value', 'flag', 'text', 'rounds'], contextKeys: [] },
  'future-meeples': { desc: '预放资源到未来回合', params: '{ __futureMeepleRequest: {cardId,playerId,entries | startRound/count/resources} }；资源和 field/stable，不开放 actionContext', paramKeys: ['__futureMeepleRequest'], contextKeys: [] },
  plow: { desc: '普通犁田，使用合法邻接和农场选择', params: '叶子顶层 actionContext（不在 params）.allowedTiles?, exactCost?', paramKeys: [], contextKeys: ['allowedTiles', 'exactCost'] },
  sow: { desc: '普通 grain/vegetable 播种，宿主扣种子并写作物堆', params: 'crops?；叶子顶层 actionContext.cropType/minSelections/maxSelections/excludedFields?（不在 params）', paramKeys: ['crops'], contextKeys: ['cropType', 'minSelections', 'maxSelections', 'excludedFields'] },
  fence: { desc: '普通自有围栏与牧场，支付并消耗组件', params: '叶子顶层 actionContext（不在 params）.fencePolicy?（普通数量限制）', paramKeys: [], contextKeys: ['fencePolicy'] },
  stables: { desc: '普通畜栏，检查占地、供给和付款；不含 farmHand', params: '叶子顶层 actionContext（不在 params）.max/exactCost/costOverride?', paramKeys: [], contextKeys: ['max', 'exactCost', 'costOverride'] },
  construct: { desc: '按当前房型建造普通房间并付款', params: '叶子顶层 actionContext（不在 params）.exactCost/costOverride?', paramKeys: [], contextKeys: ['exactCost', 'costOverride'] },
  'renovate-house': { desc: '正常 wood→clay→stone 翻修', params: '叶子顶层 actionContext（不在 params）.exactCost?', paramKeys: [], contextKeys: ['exactCost'] },
  improvement: { desc: '从合法候选购买改良，保留前提、付款及 onBuy', params: 'params.types/allowedPurchases?；actionContext.minimumResourcesPaid?（叶子顶层，不在 params）', paramKeys: ['types', 'allowedPurchases'], contextKeys: ['types', 'minimumResourcesPaid'] },
  occupation: { desc: '从当前手牌打出职业，明确费用并执行 onBuy', params: 'params.allowedCards/exactCost?；费用在 params，不在 actionContext', paramKeys: ['allowedCards', 'exactCost'], contextKeys: [] },
  'family-growth': { desc: '正常家庭成长，保留供给和 newborn 语义', params: 'actionContext.skipRoomCheck?（仅牌面明确无房成长时）', paramKeys: [], contextKeys: ['skipRoomCheck'] },
  breed: { desc: '本卡私有繁殖与正常动物安置，不冒充 Harvest', params: 'actionContext.animalTypes?；sourceCard 绑定本卡', paramKeys: [], contextKeys: ['animalTypes', 'sourceCard'] },
  reap: { desc: '额外田间收割，不是正式 Harvest', params: 'actionContext.trigger.phase 必须 private-field-phase', paramKeys: [], contextKeys: ['trigger'] },
  exchange: { desc: '普通兑换，使用已有支付与兑换目录', params: 'actionContext.tradeIds/maxTradeTimesBySourceId/directTrade?；不含内部副作用', paramKeys: [], contextKeys: ['tradeIds', 'maxTradeTimesBySourceId', 'directTrade'] },
  'set-first-player': { desc: '效果玩家取得起始玩家标记', params: '{}', paramKeys: [], contextKeys: [] },
  selection: { desc: '选择明确的农场坐标，将结果存入本卡 extraData.selectedPositions', params: 'actionContext.{selectionKind: farm-position, selectableTiles, minSelections, maxSelections}', paramKeys: [], contextKeys: ['selectionKind', 'selectableTiles', 'minSelections', 'maxSelections'] },
  'emit-choice': { desc: '发出本卡选择，由 resolveChoice 返回后续 flow', params: '{options, promptKey?, promptParams?, requiresExplicitChoice?, multiSelect?}', paramKeys: ['options', 'promptKey', 'promptParams', 'requiresExplicitChoice', 'multiSelect'], contextKeys: [] },
  reorganize: { desc: '普通动物重组，不修改 Harvest/回合生命周期', params: 'actionContext.{trigger?: anytime, prefill?: boolean}', paramKeys: [], contextKeys: ['trigger', 'prefill'] },
}

export const sandboxSpecialEffectKinds = [
  'increment-counter', 'set-counter', 'set-flag', 'increment-extra-data',
  'set-extra-data', 'pop-card-stack-top', 'set-infobox', 'remove-future-meeples',
] as const
