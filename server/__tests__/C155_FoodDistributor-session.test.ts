import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { markAllWorkersUsed } from '../../shared/domain/player'
import type { GameSession } from '../game/authoritative-session'
import { collectScheduledEffectPreviews } from '../../shared/actions/scheduled-effect-preview'
import '../../shared/cards/C/C155_FoodDistributor'

const CARD_ID = 'C155_FoodDistributor'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const setup = (purchaseRound = 5, occupied = 2) => {
  const session = createWorkSession({ seed: 6155, options: { playerCount: 4 }, configure: state => {
    state.round = 5
    state.players.forEach(player => { player.resources.food = 30; markAllWorkersUsed(state, player) })
    const owner = state.players[0]!
    owner.resources.grain = 0
    owner.occupationPlayed = [CARD_ID]
    owner.cardStates[CARD_ID] = { extraData: { purchaseRound } }
    state.roundActionOrder.slice(0, occupied).forEach((id, index) => {
      const space = state.actionSpaces.find(entry => entry.id === id)
      if (space) space.takenBy = [{ playerId: state.players[index]!.id, workerId: '1' }]
    })
  } })
  sessions.push(session)
  return session
}

describe('C155 authoritative timed reward', () => {
  it('describes the future occupancy formula without mutating state, then counts distinct round action spaces at return home', () => {
    const session = setup()
    const before = JSON.stringify(session.state)
    expect(session.withCtx(() => collectScheduledEffectPreviews(session.state, session.state.players[0]!, session.actionHooks)).find(entry => entry.sourceCard === CARD_ID))
      .toMatchObject({ round: 5, timing: 'onStartReturnHome', description: { effectPreview: { kind: 'formulaGain', resources: { food: { kind: 'occupied-round-spaces' } } } } })
    expect(JSON.stringify(session.state)).toBe(before)
    const response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.food).toBe(32)
    expect(response.state.events.some(event => event.type === 'resource.moved' && event.sourceCardId === CARD_ID && event.resources.food === 2)).toBe(true)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.extraData?.timedRuleReceipts).toEqual(['occupied-round-reward:5'])
    expect(response.interaction.stateId).toBe('idle')
  })
  it('does not pay in a later round or promise another payout after consumption', () => {
    const session = setup(4)
    expect(session.withCtx(() => collectScheduledEffectPreviews(session.state, session.state.players[0]!, session.actionHooks)).filter(entry => entry.sourceCard === CARD_ID)).toEqual([])
    const response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(30)
  })
  it('pays zero when no round action space is occupied', () => {
    const session = setup(5, 0)
    const response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(30)
  })
})
