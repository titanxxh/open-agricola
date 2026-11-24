import { describe, expect, it } from 'vitest'
import { ALL_CARD_IMPLS } from '../register-all'
import { getCardDefinition } from '../catalog'
import { flowCardEffectHooks } from '../../contract/card-effect-hooks'

// #2039 gate (Card contract: Timing): a printed stage timing puts the card on its hook,
// so cards with the same wording share one window (CARD_AUTHORING.md §4.3, ADR 0055).
const FIELD_PHASE = ['onStartHarvestFieldPhase', 'onHarvestFieldPhase', 'onAfterReap', 'onEndHarvestFieldPhase']
const PRINTED_TIMINGS: [RegExp, readonly string[]][] = [
  [/at the end of (each|the) work phase|at the end of the work phases of rounds/i, ['onAllWorkersPlaced']],
  [/after each work phase|immediately before the returning home phase/i, ['onBeforeReturnHome']],
  [/at the start of the returning home phase/i, ['onStartReturnHome']],
  [/in the returning home phase/i, ['onReturnHome']],
  [/immediately after each returning home phase/i, ['onAfterReturnHome']],
  [/at the end of each round|(?<!harvest )at the end of round \d/i, ['onRoundEnd']],
  [/after each round/i, ['onAfterRoundEnd']],
  [/immediately before each harvest/i, ['onBeforeHarvest']],
  [/at the start of each harvest(?! field)/i, ['onStartHarvest']],
  [/at the start of each harvest field phase|at the start of the field phase/i, ['onStartHarvestFieldPhase']],
  // Field-phase effects sit before or after the reap by what they read (ADR 0055).
  [/in the field phase of each harvest|during each harvest field phase/i, FIELD_PHASE],
  [/after each harvest field phase|at the end of the field phase|after the field phase/i, ['onEndHarvestFieldPhase']],
  [/at the start of (the|each) (harvest )?feeding phase/i, ['onStartHarvestFeedingPhase']],
  [/during each harvest feeding phase|in the feeding phase of each harvest/i, ['onHarvestFeedingPhase']],
  [/after each harvest feeding phase|at the end of (the|each) (harvest )?feeding phase/i, ['onEndHarvestFeedingPhase']],
  [/at the end of each harvest/i, ['onEndHarvest']],
  [/after each harvest(?! (field|feeding))/i, ['onAfterHarvest']],
  [/before the start of each round/i, ['onBeforeStartOfTurn']],
  [/at the start of each round/i, ['onRoundStart']],
  [/at the start of each work phase/i, ['onWorkStart']],
]
/** Cards whose printed timing another mechanism serves; each names the mechanism. */
const OTHER_MECHANISM: Record<string, string> = {
  D062_BeerTap: 'a feeding-phase exchange',
  E159_OldMiser: 'a feeding requirement modifier',
  M032_PeatHut: 'the heating requirement',
  M053_ForestHut: 'the returning home step that brings its person back',
  Major_Moor_RidingStables: 'goods on round spaces, received at StartOfTurn',
}

const printedStageTimings = () => Object.entries(ALL_CARD_IMPLS).flatMap(([cardId, impl]) => {
  const text = (getCardDefinition(cardId)?.desc ?? []).join(' ')
  const effect = impl.effect as Partial<Record<string, unknown>> & { timedRules?: { at: { phase?: string } }[] } | undefined
  const hooks = new Set<string>([
    ...flowCardEffectHooks.filter(hook => hook !== 'onBuy' && typeof effect?.[hook] === 'function'),
    ...(effect?.timedRules ?? []).flatMap(rule => rule.at.phase ? [rule.at.phase] : []),
  ])
  return PRINTED_TIMINGS.filter(([phrase]) => phrase.test(text))
    .map(([phrase, expected]) => ({ cardId, phrase: phrase.source, expected, hooks: [...hooks], onHook: expected.some(hook => hooks.has(hook)) }))
})

describe('printed stage timing', () => {
  it('puts every card with a printed stage timing on that timing’s hook', () => {
    const misplaced = printedStageTimings().filter(entry => !entry.onHook && !(entry.cardId in OTHER_MECHANISM))
    expect(misplaced).toEqual([])
  })

  it('keeps each other-mechanism exception printed and off the hook', () => {
    const entries = printedStageTimings()
    for (const cardId of Object.keys(OTHER_MECHANISM)) {
      const own = entries.filter(entry => entry.cardId === cardId)
      expect(own.length, `${cardId} still prints a stage timing`).toBeGreaterThan(0)
      expect(own.some(entry => entry.onHook), `${cardId} moved to its hook; drop the exception`).toBe(false)
    }
  })
})
