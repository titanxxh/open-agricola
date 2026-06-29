import { describe, expect, it } from 'vitest'
import type { ActionExecutionContext, ActionSpace, GameState, PlayerState } from '../../../contract/types'
import { improvementAction } from '../improvement'

import '../../../cards/A/A053_Claypipe'

const makePlayer = (): PlayerState =>
  ({
    id: 'p1',
    name: 'P1',
    resources: {
      wood: 0,
      clay: 3,
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
    improvements: [],
    minorPlayed: [],
    minorHand: ['A053_Claypipe'],
    occupationHand: [],
    occupationPlayed: [],
    activeModifiers: [],
    cardStates: {},
    fields: [],
    pastures: [],
    roomTiles: [],
    stableTiles: [],
    rooms: 2,
    houseType: 'wood',
  } as unknown as PlayerState)

const makeState = (player: PlayerState): GameState =>
  ({
    players: [player],
    currentPlayerIndex: 0,
    round: 1,
    actionSpaces: [],
    availableMajorImprovements: ['Major_Fireplace1'],
    log: [],
  } as unknown as GameState)

describe('improvement choice values', () => {
  it('uses bare card ids for major and minor improvement choices', () => {
    const player = makePlayer()
    const ctx: ActionExecutionContext = {
      state: makeState(player),
      player,
      space: { id: 'major-improvement' } as ActionSpace,
      actionContext: { types: ['major', 'minor'] },
    }

    const result = improvementAction.execute(ctx)

    expect(result.type).toBe('request')
    if (result.type !== 'request') return
    expect(result.request.options.map((option) => option.value)).toEqual([
      'Major_Fireplace1',
      'A053_Claypipe',
    ])
  })
})
