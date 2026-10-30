import { CardRegistry as TestCardRegistry } from '../../shared/cards/registry'
import { withActiveRegistry } from '../../shared/cards/active-registry'
import { createOfficialCardRegistry } from '../../shared/cards/__tests__/card-environment'
import { describe, expect, it, afterEach } from 'vitest'
import { getCardEffect } from '../../shared/cards/card-effects'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import { computeAnimalZones } from '../../shared/domain/animal-zones'
import type { GameState, PlayerState, ActionSpace } from '../../shared/contract/types'
import { GameSession } from '../game/authoritative-session'
import {
  markAllWorkersUsed,
  setActiveWorkerCount,
  setNewbornCount,
  setWorkersAtHome,
} from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C148_MudWallower'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit54Resources from './_helpers/audit/ae-negative-54-resources'
import { createWorkSession } from './_helpers/session-fixtures'
import { expectCardEffectBeforeHostCollect } from './_helpers/space-use-order'

const CARD_ID = 'C148_MudWallower'

describe('C148 fencing with existing card animals', () => {
  it.each([1, 2])('preserves one actually held pig with %i total pigs', (total) => {
    const session = new GameSession(148, undefined, { playerCount: 2 })
    const state = session.state
    stabilizeRandomHands(state.players)
    state.round = 3
    const owner = state.players[0]!
    owner.occupationPlayed = [CARD_ID]
    owner.cardStates[CARD_ID] = { counters: { held: total, counter: 0 } }
    owner.resources.wood = 20
    owner.resources.boar = total
    if (total === 2) {
      owner.fenceSegments = ['H-1-2', 'H-2-2', 'V-1-2', 'V-1-3'].map((edge) => ({
        edge, type: 'fence', source: { kind: 'own', ownerPlayerId: owner.id },
      }))
      owner.pastures = [{ id: 'old', size: 1, tiles: [{ row: 1, col: 2 }], stables: 0, animalType: 'boar', animalCount: 1 }]
    }
    session.loadState(state)
    let response = session.takeAction(0, 'fencing')
    expect(response.ok, response.error).toBe(true)
    response = session.commitSelectionChoice(0, {
      edges: ['H-1-1', 'H-2-1', 'V-1-1', 'V-1-2'], })
    expect(response.ok, response.error).toBe(true)
    const after = response.state.players[0]!
    expect(after.resources.wood).toBe(total === 1 ? 16 : 17)
    expect(after.resources.boar).toBe(total)
    expect(after.cardStates[CARD_ID]?.counters).toEqual({ held: total, counter: 0 })
    expect(after.pastures.reduce((sum, pasture) => sum + pasture.animalCount, 0)).toBe(total - 1)
    expect(session.withCtx(() => computeAnimalZones(after, response.state)).find((zone) => zone.cardId === CARD_ID)?.animalCount).toBe(1)
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('confirm-next-player')
    expect(response.state.events.some((event) => event.type === 'farm.fenceBuilt')).toBe(true)
    expect(response.state.events.some((event) => event.type === 'resource.paid' && event.resources.wood === (total === 1 ? 4 : 3))).toBe(true)
  })
})

const setupSession = (actorIndex: number, counter = 0, held = 0) => {
  const session = new GameSession(148, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actorIndex
  state.round = 5
  state.roundPhase = 'work'
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [`__c148_minor_p${index + 1}__`]
    player.occupationHand = [`__c148_occupation_p${index + 1}__`]
  })
  const owner = state.players[0]!
  owner.occupationPlayed = [CARD_ID]
  owner.cardStates = {
    [CARD_ID]: { counters: { counter, held }, infobox: `${counter} / 4` },
  }
  session.loadState(state)
  return session
}

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: id, color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 5,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false },
      { id: '4', isActive: false, isNewborn: false },
      { id: '5', isActive: false, isNewborn: false },
    ],
    rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [CARD_ID],houseAnimals: {}, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 1, currentPlayerIndex: 0, players,
    actionSpaces: [], log: [],
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as GameState

const createSpace = (id: string, gainPerRound: Partial<Record<string, number>> = {}): ActionSpace =>
  ({
    id, nameKey: `actions.${id}.name`, descriptionKey: `actions.${id}.description`,
    roundAvailable: 1, gainPerRound,
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
  }) as ActionSpace

const findListener = (ruleOwner: TestCardRegistry, id: string) => {
  const lookupRule1 = () => getRegisteredCardListeners().find(l => l.id === id)
  return withActiveRegistry(ruleOwner, lookupRule1)
}

