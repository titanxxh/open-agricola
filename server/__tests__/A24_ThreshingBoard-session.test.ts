import { expectWait } from './_helpers/trigger-select'
import { type SessionResponse, GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { describe, expect, it } from 'vitest'
import { setWorkersAtHome } from '../../shared/domain/player'
import { type ActionChoiceOption, type PlayerState } from '../../shared/contract/types'
import '../../shared/cards/A/A024_ThreshingBoard'
import assert from 'node:assert/strict'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot , getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A024_ThreshingBoard'

const setup = () => {
  const session = sessionEvidence.track(createWorkSession({ seed: 6024, options: { playerCount: 2 } }))
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorPlayed.push(CARD_ID)
  player.improvements.push('Major_Fireplace1')
  player.resources = { ...player.resources, grain: 1, food: 0 }
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  state.players[1]!.minorHand = ['__test_placeholder__']
  state.players[1]!.occupationHand = ['__test_placeholder__']

  session.loadState(state)
  return session
}

const finishPlow = (session: GameSession) => {
  const response = session.getState()
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select' || response.interaction.request.farm.farmType !== 'plow') throw new Error('expected plow selection')
  expect(response.interaction.request.kind).toBe('farm-select')
  const tile = response.interaction.request.farm.selectableTiles[0]
  expect(tile).toBeDefined()
  const result = session.commitSelectionChoice(0, { tile })
  expect(result.ok).toBe(true)
  expect(result.state.players[0]!.fields).toHaveLength(1)
  return result
}

describe('A024_ThreshingBoard session', () => {
  it.each(['no-grain', 'no-cookery', 'other-space'])('does not offer baking for %s', (scenario) => {
    const session = setup()
    const state = session.getState().state
    if (scenario === 'no-grain') state.players[0]!.resources.grain = 0
    if (scenario === 'no-cookery') state.players[0]!.improvements = []
    session.loadState(state)
    const response = session.takeAction(0, scenario === 'other-space' ? 'forest' : 'farmland')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).not.toBe(CARD_ID)
    if (scenario !== 'other-space') finishPlow(session)
  })
  it.each(['farmland', 'cultivation'])('can decline baking before plowing at %s', (spaceId) => {
    const session = setup()

    let resp = session.takeAction(0, spaceId)
    expect(resp.state.players[0]!.fields).toHaveLength(0)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(getChoiceOptions(resp)?.map((option: ActionChoiceOption) => option.value)).toContain('__skip__')
    resp = session.resolveChoice(0, '__skip__')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(0)
    finishPlow(session)
  })

  it.each(['farmland', 'cultivation'])('accepting baking at %s consumes grain before plowing', (spaceId) => {
    const session = setup()

    let resp = session.takeAction(0, spaceId)
    expect(resp.state.players[0]!.fields).toHaveLength(0)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const accept = getChoiceOptions(resp)?.find((option: ActionChoiceOption) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    resp = session.resolveChoice(0, accept!.value)

    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionBakeBreadChoice') {
      expect(getChoiceOptions(resp)?.map((option) => option.value)).not.toContain('cancel')
      resp = session.resolveChoice(0, 'Major_Fireplace1')
    }

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(2)
    expect(resp.state.players[0]!.fields).toHaveLength(0)
    finishPlow(session)
  })
})

