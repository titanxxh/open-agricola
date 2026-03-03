import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearCardListeners,
  getRegisteredCardListeners,
  registerCardListener,
  type CardListenerRegistration,
} from '../card-listeners'
import type { GameState, PlayerState, ActionSpace, ActionChoiceOption } from '../../game/types'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'

const OVEN_IMPROVEMENTS = [
  'Major_Fireplace1',
  'Major_Fireplace2', 
  'Major_CookingHearth1',
  'Major_CookingHearth2',
  'Major_ClayOven',
  'Major_StoneOven',
  'E63_IronOven',
  'E64_SimpleOven',
  'D59_EarthOven',
]

const CARD_ID = 'C75_Firewood'

const generateFirewoodOptions = (woodOnCard: number): ActionChoiceOption[] => {
  const maxWood = Math.min(4, woodOnCard)
  if (maxWood <= 0) return []

  const options: ActionChoiceOption[] = []
  options.push({ value: '0', labelKey: 'ui.interactionFirewoodExchangeSkip' })
  for (let i = 1; i <= maxWood; i++) {
    options.push({
      value: String(i),
      labelKey: 'ui.interactionFirewoodExchangeCount',
      labelParams: { count: i },
    })
  }
  return options
}

const storePendingChoice = (
  player: PlayerState,
  options: ActionChoiceOption[],
  promptKey: string,
): void => {
  if (!player.cardStates) {
    player.cardStates = {}
  }
  if (!player.cardStates.__pendingChoice__) {
    player.cardStates.__pendingChoice__ = { counters: {} }
  }
  if (!player.cardStates.__pendingChoice__.extraData) {
    player.cardStates.__pendingChoice__.extraData = {}
  }

  player.cardStates.__pendingChoice__.extraData = {
    options,
    promptKey,
    targetCardId: CARD_ID,
  }
}

const firewoodAfterBuildListener: CardListenerRegistration = {
  id: 'C75-firewood-after-build',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['improvement-any'],
  handler: (context): ActionHookResult | void => {
    const { player, choice } = context

    const builtCardId = choice ? choice.replace(/^major:/, '').replace(/^minor:/, '') : undefined
    if (!builtCardId || !OVEN_IMPROVEMENTS.includes(builtCardId)) return

    const woodOnCard = player.cardStates?.[CARD_ID]?.counters?.['wood'] ?? 0
    if (woodOnCard <= 0) return

    const options = generateFirewoodOptions(woodOnCard)
    if (options.length === 0) return

    storePendingChoice(player, options, 'ui.interactionFirewoodExchange')

    return {
      flow: {
        type: 'leaf',
        actionId: 'card-choice',
      },
    }
  },
}

const firewoodProcessChoiceListener: CardListenerRegistration = {
  id: 'C75-firewood-process-choice',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['card-choice'],
  handler: (context): ActionHookResult | void => {
    const { player } = context

    const pendingChoice = player.cardStates?.__pendingChoice__?.extraData as {
      options?: ActionChoiceOption[]
      promptKey?: string
      targetCardId?: string
      choiceResult?: string
      choiceTimestamp?: number
    } | undefined

    if (pendingChoice?.targetCardId !== CARD_ID) return
    if (pendingChoice?.choiceResult === undefined) return

    const choice = pendingChoice.choiceResult
    const count = Number(choice)

    if (player.cardStates?.__pendingChoice__?.extraData) {
      delete player.cardStates.__pendingChoice__.extraData
    }

    if (Number.isFinite(count) && count > 0) {
      const woodOnCard = player.cardStates?.[CARD_ID]?.counters?.['wood'] ?? 0
      const actualCount = Math.min(count, woodOnCard, 4)

      if (actualCount > 0) {
        if (!player.cardStates) {
          player.cardStates = {}
        }
        if (!player.cardStates[CARD_ID]) {
          player.cardStates[CARD_ID] = { counters: {} }
        }
        if (!player.cardStates[CARD_ID].counters) {
          player.cardStates[CARD_ID].counters = {}
        }

        player.cardStates[CARD_ID].counters!['wood'] = woodOnCard - actualCount
        player.resources.wood += actualCount

        return {
          logKey: 'log.cardEffectGain',
          logParams: { gain: { wood: actualCount }, cardId: CARD_ID },
        }
      }
    }
  },
}

