import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { A016_RammedClay } from '../../shared/cards/A/A016_RammedClay'
import '../../shared/cards/A/A017_ReclamationPlow'
import '../../shared/cards/A/A019_Handplow'
import '../../shared/cards/A/A009_YoungAnimalMarket'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit05Fields from './_helpers/audit/ae-negative-05-fields'

const CARD_ID = 'A016_RammedClay'
const FILLER = '__test_placeholder__'
const ONE_CELL_FENCES = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']

const setup = ({ played = false, wood = 0, clay = 0 } = {}) => {
  const session = new GameSession(7016, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.activeModifiers = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.activeModifiers = played ? [...(A016_RammedClay.impl.modifiers ?? [])] : []
  owner.resources.wood = wood
  owner.resources.clay = clay
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const playMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  for (let guard = 0; guard < 6 && response.state.players[0]!.minorHand.includes(CARD_ID); guard += 1) {
    if (response.interaction.stateId !== 'wait') break
    const card = options(response).find((option) => option.value === CARD_ID)
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    const next = card ?? branch
    if (!next) break
    response = session.resolveChoice(response.interaction.playerIndex, next.value)
  }
  return response
}

const buildFences = (session: GameSession, paid: { wood: number; clay: number }) => {
  let response = session.takeAction(0, 'fencing')
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'fence' } },
  })
  response = session.commitSelectionChoice(0, {
    edges: ONE_CELL_FENCES, palisadeEdges: [], extraWood: 0,
  })
  if (response.interaction.stateId === 'wait'
    && response.interaction.promptKey === 'prompt.selectPayment') {
    const payment = options(response).find((option) => {
      const resources = option.effectPreview?.resourcesPaid
        ?? (option.labelParams as { resourcesPaid?: Record<string, number> } | undefined)?.resourcesPaid
      return resources?.wood === paid.wood && resources?.clay === paid.clay
    })
    expect(payment, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, payment!.value)
  }
  return response
}

describe('A016 Rammed Clay parity', () => {
  it('A016 S1: playing Rammed Clay for free immediately gains one clay', () => {
    const response = playMinor(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(1)
  })

  it('A016 S2: four clay can replace all four wood when fencing one pasture', () => {
    const response = buildFences(setup({ played: true, clay: 4 }), { wood: 0, clay: 4 })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0 })
  })

  it('A016 S3: wood and clay can be mixed in the same fencing payment', () => {
    const response = buildFences(setup({ played: true, wood: 2, clay: 2 }), { wood: 2, clay: 2 })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0 })
  })
})

describe('ae-negative-05-fields', () => {
  const { RAMMED, ONE, sessions, setup, ok, choices, enter, buy, fence } = audit05Fields
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A016 N1 actual free purchase gains exactly one clay once with reversible ownership', () => {
    const s = setup(RAMMED, { played: false })
    const before = undoRuleSnapshot(s.getState())
    const offer = enter(s)
    assert.equal(offer.state.players[0]!.resources.clay, 0)
    const r = buy(s, offer, RAMMED)
    assert.equal(r.state.players[0]!.resources.clay, 1)
    assert.equal(r.state.players[0]!.minorPlayed.includes(RAMMED), true)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, RAMMED))
    assertUndoRestored(before, s.undoAction())
    assert.equal(buy(s, enter(s), RAMMED).state.players[0]!.resources.clay, 1)
  })
  it('A016 N2 pure clay mixed and original wood each pay exactly four units for four fences', () => {
    for (const [wood, clay] of [[0,4],[2,2],[4,0]]) {
      const s = setup(RAMMED, { resources: { wood, clay } })
      const r = fence(s, wood, clay)
      assert.deepEqual([r.state.players[0]!.resources.wood, r.state.players[0]!.resources.clay], [0,0])
    }
  })
  it('A016 N3 three total building units cannot forge four fences before a legal action retry', () => {
    const s = setup(RAMMED, { resources: { wood: 1, clay: 2 } })
    assertRejectedUnchanged(s, () => s.takeAction(0, 'fencing'))
    const r = ok(s.takeAction(0, 'grain-seeds'))
    assert.deepEqual([r.state.players[0]!.fenceSegments.length,r.state.players[0]!.resources.wood,r.state.players[0]!.resources.clay,r.state.players[0]!.resources.grain], [0,1,2,1])
  })
  it('A016 N4 invalid fence geometry rejects before clay payment and a legal enclosed retry', () => {
    const s = setup(RAMMED, { resources: { clay: 4 } })
    const r = ok(s.takeAction(0, 'fencing'))
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select')
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { edges: ONE.slice(0,3), palisadeEdges: [], extraWood: 0 }))
    const built = ok(s.commitSelectionChoice(0, { edges: ONE, palisadeEdges: [], extraWood: 0 }))
    assert.equal(built.state.players[0]!.fenceSegments.length, 4)
    assert.equal(built.state.players[0]!.resources.clay, 0)
  })
  it('A016 N5 opponents card and non fencing costs cannot consume clay as wood', () => {
    const foreign = setup(RAMMED, { resources: { clay: 4 }, configure(state) { state.players[0]!.minorPlayed=[]; state.players[1]!.minorPlayed=[RAMMED] } })
    assertRejectedUnchanged(foreign, () => foreign.takeAction(0, 'fencing'))
    assert.equal(ok(foreign.takeAction(0, 'grain-seeds')).state.players[0]!.resources.clay, 4)
    const s = setup(RAMMED, { resources: { clay: 4, stone: 1 }, configure(state) { state.players[0]!.minorHand.push('E047_SyrupTap') } })
    assertRejectedUnchanged(s, () => s.takeAction(0, 'farm-expansion'))
    const r = enter(s)
    assert.equal(choices(r).some(o => o.value === 'E047_SyrupTap' && !('disabled' in o && o.disabled)), false)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'E047_SyrupTap'))
    const retry = buy(s, r, 'A054_Credit')
    assert.deepEqual([retry.state.players[0]!.resources.clay,retry.state.players[0]!.resources.stone], [4,1])
  })
  it('A016 N6 undo restores clay wood finite fences and worker before legal fencing retry', () => {
    const s = setup(RAMMED, { resources: { wood: 2, clay: 2 } })
    const before = undoRuleSnapshot(s.getState())
    fence(s, 2, 2)
    assertUndoRestored(before, s.undoAction())
    assert.deepEqual([fence(s,2,2).state.players[0]!.fenceSegments.length,s.getState().state.players[0]!.resources.clay], [4,0])
  })
  it('A016 N7 multiple legal payment choices reject forged underpayment before exact mixed retry', () => {
    const s=setup(RAMMED,{resources:{wood:4,clay:4}})
    const r=fence(s,2,2)
    assert.deepEqual([r.state.players[0]!.resources.wood,r.state.players[0]!.resources.clay],[2,2])
  })
})
