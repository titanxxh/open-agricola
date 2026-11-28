import type { PlayerState } from '../../contract/types'
import { ensureCardState } from './card-state'

const HELD_KEY = 'heldWorkerId'
const HELD_LIST_KEY = 'heldWorkerIds'

const readHeldList = (extraData: Record<string, unknown> | undefined): string[] => {
  const list = extraData?.[HELD_LIST_KEY]
  if (Array.isArray(list)) {
    return list.filter((entry): entry is string => typeof entry === 'string')
  }
  const single = extraData?.[HELD_KEY]
  return typeof single === 'string' ? [single] : []
}

export const holdWorkerOnCard = (
  player: PlayerState,
  cardId: string,
  workerId: string,
): void => {
  const cs = ensureCardState(player, cardId)
  const { [HELD_LIST_KEY]: _removedList, ...rest } = cs.extraData ?? {}
  cs.extraData = { ...rest, [HELD_KEY]: workerId }
}

export const holdWorkersOnCard = (
  player: PlayerState,
  cardId: string,
  workerIds: readonly string[],
): void => {
  const uniqueIds = [...new Set(workerIds.filter((id) => id.length > 0))]
  const cs = ensureCardState(player, cardId)
  const { [HELD_KEY]: _removedSingle, [HELD_LIST_KEY]: _removedList, ...rest } = cs.extraData ?? {}
  if (uniqueIds.length === 0) {
    cs.extraData = rest
    return
  }
  cs.extraData = {
    ...rest,
    ...(uniqueIds.length === 1 ? { [HELD_KEY]: uniqueIds[0]! } : {}),
    [HELD_LIST_KEY]: uniqueIds,
  }
}

export const getWorkersHeldOnCard = (
  player: PlayerState,
  cardId: string,
): string[] => readHeldList(player.cardStates?.[cardId]?.extraData)

export const getWorkerHeldOnCard = (
  player: PlayerState,
  cardId: string,
): string | undefined => {
  const single = player.cardStates?.[cardId]?.extraData?.[HELD_KEY]
  if (typeof single === 'string') return single
  return getWorkersHeldOnCard(player, cardId)[0]
}

export const releaseWorkerFromCard = (
  player: PlayerState,
  cardId: string,
): string | undefined => {
  const current = getWorkersHeldOnCard(player, cardId)
  if (current.length === 0) return undefined
  const cs = ensureCardState(player, cardId)
  if (cs.extraData) {
    const { [HELD_KEY]: _removedSingle, [HELD_LIST_KEY]: _removedList, ...rest } = cs.extraData
    cs.extraData = rest
  }
  return current[0]
}

export const getCardHeldWorkerIds = (player: PlayerState): Set<string> => {
  const out = new Set<string>()
  const cardStates = player.cardStates ?? {}
  for (const key of Object.keys(cardStates)) {
    const extraData = cardStates[key]?.extraData
    const single = extraData?.[HELD_KEY]
    if (typeof single === 'string') out.add(single)
    for (const workerId of readHeldList(extraData)) out.add(workerId)
  }
  return out
}
