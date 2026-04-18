import type { PlayerState } from '../../game/types'

export type SelectionEffectContext = {
  player: PlayerState
  fields: string[]
  sourceCard: string | undefined
}

export type SelectionEffectHandler = (ctx: SelectionEffectContext) => void

const registry = new Map<string, SelectionEffectHandler>()

export const registerSelectionEffect = (
  name: string,
  handler: SelectionEffectHandler,
) => {
  registry.set(name, handler)
}

export const runSelectionEffect = (
  name: string,
  ctx: SelectionEffectContext,
): boolean => {
  const handler = registry.get(name)
  if (!handler) return false
  handler(ctx)
  return true
}
