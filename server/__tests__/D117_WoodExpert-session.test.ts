import type { ActionChoiceOption } from '../../shared/contract/types'
import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/D/D117_WoodExpert'
import '../../shared/cards/B/B081_Handcart'
import '../../shared/cards/B/B043_Chophouse'
import assert from 'node:assert/strict'
import { type Resource } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const evidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'D117_WoodExpert'

const setup = (opts?: {
  food?: number
  wood?: number
  clay?: number
  minor?: string
}) => {
  const session = evidence.track(createWorkSession({ seed: 1 }))
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = {
    ...player.resources,
    food: opts?.food ?? 10,
    wood: opts?.wood ?? 0,
    clay: opts?.clay ?? 0,
  }
  if (!player.occupationPlayed.includes(CARD_ID)) {
    player.occupationPlayed.push(CARD_ID)
  }
  player.minorHand = opts?.minor ? [opts.minor] : ['__test_placeholder__']
  setWorkersAtHome(state, state.players[1]!, 2)

  const majorImprovement = state.actionSpaces.find((space) => space.id === 'major-improvement')
  if (!majorImprovement) throw new Error('major-improvement missing')
  majorImprovement.takenBy = []

  session.loadState(state)
  return session
}

const chooseMinor = (
  session: GameSession,
  response: ReturnType<GameSession['takeAction']>,
  cardId: string,
) => {
  if (response.state.players[0]!.minorPlayed.includes(cardId)) return response
  if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'prompt.selectPayment') return response
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const branch = getChoiceOptions(response).find(entry => entry.value.startsWith('action-improvement-'))
  if (branch) response = session.resolveChoice(0, branch.value)
  const option = getChoiceOptions(response).find((entry) => entry.value === cardId)
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

describe('D117_WoodExpert session — card-purchase cost candidates', () => {
  it('cost wood:1 minor + food=10 wood=2 → multi-solution choice', () => {
    const session = setup({ food: 10, wood: 2, minor: 'B081_Handcart' })
    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId !== 'wait') return
    resp = chooseMinor(session, resp, 'B081_Handcart')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('prompt.selectPayment')
    expect(getChoiceOptions(resp)?.length).toBeGreaterThanOrEqual(2)
  })

  it('cost wood minor + food=10 wood=0 → only trade affordable, auto-select', () => {
    const session = setup({ food: 10, wood: 0, minor: 'B081_Handcart' })
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.interaction.stateId !== 'wait') return
    resp = chooseMinor(session, resp, 'B081_Handcart')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.food).toBe(9) // -1 food (trade)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
  })

  it('cost wood minor + food=0 wood=2 → only base affordable, auto-select', () => {
    const session = setup({ food: 0, wood: 2, minor: 'B081_Handcart' })
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.interaction.stateId !== 'wait') return
    resp = chooseMinor(session, resp, 'B081_Handcart')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.wood).toBe(1) // -1 wood
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('cost wood:1 minor → D117 candidate + base wood=1 → both solutions affordable', () => {
    const session = setup({ food: 10, wood: 1, minor: 'B081_Handcart' })
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.interaction.stateId !== 'wait') return
    resp = chooseMinor(session, resp, 'B081_Handcart')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(getChoiceOptions(resp)?.length).toBeGreaterThanOrEqual(2)
  })

  it('altCosts minor (B43 Chophouse altCosts:[{wood:2},{clay:2}]) → wood-base + D117 candidate + clay-base', () => {
    // D117 appends one candidate for the wood fee and leaves the clay fee alone.
    const session = setup({ food: 10, wood: 2, clay: 2, minor: 'B043_Chophouse' })
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.interaction.stateId !== 'wait') return
    resp = chooseMinor(session, resp, 'B043_Chophouse')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('prompt.selectPayment')
    expect(getChoiceOptions(resp)?.length).toBeGreaterThanOrEqual(3)
    const getPaid = (option: ActionChoiceOption) => option.effectPreview?.kind === 'payment'
      ? option.effectPreview.resourcesPaid : undefined
    const woodBase = getChoiceOptions(resp)?.find((o) => {
      const paid = getPaid(o)
      return !!paid && (paid.wood ?? 0) === 2 && (paid.clay ?? 0) === 0 && (paid.food ?? 0) === 0
    })
    const woodTrade = getChoiceOptions(resp)?.find((o) => {
      const paid = getPaid(o)
      return !!paid && (paid.wood ?? 0) === 0 && (paid.clay ?? 0) === 0 && (paid.food ?? 0) === 1
    })
    const clayBase = getChoiceOptions(resp)?.find((o) => {
      const paid = getPaid(o)
      return !!paid && (paid.wood ?? 0) === 0 && (paid.clay ?? 0) === 2 && (paid.food ?? 0) === 0
    })
    expect(woodBase).toBeDefined()
    expect(woodTrade).toBeDefined()
    expect(clayBase).toBeDefined()
  })

  it('altCosts minor + food=10 wood=2 clay=0 → wood-base + D117 candidate (clay alt unaffordable)', () => {
    // food=10 wood=2 clay=0 — wood-base (wood:2) and D117 candidate (wood:0+food:1)
    // are affordable; clay-base alt (clay:2) is not.
    const session = setup({ food: 10, wood: 2, clay: 0, minor: 'B043_Chophouse' })
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.interaction.stateId !== 'wait') return
    resp = chooseMinor(session, resp, 'B043_Chophouse')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(getChoiceOptions(resp)?.length).toBeGreaterThanOrEqual(2)
    const getPaid = (option: ActionChoiceOption) => option.effectPreview?.kind === 'payment'
      ? option.effectPreview.resourcesPaid : undefined
    const woodBase = getChoiceOptions(resp)?.find((o) => {
      const paid = getPaid(o)
      return !!paid && (paid.wood ?? 0) === 2 && (paid.clay ?? 0) === 0 && (paid.food ?? 0) === 0
    })
    const woodTrade = getChoiceOptions(resp)?.find((o) => {
      const paid = getPaid(o)
      return !!paid && (paid.wood ?? 0) === 0 && (paid.clay ?? 0) === 0 && (paid.food ?? 0) === 1
    })
    expect(woodBase).toBeDefined()
    expect(woodTrade).toBeDefined()
  })
})

