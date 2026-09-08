import { expect } from 'vitest'
import type { GameSession, SessionResponse } from '../../game/authoritative-session'

export const takeNormalWorkerTurn = (session: GameSession, spaceId: string): SessionResponse => {
  let response = session.getState()
  if (response.interaction.stateId === 'idle') {
    return session.takeAction(response.state.currentPlayerIndex, spaceId)
  }
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const ordinary = response.interaction.request.options?.find((option) => option.labelKey === 'actions.place-farmer.name')
  if (ordinary) response = session.resolveChoice(response.interaction.playerIndex, ordinary.value)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(response.interaction.promptKey).toBe('ui.interactionPlaceFarmerExtra')
  return session.resolveChoice(response.interaction.playerIndex, spaceId)
}

export const chooseSupplyWorkerTurn = (session: GameSession, cardId: string): SessionResponse => {
  let response = session.getState()
  for (let step = 0; step < 3; step++) {
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    if (response.interaction.promptKey === 'ui.interactionPlaceFarmerExtra') return response
    const options = response.interaction.request.options ?? []
    const option = options.find((entry) => entry.sourceCard === cardId && entry.labelKey !== 'ui.interactionDecline')
      ?? options.find((entry) => entry.labelKey === 'ui.interactionUseAbility')
    expect(option, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, option!.value)
    expect(response.ok, response.error).toBe(true)
  }
  throw new Error(`Supply placement did not open for ${cardId}`)
}