const createMockContext = (
  overrides: Partial<{
    state: Partial<GameState>
    player: Partial<PlayerState>
    space: Partial<ActionSpace>
    actionId: string
    phase: string
    choice: string
  }> = {},
) => {
  const defaultState: GameState = {
    round: 1,
    currentPlayerIndex: 0,
    players: [],
    actionSpaces: [],
    log: [],
    roundStartSnapshot: null,
    roundActionOrder: [],
    gameSeed: 0,
    availableMajorImprovements: [],
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
    workPhaseObtainedResources: {},
  }

  const defaultPlayer: PlayerState = {
    id: 'player1',
    name: 'Player 1',
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
    familySize: 2,
    workersAvailable: 1,
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
    occupationPlayed: [],
    playedCards: [],
    houseAnimalType: null,
    houseAnimalCount: 0,
    stableAnimals: {},
    newbornCount: 0,
    pastures: [],
    fenceSegments: [],
    majorEffects: { wellRounds: 0 },
    startPlayer: false,
    activeModifiers: [],
    cardStates: {
      [CARD_ID]: {
        counters: { wood: 1 },
      },
    },
  }

  const defaultSpace: ActionSpace = {
    id: 'major-improvement',
    nameKey: 'actions.major-improvement.name',
    descriptionKey: 'actions.major-improvement.description',
    roundAvailable: 1,
    gainPerRound: {},
    players: [2, 3, 4],
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: null,
  }

  return {
    state: { ...defaultState, ...overrides.state } as GameState,
    player: { ...defaultPlayer, ...overrides.player } as PlayerState,
    space: { ...defaultSpace, ...overrides.space } as ActionSpace,
    actionId: overrides.actionId ?? 'improvement-any',
    phase: overrides.phase ?? 'after',
    choice: overrides.choice,
  }
}

