import type { Field, GameState, PlayerState } from '../../contract/types'
import { fieldTotalRemaining } from '../../domain/field'

export type HarvestCountModifierContext = {
  state: GameState
  player: PlayerState
  field: Field
}

export type HarvestCountModifierResult = {
  delta?: number
  override?: number
  sources?: string[]
  scope?: 'top-stack' | 'field'
}

export type HarvestCountModifier = (
  context: HarvestCountModifierContext,
) => HarvestCountModifierResult | undefined

const modifiers = new Map<string, HarvestCountModifier>()

export const registerHarvestCountModifier = (
  cardId: string,
  modifier: HarvestCountModifier,
) => {
  modifiers.set(cardId, modifier)
}

export const computeHarvestCount = (
  state: GameState,
  player: PlayerState,
  field: Field,
) => {
  const sources = new Set<string>(['base'])
  let count = 1
  let override: number | undefined
  let scope: 'top-stack' | 'field' = 'top-stack'

  for (const [cardId, modifier] of modifiers) {
    const result = modifier({ state, player, field })
    if (!result) continue
    const nextSources = result.sources?.length ? result.sources : [cardId]
    nextSources.forEach((source) => sources.add(source))
    if (typeof result.delta === 'number') count += result.delta
    if (typeof result.override === 'number') override = result.override
    if (result.scope) scope = result.scope
  }

  const rawCount = override ?? count
  return {
    count: Math.max(0, Math.min(fieldTotalRemaining(field), Math.floor(rawCount))),
    sources: [...sources],
    scope,
  }
}
