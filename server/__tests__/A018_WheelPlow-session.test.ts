import { describe, expect, it } from 'vitest'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { commitFirstPlow, setupSowingSession, sowOptions } from './_helpers/batch07-sowing'

import '../../shared/cards/A/A018_WheelPlow'

describe('A018 Wheel Plow through Session', () => {
  it('builds both Cultivation bonus fields before the same action sows', () => {
    const session = setupSowingSession({ cardId: 'A018_WheelPlow', grain: 3 })
    session.state.players[0]!.occupationPlayed = ['A116_WoodCutter', 'B121_Geologist']
    session.loadState(session.state)

    let response = commitFirstPlow(session, session.takeAction(0, 'cultivation'))
    response = resolveTriggerIfPresent(session, response, 'A018_WheelPlow')
    const accept = sowOptions(response).find((option) => option.value !== '__skip__')
    expect(accept, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.stateId === 'wait' ? response.interaction.playerIndex : 0, accept!.value)
    response = commitFirstPlow(session, response)
    const second = sowOptions(response).find((option) => option.value !== '__skip__')
    expect(second, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.stateId === 'wait' ? response.interaction.playerIndex : 0, second!.value)
    response = commitFirstPlow(session, response)

    expect(response.state.players[0]!.fields).toHaveLength(3)
    expect(response.state.players[0]!.cardStates.A018_WheelPlow?.flagged).toBe(true)
    const sowOption = sowOptions(response).find((option) =>
      option.value === 'sow' || option.labelKey === 'actions.sow.name')
    expect(sowOption, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.stateId === 'wait' ? response.interaction.playerIndex : 0, sowOption!.value)
    const fields = response.state.players[0]!.fields
    response = session.commitSelectionChoice(0, {
      crops: fields.map(({ row, col }) => ({ row, col, crop: 'grain' as const })),
    })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields.map((field) => field.stacks[0]?.remaining)).toEqual([3, 3, 3])
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })
})
