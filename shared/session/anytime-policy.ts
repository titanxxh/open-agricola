import type { InteractionRequest, AnytimeWindow } from '../contract/types'
import type { StageResumeState } from '../engine/engine-stack'

export type AnytimeInteractionKind = InteractionRequest['kind']

export type AnytimeBlockReason =
  | 'no-active-interaction'
  | 'feed-window-locked'
  | 'confirm-window'
  | 'engine-blocked'
  | 'stage-hook-chain'
  | 'closed-window'

export type AnytimePolicy =
  | { allowed: false; reason: AnytimeBlockReason }
  | { allowed: true; blockedIds: ReadonlyArray<string> }

export type AnytimePolicyInput = {
  hasActiveContext: boolean
  stageResume: StageResumeState | null
  interactionKind: AnytimeInteractionKind | undefined
  anytimeWindow?: AnytimeWindow
}

export function computeAnytimePolicy(input: AnytimePolicyInput): AnytimePolicy {
  if (!input.hasActiveContext) {
    return { allowed: false, reason: 'no-active-interaction' }
  }
  if (input.interactionKind === 'heating') {
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
    return { allowed: true, blockedIds: [] }
  }
  if (input.anytimeWindow) {
    const window = input.anytimeWindow
    if (window.allowed !== true) return { allowed: false, reason: 'closed-window' }
    if (window.blockedIds !== undefined && (!Array.isArray(window.blockedIds) || window.blockedIds.some((id) => typeof id !== 'string'))) {
      return { allowed: false, reason: 'closed-window' }
    }
    return { allowed: true, blockedIds: [...(window.blockedIds ?? [])] }
  }
  if (input.stageResume !== null) {
    return { allowed: false, reason: 'stage-hook-chain' }
  }
  return { allowed: true, blockedIds: [] }
}