describe('C75_Firewood', () => {
  beforeEach(() => {
    clearCardListeners()
    registerCardListener(firewoodAfterBuildListener)
    registerCardListener(firewoodProcessChoiceListener)
  })

  describe('after-build listener', () => {
    it('should trigger when building an oven with wood on card', () => {
      const listeners = getRegisteredCardListeners()
      const listener = listeners.find(l => l.id === 'C75-firewood-after-build')

      const context = createMockContext({
        actionId: 'improvement-any',
        phase: 'after',
        choice: 'major:Major_Fireplace1',
        player: {
          minorPlayed: [CARD_ID],
          cardStates: {
            [CARD_ID]: { counters: { wood: 1 } },
          },
        },
      })

      const result = listener?.handler(context as any)
      expect(result).toBeDefined()
      expect(result?.flow).toBeDefined()
      expect(result?.flow?.type).toBe('leaf')
      expect(result?.flow?.actionId).toBe('card-choice')
    })

    it('should not trigger when building non-oven improvement', () => {
      const listeners = getRegisteredCardListeners()
      const listener = listeners.find(l => l.id === 'C75-firewood-after-build')

      const context = createMockContext({
        actionId: 'improvement-any',
        phase: 'after',
        choice: 'major:Major_Well',
        player: {
          minorPlayed: [CARD_ID],
          cardStates: {
            [CARD_ID]: { counters: { wood: 1 } },
          },
        },
      })

      const result = listener?.handler(context as any)
      expect(result).toBeUndefined()
    })

    it('should not trigger when no wood on card', () => {
      const listeners = getRegisteredCardListeners()
      const listener = listeners.find(l => l.id === 'C75-firewood-after-build')

      const context = createMockContext({
        actionId: 'improvement-any',
        phase: 'after',
        choice: 'major:Major_Fireplace1',
        player: {
          minorPlayed: [CARD_ID],
          cardStates: {
            [CARD_ID]: { counters: { wood: 0 } },
          },
        },
      })

      const result = listener?.handler(context as any)
      expect(result).toBeUndefined()
    })

    it('should store correct options in __pendingChoice__', () => {
      const listeners = getRegisteredCardListeners()
      const listener = listeners.find(l => l.id === 'C75-firewood-after-build')

      const player = {
        minorPlayed: [CARD_ID],
        cardStates: {
          [CARD_ID]: { counters: { wood: 2 } },
        },
      } as unknown as PlayerState

      const context = createMockContext({
        actionId: 'improvement-any',
        phase: 'after',
        choice: 'major:Major_Fireplace1',
        player,
      })

      listener?.handler(context as any)

      expect(player.cardStates?.__pendingChoice__?.extraData).toBeDefined()
      const pendingData = player.cardStates?.__pendingChoice__?.extraData as {
        options?: ActionChoiceOption[]
        targetCardId?: string
      }
      expect(pendingData?.targetCardId).toBe(CARD_ID)
      expect(pendingData?.options?.length).toBe(3)
      expect(pendingData?.options?.[0]?.value).toBe('0')
      expect(pendingData?.options?.[1]?.value).toBe('1')
      expect(pendingData?.options?.[2]?.value).toBe('2')
    })
  })

  describe('process-choice listener', () => {
    it('should process choice and move wood to supply', () => {
      const listeners = getRegisteredCardListeners()
      const listener = listeners.find(l => l.id === 'C75-firewood-process-choice')

      const player = {
        minorPlayed: [CARD_ID],
        cardStates: {
          [CARD_ID]: { counters: { wood: 2 } },
          __pendingChoice__: {
            extraData: {
              targetCardId: CARD_ID,
              choiceResult: '1',
            },
          },
        },
        resources: { wood: 0 },
      } as unknown as PlayerState

      const context = createMockContext({
        actionId: 'card-choice',
        phase: 'after',
        player,
      })

      const result = listener?.handler(context as any)

      expect(result).toBeDefined()
      expect(result?.logKey).toBe('log.cardEffectGain')
      expect(result?.logParams?.gain).toEqual({ wood: 1 })
      expect(player.cardStates?.[CARD_ID]?.counters?.['wood']).toBe(1)
      expect(player.resources?.wood).toBe(1)
    })

    it('should clear pending choice data after processing', () => {
      const listeners = getRegisteredCardListeners()
      const listener = listeners.find(l => l.id === 'C75-firewood-process-choice')

      const player = {
        minorPlayed: [CARD_ID],
        cardStates: {
          [CARD_ID]: { counters: { wood: 2 } },
          __pendingChoice__: {
            extraData: {
              targetCardId: CARD_ID,
              choiceResult: '1',
            },
          },
        },
        resources: { wood: 0 },
      } as unknown as PlayerState

      const context = createMockContext({
        actionId: 'card-choice',
        phase: 'after',
        player,
      })

      listener?.handler(context as any)

      expect(player.cardStates?.__pendingChoice__?.extraData).toBeUndefined()
    })

    it('should skip processing when choice is 0', () => {
      const listeners = getRegisteredCardListeners()
      const listener = listeners.find(l => l.id === 'C75-firewood-process-choice')

      const player = {
        minorPlayed: [CARD_ID],
        cardStates: {
          [CARD_ID]: { counters: { wood: 2 } },
          __pendingChoice__: {
            extraData: {
              targetCardId: CARD_ID,
              choiceResult: '0',
            },
          },
        },
        resources: { wood: 0 },
      } as unknown as PlayerState

      const context = createMockContext({
        actionId: 'card-choice',
        phase: 'after',
        player,
      })

      const result = listener?.handler(context as any)

      expect(result).toBeUndefined()
      expect(player.cardStates?.[CARD_ID]?.counters?.['wood']).toBe(2)
      expect(player.resources?.wood).toBe(0)
    })

    it('should not process when targetCardId does not match', () => {
      const listeners = getRegisteredCardListeners()
      const listener = listeners.find(l => l.id === 'C75-firewood-process-choice')

      const player = {
        minorPlayed: [CARD_ID],
        cardStates: {
          [CARD_ID]: { counters: { wood: 2 } },
          __pendingChoice__: {
            extraData: {
              targetCardId: 'SomeOtherCard',
              choiceResult: '1',
            },
          },
        },
        resources: { wood: 0 },
      } as unknown as PlayerState

      const context = createMockContext({
        actionId: 'card-choice',
        phase: 'after',
        player,
      })

      const result = listener?.handler(context as any)

      expect(result).toBeUndefined()
      expect(player.cardStates?.[CARD_ID]?.counters?.['wood']).toBe(2)
    })
  })
})
