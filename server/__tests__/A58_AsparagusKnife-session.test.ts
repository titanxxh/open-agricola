import { getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
import { describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { markAllWorkersUsed } from '../../shared/domain/player'
const sessionEvidence = createScenarioEvidence(import.meta.url)
const CARD_ID = 'A058_AsparagusKnife'
const setup = (round: number, crop: 'vegetable' | 'grain' = 'vegetable', remaining = 2) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 2058, configure: state => {
      state.round = round
      for (const player of state.players) { player.resources.food = 60; markAllWorkersUsed(state, player) }
      state.players[0]!.minorPlayed = [CARD_ID]
      state.players[0]!.fields = [{ row: 0, col: 2, stacks: remaining ? [{ kind: crop, remaining }] : [] }]
    } }))
  return session
}
describe('Asparagus Knife scheduled field exchange', () => {
  it.each([8, 10, 12])('round %i offers exactly one field vegetable for three food and one point', round => {
    const session = setup(round)
    let response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('Missing field exchange offer')
    expect(response.interaction.playerIndex).toBe(0)
    const accept = getChoiceOptions(response)?.find(option => option.value !== '__skip__')
    if (!accept) throw new Error('Missing acceptance')
    response = session.resolveChoice(0, accept.value)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'selection') response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
    expect(response.state.players[0]!.resources.food).toBe(60)
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') throw new Error('Missing independent exchange')
    const exchange = getChoiceOptions(response)?.find(option => option.value !== '__skip__')
    if (!exchange) throw new Error('Missing exchange acceptance')
    response = session.resolveChoice(0, exchange.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(1)
    expect(response.state.players[0]!.resources.food).toBe(63)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(1)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
    expect(response.state.events.some(event => event.type === 'card.stateChanged')).toBe(true)
    expect(session.getState().scores).toBeDefined()
  })
  it('declining does not remove vegetables or add food or points', () => {
    const session = setup(8)
    const offered = session.performRoundEnd()
    if (offered.interaction.stateId !== 'wait') throw new Error('Missing field exchange offer')
    const response = session.resolveChoice(0, '__skip__')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(2)
    expect(response.state.players[0]!.resources.food).toBe(60)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })
  it.each([[8, 'grain', 2], [8, 'vegetable', 0], [6, 'vegetable', 2]] as const)('round %i crop %s remaining %i has no offer', (round, crop, remaining) => {
    const response = setup(round, crop, remaining).performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined).not.toBe(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(60)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
  })
})
