import { afterEach, describe, expect, it } from 'vitest'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { createWorkSession } from './_helpers/session-fixtures'
import '../../shared/cards/D/D106_WhiskyDistiller'
import '../../shared/cards/D/D114_SeedTrader'
import '../../shared/cards/D/D053_TeaHouse'

const sessions: ReturnType<typeof createWorkSession>[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))
const setup = (cardId: string) => {
  const session = createWorkSession({ seed: 6069, configure: (state) => {
    state.round = 5
    const player = state.players[0]!
    player.occupationPlayed = [cardId]
    player.resources.grain = 2
    player.resources.food = 3
    player.resources.vegetable = 0
  } })
  sessions.push(session)
  return session
}

describe('anytime descriptions come from the executable flow', () => {
  it('Whisky Distiller describes its real payment and target round without executing anything', () => {
    const session = setup('D106_WhiskyDistiller')
    const before = JSON.stringify(session.state)
    for (let read = 0; read < 3; read++) {
      const action = session.getState().interaction.anytimeActions.find((entry) => entry.id === 'D106-whisky-distiller-anytime')
      expect(action?.descriptionPreview).toMatchObject({ kind: 'group', operator: 'sequence', parts: [
        { kind: 'action', effectPreview: { kind: 'payment', resourcesPaid: { grain: 1 } } },
        { kind: 'action', effectPreview: { kind: 'futureSchedule', entries: [{ round: 7, resources: { food: 4 } }] } },
      ] })
    }
    expect(JSON.stringify(session.state)).toBe(before)
    const response = session.takeAnytimeAction(0, 'D106-whisky-distiller-anytime')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 3 })
    expect(response.state.futureMeeples).toEqual([expect.objectContaining({ round: 7, resources: { food: 4 } })])
  })

  it('two Whisky Distiller effects keep two executions, display eight food, and receive eight at round seven', () => {
    const session = setup('D106_WhiskyDistiller')
    for (let index = 0; index < 2; index++) expect(session.takeAnytimeAction(0, 'D106-whisky-distiller-anytime').ok).toBe(true)
    const response = session.getState()
    expect(response.state.futureMeeples).toHaveLength(2)
    expect(new Set(response.state.futureMeeples.map(entry => entry.id)).size).toBe(2)
    expect(session.buildSyncPayload(response, response.state.players[0]!.id).state.players[0]!.scheduledEffects).toEqual([expect.objectContaining({ round: 7, sourceCard: 'D106_WhiskyDistiller', count: 2,
      description: expect.objectContaining({ effectPreview: { kind: 'futureSchedule', entries: [{ round: 7, resources: { food: 4 } }] } }),
    })])
    const before = JSON.stringify(session.state)
    for (let read = 0; read < 3; read++) session.getState()
    expect(JSON.stringify(session.state)).toBe(before)
    for (const round of [5, 6]) {
      const state = session.getState().state
      state.round = round
      state.players.forEach(player => { player.resources.food = 20; markAllWorkersUsed(state, player) })
      session.loadState(state)
      expect(session.performRoundEnd().ok).toBe(true)
    }
    expect(session.getState().state.players[0]!.resources.food).toBe(28)
    expect(session.buildSyncPayload(session.getState(), null).state.players[0]!.scheduledEffects).toEqual([])
    expect(session.getState().state.futureMeeples).toEqual([])
  })

  it('Seed Trader preserves the two complete alternative flows and executes the chosen one', () => {
    const session = setup('D114_SeedTrader')
    const state = session.getState().state
    state.players[0]!.cardStates.D114_SeedTrader = { counters: { grain: 2, vegetable: 2 } }
    session.loadState(state)
    const action = session.getState().interaction.anytimeActions.find((entry) => entry.id === 'D114-seed-trader-anytime')
    expect(action?.descriptionPreview).toMatchObject({ kind: 'group', operator: 'xor', parts: [
      { kind: 'group', operator: 'sequence', parts: [
        { effectPreview: { kind: 'payment', resourcesPaid: { food: 2 } } },
        { effectPreview: { kind: 'resourceMovement', resources: { grain: 1 } } },
      ] },
      { kind: 'group', operator: 'sequence', parts: [
        { effectPreview: { kind: 'payment', resourcesPaid: { food: 3 } } },
        { effectPreview: { kind: 'resourceMovement', resources: { vegetable: 1 } } },
      ] },
    ] })
    let response = session.takeAnytimeAction(0, 'D114-seed-trader-anytime')
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId !== 'wait') throw new Error('Missing Seed Trader choice')
    const choice = response.interaction.request.options?.[1]
    if (!choice) throw new Error('Missing vegetable branch')
    response = session.resolveChoice(0, choice.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, vegetable: 1 })
    expect(response.state.players[0]!.cardStates.D114_SeedTrader?.counters).toMatchObject({ grain: 2, vegetable: 1 })
  })
})
