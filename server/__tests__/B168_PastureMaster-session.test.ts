import type { GameSession as SessionRuleOwner } from '../game/authoritative-session'
import { type SessionResponse } from '../game/authoritative-session'
import type { AnimalType } from '../../shared/contract/types'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getRegisteredCardListeners, executeCardListener } from '../../shared/cards/card-listeners'
import type { CardListenerContext } from '../../shared/cards/card-listeners'

import '../../shared/cards/B/B168_PastureMaster'
import { mkActionSpace } from '../../shared/cards/__tests__/fixtures'
import assert from 'node:assert/strict'
import { positionKey } from '../../shared/domain/farm'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit31Plows from './_helpers/audit/ae-negative-31-plows'

const CARD_ID = 'B168_PastureMaster'

const findListener = (ruleOwner: SessionRuleOwner, id: string) =>
  ruleOwner.withCtx(() => getRegisteredCardListeners()).find((l) => l.id === id)

describe('B168_PastureMaster session', () => {
  const createBaseState = () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    return { session, state }
  }

  it('gains 2 food on renovate when no pastures with stables', () => {


    const { session, state } = createBaseState()
    const listener = findListener(session, 'B168-pasture-master-after-renovate')
    expect(listener).toBeDefined()
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]
    player.pastures = []

    const result = session.withCtx(() => executeCardListener(listener!, {
      state,
      player,
      space: mkActionSpace({ id: 'renovate-house' }),
      actionId: 'renovate-house',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext))

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('leaf')
    if (result!.flow?.type === 'leaf') {
      expect(result!.flow.params).toEqual({ food: 2 })
    }
  })

  it('gains 2 food + 1 sheep when pasture with stable has sheep', () => {


    const { session, state } = createBaseState()
    const listener = findListener(session, 'B168-pasture-master-after-renovate')
    expect(listener).toBeDefined()
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]
    player.pastures = [
      {
        id: 'p1',
        tiles: [{ row: 0, col: 2 }, { row: 0, col: 3 }],
        animalType: 'sheep',
        animalCount: 2,
      },
    ]
    player.stableTiles = [{ row: 0, col: 2 }]

    const result = session.withCtx(() => executeCardListener(listener!, {
      state,
      player,
      space: mkActionSpace({ id: 'renovate-house' }),
      actionId: 'renovate-house',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext))

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('leaf')
    if (result!.flow?.type === 'leaf') {
      expect(result!.flow.params).toEqual({ food: 2, sheep: 1 })
    }
  })

  it('gains animals from multiple pastures with stables', () => {


    const { session, state } = createBaseState()
    const listener = findListener(session, 'B168-pasture-master-after-renovate')
    expect(listener).toBeDefined()
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]
    player.pastures = [
      {
        id: 'p1',
        tiles: [{ row: 0, col: 2 }, { row: 0, col: 3 }],
        animalType: 'sheep',
        animalCount: 3,
      },
      {
        id: 'p2',
        tiles: [{ row: 1, col: 2 }],
        animalType: 'boar',
        animalCount: 1,
      },
      {
        id: 'p3',
        tiles: [{ row: 2, col: 2 }],
        animalType: 'cattle',
        animalCount: 2,
      },
    ]
    player.stableTiles = [{ row: 0, col: 2 }, { row: 1, col: 2 }]

    const result = session.withCtx(() => executeCardListener(listener!, {
      state,
      player,
      space: mkActionSpace({ id: 'renovate-house' }),
      actionId: 'renovate-house',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext))

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('leaf')
    if (result!.flow?.type === 'leaf') {
      // 2 food + 1 sheep (from p1 with stable) + 1 boar (from p2 with stable)
      // p3 has no stable, so no bonus cattle
      expect(result!.flow.params).toEqual({ food: 2, sheep: 1, boar: 1 })
    }
  })


  it('skips pastures with stables but no animals', () => {


    const { session, state } = createBaseState()
    const listener = findListener(session, 'B168-pasture-master-after-renovate')
    expect(listener).toBeDefined()
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]
    player.pastures = [
      {
        id: 'p1',
        tiles: [{ row: 0, col: 2 }, { row: 0, col: 3 }],
        animalType: null,
        animalCount: 0,
      },
    ]
    player.stableTiles = [{ row: 0, col: 2 }]

    const result = session.withCtx(() => executeCardListener(listener!, {
      state,
      player,
      space: mkActionSpace({ id: 'renovate-house' }),
      actionId: 'renovate-house',
      phase: 'after',
      result: { type: 'ok' },
    } as CardListenerContext))

    expect(result).toBeDefined()
    expect(result!.flow?.type).toBe('leaf')
    if (result!.flow?.type === 'leaf') {
      // Only 2 food, no animals since pasture is empty
      expect(result!.flow.params).toEqual({ food: 2 })
    }
  })
})

