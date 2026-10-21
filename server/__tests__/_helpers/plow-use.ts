import assert from 'node:assert/strict'
import type { GameSession, SessionResponse } from '../../game/authoritative-session'
import { getChoiceOptions } from './session-assertions'

export function completePlowUse(session: GameSession, initial: SessionResponse, cardId: string, bonusPlows = 2, stopBeforeSow = false): SessionResponse {
  let response = initial
  let used = 0
  for (let step = 0; step < 32 && response.interaction.stateId === 'wait'; step++) {
    const interaction = response.interaction
    if (interaction.request.kind === 'confirm-next-player') return response
    if (stopBeforeSow && getChoiceOptions(response).some(option => option.labelKey === 'actions.sow.name')
      && !getChoiceOptions(response).some(option => option.labelKey === 'actions.plow.name' && !option.disabled)) return response
    if (interaction.request.kind === 'farm-select' && interaction.request.farm.farmType === 'plow') {
      if (interaction.sourceCard === cardId) used++
      response = session.commitSelectionChoice(interaction.playerIndex, { tile: interaction.request.farm.selectableTiles[0]! })
    } else if (interaction.request.kind === 'confirm-player-switch') {
      response = session.resolveChoice(interaction.request.fromPlayerIndex, 'confirm')
    } else {
      const options = getChoiceOptions(response).filter(option => !option.disabled)
      const option = (used < bonusPlows ? options.find(option => !['__skip__', '__pass__', '__done__'].includes(option.value)) : undefined)
        ?? options.find(option => ['__skip__', '__pass__', '__done__'].includes(option.value))
        ?? options[0]
      assert.ok(option, JSON.stringify(interaction))
      response = session.resolveChoice(interaction.playerIndex, option.value)
    }
    assert.equal(response.ok, true, response.error)
  }
  assert.equal(response.interaction.stateId, 'idle', JSON.stringify(response.interaction))
  return response
}
