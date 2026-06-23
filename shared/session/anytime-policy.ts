import type { InteractionRequest } from '../contract/types'
import type { PromptKey } from '../contract/prompt-keys'
import type { StageResumeState } from '../engine/engine-stack'

export type AnytimeInteractionKind = InteractionRequest['kind']

export type AnytimeBlockReason =
  | 'no-active-interaction'
  | 'feed-window-locked'
  | 'confirm-window'
  | 'engine-blocked'
  | 'stage-hook-chain'

export type AnytimePolicy =
  | { allowed: false; reason: AnytimeBlockReason }
  | { allowed: true; blockedIds: ReadonlyArray<string> }

export type AnytimePolicyInput = {
  hasActiveContext: boolean
  stageResume: StageResumeState | null
  interactionKind: AnytimeInteractionKind | undefined
  promptKey: PromptKey | undefined
}

const EXCHANGE_PROMPT_PREFIX = 'ui.interactionExchange'
const BAKE_BREAD_PROMPT_PREFIX = 'ui.interactionBakeBread'
const D132_HIDE_FARMER_OPTIONAL_PROMPT = 'ui.cards.D132_HideFarmer.optional'

export function computeAnytimePolicy(input: AnytimePolicyInput): AnytimePolicy {
  if (!input.hasActiveContext) {
    return { allowed: false, reason: 'no-active-interaction' }
  }
  if (input.interactionKind === 'feed' || input.interactionKind === 'heating') {
    return { allowed: false, reason: 'feed-window-locked' }
  }
  if (input.interactionKind === 'engine-blocked') {
    return { allowed: false, reason: 'engine-blocked' }
  }
  if (input.interactionKind === 'confirm-next-player') {
    return { allowed: true, blockedIds: ['exchange'] }
  }
  if (input.interactionKind === 'confirm-player-switch') {
    return { allowed: false, reason: 'confirm-window' }
  }
  if (input.interactionKind === 'animal-reorg') {
    return { allowed: true, blockedIds: ['exchange'] }
  }
  const promptKey = input.promptKey
  if (
    promptKey &&
    (promptKey.startsWith(BAKE_BREAD_PROMPT_PREFIX) ||
      promptKey.startsWith(EXCHANGE_PROMPT_PREFIX))
  ) {
    return { allowed: true, blockedIds: ['exchange'] }
  }
  if (
    input.stageResume?.hook === 'onBeforeEndGame' &&
    input.interactionKind === 'choice' &&
    input.promptKey === D132_HIDE_FARMER_OPTIONAL_PROMPT
  ) {
    return { allowed: true, blockedIds: [] }
  }
  if (input.stageResume !== null) {
    return { allowed: false, reason: 'stage-hook-chain' }
  }
  return { allowed: true, blockedIds: [] }
}
