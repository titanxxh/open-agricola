import type { ActionSpace, GameState } from './types'
import { createActionSpaces } from '../actions'
import { normalizeState } from '../logic/state'
import { getCardModifiers } from '../cards/card-modifiers'
import { createPlayerActionSpaces } from '../cards/player-action-space'
import { normalizeTakenBy } from './space'

export type SerializedActionSpace = Omit<
  ActionSpace,
  'canBeExecutedByPlayer' | 'execute' | 'resolveChoice' | 'flow'
>

export type SerializedGameState = Omit<
  GameState,
  'actionSpaces' | 'roundStartSnapshot'
> & {
  actionSpaces: SerializedActionSpace[]
  roundStartSnapshot: null
}

export const serializeState = (state: GameState): SerializedGameState => {
  const { actionSpaces, ...rest } = state
  return {
    ...rest,
    roundStartSnapshot: null,
    actionSpaces: actionSpaces.map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ canBeExecutedByPlayer, execute, resolveChoice, flow, ...s }) => s,
    ),
  }
}

export const rebuildActiveModifiers = (state: GameState): GameState => {
  state.players.forEach((player) => {
    const existing = player.activeModifiers ?? []
    const next = [...existing]
    const playedCardIds = [...(player.minorPlayed ?? []), ...(player.occupationPlayed ?? []), ...(player.extraOccupationsFromCards ?? [])]
    playedCardIds.forEach((cardId) => {
      const modifiers = getCardModifiers(cardId)
      modifiers.forEach((modifier) => {
        if (!next.some((entry) => JSON.stringify(entry) === JSON.stringify(modifier))) {
          next.push(modifier)
        }
      })
    })
    player.activeModifiers = next
    // Ensure extraOccupationsFromCards is initialized
    if (!player.extraOccupationsFromCards) {
      player.extraOccupationsFromCards = []
    }
  })
  return state
}

export const rehydrateState = (raw: SerializedGameState): GameState => {
  const templates = createActionSpaces()
  const restored = rebuildActiveModifiers(normalizeState(raw as unknown as GameState))
  restored.actionSpaces = templates.map((template) => {
    const saved = raw.actionSpaces?.find((s) => s.id === template.id)
    return {
      ...template,
      resources: saved?.resources ?? template.resources,
      takenBy: normalizeTakenBy(saved?.takenBy),
    }
  })
  // Append PlayerActionCard dynamic spaces
  const playerActionSpaces = createPlayerActionSpaces(restored)
  for (const pas of playerActionSpaces) {
    const saved = raw.actionSpaces?.find((s) => s.id === pas.id)
    if (saved) {
      pas.resources = saved.resources ?? pas.resources
      pas.takenBy = normalizeTakenBy(saved.takenBy)
    }
    restored.actionSpaces.push(pas)
  }
  return restored
}
