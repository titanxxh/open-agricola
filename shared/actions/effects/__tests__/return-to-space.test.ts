import { describe, expect, it } from 'vitest'
import type { DraftGameEvent } from '../../../contract/events'
import type { ActionMutationContext } from '../../../contract/types'
import { createInitialState } from '../../../session/state-bootstrap'
import { installOfficialCardRegistry } from '../../../cards/__tests__/card-environment'
import { returnToSpaceAction } from '../internal/return-to-space'

installOfficialCardRegistry()

function fixture() {
  const state = createInitialState(42, { playerCount: 2, ordinaryCardDeckSeed: 42, parentSelectionSeed: 42 })
  const player = state.players[0]!
  const target = state.actionSpaces.find(space => space.id === 'forest')!
  target.resources = {}
  const events: DraftGameEvent[] = []
  const context: ActionMutationContext = {
    state, player, space: state.actionSpaces.find(space => space.id === 'day-laborer')!, actionHooks: undefined,
    actionContext: { targetSpaceId: target.id },
    eventSink: {
      emit(event) { events.push(event) },
      emitMany(batch) { events.push(...batch) },
    },
  }
  return { context, player, target, events }
}

describe('return-to-space', () => {
  it.each(['sheep', 'boar', 'cattle'] as const)('returns housed %s and removes them from their animal zone', animal => {
    const { context, player, target, events } = fixture()
    player.resources[animal] = 4
    player.pastures = [{ id: 'animals', tiles: [{ row: 0, col: 2 }, { row: 1, col: 2 }], animalType: animal, animalCount: 4 }]

    expect(returnToSpaceAction.execute({ ...context, params: { [animal]: 2 } })).toEqual({ type: 'ok' })

    expect(player.resources[animal]).toBe(2)
    expect(player.pastures[0]).toMatchObject({ animalType: animal, animalCount: 2 })
    expect(target.resources).toEqual({ [animal]: 2 })
    expect(events).toEqual([{
      type: 'resource.moved', resources: { [animal]: 2 },
      from: { kind: 'player', playerId: player.id }, to: { kind: 'actionSpace', spaceId: 'forest' }, reason: 'return',
    }])
  })

  it('returns mixed resources without changing their original collection statistics', () => {
    const { context, player, target, events } = fixture()
    player.resources.wood = 6
    player.resources.boar = 4
    player.pastures = [{ id: 'animals', tiles: [{ row: 0, col: 2 }, { row: 1, col: 2 }], animalType: 'boar', animalCount: 4 }]
    player.stats.resourcesFromBoard = { wood: 6, boar: 4 }

    expect(returnToSpaceAction.execute({ ...context, params: { wood: 3, boar: 2 } })).toEqual({ type: 'ok' })

    expect(player.resources).toMatchObject({ wood: 3, boar: 2 })
    expect(player.pastures[0]!.animalCount).toBe(2)
    expect(player.stats.resourcesFromBoard).toEqual({ wood: 6, boar: 4 })
    expect(target.resources).toEqual({ wood: 3, boar: 2 })
    expect(events).toEqual([expect.objectContaining({ resources: { wood: 3, boar: 2 }, reason: 'return' })])
  })

  it('rejects an unaffordable mixed return before moving any resources or animals', () => {
    const { context, player, target, events } = fixture()
    player.resources.wood = 1
    player.resources.boar = 4
    player.pastures = [{ id: 'animals', tiles: [{ row: 0, col: 2 }, { row: 1, col: 2 }], animalType: 'boar', animalCount: 4 }]

    expect(returnToSpaceAction.execute({ ...context, params: { boar: 2, wood: 3 } }))
      .toEqual({ type: 'fail', errorKey: 'log.exchangeFail' })

    expect(player.resources).toMatchObject({ wood: 1, boar: 4 })
    expect(player.pastures[0]!.animalCount).toBe(4)
    expect(target.resources).toEqual({})
    expect(events).toEqual([])
  })
})
