import type { ActionHookRegistry } from '../actions/hooks'
import type { ExchangeBatchEntry, GameState, PlayerState, ReserveCookingOffer } from '../contract/types'
import { animalKeysForState } from '../contract/animals'
import { getReserveCookingCatalog, reserveAnimalCounts, validateExchangeBatch } from '../actions/effects/exchange'
import { validateAnimalAssignments } from '../actions/effects/reorganize'
import { computeAnimalZones, readAnimalCountsForZoneAssignment } from '../domain/animal-zones'

export const buildReserveCookingOffer = (
  state: GameState,
  player: PlayerState,
  actionHooks: ActionHookRegistry,
): ReserveCookingOffer | undefined => {
  const available = reserveAnimalCounts(state, player)
  const catalog = getReserveCookingCatalog(state, player, available, actionHooks)
    .map(({ trade: _trade, window: _window, ...recipe }) => recipe)
  return catalog.length > 0 ? { available, catalog } : undefined
}

export const resolveReserveCookingBatch = ({
  state, player, offer, payload, actionHooks,
}: {
  state: GameState
  player: PlayerState
  offer: ReserveCookingOffer
  payload: Record<string, unknown>
  actionHooks: ActionHookRegistry
}): ExchangeBatchEntry[] | undefined => {
  const { zones, exchanges } = payload
  if (!Array.isArray(zones) || !Array.isArray(exchanges) || exchanges.length === 0) return
  const draft = validateAnimalAssignments(state, player, computeAnimalZones(player, state), zones)
  if (!draft) return

  const animals = animalKeysForState(state)
  const reserve = reserveAnimalCounts(state, player)
  const available = { ...player.resources }
  for (const zone of draft) {
    const assigned = readAnimalCountsForZoneAssignment(zone)
    for (const animal of animals) available[animal] = (available[animal] ?? 0) - (assigned[animal] ?? 0)
  }
  for (const animal of animals) {
    available[animal] = Math.min(available[animal] ?? 0, reserve[animal] ?? 0)
  }

  const live = getReserveCookingCatalog(state, player, available, actionHooks)
  const entries: ExchangeBatchEntry[] = []
  for (const selection of exchanges as unknown[]) {
    if (selection === null || typeof selection !== 'object'
      || !('sourceId' in selection) || typeof selection.sourceId !== 'string'
      || !('exchangeIndex' in selection) || typeof selection.exchangeIndex !== 'number'
      || !Number.isSafeInteger(selection.exchangeIndex)
      || !('count' in selection) || typeof selection.count !== 'number'
      || !Number.isSafeInteger(selection.count) || selection.count <= 0) return
    const { sourceId, exchangeIndex, count } = selection
    if (!offer.catalog.some(recipe => recipe.sourceId === sourceId && recipe.exchangeIndex === exchangeIndex)) return
    const recipe = live.find(candidate => candidate.sourceId === sourceId && candidate.exchangeIndex === exchangeIndex)
    if (!recipe || count > (recipe.max ?? 0)) return
    for (const animal of animals) {
      const paid = (recipe.from[animal] ?? 0) * count
      const remaining = available[animal] ?? 0
      if (paid > remaining) return
      available[animal] = remaining - paid
    }
    entries.push({ trade: recipe.trade, count })
  }
  return validateExchangeBatch({ state, player, entries, reserveAnimalPayment: true }) ? entries : undefined
}
