import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/E/E146_Reseller'
import '../../shared/cards/E/E047_SyrupTap'
import '../../shared/cards/E/E030_ChildsToy'
import '../../shared/cards/B/B036_Bottles'
import '../../shared/cards/B/B007_Wage'
import '../../shared/cards/C/C054_MarketBooth'
import assert from 'node:assert/strict'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const evidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'E146_Reseller'
const FILLER = '__test_placeholder__'

const optionsOf = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? getChoiceOptions(response) ?? []
  : []

const setup = ({
  played = true, targetId, resources = {}, familySize = 2, flagged = false,
}: {
  played?: boolean
  targetId?: string
  resources?: Partial<{ wood: number; clay: number; reed: number; stone: number; food: number }>
  familySize?: number
  flagged?: boolean
} = {}) => {
  const session = evidence.track(createWorkSession({ seed: 6146, options: { playerCount: 3 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setActiveWorkerCount(player, index === 0 ? familySize : 2)
    setWorkersAtHome(state, player, index === 0 ? familySize : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: index === 0 ? 0 : 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      ...(index === 0 ? resources : {}),
    })
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  if (targetId) owner.minorHand = [targetId]
  if (flagged) owner.cardStates[CARD_ID] = { flagged: true }
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId === 'wait'
    && response.state.players[0]!.occupationHand.includes(CARD_ID)) {
    const card = optionsOf(response).find((option) => option.value === CARD_ID)
    expect(card, JSON.stringify(response.interaction, null, 2)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, card!.value)
  }
  return response
}

const playMinor = (
  session: GameSession, cardId: string, payment?: Partial<Record<string, number>>, actionId = 'meeting-place',
) => {
  let response = session.takeAction(0, actionId)
  for (let step = 0; step < 8 && response.state.players[0]!.minorHand.includes(cardId); step += 1) {
    if (response.interaction.stateId !== 'wait') break
    const interaction = response.interaction
    const candidates = optionsOf(response)
    const choice = candidates.find((option) => option.value === cardId)
      ?? candidates.find((option) => option.value.startsWith('action-improvement-'))
      ?? candidates.find((option) => {
        if (interaction.promptKey !== 'prompt.selectPayment') return false
        const preview = option.effectPreview
        if (preview?.kind !== 'payment' && preview?.kind !== 'resourceExchange') return false
        return payment && Object.entries(payment).every(([resource, count]) =>
          Object.entries(preview.resourcesPaid ?? {}).some(([key, amount]) => key === resource && amount === count))
      })
    expect(choice, JSON.stringify(response.interaction, null, 2)).toBeDefined()
    if (!choice) break
    response = session.resolveChoice(response.interaction.playerIndex, choice.value)
    expect(response.ok, response.error).toBe(true)
  }
  return response
}

const enterResellerOffer = (session: GameSession, initial: SessionResponse) => {
  let response = initial
  if (response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'select-trigger') {
    const trigger = optionsOf(response).find((option) =>
      option.value === CARD_ID || option.sourceCard === CARD_ID)
    expect(trigger, JSON.stringify(response.interaction, null, 2)).toBeDefined()
    if (trigger) response = session.resolveChoice(response.interaction.playerIndex, trigger.value)
  }
  return response
}

const acceptReseller = (session: GameSession, initial: SessionResponse) => {
  const response = enterResellerOffer(session, initial)
  if (response.state.players[0]!.cardStates[CARD_ID]?.flagged) return response
  expect(response.interaction.stateId).toBe('wait')
  const gain = optionsOf(response).find((option) =>
    option.value !== '__skip__' && option.sourceCard === CARD_ID)
  expect(gain, JSON.stringify(response.interaction, null, 2)).toBeDefined()
  return session.resolveChoice(response.interaction.stateId === 'wait'
    ? response.interaction.playerIndex
    : 0, gain!.value)
}

const resellerOffered = (response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait') return false
  return response.interaction.sourceCard === CARD_ID
    || optionsOf(response).some((option) =>
      option.value === CARD_ID || option.sourceCard === CARD_ID)
}

describe('E146 Reseller parity', () => {
  it('E146 S1: Reseller is played as the first occupation in a three-player game', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('E146 S2: accepting after a fixed-cost improvement returns its printed cost', () => {
    const session = setup({
      targetId: 'E047_SyrupTap', resources: { wood: 1, stone: 1 },
    })
    let response = playMinor(session, 'E047_SyrupTap')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 0 })

    response = acceptReseller(session, response)

    expect(response.state.players[0]!.minorPlayed).toContain('E047_SyrupTap')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, stone: 1 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(true)
  })

  it('E146 S3: declining a fixed-cost offer does not consume Reseller', () => {
    const session = setup({
      targetId: 'E047_SyrupTap', resources: { wood: 1, stone: 1 },
    })
    let response = enterResellerOffer(session, playMinor(session, 'E047_SyrupTap'))
    expect(response.interaction.stateId).toBe('wait')
    expect(optionsOf(response).some((option) => option.value === '__skip__')).toBe(true)

    response = session.resolveChoice(response.interaction.stateId === 'wait'
      ? response.interaction.playerIndex
      : 0, '__skip__')

    expect(response.state.players[0]!.minorPlayed).toContain('E047_SyrupTap')
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).not.toBe(true)
  })

  it('E146 S4: an alternative printed cost can be chosen independently of the paid cost', () => {
    const session = setup({
      targetId: 'E030_ChildsToy', resources: { clay: 1 },
    })
    let response = playMinor(session, 'E030_ChildsToy', { clay: 1 })
    expect(response.state.players[0]!.resources.clay).toBe(0)
    response = enterResellerOffer(session, response)
    expect(response.interaction.stateId).toBe('wait')
    const accept = optionsOf(response).find((option) =>
      option.value !== '__skip__' && option.sourceCard === CARD_ID)
    expect(accept, JSON.stringify(response.interaction, null, 2)).toBeDefined()
    response = session.resolveChoice(response.interaction.stateId === 'wait'
      ? response.interaction.playerIndex
      : 0, accept!.value)
    expect(optionsOf(response).some((option) =>
      option.effectPreview?.kind === 'resourceExchange' && option.effectPreview.resourcesGained?.wood === 1)).toBe(true)
    expect(optionsOf(response).some((option) =>
      option.effectPreview?.kind === 'resourceExchange' && option.effectPreview.resourcesGained?.clay === 1)).toBe(true)
    const wood = optionsOf(response).find((option) =>
      option.effectPreview?.kind === 'resourceExchange' && option.effectPreview.resourcesGained?.wood === 1)
    expect(wood, JSON.stringify(response.interaction, null, 2)).toBeDefined()

    response = session.resolveChoice(response.interaction.stateId === 'wait'
      ? response.interaction.playerIndex
      : 0, wood!.value)

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 0 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(true)
  })

  it('E146 S5: a dynamic printed cost uses the current family size', () => {
    const session = setup({
      targetId: 'B036_Bottles', resources: { clay: 3, food: 3 }, familySize: 3,
    })
    let response = playMinor(session, 'B036_Bottles')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: 0 })

    response = acceptReseller(session, response)

    expect(response.state.players[0]!.minorPlayed).toContain('B036_Bottles')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 3, food: 3 })
  })

  it('E146 S6: a free improvement creates no offer and does not consume Reseller', () => {
    const response = playMinor(setup({ targetId: 'B007_Wage' }), 'B007_Wage')

    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(response.state.players[1]!.minorHand).toContain('B007_Wage')
    expect(resellerOffered(response)).toBe(false)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).not.toBe(true)
  })

  it('E146 S7: component costs create no offer and preserve the later refund', () => {
    const session = setup({ targetId: 'C054_MarketBooth', resources: { wood: 1, stone: 1 } })
    const state = session.getState().state
    state.round = 14
    state.players[0]!.minorHand.push('E047_SyrupTap')
    session.loadState(state)
    let response = playMinor(session, 'C054_MarketBooth')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain('C054_MarketBooth')
    expect(response.state.players[0]!.supplyTokensConsumed?.stable).toBe(1)
    expect(resellerOffered(response)).toBe(false)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).not.toBe(true)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') confirmNextPlayer(session)
    response = playMinor(session, 'E047_SyrupTap', undefined, 'major-improvement')
    response = acceptReseller(session, response)
    expect(response.state.players[0]!.minorPlayed).toContain('E047_SyrupTap')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, stone: 1 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(true)
  })

  it('E146 S8: a used Reseller does not trigger for another fixed-cost improvement', () => {
    const response = playMinor(setup({
      targetId: 'E047_SyrupTap', resources: { wood: 1, stone: 1 }, flagged: true,
    }), 'E047_SyrupTap')

    expect(response.state.players[0]!.minorPlayed).toContain('E047_SyrupTap')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 0 })
    expect(resellerOffered(response)).toBe(false)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(true)
  })
})

