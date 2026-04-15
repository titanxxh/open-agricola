import type { PlayerState } from '../../game/types'

type PrerequisiteHandler = (player: PlayerState) => boolean

const registry = new Map<string, PrerequisiteHandler>()

export const registerPrerequisite = (name: string, handler: PrerequisiteHandler) => {
  registry.set(name, handler)
}

export const checkCustomPrerequisite = (name: string, player: PlayerState): boolean | null => {
  const handler = registry.get(name)
  if (!handler) return null
  return handler(player)
}
