import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveNonSkipChoice, resolveSkipChoice, resolveTriggerIfPresent } from './_helpers/trigger-select'
import '../../shared/cards/A/A023_StoneCompany'
import '../../shared/cards/A/A057_MilkingParlor'
import '../../shared/cards/E/E047_SyrupTap'
import assert from 'node:assert/strict'
import { type PlayerState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot , getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A023_StoneCompany'

const STONE_MINOR = 'E047_SyrupTap'

const STONE_FREE_MINOR = 'A057_MilkingParlor'

const FILLER = '__test_placeholder__'

const setup = ({
  resources = {},
  hand = [],
  availableMajors = [],
  played = true,
}: {
  resources?: Partial<Record<'wood' | 'clay' | 'reed' | 'stone', number>>
  hand?: string[]
  availableMajors?: string[]
  played?: boolean
} = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 5023, options: { playerCount: 2 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = [...availableMajors]
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  })
  const player = state.players[0]!
  player.minorHand = played ? [...hand] : [CARD_ID, ...hand]
  player.minorPlayed = played ? [CARD_ID] : []
  player.resources = {
    ...player.resources,
    wood: 0,
    clay: 0,
    reed: 0,
    stone: 0,
    ...resources,
  }
  session.loadState(state)
  return session
}

const setQuarryStone = (session: GameSession, spaceId: string, amount: number) => {
  const state = session.getState().state
  const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)
  if (!space) throw new Error(`${spaceId} missing`)
  space.resources.stone = amount
  session.loadState(state)
}

const openMinorPrompt = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  if (getChoiceOptions(response)?.some((option) => option.value === CARD_ID)) return response
  const improvement = getChoiceOptions(response)?.find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const playStoneCompany = (session: GameSession) => {
  const response = openMinorPrompt(session)
  if (response.interaction.stateId !== 'wait') return response
  const card = getChoiceOptions(response)?.find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(0, card!.value)
}

const enterStoneCompanyImprovement = (
  session: GameSession,
  spaceId: 'western-quarry' | 'eastern-quarry',
): SessionResponse => {
  setQuarryStone(session, spaceId, 1)
  let response = session.takeAction(0, spaceId)
  expect(response.ok, response.error).toBe(true)
  response = resolveTriggerIfPresent(session, response, CARD_ID)
  if (
    response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'choice'
    && getChoiceOptions(response)?.some((option) => option.value === '__skip__')
    && !getChoiceOptions(response)?.some((option) =>
      option.value === STONE_MINOR || option.value === STONE_FREE_MINOR)
  ) response = resolveNonSkipChoice(session, response)
  expect(response.interaction.stateId).toBe('wait')
  return response
}

const optionValues = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? getChoiceOptions(response)?.map((option) => option.value) ?? []
  : []

