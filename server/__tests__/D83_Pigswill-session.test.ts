import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/D/D083_Pigswill'

const CARD_ID = 'D083_Pigswill'

const setup = (opts?: { food?: number; grain?: number }) => {
  const session = new GameSession(/* seed */ 1)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = {
    ...player.resources,
    food: opts?.food ?? 2,
    grain: opts?.grain ?? 0,
  }
  player.minorHand = [CARD_ID]
  player.occupationHand = ['__test_placeholder__']
  const opponent = state.players[1]!
  opponent.minorHand = ['__test_placeholder__']
  opponent.occupationHand = ['__test_placeholder__']
  opponent.workersAvailable = 2

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

const playD83 = (session: GameSession) => {
  const resp = enterImprovementChoice(session)
  if (resp.state.players[0]!.minorPlayed.includes(CARD_ID)) return resp
  if (resp.interaction.stateId !== 'wait') return resp
  if (resp.interaction.promptKey === 'prompt.selectPayment') return resp
  const d83Option = resp.interaction.request.options?.find((o) => o.value === CARD_ID)
  expect(d83Option).toBeDefined()
  return session.resolveChoice(0, d83Option!.value)
}

describe('D083_Pigswill session — altCosts', () => {
  it('D083 S1: food=2 and grain=0 auto-pays food', () => {
    const session = setup({ food: 2, grain: 0 })
    const resp = playD83(session)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  it('D083 S2: food=0 and grain=1 auto-pays grain', () => {
    const session = setup({ food: 0, grain: 1 })
    const resp = playD83(session)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.grain).toBe(0)
  })

  it('D083 supplemental: both costs available require a payment choice', () => {
    const session = setup({ food: 2, grain: 1 })
    const resp = playD83(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('prompt.selectPayment')
    expect(resp.interaction.request.options?.length).toBeGreaterThanOrEqual(2)
  })

  it('D083 supplemental: neither complete cost keeps Pigswill unavailable', () => {
    const session = setup({ food: 1, grain: 0 })
    expect(session.getActionAvailability(0)['major-improvement']).toBe(false)
    const resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(false)
    expect(resp.state.players[0]!.minorHand).toContain(CARD_ID)
  })
})

const setupTrigger = () => {
  const session = setup({ food: 0, grain: 0 })
  const state = session.getState().state
  const player = state.players[0]!
  player.minorHand = ['__test_placeholder__']
  player.minorPlayed = [CARD_ID]
  player.resources.wood = 4
  player.resources.boar = 0
  session.loadState(state)
  return session
}

describe('D083 Pigswill parity trigger', () => {
  it('D083 S3: using Fencing gains one boar before completing a one-space pasture', () => {
    const session = setupTrigger()
    const selection = session.takeAction(0, 'fencing')
    expect(selection.ok, selection.error).toBe(true)

    const response = session.commitSelectionChoice(0, {
      edges: ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1'],
      extraWood: 0,
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.boar).toBe(1)
    expect(response.state.players[0]!.pastures).toHaveLength(1)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('D083 S4: an unrelated action grants no boar', () => {
    const response = setupTrigger().takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.boar).toBe(0)
  })
})
