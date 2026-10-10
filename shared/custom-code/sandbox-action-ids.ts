/**
 * 沙盒卡牌（Workshop / LLM card-gen）可以 dispatch 的 actionId 白名单。
 *
 * 单一真相源：getWorkshopSandboxContract 的 actionId 表、
 * docs/CUSTOM_CARD_SANDBOX.md 的 action-ids 块都对照此常量
 * （由 scripts/check-prompt-sync.ts 在 CI strict 模式校验）。
 * 源码校验和两个执行器的运行时准入（flow-admission.ts）也只接受这份名单（ADR 0025）。
 *
 * 不含 card_ 前缀 ad-hoc actionId —— 那些由 registerAdHocAction 注册，
 * 仅主仓库单卡可用，沙盒卡牌不能 dispatch。
 */
/** 执行原生农场、卡牌或先手行动的 leaf。它们只能作为 flow 的 leaf 返回：
 * 替换用的 actionId 会沿用被替换行动的 actionContext，followUpActions 也没有节点可带上下文。 */
export const SANDBOX_NATIVE_ACTION_IDS = [
  'plow',
  'sow',
  'fence',
  'stables',
  'construct',
  'renovate-house',
  'improvement',
  'occupation',
  'family-growth',
  'breed',
  'reap',
  'exchange',
  'set-first-player',
  'selection',
  'emit-choice',
  'reorganize',
] as const

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
  ...SANDBOX_NATIVE_ACTION_IDS,
] as const

export type SandboxActionId = (typeof SANDBOX_ALLOWED_ACTION_IDS)[number]

export const isSandboxActionId = (value: unknown): value is SandboxActionId =>
  typeof value === 'string' && (SANDBOX_ALLOWED_ACTION_IDS as readonly string[]).includes(value)

export const isSandboxNativeActionId = (value: unknown): boolean =>
  typeof value === 'string' && (SANDBOX_NATIVE_ACTION_IDS as readonly string[]).includes(value)

/**
 * `special-effect` 的 `params.kind` 沙盒白名单（docs/CUSTOM_CARD_SANDBOX.md §6.1）。
 * 原生还有其它 kind（组件供给、农场写入、内部清理等），沙盒卡牌不能使用。
 */
export const SANDBOX_SPECIAL_EFFECT_KINDS = [
  'increment-counter',
  'set-counter',
  'set-flag',
  'set-infobox',
  'set-extra-data',
  'set-private-data',
  'increment-extra-data',
  'pop-card-stack-top',
  'remove-future-meeples',
] as const

export type SandboxSpecialEffectKind = (typeof SANDBOX_SPECIAL_EFFECT_KINDS)[number]

export const isSandboxSpecialEffectKind = (value: unknown): value is SandboxSpecialEffectKind =>
  typeof value === 'string' && (SANDBOX_SPECIAL_EFFECT_KINDS as readonly string[]).includes(value)

/**
 * Prompt 描述元数据（单一真相源）：actionId 的中文说明与 params 形态。
 * `getWorkshopSandboxContract` 运行时 import 此 map 提供 actionId 描述。
 * `Record<SandboxActionId, …>` 保证新增 actionId 必须补描述，否则 tsc 报错。
 */
export const sandboxActionIdMeta: Record<SandboxActionId, { desc: string; params: string }> = {
  gain: { desc: '获得资源', params: '资源对象，如 { food: 2, wood: 1 }' },
  pay: { desc: '支付资源', params: '资源对象，如 { grain: 1 }' },
  'bonus-vp': { desc: '+1 VP（固定，不接受 amount）', params: '{}' },
  'bake-bread': { desc: '烤面包（grain → food）', params: '{}' },
  'store-on-card': { desc: '在本卡 cardStates[cardId].counters 上存资源', params: '资源对象，如 { grain: 6 }' },
  'take-from-card': { desc: '从本卡 counters 取资源给玩家（不足则失败）', params: '资源对象，如 { grain: 1 }' },
  'push-to-card-stack': { desc: '向本卡 cardStates[cardId].stack 推入一个字符串项', params: "{ item: 'someString' }" },
  'special-effect': { desc: 'cardStates mutation 统一入口', params: 'discriminated union，{ kind, ... }（见下方 kind 说明）' },
  'future-meeples': { desc: '预放资源到未来回合', params: '{ __futureMeepleRequest: FutureMeepleRequest }（见下方说明）' },
  plow: { desc: '犁 1 块田（原生邻接规则，玩家选位置）', params: '{}' },
  sow: { desc: '播种（玩家选田和作物，消耗自己的种子）', params: '{}' },
  fence: { desc: '建围栏（玩家选边，按原生规则付木头和围栏组件）', params: '{}' },
  stables: { desc: '建畜栏（玩家选位置，按原生规则付费）', params: '{}' },
  construct: { desc: '按当前房型加建房间并付费', params: '{}' },
  'renovate-house': { desc: '翻修房屋（wood→clay→stone）并付费', params: '{}' },
  improvement: { desc: '购买 1 张改良，保留前提、付费和该卡的 onBuy', params: "{} 或 { types: ['minor'] }（只限次要改良）" },
  occupation: {
    desc: '从手牌打出 1 张职业并执行该卡的 onBuy；不写 exactCost 时按课程格的常规费用',
    params: '{}，或 { exactCost: {} }（免费）/ { exactCost: { food: 1 } }（指定费用）',
  },
  'family-growth': { desc: '家庭成长（需要空房间和未用的家庭成员）', params: '{}' },
  breed: { desc: '立即繁殖一次（每种满足数量的动物 +1），不是收获阶段', params: '{}' },
  reap: { desc: '额外收割一次田地（收获之外的田间阶段）', params: '{}' },
  exchange: { desc: '打开玩家当前可用的兑换菜单（烹饪等）', params: '{}' },
  'set-first-player': { desc: '效果玩家取得起始玩家标记', params: '{}' },
  selection: {
    desc: '让玩家选择农场格，结果写入本卡 extraData.selectedPositions',
    params: '{}；候选与数量写在 actionContext: { selectableTiles: [{row,col}], minSelections, maxSelections }',
  },
  'emit-choice': {
    desc: '发出本卡的选择，玩家选定后调用 effect.resolveChoice(state, player, choice)',
    params: "{ options: [{ value: 'a', labelKey: '显示文字' }], promptKey?: '提示文字' }",
  },
  reorganize: { desc: '让玩家重新安置动物', params: '{}' },
}
