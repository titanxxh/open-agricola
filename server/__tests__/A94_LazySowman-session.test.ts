import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import '../../shared/cards/A/A94_LazySowman'

const setup = (options?: {
  withCard?: boolean
  grain?: number
  vegetable?: number
  workersAvailable?: number
}) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundActionOrder = state.roundActionOrder.map(() => null)
  state.roundActionOrder[0] = 'grain-utilization'

  const player = state.players[0]!
  player.workersAvailable = options?.workersAvailable ?? 2
  player.resources.grain = options?.grain ?? 0
  player.resources.vegetable = options?.vegetable ?? 0
  player.fields = [{ row: 0, col: 0, crop: null, remaining: 0 }]

  if (options?.withCard ?? true) {
    player.occupationPlayed.push('A94_LazySowman')
    player.playedCards.push('occupation:A94_LazySowman')
  }

  const opponentId = state.players[1]!.id
  const dayLaborer = state.actionSpaces.find((space) => space.id === 'day-laborer')
  const meetingPlace = state.actionSpaces.find((space) => space.id === 'meeting-place')
  if (!dayLaborer || !meetingPlace) throw new Error('required action space missing')
  dayLaborer.takenBy = opponentId
  meetingPlace.takenBy = opponentId

  session.loadState(state)
  return session
}

describe('A94_LazySowman session', () => {
  it('turns unavailable sow into an immediate extra place-farmer flow', () => {
    const session = setup({ withCard: true })

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    expect(resp.pending.promptKey).toBe('ui.interactionLazySowmanPlace')
    expect(resp.state.players[0]!.cardStates?.A94_LazySowman?.counters?.triggerCount).toBe(1)

    const continueOption = resp.pending.options.find((option) => option.value !== '__skip__')
    expect(continueOption).toBeDefined()

    resp = session.resolveChoice(0, continueOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    expect(resp.pending.promptKey).toBe('ui.interactionPlaceFarmerExtra')
    expect(resp.pending.options.map((option) => option.value)).toContain('allow-occupied:day-laborer')
    expect(resp.pending.options.map((option) => option.value)).not.toContain('allow-occupied:meeting-place')

    resp = session.resolveChoice(0, 'allow-occupied:day-laborer')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('confirmNextPlayer')
    expect(resp.state.players[0]!.workersAvailable).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(4)
    expect(resp.state.actionSpaces.find((space) => space.id === 'day-laborer')?.takenBy).toBe(resp.state.players[1]!.id)
  })

  it('does not trigger the extra placement when no worker remains after taking the action', () => {
    const session = setup({ withCard: true, workersAvailable: 1 })

    const resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('confirmNextPlayer')
    expect(resp.state.players[0]!.workersAvailable).toBe(0)
    expect(resp.state.players[0]!.cardStates?.A94_LazySowman).toBeUndefined()
  })

  it('does not replace a normal sow that can already be executed', () => {
    const session = setup({ withCard: true, grain: 1 })

    const resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    expect(resp.pending.promptKey).toBe('ui.interactionSowSelect')
    expect(resp.state.players[0]!.cardStates?.A94_LazySowman).toBeUndefined()
    expect(resp.interaction?.stateId).toBe('farmSelect')
  })
})
