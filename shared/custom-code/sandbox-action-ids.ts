/**
 * 沙盒卡牌（Workshop / LLM card-gen）可以 dispatch 的 actionId 白名单。
 *
 * 单一真相源：CARD_DESIGNER_SYSTEM_PROMPT 的 actionId 表、
 * docs/CUSTOM_CARD_SANDBOX.md 的 action-ids 块都对照此常量
 * （由 scripts/check-prompt-sync.ts 在 CI strict 模式校验）。
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
