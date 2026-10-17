import { createActionSpaces } from '../actions'
import { createPlayerActionSpaces } from '../cards/player-action-space'
import { restoreCardWorkerSpaces } from '../domain/card-worker-space'
import { createMoorActionSpaces } from '../moor/action-spaces'
import { createSeasonActionSpaces } from '../seasons/action-spaces'
import type { ActionDefinition, ActionSpace, GameState } from '../contract/types'
import { captureStateWithHistory } from './history-streams'

type ActionDefinitionLookup = (id: string) => ActionDefinition | undefined

/** Restore an existing game's data; only executable rules are reattached. */
export function restoreSessionState(raw: GameState, lookup?: ActionDefinitionLookup): GameState {
  if (!Array.isArray(raw.players) || !Array.isArray(raw.actionSpaces)) throw new Error('Invalid Session recovery state')
  for (const player of raw.players) {
    if (!Array.isArray(player.minorHand) || !Array.isArray(player.occupationHand)) {
      throw new Error('Session recovery requires explicit card hands')
    }
  }
  const captured = captureStateWithHistory(raw)
  // Live sessions append to these arrays; immutable captured records retain
  // their identities and remain shared with the saved history version.
  const state: GameState = { ...captured,
    log: captured.log.slice(),
    events: captured.events.slice(),
    publicEventArchive: captured.publicEventArchive.slice(),
  }
  const dynamicSpaces = createPlayerActionSpaces(state)
  const workerSpaces = new Map(restoreCardWorkerSpaces(state.actionSpaces).map(space => [space.id, space]))
  const definitions = new Map([
    ...createActionSpaces(state.players.length),
    ...(state.enableFarmersOfTheMoor ? createMoorActionSpaces(state.players.length) : []),
    ...(state.enableThroughTheSeasons ? createSeasonActionSpaces(state.players.length) : []),
    ...dynamicSpaces,
    ...workerSpaces.values(),
  ].map(definition => [definition.id, definition]))
  state.actionSpaces = state.actionSpaces.flatMap(stored => {
    const original = raw.actionSpaces.find(space => space.id === stored.id)
    const workerSpace = workerSpaces.get(stored.id)
    const definition = workerSpace ?? (original && typeof original.execute === 'function'
      ? original : lookup?.(stored.id) ?? definitions.get(stored.id))
    // Unknown serialized executables are excluded under the existing load
    // contract; known card-worker holders are reconstructed above.
    if (!definition) return []
    const space: ActionSpace = { ...stored,
      ...(workerSpace ? { nameKey: workerSpace.nameKey, descriptionKey: workerSpace.descriptionKey } : {}),
      canBeExecutedByPlayer: definition.canBeExecutedByPlayer,
      execute: definition.execute,
    }
    // Client Frames omit executable flow plans; authoritative captures retain
    // their own plan data. Reattach only a missing definition-owned plan.
    if (space.flow === undefined && definition.flow !== undefined) {
      space.flow = JSON.parse(JSON.stringify(definition.flow)) as ActionSpace['flow']
    }
    // These fields are executable rules, not captured mutable game data.
    if (definition.originalActionCondition) space.originalActionCondition = definition.originalActionCondition
    if (definition.canBeOfferedByPlayer) space.canBeOfferedByPlayer = definition.canBeOfferedByPlayer
    if (definition.isAlreadySatisfied) space.isAlreadySatisfied = definition.isAlreadySatisfied
    if (definition.resolveChoice) space.resolveChoice = definition.resolveChoice
    if (definition.completeInternalChildren) space.completeInternalChildren = definition.completeInternalChildren
    if (definition.previewEffect) space.previewEffect = definition.previewEffect
    if (definition.flowFactory) space.flowFactory = definition.flowFactory
    if (definition.getBaseChoiceOptions) space.getBaseChoiceOptions = definition.getBaseChoiceOptions
    if (definition.costPreview) space.costPreview = definition.costPreview
    return [space]
  })
  // Prepared loaded states can already own a card without its derived space.
  // Existing snapshots keep their captured space data and ordering above.
  for (const definition of dynamicSpaces) {
    if (!state.actionSpaces.some(space => space.id === definition.id)) state.actionSpaces.push(definition)
  }
  return state
}
