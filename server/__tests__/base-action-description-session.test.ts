import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { serializeSessionSnapshot } from '../../shared/session/serialization'
import '../../shared/cards/B/B171_GreenhouseBuilder'
import '../../shared/cards/C/C094_StableCleaner'
import '../../shared/cards/D/D106_WhiskyDistiller'

const sessions: ReturnType<typeof createWorkSession>[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

describe('authoritative base rules and current actor prices', () => {
  it('snapshots Greenhouse Builder base branches while current fencing keeps the session price', () => {
    const session = createWorkSession({ configure: state => {
      state.round = 1
      state.roundActionOrder = state.roundActionOrder.map(() => null)
      state.roundActionOrder[0] = 'fencing'
      state.players[0]!.occupationPlayed = ['B171_GreenhouseBuilder']
      state.players[0]!.resources.wood = 4
    } })
    sessions.push(session)
    const before = JSON.stringify(session.state)
    const snapshot = serializeSessionSnapshot(session.state, session)
    const base = snapshot.frame.actionSpaces.find(space => space.id === 'B171_GreenhouseBuilder')?.baseDescriptionPreview
    expect(base).toMatchObject({ kind: 'action', effectPreview: { kind: 'rule', description: {
      kind: 'group', operator: 'xor', parts: [
        { labelKey: 'actions.fencing.name', parts: [{ effectPreview: { kind: 'fencePlan', segments: [{ kind: 'fence', woodCost: 1 }] } }] },
        { labelKey: 'actions.house-redevelopment.name' },
        { labelKey: 'actions.vegetable-seeds.name', effectPreview: { kind: 'resourceExchange', resourcesGained: { vegetable: 1 } } },
      ],
    } } })
    expect(JSON.stringify(session.state)).toBe(before)
    expect(session.getAvailableActions(0).map(entry => entry.spaceId)).toContain('B171_GreenhouseBuilder')
    session.state.players[0]!.resources.wood = 0
    expect(session.getAvailableActions(0).map(entry => entry.spaceId)).not.toContain('B171_GreenhouseBuilder')
    session.actionHooks.register({ id: 'test:free-fence', actions: ['fence'], phases: ['computeCosts'], handler: () => ({ costs: { wood: -4 } }) })
    expect(session.getAvailableActions(0).map(entry => entry.spaceId)).toContain('B171_GreenhouseBuilder')
    expect(serializeSessionSnapshot(session.state, session).frame.actionSpaces.find(space => space.id === 'B171_GreenhouseBuilder')?.baseDescriptionPreview).toEqual(base)
    const offered = session.takeAction(0, 'B171_GreenhouseBuilder')
    expect(offered.ok, offered.error).toBe(true)
    expect(offered.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'farm-select', farm: { farmType: 'fence' } } })
  })

  it.each([0, 1, 2])('Lessons 4 keeps its base fee schedule and charges the actual fee after %i occupations', played => {
    // This fee schedule belongs to the four-player board; all other scenarios use two players.
    const session = createWorkSession({ seed: 6024, options: { playerCount: 4 }, configure: state => {
      const player = state.players[0]!
      player.occupationPlayed = Array.from({ length: played }, (_, index) => `__played_placeholder_${index}`)
      player.occupationHand = ['D106_WhiskyDistiller']
      player.resources.food = 20
    } })
    sessions.push(session)
    const before = JSON.stringify(session.state)
    for (let read = 0; read < 3; read++) {
      const response = session.getState()
      const publicState = session.buildSyncPayload(response, response.state.players[1]!.id).state
      expect(publicState.actionSpaces.find(space => space.id === 'lessons-4')?.baseDescriptionPreview)
        .toMatchObject({ effectPreview: { kind: 'occupationFees', food: [1, 1, 2] } })
    }
    expect(JSON.stringify(session.state)).toBe(before)
    const response = session.takeAction(0, 'lessons-4')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('D106_WhiskyDistiller')
    expect(response.state.players[0]!.resources.food).toBe(20 - (played < 2 ? 1 : 2))
    expect(response.state.players[1]!.occupationPlayed).toEqual([])
    expect(response.state.log.some(entry => entry.key === 'log.playOccupation')).toBe(true)
    expect(response.scores?.[0]).toBeDefined()
  })

  it('Stable Cleaner exposes its actual count prices while Farm Expansion still shows the base rules to either viewer', () => {
    const session = createWorkSession({ seed: 6024, configure: state => {
      const player = state.players[0]!
      player.occupationPlayed = ['C094_StableCleaner']
      player.resources.wood = 2
      player.resources.food = 2
    } })
    sessions.push(session)
    const response = session.getState()
    const base = response.state.players.map(player => session.buildSyncPayload(response, player.id).state.actionSpaces.find(space => space.id === 'farm-expansion')?.baseDescriptionPreview)
    expect(base[0]).toEqual(base[1])
    expect(base[0]).toMatchObject({ kind: 'group', operator: 'or' })
    if (base[0]?.kind !== 'group') throw new Error('Missing Farm Expansion alternatives')
    expect(base[0].parts[1]).toMatchObject({ effectPreview: { kind: 'unitCost', resourcesPaid: { wood: 2 } } })
    const action = response.interaction.anytimeActions.find(entry => entry.id === 'C94-stable-cleaner-anytime')
    expect(action?.descriptionPreview).toMatchObject({ effectPreview: { kind: 'actionCosts', options: [
      { amount: 1, paymentOptions: [{ kind: 'payment', resourcesPaid: { wood: 1, food: 1 } }] },
      { amount: 2, paymentOptions: [{ kind: 'payment', resourcesPaid: { wood: 2, food: 2 } }] },
    ] } })
    const selection = session.takeAnytimeAction(0, 'C94-stable-cleaner-anytime')
    expect(selection.ok, selection.error).toBe(true)
    if (selection.interaction.stateId !== 'wait' || selection.interaction.request.kind !== 'farm-select' || selection.interaction.request.farm.farmType !== 'stable') throw new Error('Missing stable selection')
    const built = session.commitSelectionChoice(0, { stables: selection.interaction.request.farm.selectableTiles.slice(0, 2) })
    expect(built.ok, built.error).toBe(true)
    expect(built.state.players[0]!.stableTiles).toHaveLength(2)
    expect(built.state.players[0]!.resources).toMatchObject({ wood: 0, food: 0 })
    expect(built.state.players[1]!.stableTiles).toEqual([])
    expect(built.scores?.[0]).toBeDefined()
  })
})
