// Helpers of ae-negative-C150-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import type { GameSession } from '../../../game/authoritative-session'
import { createWorkSession } from '../session-fixtures'
import { confirmNext } from '../negative-rule-audit'
import { readCardExtraData } from '../../../../shared/cards/helpers/card-state'
import { findActionSpaceById } from '../../../../shared/domain/space'

export const CARD = 'C150_ParrotBreeder'
export const ANYTIME = 'C150-parrot-breeder-anytime'
export const sessions: GameSession[] = []
export function setup({ grain = 1, target = 'day-laborer' } = {}) {
  const session = createWorkSession({
    seed: 150,
    options: { playerCount: 4 },
    configure: state => {
      state.currentPlayerIndex = 3
      state.players[0]!.occupationPlayed = [CARD]
      state.players[0]!.resources.grain = grain
      state.players[0]!.resources.food = 0
      state.players[3]!.resources.food = 0
      if (target === 'forest') findActionSpaceById(state, target)!.resources.wood = 3
    },
  })
  sessions.push(session)
  let response = session.takeAction(3, target)
  assert.equal(response.ok, true, response.error)
  if (target === 'meeting-place' && response.interaction.stateId === 'wait'
    && response.interaction.request.kind !== 'confirm-next-player') {
    response = session.resolveChoice(3, '__skip__')
  }
  response = confirmNext(session, response)
  assert.equal(response.state.currentPlayerIndex, 0)
  assert.equal(response.interaction.stateId, 'idle')
  assert.equal(readCardExtraData(response.state.players[0]!, CARD, 'right'), target)
  return session
}
