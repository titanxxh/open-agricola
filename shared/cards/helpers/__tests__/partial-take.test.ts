import { describe, expect, it } from 'vitest'
import { createPartialTakeFromSpaceLeaf } from '../partial-take'

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
