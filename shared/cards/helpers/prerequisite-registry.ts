import type { GameState, PlayerState } from '../../contract/types'

type PrerequisiteHandler = (player: PlayerState, state?: GameState) => boolean

const registry = new Map<string, PrerequisiteHandler>()

export const registerPrerequisite = (name: string, handler: PrerequisiteHandler) => {
  registry.set(name, handler)
}

export const checkCustomPrerequisite = (
  name: string,
  player: PlayerState,
  state?: GameState,
): boolean | null => {
  const handler = registry.get(name)
  if (!handler) return null
  return handler(player, state)
}