describe('A023 Stone Company parity', () => {
  it('A023 S1: Stone Company costs two clay and one reed to play', () => {
    const response = playStoneCompany(setup({ resources: { clay: 2, reed: 1 }, played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0 })
  })

  it.each([
    ['S2', 'western-quarry'],
    ['S3', 'eastern-quarry'],
  ] as const)('A023 %s: %s offers and buys an improvement that costs stone', (_scenario, spaceId) => {
    const session = setup({ resources: { wood: 2 }, hand: [STONE_MINOR] })
    let response = enterStoneCompanyImprovement(session, spaceId)

    if (!response.state.players[0]!.minorPlayed.includes(STONE_MINOR)) {
      expect(optionValues(response)).toContain(STONE_MINOR)
      response = session.resolveChoice(0, STONE_MINOR)
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(STONE_MINOR)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, stone: 0 })
  })

  it('A023 S4: the Quarry improvement action can be declined without payment', () => {
    const session = setup({ resources: { wood: 2 }, hand: [STONE_MINOR] })
    setQuarryStone(session, 'western-quarry', 1)
    let response = session.takeAction(0, 'western-quarry')
    response = resolveTriggerIfPresent(session, response, CARD_ID)
    response = resolveSkipChoice(session, response)

    expect(response.state.players[0]!.minorHand).toContain(STONE_MINOR)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, stone: 1 })
  })

  it('A023 S5: collecting stone outside a Quarry does not offer an improvement', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 5023, options: { playerCount: 4 } }))
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
    })
    state.players[0]!.minorPlayed = [CARD_ID]
    state.players[0]!.minorHand = [STONE_MINOR]
    state.players[0]!.resources.wood = 2
    state.actionSpaces.find((space) => space.id === 'resource-market-4')!.resources.stone = 1
    session.loadState(state)

    const response = session.takeAction(0, 'resource-market-4')

    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.minorHand).toContain(STONE_MINOR)
  })

  it('A023 S6: filters out stone-free improvements from the Quarry action', () => {
    const session = setup({ resources: { wood: 3 }, hand: [STONE_FREE_MINOR, STONE_MINOR] })
    const response = enterStoneCompanyImprovement(session, 'western-quarry')

    expect(optionValues(response)).not.toContain(STONE_FREE_MINOR)
    expect(response.state.players[0]!.minorPlayed.includes(STONE_MINOR) || optionValues(response).includes(STONE_MINOR)).toBe(true)
  })

  it.each([false, true])('requires stone after a stone discount (optional=%s)', (optional) => {
    const session = setup({ resources: { wood: 2 }, hand: [STONE_MINOR] })
    session.state.players[0]!.activeModifiers = [{
      type: 'bonus', cardId: '__test_stone_discount__', appliesTo: ['minor-improvement'],
      discount: { stone: 1 }, optional,
    }]
    session.loadState(session.state)
    let response = enterStoneCompanyImprovement(session, 'western-quarry')
    if (optionValues(response).includes(STONE_MINOR)) response = session.resolveChoice(0, STONE_MINOR)
    expect(response.state.players[0]!.minorPlayed.includes(STONE_MINOR)).toBe(optional)
    expect(response.state.players[0]!.resources.stone).toBe(optional ? 0 : 1)
  })

  it('cannot substitute wood for the required actual stone payment', () => {
    const session = setup({ resources: { wood: 3 }, hand: [STONE_MINOR] })
    session.state.players[0]!.activeModifiers = [{
      type: 'trade', cardId: '__test_stone_trade__', appliesTo: ['minor-improvement'],
      from: { wood: 1 }, to: { stone: 1 }, max: 1,
    }]
    session.loadState(session.state)
    let response = enterStoneCompanyImprovement(session, 'western-quarry')
    if (optionValues(response).includes(STONE_MINOR)) response = session.resolveChoice(0, STONE_MINOR)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(STONE_MINOR)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, stone: 0 })
  })

  it('A023 S7: does not offer a stone-free improvement as a Quarry follow-up', () => {
    const session = setup({ resources: { wood: 2 }, hand: [STONE_FREE_MINOR] })
    const response = enterStoneCompanyImprovement(session, 'western-quarry')

    expect(
      response.state.players[0]!.minorPlayed.includes(STONE_FREE_MINOR)
      || optionValues(response).includes(STONE_FREE_MINOR),
    ).toBe(false)
  })
})

