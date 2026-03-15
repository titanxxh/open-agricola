import type { CardState, PlayerState } from '../../game/types'

export const ensureCardState = (
  player: PlayerState,
  cardId: string,
): CardState => {
  if (!player.cardStates) {
    player.cardStates = {}
  }
  if (!player.cardStates[cardId]) {
    player.cardStates[cardId] = {}
  }
  return player.cardStates[cardId]!
}

export const isCardFlagged = (player: PlayerState, cardId: string) =>
  !!player.cardStates?.[cardId]?.flagged

export const setCardFlag = (
  player: PlayerState,
  cardId: string,
  flagged: boolean,
) => {
  ensureCardState(player, cardId).flagged = flagged
}

export const readCardExtraData = <T>(
  player: PlayerState,
  cardId: string,
  key: string,
): T | undefined =>
  player.cardStates?.[cardId]?.extraData?.[key] as T | undefined

export const writeCardExtraData = (
  player: PlayerState,
  cardId: string,
  key: string,
  value: unknown,
) => {
  const cardState = ensureCardState(player, cardId)
  if (!cardState.extraData) {
    cardState.extraData = {}
  }
  cardState.extraData[key] = value
}
