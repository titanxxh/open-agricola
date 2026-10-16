import { expectWait } from './_helpers/trigger-select'
import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A012_DrinkingTrough'
import assert from 'node:assert/strict'
import { type PlayerState } from '../../shared/contract/types'
import { type ZoneAssignment } from '../../shared/actions/effects/reorganize'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
const sessionEvidence = createScenarioEvidence(import.meta.url)
const CARD_ID = 'A012_DrinkingTrough'
const FILLER = '__test_placeholder__'

const setup = ({
  size = 1,
  stables = 0,
  boar = 0,
  played = true,
  clay = 0,
} = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 5012, options: { playerCount: 2 } }))
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
      tiles: Array.from({ length: size }, (_, col) => ({ row: 0, col })),
    animalType: boar > 0 ? 'boar' : null,
    animalCount: boar
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
  if (!getChoiceOptions(response)?.some((option) => option.value === CARD_ID)) {
    const improvement = getChoiceOptions(response)?.find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(0, improvement.value)
  }
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = getChoiceOptions(response)?.find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(0, card!.value)
}

const addPig = (session: GameSession, total: number) => {
  const response = session.takeAction(0, 'pig-market')
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
  return session.resolveChoice(0, 'confirm', { zones: [
    { id: 'p1', zoneType: 'pasture', animalType: 'boar', animalCount: total },
  ] })
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
describe("A012 command boundaries", () => {
  const SHED = 'A010_WoodenShed'
  const MUD = 'A011_MudPatch'
  const TROUGH = 'A012_DrinkingTrough'
  function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r; }
  function enclose(p: PlayerState, size = 1, stableCount = 0, twoPastures = false) {
    const tiles = Array.from({ length: size }, (_, row) => ({ row, col: 3 }))
    p.pastures = [{ id: 'pasture-0', tiles, animalType: null, animalCount: 0 }]
    const edges = [`H-0-3`, `H-${size}-3`, ...tiles.flatMap(t => [`V-${t.row}-3`, `V-${t.row}-4`])]
    if (twoPastures) {
      p.pastures.push({ id: 'pasture-1', tiles: [{ row: 1, col: 3 }], animalType: null, animalCount: 0 })
      edges.push('H-2-3', 'V-1-3', 'V-1-4')
    }
    p.fenceSegments = [...new Set(edges)].map(edge => ({ edge, type: 'fence' }))
    p.stableTiles = tiles.slice(0, stableCount)
  }
  function setup({ card = SHED, played = false, round = 14, resources = {}, houseType = 'wood', emptyFields = 0, plantedFields = 0, cardField = false, houseSheep = false, pastureSize = 0, stableCount = 0, twoPastures = false, opponentPasture = false, opponentFields = false, angler = false, looseStable = false, mudAlso = false, markets = {} }: {
    card?: string
    played?: boolean
    round?: number
    resources?: Partial<PlayerState['resources']>
    houseType?: PlayerState['houseType']
    emptyFields?: number
    plantedFields?: number
    cardField?: boolean
    houseSheep?: boolean
    pastureSize?: number
    stableCount?: number
    twoPastures?: boolean
    opponentPasture?: boolean
    opponentFields?: boolean
    angler?: boolean
    looseStable?: boolean
    mudAlso?: boolean
    markets?: Record<string, Partial<PlayerState['resources']>>
  } = {}) {
    const s = sessionEvidence.track(createWorkSession({ seed: 42, options: { playerCount: 2 }, configure: state => {
        state.round = round
        state.availableMajorImprovements = []
        for (const p of state.players)
          p.resources.food = 40
        const p = state.players[0]!
        p.houseType = houseType
        p.minorHand = played ? ['__test_placeholder__'] : [card, '__test_placeholder__']
        p.minorPlayed = [...(played ? [card] : []), ...(cardField ? ['A038_BeanField'] : []), ...(mudAlso ? [MUD] : [])]
        if (angler)
          p.occupationPlayed = ['A095_Angler']
        Object.assign(p.resources, resources)
        if (houseSheep) {
          p.resources.sheep = 1
          p.houseAnimals = { '2-0': 'sheep' }
        }
        p.fields = Array.from({ length: emptyFields + plantedFields }, (_, col) => ({ row: 0, col: col + 1, stacks: col < emptyFields ? [] : [{ kind: 'grain', remaining: 2 }] }))
        if (pastureSize > 0)
          enclose(p, pastureSize, stableCount, twoPastures)
        if (opponentFields)
          state.players[1]!.fields = [{ row: 0, col: 1, stacks: [] }, { row: 0, col: 2, stacks: [] }]
        if (opponentPasture)
          enclose(state.players[1]!)
        if (looseStable)
          p.stableTiles = [{ row: 0, col: 3 }]
        for (const [id, values] of Object.entries(markets))
          Object.assign(state.actionSpaces.find(a => a.id === id)!.resources, values)
        if (angler)
          state.actionSpaces.find(a => a.id === 'fishing')!.resources.food = 1
      } }))
    assert.equal(s.getState().interaction.stateId, 'idle')
    return s
  }
  function choose(s: GameSession, r: SessionResponse, predicate: (o: {
    value: string
    labelKey?: string
  }) => boolean) {
    assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction))
    const o = getChoiceOptions(r).find(predicate)
    assert.ok(o, JSON.stringify(r.interaction))
    return ok(s.resolveChoice(expectWait(r).interaction.playerIndex, o.value))
  }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) { ready(s, actor); return ok(s.takeAction(actor, space)); }
  function purchaseFrom(s: GameSession, r: SessionResponse, card: string) {
    for (let n = 0; n < 8 && r.state.players[0]!.minorHand.includes(card) && r.interaction.stateId === 'wait'; n++) {
      if (r.interaction.request.kind === 'select-trigger') {
        r = choose(s, r, o => o.value !== '__pass__')
        continue
      }
      if (r.interaction.request.kind !== 'choice')
        break
      const o = getChoiceOptions(r).find(o => o.value === card || o.value.startsWith('action-improvement-') || o.value.startsWith('flow-'))
      if (!o)
        break
      r = ok(s.resolveChoice(0, o.value))
    }
    return r
  }
  function purchase(s: GameSession, card: string, space = 'major-improvement') { ready(s, 0); return purchaseFrom(s, s.takeAction(0, space), card); }
  function blockedPurchase(s: GameSession, card: string, space = 'major-improvement') {
    const goods = { ...s.state.players[0]!.resources }
    const r = purchase(s, card, space)
    assert.ok(r.state.players[0]!.minorHand.includes(card))
    assert.ok(!r.state.players[0]!.minorPlayed.includes(card))
    assert.deepEqual(r.state.players[0]!.resources, goods)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
  }
  function reorg(r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg', JSON.stringify(r.interaction))
    return r.interaction.request.zones
  }
  function mudCapacity(r: SessionResponse) { return reorg(r).find(z => z.id === `card:${MUD}`)?.capacity ?? 0; }
  function assign(s: GameSession, actor: number, zones: ZoneAssignment[]) { return ok(s.resolveChoice(actor, 'confirm', { zones })); }
  function zone(id: string, animalType: ZoneAssignment['animalType'], animalCount: number, zoneType: ZoneAssignment['zoneType'] = 'card'): ZoneAssignment { return { id, zoneType, animalType, animalCount }; }
  function house() { return zone('house:2-0', 'sheep', 1, 'house'); }
  function boars(r: SessionResponse, actor = 0) { return r.state.players[actor]!.resources.boar; }
  function finished(r: SessionResponse) { assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction)); }
  it("actual purchase pays clay and undo restores cost and card", () => {
    blockedPurchase(setup({ card: TROUGH, resources: { clay: 0 } }), TROUGH)
    const s = setup({ card: TROUGH, resources: { clay: 1 } })
    const before = undoRuleSnapshot(s.getState())
    const r = ok(purchase(s, TROUGH))
    assert.ok(r.state.players[0]!.minorPlayed.includes(TROUGH))
    assert.equal(r.state.players[0]!.resources.clay, 0)
    assertUndoRestored(before, s.undoAction())
    assert.equal(s.state.players[0]!.resources.clay, 1)
  })
  it("one pasture holds four with overflow rejection and whole action undo", () => {
    const s = setup({ card: TROUGH, played: true, pastureSize: 1, houseSheep: true, markets: { 'pig-market': { boar: 5 } } })
    const before = undoRuleSnapshot(s.getState())
    let r = turn(s, 0, 'pig-market')
    assert.equal(reorg(r).find(z => z.id === 'pasture-0')?.capacity, 4)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: [house(), zone('pasture-0', 'boar', 5, 'pasture')] }))
    r = assign(s, 0, [house(), zone('pasture-0', 'boar', 4, 'pasture')])
    assert.equal(boars(r), 4)
    assertUndoRestored(before, s.undoAction())
    r = turn(s, 0, 'pig-market')
    assert.equal(reorg(r).find(z => z.id === 'pasture-0')?.capacity, 4)
    r = assign(s, 0, [house(), zone('pasture-0', 'boar', 4, 'pasture')])
    assert.equal(boars(r), 4)
  })
  it("stable multiplication precedes exactly two additional animals", () => {
    for (const [size, stableCount, capacity] of [[1, 1, 6], [2, 1, 10], [2, 2, 18]]) {
      const s = setup({ card: TROUGH, played: true, pastureSize: size, stableCount, houseSheep: true, markets: { 'pig-market': { boar: capacity + 1 } } })
      let r = turn(s, 0, 'pig-market')
      assert.equal(reorg(r).find(z => z.id === 'pasture-0')?.capacity, capacity)
      assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: [house(), zone('pasture-0', 'boar', capacity + 1, 'pasture')] }))
      r = assign(s, 0, [house(), zone('pasture-0', 'boar', capacity, 'pasture')])
      assert.equal(boars(r), capacity)
    }
  })
  it("house unfenced stable and Mud Patch are not enlarged pastures", () => {
    const s = setup({ card: TROUGH, played: true, mudAlso: true, emptyFields: 1, looseStable: true, markets: { 'pig-market': { boar: 4 } } })
    const r = turn(s, 0, 'pig-market')
    const zs = reorg(r)
    const stable = zs.find(z => z.zoneType === 'stable')
    assert.ok(stable)
    assert.deepEqual([zs.find(z => z.id === 'house:2-0')?.capacity, stable.capacity, mudCapacity(r)], [1, 1, 1])
    for (const target of [zone('house:2-0', 'boar', 2, 'house'), zone(stable.id, 'boar', 2, 'stable'), zone(`card:${MUD}`, 'boar', 2)])
      assertRejectedUnchanged(s, () => s.resolveChoice(0, 'confirm', { zones: [target] }))
    const done = assign(s, 0, [zone('house:2-0', 'boar', 1, 'house'), zone(stable.id, 'boar', 1, 'stable'), zone(`card:${MUD}`, 'boar', 1)])
    assert.equal(boars(done), 3)
  })
  it("each own pasture gains two while opponent receives no bonus", () => {
    const s = setup({ card: TROUGH, played: true, pastureSize: 1, twoPastures: true, opponentPasture: true, houseSheep: true, markets: { 'pig-market': { boar: 9 }, 'sheep-market': { sheep: 4 }, 'cattle-market': { cattle: 5 } } })
    let r = turn(s, 0, 'pig-market')
    assert.deepEqual(reorg(r).filter(z => z.zoneType === 'pasture').map(z => z.capacity), [4, 4])
    assign(s, 0, [house(), zone('pasture-0', 'boar', 4, 'pasture')])
    r = turn(s, 1, 'sheep-market')
    assert.equal(reorg(r).find(z => z.zoneType === 'pasture')?.capacity, 2)
    assign(s, 1, [zone(reorg(r).find(z => z.zoneType === 'pasture')!.id, 'sheep', 2, 'pasture')])
    r = turn(s, 0, 'cattle-market')
    assert.equal(r.state.players[0]!.resources.cattle, 5)
    r = assign(s, 0, [house(), zone('pasture-0', 'boar', 4, 'pasture'), zone('pasture-1', 'cattle', 4, 'pasture')])
    assert.deepEqual({ boar: boars(r), cattle: r.state.players[0]!.resources.cattle, opponentSheep: r.state.players[1]!.resources.sheep }, { boar: 4, cattle: 4, opponentSheep: 2 })
    finished(r)
  })
})
