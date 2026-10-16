import { createWorkSession } from './_helpers/session-fixtures'
import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveNonSkipChoice, resolveSkipChoice, resolveTriggerIfPresent } from './_helpers/trigger-select'
import '../../shared/cards/D/D051_Archway'
import assert from 'node:assert/strict'
import { type GameState } from '../../shared/contract/types'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const evidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'D051_Archway'

const FILLER = '__test_placeholder__'

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? getChoiceOptions(response) ?? []
  : []

const setup = ({ occupation = false }: { occupation?: boolean } = {}) => {
  const session = evidence.track(createWorkSession({ seed: 6051, options: { playerCount: 2 } }))
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
    player.minorPlayed = []
    player.occupationPlayed = []
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorHand = [CARD_ID]
  owner.resources.clay = 2
  if (occupation) owner.occupationPlayed = ['A116_WoodCutter']
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = options(response).find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) {
    response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  }
  return response
}

const playArchway = (session: GameSession) => {
  let response = enterMinor(session)
  if (response.state.players[0]!.minorPlayed.includes(CARD_ID)) return response
  if (response.interaction.stateId === 'wait') {
    const card = options(response).find((option) => option.value === CARD_ID)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  }
  return response
}

const playedSession = (actor = 0) => {
  const session = setup()
  const played = playArchway(session)
  expect(played.ok, played.error).toBe(true)
  expect(played.state.players[0]!.minorPlayed).toContain(CARD_ID)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.roundPhase = 'work'
  session.loadState(state)
  return session
}

const prepareRoundEnd = (occupiedTarget = false) => {
  const session = playedSession()
  const used = session.takeAction(0, CARD_ID)
  expect(used.ok, used.error).toBe(true)
  const state = session.getState().state
  const opponent = state.players[1]!
  if (occupiedTarget) {
    for (const space of state.actionSpaces) {
      space.takenBy = space.takenBy.filter((worker) => worker.playerId !== opponent.id)
    }
    const worker = opponent.workers.find((candidate) => candidate.isActive)!
    state.actionSpaces.find((space) => space.id === 'day-laborer')!.takenBy = [
      { playerId: opponent.id, workerId: worker.id },
    ]
  }
  markAllWorkersUsed(state, opponent)
  session.loadState(state)
  return session
}

const startArchwayMove = (session: GameSession) => {
  let response = resolveTriggerIfPresent(session, session.performRoundEnd(), CARD_ID)
  response = resolveNonSkipChoice(session, response)
  expect(response.interaction).toMatchObject({
    stateId: 'wait',
    promptKey: 'ui.interactionMoveFarmerToSpace',
  })
  return response
}