describe('A024 Threshing Board parity', () => {
  const CARD_ID = 'A024_ThreshingBoard'

  const OCCUPATIONS = ['A116_WoodCutter', 'B121_Geologist']

  const FILLER = '__test_placeholder__'

  const setup = ({ played = true, occupations = 2 } = {}) => {
    const session = sessionEvidence.track(createWorkSession({ seed: 6024, options: { playerCount: 2 } }))
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
      player.resources = {
        ...player.resources, wood: 0, grain: 0, food: 0, clay: 0, reed: 0, stone: 0,
      }
    })
    const player = state.players[0]!
    player.minorHand = played ? [FILLER] : [CARD_ID, FILLER]
    player.minorPlayed = played ? [CARD_ID] : []
    player.occupationPlayed = OCCUPATIONS.slice(0, occupations)
    player.improvements = played ? ['Major_Fireplace1'] : []
    player.resources.wood = 1
    player.resources.grain = 1
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? getChoiceOptions(response) ?? []
    : []

  const enterMinor = (session: GameSession) => {
    let response = session.takeAction(0, 'major-improvement')
    if (response.interaction.stateId !== 'wait') return response
    if (options(response).some((option) => option.value === CARD_ID)) return response
    const improvement = options(response).find((option) => option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(expectWait(response).interaction.playerIndex, improvement.value)
    return response
  }

  const playCard = (session: GameSession) => {
    let response = enterMinor(session)
    if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
    const card = options(response).find((option) => option.value === CARD_ID)
    if (card) response = session.resolveChoice(expectWait(response).interaction.playerIndex, card.value)
    return response
  }

  it('A024 S1: two occupations and one wood allow playing Threshing Board', () => {
    const response = playCard(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('A024 S2: fewer than two occupations keep Threshing Board unavailable', () => {
    const response = enterMinor(setup({ played: false, occupations: 1 }))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })
})

describe("A024 command boundaries", () => {
  const A024 = 'A024_ThreshingBoard'
  function setup({ played = true, occupations = [], cookery = false, opponentCookery = false, resources = {}, opponent = {} }: {
    played?: boolean
    occupations?: string[]
    cookery?: boolean
    opponentCookery?: boolean
    resources?: Partial<PlayerState['resources']>
    opponent?: Partial<PlayerState['resources']>
  } = {}) {
    return sessionEvidence.track(createWorkSession({ seed: 624, configure: state => {
        state.round = 14
        state.availableMajorImprovements = []
        for (const player of state.players)
          Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 40, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
        const player = state.players[0]!
        player.minorPlayed = played ? [A024] : []
        player.minorHand = played ? ['__test_placeholder__'] : [A024]
        player.occupationPlayed = occupations
        player.improvements = cookery ? ['Major_Fireplace1'] : []
        Object.assign(player.resources, resources)
        Object.assign(state.players[1]!.resources, opponent)
        if (opponentCookery)
          state.players[1]!.improvements = ['Major_Fireplace2']
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
  function plow(s: GameSession, actor = 0) {
    const r = s.getState()
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'plow', JSON.stringify(r.interaction))
    const tile = r.interaction.request.farm.selectableTiles[0]
    assert.ok(tile)
    return ok(s.commitSelectionChoice(actor, { tile }))
  }
  function skipRemaining(s: GameSession, r: SessionResponse) {
    if (opts(r).some(o => o.value === '__skip__'))
      return ok(s.resolveChoice(r.interaction.stateId === 'wait' ? r.interaction.playerIndex : 0, '__skip__'))
    return r
  }
  function bake(s: GameSession, r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait')
    assert.equal(r.interaction.sourceCard, A024)
    const accepts = opts(r).filter(option => option.value !== '__skip__' && !option.disabled)
    assert.equal(accepts.length, 1)
    r = choose(s, r, option => option.value === accepts[0]!.value)
    if (r.interaction.stateId === 'wait' && r.interaction.promptKey === 'ui.interactionBakeBreadChoice')
      r = ok(s.resolveChoice(0, 'Major_Fireplace1'))
    assert.equal(r.state.players[0]!.resources.grain, 0)
    assert.equal(r.state.players[0]!.resources.food, 42)
    return r
  }
  function bakeSetup(config: Parameters<typeof setup>[0] = {}) {
    return setup({ cookery: true, resources: { grain: 1 }, ...config })
  }
  it("occupation or wood shortage rejects forged card before legal purchase", () => {
    const occ = ['A125_Priest', 'A124_Knapper']
    denied(setup({ played: false, occupations: occ.slice(0, 1), resources: { wood: 1 } }), A024)
    denied(setup({ played: false, occupations: occ }), A024)
    const r = buy(setup({ played: false, occupations: occ, resources: { wood: 1 } }), A024)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.ok(r.state.players[0]!.minorPlayed.includes(A024))
  })
  it("Farmland bakes once and rejects wrong actor or room plow target before retry", () => {
    const s = bakeSetup()
    const offer = turn(s, 0, 'farmland')
    assertRejectedUnchanged(s, () => s.resolveChoice(1, opts(offer).find(o => o.value !== '__skip__')!.value))
    bake(s, offer)
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { tile: { row: 1, col: 0 } }))
    const r = plow(s)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(r.state.players[0]!.resources.food, 42)
    assert.equal(r.state.players[0]!.fields.length, 1)
  })
  it("Cultivation grants one reachable bake and cannot replay it after plowing", () => {
    const s = bakeSetup()
    bake(s, turn(s, 0, 'cultivation'))
    const r = skipRemaining(s, plow(s))
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(r.state.players[0]!.fields.length, 1)
    assert.equal(r.state.players[0]!.resources.food, 42)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'Major_Fireplace1'))
  })
  it("missing grain or cookery skips bake while core plow remains legal", () => {
    for (const config of [{ resources: { grain: 0 }, cookery: true }, { resources: { grain: 1 }, cookery: false }]) {
      const s = bakeSetup(config)
      const r = turn(s, 0, 'farmland')
      assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select')
      const done = plow(s)
      assert.ok(done.interaction.stateId === 'wait' && done.interaction.request.kind === 'confirm-next-player', JSON.stringify(done.interaction))
      assert.equal(done.interaction.playerIndex, 0)
      assert.equal(done.state.currentPlayerIndex, 0)
      assert.equal(done.state.players[0]!.resources.grain, config.resources.grain)
      assert.equal(done.state.players[0]!.resources.food, 40)
      assert.equal(done.state.players[0]!.fields.length, 1)
    }
  })
  it("decline other space and opponent Farmland do not consume owner grain", () => {
    const decline = bakeSetup()
    turn(decline, 0, 'farmland')
    ok(decline.resolveChoice(0, '__skip__'))
    const d = plow(decline)
    assert.ok(d.interaction.stateId === 'wait' && d.interaction.request.kind === 'confirm-next-player', JSON.stringify(d.interaction))
    assert.equal(d.interaction.playerIndex, 0)
    assert.equal(d.state.currentPlayerIndex, 0)
    assert.equal(d.state.players[0]!.resources.grain, 1)
    assert.equal(d.state.players[0]!.resources.food, 40)
    const s = bakeSetup({ opponent: { grain: 1 }, opponentCookery: true })
    turn(s, 0, 'forest')
    turn(s, 1, 'farmland')
    const r = plow(s, 1)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, 1)
    assert.equal(r.state.currentPlayerIndex, 1)
    assert.equal(r.state.players[0]!.resources.grain, 1)
    assert.equal(r.state.players[0]!.resources.food, 40)
    assert.equal(r.state.players[0]!.fields.length, 0)
    assert.equal(r.state.players[1]!.fields.length, 1)
    assert.equal(r.state.players[1]!.resources.grain, 1)
    assert.equal(r.state.players[1]!.resources.food, 40)
  })
  it("action undo restores baked grain food field and placement before replay", () => {
    const s = bakeSetup()
    const before = undoRuleSnapshot(s.getState())
    const beforeInteraction = JSON.stringify(s.getState().interaction)
    bake(s, turn(s, 0, 'farmland'))
    plow(s)
    const undone = s.undoAction()
    assertUndoRestored(before, undone)
    assert.equal(JSON.stringify(undone.interaction), beforeInteraction)
    turn(s, 0, 'farmland')
    ok(s.resolveChoice(0, '__skip__'))
    const r = plow(s)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(r.state.players[0]!.resources.grain, 1)
    assert.equal(r.state.players[0]!.resources.food, 40)
    assert.equal(r.state.players[0]!.fields.length, 1)
  })
})
