import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners } from '../card-listeners'
import { getCardEffect } from '../card-effects'
import type { GameState, PlayerState, ActionSpace } from '../../contract/types'

// Import card to register its effects/listeners
import '../C/C075_Firewood'
import type { ActionFlow } from '../../contract/types'
import type { CardListenerContext } from '../card-listeners'

const CARD_ID = 'C075_Firewood'

const createPlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'player1',
  name: 'Player 1',
  color: 'red',
  resources: {
    wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
    grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
  },
  rooms: 2,
  houseType: 'wood',
  fields: [],
  fences: 0,
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [CARD_ID],
  occupationHand: [],
  occupationPlayed: [],houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [],
  cardStates: {
    [CARD_ID]: { counters: { wood: 0 } },
  },
  ...overrides,
})

const createState = (player: PlayerState): GameState => ({
  round: 1,
  currentPlayerIndex: 0,
  players: [player],
  actionSpaces: [],
  log: [],
  roundActionOrder: [],
  gameSeed: 0,
  availableMajorImprovements: [],
  futureMeeples: [],
  pendingFutureMeeples: [],
  gameOver: false,
  workPhaseObtainedResources: {},
  roundPhase: 'work',
}) as GameState

describe('C075_Firewood', () => {
  describe('onReturnHome effect (accumulate wood)', () => {
    it('should add 1 wood to card each round', () => {
      const effect = getCardEffect(CARD_ID)!
      const player = createPlayer()
      const state = createState(player)

      effect.onReturnHome!(state, player)
      expect(player.cardStates[CARD_ID]?.counters?.wood).toBe(1)

      effect.onReturnHome!(state, player)
      expect(player.cardStates[CARD_ID]?.counters?.wood).toBe(2)
    })

  })

  describe('after-build listener (xor flow)', () => {
    it('should return xor flow with take-from-card options when building an oven with wood on card', () => {
      const listeners = getRegisteredCardListeners()
      const listener = listeners.find(l => l.id === 'C75-firewood-after-build')!

      const player = createPlayer({
        cardStates: { [CARD_ID]: { counters: { wood: 2 } } },
      })

      const result = listener.handler({
        state: createState(player),
        player,
        space: {} as ActionSpace,
        actionId: 'improvement',
        phase: 'after',
        choice: 'major:Major_Fireplace1',
      } as unknown as CardListenerContext)

      expect(result).toBeDefined()
      expect(result?.flow?.type).toBe('xor')
      expect(result?.flow?.promptKey).toBe('ui.interactionFirewoodExchange')
      const children = (result?.flow as Extract<ActionFlow, { type: 'seq' }>)?.children
      expect(children).toHaveLength(2)
      expect(children[0].actionId).toBe('take-from-card')
      expect(children[0].params).toEqual({ wood: 1 })
      expect(children[1].actionId).toBe('take-from-card')
      expect(children[1].params).toEqual({ wood: 2 })
    })

    it('should cap options at 4 wood', () => {
      const listeners = getRegisteredCardListeners()
      const listener = listeners.find(l => l.id === 'C75-firewood-after-build')!

      const player = createPlayer({
        cardStates: { [CARD_ID]: { counters: { wood: 6 } } },
      })

      const result = listener.handler({
        state: createState(player),
        player,
        space: {} as ActionSpace,
        actionId: 'improvement',
        phase: 'after',
        choice: 'major:Major_Fireplace1',
      } as unknown as CardListenerContext)

      const children = (result?.flow as Extract<ActionFlow, { type: 'seq' }>)?.children
      expect(children).toHaveLength(4)
      expect(children[3].params).toEqual({ wood: 4 })
    })

    it('should not trigger when building non-oven improvement', () => {
      const listeners = getRegisteredCardListeners()
      const listener = listeners.find(l => l.id === 'C75-firewood-after-build')!

      const player = createPlayer({
        cardStates: { [CARD_ID]: { counters: { wood: 2 } } },
      })

      const result = listener.handler({
        state: createState(player),
        player,
        space: {} as ActionSpace,
        actionId: 'improvement',
        phase: 'after',
        choice: 'major:Major_Well',
      } as unknown as CardListenerContext)

      expect(result).toBeUndefined()
    })

    it('should not trigger when no wood on card', () => {
      const listeners = getRegisteredCardListeners()
      const listener = listeners.find(l => l.id === 'C75-firewood-after-build')!

      const player = createPlayer({
        cardStates: { [CARD_ID]: { counters: { wood: 0 } } },
      })

      const result = listener.handler({
        state: createState(player),
        player,
        space: {} as ActionSpace,
        actionId: 'improvement',
        phase: 'after',
        choice: 'major:Major_Fireplace1',
      } as unknown as CardListenerContext)

      expect(result).toBeUndefined()
    })
  })
})