describe('C148_MudWallower', () => {
  it('onBuy initializes counter and held to 0', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const effect = withActiveRegistry(ruleRegistry, () => getCardEffect(CARD_ID))
    expect(effect).toBeDefined()

    const player = createPlayer()
    const state = createState(player)

    withActiveRegistry(ruleRegistry, () => effect!.onBuy!(state, player))
    expect(player.cardStates?.[CARD_ID]?.counters?.counter).toBe(0)
    expect(player.cardStates?.[CARD_ID]?.counters?.held).toBe(0)
    expect(player.cardStates?.[CARD_ID]?.infobox).toBe('0 / 4')
  })

  it('returns counter increment flow on accumulation space use', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry, 'C148-mud-wallower-before-accumulation-space')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const effect = withActiveRegistry(ruleRegistry, () => getCardEffect(CARD_ID))
    withActiveRegistry(ruleRegistry, () => effect!.onBuy!(createState(player), player))
    const state = createState(player)

    // Place farmer on an accumulation space (wood: 3 per round)
    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(listener!, {
      state, player, space: createSpace('forest', { wood: 3 }),
      actionId: 'place-farmer', phase: 'before',
    } as unknown as CardListenerContext))

    expect(result?.flow).toEqual({
      type: 'seq',
      children: [
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: CARD_ID,
          params: { kind: 'set-counter', key: 'counter', value: 1 },
        },
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: CARD_ID,
          params: { kind: 'set-infobox', text: '1 / 4' },
        },
      ],
    })
    expect(player.cardStates?.[CARD_ID]?.counters?.counter).toBe(0)
  })

  it('returns reset, held increment, and pig gain flow on 4th accumulation space use', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry, 'C148-mud-wallower-before-accumulation-space')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const effect = withActiveRegistry(ruleRegistry, () => getCardEffect(CARD_ID))
    withActiveRegistry(ruleRegistry, () => effect!.onBuy!(createState(player), player))

    // Simulate 3 previous accumulation uses
    player.cardStates![CARD_ID]!.counters!.counter = 3

    const state = createState(player)

    // 4th placement
    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(listener!, {
      state, player, space: createSpace('forest', { wood: 3 }),
      actionId: 'place-farmer', phase: 'before',
    } as unknown as CardListenerContext))

    expect(result).toBeDefined()
    expect(result!.flow).toEqual({
      type: 'seq',
      children: [
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: CARD_ID,
          params: { kind: 'set-counter', key: 'counter', value: 0 },
        },
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: CARD_ID,
          params: { kind: 'set-counter', key: 'held', value: 1 },
        },
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: CARD_ID,
          params: { kind: 'set-infobox', text: '0 / 4' },
        },
        {
          type: 'leaf',
          actionId: 'gain',
          sourceCard: CARD_ID,
          params: { boar: 1 },
          choiceLabelKey: undefined,
          choiceLabelParams: undefined,
        },
      ],
    })

    // Counter and held update only when the engine executes the returned flow.
    expect(player.cardStates?.[CARD_ID]?.counters?.counter).toBe(3)
    expect(player.cardStates?.[CARD_ID]?.counters?.held).toBe(0)
  })

  it('does not trigger on non-accumulation spaces', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry, 'C148-mud-wallower-before-accumulation-space')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const effect = withActiveRegistry(ruleRegistry, () => getCardEffect(CARD_ID))
    withActiveRegistry(ruleRegistry, () => effect!.onBuy!(createState(player), player))

    const state = createState(player)

    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(listener!, {
      state, player, space: createSpace('farmland', {}),
      actionId: 'place-farmer', phase: 'before',
    } as unknown as CardListenerContext))

    // Counter should not increment
    expect(player.cardStates?.[CARD_ID]?.counters?.counter).toBe(0)
    expect(result).toBeUndefined()
  })

  it('onComputeAnimalZones provides pig holder zone', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const effect = withActiveRegistry(ruleRegistry, () => getCardEffect(CARD_ID))
    expect(effect).toBeDefined()

    const player = createPlayer()
    player.cardStates = {
      [CARD_ID]: { counters: { counter: 0, held: 2 } },
    }

    const zones = withActiveRegistry(ruleRegistry, () => computeAnimalZones(player))
    const cardZone = zones.find(z => z.id === `card:${CARD_ID}`)
    expect(cardZone).toBeDefined()
    expect(cardZone!.capacity).toBe(2)
    expect(cardZone!.animalType).toBe('boar')
  })

  it('no animal zone when held is 0', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const effect = withActiveRegistry(ruleRegistry, () => getCardEffect(CARD_ID))
    expect(effect).toBeDefined()

    const player = createPlayer()
    player.cardStates = {
      [CARD_ID]: { counters: { counter: 0, held: 0 } },
    }

    const zones = withActiveRegistry(ruleRegistry, () => computeAnimalZones(player))
    const cardZone = zones.find(z => z.id === `card:${CARD_ID}`)
    expect(cardZone).toBeUndefined()
  })

  it('returns held-downward sync flow when player has fewer pigs than cap', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const exchangeListener = findListener(ruleRegistry, 'C148-mud-wallower-after-exchange')
    expect(exchangeListener).toBeDefined()

    const player = createPlayer()
    player.cardStates = {
      [CARD_ID]: { counters: { counter: 0, held: 2 } },
    }
    // Player has only 1 pig now (1 was cooked / paid away)
    player.resources.boar = 1

    const state = createState(player)

    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(exchangeListener!, {
      state, player,
      space: createSpace('exchange'),
      actionId: 'exchange', phase: 'after',
    } as unknown as CardListenerContext))

    expect(result?.flow).toEqual({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'set-counter', key: 'held', value: 1 },
    })
    expect(player.cardStates?.[CARD_ID]?.counters?.held).toBe(2)
  })

  it('held is permanent - does not increase when pig count grows back', () => {
    const ruleRegistry = createOfficialCardRegistry()
    // The reference behavior: once cap is reduced, it stays reduced even if pig count
    // returns to the original level (e.g., via breeding).
    const exchangeListener = findListener(ruleRegistry, 'C148-mud-wallower-after-exchange')
    expect(exchangeListener).toBeDefined()

    const player = createPlayer()
    player.cardStates = {
      [CARD_ID]: { counters: { counter: 0, held: 1 } },
    }
    // Player has 3 pigs - more than held cap. syncHeld should NOT raise cap.
    player.resources.boar = 3

    const state = createState(player)

    withActiveRegistry(ruleRegistry, () => executeCardListener(exchangeListener!, {
      state, player,
      space: createSpace('exchange'),
      actionId: 'exchange', phase: 'after',
    } as unknown as CardListenerContext))

    // held remains at 1 (no upward sync)
    expect(player.cardStates?.[CARD_ID]?.counters?.held).toBe(1)
  })
})

