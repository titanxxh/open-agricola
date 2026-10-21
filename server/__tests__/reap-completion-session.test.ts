import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { setWorkersAtHome } from '../../shared/domain/player'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'

const WOLF = 'E103_Wolf'
const GRANT = 'TEST_ReapCompletionGrant'
const COUNTER = 'TEST_ReapCompletionAfter'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

function setup(phase: 'harvest' | 'private-field-phase', bothCrops: boolean, wolf = true, harvestable = true) {
  const session = createWorkSession({ seed: 13151330, configure: state => {
    state.round = 4
    for (const player of state.players) {
      player.resources.food = 20
      player.resources.grain = 0
      player.resources.vegetable = 0
      player.resources.boar = 0
      if (phase === 'harvest') setWorkersAtHome(state, player, 0)
    }
    const player = state.players[0]!
    player.minorPlayed = [GRANT, ...(wolf ? [] : [COUNTER])]
    player.occupationPlayed = wolf ? [WOLF] : []
    player.cardStates[WOLF] = { stack: ['grain'] }
    player.fields = [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 2 }] }]
    if (bothCrops) player.fields.push({ row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: 2 }] })
    if (!harvestable) player.fields = []
  } })
  sessions.push(session)
  session.withCtx(() => {
    const registry = requireActiveCardRegistry('reap-completion-session')
    registry.registerListener({
      id: GRANT, cardIds: [GRANT], actions: ['anytime'], phases: ['anytime'],
      handler: () => ({ sourceCard: GRANT, flow: {
        type: 'leaf', actionId: 'reap', sourceCard: GRANT,
        actionContext: { trigger: { phase } },
      } }),
    })
    registry.registerListener({
      id: COUNTER, cardIds: [COUNTER], actions: ['reap'], phases: ['after'], mandatory: true,
      handler: () => ({ sourceCard: COUNTER, flow: {
        type: 'leaf', actionId: 'special-effect', sourceCard: COUNTER,
        params: { kind: 'increment-counter', key: 'completions', amount: 1 },
      } }),
    })
  })
  return session
}
function start(session: GameSession, phase: 'harvest' | 'private-field-phase') {
  const response = phase === 'harvest' ? session.performRoundEnd() : session.takeAnytimeAction(0, GRANT)
  expect(response.ok, response.error).toBe(true)
  return response
}
function options(response: SessionResponse) {
  return response.interaction.stateId === 'wait' ? response.interaction.request.options ?? [] : []
}

describe('one completion per Reap batch', () => {
  for (const phase of ['harvest', 'private-field-phase'] as const) {
    it.each([false, true])(`offers Wolf once after ${phase} when skipped, both crops=%s`, bothCrops => {
      const session = setup(phase, bothCrops)
      let response = start(session, phase)
      expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard).toBe(WOLF)
      expect(readCardResourceStats(response.state.players[0]!, WOLF)?.used ?? 0).toBe(phase === 'harvest' ? 0 : 1)
      expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: bothCrops ? 1 : 0, boar: 0 })
      response = session.resolveChoice(0, '__skip__')
      expect(response.ok, response.error).toBe(true)
      expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard === WOLF).toBe(false)
      expect(readCardResourceStats(response.state.players[0]!, WOLF)?.used ?? 0).toBe(phase === 'harvest' ? 0 : 1)
      expect(response.state.players[0]!.cardStates[WOLF]?.stack).toEqual(['grain'])
      expect(response.scores).toHaveLength(2)
    }, 30_000)

    it(`claims Wolf once after ${phase} and keeps the earned boar`, () => {
      const session = setup(phase, true)
      let response = start(session, phase)
      const claim = options(response).find(option => option.value !== '__skip__' && !option.disabled)
      expect(claim).toBeDefined()
      response = session.resolveChoice(0, claim!.value)
      expect(response.ok, response.error).toBe(true)
      expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('animal-reorg')
      response = session.resolveChoice(0, 'confirm', {
        zones: [{ id: 'house:1-0', zoneType: 'house', animalType: 'boar', animalCount: 1 }],
      })
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources.boar).toBe(1)
      expect(response.state.players[0]!.cardStates[WOLF]?.stack).toEqual([])
      expect(readCardResourceStats(response.state.players[0]!, WOLF)?.used ?? 0).toBe(phase === 'harvest' ? 0 : 1)
      expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard === WOLF).toBe(false)
    }, 30_000)

    it(`runs an amount-independent after listener once for a dual-crop ${phase}`, () => {
      const session = setup(phase, true, false)
      const response = start(session, phase)
      expect(response.state.players[0]!.cardStates[COUNTER]?.counters?.completions).toBe(1)
      expect(readCardResourceStats(response.state.players[0]!, COUNTER)?.used).toBe(1)
    }, 30_000)

    it(`adds no completion for an empty ${phase}`, () => {
      const session = setup(phase, false, false, false)
      const response = phase === 'harvest' ? session.performRoundEnd() : session.takeAnytimeAction(0, GRANT)
      expect(response.state.players[0]!.cardStates[COUNTER]?.counters?.completions ?? 0).toBe(0)
      expect(readCardResourceStats(response.state.players[0]!, COUNTER)?.used ?? 0).toBe(0)
    }, 30_000)
  }

  it('restores a pending private Reap without replay and undo restores the original crop and stack', () => {
    const session = setup('private-field-phase', true)
    const originalEvents = JSON.parse(JSON.stringify(session.state.events))
    const originalLog = JSON.parse(JSON.stringify(session.state.log))
    session.withCtx(() => requireActiveCardRegistry('reap-undo').registerListener({
      id: 'TEST_ReapUndo', cardIds: [GRANT], actionSpaces: ['forest'], phases: ['before'], mandatory: true,
      handler: () => ({ sourceCard: GRANT, flow: {
        type: 'leaf', actionId: 'reap', sourceCard: GRANT,
        actionContext: { trigger: { phase: 'private-field-phase' } },
      } }),
    }))
    const pending = session.takeAction(0, 'forest')
    expect(pending.ok, pending.error).toBe(true)
    expect(pending.interaction.stateId === 'wait' && pending.interaction.sourceCard).toBe(WOLF)
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
    sessions.push(restored)
    const restoredPending = restored.getState()
    expect(restoredPending.interaction.stateId === 'wait' && restoredPending.interaction.sourceCard).toBe(WOLF)
    expect(options(restoredPending).map(option => option.value)).toEqual(options(pending).map(option => option.value))
    expect(readCardResourceStats(restoredPending.state.players[0]!, WOLF)?.used).toBe(1)
    const response = restored.resolveChoice(0, '__skip__')
    expect(response.ok, response.error).toBe(true)
    expect(readCardResourceStats(response.state.players[0]!, WOLF)?.used).toBe(1)
    expect(response.state.players[0]!.fields.map(field => field.stacks)).toEqual([
      [{ kind: 'grain', remaining: 1 }], [{ kind: 'vegetable', remaining: 1 }],
    ])
    const originalCompleted = session.resolveChoice(0, '__skip__')
    expect(originalCompleted.ok, originalCompleted.error).toBe(true)
    const undone = session.undoAction(0)
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.fields.map(field => field.stacks)).toEqual([
      [{ kind: 'grain', remaining: 2 }], [{ kind: 'vegetable', remaining: 2 }],
    ])
    expect(undone.state.players[0]!.cardStates[WOLF]?.stack).toEqual(['grain'])
    expect(readCardResourceStats(undone.state.players[0]!, WOLF)?.used ?? 0).toBe(0)
    expect(undone.state.events).toEqual(originalEvents)
    expect(undone.state.log).toEqual(originalLog)
  }, 30_000)
})
