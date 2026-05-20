import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActionSpace, GameState, PlayerState } from '../../contract/types'
import type { DraftGameEvent } from '../../contract/events'
import type { CardListenerContext } from '../card-listeners'

const CARD_ID = 'C52_HuntsmansHat'

const boarMoved = (
  boar: number,
  playerId = 'p1',
  spaceId = 'pig-market',
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { boar },
  from: { kind: 'actionSpace', spaceId },
  to: { kind: 'player', playerId },
  reason: 'collect',
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
  cardStates: {},
})

const createSpace = (id: string): ActionSpace => ({
  id,
  nameKey: `actions.${id}.name`,
  descriptionKey: `actions.${id}.description`,
  roundAvailable: 1,
  gainPerRound: {},
  players: [2, 3, 4],
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
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
  takenBy: [],
})

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

describe('C52_HuntsmansHat', () => {
  let cardApi: typeof import('../card-listeners')

  beforeEach(async () => {
    vi.resetModules()
    cardApi = await import('../card-listeners')
    // After vi.resetModules(), the freshly-imported `card-listeners` reads
    // from a freshly-imported `active-registry`. Publish + register via the
    // same fresh instance so reads line up.
    const registryMod = await import('../registry')
    const activeMod = await import('../active-registry')
    activeMod.setActiveCardRegistry(new registryMod.CardRegistry())
    // Post PR-2 _impl migration: card files no longer self-register at import
    // time. Pull the `_impl` export and push its listeners into the active
    // registry so `getRegisteredCardListeners()` returns them.
    const mod = await import('../C/C52_HuntsmansHat')
    const impl = mod.C52_HuntsmansHat_impl
    for (const listener of impl?.listeners ?? []) {
      activeMod.requireActiveCardRegistry('C52_HuntsmansHat').registerListener(listener)
    }
  })

  // BGA C52 listens to **any** Gain event with `fromActionSpace`. We mirror
  // that with a `phase: 'after'` listener on { gain | collect | receive } and
  // gate on action-space resource.moved boar events.

  it('adds food equal to boar gained from pig-market collect', () => {
    const listener = cardApi.getRegisteredCardListeners().find(
      (entry) => entry.id === 'C52-huntsmans-hat-after-boar-gain',
    )
    const player = createPlayer()
    const event = boarMoved(2, player.id, 'pig-market')
    const context = {
      state: createState(),
      player,
      space: { ...createSpace('pig-market'), resources: { ...createSpace('pig-market').resources, boar: 2 } },
      actionId: 'collect',
      phase: 'after',
      result: { type: 'ok' },
      transactionEvents: [event],
      actionEvents: [event],
    }
    const result = listener?.handler(context as unknown as CardListenerContext)
    expect(result?.flow).toBeDefined()
    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.actionId).toBe('gain')
      expect(result.flow.params).toEqual({ food: 2 })
    }
    expect(result?.sourceCard).toBe(CARD_ID)
  })

  it('also fires for non-pig-market spaces when a boar is gained (BGA generic behavior)', () => {
    const listener = cardApi.getRegisteredCardListeners().find(
      (entry) => entry.id === 'C52-huntsmans-hat-after-boar-gain',
    )
    const player = createPlayer()
    const event = boarMoved(1, player.id, 'day-laborer')
    const context = {
      state: createState(),
      player,
      space: createSpace('day-laborer'),
      actionId: 'gain',
      phase: 'after',
      result: { type: 'ok' },
      transactionEvents: [event],
      actionEvents: [event],
    }
    const result = listener?.handler(context as unknown as CardListenerContext)
    expect(result?.flow).toBeDefined()
    if (result?.flow?.type === 'leaf') {
      expect(result.flow.params).toEqual({ food: 1 })
    }
  })

  it('does nothing when no boar is gained', () => {
    const listener = cardApi.getRegisteredCardListeners().find(
      (entry) => entry.id === 'C52-huntsmans-hat-after-boar-gain',
    )
    const player = createPlayer()
    const context = {
      state: createState(),
      player,
      space: createSpace('day-laborer'),
      actionId: 'collect',
      phase: 'after',
      result: { type: 'ok' },
      transactionEvents: [],
      actionEvents: [],
    }
    const result = listener?.handler(context as unknown as CardListenerContext)
    expect(result).toBeUndefined()
  })
})