describe('C148 Mud Wallower public session', () => {
  it.each([
    { counter: 0, expected: 1 },
    { counter: 1, expected: 2 },
    { counter: 2, expected: 3 },
  ])('C148 S1: owner accumulation use advances counter $counter to $expected without gaining a boar', ({ counter, expected }) => {
    const session = setupSession(0, counter)
    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters).toMatchObject({
      counter: expected,
      held: 0,
    })
    expect(response.state.players[0]!.resources.boar).toBe(0)
  })

  it('C148 S1: the fourth owner accumulation use resets the counter and puts the gained boar on the card', () => {
    const session = setupSession(0, 3)
    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters).toMatchObject({
      counter: 0,
      held: 1,
    })
    expect(response.state.players[0]!.resources.boar).toBe(1)
    expect(response.interaction).toMatchObject({
      stateId: 'wait',
      promptKey: 'ui.interactionAnimalReorg',
      request: {
        kind: 'animal-reorg',
        zones: expect.arrayContaining([
          expect.objectContaining({
            id: `card:${CARD_ID}`,
            animalType: 'boar',
            animalCount: 1,
            capacity: 1,
          }),
        ]),
      },
    })
  })

  it('C148 S2: opponent accumulation use and owner non-accumulation use do not advance the counter', () => {
    const opponentSession = setupSession(1)
    const opponentResponse = opponentSession.takeAction(1, 'forest')

    expect(opponentResponse.ok, opponentResponse.error).toBe(true)
    expect(opponentResponse.state.players[0]!.cardStates[CARD_ID]?.counters?.counter).toBe(0)

    const ownerSession = setupSession(0)
    const ownerResponse = ownerSession.takeAction(0, 'day-laborer')

    expect(ownerResponse.ok, ownerResponse.error).toBe(true)
    expect(ownerResponse.state.players[0]!.cardStates[CARD_ID]?.counters?.counter).toBe(0)
  })

  it('C148 S7: two held boars breed and the newborn is housed outside the card', () => {
    const session = new GameSession(148, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.round = 4
    state.roundPhase = 'work'
    state.players.forEach((player, index) => {
      player.minorHand = [`__c148_minor_p${index + 1}__`]
      player.occupationHand = [`__c148_occupation_p${index + 1}__`]
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 2)
      setNewbornCount(player, 0)
      player.resources.food = 8
    })
    const owner = state.players[0]!
    owner.occupationPlayed = [CARD_ID]
    owner.cardStates = {
      [CARD_ID]: { counters: { counter: 0, held: 2 }, infobox: '0 / 4' },
    }
    owner.resources.boar = 2
    session.loadState(state)

    let response = session.performRoundEnd()

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({
      stateId: 'wait',
      request: {
        kind: 'animal-reorg',
        zones: expect.arrayContaining([
          expect.objectContaining({
            id: `card:${CARD_ID}`,
            animalType: 'boar',
            animalCount: 3,
            capacity: 2,
          }),
        ]),
      },
    })

    response = session.resolveChoice(0, 'confirm', [
      { id: 'house:2-0', zoneType: 'house', animalType: 'boar', animalCount: 1 },
      { id: `card:${CARD_ID}`, zoneType: 'card', animalType: 'boar', animalCount: 2 },
    ] as unknown as Record<string, unknown>)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.boar).toBe(3)
    expect(response.state.players[0]!).toMatchObject({
      houseAnimals: { '2-0': 'boar' },
    })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.held).toBe(2)
  })
})

