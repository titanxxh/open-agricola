import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'

import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { computeAnimalZones } from '../../shared/domain/animal-zones'

import '../../shared/cards/E/E086_PenBuilder'
import type { AnytimeAction } from '../../shared/contract/types';
import type { AnimalZone } from '../../shared/domain/animal-zones'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit44Cards from './_helpers/audit/ae-negative-44-cards'

describe('E086_PenBuilder session', () => {
  const setup = () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('E086_PenBuilder')
    session.loadState(state)
    session.devPlayCard(0, 'E086_PenBuilder')
    return session
  }

  /** Take farmland action to enter active interaction with a plow choice */
  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    return resp
  }

  it('anytime appears when player has wood', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.wood = 3
    session.loadState(state)

    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).toContain('E86-pen-builder-anytime')
  })

  it('anytime not available without wood', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.wood = 0
    session.loadState(state)

    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('E86-pen-builder-anytime')
  })

  it('pay 1 wood increments discards counter', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.wood = 5
    session.loadState(state)

    enterActiveInteraction(session)

    const resp = session.takeAnytimeAction(0, 'E86-pen-builder-anytime')
    expect(resp.ok).toBe(true)

    const updatedPlayer = resp.state.players[0]!
    expect(updatedPlayer.resources.wood).toBe(4) // 5 - 1
    expect(updatedPlayer.cardStates?.['E086_PenBuilder']?.counters?.discards).toBe(1)
  })

  it('can use multiple times (not once per round)', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.wood = 5
    session.loadState(state)

    enterActiveInteraction(session)

    // First use
    const resp1 = session.takeAnytimeAction(0, 'E86-pen-builder-anytime')
    expect(resp1.ok).toBe(true)
    expect(resp1.state.players[0]!.resources.wood).toBe(4)
    expect(resp1.state.players[0]!.cardStates?.['E086_PenBuilder']?.counters?.discards).toBe(1)

    // Second use - should still be available
    const anytimeIds = resp1.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).toContain('E86-pen-builder-anytime')

    const resp2 = session.takeAnytimeAction(0, 'E86-pen-builder-anytime')
    expect(resp2.ok).toBe(true)
    expect(resp2.state.players[0]!.resources.wood).toBe(3)
    expect(resp2.state.players[0]!.cardStates?.['E086_PenBuilder']?.counters?.discards).toBe(2)

    // Third use
    const resp3 = session.takeAnytimeAction(0, 'E86-pen-builder-anytime')
    expect(resp3.ok).toBe(true)
    expect(resp3.state.players[0]!.resources.wood).toBe(2)
    expect(resp3.state.players[0]!.cardStates?.['E086_PenBuilder']?.counters?.discards).toBe(3)
  })

  it('onComputeAnimalZones adds capacity based on discards', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.wood = 3
    session.loadState(state)

    // Before any discards - no card zone
    let zones = session.withCtx(() => computeAnimalZones(player))
    const cardZoneBefore = zones.find((z: InteractionAnimalReorgZone) => z.id === 'card:E086_PenBuilder')
    expect(cardZoneBefore).toBeUndefined()

    // Enter interaction and discard wood twice
    enterActiveInteraction(session)

    session.takeAnytimeAction(0, 'E86-pen-builder-anytime')
    const resp2 = session.takeAnytimeAction(0, 'E86-pen-builder-anytime')
    expect(resp2.ok).toBe(true)

    const updatedPlayer = resp2.state.players[0]!
    zones = session.withCtx(() => computeAnimalZones(updatedPlayer))
    const cardZone = zones.find((z: AnimalZone) => z.id === 'card:E086_PenBuilder')
    expect(cardZone).toBeDefined()
    expect(cardZone!.zoneType).toBe('card')
    expect(cardZone!.capacity).toBe(4) // 2 discards * 2 = 4
  })
})

