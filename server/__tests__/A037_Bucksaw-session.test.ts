import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A037_Bucksaw'
import assert from 'node:assert/strict'
import { type GameState, type Resource } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot , getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A037_Bucksaw'

const setup = ({ wood, inHand = false }: { wood: number; inHand?: boolean }) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 37, options: { playerCount: 2 } }))
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = inHand ? 1 : 6
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = inHand ? [CARD_ID] : ['__test_placeholder__']
  player.minorPlayed = inHand ? [] : [CARD_ID]
  player.houseType = 'wood'
  player.resources = {
    ...player.resources,
    wood,
    clay: inHand ? 0 : 2,
    reed: inHand ? 0 : 1,
    grain: 0,
  }
  session.loadState(state)
  return session
}

const openMinorPrompt = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  if (getChoiceOptions(response)?.some((option) => option.value === CARD_ID)) return response
  const improvement = getChoiceOptions(response)?.find((option) =>
    option.value.startsWith('action-improvement-'),
  )
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const playMinor = (session: GameSession) => {
  const response = openMinorPrompt(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  const option = response.interaction.stateId === 'wait'
    ? getChoiceOptions(response)?.find((candidate) => candidate.value === CARD_ID)
    : undefined
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

const openBucksawPrompt = (session: GameSession) => {
  let response = session.takeAction(0, 'house-redevelopment')
  expect(response.ok, response.error).toBe(true)
  if (
    response.interaction.stateId === 'wait'
    && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget'
  ) response = session.resolveChoice(0, 'clay')
  return response
}

const resolveBucksaw = (session: GameSession, response: SessionResponse, accept: boolean) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(response.interaction.sourceCard).toBe(CARD_ID)
  const option = getChoiceOptions(response)?.find((candidate) => accept
    ? candidate.value !== '__skip__' && candidate.value !== 'skip'
    : candidate.value === '__skip__' || candidate.value === 'skip')
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

describe('A037 Bucksaw parity', () => {
  it('A037 S1: playing Bucksaw costs one wood and keeps the non-passing card', () => {
    const response = playMinor(setup({ wood: 1, inHand: true }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[1]!.minorHand).not.toContain(CARD_ID)
  })

  it('A037 S2: accepting after renovation pays one wood for grain and bonus point', () => {
    const session = setup({ wood: 1 })

    const response = resolveBucksaw(session, openBucksawPrompt(session), true)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay',
      resources: { wood: 0, clay: 0, reed: 0, grain: 1 },
    })
    expect(response.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp).toBe(1)
  })

  it('A037 S3: declining after renovation preserves the extra wood and grants nothing', () => {
    const session = setup({ wood: 1 })

    const response = resolveBucksaw(session, openBucksawPrompt(session), false)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay',
      resources: { wood: 1, clay: 0, reed: 0, grain: 0 },
    })
    expect(response.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })

  it('A037 S4: renovation without extra wood grants no Bucksaw reward', () => {
    const session = setup({ wood: 0 })

    const response = openBucksawPrompt(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay',
      resources: { wood: 0, clay: 0, reed: 0, grain: 0 },
    })
    expect(response.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })

  it('A037 S5: a non-renovation action does not trigger Bucksaw', () => {
    const session = setup({ wood: 1 })
    const state = session.getState().state
    state.players[0]!.resources.clay = 0
    state.players[0]!.resources.reed = 0
    session.loadState(state)

    const response = session.takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, grain: 0 })
    expect(response.state.players[0]!.cardStates?.[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })
})

