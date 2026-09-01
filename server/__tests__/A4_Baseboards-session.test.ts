import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A004_Baseboards'

const CARD_ID = 'A004_Baseboards'

const setup = (opts?: { food?: number; grain?: number; rooms?: number }) => {
  const session = new GameSession(/* seed */ 1)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.rooms = opts?.rooms ?? 2
  // Stock building resources so multiple majors are affordable, ensuring the
  // major-improvement choice prompt is shown (game-core auto-resolves when
  // options.length === 1 and fails when it is 0).
  player.resources = {
    ...player.resources,
    wood: 5,
    clay: 5,
    stone: 5,
    reed: 5,
    food: opts?.food ?? 2,
    grain: opts?.grain ?? 0,
  }
  player.minorHand = [CARD_ID]
  state.players[1]!.workersAvailable = 2

  const majorImprovement = state.actionSpaces.find((space) => space.id === 'major-improvement')
  if (!majorImprovement) throw new Error('major-improvement missing')
  majorImprovement.takenBy = []

  session.loadState(state)
  return session
}

const enterImprovementChoice = (session: GameSession) => {
  let resp = session.takeAction(0, 'major-improvement')
  expect(resp.ok).toBe(true)
  if (resp.interaction.stateId !== 'wait') return resp
  const improvementOption = resp.interaction.request.options?.find((o) => o.value.startsWith('action-improvement-'))
  if (improvementOption) {
    resp = session.resolveChoice(0, improvementOption.value)
    expect(resp.ok).toBe(true)
  }
  return resp
}

const playA4 = (session: GameSession) => {
  const resp = enterImprovementChoice(session)
  if (resp.interaction.stateId !== 'wait') return resp
  const a4Option = resp.interaction.request.options?.find((o) => o.value === CARD_ID)
  expect(a4Option).toBeDefined()
  return session.resolveChoice(0, a4Option!.value)
}

describe('A004_Baseboards session — altCosts', () => {
  it('food cost: gains 1 wood per room and passes Baseboards', () => {
    const session = setup({ food: 2, grain: 0, rooms: 2 })
    const scoreBefore = session.getState().scores[0]!.total
    const resp = playA4(session)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.wood).toBe(7)
    expect(resp.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(resp.state.players[1]!.minorHand).toContain(CARD_ID)
    expect(resp.state.log).toContainEqual(expect.objectContaining({
      key: 'log.cardEffectGain',
      params: expect.objectContaining({ cardId: CARD_ID, gain: { wood: 2 } }),
    }))
    expect(resp.scores[0]!.total).toBe(scoreBefore)
  })

  it('grain cost: gains an additional wood when rooms exceed people', () => {
    const session = setup({ food: 0, grain: 1, rooms: 3 })
    const scoreBefore = session.getState().scores[0]!.total
    const resp = playA4(session)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.wood).toBe(9)
    expect(resp.state.log).toContainEqual(expect.objectContaining({
      key: 'log.cardEffectGain',
      params: expect.objectContaining({ cardId: CARD_ID, gain: { wood: 4 } }),
    }))
    expect(resp.scores[0]!.total).toBe(scoreBefore - 2)
  })

  it('food=2, grain=1 → multi-solution → selectPayment choice', () => {
    const session = setup({ food: 2, grain: 1 })
    let resp = playA4(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('prompt.selectPayment')
    expect(resp.interaction.request.options?.length).toBeGreaterThanOrEqual(2)

    const grainOption = resp.interaction.request.options?.find((o) => {
      const params = o.labelParams as Record<string, unknown> | undefined
      const paid = params?.resourcesPaid as Record<string, number> | undefined
      return !!paid && (paid.grain ?? 0) === 1 && !paid.food
    })
    expect(grainOption).toBeDefined()
    resp = session.resolveChoice(0, grainOption!.value)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(2)
  })

  it('food=1, grain=0 → not buyable (cannot afford either alt)', () => {
    const session = setup({ food: 1, grain: 0 })
    const resp = enterImprovementChoice(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const a4Option = resp.interaction.request.options?.find((o) => o.value === CARD_ID)
    expect(a4Option).toBeUndefined()
  })
})
