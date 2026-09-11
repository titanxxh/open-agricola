import { describe, expect, it } from 'vitest'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { resourceOptions, setupResourceAction } from './_helpers/batch07-resource-ownership'

import '../../shared/cards/C/C036_ClayDeposit'

describe('C036 Clay Deposit through Session', () => {
  it('returns one collected clay to its space and gains one bonus point', () => {
    const session = setupResourceAction('C036_ClayDeposit', 'clay-pit')
    session.state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = 3
    session.loadState(session.state)
    let response = resolveTriggerIfPresent(session, session.takeAction(0, 'clay-pit'), 'C036_ClayDeposit')
    const accept = resourceOptions(response).find((option) => option.value !== '__skip__')
    expect(accept, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(0, accept!.value)
    expect(response.state.players[0]!.resources.clay).toBe(2)
    expect(response.state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay).toBe(1)
    expect(response.state.players[0]!.cardStates.C036_ClayDeposit?.counters?.bonusVp).toBe(1)
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.moved', resources: { clay: 1 },
      from: { kind: 'player', playerId: response.state.players[0]!.id },
      to: { kind: 'actionSpace', spaceId: 'clay-pit' },
    }))
  })

  it('decline keeps all collected clay and grants no point', () => {
    const session = setupResourceAction('C036_ClayDeposit', 'clay-pit')
    session.state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = 3
    session.loadState(session.state)
    const offered = resolveTriggerIfPresent(session, session.takeAction(0, 'clay-pit'), 'C036_ClayDeposit')
    expect(offered.interaction.stateId).toBe('wait')
    const response = session.resolveChoice(0, '__skip__')
    expect(response.state.players[0]!.resources.clay).toBe(3)
    expect(response.state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay).toBe(0)
    expect(response.state.players[0]!.cardStates.C036_ClayDeposit?.counters?.bonusVp ?? 0).toBe(0)
  })
})
