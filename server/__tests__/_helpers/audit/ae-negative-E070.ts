// Helpers of ae-negative-E070-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import type { GameSession, SessionResponse } from '../../../game/authoritative-session'
import { createWorkSession } from '../session-fixtures'
import { markAllWorkersUsed } from '../../../../shared/domain/player'
import { getLogicalFields } from '../../../../shared/cards/helpers/card-field'

export const CARD = 'E070_CropRotationField'
export const sessions: GameSession[] = []
export function setup({ count = 1, otherLast = false, vegetable = 1, thunder = false } = {}) {
  const session = createWorkSession({ seed: 70, configure: state => {
    state.round = thunder ? 1 : 4
    for (const p of state.players) {
      p.resources.food = 10
      if (!thunder) markAllWorkersUsed(state, p)
    }
    const p = state.players[0]!
    p.minorPlayed = [CARD, 'E069_MelonPatch']
    p.cardStates[CARD] = { extraData: { cardFieldStacks: [{ crop: 'grain', remaining: count }] } }
    p.resources.vegetable = vegetable
    p.resources.wood = 0
    p.fields = [{ row: 0, col: 2, stacks: otherLast ? [{ kind: 'grain', remaining: 1 }] : [] }]
    if (thunder) p.minorHand = ['E004_Thunderbolt']
  } })
  sessions.push(session)
  return session
}
export function accept(session: GameSession, r: SessionResponse) {
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
  const option = r.interaction.request.options?.find(o => o.sourceCard === CARD && o.value !== '__skip__')
  assert.ok(option)
  const result = session.resolveChoice(0, option.value)
  assert.equal(result.ok, true, result.error)
  return { result, value: option.value }
}
export function crops(r: SessionResponse) {
  return getLogicalFields(r.state.players[0]!).filter(field => field.kind === 'card' && field.sourceCard === CARD)
    .flatMap(field => field.slots.flatMap(slot => slot.layers.map(layer => ({ crop: layer.kind, remaining: layer.remaining }))))
}