describe('D117 rule boundaries', () => {

  function options(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    assert.ok(r.interaction.stateId === 'wait', JSON.stringify(r.interaction))
    const request = r.interaction.request
    assert.ok(request.kind === 'choice', JSON.stringify(request))
    return request.options
  }

  function enterImprovement(s: GameSession, actor = 0, space = 'meeting-place') {
    let r = s.takeAction(actor, space)
    const branch = options(r).find(o => o.value.startsWith('action-improvement-'))
    if (branch)
      r = s.resolveChoice(actor, branch.value)
    return r
  }

  function chooseCard(s: GameSession, r: SessionResponse, card: string, actor = 0) {
    assert.ok(options(r).some(o => o.value === card), JSON.stringify(r.interaction))
    const selected = s.resolveChoice(actor, card)
    assert.equal(selected.ok, true, selected.error)
    assert.ok(selected.interaction.stateId === 'wait' && selected.interaction.request.kind === 'confirm-next-player', JSON.stringify(selected.interaction))
    assert.equal(selected.interaction.playerIndex, actor)
    assert.equal(selected.state.currentPlayerIndex, actor)
    return selected
  }

  function woodExpert(resources: Partial<Resource> = {}, played = true) {
    return evidence.track(createWorkSession({
      seed: 3117, configure(state) {
        state.round = 14
        const p = state.players[0]!
        p.occupationPlayed = played ? ['D117_WoodExpert'] : []
        p.occupationHand = played ? ['__test_placeholder__'] : ['D117_WoodExpert', 'A116_WoodCutter']
        p.minorHand = ['D033_SummerHouse', 'B081_Handcart', 'E047_SyrupTap', 'B007_Wage']
        Object.assign(p.resources, { wood: 0, clay: 0, stone: 0, food: 0, ...resources })
      }
    }))
  }

  const costObserved = (r: SessionResponse) => ({ wood: r.state.players[0]!.resources.wood, stone: r.state.players[0]!.resources.stone, food: r.state.players[0]!.resources.food, built: r.state.players[0]!.minorPlayed.includes('D033_SummerHouse') })

  it("first Lessons grants exactly two wood only on actual play", () => {
    const s = woodExpert({}, false)
    let r = s.takeAction(0, 'lessons')
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'missing-occupation'))
    r = chooseCard(s, r, 'D117_WoodExpert')
    assert.equal(r.ok, true, r.error)
    assert.equal(r.state.players[0]!.resources.wood, 2)
    assert.deepEqual(r.state.players[0]!.occupationPlayed, ['D117_WoodExpert'])
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'D117_WoodExpert'))
  })

  it("one food replaces exactly two of three wood and preserves stone payment", () => {
    const s = woodExpert({ wood: 1, food: 1, stone: 1 })
    const r = chooseCard(s, enterImprovement(s), 'D033_SummerHouse')
    assert.equal(r.ok, true, r.error)
    assert.deepEqual(costObserved(r), { wood: 0, stone: 0, food: 0, built: true })
  })

  it("discount cap rejects zero wood for a three wood card before free retry", () => {
    const s = woodExpert({ food: 1, stone: 1 })
    const r = enterImprovement(s)
    assert.equal(options(r).some(o => o.value === 'D033_SummerHouse'), false)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'D033_SummerHouse'))
    const retry = chooseCard(s, r, 'B007_Wage')
    assert.deepEqual(costObserved(retry), { wood: 0, stone: 1, food: 3, built: false })
  })

  it("missing stone cannot be replaced by food before a legal free retry", () => {
    const s = woodExpert({ food: 1 })
    const r = enterImprovement(s)
    assert.equal(options(r).some(o => o.value === 'E047_SyrupTap'), false)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'E047_SyrupTap'))
    const retry = chooseCard(s, r, 'B007_Wage')
    assert.equal(retry.state.players[0]!.resources.food, 3)
    assert.equal(retry.state.players[0]!.resources.stone, 0)
    assert.equal(retry.state.players[0]!.minorPlayed.includes('E047_SyrupTap'), false)
  })

  it("original wood payment and smaller optional food payment both remain legal", () => {
    for (const resources of [{ wood: 1 }, { food: 1 }]) {
      const s = woodExpert(resources)
      const r = chooseCard(s, enterImprovement(s), 'B081_Handcart')
      assert.equal(r.ok, true, r.error)
      assert.deepEqual([r.state.players[0]!.resources.wood, r.state.players[0]!.resources.food], [0, 0])
      assert.ok(r.state.players[0]!.minorPlayed.includes('B081_Handcart'))
    }
  })

  it("clay only Fireplace never adds a food fee", () => {
    const s = woodExpert({ clay: 2, food: 1 })
    const r = chooseCard(s, enterImprovement(s, 0, 'major-improvement'), 'Major_Fireplace1')
    assert.equal(r.ok, true, r.error)
    assert.deepEqual([r.state.players[0]!.resources.clay, r.state.players[0]!.resources.food], [0, 1])
  })

  it("undo restores all discounted cost components before legal retry", () => {
    const s = woodExpert({ wood: 1, food: 1, stone: 1 })
    chooseCard(s, enterImprovement(s), 'D033_SummerHouse')
    const undone = s.undoAction()
    assert.equal(undone.ok, true, undone.error)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, 0)
    assert.deepEqual(costObserved(undone), { wood: 1, stone: 1, food: 1, built: false })
    assert.equal(undone.state.actionSpaces.flatMap(space => space.takenBy).filter(worker => worker.playerId === undone.state.players[0]!.id).length, 0)
    const retry = chooseCard(s, enterImprovement(s), 'D033_SummerHouse')
    assert.deepEqual(costObserved(retry), { wood: 0, stone: 0, food: 0, built: true })
  })

  it("stable construction still costs two wood and cannot use the food replacement", () => {
    for (const wood of [1, 2]) {
      const s = woodExpert({ wood, food: 1 })
      if (wood === 1) {
        assertRejectedUnchanged(s, () => s.takeAction(0, 'farm-expansion'))
        assert.equal(s.getState().state.players[0]!.resources.food, 1)
      }
      else {
        const entered = s.takeAction(0, 'farm-expansion')
        assert.equal(entered.ok, true, entered.error)
        const r = s.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] })
        assert.equal(r.ok, true, r.error)
        assert.deepEqual([r.state.players[0]!.resources.wood, r.state.players[0]!.resources.food, r.state.players[0]!.stableTiles.length], [0, 1, 1])
        assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
        assert.equal(r.interaction.playerIndex, 0)
        assert.equal(r.state.currentPlayerIndex, 0)
      }
    }
  })

  it("major Joinery wood cost is fully replaced while its stone cost remains", () => {
    const s = woodExpert({ food: 1, stone: 2 })
    const r = chooseCard(s, enterImprovement(s, 0, 'major-improvement'), 'Major_Joinery')
    assert.equal(r.ok, true, r.error)
    assert.deepEqual([r.state.players[0]!.resources.wood, r.state.players[0]!.resources.food, r.state.players[0]!.resources.stone], [0, 0, 0])
    assert.ok(r.state.players[0]!.improvements.includes('Major_Joinery'))
  })
})
