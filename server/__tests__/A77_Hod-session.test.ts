import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import { setWorkersAtHome, workersAtHome } from '../../shared/domain/player'
import '../../shared/cards/A/A077_Hod'
import { type PlayerState } from '../../shared/contract/types'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import assert from 'node:assert/strict'
import { type ZoneAssignment } from '../../shared/actions/effects/reorganize'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { getAvailableStableSupplyCount, getOwnOrdinaryFenceReserveCount } from '../../shared/domain/supply-tokens'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

describe('A077_Hod session', () => {
  const setup = (currentPlayerIndex = 0) => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = currentPlayerIndex
    state.round = 1

    const owner = state.players[0]!
    owner.minorHand.push('A077_Hod')
    setWorkersAtHome(state, owner, 2)
    owner.resources.clay = 0
    // Give pasture for boar placement
    owner.pastures = [{
      id: 'p1', tiles: [{ row: 0, col: 1 }], animalType: null, animalCount: 0,
    }]
    owner.fenceSegments = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'].map(edge => ({
      edge, type: 'fence', source: { kind: 'own', ownerPlayerId: owner.id },
    }))
    owner.stableTiles = [{ row: 0, col: 1 }]

    const opponent = state.players[1]!
    setWorkersAtHome(state, opponent, 2)
    opponent.pastures = [{
      id: 'p2', tiles: [{ row: 0, col: 1 }], animalType: null, animalCount: 0,
    }]
    opponent.fenceSegments = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'].map(edge => ({
      edge, type: 'fence', source: { kind: 'own', ownerPlayerId: opponent.id },
    }))
    opponent.stableTiles = [{ row: 0, col: 1 }]

    // Ensure pig-market has accumulated resources
    const pigMarket = state.actionSpaces.find((s) => s.id === 'pig-market')
    if (pigMarket) pigMarket.resources.boar = 1

    session.loadState(state)
    session.devPlayCard(0, 'A077_Hod')
    return session
  }

  it('onBuy grants 1 clay', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const flow = session.withCtx(() => runCardEffectHook(state, player, 'A077_Hod', 'onBuy'))
    assert.ok(flow?.type === 'leaf')
    expect(flow.actionId).toBe('gain')
    expect(flow.params).toEqual({ clay: 1 })
  })

  it('owner gets 2 clay when owner uses pig-market', () => {
    const session = setup(0)
    const state = session.getState().state
    const clayBefore = state.players[0]!.resources.clay
    session.loadState(state)

    let resp = session.takeAction(0, 'pig-market')
    expect(resp.ok).toBe(true)

    // pig-market gives boar -> animalReorg
    if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'animal-reorg') {
      resp = session.resolveChoice(0, 'confirm', { zones: [
        { id: 'p1', zoneType: 'pasture', animalType: 'boar', animalCount: 1 },
      ] })
      expect(resp.ok, resp.error).toBe(true)
    }

    // Walk through player switches
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    expect(after.players[0]!.resources.clay).toBe(clayBefore + 2)
  })

  it('owner gets 2 clay when opponent uses pig-market', () => {
    const session = setup(1)
    const state = session.getState().state
    const ownerClayBefore = state.players[0]!.resources.clay
    session.loadState(state)

    let resp = session.takeAction(1, 'pig-market')
    expect(resp.ok).toBe(true)

    // pig-market gives boar -> animalReorg for opponent
    if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'animal-reorg') {
      resp = session.resolveChoice(1, 'confirm', { zones: [
        { id: 'p2', zoneType: 'pasture', animalType: 'boar', animalCount: 1 },
      ] })
      expect(resp.ok, resp.error).toBe(true)
    }

    // Walk through player switches for card effect
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    expect(after.players[0]!.resources.clay).toBe(ownerClayBefore + 2)
  })

  it('does not trigger on non-pig-market spaces', () => {
    const session = setup(0)
    const state = session.getState().state
    const clayBefore = state.players[0]!.resources.clay
    session.loadState(state)

    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    expect(after.players[0]!.resources.clay).toBe(clayBefore)
  })
})

