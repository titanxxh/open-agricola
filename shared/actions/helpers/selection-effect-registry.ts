import type { ActionFlow, GameState, PlayerState } from '../../contract/types'

export type SelectionEffectContext = {
  player: PlayerState
  positions: string[]
  /** Forward-compat: structured card-id selections from `selection` kind requests
   *  (e.g. occupation-hand picks). Empty array when no card-id payload was supplied. */
  cards: string[]
  sourceCard: string | undefined
  state: GameState
}

export type SelectionEffectHandler = (
  ctx: SelectionEffectContext,
) => ActionFlow | void

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
): ActionFlow | void => {
  const handler = registry.get(name)
  if (!handler) return
  return handler(ctx)
}
