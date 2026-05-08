import { describe, it, expectTypeOf } from 'vitest'
import type { PromptKey, PromptParams } from '../../contract/prompt-keys'

describe('PromptKey + PromptParams', () => {
  it('PromptKey is a closed union covering all emit literals', () => {
    expectTypeOf<'ui.harvestFeed'>().toExtend<PromptKey>()
    expectTypeOf<'ui.interactionPlow'>().toExtend<PromptKey>()
    expectTypeOf<'ui.interactionPlowSelect'>().toExtend<PromptKey>()
    expectTypeOf<'ui.interactionDairyCrierChoice'>().toExtend<PromptKey>()
    expectTypeOf<'ui.cards.A123_FrameBuilder'>().toExtend<PromptKey>()
  })

  it('PromptKey rejects arbitrary strings', () => {
    expectTypeOf<'random.string'>().not.toExtend<PromptKey>()
  })

  it('PromptParams maps harvestFeed to remaining/foodUsed', () => {
    expectTypeOf<PromptParams<'ui.harvestFeed'>>().toEqualTypeOf<{ remaining: number; foodUsed: number }>()
  })

  it('PromptParams maps -Select variants to same shape as bare farmType', () => {
    type SowBare = PromptParams<'ui.interactionSow'>
    type SowSelect = PromptParams<'ui.interactionSowSelect'>
    expectTypeOf<SowBare>().toEqualTypeOf<SowSelect>()
  })

  it('PromptParams maps confirmNextPlayer to empty record', () => {
    expectTypeOf<PromptParams<'ui.confirmNextPlayer'>>().toEqualTypeOf<Record<string, never>>()
  })

  it('PromptParams maps card-specific keys to Record<string, unknown> escape hatch', () => {
    expectTypeOf<PromptParams<'ui.cards.A123_FrameBuilder'>>().toEqualTypeOf<Record<string, unknown>>()
  })
})
