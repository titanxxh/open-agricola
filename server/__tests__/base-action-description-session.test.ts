import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import '../../shared/cards/C/C094_StableCleaner'
import '../../shared/cards/D/D106_WhiskyDistiller'

const sessions: ReturnType<typeof createWorkSession>[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

describe('authoritative base rules and current actor prices', () => {
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