describe('ae-negative-54-resources', () => {
  const { sessions, ok, save, setup, finish, next, play, take, move, farm, wallow, wallowRound } = audit54Resources
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C148 N1 real onBuy eight accumulation placements create two held pigs and natural breeding houses newborn elsewhere', () => {
    const s = setup('C148_MudWallower', 5, state => farm(state, 0))
    let r = wallow(s, play(s, 'C148_MudWallower'))
    assert.equal(r.state.players[0]!.cardStates['C148_MudWallower']?.counters?.counter, 0)
    r = wallowRound(s, ['forest', 'reed-bank', 'day-laborer', 'clay-pit', 'grain-seeds', 'fishing', 'copse'])
    assert.equal(r.state.round, 6)
    assert.equal(r.state.players[0]!.cardStates['C148_MudWallower']?.counters?.counter, 1)
    r = wallowRound(s, ['forest', 'clay-pit', 'reed-bank', 'day-laborer', 'fishing', 'grain-seeds', 'copse', 'hollow-4'])
    assert.equal(r.state.round, 7)
    assert.equal(r.state.players[0]!.cardStates['C148_MudWallower']?.counters?.counter, 3)
    r = wallow(s, take(s, 'reed-bank'))
    assert.equal(r.state.players[0]!.cardStates['C148_MudWallower']?.counters?.counter, 0)
    assert.equal(r.state.players[0]!.cardStates['C148_MudWallower']?.counters?.held, 1)
    assert.equal(r.state.players[0]!.resources.boar, 1)
    save('C148-N1-fourth', r)
    r = wallowRound(s, ['clay-pit', 'copse', 'day-laborer', 'forest', 'grain-seeds', 'fishing', 'hollow-4'])
    assert.equal(r.state.round, 8)
    r = wallowRound(s, ['forest', 'clay-pit', 'reed-bank', 'day-laborer', 'fishing', 'grain-seeds', 'copse', 'hollow-4'])
    assert.equal(r.state.round, 9)
    r = wallow(s, take(s, 'reed-bank'))
    assert.equal(r.state.players[0]!.cardStates['C148_MudWallower']?.counters?.held, 2)
    assert.equal(r.state.players[0]!.resources.boar, 2)
    save('C148-N1-eighth', r)
    r = wallowRound(s, ['clay-pit', 'copse', 'day-laborer', 'forest', 'grain-seeds', 'fishing', 'hollow-4'])
    assert.equal(r.state.round, 10)
    assert.equal(r.state.players[0]!.resources.boar, 3)
    assert.equal(r.state.players[0]!.cardStates['C148_MudWallower']?.counters?.held, 2)
    assert.equal(r.state.players[0]!.pastures[0]!.animalCount, 1)
    save('C148-N1-bred', r)
  })
  it('C148 N2 real nonaccumulation and opponent placements do not advance owned accumulation counter', () => {
    const s = setup('C148_MudWallower', 5)
    finish(s, play(s, 'C148_MudWallower'))
    move(s, 'forest')
    move(s, 'reed-bank')
    move(s, 'grain-seeds')
    const r = move(s, 'day-laborer')
    assert.equal(r.state.players[0]!.cardStates['C148_MudWallower']?.counters?.counter, 0)
    assert.equal(r.state.players[0]!.resources.boar, 0)
    save('C148-N2', r)
  })
  it('C148 N3 moving a newly created held pig permanently removes capacity and ordinary pig cannot refill card', () => {
    const s = setup('C148_MudWallower', 9, state => { farm(state, 0); state.actionSpaces.find(a => a.id === 'pig-market')!.resources.boar = 1; })
    wallow(s, play(s, 'C148_MudWallower'))
    wallowRound(s, ['forest', 'reed-bank', 'day-laborer', 'clay-pit', 'grain-seeds', 'fishing', 'copse'])
    wallowRound(s, ['forest', 'clay-pit', 'reed-bank', 'day-laborer', 'fishing', 'grain-seeds', 'copse', 'hollow-4'])
    let r = take(s, 'reed-bank')
    assert.equal(r.state.players[0]!.cardStates['C148_MudWallower']?.counters?.held, 1)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg')
    const p = r.interaction.request.zones.find(z => z.zoneType === 'pasture')!
    r = ok(s.resolveChoice(0, 'confirm', { zones: [{ ...p, animalType: 'boar', animalCount: 1, animalCounts: { boar: 1 } }] }))
    assert.equal(r.state.players[0]!.cardStates['C148_MudWallower']?.counters?.held, 0)
    move(s, 'forest')
    move(s, 'clay-pit')
    move(s, 'grain-seeds')
    next(s)
    assert.equal(s.state.round, 11)
    const market = s.state.actionSpaces.find(a => a.id === 'pig-market')!
    const reveal = s.state.roundActionOrder.indexOf('pig-market') + 1
    assert.ok(reveal >= 8 && reveal <= 9)
    save('C148-N3-before-market', s.getState())
    assert.equal(market.resources.boar, 3)
    r = take(s, 'pig-market')
    save('C148-N3-pig-arrival', r)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg')
    assert.ok(!r.interaction.request.zones.some(z => z.id === 'card:C148_MudWallower'))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: [{ id: 'card:C148_MudWallower', zoneType: 'card', animalType: 'boar', animalCount: 4 }] }))
    const pasture = r.interaction.request.zones.find(z => z.zoneType === 'pasture')!
    r = ok(s.resolveChoice(0, 'confirm', { zones: [{ ...pasture, animalType: 'boar', animalCount: 4, animalCounts: { boar: 4 } }] }))
    save('C148-N3-legal', r)
    assert.equal(r.state.players[0]!.cardStates['C148_MudWallower']?.counters?.held, 0)
    assert.equal(r.state.players[0]!.resources.boar, 4)
    save('C148-N3', r)
  })
})