describe('E146 rule boundaries', () => {

  function wait(response: SessionResponse) {
    assert.equal(response.ok, true, response.error)
    assert.ok(response.interaction.stateId === 'wait', JSON.stringify(response.interaction))
    return response.interaction
  }

  const RESELLER = 'E146_Reseller'

  function reseller({ wood = 1, stone = 1, clay = 1, discounted = false } = {}) {
    return evidence.track(createWorkSession({
      seed: 2146, options: { playerCount: 3 }, configure(state) {
        state.round = 14
        state.availableMajorImprovements = []
        const p = state.players[0]!
        p.occupationPlayed = discounted ? [RESELLER, 'A143_Stonecutter'] : [RESELLER]
        p.minorHand = ['E047_SyrupTap', 'E030_ChildsToy', 'B007_Wage', 'C054_MarketBooth']
        Object.assign(p.resources, { wood, stone, clay, food: 0, reed: 0 })
      }
    }))
  }

  function options(r: SessionResponse) {
    const request = wait(r).request
    assert.equal(request.kind, 'choice')
    assert.ok(request.kind === 'choice')
    return request.options
  }

  function playMinor(s: GameSession, cardId: string, action = 'meeting-place') {
    let r = s.takeAction(0, action)
    assert.equal(r.ok, true, r.error)
    for (let guard = 0; guard < 6 && r.state.players[0]!.minorHand.includes(cardId); guard++) {
      const available = options(r)
      const option = available.find(o => o.value === cardId)
        ?? available.find(o => o.value.startsWith('action-improvement-'))
        ?? available.find(o => (o.effectPreview?.kind === 'payment' || o.effectPreview?.kind === 'resourceExchange') && o.effectPreview.resourcesPaid?.clay === 1)
      assert.ok(option, JSON.stringify(r.interaction))
      r = s.resolveChoice(0, option.value)
      assert.equal(r.ok, true, r.error)
    }
    assert.ok(r.state.players[0]!.minorPlayed.includes(cardId) || r.state.players[1]!.minorHand.includes(cardId), cardId)
    return r
  }

  function acceptRefund(s: GameSession, initial: SessionResponse) {
    let r = initial
    const trigger = options(r).find(o => o.value === RESELLER)
    if (trigger) {
      r = s.resolveChoice(0, trigger.value)
      assert.equal(r.ok, true, r.error)
    }
    const option = options(r).find(o => o.sourceCard === RESELLER && o.value !== '__skip__')
    assert.ok(option, JSON.stringify(r.interaction))
    r = s.resolveChoice(0, option.value)
    assert.equal(r.ok, true, r.error)
    return { r, value: option.value }
  }

  const resellerObserved = (r: SessionResponse) => ({ wood: r.state.players[0]!.resources.wood, stone: r.state.players[0]!.resources.stone, clay: r.state.players[0]!.resources.clay, used: r.state.players[0]!.cardStates[RESELLER]?.flagged === true })

  function rotateToOwner(s: GameSession, initial: SessionResponse) {
    let r = confirmNext(s, initial)
    assert.equal(r.state.currentPlayerIndex, 1)
    r = confirmNext(s, s.takeAction(1, 'grain-seeds'))
    assert.equal(r.state.currentPlayerIndex, 2)
    r = confirmNext(s, s.takeAction(2, 'day-laborer'))
    assert.equal(r.state.currentPlayerIndex, 0)
    return r
  }

  it("real first refund cannot repeat or refund a second purchase", () => {
    const s = reseller()
    const built = playMinor(s, 'E047_SyrupTap')
    assert.deepEqual(resellerObserved(built), { wood: 0, stone: 0, clay: 1, used: false })
    const accepted = acceptRefund(s, built)
    assert.deepEqual(resellerObserved(accepted.r), { wood: 1, stone: 1, clay: 1, used: true })
    assertRejectedUnchanged(s, () => s.resolveChoice(0, accepted.value))
    rotateToOwner(s, s.getState())
    const second = playMinor(s, 'E030_ChildsToy', 'major-improvement')
    assert.deepEqual(resellerObserved(second), { wood: 1, stone: 1, clay: 0, used: true })
    assert.equal(wait(second).request.kind, 'confirm-next-player')
  })

  it("declining the first printed refund preserves a later real purchase refund", () => {
    const s = reseller()
    let r = playMinor(s, 'E047_SyrupTap')
    assert.ok(options(r).some(o => o.value === '__skip__'))
    r = s.resolveChoice(0, '__skip__')
    assert.deepEqual(resellerObserved(r), { wood: 0, stone: 0, clay: 1, used: false })
    rotateToOwner(s, r)
    r = playMinor(s, 'E030_ChildsToy', 'major-improvement')
    const accepted = acceptRefund(s, r).r
    const wood = options(accepted).find(o => o.effectPreview?.kind === 'resourceExchange' && o.effectPreview.resourcesGained?.wood === 1)
    assert.ok(wood)
    r = s.resolveChoice(0, wood.value)
    assert.deepEqual(resellerObserved(r), { wood: 1, stone: 0, clay: 0, used: true })
    assert.equal(wait(r).request.kind, 'confirm-next-player')
  })

  it("free and excluded component costs preserve the later refund opportunity", () => {
    for (const first of ['B007_Wage', 'C054_MarketBooth']) {
      const s = reseller()
      const r = playMinor(s, first)
      assert.equal(resellerObserved(r).used, false)
      assert.equal(wait(r).request.kind, 'confirm-next-player')
      rotateToOwner(s, r)
      const accepted = acceptRefund(s, playMinor(s, 'E047_SyrupTap', 'major-improvement')).r
      assert.deepEqual(resellerObserved(accepted), { wood: 1, stone: 1, clay: 1, used: true })
      assert.equal(wait(accepted).request.kind, 'confirm-next-player')
    }
  })

  it("undoing the refund restores the use and permits a legal acceptance retry", () => {
    const s = reseller()
    const built = playMinor(s, 'E047_SyrupTap')
    const before = resellerObserved(built)
    acceptRefund(s, built)
    const r = s.undoStep()
    assert.equal(r.ok, true, r.error)
    assert.deepEqual(resellerObserved(r), before)
    assert.ok(r.state.players[0]!.minorPlayed.includes('E047_SyrupTap'))
    assert.equal(wait(r).request.kind, 'choice')
    assert.equal(wait(r).sourceCard, RESELLER)
    assert.equal(wait(r).playerIndex, 0)
    const retry = acceptRefund(s, r).r
    assert.deepEqual(resellerObserved(retry), { wood: 1, stone: 1, clay: 1, used: true })
    assert.equal(wait(retry).request.kind, 'confirm-next-player')
  })

  it("an unpaid improvement cannot create a refund and a free legal retry preserves the use", () => {
    const s = reseller({ stone: 0 })
    let r = s.takeAction(0, 'meeting-place')
    const branch = options(r).find(o => o.value.startsWith('action-improvement-'))
    if (branch)
      r = s.resolveChoice(0, branch.value)
    assert.equal(r.ok, true, r.error)
    assert.equal(options(r).some(o => o.value === 'E047_SyrupTap'), false)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'E047_SyrupTap'))
    r = s.resolveChoice(0, 'B007_Wage')
    assert.equal(r.ok, true, r.error)
    assert.deepEqual(resellerObserved(r), { wood: 1, stone: 0, clay: 1, used: false })
    assert.equal(r.state.players[0]!.resources.food, 2)
    assert.equal(wait(r).request.kind, 'confirm-next-player')
  })

  it("returns the printed stone even when Stonecutter waived its actual payment", () => {
    const s = reseller({ stone: 0, discounted: true })
    const built = playMinor(s, 'E047_SyrupTap')
    assert.deepEqual(resellerObserved(built), { wood: 0, stone: 0, clay: 1, used: false })
    const refunded = acceptRefund(s, built).r
    assert.deepEqual(resellerObserved(refunded), { wood: 1, stone: 1, clay: 1, used: true })
    assert.equal(wait(refunded).request.kind, 'confirm-next-player')
  })
})