describe("A037 command boundaries", () => {
  const SAW = 'A037_Bucksaw'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function setup({ played = true, round = 14, resources = {} }: {
    played?: boolean
    round?: number
    resources?: Partial<Resource>
  } = {}, configure: (state: GameState) => void = () => {
  }) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
        state.round = round
        for (const p of state.players) {
          p.minorHand = ['__test_placeholder__']
          p.occupationHand = ['__test_placeholder__']
          p.minorPlayed = []
          p.occupationPlayed = []
          p.improvements = []
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, sheep: 0, food: 20 })
        }
        const p = state.players[0]!
        p.minorHand = played ? ['__test_placeholder__'] : [SAW, '__test_placeholder__']
        p.minorPlayed = played ? [SAW] : []
        Object.assign(p.resources, resources)
        configure(state)
        const owned = state.players.flatMap(p => p.improvements)
        state.availableMajorImprovements = state.availableMajorImprovements.filter(id => !owned.includes(id))
      } }))
    return s
  }
  function options(r: SessionResponse) {
    ok(r)
    assert(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function buy(s: GameSession) {
    let r = ok(s.takeAction(0, 'meeting-place'))
    for (let i = 0; i < 3 && !r.state.players[0]!.minorPlayed.includes(SAW); i++) {
      const candidate = options(r).find(o => o.value === SAW) ?? options(r).find(o => o.value.startsWith('action-improvement-'))
      assert(candidate && !candidate.disabled, JSON.stringify(r.interaction))
      r = ok(s.resolveChoice(0, candidate.value))
    }
    assert(r.state.players[0]!.minorPlayed.includes(SAW))
    return r
  }
  function denied(s: GameSession) {
    let r = ok(s.takeAction(0, 'meeting-place'))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const c = getChoiceOptions(r).find(o => o.value.startsWith('action-improvement-'))
      if (c)
        r = ok(s.resolveChoice(0, c.value))
    }
    assert(!r.state.players[0]!.minorPlayed.includes(SAW))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
      assert(!getChoiceOptions(r).some(o => o.value === SAW && !o.disabled))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, SAW))
  }
  function bonus(r: SessionResponse, owner = 0) {
    assert(r.scores)
    return r.scores[owner]!.categories.find(c => c.key === 'cardBonusVp')?.entries.find(e => e.type === 'bonus' && e.cardId === SAW)?.score ?? 0
  }
  function cardMenu(s: GameSession, r: SessionResponse, actor = 0) {
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger') {
      const c = getChoiceOptions(r).find(o => o.sourceCard === SAW || o.value === SAW)
      assert(c)
      r = ok(s.resolveChoice(actor, c.value))
    }
    return r
  }
  function accept(s: GameSession, initial: SessionResponse) {
    const r = cardMenu(s, initial)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
    assert.equal(r.interaction.sourceCard, SAW)
    const enabled = options(r).filter(option => option.value !== '__skip__' && option.value !== 'skip' && !option.disabled)
    assert.equal(enabled.length, 1, JSON.stringify(r.interaction))
    return ok(s.resolveChoice(0, enabled[0]!.value))
  }
  function decline(s: GameSession, r: SessionResponse) {
    r = cardMenu(s, r)
    const c = options(r).find(o => o.value === '__skip__' || o.value === 'skip')
    assert(c)
    return ok(s.resolveChoice(0, c.value))
  }
  function saw(wood = 1, played = true, configure: (state: GameState) => void = () => {
  }) {
    return setup({ played, resources: { wood, clay: 2, reed: 1 } }, configure)
  }
  function renovate(s: GameSession, actor = 0, space = 'house-redevelopment', target = 'clay') {
    let r = ok(s.takeAction(actor, space))
    if (r.interaction.stateId === 'wait' && r.interaction.promptKey === 'ui.interactionChooseRenovationTarget')
      r = ok(s.resolveChoice(actor, target))
    return r
  }
  it("purchase needs one wood and grants no renovation reward", () => {
    denied(saw(0, false))
    const s = saw(1, false)
    const r = buy(s)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.grain, 0)
    assert.equal(bonus(r), 0)
  })
  it("actual renovation pays materials and separately pays one wood for grain and point", () => {
    const s = saw()
    const r = accept(s, renovate(s))
    assert.equal(r.state.players[0]!.houseType, 'clay')
    assert.deepEqual([r.state.players[0]!.resources.wood, r.state.players[0]!.resources.clay, r.state.players[0]!.resources.reed, r.state.players[0]!.resources.grain], [0, 0, 0, 1])
    assert.equal(bonus(r), 1)
  })
  it("no wood gives no reward and voluntary decline preserves wood", () => {
    const none = saw(0)
    const r = renovate(none)
    assert.equal(r.state.players[0]!.houseType, 'clay')
    assert.equal(r.state.players[0]!.resources.grain, 0)
    assert.equal(bonus(r), 0)
    assertRejectedUnchanged(none, () => none.resolveChoice(0, SAW))
    const s = saw()
    const after = decline(s, renovate(s))
    assert.equal(after.state.players[0]!.resources.wood, 1)
    assert.equal(after.state.players[0]!.resources.grain, 0)
    assert.equal(bonus(after), 0)
  })
  it("a real owner ordinary action cannot trigger renovation reward", () => {
    const s = saw()
    const r = ok(s.takeAction(0, 'day-laborer'))
    assert.equal(r.state.players[0]!.resources.food, 22)
    assert.equal(r.state.players[0]!.resources.wood, 1)
    assert.equal(r.state.players[0]!.resources.grain, 0)
    assert.equal(bonus(r), 0)
  })
  it("actual opponent renovation cannot grant owner grain or points", () => {
    const s = saw(1, true, state => Object.assign(state.players[1]!.resources, { clay: 2, reed: 1, wood: 1 }))
    confirmNext(s, ok(s.takeAction(0, 'day-laborer')))
    const r = renovate(s, 1)
    assert.equal(r.state.players[1]!.houseType, 'clay')
    assert.equal(r.state.players[1]!.resources.clay, 0)
    assert.equal(r.state.players[0]!.resources.wood, 1)
    assert.equal(r.state.players[0]!.resources.grain, 0)
    assert.equal(bonus(r), 0)
  })
  it("wrong actor invalid and stale fee responses reject without mutation", () => {
    const s = saw()
    const r = cardMenu(s, renovate(s))
    const c = options(r).find(o => o.value !== '__skip__')
    assert(c)
    assertRejectedUnchanged(s, () => s.resolveChoice(1, c.value))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'pay-two-wood'))
    const after = ok(s.resolveChoice(0, c.value))
    assert.equal(bonus(after), 1)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, c.value))
  })
  it("whole action undo restores wooden rooms material fee grain and point before retry", () => {
    const s = saw()
    const before = undoRuleSnapshot(s.getState())
    assert.equal(bonus(accept(s, renovate(s))), 1)
    assertUndoRestored(before, s.undoAction())
    assert.equal(bonus(accept(s, renovate(s))), 1)
  })
  it("two actual renovations in one round each charge wood and award grain and point", () => {
    const s = saw(2, true, state => Object.assign(state.players[0]!.resources, { stone: 2, reed: 2 }))
    let r = accept(s, renovate(s))
    assert.equal(bonus(r), 1)
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const skip = getChoiceOptions(r).find(o => o.value === '__skip__' || o.value === 'skip')
      assert(skip, JSON.stringify(r.interaction))
      r = ok(s.resolveChoice(0, skip.value))
    }
    confirmNext(s, r)
    confirmNext(s, ok(s.takeAction(1, 'day-laborer')))
    r = accept(s, renovate(s, 0, 'farm-redevelopment', 'stone'))
    assert.equal(r.state.players[0]!.houseType, 'stone')
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.stone, 0)
    assert.equal(r.state.players[0]!.resources.reed, 0)
    assert.equal(r.state.players[0]!.resources.grain, 2)
    assert.equal(bonus(r), 2)
  })
})
