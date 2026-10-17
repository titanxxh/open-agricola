import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A012_DrinkingTrough'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit05Housing from './_helpers/audit/ae-negative-05-housing'

const CARD_ID = 'A012_DrinkingTrough'
const FILLER = '__test_placeholder__'

const setup = ({
  size = 1,
  stables = 0,
  boar = 0,
  played = true,
  clay = 0,
} = {}) => {
  const session = new GameSession(5012, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  })
  const player = state.players[0]!
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.minorPlayed = played ? [CARD_ID] : []
  player.resources.clay = clay
  player.resources.boar = boar
  player.pastures = played ? [{
    id: 'p1',
    size,
    stables,
    tiles: Array.from({ length: size }, (_, col) => ({ row: 0, col })),
    animalType: boar > 0 ? 'boar' : null,
    animalCount: boar,
  }] : []
  player.stableTiles = stables > 0 ? [{ row: 0, col: 0 }] : []
  const pigMarket = state.actionSpaces.find((space) => space.id === 'pig-market')
  if (pigMarket) pigMarket.resources.boar = 1
  session.loadState(state)
  return session
}

const playDrinkingTrough = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (!response.interaction.request.options?.some((option) => option.value === CARD_ID)) {
    const improvement = response.interaction.request.options?.find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(0, improvement.value)
  }
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(0, card!.value)
}

const addPig = (session: GameSession, total: number) => {
  const response = session.takeAction(0, 'pig-market')
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
  return session.resolveChoice(0, 'confirm', [
    { id: 'p1', zoneType: 'pasture', animalType: 'boar', animalCount: total },
  ] as unknown as Record<string, unknown>)
}

describe('A012 Drinking Trough parity', () => {
  it('A012 S1: Drinking Trough costs one clay to play', () => {
    const response = playDrinkingTrough(setup({ played: false, clay: 1 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(0)
  })

  it('A012 S2: a size-one pasture without a stable holds four animals', () => {
    const response = addPig(setup({ boar: 3 }), 4)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.pastures[0]!.animalCount).toBe(4)
  })

  it('A012 S3: a size-one pasture with a stable holds six animals', () => {
    const response = addPig(setup({ stables: 1, boar: 5 }), 6)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.pastures[0]!.animalCount).toBe(6)
  })

  it('A012 S4: a size-two pasture gains exactly two capacity and holds six animals', () => {
    const response = addPig(setup({ size: 2, boar: 5 }), 6)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.pastures[0]!.animalCount).toBe(6)
  })
})

describe('ae-negative-05-housing', () => {
  const { MUD, TROUGH, sessions, ok, setup, turn, purchase, blockedPurchase, reorg, mudCapacity, assign, zone, house, boars, finished } = audit05Housing
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  describe('Drinking Trough negative audit', () => {
    it('A012 N1 actual purchase pays clay and undo restores cost and card', () => {
      blockedPurchase(setup({ card: TROUGH, resources: { clay: 0 } }), TROUGH)
      const s = setup({ card: TROUGH, resources: { clay: 1 } }); const before = undoRuleSnapshot(s.getState())
      const r = ok(purchase(s, TROUGH)); assert.ok(r.state.players[0]!.minorPlayed.includes(TROUGH)); assert.equal(r.state.players[0]!.resources.clay, 0)
      assertUndoRestored(before, s.undoAction()); assert.equal(s.state.players[0]!.resources.clay, 1)
    })
    it('A012 N2 one pasture holds four with overflow rejection and whole action undo', () => {
      const s = setup({ card: TROUGH, played: true, pastureSize: 1, houseSheep: true, markets: { 'pig-market': { boar: 5 } } }); const before = undoRuleSnapshot(s.getState())
      let r = turn(s, 0, 'pig-market'); assert.equal(reorg(r).find(z => z.id === 'pasture-0')?.capacity, 4)
      assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: [house(), zone('pasture-0', 'boar', 5, 'pasture')] }))
      r = assign(s, 0, [house(), zone('pasture-0', 'boar', 4, 'pasture')]); assert.equal(boars(r), 4)
      assertUndoRestored(before, s.undoAction()); r = turn(s, 0, 'pig-market'); assert.equal(reorg(r).find(z => z.id === 'pasture-0')?.capacity, 4); r = assign(s, 0, [house(), zone('pasture-0', 'boar', 4, 'pasture')]); assert.equal(boars(r), 4)
    })
    it('A012 N3 stable multiplication precedes exactly two additional animals', () => {
      for (const [size, stableCount, capacity] of [[1, 1, 6], [2, 1, 10], [2, 2, 18]]) {
        const s = setup({ card: TROUGH, played: true, pastureSize: size, stableCount, houseSheep: true, markets: { 'pig-market': { boar: capacity + 1 } } })
        let r = turn(s, 0, 'pig-market'); assert.equal(reorg(r).find(z => z.id === 'pasture-0')?.capacity, capacity)
        assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: [house(), zone('pasture-0', 'boar', capacity + 1, 'pasture')] }))
        r = assign(s, 0, [house(), zone('pasture-0', 'boar', capacity, 'pasture')]); assert.equal(boars(r), capacity)
      }
    })
    it('A012 N4 house unfenced stable and Mud Patch are not enlarged pastures', () => {
      const s = setup({ card: TROUGH, played: true, mudAlso: true, emptyFields: 1, looseStable: true, markets: { 'pig-market': { boar: 4 } } }); const r = turn(s, 0, 'pig-market')
      const zs = reorg(r); const stable = zs.find(z => z.zoneType === 'stable'); assert.ok(stable)
      assert.deepEqual([zs.find(z => z.id === 'house:2-0')?.capacity, stable.capacity, mudCapacity(r)], [1, 1, 1])
      for (const target of [zone('house:2-0', 'boar', 2, 'house'), zone(stable.id, 'boar', 2, 'stable'), zone(`card:${MUD}`, 'boar', 2)]) assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: [target] }))
      const done = assign(s, 0, [zone('house:2-0', 'boar', 1, 'house'), zone(stable.id, 'boar', 1, 'stable'), zone(`card:${MUD}`, 'boar', 1)]); assert.equal(boars(done), 3)
    })
    it('A012 N5 each own pasture gains two while opponent receives no bonus', () => {
      const s = setup({ card: TROUGH, played: true, pastureSize: 1, twoPastures: true, opponentPasture: true, houseSheep: true, markets: { 'pig-market': { boar: 9 }, 'sheep-market': { sheep: 4 }, 'cattle-market': { cattle: 5 } } })
      let r = turn(s, 0, 'pig-market'); assert.deepEqual(reorg(r).filter(z => z.zoneType === 'pasture').map(z => z.capacity), [4, 4]); assign(s, 0, [house(), zone('pasture-0', 'boar', 4, 'pasture')])
      r = turn(s, 1, 'sheep-market'); assert.equal(reorg(r).find(z => z.zoneType === 'pasture')?.capacity, 2)
      assign(s, 1, [zone(reorg(r).find(z => z.zoneType === 'pasture')!.id, 'sheep', 2, 'pasture')])
      r = turn(s, 0, 'cattle-market'); assert.equal(r.state.players[0]!.resources.cattle, 5); r = assign(s, 0, [house(), zone('pasture-0', 'boar', 4, 'pasture'), zone('pasture-1', 'cattle', 4, 'pasture')])
      assert.deepEqual({ boar: boars(r), cattle: r.state.players[0]!.resources.cattle, opponentSheep: r.state.players[1]!.resources.sheep }, { boar: 4, cattle: 4, opponentSheep: 2 }); finished(r)
    })
  })
})