describe('A077_Hod session', () => {
  const CARD_ID = 'A077_Hod'

  const setup = (currentPlayerIndex = 0, played = true) => {
    const session = sessionEvidence.track(createWorkSession({ seed: 6077, options: { playerCount: 2 } }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = currentPlayerIndex
    state.round = 1

    const owner = state.players[0]!
    owner.minorHand = played ? ['__test_placeholder__'] : [CARD_ID]
    owner.occupationHand = ['__test_placeholder__']
    owner.minorPlayed = played ? [CARD_ID] : []
    setWorkersAtHome(state, owner, 2)
    owner.resources.clay = 0
    owner.resources.wood = 1

    owner.pastures = [{
      id: 'p1', tiles: [{ row: 0, col: 1 }], animalType: null, animalCount: 0,
    }]
    owner.fenceSegments = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'].map(edge => ({
      edge, type: 'fence', source: { kind: 'own', ownerPlayerId: owner.id },
    }))
    owner.stableTiles = [{ row: 0, col: 1 }]

    const opponent = state.players[1]!
    opponent.minorHand = ['__test_placeholder__']
    opponent.occupationHand = ['__test_placeholder__']
    setWorkersAtHome(state, opponent, 2)
    opponent.pastures = [{
      id: 'p2', tiles: [{ row: 0, col: 1 }], animalType: null, animalCount: 0,
    }]
    opponent.fenceSegments = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'].map(edge => ({
      edge, type: 'fence', source: { kind: 'own', ownerPlayerId: opponent.id },
    }))
    opponent.stableTiles = [{ row: 0, col: 1 }]

    const pigMarket = state.actionSpaces.find((s) => s.id === 'pig-market')
    if (pigMarket) pigMarket.resources.boar = 1

    session.loadState(state)
    return session
  }

  it('A077 S1: paying one wood to play Hod immediately gains one clay', () => {
    const session = setup(0, false)
    let response = session.takeAction(0, 'major-improvement')
    if (response.state.players[0]!.minorHand.includes(CARD_ID) && response.interaction.stateId === 'wait') {
      if (!getChoiceOptions(response)?.some((option) => option.value === CARD_ID)) {
        const improvement = getChoiceOptions(response)?.find((option) =>
          option.value.startsWith('action-improvement-'))
        if (improvement) response = session.resolveChoice(0, improvement.value)
      }
      if (response.state.players[0]!.minorHand.includes(CARD_ID) && response.interaction.stateId === 'wait') {
        const card = getChoiceOptions(response)?.find((option) => option.value === CARD_ID)
        expect(card).toBeDefined()
        response = session.resolveChoice(0, card!.value)
      }
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 1 })
  })
})

