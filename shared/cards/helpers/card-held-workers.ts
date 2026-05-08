import type { PlayerState } from '../../contract/types'
import { ensureCardState } from './card-state'

const HELD_KEY = 'heldWorkerId'

export const holdWorkerOnCard = (
  player: PlayerState,
  cardId: string,
  workerId: string,
): void => {
  const cs = ensureCardState(player, cardId)
  cs.extraData = { ...(cs.extraData ?? {}), [HELD_KEY]: workerId }
}

export const getWorkerHeldOnCard = (
  player: PlayerState,
  cardId: string,
): string | undefined => {
  const value = player.cardStates?.[cardId]?.extraData?.[HELD_KEY]
  return typeof value === 'string' ? value : undefined
}

export const releaseWorkerFromCard = (
  player: PlayerState,
  cardId: string,
): string | undefined => {
  const current = getWorkerHeldOnCard(player, cardId)
  if (current === undefined) return undefined
  const cs = ensureCardState(player, cardId)
  if (cs.extraData) {
    const { [HELD_KEY]: _removed, ...rest } = cs.extraData
    cs.extraData = rest
  }
  return current
}

export const getCardHeldWorkerIds = (player: PlayerState): Set<string> => {
  const out = new Set<string>()
  const cardStates = player.cardStates ?? {}
  for (const key of Object.keys(cardStates)) {
    const value = cardStates[key]?.extraData?.[HELD_KEY]
    if (typeof value === 'string') out.add(value)
  }
  return out
}
