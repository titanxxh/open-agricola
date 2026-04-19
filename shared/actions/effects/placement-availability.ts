import type {
  ActionExecutionContext,
  ActionSpace,
  GameState,
  PlayerState,
  Resource,
} from '../../game/types'
import type { CardListenerContext } from '../../cards/card-listeners'
import { isSpaceOccupied } from '../../game/space'
import { getMatchingListeners, executeCardListener } from '../../cards/card-listeners'
import { runActionHooks, applyCanUseOccupiedHooks } from '../hooks'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from './placement-constants'
import { placeFarmerAction } from './place-farmer'

export type AllowedPlacement = {
  spaceId: string
  allowOccupied: boolean
}

const placeFarmerVirtualSpace: ActionSpace = {
  ...placeFarmerAction,
  resources: {} as Resource,
  takenBy: [],
}

export function computeAllowedPlacementSpaces(
  state: GameState,
  player: PlayerState,
): AllowedPlacement[] {
  const base: AllowedPlacement[] = state.actionSpaces
    .filter(s => !isSpaceOccupied(s) && s.canBeExecutedByPlayer(state, player))
    .map(s => ({ spaceId: s.id, allowOccupied: false }))

  const context: ActionExecutionContext & { actionId: string } = {
    state,
    player,
    space: placeFarmerVirtualSpace,
    actionId: 'place-farmer',
  }

  const actionResults = runActionHooks({ ...context, phase: 'computeArgs' })
  const listenerContext: CardListenerContext = { ...context, phase: 'computeArgs' }
  const matched = getMatchingListeners(listenerContext)
  const listenerResults = matched
    .map(entry =>
      executeCardListener(entry.registration, listenerContext, {
        ownerPlayerId: entry.ownerPlayerId,
      }),
    )
    .filter((r): r is NonNullable<typeof r> => Boolean(r))

  const extra: AllowedPlacement[] = []
  for (const result of [...actionResults, ...listenerResults]) {
    for (const opt of result.extraOptions ?? []) {
      if (!opt.value.startsWith(OCCUPIED_SPACE_CHOICE_PREFIX)) continue
      const spaceId = opt.value.slice(OCCUPIED_SPACE_CHOICE_PREFIX.length)
      const space = state.actionSpaces.find(s => s.id === spaceId)
      if (!space) continue
      if (!space.canBeExecutedByPlayer(state, player)) continue
      extra.push({ spaceId, allowOccupied: true })
    }
  }

  // Also check canUseOccupied hooks + card listeners for occupied spaces
  for (const space of state.actionSpaces) {
    if (!isSpaceOccupied(space)) continue
    if (!space.canBeExecutedByPlayer(state, player)) continue
    const spaceContext: ActionExecutionContext & { actionId: string } = {
      state,
      player,
      space,
      actionId: space.id,
    }
    let canUseOccupied = applyCanUseOccupiedHooks(spaceContext, false)
    const canUseOccupiedListenerCtx: CardListenerContext = {
      ...spaceContext,
      phase: 'canUseOccupied',
      canUseOccupied,
    }
    const canUseOccupiedMatched = getMatchingListeners(canUseOccupiedListenerCtx)
    for (const entry of canUseOccupiedMatched) {
      const result = executeCardListener(entry.registration, canUseOccupiedListenerCtx, {
        ownerPlayerId: entry.ownerPlayerId,
      })
      if (result && typeof result.canUseOccupied === 'boolean') {
        canUseOccupied = result.canUseOccupied
      }
    }
    if (canUseOccupied) {
      extra.push({ spaceId: space.id, allowOccupied: true })
    }
  }

  const seen = new Set<string>()
  const merged: AllowedPlacement[] = []
  for (const entry of [...base, ...extra]) {
    if (seen.has(entry.spaceId)) continue
    seen.add(entry.spaceId)
    merged.push(entry)
  }
  return merged
}