describe("A077 command boundaries", () => {
  const HOD = 'A077_Hod', WAGE = 'B007_Wage'
  function setup({ played = true, resources = {}, pig = 1 }: {
    played?: boolean
    resources?: Partial<PlayerState['resources']>
    pig?: number
  } = {}) {
    const s = sessionEvidence.track(createWorkSession({ seed: 1077, configure: state => {
        state.round = 14
        state.availableMajorImprovements = []
        for (const p of state.players) {
          p.minorHand = ['__test_placeholder__']
          p.occupationHand = ['__test_placeholder__']
          p.minorPlayed = []
          p.occupationPlayed = []
          p.improvements = []
          p.cardStates = {}
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, food: 40, begging: 0 })
          {
            p.fenceSegments = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } }))
            p.pastures = [{ id: `accum-${p.id}`, tiles: [{ row: 0, col: 1 }], animalType: null, animalCount: 0 }]
            p.stableTiles = [{ row: 0, col: 1 }]
          }
        }
        const owner = state.players[0]!
        owner.minorHand = [...(!played ? [HOD, WAGE, 'A016_RammedClay'] : []), '__test_placeholder__']
        owner.minorPlayed = played ? [HOD] : []
        Object.assign(owner.resources, resources)
        state.actionSpaces.find(a => a.id === 'pig-market')!.resources.boar = pig
        state.actionSpaces.find(a => a.id === 'sheep-market')!.resources.sheep = 1
        state.actionSpaces.find(a => a.id === 'cattle-market')!.resources.cattle = 1
        state.actionSpaces.find(a => a.id === 'forest')!.resources.wood = 3
      } }))
    for (const p of s.state.players) {
      assert.equal(p.workers.length, 5)
      assert.equal(workersAtHome(s.state, p).length, 2)
      assert.equal(s.withCtx(() => getOwnOrdinaryFenceReserveCount(p)), 11)
      assert.equal(s.withCtx(() => getAvailableStableSupplyCount(s.state, p)), 3)
    }
    return s
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function opts(r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) {
    const before = ready(s, actor), r = ok(s.takeAction(actor, space))
    sessionEvidence.record('take-action', { command: 'takeAction', actor, space, before, response: r })
    return r
  }
  function choose(s: GameSession, r: SessionResponse, value: string) {
    assert.ok(r.interaction.stateId === 'wait')
    assert.ok(opts(r).some(o => o.value === value && !o.disabled))
    return ok(s.resolveChoice(r.interaction.playerIndex, value))
  }
  function menu(s: GameSession) {
    let r = turn(s, 0, 'meeting-place')
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const o = getChoiceOptions(r).find(o => o.value.startsWith('action-improvement-'))
      if (o)
        r = choose(s, r, o.value)
    }
    sessionEvidence.record('minor-menu', r)
    return r
  }
  function buy(s: GameSession, card: string) {
    const r = menu(s)
    assert.ok(opts(r).some(o => o.value === card && !o.disabled))
    const bought = choose(s, r, card)
    sessionEvidence.record('actual-purchase', { before: r, card, response: bought })
    return bought
  }
  function deny(s: GameSession, card: string) {
    const r = menu(s)
    assert.equal(opts(r).some(o => o.value === card && !o.disabled), false)
    const denied = assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
    sessionEvidence.record('rejected-native-card', { before: r, card, response: denied })
    const food = r.state.players[0]!.resources.food
    const retry = choose(s, r, WAGE)
    assert.equal(retry.state.players[0]!.resources.food - food, 2)
    assert.equal(retry.state.players[0]!.minorPlayed.includes(card), false)
    sessionEvidence.record('legal-original-pending-retry', retry)
  }
  function gainCount(r: SessionResponse, card: string) {
    return r.state.log.filter(e => e.key === 'log.cardEffectGain' && e.params?.cardId === card).length
  }
  function settle(s: GameSession, r: SessionResponse, actor: number, animal: 'sheep' | 'boar' | 'cattle') {
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg') {
      const count = r.state.players[actor]!.resources[animal]
      const zones: ZoneAssignment[] = [{ id: `accum-${r.state.players[actor]!.id}`, zoneType: 'pasture', animalType: animal, animalCount: count }]
      const input = r
      r = ok(s.resolveChoice(actor, 'confirm', { zones }))
      sessionEvidence.record('animal-reorg', { actor, zones, before: input, response: r })
    }
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    return r
  }
  function market(s: GameSession, actor = 0, space = 'pig-market', animal: 'sheep' | 'boar' | 'cattle' = 'boar') {
    return settle(s, turn(s, actor, space), actor, animal)
  }
  function purchaseUndo(s: GameSession, before: string) {
    const r = ok(s.undoAction())
    const normalize = (v: string) => JSON.parse(v, (key, value: unknown) => key === 'playedCards' ? undefined : value)
    assert.deepEqual(normalize(undoRuleSnapshot(r)), normalize(before))
    const packet = r.state.publicEventArchive.at(-1)
    assert.ok(packet?.type === 'publicEvents.canceled' && packet.reason === 'undoAction')
    sessionEvidence.record('purchase-undo', r)
  }
  it("live purchase shortage rejects before exact fee control", () => {
    deny(setup({ played: false }), HOD)
    const s = setup({ played: false, resources: { wood: 1 } })
    const r = buy(s, HOD)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, HOD))
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.clay, 1)
    assert.equal(gainCount(r, HOD), 1)
  })
  it("actual own and opponent Pig Market use rewards only holder", () => {
    for (const actor of [0, 1]) {
      const s = setup({ played: false, resources: { wood: 1 } })
      buy(s, HOD)
      if (actor === 0)
        turn(s, 1, 'forest')
      const r = market(s, actor)
      assert.equal(r.state.players[0]!.resources.clay, 3)
      assert.equal(r.state.players[1]!.resources.clay, 0)
      assert.equal(r.state.players[actor]!.resources.boar, 1)
      assert.equal(r.state.players[actor]!.pastures[0]!.animalCount, 1)
      assert.equal(gainCount(r, HOD), 2)
    }
  })
  it("multiple pigs other markets and in hand distinguish source", () => {
    const s = setup({ pig: 3 })
    const r = market(s)
    assert.equal(r.state.players[0]!.resources.clay, 2)
    assert.equal(r.state.players[0]!.resources.boar, 3)
    assert.equal(gainCount(r, HOD), 1)
    for (const [space, animal] of [['sheep-market', 'sheep'], ['cattle-market', 'cattle']] satisfies Array<[
      string,
      'sheep' | 'cattle'
    ]>) {
      const c = market(setup(), 0, space, animal)
      assert.equal(c.state.players[0]!.resources.clay, 0)
      assert.equal(c.state.players[0]!.resources[animal], 1)
    }
    const hand = market(setup({ played: false }))
    assert.equal(hand.state.players[0]!.resources.clay, 0)
    assert.equal(hand.state.players[0]!.resources.boar, 1)
  })
  it("occupied repeat rejects before legal remaining worker control", () => {
    const s = setup()
    market(s)
    turn(s, 1, 'forest')
    ready(s, 0)
    assertRejectedUnchanged(s, () => s.takeAction(0, 'pig-market'))
    const r = turn(s, 0, 'day-laborer')
    assert.equal(r.state.players[0]!.resources.clay, 2)
    assert.equal(r.state.players[0]!.resources.boar, 1)
    assert.equal(r.state.players[0]!.resources.food, 42)
    assert.equal(gainCount(r, HOD), 1)
  })
  it("actual purchase and both recipient undo restore before replay", () => {
    const purchase = setup({ played: false, resources: { wood: 1 } })
    const purchaseBefore = undoRuleSnapshot(purchase.getState())
    buy(purchase, HOD)
    purchaseUndo(purchase, purchaseBefore)
    assert.equal(buy(purchase, HOD).state.players[0]!.resources.clay, 1)
    for (const actor of [0, 1]) {
      const s = setup({ resources: { clay: 1 } })
      if (actor === 1)
        turn(s, 0, 'forest')
      const before = undoRuleSnapshot(ready(s, actor))
      market(s, actor)
      assertUndoRestored(before, s.undoAction())
      const r = market(s, actor)
      assert.equal(r.state.players[0]!.resources.clay, 3)
      assert.equal(r.state.players[actor]!.resources.boar, 1)
      assert.equal(gainCount(r, HOD), 1)
      sessionEvidence.record('Hod-actual-whole-use-undo-replay', r)
    }
  })
})
