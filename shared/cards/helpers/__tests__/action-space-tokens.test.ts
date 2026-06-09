import { describe, expect, it } from 'vitest'
import type { PlayerState } from '../../../contract/types'
import {
  actionSpaceTokenChoiceFlow,
  consumeActionSpaceToken,
  resolveActionSpaceTokenChoice,
} from '../action-space-tokens'
import type { ActionChoiceOption, ActionFlow } from '../../../contract/types'

const player = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: {
    wood: 0,
    clay: 0,
    reed: 0,
    stone: 0,
    food: 0,
    grain: 0,
    vegetable: 0,
    sheep: 0,
    boar: 0,
    cattle: 0,
    begging: 0,
  },
  rooms: 2,
  houseType: 'wood',
  fields: [],
  fences: 0,
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [],
  cardStates: {},
  ...overrides,
})

describe('action-space token helpers', () => {
  it('builds bounded token choices and stores the accepted spaces', () => {
    const owner = player()
    const config = {
      cardId: 'TestCard',
      spaces: ['grain-seeds', 'farmland', 'day-laborer'],
      max: 2,
      choicePrefix: 'test:',
      choiceLabelKey: 'cards.TestCard.choice',
      promptKey: 'cards.TestCard.name',
    }

    const flow = actionSpaceTokenChoiceFlow(config)

    expect(flow?.type).toBe('leaf')
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('emit-choice')
    const options = leaf.params?.options as ActionChoiceOption[]
    expect(options.find((option) => option.value === 'test:')?.labelKey).toBe('ui.interactionOptionalSkip')
    expect(options.some((option) => option.value === 'test:grain-seeds,farmland')).toBe(true)
    expect(options.some((option) => option.value === 'test:grain-seeds,farmland,day-laborer')).toBe(false)
    expect(leaf.params?.promptKey).toBe('cards.TestCard.name')

    const accepted = resolveActionSpaceTokenChoice(owner, 'test:grain-seeds,farmland', config)

    expect(accepted).toBe(true)
    expect(owner.cardStates?.TestCard?.extraData?.reservedActionSpaces).toEqual([
      'grain-seeds',
      'farmland',
    ])
  })

  it('returns an owner-targeted flow that consumes one reserved token before reward', () => {
    const owner = player({
      id: 'owner',
      cardStates: {
        TestCard: {
          extraData: {
            reservedActionSpaces: ['grain-seeds', 'farmland'],
          },
        },
      },
    })

    const result = consumeActionSpaceToken({
      cardId: 'TestCard',
      owner,
      ownerPlayerId: 'owner',
      spaceId: 'grain-seeds',
      reward: {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: 'TestCard',
        actionContext: { targetPlayerId: 'owner' },
        params: { kind: 'build-stable-on-first-empty-tile' },
      },
    })

    expect(owner.cardStates?.TestCard?.extraData?.reservedActionSpaces).toEqual([
      'grain-seeds',
      'farmland',
    ])
    expect(result).toMatchObject({
      sourceCard: 'TestCard',
      flow: {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: 'TestCard',
            actionContext: { targetPlayerId: 'owner' },
            params: {
              kind: 'set-extra-data',
              key: 'reservedActionSpaces',
              value: ['farmland'],
            },
          },
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: 'TestCard',
            actionContext: { targetPlayerId: 'owner' },
            params: { kind: 'build-stable-on-first-empty-tile' },
          },
        ],
      },
    })
  })
})