describe("A023 command boundaries", () => {
  const A023 = 'A023_StoneCompany'
  const TAP = 'E047_SyrupTap', PARLOR = 'B013_CarpentersParlor', FREE = 'A057_MilkingParlor'
  function setup({ played = true, players = 2, hand = [], occupations = [], resources = {}, opponent = {}, opponentHand = [] }: {
    played?: boolean
    players?: number
    hand?: string[]
    occupations?: string[]
    resources?: Partial<PlayerState['resources']>
    opponent?: Partial<PlayerState['resources']>
    opponentHand?: string[]
  } = {}) {
    return sessionEvidence.track(createWorkSession({ seed: 624, options: { playerCount: players }, configure: state => {
        state.round = 14
        state.availableMajorImprovements = []
        for (const player of state.players) {
          player.minorHand = ['__test_placeholder__']
          player.occupationHand = ['__test_placeholder__']
          Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 40, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
        }
        const player = state.players[0]!
        player.minorPlayed = played ? [A023] : []
        player.minorHand = [...(played ? [] : [A023]), ...hand]
        if (!player.minorHand.length)
          player.minorHand = ['__test_placeholder__']
        player.occupationPlayed = occupations
        Object.assign(player.resources, resources)
        Object.assign(state.players[1]!.resources, opponent)
        if (opponentHand.length)
          state.players[1]!.minorHand = opponentHand
        for (const id of ['western-quarry', 'eastern-quarry'])
          state.actionSpaces.find(space => space.id === id)!.resources.stone = 1
        state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
      } }))
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function opts(r: SessionResponse) {
    return r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' ? getChoiceOptions(r) : []
  }
  function choose(s: GameSession, r: SessionResponse, predicate: (o: {
    value: string
    labelKey?: string
    sourceCard?: string
  }) => boolean) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    const o = opts(r).find(predicate)
    assert.ok(o, JSON.stringify(r.interaction))
    return ok(s.resolveChoice(r.interaction.playerIndex, o.value))
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
    ready(s, actor)
    return ok(s.takeAction(actor, space))
  }
  function minor(s: GameSession, card: string) {
    let r = turn(s, 0, 'meeting-place')
    if (!opts(r).some(o => o.value === card) && opts(r).some(o => o.value.startsWith('action-improvement-')))
      r = choose(s, r, o => o.value.startsWith('action-improvement-'))
    return r
  }
  function buy(s: GameSession, card: string) {
    const r = minor(s, card)
    const completedResponse = r.state.players[0]!.minorPlayed.includes(card) ? r : choose(s, r, o => o.value === card)
    assert.ok(completedResponse.interaction.stateId === 'wait' && completedResponse.interaction.request.kind === 'confirm-next-player', JSON.stringify(completedResponse.interaction))
    assert.equal(completedResponse.interaction.playerIndex, 0)
    assert.equal(completedResponse.state.currentPlayerIndex, 0)
    return completedResponse
  }
  function denied(s: GameSession, card: string) {
    const r = minor(s, card)
    assert.equal(opts(r).some(o => o.value === card && !o.disabled), false)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
    assert.ok(r.state.players[0]!.minorHand.includes(card))
  }
  function quarry(s: GameSession, id = 'western-quarry') {
    return turn(s, 0, id)
  }
  function acceptCompany(s: GameSession, response: SessionResponse) {
    assert.ok(response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice', JSON.stringify(response.interaction))
    assert.equal(response.interaction.sourceCard, A023)
    const accepts = opts(response).filter(option => option.value !== '__skip__' && !option.disabled)
    assert.equal(accepts.length, 1, JSON.stringify(response.interaction))
    return ok(s.resolveChoice(0, accepts[0]!.value))
  }
  function improvement(s: GameSession, response: SessionResponse, card = TAP) {
    let current = acceptCompany(s, response)
    if (!current.state.players[0]!.minorPlayed.includes(card))
      current = choose(s, current, option => option.value === card)
    assert.ok(current.interaction.stateId === 'wait' && current.interaction.request.kind === 'confirm-next-player', JSON.stringify(current.interaction))
    assert.equal(current.interaction.playerIndex, 0)
    assert.equal(current.state.currentPlayerIndex, 0)
    return current
  }
  it("clay or reed fee shortage rejects forged purchase before exact-cost control", () => {
    for (const resources of [{ clay: 1, reed: 1 }, { clay: 2, reed: 0 }])
      denied(setup({ played: false, resources }), A023)
    const s = setup({ played: false, resources: { clay: 2, reed: 1 } })
    const r = buy(s, A023)
    assert.ok(r.state.players[0]!.minorPlayed.includes(A023))
    assert.equal(r.state.players[0]!.resources.clay, 0)
    assert.equal(r.state.players[0]!.resources.reed, 0)
  })
  it("Stonecutter purchase must still actually spend one stone at Quarry", () => {
    // Stonecutter is available from three players.
    const s = setup({ players: 3, hand: [TAP], occupations: ['A143_Stonecutter'], resources: { wood: 2 } })
    const r = improvement(s, quarry(s))
    assert.ok(r.state.players[0]!.minorPlayed.includes(TAP))
    assert.equal(r.state.players[0]!.resources.wood, 1)
    assert.equal(r.state.players[0]!.resources.stone, 0)
  })
  it("stone-free card is absent and forged native purchase rejects before legal retry", () => {
    const s = setup({ hand: [TAP, PARLOR, FREE], resources: { wood: 3 } })
    const r = acceptCompany(s, quarry(s))
    assert.equal(opts(r).some(o => o.value === FREE && !o.disabled), false)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, FREE))
    const done = choose(s, s.getState(), o => o.value === TAP)
    assert.equal(done.state.players[0]!.resources.wood, 2)
    assert.equal(done.state.players[0]!.resources.stone, 0)
    assert.ok(done.state.players[0]!.minorHand.includes(FREE))
  })
  it("no affordable stone-paying improvement leaves no accepting branch", () => {
    const s = setup({ hand: [TAP] })
    const r = quarry(s)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.state.players[0]!.resources.stone, 1)
    assert.ok(r.state.players[0]!.minorHand.includes(TAP))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, TAP))
  })
  it("decline undo and stale purchase cannot duplicate Quarry improvement", () => {
    const s = setup({ hand: [TAP], resources: { wood: 2 } })
    const before = undoRuleSnapshot(s.getState())
    const beforeInteraction = JSON.stringify(s.getState().interaction)
    quarry(s)
    const declined = ok(s.resolveChoice(0, '__skip__'))
    assert.ok(declined.interaction.stateId === 'wait' && declined.interaction.request.kind === 'confirm-next-player', JSON.stringify(declined.interaction))
    assert.equal(declined.interaction.playerIndex, 0)
    assert.equal(declined.state.currentPlayerIndex, 0)
    assert.equal(s.getState().state.players[0]!.resources.stone, 1)
    assert.ok(s.getState().state.players[0]!.minorHand.includes(TAP))
    const undone = s.undoAction()
    assertUndoRestored(before, undone)
    assert.equal(JSON.stringify(undone.interaction), beforeInteraction)
    const r = improvement(s, quarry(s))
    assert.equal(r.state.players[0]!.resources.stone, 0)
    assert.equal(r.state.players[0]!.resources.wood, 1)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, TAP))
    assert.equal(r.scores?.length, 2)
  })
  it("nonquarry stone and opponent Quarry do not grant owner improvement", () => {
    // The non-Quarry Resource Market exists only in the four-player action pool.
    const market = setup({ players: 4, hand: [TAP], resources: { wood: 2 } })
    const non = turn(market, 0, 'resource-market-4')
    assert.ok(non.interaction.stateId === 'wait' && non.interaction.request.kind === 'confirm-next-player', JSON.stringify(non.interaction))
    assert.equal(non.interaction.playerIndex, 0)
    assert.equal(non.state.currentPlayerIndex, 0)
    assert.equal(non.state.players[0]!.resources.stone, 1)
    assert.ok(non.state.players[0]!.minorHand.includes(TAP))
    assert.equal(non.state.players[0]!.minorPlayed.includes(TAP), false)
    const s = setup({ hand: [TAP], opponentHand: [PARLOR], resources: { wood: 2 }, opponent: { wood: 2 } })
    turn(s, 0, 'forest')
    const r = turn(s, 1, 'western-quarry')
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, 1)
    assert.equal(r.state.currentPlayerIndex, 1)
    assert.ok(r.state.players[0]!.minorHand.includes(TAP))
    assert.ok(r.state.players[1]!.minorHand.includes(PARLOR))
    assert.equal(r.state.players[1]!.resources.stone, 1)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
  })
})
