import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import type { GameState } from '../../shared/contract/types'
import { emptyResources } from '../../shared/contract/state-constants'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { Scoring } from '../../shared/domain/scoring'
import { readPublicCardMarkers } from '../../shared/cards/helpers/public-card-markers'
import { serializeState } from '../../shared/session/serialization'
import { createWorkSession } from './_helpers/session-fixtures'
import { confirmNext, getChoiceOptions } from './_helpers/session-assertions'

const CARD_ID = 'M027_GardenPath'
const sessions: GameSession[] = []
afterEach(() => { for (const session of sessions.splice(0)) session.dispose() })

const setup = (configure?: (state: GameState) => void) => {
  const session = createWorkSession({
    seed: 411,
    options: { playerCount: 2, enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true },
    configure: state => {
      for (const [index, player] of state.players.entries()) {
        player.resources = { ...emptyResources, clay: 2, food: 20, fuel: 10, horse: 0 }
        player.minorHand = index === 0 ? [CARD_ID] : ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
        player.minorPlayed = []
        player.occupationPlayed = []
        player.improvements = []
        player.cardStates = {}
        player.farmTerrain = [{ row: 0, col: 1, kind: 'forest' }]
        setActiveWorkerCount(player, 2)
        setWorkersAtHome(state, player, 2)
      }
      configure?.(state)
    },
  })
  sessions.push(session)
  return session
}

const purchase = (session: GameSession, actor: number, space: 'meeting-place' | 'major-improvement') => {
  let response = session.takeAction(actor, space)
  expect(response.ok, response.error).toBe(true)
  for (let step = 0; step < 8 && response.interaction.stateId === 'wait'; step++) {
    if (response.interaction.request.kind === 'confirm-next-player') break
    const options = getChoiceOptions(response)
    const option = response.interaction.promptKey === 'prompt.selectPayment' ? options[0]
      : options.find(option => option.value.startsWith('action-improvement-'))
        ?? options.find(option => option.value === CARD_ID)
    assert.ok(option, JSON.stringify(response.interaction))
    response = session.resolveChoice(actor, option.value)
    expect(response.ok, response.error).toBe(true)
  }
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  return response
}

const markerHolders = (response: SessionResponse) => response.state.players.flatMap(player =>
  readPublicCardMarkers(player, CARD_ID).map(marker => ({ playerId: player.id, score: marker.score })),
)

const bonusScores = (session: GameSession, response: SessionResponse) => session.withCtx(() =>
  response.state.players.map((_, index) => Scoring.breakdown(response.state, index)
    .categories.find(category => category.key === 'cardBonusVp')?.total ?? 0),
)

const expectPurchase = (response: SessionResponse, actor: number, recipient: number) => {
  const player = response.state.players[actor]!
  expect(player.resources).toMatchObject({ clay: 1, wood: 3, food: 20, fuel: 10 })
  expect(response.state.players[recipient]!.minorHand).toContain(CARD_ID)
  expect(player.minorHand).not.toContain(CARD_ID)
  expect(player.minorPlayed).not.toContain(CARD_ID)
  expect(response.state.events).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'resource.paid', actorPlayerId: player.id,
      resources: expect.objectContaining({ clay: 1 }) }),
    expect.objectContaining({ type: 'resource.moved', sourceCardId: CARD_ID,
      to: { kind: 'player', playerId: player.id }, resources: { wood: 3 } }),
    expect.objectContaining({ type: 'card.passed', fromPlayerId: player.id,
      toPlayerId: response.state.players[recipient]!.id, cardId: CARD_ID }),
  ]))
  expect(response.state.log).toEqual(expect.arrayContaining([
    expect.objectContaining({ key: 'log.cardPassed', params: expect.objectContaining({ cardId: CARD_ID }),
      playerRefs: { fromPlayer: player.id, toPlayer: response.state.players[recipient]!.id } }),
  ]))
}

describe('M027 Garden Path token ownership', () => {
  it('moves the only token on a second real purchase and restores it on undo and retry', () => {
    const session = setup()
    const first = purchase(session, 0, 'meeting-place')
    expectPurchase(first, 0, 1)
    expect(first.state.players[1]!.resources.wood).toBe(0)
    expect(markerHolders(first)).toEqual([{ playerId: 'p2', score: -1 }])
    expect(bonusScores(session, first)).toEqual([0, -1])
    expect(confirmNext(session, first).interaction.stateId).toBe('idle')

    const second = purchase(session, 1, 'major-improvement')
    expectPurchase(second, 1, 0)
    expect(markerHolders(second)).toEqual([{ playerId: 'p1', score: -1 }])
    expect(bonusScores(session, second)).toEqual([-1, 0])

    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(markerHolders(undone)).toEqual([{ playerId: 'p2', score: -1 }])
    expect(bonusScores(session, undone)).toEqual([0, -1])
    expect(undone.state.players[1]!.resources).toMatchObject({ clay: 2, wood: 0 })
    expect(undone.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(undone.state.events.filter(event => event.type === 'card.passed' && event.cardId === CARD_ID)).toHaveLength(1)

    const retry = purchase(session, 1, 'major-improvement')
    expectPurchase(retry, 1, 0)
    expect(markerHolders(retry)).toEqual([{ playerId: 'p1', score: -1 }])
    expect(bonusScores(session, retry)).toEqual([-1, 0])
  })

  it('keeps the current holder across save and reload before the next purchase', () => {
    const session = setup()
    confirmNext(session, purchase(session, 0, 'meeting-place'))
    const saved = session.withCtx(() => serializeState(session.state, { actionHooks: session.actionHooks }))
    const restored = new GameSession(saved)
    sessions.push(restored)
    const loaded = restored.getState()
    expect(loaded.interaction.stateId).toBe('idle')
    expect(loaded.state.players[0]!.minorHand).toEqual([])
    expect(markerHolders(loaded)).toEqual([{ playerId: 'p2', score: -1 }])
    expect(bonusScores(restored, loaded)).toEqual([0, -1])
    const next = purchase(restored, 1, 'major-improvement')
    expect(markerHolders(next)).toEqual([{ playerId: 'p1', score: -1 }])
    expect(bonusScores(restored, next)).toEqual([-1, 0])
  })

  it.each(['no forest', 'no clay'])('does not buy or place a token with %s', missing => {
    const session = setup(state => {
      if (missing === 'no forest') state.players[0]!.farmTerrain = []
      else state.players[0]!.resources.clay = 0
    })
    const response = session.takeAction(0, 'meeting-place')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.resources.clay).toBe(missing === 'no clay' ? 0 : 2)
    expect(response.state.players[0]!.minorHand).toEqual([CARD_ID])
    expect(markerHolders(response)).toEqual([])
    expect(bonusScores(session, response)).toEqual([0, 0])
    expect(response.state.events.filter(event => event.type === 'card.passed' && event.cardId === CARD_ID)).toEqual([])
    expect(response.state.log.filter(entry => entry.key === 'log.cardPassed')).toEqual([])
  })
})
