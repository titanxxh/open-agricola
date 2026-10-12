import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { setWorkersAtHome } from '../../shared/domain/player'

const sessions: ReturnType<typeof createWorkSession>[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const setupBakeChoiceSession = () => {
  const session = createWorkSession({ seed: 42, configure: state => {
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    Object.assign(player.resources, { grain: 2, food: 0 })
    player.improvements = ['Major_Fireplace1', 'Major_ClayOven']
    Object.assign(state.players[1]!.resources, { grain: 9, food: 20 })
    state.players[1]!.improvements = ['Major_StoneOven']
  } })
  sessions.push(session)
  return session
}

describe('bake-bread session pending recovery', () => {
  it('keeps the bake choice pending after malformed bulk input', () => {
    const session = setupBakeChoiceSession()

    let resp = session.takeAction(0, 'grain-utilization')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionBakeBreadChoice')
    expect(resp.interaction.request.options?.map((option) => option.value)).toEqual([
      'Major_Fireplace1',
      'Major_ClayOven',
    ])

    expect(resp.interaction.request.options).toMatchObject([
      { value: 'Major_Fireplace1', quantityLimit: 2, effectPreview: { kind: 'resourceExchange', resourcesPaid: { grain: 1 }, resourcesGained: { food: 2 } } },
      { value: 'Major_ClayOven', quantityLimit: 1, effectPreview: { kind: 'resourceExchange', resourcesPaid: { grain: 1 }, resourcesGained: { food: 5 } } },
    ])
    expect(resp.interaction.playerIndex).toBe(0)

    resp = session.resolveChoice(0, 'bulk:bad')

    expect(resp.ok).toBe(false)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionBakeBreadChoice')
    expect(resp.interaction.request.options?.map((option) => option.value)).toEqual([
      'Major_Fireplace1',
      'Major_ClayOven',
    ])
    expect(resp.state.players[0]!.resources.grain).toBe(2)
    expect(resp.state.players[0]!.resources.food).toBe(0)

    resp = session.resolveChoice(0, 'bulk:Major_Fireplace1=1,Major_ClayOven=1')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(7)
    expect(resp.state.players[1]!.resources).toMatchObject({ grain: 9, food: 20 })
    expect(resp.state.log.some(entry => entry.key === 'log.bakeBread')).toBe(true)
    expect(resp.scores?.[0]).toBeDefined()
  })
})
