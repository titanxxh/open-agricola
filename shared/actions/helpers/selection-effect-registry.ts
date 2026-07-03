import type { ActionFlow, GameState, PlayerState } from '../../contract/types'

export type SelectionEffectContext = {
  player: PlayerState
  positions: string[]
  /** Forward-compat: structured card-id selections from `selection` kind requests
   *  (e.g. occupation-hand picks). Empty array when no card-id payload was supplied. */
  cards: string[]
  sourceCard: string | undefined
  state: GameState
  actionContext?: Record<string, unknown>
}

export type SelectionEffectHandler = (
  ctx: SelectionEffectContext,
) => ActionFlow | void

export type SelectionValidationHandler = (
  ctx: SelectionEffectContext,
) => string | void

const registry = new Map<string, SelectionEffectHandler>()
const validators = new Map<string, SelectionValidationHandler>()

export const registerSelectionEffect = (
  name: string,
  handler: SelectionEffectHandler,
) => {
  registry.set(name, handler)
}

export const registerSelectionValidator = (
  name: string,
  handler: SelectionValidationHandler,
) => {
  validators.set(name, handler)
}

export const runSelectionEffect = (
  name: string,
  ctx: SelectionEffectContext,
): ActionFlow | void => {
  const handler = registry.get(name)
  if (!handler) return
  return handler(ctx)
}

export const validateSelectionEffect = (
  name: string,
  ctx: SelectionEffectContext,
): string | void => {
  const handler = validators.get(name)
  if (!handler) return
  return handler(ctx)
}
