import { describe, expect, it } from 'vitest'
import { cardEffectHooks, flowCardEffectHooks } from '../card-effects'

describe('card effect hook contract', () => {
  it('keeps onBeforePlayerTurn out of generic flow hooks', () => {
    expect(cardEffectHooks).toContain('onBeforePlayerTurn')
    expect(flowCardEffectHooks).not.toContain('onBeforePlayerTurn')
  })
})
