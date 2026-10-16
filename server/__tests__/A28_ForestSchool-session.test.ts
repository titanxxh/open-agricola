import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { A028_ForestSchool as A28Card } from '../../shared/cards/A/A028_ForestSchool'
import { setWorkersAtHome, workersAvailable } from '../../shared/domain/player'
import '../../shared/cards/A/A123_FrameBuilder'
import assert from 'node:assert/strict'
import { type GameState, type PlayerState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A028_ForestSchool'

const setup = (withForestSchool: boolean, options?: { playerCount?: number; spaceId?: string }) => {
  const playerCount = options?.playerCount ?? 2
  const spaceId = options?.spaceId ?? 'lessons'
  const session = sessionEvidence.track(createWorkSession({ options: { playerCount } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, playerCount)
  state.currentPlayerIndex = 0

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = {
    ...player.resources,
    wood: withForestSchool ? (spaceId === 'lessons-3' ? 2 : 1) : 0,
    food: 0,
  }
  player.occupationHand = ['A123_FrameBuilder']
  player.occupationPlayed = ['D152_Patron']

  if (withForestSchool) {
    player.minorPlayed.push('A028_ForestSchool')
    player.activeModifiers.push({ ...(A28Card.impl.modifiers![0] ?? {}) })
  }

  const lessons = state.actionSpaces.find((space) => space.id === spaceId)
  if (!lessons) throw new Error(`${spaceId} space missing`)
  lessons.takenBy = [{ playerId: state.players[1]!.id, workerId: state.players[1]!.workers[0]!.id }]

  session.loadState(state)
  return session
}

describe('A028_ForestSchool session', () => {
  it('A028 S1: paying one wood and one clay plays Forest School', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 7028, options: { playerCount: 2 } }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    state.players.forEach((candidate) => {
      setWorkersAtHome(state, candidate, 2)
      candidate.minorHand = ['__test_placeholder__']
      candidate.occupationHand = ['__test_placeholder__']
      candidate.resources.wood = 0
      candidate.resources.clay = 0
    })
    state.players[0]!.minorHand = [CARD_ID]
    state.players[0]!.resources.wood = 1
    state.players[0]!.resources.clay = 1
    session.loadState(state)

    let response = session.takeAction(0, 'meeting-place')
    for (let guard = 0; guard < 6 && response.state.players[0]!.minorHand.includes(CARD_ID); guard += 1) {
      if (response.interaction.stateId !== 'wait') break
      const card = getChoiceOptions(response)?.find((option) => option.value === CARD_ID)
      const branch = getChoiceOptions(response)?.find((option) =>
        option.value.startsWith('action-improvement-'))
      const next = card ?? branch
      if (!next) break
      response = session.resolveChoice(response.interaction.playerIndex, next.value)
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0 })
  })

  it('A028 S3: occupied ordinary Lessons remains usable through the public action entry', () => {
    const withCard = setup(true).getState()
    expect(withCard.ok).toBe(true)
    expect(withCard.interaction.stateId).toBe('idle')
    expect(withCard.actionAvailability?.lessons).toBe(true)

    const withoutCardSession = setup(false)
    const withoutCard = withoutCardSession.getState()
    expect(withoutCard.actionAvailability?.lessons).toBe(false)

    const failedTake = withoutCardSession.takeAction(0, 'lessons')
    expect(failedTake.ok).toBe(false)
    expect(failedTake.error).toBe('space unavailable')
  })

  it('A028 S2: occupied three-player Lessons remains usable and two food can be replaced by wood', () => {
    const withCard = setup(true, { playerCount: 3, spaceId: 'lessons-3' }).getState()
    expect(withCard.ok).toBe(true)
    expect(withCard.interaction.stateId).toBe('idle')
    expect(withCard.actionAvailability?.['lessons-3']).toBe(true)

    const withoutCardSession = setup(false, { playerCount: 3, spaceId: 'lessons-3' })
    const withoutCard = withoutCardSession.getState()
    expect(withoutCard.actionAvailability?.['lessons-3']).toBe(false)

    const failedTake = withoutCardSession.takeAction(0, 'lessons-3')
    expect(failedTake.ok).toBe(false)
    expect(failedTake.error).toBe('space unavailable')
  })

  it('A028 payment regression: one-food occupation cost exposes and honours the wood replacement', () => {
    const session = setup(true)

    // D152_Patron triggers `before` on occupation and grants +2 food.
    // After that hook the player holds {food: 2, wood: 1} and the lessons
    // cost (1 food) is payable two distinct ways: directly via 1 food, or
    // via A28 ForestSchool's wood→food trade (1 wood, 0 food). The pay
    // leaf must surface `prompt.selectPayment` instead of auto-picking.
    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('prompt.selectPayment')
    expect(getChoiceOptions(resp)?.length).toBeGreaterThanOrEqual(2)

    const tradeOption = getChoiceOptions(resp)?.find((option) => {
      const preview = option.effectPreview
      if (!preview || !('resourcesPaid' in preview)) return false
      const paid = preview.resourcesPaid
      return !!paid && (paid.wood ?? 0) === 1 && !paid.food
    })
    expect(tradeOption).toBeDefined()

    resp = session.resolveChoice(0, tradeOption!.value)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(workersAvailable(resp.state, resp.state.players[0]!)).toBe(1)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    // D152 granted 2 food; A28 trade burned the wood instead of any food.
    expect(resp.state.players[0]!.resources.food).toBe(2)
    expect(resp.state.players[0]!.occupationPlayed).toContain('A123_FrameBuilder')
    expect(resp.state.players[0]!.occupationHand).not.toContain('A123_FrameBuilder')
    expect(resp.state.actionSpaces.find((space) => space.id === 'lessons')?.takenBy.some((t) => t.playerId === resp.state.players[1]!.id)).toBe(true)
  })

  it('auto-pays when only one payment solution is affordable', () => {
    // Strip A28 ForestSchool so the wood→food trade modifier never activates.
    // Player still receives D152 Patron's +2 food, but the only viable
    // payment path is direct food — the pay leaf should auto-resolve and
    // never surface a selectPayment prompt.
    const session = sessionEvidence.track(createWorkSession({ options: { playerCount: 2 } }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.resources = { ...player.resources, wood: 0, food: 0 }
    player.occupationHand = ['A123_FrameBuilder']
    player.occupationPlayed = ['D152_Patron']
    const lessons = state.actionSpaces.find((space) => space.id === 'lessons')
    if (!lessons) throw new Error('lessons space missing')
    session.loadState(state)

    const resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    // D152 granted 2 food; lessons cost (1 food) was auto-paid without
    // surfacing a selectPayment prompt — net food: 2 - 1 = 1.
    expect(resp.state.players[0]!.resources.food).toBe(1)
    expect(resp.state.players[0]!.occupationPlayed).toContain('A123_FrameBuilder')
  })
})

describe("A028 command boundaries", () => {
  const SCHOOL = 'A028_ForestSchool'
  function setup({ played = false, players = 2, round = 14, occupations = 0, resources = {}, configure = () => {
  } }: {
    played?: boolean
    players?: number
    round?: number
    occupations?: number
    resources?: Partial<PlayerState['resources']>
    configure?: (state: GameState) => void
  } = {}) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: players }, configure(state) {
        state.round = round
        state.players.forEach(p => {
          p.minorHand = ['B007_Wage', 'A054_Credit']
          p.occupationHand = [p === state.players[0] ? 'A123_FrameBuilder' : 'A116_WoodCutter']
          p.minorPlayed = []
          p.occupationPlayed = []
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
        })
        const p = state.players[0]!
        if (played)
          p.minorPlayed = [SCHOOL]
        else
          p.minorHand.push(SCHOOL)
        p.occupationPlayed = ['B121_Geologist', 'C123_Freemason'].slice(0, occupations)
        Object.assign(p.resources, resources)
        configure(state)
      } }))
    return s
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function choices(r: SessionResponse) {
    ok(r)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function enter(s: GameSession, space = 'meeting-place') {
    let r = ok(s.takeAction(0, space))
    const branch = choices(r).find(o => o.value.startsWith('action-improvement-'))
    if (branch)
      r = ok(s.resolveChoice(0, branch.value))
    return r
  }
  function buy(s: GameSession, r: SessionResponse, card: string) {
    assert.ok(choices(r).some(o => o.value === card && !o.disabled))
    const result = ok(s.resolveChoice(0, card))
    assert.equal(result.state.players[0]!.minorPlayed.includes(card), true)
    assert.equal(result.state.players[0]!.minorHand.includes(card), false)
    const events = result.state.events.filter(e => e.type === 'card.played' && e.cardId === card)
    assert.equal(events.length, 1)
    const event = events[0]!
    assert.ok(event.type === 'card.played')
    assert.equal(event.actorPlayerId, result.state.players[0]!.id)
    assert.deepEqual(event.payment?.resources ?? {}, card === SCHOOL ? { wood: 1, clay: 1 } : {})
    assert.ok(result.interaction.stateId === 'wait' && result.interaction.request.kind === 'confirm-next-player', JSON.stringify(result.interaction))
    assert.equal(result.interaction.playerIndex, 0)
    assert.equal(result.state.currentPlayerIndex, 0)
    return result
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
  function offered(r: SessionResponse, card: string) {
    return choices(r).some(o => o.value === card && !o.disabled)
  }
  function occupation(s: GameSession, r: SessionResponse, actor: number, paid: {
    wood: number
    food: number
  }) {
    const card = actor === 0 ? 'A123_FrameBuilder' : 'A116_WoodCutter'
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && getChoiceOptions(r).some(o => o.value === card))
      r = ok(s.resolveChoice(actor, card))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const option = choices(r).find(o => o.effectPreview && 'resourcesPaid' in o.effectPreview && (o.effectPreview.resourcesPaid?.wood ?? 0) === paid.wood && (o.effectPreview.resourcesPaid?.food ?? 0) === paid.food)
      assert.ok(option, JSON.stringify(r.interaction))
      assertRejectedUnchanged(s, () => s.resolveChoice(actor, 'pay:occupation:forged'))
      r = ok(s.resolveChoice(actor, option.value))
    }
    assert.equal(r.state.players[actor]!.occupationPlayed.includes(card), true)
    assert.equal(r.state.players[actor]!.occupationHand.includes(card), false)
    const events = r.state.events.filter(e => e.type === 'card.played' && e.cardId === card && e.actorPlayerId === r.state.players[actor]!.id)
    assert.equal(events.length, 1)
    const event = events[0]!
    assert.ok(event.type === 'card.played')
    assert.deepEqual(event.payment?.resources ?? {}, Object.fromEntries(Object.entries(paid).filter(([, n]) => n > 0)))
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, actor)
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function occupiedSchool({ played = true, other = false, players = 2, resources = { wood: 1, food: 0 }, occupations = 1, space = 'lessons' }: {
    played?: boolean
    other?: boolean
    players?: number
    resources?: Partial<PlayerState['resources']>
    occupations?: number
    space?: string
  } = {}) {
    const s = setup({ played, players, round: 5, occupations, resources, configure(state) {
        if (other)
          state.players[1]!.minorPlayed = [SCHOOL]
      } })
    turn(s, 0, 'grain-seeds')
    occupation(s, turn(s, 1, space), 1, { wood: 0, food: space === 'lessons-3' ? 2 : 0 })
    if (players === 3)
      turn(s, 2, 'forest')
    ready(s, 0)
    return s
  }
  it("actual purchase pays one wood and one clay and earns the printed point", () => {
    const s = setup({ resources: { wood: 1, clay: 1 } })
    const r = buy(s, enter(s), SCHOOL)
    assert.deepEqual([r.state.players[0]!.resources.wood, r.state.players[0]!.resources.clay], [0, 0])
    assert.ok(r.scores)
    assert.equal(r.scores[0]!.categories.find(c => c.key === 'cards')?.entries?.find(e => e.type === 'card' && e.cardId === SCHOOL)?.score, 1)
  })
  it("missing either printed resource rejects Forest School before legal retry", () => {
    for (const resources of [{ wood: 0, clay: 1 }, { wood: 1, clay: 0 }]) {
      const s = setup({ resources })
      const r = enter(s)
      assert.equal(offered(r, SCHOOL), false)
      assertRejectedUnchanged(s, () => s.resolveChoice(0, SCHOOL))
      const done = buy(s, r, 'A054_Credit')
      assert.deepEqual([done.state.players[0]!.resources.wood, done.state.players[0]!.resources.clay], [resources.wood, resources.clay])
    }
  })
  it("real occupied Lessons allows the owner to pay one wood for a second occupation", () => {
    const s = occupiedSchool()
    const before = structuredClone(s.getState().state.actionSpaces.find(a => a.id === 'lessons')!.takenBy)
    const r = occupation(s, turn(s, 0, 'lessons'), 0, { wood: 1, food: 0 })
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.food, 0)
    assert.ok(before)
    assert.notDeepEqual(r.state.actionSpaces.find(a => a.id === 'lessons')!.takenBy, before)
    assert.deepEqual(r.state.actionSpaces.find(a => a.id === 'lessons')!.takenBy, [{ playerId: r.state.players[1]!.id, workerId: '1' }, { playerId: r.state.players[0]!.id, workerId: '2' }])
  })
  it("without owner Forest School occupied Lessons rejects before legal retry", () => {
    for (const other of [false, true]) {
      const s = occupiedSchool({ played: false, other })
      assertRejectedUnchanged(s, () => s.takeAction(0, 'lessons'))
      const r = turn(s, 0, 'forest')
      assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
      assert.equal(r.interaction.playerIndex, 0)
      assert.equal(r.state.currentPlayerIndex, 0)
      assert.equal(r.state.players[0]!.occupationPlayed.includes('A123_FrameBuilder'), false)
    }
  })
  it("Forest School cannot enter an occupied non Lessons space", () => {
    const s = setup({ played: true, round: 5, occupations: 1, resources: { wood: 1, food: 0 } })
    turn(s, 0, 'grain-seeds')
    turn(s, 1, 'forest')
    ready(s, 0)
    assertRejectedUnchanged(s, () => s.takeAction(0, 'forest'))
    occupation(s, turn(s, 0, 'lessons'), 0, { wood: 1, food: 0 })
  })
  it("occupied three player Lessons preserves pure food mixed and pure wood two unit payments", () => {
    for (const paid of [{ food: 2, wood: 0 }, { food: 1, wood: 1 }, { food: 0, wood: 2 }]) {
      const s = occupiedSchool({ players: 3, resources: { food: 2, wood: 2 }, space: 'lessons-3' })
      const r = occupation(s, turn(s, 0, 'lessons-3'), 0, paid)
      assert.deepEqual([r.state.players[0]!.resources.food, r.state.players[0]!.resources.wood], [2 - paid.food, 2 - paid.wood])
    }
  })
  it("insufficient combined food and wood rejects an occupation before legal retry", () => {
    const s = occupiedSchool({ players: 3, resources: { food: 0, wood: 1 }, space: 'lessons-3' })
    assertRejectedUnchanged(s, () => s.takeAction(0, 'lessons-3'))
    const r = turn(s, 0, 'clay-pit')
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(r.state.players[0]!.occupationPlayed.includes('A123_FrameBuilder'), false)
    assert.equal(r.state.players[0]!.resources.wood, 1)
  })
  it("the first ordinary Lessons occupation remains free", () => {
    const s = setup({ played: true, round: 5, resources: { wood: 1, food: 0 } })
    const r = occupation(s, turn(s, 0, 'lessons'), 0, { wood: 0, food: 0 })
    assert.equal(r.state.players[0]!.resources.wood, 1)
  })
})
