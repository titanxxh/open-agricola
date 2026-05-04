import { describe, it, expectTypeOf } from 'vitest'
import type { PromptKey, PromptParams } from '../prompt-keys'

describe('PromptKey + PromptParams', () => {
  it('PromptKey is a closed union', () => {
    expectTypeOf<'ui.harvestFeed'>().toMatchTypeOf<PromptKey>()
    expectTypeOf<'ui.interactionPlow'>().toMatchTypeOf<PromptKey>()
    expectTypeOf<'ui.cards.A123_FrameBuilder'>().toMatchTypeOf<PromptKey>()
  })

  it('PromptParams maps harvestFeed to remaining/foodUsed', () => {
    expectTypeOf<PromptParams<'ui.harvestFeed'>>().toEqualTypeOf<{ remaining: number; foodUsed: number }>()
  })

  it('PromptParams maps interactionPlow to empty record', () => {
    expectTypeOf<PromptParams<'ui.interactionPlow'>>().toEqualTypeOf<Record<string, never>>()
  })

  it('PromptParams maps card-specific keys to Record<string, unknown> escape hatch', () => {
    expectTypeOf<PromptParams<'ui.cards.A123_FrameBuilder'>>().toEqualTypeOf<Record<string, unknown>>()
  })
})