describe('C148 before timing (#1322)', () => {
  const sessions: GameSession[] = []
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  const make = (counter: number) => {
    const session = createWorkSession({ seed: 1322148, options: { playerCount: 4 }, configure: state => {
      state.round = 14
      const owner = state.players[0]!
      owner.resources.boar = 0
      owner.occupationPlayed = [CARD_ID]
      owner.cardStates[CARD_ID] = { counters: { counter, held: 0 }, infobox: `${counter} / 4` }
      owner.pastures = [{ id: 'pasture-1', tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }], animalType: null, animalCount: 0 }]
      state.actionSpaces.find(space => space.id === 'pig-market')!.resources.boar = 1
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
    } })
    sessions.push(session)
    return session
  }

  it('counts the fourth use and houses the held pig before Pig Market is collected', () => {
    const session = make(3)
    let response = session.takeAction(0, 'pig-market')

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('animal-reorg')
    expect(response.state.players[0]!.resources.boar).toBe(1)
    expect(response.state.actionSpaces.find(space => space.id === 'pig-market')!.resources.boar).toBe(1)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters).toEqual({ counter: 0, held: 1 })
    response = session.resolveChoice(0, 'confirm', [
      { id: `card:${CARD_ID}`, zoneType: 'card', animalType: 'boar', animalCount: 1 },
    ] as unknown as Record<string, unknown>)

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('animal-reorg')
    expect(response.state.players[0]!.resources.boar).toBe(2)
    expectCardEffectBeforeHostCollect(response, { cardId: CARD_ID, spaceId: 'pig-market', type: 'resource.moved' })
    response = session.resolveChoice(0, 'confirm', [
      { id: 'pasture-1', zoneType: 'pasture', animalType: 'boar', animalCount: 1 },
      { id: `card:${CARD_ID}`, zoneType: 'card', animalType: 'boar', animalCount: 1 },
    ] as unknown as Record<string, unknown>)

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('confirm-next-player')
    expect(response.state.players[0]!.resources.boar).toBe(2)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters).toEqual({ counter: 0, held: 1 })
  })

  it('only advances the counter on an earlier use', () => {
    const response = make(1).takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ boar: 0, wood: expect.any(Number) })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters).toEqual({ counter: 2, held: 0 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.infobox).toBe('2 / 4')
    expect(response.state.events.some(event => event.type === 'resource.moved' && event.sourceCardId === CARD_ID)).toBe(false)
  })
})