describe('D051 Archway parity', () => {
  it('D051 S1: with no occupation paying two clay plays Archway as a four-point action space', () => {
    const session = setup()
    const initial = session.getState()
    assert.ok(initial.scores)
    const scoreBefore = initial.scores[0]!.total

    const response = playArchway(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(response.state.actionSpaces.some((space) => space.id === CARD_ID)).toBe(true)
    assert.ok(response.scores)
    expect(response.scores[0]!.total).toBe(scoreBefore + 4)
  })

  it('D051 S2: an occupation keeps Archway unavailable', () => {
    const response = enterMinor(setup({ occupation: true }))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(2)
  })

  it('D051 S3: the owner may use Archway and immediately gains one food', () => {
    const response = playedSession().takeAction(0, CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(21)
    expect(response.state.actionSpaces.find((space) => space.id === CARD_ID)!.takenBy)
      .toEqual([expect.objectContaining({ playerId: response.state.players[0]!.id })])
  })

  it('D051 S4: an opponent may use Archway and immediately gains one food', () => {
    const response = playedSession(1).takeAction(1, CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.resources.food).toBe(21)
    expect(response.state.actionSpaces.find((space) => space.id === CARD_ID)!.takenBy)
      .toEqual([expect.objectContaining({ playerId: response.state.players[1]!.id })])
  })

  it('D051 S5: before returning home the same person may move to Day Laborer and execute it', () => {
    const session = prepareRoundEnd()
    let response = startArchwayMove(session)
    expect(options(response).some((option) => option.value === 'day-laborer')).toBe(true)

    assert.ok(response.interaction.stateId === 'wait')
    response = session.resolveChoice(response.interaction.playerIndex, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(19)
    expect(response.state.actionSpaces.find((space) => space.id === CARD_ID)?.takenBy).toEqual([])
  })

  it('D051 S6: the before-return-home move may be declined', () => {
    const session = prepareRoundEnd()
    let response = resolveTriggerIfPresent(session, session.performRoundEnd(), CARD_ID)

    response = resolveSkipChoice(session, response)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(17)
    expect(response.state.actionSpaces.find((space) => space.id === 'day-laborer')?.takenBy)
      .toEqual([])
    expect(response.state.actionSpaces.find((space) => space.id === CARD_ID)?.takenBy).toEqual([])
  })

  it('D051 S7: an occupied action is excluded, forged movement is rejected, and a legal retry works', () => {
    const session = prepareRoundEnd(true)
    let response = startArchwayMove(session)
    expect(options(response).some((option) => option.value === 'day-laborer')).toBe(false)
    expect(options(response).some((option) => option.value === 'grain-seeds')).toBe(true)
    assert.ok(response.interaction.stateId === 'wait')
    const playerIndex = response.interaction.playerIndex
    const archwayWorker = response.state.actionSpaces
      .find((space) => space.id === CARD_ID)!.takenBy[0]!

    const forged = session.resolveChoice(playerIndex, 'day-laborer')

    expect(forged.ok).toBe(false)
    expect(forged.state.actionSpaces.find((space) => space.id === CARD_ID)?.takenBy)
      .toEqual([archwayWorker])
    response = session.resolveChoice(playerIndex, 'grain-seeds')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(17)
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(response.state.actionSpaces.find((space) => space.id === CARD_ID)?.takenBy).toEqual([])
  })
})

describe('D051 rule boundaries', () => {

  const D = 'D051_Archway', L = 'E148_Lazybones'

  function setup(card: string, round = 3, configure: (state: GameState) => void = () => { }, played = true) {
    return evidence.track(createWorkSession({
      seed: 8251, options: { playerCount: card === L ? 4 : 2 }, configure: state => {
        state.round = round
        state.availableMajorImprovements = []
        for (const p of state.players) {
          p.minorHand = ['__test_placeholder__']
          p.occupationHand = ['__test_placeholder__']
          p.resources = { ...p.resources, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 20 }
        }
        const owner = state.players[0]!
        if (played)
          (card === L ? owner.occupationPlayed : owner.minorPlayed).push(card)
        else
          (card === L ? owner.occupationHand : owner.minorHand).splice(0, 1, card)
        configure(state)
        if (card === D && played)
          state.actionSpaces.push(...createPlayerActionSpaces(state))
      }
    }))
  }

  function wait(r: SessionResponse) { assert.equal(r.ok, true, r.error); assert.ok(r.interaction.stateId === 'wait'); return r.interaction }

  function option(r: SessionResponse, predicate: (value: {
    value: string
    labelKey?: string
  }) => boolean) {
    const i = wait(r)
    assert.ok(i.request.kind === 'choice')
    const o = getChoiceOptions({ interaction: i })?.find(predicate)
    assert.ok(o, JSON.stringify(i))
    return o.value
  }

  function finish(s: GameSession, initial: SessionResponse) {
    let r = initial
    for (let n = 0; n < 10 && r.interaction.stateId === 'wait'; n++) {
      const kind = r.interaction.request.kind
      if (kind === 'confirm-next-player')
        r = confirmNext(s, r)
      else if (kind === 'choice' && getChoiceOptions(r)?.some(o => o.value === '__skip__'))
        r = s.resolveChoice(r.interaction.playerIndex, '__skip__')
      else
        break
      assert.equal(r.ok, true, r.error)
    }
    return r
  }

  function place(s: GameSession, actor: number, id: string) {
    let r = s.takeAction(actor, id)
    assert.equal(r.ok, true, r.error)
    if (id === 'farmland') {
      wait(r)
      r = s.commitSelectionChoice(actor, { tile: { row: 0, col: 2 } })
      assert.equal(r.ok, true, r.error)
    }
    return r
  }

  function endWork(s: GameSession, first = 'grain-seeds', second = 'reed-bank') {
    finish(s, place(s, 0, first))
    finish(s, place(s, 1, second))
    finish(s, place(s, 0, 'clay-pit'))
    const r = place(s, 1, 'forest')
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      return confirmNext(s, r)
    if (r.interaction.stateId === 'idle' && r.state.roundPhase === 'work')
      return s.performRoundEnd()
    return r
  }

  function buyMinor(s: GameSession, card: string) {
    let r = s.takeAction(0, 'meeting-place')
    assert.equal(r.ok, true, r.error)
    for (let n = 0; n < 4 && !r.state.players[0]!.minorPlayed.includes(card); n++) {
      if (r.interaction.stateId !== 'wait' || r.interaction.request.kind !== 'choice')
        break
      const op = getChoiceOptions(r)?.find(o => o.value === card) ?? getChoiceOptions(r)?.find(o => o.value.startsWith('action-improvement-'))
      if (!op)
        break
      r = s.resolveChoice(0, op.value)
      assert.equal(r.ok, true, r.error)
    }
    return r
  }

  it("insufficient clay or an occupation cannot bypass printing; legal payment grants four points", () => {
    for (const occupation of [false, true]) {
      const s = setup(D, 3, state => {
        state.players[0]!.minorHand.push('B007_Wage', 'A002_ShiftingCultivation')
        state.players[0]!.resources.clay = occupation ? 2 : 1; if (occupation)
          state.players[0]!.occupationPlayed.push('A116_WoodCutter')
      }, false)
      const r = buyMinor(s, D)
      assert.equal(r.state.players[0]!.minorPlayed.includes(D), false)
      assert.equal(r.state.players[0]!.resources.clay, occupation ? 2 : 1)
      assert.equal(wait(r).request.kind, 'choice')
      assert.deepEqual(new Set(getChoiceOptions(r).map(choice => choice.value)), new Set(['B007_Wage', 'A002_ShiftingCultivation']))
      assertRejectedUnchanged(s, () => s.resolveChoice(0, D))
      const retry = s.resolveChoice(0, 'B007_Wage')
      assert.equal(retry.ok, true, retry.error)
      assert.equal(retry.state.players[0]!.resources.food, 22)
      assert.equal(retry.state.players[0]!.resources.clay, occupation ? 2 : 1)
      assert.equal(retry.state.players[0]!.minorPlayed.includes(D), false)
      assert.equal(retry.state.actionSpaces.some(space => space.id === D), false)
      assert.ok(retry.state.players[1]!.minorHand.includes('B007_Wage'))
      assert.equal(wait(retry).request.kind, 'confirm-next-player')
    }
    const s = setup(D, 3, state => { state.players[0]!.resources.clay = 2 }, false)
    const scores = s.getState().scores
    assert.ok(scores)
    const before = scores[0]!.total
    const r = buyMinor(s, D)
    assert.equal(r.state.players[0]!.minorPlayed.includes(D), true)
    assert.ok(r.scores)
    assert.equal(r.state.players[0]!.resources.clay, 0)
    assert.equal(r.scores[0]!.total, before + 4)
    assert.ok(r.state.actionSpaces.some(x => x.id === D))

    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
  })

  it("opponent use grants only that opponent food and occupied repeat is atomic", () => {
    const s = setup(D)
    finish(s, place(s, 0, 'grain-seeds'))
    let r = place(s, 1, D)
    assert.equal(r.state.players[0]!.resources.food, 20)
    assert.equal(r.state.players[1]!.resources.food, 21)
    const completed = wait(r)
    assert.equal(completed.playerIndex, 1)
    assert.deepEqual(completed.request, { kind: 'confirm-next-player', nextPlayerIndex: 0 })
    r = finish(s, r)
    assert.equal(r.state.currentPlayerIndex, 0)
    assertRejectedUnchanged(s, () => s.takeAction(0, D))
  })

  it("actual round end moves the same worker once and stale request cannot pay twice", () => {
    const s = setup(D)
    let r = endWork(s, D)
    const enter = option(r, o => o.value !== '__skip__')
    r = s.resolveChoice(0, enter)
    const i = wait(r)
    assert.equal(i.promptKey, 'ui.interactionMoveFarmerToSpace')
    const source = r.state.actionSpaces.find(x => x.id === D)!.takenBy[0]!
    const workers = structuredClone(r.state.players[0]!.workers)
    const events = r.state.events.filter(x => x.type === 'worker.placed').length
    assertRejectedUnchanged(s, () => s.resolveChoice(1, 'day-laborer'))
    r = s.resolveChoice(0, 'day-laborer')
    assert.equal(r.ok, true, r.error)
    assert.equal(r.state.players[0]!.resources.food, 23)
    assert.equal(r.state.round, 4)
    assert.equal(r.state.players[0]!.workers.filter(w => w.isActive).length, 2)
    assert.ok(r.state.events.some(x => x.type === 'worker.placed' && x.workerId === source.workerId && x.spaceId === 'day-laborer'))
    assert.equal(r.state.events.filter(x => x.type === 'worker.placed').length, events + 1)
    assertReturnedMove(r, source.workerId, 'day-laborer')
    assert.deepEqual(r.state.players[0]!.workers, workers)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'day-laborer'))
  })

  it("occupied ordinary target is omitted and a legal retry still moves its worker", () => {
    const s = setup(D)
    let r = endWork(s, D, 'day-laborer')
    r = s.resolveChoice(0, option(r, o => o.value !== '__skip__'))
    const move = wait(r)
    assert.ok(move.request.kind === 'choice')
    const source = r.state.actionSpaces.find(space => space.id === D)!.takenBy[0]!
    assert.equal(getChoiceOptions({ interaction: move })?.some(o => o.value === 'day-laborer'), false)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'day-laborer'))
    r = s.resolveChoice(0, 'grain-seeds')
    assert.equal(r.ok, true, r.error)
    assert.equal(r.state.players[0]!.resources.grain, 1)
    assert.equal(r.state.players[0]!.resources.food, 21)
    assert.equal(r.state.round, 4)
    assertReturnedMove(r, source.workerId, 'grain-seeds')
  })

  function assertReturnedMove(r: SessionResponse, workerId: string, destination: string) {
    const ownerId = r.state.players[0]!.id
    const placements = r.state.events.filter(event => event.type === 'worker.placed')
    assert.equal(placements.length, 5)
    const original = placements.find(event => event.spaceId === D && event.workerId === workerId && event.actorPlayerId === ownerId)
    assert.ok(original)
    const moved = placements.filter(event => event.viaCardId === D)
    assert.equal(moved.length, 1)
    assert.deepEqual({ worker: moved[0]!.workerId, player: moved[0]!.actorPlayerId, space: moved[0]!.spaceId, round: moved[0]!.round, phase: moved[0]!.phase }, { worker: workerId, player: ownerId, space: destination, round: 3, phase: 'returning-home' })
    const returned = r.state.events.find(event => event.type === 'worker.returned')
    assert.ok(returned?.type === 'worker.returned')
    assert.equal(returned.workers.length, 4)
    assert.equal(returned.workers.filter(worker => worker.playerId === ownerId && worker.workerId === workerId).length, 1)
    assert.equal(new Set(returned.workers.map(worker => `${worker.playerId}:${worker.workerId}`)).size, 4)
    const nextRound = r.state.events.find(event => event.type === 'round.started' && event.round === 4)
    assert.ok(nextRound)
    assert.ok(original.seq < moved[0]!.seq && moved[0]!.seq < returned.seq && returned.seq < nextRound.seq)
    assert.deepEqual(r.state.actionSpaces.find(space => space.id === D)!.takenBy, [])
    assert.deepEqual(r.state.actionSpaces.find(space => space.id === destination)!.takenBy, [])
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, 0)
  }

  it("undo of actual paid card restores clay card score and placement", () => {
    const s = setup(D, 3, state => { state.players[0]!.resources.clay = 2 }, false)
    const before = s.getState()
    const resources = JSON.stringify(before.state.players[0]!.resources)
    const scores = JSON.stringify(before.scores)
    const log = JSON.stringify(before.state.log)
    const purchased = buyMinor(s, D)
    assert.ok(purchased.interaction.stateId === 'wait' && purchased.interaction.request.kind === 'confirm-next-player', JSON.stringify(purchased.interaction))
    assert.equal(purchased.interaction.playerIndex, 0)
    assert.equal(purchased.state.currentPlayerIndex, 0)
    const r = s.undoAction()
    assert.equal(r.ok, true, r.error)
    assert.equal(JSON.stringify(r.state.players[0]!.resources), resources)
    assert.equal(JSON.stringify(r.scores), scores)
    assert.equal(JSON.stringify(r.state.log), log)
    assert.equal(r.state.players[0]!.minorHand.includes(D), true)
    assert.equal(r.state.players[0]!.minorPlayed.includes(D), false)
    assert.equal(r.state.actionSpaces.some(x => x.id === D), false)
    assert.deepEqual(r.state.actionSpaces.find(x => x.id === 'meeting-place')!.takenBy, [])

    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(r.state.currentPlayerIndex, 0)
    const retry = buyMinor(s, D)
    assert.equal(retry.ok, true, retry.error)
    assert.equal(retry.state.players[0]!.resources.clay, 0)
    assert.equal(retry.state.players[0]!.minorHand.includes(D), false)
    assert.equal(retry.state.players[0]!.minorPlayed.includes(D), true)
    assert.equal(retry.state.actionSpaces.some(space => space.id === D), true)
    assert.equal(retry.state.actionSpaces.find(space => space.id === 'meeting-place')!.takenBy.filter(worker => worker.playerId === retry.state.players[0]!.id).length, 1)
    assert.ok(before.scores && retry.scores)
    assert.equal(retry.scores[0]!.total, before.scores[0]!.total + 4)
    assert.ok(retry.interaction.stateId === 'wait' && retry.interaction.request.kind === 'confirm-next-player', JSON.stringify(retry.interaction))
    assert.equal(retry.interaction.playerIndex, 0)
    assert.equal(retry.state.currentPlayerIndex, 0)
  })
})
