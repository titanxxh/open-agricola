import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { bonusScore, choose, playImprovement, playOccupation, restoreSession, snapshotResponse } from './_helpers/card-play-lifecycle'

const CARD_ID = 'B100_Clutterer'
const MATCHING = 'A116_WoodCutter'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

const setup = ({ played = true, paid = false, actor = 0, cardId = MATCHING, food = 6 } = {}) => {
  const session = createWorkSession({ seed: 9707, configure: (state) => {
    state.round = 14
    state.currentPlayerIndex = actor
    state.players[0]!.occupationPlayed = played ? [CARD_ID] : paid ? ['A125_Priest'] : []
    const player = state.players[actor]!
    player.occupationHand = [cardId]
    player.minorHand = ['B017_ForestPlow']
    Object.assign(player.resources, { food, wood: 1, clay: 0, reed: 0, stone: 0 })
  } })
  sessions.push(session)
  return session
}

const assertBonus = (response: SessionResponse, points: number) => {
  expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(points)
  expect(bonusScore(response, CARD_ID)).toBe(points)
  expect(response.state.events.filter((event) => event.type === 'card.stateChanged'
    && event.cardId === CARD_ID && event.key === 'bonusVp')).toHaveLength(points)
  expect(response.state.log.filter((entry) => entry.key === 'log.cardTriggered'
    && entry.params?.cardId === CARD_ID)).toHaveLength(points)
}

describe('B100 Clutterer through Session', () => {
  it.each([false, true])('does not award a point for its own play, paid=%s', (paid) => {
    const session = setup({ played: false, paid, cardId: CARD_ID })
    const response = playOccupation(session, CARD_ID)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    assertBonus(response, 0)
    expect(response.state.events.some((event) => event.type === 'card.triggered' && event.cardId === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.resources.food).toBe(paid ? 5 : 6)
  })

  it('awards one point for a later qualifying occupation, including recovery and full undo/retry', () => {
    const session = setup()
    session.state.players[0]!.occupationPlayed.push('E089_Stallwright')
    const before = snapshotResponse(session.getState())
    let response = playOccupation(session, MATCHING)
    expect(response.state.players[0]!.occupationPlayed).toContain(MATCHING)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'select-trigger' } })
    expect(response.interaction.stateId === 'wait' && response.interaction.request.options?.map((option) => option.value))
      .toContain(CARD_ID)
    assertBonus(response, 0)
    const restored = restoreSession(session)
    sessions.push(restored)
    response = choose(restored, restored.getState(), CARD_ID)
    response = choose(restored, response, 'E089_Stallwright')
    response = choose(restored, response, '__skip__')
    assertBonus(response, 1)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    assertBonus(restored.getState(), 1)
    const recovered = restoreSession(restored)
    sessions.push(recovered)
    assertBonus(recovered.getState(), 1)
    response = restored.undoAction()
    expect(response.ok, response.error).toBe(true)
    assertBonus(response, 0)
    expect(response.state.players[0]!.resources).toEqual(before.state.players[0]!.resources)
    expect(response.state.players[0]!.occupationHand).toEqual([MATCHING])
    expect(response.state.log).toEqual(before.state.log)
    expect(response.scores).toEqual(before.scores)
    response = choose(restored, playOccupation(restored, MATCHING), CARD_ID)
    response = choose(restored, response, 'E089_Stallwright')
    response = choose(restored, response, '__skip__')
    assertBonus(response, 1)
  })

  it('awards one point for a later accumulation-space minor improvement', () => {
    const session = setup()
    let response = playImprovement(session, 'B017_ForestPlow')
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'select-trigger') {
      response = choose(session, response, CARD_ID)
    }
    assertBonus(response, 1)
    expect(response.state.players[0]!.minorPlayed).toContain('B017_ForestPlow')
  })

  it('does not reward an unrelated later occupation', () => {
    const session = setup({ cardId: 'A125_Priest' })
    assertBonus(playOccupation(session, 'A125_Priest'), 0)
  })

  it('does not reward an opponent playing a qualifying occupation', () => {
    const session = setup({ actor: 1 })
    const response = playOccupation(session, MATCHING, 1)
    expect(response.state.players[1]!.occupationPlayed).toContain(MATCHING)
    assertBonus(response, 0)
  })

  it('does not reward a rejected occupation payment', () => {
    const session = setup({ food: 0 })
    const before = snapshotResponse(session.getState())
    const response = session.takeAction(0, 'lessons')
    expect(response.ok).toBe(false)
    assertBonus(response, 0)
    expect(response.state.players[0]!.occupationHand).toEqual([MATCHING])
    expect(response.state.log).toEqual(before.state.log)
    expect(response.state.events).toEqual(before.state.events)
  })
})
