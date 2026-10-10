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
] as const

export type SandboxActionId = (typeof SANDBOX_ALLOWED_ACTION_IDS)[number]

export const isSandboxActionId = (value: unknown): value is SandboxActionId =>
  typeof value === 'string' && (SANDBOX_ALLOWED_ACTION_IDS as readonly string[]).includes(value)

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
}
