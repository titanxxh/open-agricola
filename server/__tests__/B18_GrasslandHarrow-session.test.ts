import { afterEach, describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { createWorkSession } from './_helpers/session-fixtures'
import { choose, playImprovement, restoreSession, snapshotResponse } from './_helpers/card-play-lifecycle'

const CARD_ID = 'B018_GrasslandHarrow'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

const setup = ({ round = 3, wood = 3, clay = 1, stone = 0, occupations = 2 } = {}) => {
  const session = createWorkSession({ seed: 9707, configure: (state) => {
    state.round = round
    const player = state.players[0]!
    player.minorHand = [CARD_ID]
    player.occupationPlayed = ['A125_Priest', 'A124_Knapper'].slice(0, occupations)
    Object.assign(player.resources, { wood, clay, stone, reed: 0, food: 10 })
    state.players[1]!.resources.food = 10
  } })
  sessions.push(session)
  return session
}

const buy = (session: GameSession) => playImprovement(session, CARD_ID, 'meeting-place')

// Scheduling depends on the successfully paid and committed card, so these are
// Session tests rather than direct calls to a payment listener.
describe('B018 Grassland Harrow activation', () => {
  it.each([[3, 1, 0, 5], [4, 1, 1, 7]])('wood=%s clay=%s stone=%s schedules round %s after payment and commitment', (wood, clay, stone, target) => {
    const session = setup({ wood, clay, stone })
    const before = snapshotResponse(session.getState())
    let response = buy(session)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: wood - 2, clay, stone })
    expect(response.state.futureMeeples).toEqual([expect.objectContaining({ cardId: CARD_ID, round: target, resources: { field: 1 } })])
    const events = response.state.events
    const payment = events.find((event) => event.type === 'resource.paid' && event.sourceCardId === CARD_ID)!
    const played = events.find((event) => event.type === 'card.played' && event.cardId === CARD_ID)!
    const queued = events.filter((event) => event.type === 'futureMeeple.queued' && event.cardId === CARD_ID)
    expect(queued).toHaveLength(1)
    expect(played.seq).toBeGreaterThan(payment.seq)
    expect(queued[0]!.seq).toBeGreaterThan(played.seq)
    const restored = restoreSession(session)
    sessions.push(restored)
    expect(restored.getState().state.futureMeeples).toEqual(response.state.futureMeeples)
    response = restored.undoAction()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.futureMeeples).toEqual([])
    expect(response.state.players[0]!.minorHand).toEqual([CARD_ID])
    expect(response.state.players[0]!.resources).toEqual(before.state.players[0]!.resources)
    expect(response.state.log).toEqual(before.state.log)
    expect(buy(restored).state.futureMeeples).toHaveLength(1)
  })

  it('excludes the card without two occupations and leaves payment and schedules untouched', () => {
    const session = setup({ occupations: 1 })
    const before = snapshotResponse(session.getState())
    const response = session.takeAction(0, 'meeting-place')
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toEqual(before.state.players[0]!.resources)
    expect(response.state.futureMeeples).toEqual([])
  })

  it('rejects a forged selection that exhausts all building resources, then allows a valid retry', () => {
    const session = setup({ wood: 2, clay: 0 })
    session.state.players[0]!.minorHand.push('A004_Baseboards')
    session.state.players[0]!.minorHand.push('A030_BakingSheet')
    let response = session.takeAction(0, 'meeting-place')
    if (response.interaction.stateId !== 'wait') throw new Error('Expected improvement branch')
    const branch = response.interaction.request.options!.find((option) => option.value.startsWith('action-improvement-'))!
    response = choose(session, response, branch.value)
    if (response.interaction.stateId !== 'wait') throw new Error('Expected minor choice')
    expect(response.interaction.request.options?.some((option) => option.value === CARD_ID)).toBe(false)
    const before = snapshotResponse(response)
    const interaction = structuredClone(response.interaction)
    response = session.resolveChoice(0, CARD_ID)
    expect(response.ok).toBe(false)
    expect(snapshotResponse(response)).toEqual(before)
    expect(response.interaction).toEqual(interaction)
    expect(response.state.futureMeeples).toEqual([])
    expect(session.undoAction().ok).toBe(true)
    session.state.players[0]!.resources.clay = 1
    expect(buy(session).state.futureMeeples).toEqual([expect.objectContaining({ round: 4, resources: { field: 1 } })])
  })

  it.each([[13, 2, 1, 14], [13, 4, 0, null]])('round %s with wood=%s clay=%s has target %s', (round, wood, clay, target) => {
    const response = buy(setup({ round, wood, clay }))
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.futureMeeples).toEqual(target === null ? [] : [expect.objectContaining({ round: target })])
  })

  it.each([false, true])('resolves its actual due field once, decline=%s, with saved pending recovery', (decline) => {
    const session = setup({ round: 1, wood: 2, clay: 1 })
    buy(session)
    const state = session.state
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)
    let response = session.performRoundEnd()
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'choice' } })
    const restored = restoreSession(session)
    sessions.push(restored)
    response = restored.getState()
    if (decline) response = choose(restored, response, '__skip__')
    else {
      if (response.interaction.stateId !== 'wait') throw new Error('Expected due field choice')
      const accept = response.interaction.request.options!.find((option) => option.value !== '__skip__')!
      response = choose(restored, response, accept.value)
      if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') throw new Error('Expected plow selection')
      const pending = restoreSession(restored)
      sessions.push(pending)
      response = pending.commitSelectionChoice(0, { tile: response.interaction.request.farm.selectableTiles[0]! })
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(decline ? 0 : 1)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 1 })
    expect(response.state.futureMeeples).toEqual([])
  })
})
