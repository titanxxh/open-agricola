import assert from 'node:assert/strict'
import { emptyResources } from '../../../shared/contract/state-constants'
import { markAllWorkersUsed } from '../../../shared/domain/player'
import { createWorkSession } from './session-fixtures'

export const createGardenDesignerScoringSession = () => {
  const session = createWorkSession({ seed: 5099, configure: state => {
    state.round = 14
    for (const space of state.actionSpaces) space.takenBy = []
    for (const player of state.players) {
      player.resources = { ...emptyResources, food: 4 }
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.cardStates = {}
      player.fields = []
      player.pastures = []
      markAllWorkersUsed(state, player)
      for (const worker of player.workers) {
        if (worker.isActive) state.actionSpaces[0]!.takenBy.push({ playerId: player.id, workerId: worker.id })
      }
    }
    const owner = state.players[0]!
    owner.occupationPlayed = ['C099_GardenDesigner']
    owner.resources.food = 14
    owner.fields = [0, 1, 2].map(col => ({ row: 0, col, stacks: [] }))
  } })
  try {
    let response = session.performRoundEnd()
    for (let step = 0; step < 20; step++) {
      assert.ok(response.ok, response.error)
      const interaction = response.interaction
      assert.equal(interaction.stateId, 'wait')
      assert.ok(interaction.stateId === 'wait')
      if (interaction.sourceCard === 'C099_GardenDesigner' && interaction.request.kind === 'choice') {
        assert.equal(response.state.players[0]!.resources.food, 10)
        return session
      }
      const { playerIndex, request } = interaction
      if (request.kind === 'feed') response = session.resolveChoice(playerIndex, 'confirm', { selections: [] })
      else if (request.kind === 'confirm-next-player' || request.kind === 'confirm-player-switch') {
        response = session.resolveChoice(playerIndex, 'confirm')
      } else if (request.options?.some(option => option.value === '__skip__')) {
        response = session.resolveChoice(playerIndex, '__skip__')
      } else throw new Error(`Unexpected harvest request: ${request.kind}`)
    }
    throw new Error('Did not reach Garden Designer scoring')
  } catch (error) {
    session.dispose()
    throw error
  }
}
