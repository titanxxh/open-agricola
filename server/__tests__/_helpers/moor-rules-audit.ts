import { expect } from 'vitest'
import { GameSession } from '../../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../../shared/domain/player'

export const setupMoorAudit = (playerCount = 2, round = 5) => {
  const session = new GameSession(56131, undefined, { playerCount, enableFarmersOfTheMoor: true })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.resources = { ...player.resources, food: 20, fuel: 20, wood: 20, clay: 20, reed: 20, stone: 20 }
    player.farmTerrain = []
    setWorkersAtHome(state, player, 2)
  }
  session.loadState(state)
  expect(session.state.players).toHaveLength(playerCount)
  expect(session.state.enableFarmersOfTheMoor).toBe(true)
  return session
}

export const playMoorAuditMinor = (session: GameSession, cardId: string) => {
  session.state.players[0]!.minorHand = [cardId]
  let response = session.takeAction(0, 'major-improvement')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.request.options?.some((option) => option.value === cardId)) {
    response = session.resolveChoice(0, cardId)
    expect(response.ok, response.error).toBe(true)
  }
  if (response.interaction.promptKey === 'prompt.selectPayment') {
    const payment = response.interaction.request.options.find((option) => option.value !== 'cancel')!
    response = session.resolveChoice(0, payment.value)
    expect(response.ok, response.error).toBe(true)
  }
  expect(response.state.log.some((entry) => JSON.stringify(entry.params ?? {}).includes(cardId))).toBe(true)
  return response
}

export const acceptMoorAuditChoice = (session: GameSession, response: ReturnType<GameSession['getState']>) => {
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  const option = response.interaction.request.options.find((entry) => entry.value !== '__skip__' && entry.value !== 'cancel')!
  expect(option).toBeDefined()
  const next = session.resolveChoice(response.interaction.playerIndex, option.value)
  expect(next.ok, next.error).toBe(true)
  return next
}

export const advanceMoorAuditToRound = (session: GameSession, round: number) => {
  const pending = session.getState().interaction
  if (pending.stateId === 'wait' && pending.request.kind === 'confirm-next-player') {
    expect(session.resolveChoice(pending.playerIndex, 'confirm').ok).toBe(true)
  }
  session.state.round = round - 1
  for (const player of session.state.players) markAllWorkersUsed(session.state, player)
  session.loadState(session.state)
  let response = session.performRoundEnd()
  for (let step = 0; step < 24 && response.state.round < round; step++) {
    expect(response.ok, response.error).toBe(true)
    const request = response.interaction.request
    if (request.kind === 'feed') {
      response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { selections: [] })
    } else if (request.kind === 'heating') {
      response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { fuelUsed: request.required, woodToFuel: 0 })
    } else if (request.kind === 'choice') {
      expect(request.options.map((option) => option.value)).toContain('__skip__')
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    } else if (request.kind === 'confirm-next-player' || request.kind === 'confirm-player-switch') {
      response = session.resolveChoice(response.interaction.playerIndex, 'confirm')
    } else {
      response = session.performRoundEnd()
    }
  }
  expect(response.ok, response.error).toBe(true)
  expect(response.state.round).toBe(round)
  return response
}

export const startMoorAuditFeeding = (session: GameSession) => {
  for (const player of session.state.players) markAllWorkersUsed(session.state, player)
  session.loadState(session.state)
  let response = session.performRoundEnd()
  for (let step = 0; step < 12 && response.interaction.request.kind !== 'feed'; step++) {
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.request.kind).toBe('choice')
    expect(response.interaction.request.options.map((option) => option.value)).toContain('__skip__')
    response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
  }
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.request.kind).toBe('feed')
  return response
}
