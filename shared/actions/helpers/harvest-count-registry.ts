import type { Field, GameState, PlayerState } from '../../contract/types'
import { fieldTotalRemaining } from '../../domain/field'
import type { LogicalField } from '../../cards/helpers/card-field'

export type HarvestCountModifierContext = {
  state: GameState
  player: PlayerState
  field: Field
  logicalField?: LogicalField
}

export type HarvestSelectionThresholdContext = HarvestCountModifierContext & {
  sourceCard: string
  baseThreshold: number
}

export type HarvestCountModifierResult = {
  delta?: number
  override?: number
  sources?: string[]
  tags?: string[]
  scope?: 'top-stack' | 'field'
}

export type HarvestCountModifier = (
  context: HarvestCountModifierContext,
) => HarvestCountModifierResult | undefined

export type HarvestSelectionThresholdModifierResult = {
  threshold: number
  sources?: string[]
}

export type HarvestSelectionThresholdModifier = (
  context: HarvestSelectionThresholdContext,
) => HarvestSelectionThresholdModifierResult | undefined

const modifiers = new Map<string, HarvestCountModifier>()
const selectionThresholdModifiers = new Map<string, HarvestSelectionThresholdModifier>()

export const registerHarvestCountModifier = (
  cardId: string,
  modifier: HarvestCountModifier,
) => {
  modifiers.set(cardId, modifier)
}

export const registerHarvestSelectionThresholdModifier = (
  cardId: string,
  modifier: HarvestSelectionThresholdModifier,
) => {
  selectionThresholdModifiers.set(cardId, modifier)
}

export const unregisterHarvestSelectionThresholdModifier = (cardId: string) => {
  selectionThresholdModifiers.delete(cardId)
}

export const computeHarvestCount = (
  state: GameState,
  player: PlayerState,
  field: Field,
  options: { baseCount?: number; logicalField?: LogicalField } = {},
) => {
  const sources = new Set<string>(['base'])
  const tags = new Set<string>()
  let count = options.baseCount ?? 1
  let override: number | undefined
  let overrideSources: string[] | undefined
  let scope: 'top-stack' | 'field' = 'top-stack'
  const deltaSources: string[] = []

  for (const [cardId, modifier] of modifiers) {
    const result = modifier({ state, player, field, logicalField: options.logicalField })
    if (!result) continue
    const nextSources = result.sources?.length ? result.sources : [cardId]
    result.tags?.forEach((tag) => tags.add(tag))
    if (typeof result.delta === 'number') {
      count += result.delta
      deltaSources.push(...nextSources)
    }
    if (typeof result.override === 'number') {
      override = result.override
      overrideSources = nextSources
    }
    if (result.scope) scope = result.scope
  }

  const contributingSources = override !== undefined ? overrideSources ?? [] : deltaSources
  contributingSources.forEach((source) => sources.add(source))

  const rawCount = override ?? count
  return {
    count: Math.max(0, Math.min(fieldTotalRemaining(field), Math.floor(rawCount))),
    sources: [...sources],
    tags: [...tags],
    scope,
  }
}

export const computeHarvestSelectionThreshold = (
  state: GameState,
  player: PlayerState,
  field: Field,
  options: {
    sourceCard: string
    baseThreshold: number
    logicalField?: LogicalField
  },
) => {
  let threshold = options.baseThreshold
  const sources = new Set<string>()
  for (const [cardId, modifier] of selectionThresholdModifiers) {
    const result = modifier({
      state,
      player,
      field,
      logicalField: options.logicalField,
      sourceCard: options.sourceCard,
      baseThreshold: options.baseThreshold,
    })
    if (!result) continue
    const next = Math.max(0, Math.floor(result.threshold))
    if (next > threshold) continue
    if (next < threshold) {
      threshold = next
      sources.clear()
    }
    const nextSources = result.sources?.length ? result.sources : [cardId]
    nextSources.forEach((source) => sources.add(source))
  }
  return { threshold, sources: [...sources] }
}
