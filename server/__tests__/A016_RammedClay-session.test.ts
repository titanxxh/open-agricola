import { expectWait } from './_helpers/trigger-select'
import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { A016_RammedClay } from '../../shared/cards/A/A016_RammedClay'
import assert from 'node:assert/strict'
import { type GameState, type PlayerState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
const sessionEvidence = createScenarioEvidence(import.meta.url)
const CARD_ID = 'A016_RammedClay'
const FILLER = '__test_placeholder__'
const ONE_CELL_FENCES = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']

const setup = ({ played = false, wood = 0, clay = 0 } = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 7016, options: { playerCount: 2 } }))
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
  ? getChoiceOptions(response) ?? []
  : []

const playMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  for (let guard = 0; guard < 6 && response.state.players[0]!.minorHand.includes(CARD_ID); guard += 1) {
    if (response.interaction.stateId !== 'wait') break
    const card = options(response).find((option) => option.value === CARD_ID)
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    const next = card ?? branch
    if (!next) break
    response = session.resolveChoice(expectWait(response).interaction.playerIndex, next.value)
  }
  return response
}

const buildFences = (session: GameSession, paid: { wood: number
  clay: number }) => {
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
      const preview = option.effectPreview
      const resources = preview && 'resourcesPaid' in preview ? preview.resourcesPaid : undefined
      return resources?.wood === paid.wood && resources?.clay === paid.clay
    })
    expect(payment, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(expectWait(response).interaction.playerIndex, payment!.value)
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
describe("A016 command boundaries", () => {
  const RAMMED = 'A016_RammedClay', RECLAMATION = 'A017_ReclamationPlow', HANDPLOW = 'A019_Handplow'
  const ONE = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2']
  function setup(card: string, { played = true, round = 5, resources = {}, configure = () => { } }: {
    played?: boolean
    round?: number
    resources?: Partial<PlayerState['resources']>
    configure?: (state: GameState) => void
  } = {}) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
        state.round = round
        state.players.forEach(p => {
          p.minorHand = ['B007_Wage', 'A054_Credit']
          p.occupationHand = ['__test_placeholder__']
          p.minorPlayed = []
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
        })
        const p = state.players[0]!
        if (played)
          p.minorPlayed = [card]
        else
          p.minorHand.push(card)
        Object.assign(p.resources, resources)
        configure(state)
      } }))
    return s
  }
  function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r; }
  function choices(r: SessionResponse): import('../../shared/contract/types').ActionChoiceOption[] {
    ok(r)
    assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function enter(s: GameSession) {
    let r = ok(s.takeAction(0, 'meeting-place'))
    const branch = choices(r).find(o => o.value.startsWith('action-improvement-'))
    if (branch)
      r = ok(s.resolveChoice(0, branch.value))
    return r
  }
  function buy(s: GameSession, r: SessionResponse, card: string) {
    assert.ok(choices(r).some(o => o.value === card && !('disabled' in o && o.disabled)))
    const played = ok(s.resolveChoice(0, card))
    if ([RAMMED, RECLAMATION, HANDPLOW].includes(card)) {
      assert.equal(played.state.players[0]!.minorPlayed.includes(card), true)
      assert.equal(played.state.players[0]!.minorHand.includes(card), false)
      const events = played.state.events.filter(event => event.type === 'card.played' && event.cardId === card)
      assert.equal(events.length, 1)
      const event = events[0]!
      assert.ok(event.type === 'card.played')
      assert.equal(event.actorPlayerId, played.state.players[0]!.id)
      assert.deepEqual(event.payment?.resources ?? {}, card === RAMMED ? {} : { wood: 1 })
      if (card === RAMMED) {
        const gains = played.state.events.filter(e => e.type === 'resource.moved' && e.sourceCardId === RAMMED && e.reason === 'cardEffect')
        assert.equal(gains.length, 1)
        const gain = gains[0]!
        assert.ok(gain.type === 'resource.moved')
        assert.deepEqual(gain.resources, { clay: 1 })
      }
    }
    return played
  }
  function fence(s: GameSession, wood: number, clay: number) {
    const entered = ok(s.takeAction(0, 'fencing'))
    assert.ok(entered.interaction.stateId === 'wait' && entered.interaction.request.kind === 'farm-select' && entered.interaction.request.farm.farmType === 'fence')
    let r = ok(s.commitSelectionChoice(0, { edges: ONE, palisadeEdges: [], extraWood: 0 }))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const payments = choices(r)
      assert.ok(payments.every(o => o.effectPreview?.kind !== 'payment' || Object.values(o.effectPreview.resourcesPaid ?? {}).reduce<number>((a, n) => a + (n ?? 0), 0) === 4))
      const option = payments.find(o => o.effectPreview && 'resourcesPaid' in o.effectPreview && (o.effectPreview.resourcesPaid?.wood ?? 0) === wood && (o.effectPreview.resourcesPaid?.clay ?? 0) === clay)
      assert.ok(option, JSON.stringify(r.interaction))
      assertRejectedUnchanged(s, () => s.resolveChoice(0, 'pay:fencing:forged-three-clay'))
      r = ok(s.resolveChoice(0, option.value))
      assertRejectedUnchanged(s, () => s.resolveChoice(0, option.value))
    }
    assert.equal(r.state.players[0]!.fenceSegments.length, 4)
    assert.equal(r.state.players[0]!.pastures.length, 1)
    assert.ok(r.scores)
    const score = r.scores[0]!.categories.find(category => category.key === 'pastures')
    assert.equal(score?.quantity, 1)
    assert.equal(score?.total, 1)
    return r
  }
  it("actual free purchase gains exactly one clay once with reversible ownership", () => {
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
  it("pure clay mixed and original wood each pay exactly four units for four fences", () => {
    for (const [wood, clay] of [[0, 4], [2, 2], [4, 0]]) {
      const s = setup(RAMMED, { resources: { wood, clay } })
      const r = fence(s, wood, clay)
      assert.deepEqual([r.state.players[0]!.resources.wood, r.state.players[0]!.resources.clay], [0, 0])
    }
  })
  it("three total building units cannot forge four fences before a legal action retry", () => {
    const s = setup(RAMMED, { resources: { wood: 1, clay: 2 } })
    assertRejectedUnchanged(s, () => s.takeAction(0, 'fencing'))
    const r = ok(s.takeAction(0, 'grain-seeds'))
    assert.deepEqual([r.state.players[0]!.fenceSegments.length, r.state.players[0]!.resources.wood, r.state.players[0]!.resources.clay, r.state.players[0]!.resources.grain], [0, 1, 2, 1])
  })
  it("invalid fence geometry rejects before clay payment and a legal enclosed retry", () => {
    const s = setup(RAMMED, { resources: { clay: 4 } })
    const r = ok(s.takeAction(0, 'fencing'))
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select')
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { edges: ONE.slice(0, 3), palisadeEdges: [], extraWood: 0 }))
    const built = ok(s.commitSelectionChoice(0, { edges: ONE, palisadeEdges: [], extraWood: 0 }))
    assert.equal(built.state.players[0]!.fenceSegments.length, 4)
    assert.equal(built.state.players[0]!.resources.clay, 0)
  })
  it("opponents card and non fencing costs cannot consume clay as wood", () => {
    const foreign = setup(RAMMED, { resources: { clay: 4 }, configure(state) { state.players[0]!.minorPlayed = []; state.players[1]!.minorPlayed = [RAMMED]; } })
    assertRejectedUnchanged(foreign, () => foreign.takeAction(0, 'fencing'))
    assert.equal(ok(foreign.takeAction(0, 'grain-seeds')).state.players[0]!.resources.clay, 4)
    const s = setup(RAMMED, { resources: { clay: 4, stone: 1 }, configure(state) { state.players[0]!.minorHand.push('E047_SyrupTap'); } })
    assertRejectedUnchanged(s, () => s.takeAction(0, 'farm-expansion'))
    const r = enter(s)
    assert.equal(choices(r).some(o => o.value === 'E047_SyrupTap' && !('disabled' in o && o.disabled)), false)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'E047_SyrupTap'))
    const retry = buy(s, r, 'A054_Credit')
    assert.deepEqual([retry.state.players[0]!.resources.clay, retry.state.players[0]!.resources.stone], [4, 1])
  })
  it("undo restores clay wood finite fences and worker before legal fencing retry", () => {
    const s = setup(RAMMED, { resources: { wood: 2, clay: 2 } })
    const before = undoRuleSnapshot(s.getState())
    fence(s, 2, 2)
    assertUndoRestored(before, s.undoAction())
    assert.deepEqual([fence(s, 2, 2).state.players[0]!.fenceSegments.length, s.getState().state.players[0]!.resources.clay], [4, 0])
  })
  it("multiple legal payment choices reject forged underpayment before exact mixed retry", () => {
    const s = setup(RAMMED, { resources: { wood: 4, clay: 4 } })
    const r = fence(s, 2, 2)
    assert.deepEqual([r.state.players[0]!.resources.wood, r.state.players[0]!.resources.clay], [2, 2])
  })
})
