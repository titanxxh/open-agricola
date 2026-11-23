import { describe, expect, it } from 'vitest'
import { getAllAdHocActions } from '../../actions/helpers/ad-hoc-action-registry'
import { ALL_CARD_IMPLS } from '../../cards/register-all'
import { cardActionSourceCardId } from '../card-action-id'

describe('card action ids', () => {
  it('resolves every registered card action to the card that owns it', () => {
    const ids = getAllAdHocActions().map(action => action.id)
    expect(ids).toEqual(expect.arrayContaining(['card_CFL039_Cosmographer_place', 'card_CFL027_TrappistBeer_skip']))
    const unresolved = ids.filter(id => {
      const cardId = cardActionSourceCardId(id)
      return !cardId || !Object.hasOwn(ALL_CARD_IMPLS, cardId)
    })
    expect(unresolved).toEqual([])
  })

  it('leaves other action ids alone', () => {
    expect(cardActionSourceCardId('forest')).toBeUndefined()
    expect(cardActionSourceCardId('__subflow:top-level')).toBeUndefined()
    expect(cardActionSourceCardId('card_CFL039_Cosmographer_place')).toBe('CFL039_Cosmographer')
  })
})
