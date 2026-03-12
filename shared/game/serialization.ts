import type { ActionSpace, GameState } from './types'
import { createActionSpaces } from '../actions'
import { normalizeState } from '../logic/state'

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

export const rehydrateState = (raw: SerializedGameState): GameState => {
  const templates = createActionSpaces()
  const restored = normalizeState(raw as unknown as GameState)
  restored.actionSpaces = templates.map((template) => {
    const saved = raw.actionSpaces?.find((s) => s.id === template.id)
    return {
      ...template,
      resources: saved?.resources ?? template.resources,
      takenBy: saved?.takenBy ?? null,
    }
  })
  return restored
}
