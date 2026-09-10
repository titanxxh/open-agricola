import type { ActionChoiceOption, ActionSpace, GameState, PlayerState, Resource } from '../../contract/types'
import type { CardListenerContextInput } from '../../cards/card-listeners'
import { canSpaceAcceptWorker, filterActionSpacesByIds, findActionSpaceById, isSpaceBlocked } from '../../domain/space'
import { canMoorWorkerEnterSpace } from '../../moor/heating'
import { getMatchingListeners, executeCardListener, listenerOwnerOptions } from '../../cards/card-listeners'
import { resetComputeReplaceGuards } from '../../engine/replace-guard'
import { runActionHooks } from '../hooks'
import { isActionDoableInFlowContext } from '../flow'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from './placement-constants'

export type AllowedPlacement = {
  spaceId: string
  allowOccupied: boolean
  option?: ActionChoiceOption
}

type PlacementContextOverrides = Partial<CardListenerContextInput> & {
  ignoreWorkerAvailability?: boolean
  isActionDoable?: (space: ActionSpace, baseDoable: boolean) => boolean
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

export const canUseExclusiveSpace = (space: ActionSpace, player: PlayerState, state: GameState): boolean => {
  const exclusive = space.exclusiveUse
  if (!exclusive) return true
  if (state.round >= exclusive.untilRound) return true
  return exclusive.playerId === player.id
}

export const exclusiveOwnerOverride = (space: ActionSpace, player: PlayerState, state: GameState): boolean =>
  space.exclusiveUse?.playerId === player.id && state.round < space.exclusiveUse.untilRound

export const openRoundForSpace = (state: GameState, space: ActionSpace): number => {
  const roundIndex = state.roundActionOrder?.indexOf(space.id) ?? -1
  return roundIndex === -1 ? space.roundAvailable : roundIndex + 1
}

export const canEnterSpace = (space: ActionSpace, player: PlayerState, state: GameState): boolean => {
  const exclusiveOverride = exclusiveOwnerOverride(space, player, state)
  if (exclusiveOverride) return true
  if (state.round < openRoundForSpace(state, space)) return false
  return canUseExclusiveSpace(space, player, state)
}

const canExecutePlacementSpace = (
  state: GameState,
  player: PlayerState,
  space: ActionSpace,
  contextOverrides: PlacementContextOverrides,
): boolean => {
  const actionContext = resetComputeReplaceGuards(contextOverrides.actionContext)
  if (contextOverrides.isActionDoable) {
    const baseDoable = space.canBeExecutedByPlayer.call(
      space,
      state,
      player,
      {
        sourceCard: contextOverrides.sourceCard,
        actionContext,
      },
    )
    return contextOverrides.isActionDoable(space, baseDoable)
  }
  return isActionDoableInFlowContext({
    actionId: space.id,
    action: space,
    state,
    player,
    space,
    sourceCard: contextOverrides.sourceCard,
    actionContext,
    resolveAction: (actionId) => findActionSpaceById(state, actionId),
  })
}

export function computeAllowedPlacementSpaces(
  state: GameState,
  player: PlayerState,
  contextOverrides: PlacementContextOverrides = {},
): AllowedPlacement[] {
  const base: AllowedPlacement[] = state.actionSpaces
    .filter((s) => {
      if (!canEnterSpace(s, player, state)) return false
      if (isSpaceBlocked(s)) return false
      if (!canSpaceAcceptWorker(s)) return false
      if (!contextOverrides.ignoreWorkerAvailability && !canMoorWorkerEnterSpace(state, player, s.id)) return false
      return canExecutePlacementSpace(state, player, s, contextOverrides)
    })
    .map(s => ({ spaceId: s.id, allowOccupied: false }))

  const baseOptions = filterActionSpacesByIds(state, base.map((entry) => entry.spaceId)).map((space) => ({
    value: space.id,
    labelKey: space.nameKey,
  }))
  const result = contextOverrides.result ?? {
    type: 'request' as const,
    request: { kind: 'choice' as const, options: baseOptions },
  }
  const actionResults = runActionHooks({
    state,
    player,
    space: createPlaceFarmerVirtualSpace(),
    actionId: 'place-farmer',
    phase: 'computeArgs',
    sourceCard: contextOverrides.sourceCard,
    params: contextOverrides.params,
    costs: contextOverrides.costs,
    actionContext: contextOverrides.actionContext,
    result,
  })
  const listenerContext: CardListenerContextInput = {
    ...contextOverrides,
    state,
    player,
    space: createPlaceFarmerVirtualSpace(),
    actionId: 'place-farmer',
    phase: 'computeArgs',
    result,
  }
  const matched = getMatchingListeners(listenerContext)
  const listenerResults = matched
    .map(entry =>
      executeCardListener(entry.registration, listenerContext, listenerOwnerOptions(entry)),
    )
    .filter((r): r is import('../hooks').ActionHookResult => Boolean(r))

  const extra: AllowedPlacement[] = []
  for (const result of [...actionResults, ...listenerResults]) {
    for (const opt of result.extraOptions ?? []) {
      if (!opt.value.startsWith(OCCUPIED_SPACE_CHOICE_PREFIX)) continue
      const spaceId = opt.value.slice(OCCUPIED_SPACE_CHOICE_PREFIX.length)
      const space = findActionSpaceById(state, spaceId)
      if (!space) continue
      if (!canEnterSpace(space, player, state)) continue
      if (isSpaceBlocked(space)) continue
      if (!contextOverrides.ignoreWorkerAvailability && !canMoorWorkerEnterSpace(state, player, space.id)) continue
      if (!canExecutePlacementSpace(state, player, space, contextOverrides)) continue
      extra.push({ spaceId, allowOccupied: true, option: opt })
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
