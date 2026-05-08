import type {
  ActionExecutionContext,
  ActionSpace,
  GameState,
  PlayerState,
  Resource,
} from '../../contract/types'
import type { CardListenerContext } from '../../cards/card-listeners'
import { isSpaceOccupied } from '../../domain/space'
import { getMatchingListeners, executeCardListener } from '../../cards/card-listeners'
import { runActionHooks } from '../hooks'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from './placement-constants'

export type AllowedPlacement = {
  spaceId: string
  allowOccupied: boolean
}

const createPlaceFarmerVirtualSpace = (): ActionSpace => ({
  id: 'place-farmer',
  nameKey: 'actions.place-farmer.name',
  descriptionKey: 'actions.place-farmer.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
  resources: {} as Resource,
  takenBy: [],
})

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
    space: createPlaceFarmerVirtualSpace(),
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
    .filter((r): r is import('../hooks').ActionHookResult => Boolean(r))

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

  const seen = new Set<string>()
  const merged: AllowedPlacement[] = []
  for (const entry of [...base, ...extra]) {
    if (seen.has(entry.spaceId)) continue
    seen.add(entry.spaceId)
    merged.push(entry)
  }
  return merged
}
