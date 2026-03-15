import type { ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption, PlayerState } from '../../game/types'

export type PendingChoiceData = {
  options: ActionChoiceOption[]
  promptKey: string
  targetCardId: string
  choiceResult?: string
  choiceTimestamp?: number
} & Record<string, unknown>

const ensurePendingChoiceState = (player: PlayerState): PendingChoiceData => {
  if (!player.cardStates) player.cardStates = {}
  if (!player.cardStates.__pendingChoice__) player.cardStates.__pendingChoice__ = { counters: {} }
  if (!player.cardStates.__pendingChoice__.extraData) {
    player.cardStates.__pendingChoice__.extraData = {}
  }
  return player.cardStates.__pendingChoice__.extraData as PendingChoiceData
}

export const storePendingChoice = (
  player: PlayerState,
  data: Omit<PendingChoiceData, 'choiceResult' | 'choiceTimestamp'>,
) => {
  player.cardStates ??= {}
  if (!player.cardStates.__pendingChoice__) player.cardStates.__pendingChoice__ = { counters: {} }
  player.cardStates.__pendingChoice__.extraData = { ...data }
}

export const createPendingChoiceFlow = (
  player: PlayerState,
  data: Omit<PendingChoiceData, 'choiceResult' | 'choiceTimestamp'>,
  result: Omit<ActionHookResult, 'flow'> = {},
): ActionHookResult => {
  storePendingChoice(player, data)
  return {
    ...result,
    flow: { type: 'leaf', actionId: 'card-choice' },
  }
}

export const readPendingChoice = (
  player: PlayerState,
  cardId: string,
): PendingChoiceData | undefined => {
  const pending = player.cardStates?.__pendingChoice__?.extraData as PendingChoiceData | undefined
  if (pending?.targetCardId !== cardId) return undefined
  return pending
}

export const consumePendingChoice = (
  player: PlayerState,
  cardId: string,
): PendingChoiceData | undefined => {
  const pending = readPendingChoice(player, cardId)
  if (!pending) return undefined
  if (player.cardStates?.__pendingChoice__?.extraData) {
    delete player.cardStates.__pendingChoice__.extraData
  }
  return pending
}

export const updatePendingChoice = (
  player: PlayerState,
  cardId: string,
  patch: Partial<PendingChoiceData>,
) => {
  const pending = readPendingChoice(player, cardId)
  if (!pending) return
  const target = ensurePendingChoiceState(player)
  Object.assign(target, patch)
}
