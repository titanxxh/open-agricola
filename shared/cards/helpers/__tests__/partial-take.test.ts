import { describe, expect, it } from 'vitest'
import { collectTakeAmount, createPartialTakeFromSpaceLeaf } from '../partial-take'
import { mkActionSpace } from '../../__tests__/fixtures'

describe('createPartialTakeFromSpaceLeaf', () => {
  it('creates a collect leaf with partial-take actionContext and display metadata', () => {
    expect(createPartialTakeFromSpaceLeaf({
      sourceCard: 'B081_Handcart',
      spaceId: 'forest',
      spaceName: 'actions.forest.name',
      resource: 'wood',
      amount: 1,
    })).toEqual({
      type: 'leaf',
      actionId: 'collect',
      sourceCard: 'B081_Handcart',
      actionContext: { spaceId: 'forest', resource: 'wood', amount: 1 },
      choiceLabelKey: 'ui.interactionTakeFromSpace',
      choiceLabelParams: {
        resource: 'wood',
        spaceId: 'forest',
        spaceName: 'actions.forest.name',
      },
    })
  })

  it('can attach a resource preview for card effects that need it', () => {
    expect(createPartialTakeFromSpaceLeaf({
      sourceCard: 'E005_NightLoot',
      spaceId: 'reed-bank',
      resource: 'reed',
      includeEffectPreview: true,
    }).effectPreview).toEqual({
      kind: 'resourceExchange',
      resourcesGained: { reed: 1 },
    })
  })
})

describe('collectTakeAmount', () => {
  const forest = mkActionSpace({ id: 'forest', resources: { wood: 6, clay: 1 } })
  const reedBank = mkActionSpace({ id: 'reed-bank', resources: { reed: 3 } })
  const state = { actionSpaces: [forest, reedBank] }

  it('reads everything on the used space for a whole collect', () => {
    expect(collectTakeAmount({ state, space: forest }, 'wood')).toBe(6)
    expect(collectTakeAmount({ state, space: forest }, 'reed')).toBe(0)
  })

  it('reads only the amount of a partial take', () => {
    const actionContext = { spaceId: 'forest', resource: 'wood', amount: 3 }
    expect(collectTakeAmount({ state, space: forest, actionContext }, 'wood')).toBe(3)
    expect(collectTakeAmount({ state, space: forest, actionContext }, 'clay')).toBe(0)
  })

  it('reads the hinted space for resource-type takes', () => {
    const actionContext = { spaceId: 'reed-bank', resourceTypes: ['reed'] }
    expect(collectTakeAmount({ state, space: forest, actionContext }, 'reed')).toBe(3)
    expect(collectTakeAmount({ state, space: forest, actionContext }, 'wood')).toBe(0)
  })
})