describe('E086 Pen Builder parity', () => {
  const CARD_ID = 'E086_PenBuilder'

  const ANYTIME_ID = 'E86-pen-builder-anytime'

  const FILLER = '__test_placeholder__'

  const setup = ({
    played = true, wood = 0, sheep = 0, boar = 0,
  }: { played?: boolean; wood?: number; sheep?: number; boar?: number } = {}) => {
    const session = new GameSession(6086, undefined, { playerCount: 2 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.occupationPlayed = []
      player.cardStates = {}
      player.pastures = []
      player.fenceSegments = []
      player.stableTiles = []
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
        grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0,
      }
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    Object.assign(owner.resources, { wood, sheep, boar })
    session.loadState(state)
    return session
  }

  const penCapacity = (response: SessionResponse) => {
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'animal-reorg' },
    })
    if (response.interaction.stateId !== 'wait'
      || response.interaction.request.kind !== 'animal-reorg') return undefined
    return response.interaction.request.zones.find((zone) => zone.id === `card:${CARD_ID}`)?.capacity
  }

  it('E086 S5: two animals of any one type can be moved onto Pen Builder', () => {
    const session = setup({ wood: 1 })
    session.state.actionSpaces.find((space) => space.id === 'pig-market')!.resources.boar = 2

    const beforePayment = session.takeAction(0, 'pig-market')
    expect(beforePayment.interaction.anytimeActions.map((action) => action.id)).toContain(ANYTIME_ID)
    const pending = session.takeAnytimeAction(0, ANYTIME_ID)
    expect(penCapacity(pending)).toBe(2)
    const response = session.resolveChoice(0, 'confirm', [{
      id: `card:${CARD_ID}`, zoneType: 'card', cardId: CARD_ID,
      animalType: 'boar', animalCount: 2,
    }] as unknown as Record<string, unknown>)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.boar).toBe(2)
  })

  it('E086 S6: capacity two rejects a third animal atomically and accepts two on retry', () => {
    const session = setup({ wood: 1 })
    session.state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = 3

    const beforePayment = session.takeAction(0, 'sheep-market')
    expect(beforePayment.interaction.anytimeActions.map((action) => action.id)).toContain(ANYTIME_ID)
    const pending = session.takeAnytimeAction(0, ANYTIME_ID)
    expect(penCapacity(pending)).toBe(2)
    const before = JSON.stringify({ state: pending.state, interaction: pending.interaction })
    const failed = session.resolveChoice(0, 'confirm', [{
      id: `card:${CARD_ID}`, zoneType: 'card', cardId: CARD_ID,
      animalType: 'sheep', animalCount: 3,
    }] as unknown as Record<string, unknown>)

    expect(failed.ok).toBe(false)
    expect(JSON.stringify({ state: failed.state, interaction: failed.interaction })).toBe(before)

    const retry = session.resolveChoice(0, 'confirm', [{
      id: `card:${CARD_ID}`, zoneType: 'card', cardId: CARD_ID,
      animalType: 'sheep', animalCount: 2,
    }] as unknown as Record<string, unknown>)
    expect(retry.ok, retry.error).toBe(true)
    expect(retry.state.players[0]!.resources.sheep).toBe(2)
  })
})

describe('ae-negative-44-cards', () => {
  const { sessions, save, ok, make, finish, anytime } = audit44Cards
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E086 N1 two real anytime wood discards cost exactly two wood and create capacity four then entry becomes unavailable', () => { const s = make('E086_PenBuilder', st => { st.players[0]!.resources.wood = 2 }); const a = finish(s, anytime(s, 'E086_PenBuilder')), b = finish(s, anytime(s, 'E086_PenBuilder')); assert.equal(a.state.players[0]!.resources.wood, 1); assert.equal(b.state.players[0]!.resources.wood, 0); assert.equal(b.state.players[0]!.cardStates.E086_PenBuilder?.counters?.discards, 2); assert.equal(b.interaction.anytimeActions.some(a => JSON.stringify(a).includes('E086_PenBuilder')), false); save('E086-N1', { a, b }) })
  it('E086 N2 zero wood cannot expand and one paid discard holds two sheep with overflow rejected then legal retry', () => { const c = make('E086_PenBuilder'); assert.equal(c.getState().interaction.anytimeActions.some(a => JSON.stringify(a).includes('E086_PenBuilder')), false); const control = finish(c, ok(c.takeAction(0, 'grain-seeds')), false); assert.equal(control.state.players[0]!.resources.grain, 1); const s = make('E086_PenBuilder', st => { st.players[0]!.resources.wood = 1; st.actionSpaces.find(a => a.id === 'sheep-market')!.resources.sheep = 3 }); finish(s, anytime(s, 'E086_PenBuilder')); const p = ok(s.takeAction(0, 'sheep-market')); assert.ok(p.interaction.stateId === 'wait' && p.interaction.request.kind === 'animal-reorg'); const zone = p.interaction.request.zones.find(z => z.cardId === 'E086_PenBuilder'); assert.ok(zone); assert.equal(zone.capacity, 2); const all = p.interaction.request.zones.map(z => ({ ...z, animalType: null, animalCount: 0 })); const over = all.map(z => z.id === zone.id ? { ...z, animalType: 'sheep', animalCount: 3 } : z); const rejected = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: over })); const legal = p.interaction.request.zones, r = ok(s.resolveChoice(0, 'confirm', { zones: legal })); assert.equal(r.state.players[0]!.resources.sheep, 3); assert.equal(r.state.players[0]!.resources.wood, 0); save('E086-N2', { control, p, rejected, r }) })
  it('E086 N3 paid capacity two can hold mixed sheep and boar while extra boar occupies the one household holder', () => { const s = make('E086_PenBuilder', st => { const p = st.players[0]!; p.resources.wood = 1; p.resources.sheep = 1; const t = p.roomTiles[0]!; p.houseAnimals = { [`${t.row}-${t.col}`]: 'sheep' }; st.actionSpaces.find(a => a.id === 'pig-market')!.resources.boar = 2 }); finish(s, anytime(s, 'E086_PenBuilder')); const p = ok(s.takeAction(0, 'pig-market')); assert.ok(p.interaction.stateId === 'wait' && p.interaction.request.kind === 'animal-reorg'); const zone = p.interaction.request.zones.find(z => z.cardId === 'E086_PenBuilder'), house = p.interaction.request.zones.find(z => z.zoneType === 'house'); assert.ok(zone && house); const r = ok(s.resolveChoice(0, 'confirm', { zones: [{ ...zone, animalType: null, animalCount: 2, animalCounts: { sheep: 1, boar: 1 } }, { ...house, animalType: 'boar', animalCount: 1 }] })); assert.equal(r.state.players[0]!.resources.sheep, 1); assert.equal(r.state.players[0]!.resources.boar, 2); assert.equal(r.state.players[0]!.resources.wood, 0); save('E086-N3', { p, r }) })
})
