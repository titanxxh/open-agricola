/** Action IDs accepted by source validation and both executors (ADR 0025). */
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