describe('B168 Pasture Master parity', () => {
  const CARD_ID = 'B168_PastureMaster'

  const FILLER = '__test_placeholder__'

  type PastureFixture = {
    id: string
    row: number
    col: number
    stable: boolean
    animalType: AnimalType | null
    animalCount: number
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const setup = ({ played = true, pastures = [] }: {
    played?: boolean
    pastures?: PastureFixture[]
  } = {}) => {
    const session = new GameSession(6168, undefined, { playerCount: 4 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.roundActionOrder = [
      'house-redevelopment',
      ...state.roundActionOrder.filter((id) => id !== 'house-redevelopment'),
    ]
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player, index) => {
      setWorkersAtHome(state, player, index === 0 ? 2 : 0)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.cardStates = {}
      player.pastures = []
      player.stableTiles = []
      player.stableAnimals = {}
      player.houseAnimals = {};
      Object.assign(player.resources, {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      })
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.houseType = 'wood'
    owner.rooms = 2
    owner.roomTiles = [{ row: 0, col: 0 }, { row: 1, col: 0 }]
    owner.resources.clay = 2
    owner.resources.reed = 1
    owner.pastures = pastures.map((pasture) => ({
      id: pasture.id,
      tiles: [{ row: pasture.row, col: pasture.col }],
      stables: pasture.stable ? 1 : 0,
      animalType: pasture.animalType,
      animalCount: pasture.animalCount,
    }))
    owner.stableTiles = pastures
      .filter((pasture) => pasture.stable)
      .map((pasture) => ({ row: pasture.row, col: pasture.col }))
    for (const pasture of pastures) {
      if (pasture.animalType) owner.resources[pasture.animalType] += pasture.animalCount
    }
    session.loadState(state)
    return session
  }

  const renovate = (
    session: GameSession,
    placements: Partial<Record<string, { type: AnimalType; count: number }>> = {},
  ) => {
    let response = session.takeAction(0, 'house-redevelopment')
    for (let remaining = 16; remaining > 0 && response.interaction.stateId === 'wait'; remaining -= 1) {
      if (response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
        response = session.resolveChoice(response.interaction.playerIndex, 'clay')
        continue
      }
      if (response.interaction.request.kind === 'select-trigger') {
        response = resolveTriggerIfPresent(session, response, CARD_ID)
        continue
      }
      if (response.interaction.request.kind === 'animal-reorg') {
        const zones = response.interaction.request.zones.map((zone) => {
          const placement = placements[zone.id]
          return placement
            ? { ...zone, animalType: placement.type, animalCount: placement.count }
            : { ...zone, animalType: null, animalCount: 0 }
        })
        response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { zones })
        continue
      }
      const skip = options(response).find((option) => option.value === '__skip__' || option.value === 'skip')
      if (skip) {
        response = session.resolveChoice(response.interaction.playerIndex, skip.value)
        continue
      }
      break
    }
    return response
  }

  it('B168 S2: renovating without a stable pasture gains only two food', () => {
    const response = renovate(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay', resources: { food: 2, sheep: 0, boar: 0, cattle: 0 },
    })
  })

  it('B168 S3: renovating adds one sheep to a stable pasture already containing sheep', () => {
    const session = setup({ pastures: [{
      id: 'sheep-pasture', row: 0, col: 2, stable: true, animalType: 'sheep', animalCount: 1,
    }] })

    const response = renovate(session, { 'sheep-pasture': { type: 'sheep', count: 2 } })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, sheep: 2 })
    expect(response.state.players[0]!.pastures[0]).toMatchObject({
      id: 'sheep-pasture', animalType: 'sheep', animalCount: 2,
    })
  })

  it('B168 S4: renovating adds the respective animal in each occupied stable pasture only', () => {
    const session = setup({ pastures: [
      { id: 'sheep-pasture', row: 0, col: 2, stable: true, animalType: 'sheep', animalCount: 1 },
      { id: 'boar-pasture', row: 1, col: 2, stable: true, animalType: 'boar', animalCount: 1 },
      { id: 'cattle-pasture', row: 2, col: 2, stable: false, animalType: 'cattle', animalCount: 1 },
    ] })

    const response = renovate(session, {
      'sheep-pasture': { type: 'sheep', count: 2 },
      'boar-pasture': { type: 'boar', count: 2 },
      'cattle-pasture': { type: 'cattle', count: 1 },
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      food: 2, sheep: 2, boar: 2, cattle: 1,
    })
  })

  it('B168 S5: an empty stable pasture grants no animal when renovating', () => {
    const session = setup({ pastures: [{
      id: 'empty-pasture', row: 0, col: 2, stable: true, animalType: null, animalCount: 0,
    }] })

    const response = renovate(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      food: 2, sheep: 0, boar: 0, cattle: 0,
    })
  })
})

