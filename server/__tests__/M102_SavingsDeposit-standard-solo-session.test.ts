import { afterEach, describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { createOpeningSession, createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged } from './_helpers/session-assertions'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { captureStateWithHistory } from '../../shared/session/history-streams'

const CARD_ID = 'M102_SavingsDeposit'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

const make = (playerCount: number, clay: number) => {
  const options = { playerCount, enableFarmersOfTheMoor: true, deckIds: ['A'] }
  const opening = createOpeningSession({ seed: 42, options,
    expected: { phase: 'playing', roundPhase: 'work', interaction: { stateId: 'idle' } },
  })
  sessions.push(opening)
  const preparedSupply = structuredClone(opening.state.farmersOfTheMoor)
  const session = createWorkSession({ seed: 42, options, configure(state) {
    state.round = 4
    state.farmersOfTheMoor = preparedSupply
    for (const [index, player] of state.players.entries()) {
      player.resources = {
        food: 20, fuel: 20, horse: 0, wood: 0, clay: index === 0 ? clay : 0,
        reed: 0, stone: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
      for (const [workerIndex, id] of (index === 0 ? ['forest', 'clay-pit'] : ['reed-bank', 'fishing']).entries()) {
        state.actionSpaces.find(space => space.id === id)!.takenBy.push({ playerId: player.id, workerId: player.workers[workerIndex]!.id })
      }
    }
    state.players[0]!.minorPlayed = [CARD_ID]
    state.ordinaryCardDecks.minor = state.ordinaryCardDecks.minor.filter(id => id !== CARD_ID)
  } })
  sessions.push(session)
  return session
}

describe('Savings Deposit explicit passing with actual participants', () => {
  it.each([
    { playerCount: 1, clay: 0, food: 14 },
    { playerCount: 1, clay: 20, food: 20 },
    { playerCount: 2, clay: 0, food: 16 },
    { playerCount: 2, clay: 20, food: 22 },
  ])('rolls once, settles $clay clay and passes at $playerCount participants', ({ playerCount, clay, food }) => {
    const session = make(playerCount, clay)
    const scores = session.getState().scores!
    let response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'heating', required: 2 } })
    expect(response.state.players[0]!.resources.food).toBe(food)
    for (let step = 0; step < 12 && response.state.round === 4 && response.interaction.stateId === 'wait'; step++) {
      const request = response.interaction.request
      if (request.kind === 'heating') {
        response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { fuelUsed: request.required, woodToFuel: 0 })
      } else if (request.kind === 'feed') {
        response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { selections: [] })
      } else if (request.kind === 'confirm-player-switch') {
        response = session.resolveChoice(request.fromPlayerIndex, 'confirm')
      } else if (session.peekEnginePendingEnvelope()?.syntheticKind === 'post-reap-anytime') {
        response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
      } else throw new Error(`Unexpected harvest request: ${request.kind}`)
      expect(response.ok, response.error).toBe(true)
    }
    expect(response.state.round, JSON.stringify(response.interaction)).toBe(5)
    if (response.interaction.stateId === 'wait') {
      const request = response.interaction.request
      expect(request.kind).toBe('choice')
      expect('moorSolo' in request ? request.moorSolo : null).toMatchObject({ window: 'preparation' })
    }
    expect(response.state.players[0]!.resources).toMatchObject({ food, clay, fuel: 18, begging: 0 })
    expect(response.state.players[0]!.minorPlayed).toEqual([])
    expect(response.state.players[0]!.cardStates[CARD_ID]).toBeUndefined()
    expect(response.state.ordinaryCardDecks.minor).not.toContain(CARD_ID)
    const gains = response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD_ID)
    if (clay === 20) {
      expect(gains).toEqual([expect.objectContaining({ to: { kind: 'player', playerId: 'p1' }, resources: { food: 6 } })])
      const feeding = response.state.events.find(event => event.type === 'resource.paid' && event.actorPlayerId === 'p1' && event.paymentFor === 'feeding')
      expect(feeding!.seq).toBeGreaterThan(gains[0]!.seq)
      const awardedFood = gains.reduce((total, event) => total + (event.type === 'resource.moved' ? event.resources.food ?? 0 : 0), 0)
      expect(20 + awardedFood).toBe(26)
      expect(response.state.log).toContainEqual(expect.objectContaining({
        key: 'log.cardEffectGain', params: expect.objectContaining({ cardId: CARD_ID, gain: { food: 6 } }),
      }))
    } else expect(gains).toEqual([])
    expect(response.scores![0]!.total - scores[0]!.total).toBe(-1)
    if (playerCount === 1) {
      expect(response.state.events.filter(event => event.type === 'card.destroyed' && event.cardId === CARD_ID))
        .toEqual([expect.objectContaining({ playerId: 'p1', reason: 'passed', sourceCardId: CARD_ID })])
      expect(response.state.events.some(event => event.type === 'card.passed' && event.cardId === CARD_ID)).toBe(false)
      expect(response.state.log).toContainEqual(expect.objectContaining({ key: 'log.cardDestroyed', params: expect.objectContaining({ cardId: CARD_ID }) }))
      expect(response.privateEvents?.some(event => event.type === 'private.handChanged' && event.sourceCard === CARD_ID) ?? false).toBe(false)
    } else {
      expect(response.state.players[1]!.minorHand).toEqual(['__test_placeholder__', CARD_ID])
      expect(response.state.players[1]!.resources).toMatchObject({ food: 16, clay: 0, fuel: 18 })
      expect(response.state.events.filter(event => event.type === 'card.passed' && event.cardId === CARD_ID))
        .toEqual([expect.objectContaining({ fromPlayerId: 'p1', toPlayerId: 'p2' })])
      expect(response.scores![1]!.total).toBe(scores[1]!.total)
    }
    assertRejectedUnchanged(session, () => session.undoStep())
    assertRejectedUnchanged(session, () => session.undoAction())
    const before = captureStateWithHistory(session.state)
    const interaction = structuredClone(session.getState().interaction)
    const saved = session.withCtx(() => serializeSessionSnapshot(session.state, session))
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(saved))))
    sessions.push(restored)
    expect(captureStateWithHistory(restored.getState().state)).toEqual(before)
    expect(restored.getState().interaction).toEqual(interaction)
    expect(restored.getState().state.players[0]!.resources.food).toBe(food)
    expect(restored.getState().state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD_ID)).toHaveLength(clay === 20 ? 1 : 0)
  })
})
