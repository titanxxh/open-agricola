import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../../game/types'
import { setCardInfoboxAction } from '../set-card-infobox'
import { clearCardInfoboxAction } from '../clear-card-infobox'
import { mkActionSpace } from '../../../cards/__tests__/fixtures'
import type { ActionExecutionContext } from '../../../game/types'

const createState = (): GameState => ({
  round: 1,
  currentPlayerIndex: 0,
  players: [],
  actionSpaces: [],
  log: [],
  roundStartSnapshot: null,
  roundActionOrder: [],
  gameSeed: 1,
  availableMajorImprovements: [],
  futureMeeples: [],
  pendingFutureMeeples: [],
  gameOver: false,
  workPhaseObtainedResources: {},
})

const createPlayer = (): PlayerState => ({
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
  occupationPlayed: [],houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [],
  cardStates: {},
})

describe('card infobox actions', () => {
  it('sets infobox text on the source card', () => {
    const state = createState()
    const player = createPlayer()

    const result = setCardInfoboxAction.execute({
      state,
      player,
      space: mkActionSpace({ id: 'noop' }),
      sourceCard: 'A17_ReclamationPlow',
      params: { text: '✓' } as unknown as ActionExecutionContext,
    })

    expect(result.type).toBe('ok')
    expect(player.cardStates?.A17_ReclamationPlow?.infobox).toBe('✓')
  })

  it('clears infobox text from the source card', () => {
    const state = createState()
    const player = createPlayer()
    player.cardStates = {
      A17_ReclamationPlow: {
        infobox: '✓',
      },
    }

    const result = clearCardInfoboxAction.execute({
      state,
      player,
      space: mkActionSpace({ id: 'noop' }),
      sourceCard: 'A17_ReclamationPlow',
    })

    expect(result.type).toBe('ok')
    expect(player.cardStates?.A17_ReclamationPlow?.infobox).toBeUndefined()
  })
})
