import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { collectComputeExchanges } from '../../../cards/card-listeners'
import { getExchangesInWindow } from '../exchange'
import type { GameState, PlayerState } from '../../../contract/types'
import type { CardExchange } from '../../../contract/cards'
import type { CardListenerRegistration } from '../../../cards/card-listeners'
import { CardRegistry } from '../../../cards/registry'
import {
  setActiveCardRegistry,
  getActiveCardRegistry,
} from '../../../cards/active-registry'

const makeMinimalPlayer = (id = 'p1'): PlayerState =>
  ({
    id,
    name: id,
    resources: {
      wood: 0,
      clay: 0,
      reed: 0,
      stone: 0,
      grain: 0,
      vegetable: 0,
      sheep: 0,
      boar: 0,
      cattle: 0,
      food: 0,
      begging: 0,
    },
    improvements: [],
    minorPlayed: [],
    occupationPlayed: [],
    minorHand: [],
    occupationHand: [],
    cardStates: {},
    fields: [],
    pastures: [],
    fenceSegments: [],
    rooms: 2,
    roomTiles: [],
    stableTiles: [],
    fences: 0,
    houseType: 'wood',
    houseAnimalType: null,
    houseAnimalCount: 0,
    stableAnimals: {},
    majorEffects: { wellRounds: 0 },
    startPlayer: false,
    activeModifiers: [],
  }) as unknown as PlayerState

const makeMinimalState = (player: PlayerState): GameState =>
  ({
    round: 1,
    phase: 'work',
    players: [player],
    activePlayerId: player.id,
    actionSpaces: [],
    log: [],
  }) as unknown as GameState

describe('collectComputeExchanges', () => {
  let prev: ReturnType<typeof getActiveCardRegistry>

  beforeEach(() => {
    prev = getActiveCardRegistry()
    const reg = new CardRegistry()
    const listener: CardListenerRegistration = {
      id: 'fake-card-compute-exchanges-listener',
      phases: ['computeExchanges'],
      handler: (ctx) => {
        const window = (ctx.extraData as { window?: string } | undefined)?.window
        if (window !== 'harvest') return
        return {
          extraExchanges: [
            {
              from: { vegetable: 1 },
              to: { food: 4 },
              triggers: ['harvest'],
              sourceId: 'FAKE_CARD::derived-1',
            } as CardExchange,
          ],
        }
      },
    }
    reg.registerListener(listener)
    setActiveCardRegistry(reg)
  })

  afterEach(() => {
    setActiveCardRegistry(prev)
  })

  it('returns trades from computeExchanges listeners when window matches', () => {
    const player = makeMinimalPlayer()
    const state = makeMinimalState(player)
    const out = collectComputeExchanges(state, player, 'harvest')
    expect(out).toHaveLength(1)
    expect(out[0].from).toEqual({ vegetable: 1 })
    expect(out[0].to).toEqual({ food: 4 })
    expect(out[0].sourceId).toBe('FAKE_CARD::derived-1')
  })

  it('returns empty when window does not match listener filter', () => {
    const player = makeMinimalPlayer()
    const state = makeMinimalState(player)
    const out = collectComputeExchanges(state, player, 'anytime')
    expect(out).toHaveLength(0)
  })
})

describe('getExchangesInWindow with computeExchanges listener', () => {
  let prev: ReturnType<typeof getActiveCardRegistry>

  beforeEach(() => {
    prev = getActiveCardRegistry()
    const reg = new CardRegistry()
    const listener: CardListenerRegistration = {
      id: 'fake-card-compute-exchanges-listener-2',
      phases: ['computeExchanges'],
      handler: (ctx) => {
        const window = (ctx.extraData as { window?: string } | undefined)?.window
        if (window !== 'harvest') return
        return {
          extraExchanges: [
            {
              from: { vegetable: 1 },
              to: { food: 4 },
              triggers: ['harvest'],
              sourceId: 'FAKE_CARD::derived-1',
            } as CardExchange,
          ],
        }
      },
    }
    reg.registerListener(listener)
    setActiveCardRegistry(reg)
  })

  afterEach(() => {
    setActiveCardRegistry(prev)
  })

  it('appends listener-injected trades when state is provided', () => {
    const player = makeMinimalPlayer()
    const state = makeMinimalState(player)
    const out = getExchangesInWindow(player, 'harvest', state)
    expect(out).toHaveLength(1)
    expect(out[0].sourceId).toBe('FAKE_CARD::derived-1')
  })

  it('does not invoke listener when state is omitted', () => {
    const player = makeMinimalPlayer()
    const out = getExchangesInWindow(player, 'harvest')
    expect(out).toHaveLength(0)
  })
})