describe('ae-negative-31-plows', () => {
  const { sessions, save, setup, finish, next, lesson, take, move, noSource, pasture, animalKeep, renovate } = audit31Plows
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('B168 N1 real renovation adds food and exactly one sheep per occupied pasture with a stable', () => {
    for (const both of [false, true]) {
      const card = 'B168_PastureMaster', s = setup(card, 14, st => { Object.assign(st.players[0]!.resources, { clay: 2, reed: 1 }); pasture(st, [{ row: 0, col: 3 }], 'sheep', 1, true, 'p1'); pasture(st, [{ row: 0, col: 4 }], 'sheep', 1, both, 'p2'); })
      let r = renovate(s, take(s, 'house-redevelopment'))
      r = animalKeep(s, r, req => {
        for (const z of req.zones) {
          if (z.id === 'p1') {
            z.animalType = 'sheep'
            z.animalCount = 2
          }
          else if (z.id === 'p2') {
            z.animalType = 'sheep'
            z.animalCount = both ? 2 : 1
          }
          else {
            z.animalType = null
            z.animalCount = 0
          }
        }
      })
      r = finish(s, r)
      assert.equal(r.state.players[0]!.houseType, 'clay')
      assert.equal(r.state.players[0]!.resources.food, 22)
      assert.equal(r.state.players[0]!.resources.sheep, both ? 4 : 3)
      assert.deepEqual(r.state.players[0]!.pastures.map(p => p.animalCount), both ? [2, 2] : [2, 1])
      save(`B168-N1-${both}`, r)
    }
  })
  it('B168 N2 empty stable pasture and occupied unfenced stable yield food but no additional animal', () => {
    for (const mode of ['empty', 'loose']) {
      const card = 'B168_PastureMaster', s = setup(card, 14, st => {
        Object.assign(st.players[0]!.resources, { clay: 2, reed: 1 })
        pasture(st, [{ row: 0, col: 3 }], null, 0, true)
        if (mode === 'loose') {
          st.players[0]!.stableTiles.push({ row: 1, col: 3 })
          st.players[0]!.stableAnimals[positionKey({ row: 1, col: 3 })] = { animalType: 'sheep', animalCount: 1 }
          st.players[0]!.resources.sheep = 1
        }
      })
      const r = finish(s, renovate(s, take(s, 'house-redevelopment')), true)
      assert.equal(r.state.players[0]!.resources.food, 22)
      assert.equal(r.state.players[0]!.resources.sheep, mode === 'loose' ? 1 : 0)
      save(`B168-N2-${mode}`, r)
    }
  })
  it('B168 N3 opponent renovation and hand-only occupation cannot give the owner food or sheep', () => {
    for (const mode of ['hand', 'opponent']) {
      const card = 'B168_PastureMaster', s = setup(card, 14, st => {
        pasture(st, [{ row: 0, col: 3 }], 'sheep', 1, true)
        if (mode === 'hand') {
          st.players[0]!.occupationPlayed = []
          st.players[0]!.occupationHand = [card]
        }
        else
          st.currentPlayerIndex = 1
        Object.assign(st.players[mode === 'opponent' ? 1 : 0]!.resources, { clay: 2, reed: 1 })
      })
      let r = take(s, 'house-redevelopment')
      noSource(r, card)
      r = finish(s, renovate(s, r), true)
      assert.equal(r.state.players[0]!.resources.food, 20)
      assert.equal(r.state.players[0]!.resources.sheep, 1)
      save(`B168-N3-${mode}`, r)
    }
  })
  it('B168 N4 real occupation play does not reward and unaffordable renovation rejects', () => { const card = 'B168_PastureMaster', s = setup(card, 14, st => { st.players[0]!.occupationPlayed = []; st.players[0]!.occupationHand = [card]; Object.assign(st.players[0]!.resources, { clay: 1, reed: 1 }); }); const r = finish(s, lesson(s, card), true); assert.ok(r.state.players[0]!.occupationPlayed.includes(card)); assert.equal(r.state.players[0]!.resources.food, 20); next(s); move(s, 'grain-seeds'); next(s); assertRejectedUnchanged(s, () => s.takeAction(0, 'house-redevelopment')); assert.equal(s.state.players[0]!.resources.food, 20); assert.equal(s.state.players[0]!.houseType, 'wood'); save('B168-N4', s.getState()); })
})
