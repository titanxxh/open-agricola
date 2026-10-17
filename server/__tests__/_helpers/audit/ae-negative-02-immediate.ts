// Helpers of ae-negative-02-immediate-session.test.ts from the negative audit snapshot fafd4f51b.
import assert from 'node:assert/strict'
import type { SessionResponse } from '../../../game/authoritative-session'
import type { GameState } from '../../../../shared/contract/types'
import { createWorkSession } from '../session-fixtures'

export const occupations = ['A116_WoodCutter', 'A118_Treegardener', 'A119_FirewoodCollector', 'A103_Portmonger']
export function setup(card: string, configure: (state: GameState) => void = () => {}) {
  return createWorkSession({ configure(state) {
    state.players[0]!.minorHand = [card]
    state.players[0]!.occupationHand = [...occupations]
    for (const player of state.players) {
      player.resources.wood = 0
      player.resources.food = 0
    }
    configure?.(state)
  } })
}
export function requireWait(response: SessionResponse) {
  assert.equal(response.ok, true, response.error)
  assert(response.interaction.stateId === 'wait')
  return response.interaction
}
export function play(session: ReturnType<typeof setup>, card: string) {
  let response = session.takeAction(0, 'meeting-place')
  requireWait(response)
  if (!response.state.players[0]!.minorHand.includes(card)) return response
  if (!choices(response).some(option => option.value === card)) {
    const improvement = choices(response).find(option => option.value.startsWith('action-improvement-'))
    assert(improvement)
    response = session.resolveChoice(0, improvement.value)
    if (!response.state.players[0]!.minorHand.includes(card)) return response
    requireWait(response)
  }
  assert(choices(response).some(option => option.value === card))
  return session.resolveChoice(0, card)
}
export function choices(response: SessionResponse) {
  const request = requireWait(response).request
  assert(request.kind === 'choice')
  return request.options
}
export function accept(session: ReturnType<typeof setup>, response: SessionResponse) {
  const option = choices(response).find(candidate => !['skip', '__skip__'].includes(candidate.value))
  assert(option)
  return session.resolveChoice(0, option.value)
}
