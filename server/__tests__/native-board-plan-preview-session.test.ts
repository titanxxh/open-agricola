import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'

const sessions: ReturnType<typeof createWorkSession>[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const open = (options: Parameters<typeof createWorkSession>[0]) => {
  const session = createWorkSession(options)
  sessions.push(session)
  return session
}
const baseDescription = (session: ReturnType<typeof createWorkSession>, id: string) => {
  const response = session.getState()
  return session.buildSyncPayload(response, response.state.players[0]!.id).state.actionSpaces
    .find(space => space.id === id)?.baseDescriptionPreview
}

describe('native board plans preserve all base cases and real admission', () => {
  it.each([4, 5, 14])('six-player Improvement includes both source-plan periods in round %i', round => {
    // These action spaces only exist on the six-player rail.
    const session = open({ seed: 7317, options: { playerCount: 6 }, configure: state => { state.round = round } })
    const before = JSON.stringify(session.state)
    for (let read = 0; read < 3; read++) expect(baseDescription(session, 'improvement-6')).toMatchObject({
      effectPreview: { kind: 'roundCardSelection', ranges: [
        { from: 1, to: 4, types: ['minor'] }, { from: 5, types: ['major', 'minor'] },
      ] },
    })
    expect(JSON.stringify(session.state)).toBe(before)
  })

  it.each([
    { resources: { sheep: 0, boar: 0, cattle: 0 }, gained: 'sheep' },
    { resources: { sheep: 1, boar: 0, cattle: 0 }, gained: 'boar' },
    { resources: { sheep: 1, boar: 1, cattle: 0 }, gained: 'cattle' },
  ] as const)('Corral describes the complete priority and actually grants $gained', ({ resources, gained }) => {
    const session = open({ seed: 7317, options: { playerCount: 6 }, configure: state => {
      Object.assign(state.players[0]!.resources, resources)
    } })
    expect(baseDescription(session, 'corral-6')).toMatchObject({
      effectPreview: { kind: 'firstMissingResource', resources: ['sheep', 'boar', 'cattle'], amount: 1 },
    })
    const response = session.takeAction(0, 'corral-6')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources[gained]).toBe(1)
    for (const animal of ['sheep', 'boar', 'cattle'] as const) {
      if (animal !== gained) expect(response.state.players[0]!.resources[animal]).toBe(resources[animal])
    }
    expect(response.state.log.find(entry => entry.key === 'log.actionDetail')).toMatchObject({
      playerId: 'p1', params: { action: 'actions.corral-6.name', detailParts: { gains: { [gained]: 1 } } },
    })
    expect(response.interaction.request.kind).toBe('animal-reorg')
  })

  it.each([false, true])('Moor Infirmary admits healthy and sick workers, sick=%s', sick => {
    const session = open({ seed: 7317, options: { enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true }, configure: state => {
      state.players[0]!.resources.food = 0
      state.players[0]!.sickWorkerIds = sick ? ['1', '2'] : []
    } })
    expect(session.state.players).toHaveLength(2)
    expect(baseDescription(session, 'moor-infirmary')).toMatchObject({ workerPlacement: 'sick-preferred', effectPreview: { resourcesGained: { food: 1 } } })
    if (sick) {
      expect(session.takeAction(0, 'forest').ok).toBe(false)
      expect(session.state.players[0]!.resources.food).toBe(0)
    }
    const response = session.takeAction(0, 'moor-infirmary')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(response.state.actionSpaces.find(space => space.id === 'moor-infirmary')!.takenBy)
      .toEqual([{ playerId: 'p1', workerId: sick ? '2' : '1' }])
    expect(response.state.log.find(entry => entry.key === 'log.actionDetail')).toMatchObject({
      playerId: 'p1', params: { action: 'actions.moor-infirmary.name', detailParts: { gains: { food: 1 } } },
    })
    expect(response.interaction.request.kind).toBe('confirm-next-player')
  })
})
