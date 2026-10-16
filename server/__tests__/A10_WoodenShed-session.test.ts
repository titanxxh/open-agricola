import { expectWait } from './_helpers/trigger-select'
import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { getExtraRoomCapacity } from '../../shared/cards/card-effects'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { isMinorImprovementPlayable, playMinorImprovement } from '../../shared/actions/effects/improvement'
import { buildRenovationPlan, canRenovate } from '../../shared/actions/effects/renovation'

import { A010_WoodenShed } from '../../shared/cards/A/A010_WoodenShed'
import assert from 'node:assert/strict'
import { type PlayerState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { familySize } from '../../shared/domain/player'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
const sessionEvidence = createScenarioEvidence(import.meta.url)
const CARD_ID = 'A010_WoodenShed'

describe('A010_WoodenShed session', () => {
  const setup = () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    return session
  }

  it('prerequisite passes in wood house', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    expect(player.houseType).toBe('wood')
    expect(session.withCtx(() => meetsCardPrerequisites(player, A010_WoodenShed, state.round, state))).toBe(true)
  })

  it('prerequisite fails when house is clay', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.houseType = 'clay'
    expect(session.withCtx(() => meetsCardPrerequisites(player, A010_WoodenShed, state.round, state))).toBe(false)
  })

  it('adds +1 extra room capacity when played', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    expect(session.withCtx(() => getExtraRoomCapacity(player))).toBe(0)
    player.minorPlayed.push(CARD_ID)
    expect(session.withCtx(() => getExtraRoomCapacity(player))).toBe(1)
  })

  it('blocks direct renovation planning when played', () => {
    const session = setup()
    const player = session.getState().state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.clay = player.rooms
    player.resources.reed = 1

    expect(session.withCtx(() => buildRenovationPlan(player, 'clay'))).toBeNull()
    expect(session.withCtx(() => canRenovate(player))).toBe(false)
  })

  describe('Major-Improvement-action gate', () => {
    const givePayResources = (player: ReturnType<GameSession['getState']>['state']['players'][number]) => {
      player.resources.wood = 5
      player.resources.reed = 5
    }

    it('is not playable through the minor-improvement action space', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.minorHand.push(CARD_ID)
      givePayResources(player)
      expect(session.withCtx(() => isMinorImprovementPlayable(state, player, CARD_ID, 'improvement', undefined, ['minor'], undefined, session.actionHooks))).toBe(false)
    })

    it('is playable through the improvement-any (Major Improvement) action space', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.minorHand.push(CARD_ID)
      givePayResources(player)
      expect(session.withCtx(() => isMinorImprovementPlayable(state, player, CARD_ID, 'improvement-any', undefined, undefined, undefined, session.actionHooks))).toBe(true)
    })

    it('playMinorImprovement(actionCardId="minor-improvement") fails for A10', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.minorHand.push(CARD_ID)
      givePayResources(player)
      const result = session.withCtx(() => playMinorImprovement(state, player, CARD_ID, 'minor-improvement', undefined, undefined, undefined, session.actionHooks))
      expect(result.type).toBe('fail')
      expect(player.minorPlayed).not.toContain(CARD_ID)
    })

    it('playMinorImprovement(actionCardId="improvement-any") succeeds for A10', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.minorHand.push(CARD_ID)
      givePayResources(player)
      const result = session.withCtx(() => playMinorImprovement(state, player, CARD_ID, 'improvement-any', undefined, undefined, undefined, session.actionHooks))
      expect(result.type === 'ok' || result.type === 'flow').toBe(true)
      expect(player.minorPlayed).toContain(CARD_ID)
    })
  })
})
describe("A010 command boundaries", () => {
  const SHED = 'A010_WoodenShed'
  const MUD = 'A011_MudPatch'
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
  function finishGrowth(s: GameSession, r: SessionResponse) {
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
      r = choose(s, r, o => o.value === '__skip__' || o.value === '__done__')
    return r
  }
  it("actual purchase enforces cost wooden house and major permission with undo", () => {
    blockedPurchase(setup({ resources: { wood: 1, reed: 1 } }), SHED)
    blockedPurchase(setup({ resources: { wood: 2, reed: 0 } }), SHED)
    blockedPurchase(setup({ houseType: 'clay', resources: { wood: 2, reed: 1 } }), SHED)
    blockedPurchase(setup({ resources: { wood: 2, reed: 1 } }), SHED, 'meeting-place')
    const s = setup({ resources: { wood: 2, reed: 1 } })
    const before = undoRuleSnapshot(s.getState())
    let r = ok(purchase(s, SHED))
    assert.ok(r.state.players[0]!.minorPlayed.includes(SHED))
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.reed, 0)
    assertUndoRestored(before, s.undoAction())
    r = ok(purchase(s, SHED))
    assert.equal(r.state.players[0]!.rooms, 2)
  })
  it("actual growth uses exactly one extra room and undo restores the newborn", () => {
    const s = setup({ round: 5, played: true })
    turn(s, 0, 'grain-seeds')
    turn(s, 1, 'forest')
    ready(s, 0)
    const before = undoRuleSnapshot(s.getState())
    let r = finishGrowth(s, turn(s, 0, 'wish-children'))
    assert.equal(familySize(r.state.players[0]!), 3)
    assert.equal(r.state.players[0]!.rooms, 2)
    assertUndoRestored(before, s.undoAction())
    r = finishGrowth(s, turn(s, 0, 'wish-children'))
    assert.equal(familySize(r.state.players[0]!), 3)
    r = confirmNext(s, turn(s, 1, 'clay-pit'))
    assert.equal(r.state.round, 6)
    assert.equal(r.interaction.stateId, 'idle')
    assertRejectedUnchanged(s, () => s.takeAction(0, 'wish-children'))
    r = turn(s, 0, 'grain-seeds')
    assert.equal(familySize(r.state.players[0]!), 3)
  })
  it("Shed blocks renovation while renovation first excludes buying Shed", () => {
    const s = setup({ played: true, resources: { clay: 2, reed: 1, wood: 8 } })
    for (const id of ['house-redevelopment', 'farm-redevelopment'])
      assertRejectedUnchanged(s, () => s.takeAction(0, id))
    const control = setup({ resources: { clay: 2, reed: 1, wood: 2 } })
    let r = turn(control, 0, 'house-redevelopment')
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
      r = choose(control, r, o => o.value === '__skip__')
    assert.equal(r.state.players[0]!.houseType, 'clay')
    assert.equal(r.state.players[0]!.resources.clay, 0)
    assert.equal(r.state.players[0]!.resources.reed, 0)
    assert.ok(r.state.players[0]!.minorHand.includes(SHED))
    assertRejectedUnchanged(control, () => control.resolveChoice(0, SHED))
  })
  it("Angler grants the required major purchase permission", () => {
    const s = setup({ angler: true, resources: { wood: 2, reed: 1 } })
    const r = purchaseFrom(s, turn(s, 0, 'fishing'), SHED)
    assert.ok(r.state.players[0]!.minorPlayed.includes(SHED))
    assert.deepEqual({ wood: r.state.players[0]!.resources.wood, reed: r.state.players[0]!.resources.reed, food: r.state.players[0]!.resources.food }, { wood: 0, reed: 0, food: 41 })
  })
})
