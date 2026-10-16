import { describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/session-assertions'
import type { GameState } from '../../shared/contract/types'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'

const CARD_ID = 'B026_AgrarianFences'
const FENCE_EDGES = ['H-2-4', 'H-3-4', 'V-2-4', 'V-2-5']
const evidence = createScenarioEvidence(import.meta.url)

// Confirmed Session seam: replacement chooses a whole two-action plan before
// any subaction. The plan itself owns the one-fence/two-action limits (#1124).
const waiting = (response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('Expected pending interaction')
  return response.interaction
}

const choiceOptions = (response: SessionResponse) => {
  const request = waiting(response).request
  if (request.kind !== 'choice') throw new Error('Expected choice interaction')
  return request.options
}

const farmSelection = (response: SessionResponse) => {
  const request = waiting(response).request
  return request.kind === 'farm-select' ? request.farm : undefined
}

const setup = (configure?: (state: GameState) => void) => {
  const session = evidence.track(createWorkSession({ configure: (state) => {
    state.round = 5
    const player = state.players[0]!
    player.minorPlayed = [CARD_ID]
    player.improvements = ['Major_Fireplace1']
    Object.assign(player.resources, { wood: 8, grain: 2, food: 20 })
    player.fields = [{ row: 0, col: 2, stacks: [] }]
    configure?.(state)
  } }))
  return session
}

const selectPlan = (session: GameSession, response: SessionResponse, plan: 'original' | 'sow' | 'bake') => {
  expect(response.ok, response.error).toBe(true)
  expect(waiting(response).promptKey).toBe('ui.interactionSelectReplacement')
  if (plan === 'original') return choose(session, response, 'ui.interactionDoNotReplace')
  const replacement = choiceOptions(response).find((option) => option.sourceCard === CARD_ID)
  expect(replacement).toBeDefined()
  response = session.resolveChoice(0, replacement!.value)
  return choose(session, response, plan === 'sow'
    ? 'ui.interactionAgrarianFencesSowAndFence' : 'ui.interactionAgrarianFencesBakeAndFence')
}

const perform = (session: GameSession, response: SessionResponse, action: 'sow' | 'bake' | 'fence') => {
  response = choose(session, response, action === 'fence' ? 'actions.fencing.name'
    : action === 'sow' ? 'actions.sow.name' : 'actions.bake-bread.name')
  if (action === 'fence') {
    expect(farmSelection(response)?.farmType).toBe('fence')
    response = session.commitSelectionChoice(0, { edges: FENCE_EDGES, palisadeEdges: [], extraWood: 0 })
  } else if (action === 'sow') {
    expect(farmSelection(response)?.farmType).toBe('sow')
    response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] })
  } else {
    expect(waiting(response).promptKey).toBe('ui.interactionBakeBreadChoice')
    response = session.resolveChoice(0, 'Major_Fireplace1')
    if (waiting(response).promptKey === 'ui.interactionBakeBreadCount') {
      response = session.resolveChoice(0, 'count-Major_Fireplace1-1')
    }
  }
  expect(response.ok, response.error).toBe(true)
  return response
}

const choose = (session: GameSession, response: SessionResponse, labelKey: string) => {
  expect(response.ok, response.error).toBe(true)
  const option = choiceOptions(response).find((candidate) => candidate.labelKey === labelKey
    || candidate.labelParams?.actionNameKey === labelKey)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

describe('B026 Agrarian Fences whole-action replacement', () => {
  it('selects a fence-and-sow plan and cannot add baking or a second fence', () => {
    const session = setup()
    let response = session.takeAction(0, 'grain-utilization')
    expect(response.ok, response.error).toBe(true)
    expect(waiting(response).promptKey).toBe('ui.interactionSelectReplacement')
    expect(response.state.actionSpaces.find((space) => space.id === 'grain-utilization')!.takenBy).toHaveLength(1)
    const replacement = choiceOptions(response).find((option) => option.sourceCard === CARD_ID)
    expect(replacement).toBeDefined()
    response = session.resolveChoice(0, replacement!.value)
    response = choose(session, response, 'ui.interactionAgrarianFencesSowAndFence')
    const fenceChoice = choiceOptions(response).find(option => option.labelKey === 'actions.fencing.name')
    if (!fenceChoice) throw new Error('Expected the issued fencing choice')
    expect(choiceOptions(response).map(option => option.labelKey)).toEqual(['actions.fencing.name', 'actions.sow.name'])
    response = session.resolveChoice(0, fenceChoice.value)
    expect(farmSelection(response)?.farmType).toBe('fence')
    response = session.commitSelectionChoice(0, { edges: FENCE_EDGES, palisadeEdges: [], extraWood: 0 })
    expect(response.ok, response.error).toBe(true)
    expect(choiceOptions(response).map(option => option.labelKey)).toEqual(['actions.sow.name', 'ui.interactionFlowDone'])
    assertRejectedUnchanged(session, () => session.resolveChoice(0, fenceChoice.value))
    response = choose(session, response, 'actions.sow.name')
    expect(farmSelection(response)?.farmType).toBe('sow')
    response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 4, grain: 1, food: 20 })
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(waiting(response).request.kind).toBe('confirm-next-player')
    assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, { edges: ['H-2-3', 'H-3-3', 'V-2-3'] }))
    expect(response.scores).toHaveLength(2)
    expect(response.state.log.length).toBeGreaterThan(0)
  })

  it.each([
    ['original', ['sow', 'bake'], { wood: 8, grain: 0, food: 22 }],
    ['original', ['bake', 'sow'], { wood: 8, grain: 0, food: 22 }],
    ['sow', ['sow', 'fence'], { wood: 4, grain: 1, food: 20 }],
    ['bake', ['fence', 'bake'], { wood: 4, grain: 1, food: 22 }],
    ['bake', ['bake', 'fence'], { wood: 4, grain: 1, food: 22 }],
  ] as const)('completes the %s plan in order %j', (plan, actions, expected) => {
    const session = setup()
    let response = selectPlan(session, session.takeAction(0, 'grain-utilization'), plan)
    for (const action of actions) response = perform(session, response, action)
    expect(waiting(response).request.kind).toBe('confirm-next-player')
    expect(response.state.players[0]!.resources).toMatchObject(expected)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(plan === 'original' ? 0 : 4)
    expect(response.state.events.filter((event) => event.type === 'resource.exchanged'
      && event.exchangeSource === 'Major_Fireplace1' && event.paid.grain === 1
      && event.gained.food === 2)).toHaveLength(actions.some((action) => action === 'bake') ? 1 : 0)
  })

  it.each([['original', 'sow'], ['original', 'bake'], ['sow', 'fence']] as const)(
    'can stop the %s plan after only %s', (plan, action) => {
      const session = setup()
      let response = selectPlan(session, session.takeAction(0, 'grain-utilization'), plan)
      response = perform(session, response, action)
      const done = choiceOptions(response).find((option) => option.value === '__done__')
      expect(done).toBeDefined()
      response = session.resolveChoice(0, done!.value)
      expect(response.ok, response.error).toBe(true)
      expect(waiting(response).request.kind).toBe('confirm-next-player')
      expect(response.state.players[0]!.resources).toMatchObject(action === 'fence'
        ? { wood: 4, grain: 2, food: 20 } : action === 'sow'
          ? { wood: 8, grain: 1, food: 20 } : { wood: 8, grain: 1, food: 22 })
    },
  )

  it('can fence when neither original action is possible, and rejects unaffordable edges atomically', () => {
    const session = setup((state) => {
      const player = state.players[0]!
      player.fields = []
      player.improvements = []
      Object.assign(player.resources, { grain: 0, wood: 4 })
    })
    let response = session.takeAction(0, 'grain-utilization')
    expect(choiceOptions(response).some((option) => option.labelKey === 'ui.interactionDoNotReplace')).toBe(false)
    response = selectPlan(session, response, 'sow')
    if (farmSelection(response)?.farmType !== 'fence') response = choose(session, response, 'actions.fencing.name')
    expect(farmSelection(response)?.farmType).toBe('fence')
    const rejected = session.commitSelectionChoice(0, { edges: [...FENCE_EDGES, 'H-2-3', 'H-3-3', 'V-2-3'], palisadeEdges: [], extraWood: 0 })
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players[0]!.resources.wood).toBe(4)
    expect(rejected.state.players[0]!.fenceSegments).toHaveLength(0)
    response = session.commitSelectionChoice(0, { edges: FENCE_EDGES, palisadeEdges: [], extraWood: 0 })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(waiting(response).request.kind).toBe('confirm-next-player')
  })

  it('rejects an unaffordable seven-edge fence, undoes the placement, and retries with sowing', () => {
    const session = setup(state => {
      state.round = 14
      Object.assign(state.players[0]!.resources, { wood: 4, food: 0 })
    })
    const before = undoRuleSnapshot(session.getState())
    let response = selectPlan(session, session.takeAction(0, 'grain-utilization'), 'sow')
    response = choose(session, response, 'actions.fencing.name')
    expect(farmSelection(response)?.farmType).toBe('fence')
    evidence.record('before rejected seven-edge fence', response)
    const rejected = assertRejectedUnchanged(session, () => session.commitSelectionChoice(0, {
      edges: [...FENCE_EDGES, 'H-2-3', 'H-3-3', 'V-2-3'], palisadeEdges: [], extraWood: 0,
    }))
    expect(farmSelection(rejected)?.farmType).toBe('fence')
    response = session.undoAction()
    assertUndoRestored(before, response)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 4, grain: 2, food: 0 })
    expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
    expect(response.state.actionSpaces.find(space => space.id === 'grain-utilization')!.takenBy).toHaveLength(0)
    response = selectPlan(session, session.takeAction(0, 'grain-utilization'), 'original')
    response = perform(session, response, 'sow')
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 4, grain: 1, food: 0 })
    expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
    const done = choiceOptions(response).find(option => option.value === '__done__')
    if (!done) throw new Error('Expected the original plan to allow finishing after sowing')
    response = session.resolveChoice(0, done.value)
    expect(response.ok, response.error).toBe(true)
    expect(waiting(response).request.kind).toBe('confirm-next-player')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 4, grain: 1, food: 0 })
    expect(response.scores).toHaveLength(2)
    expect(response.state.log.length).toBeGreaterThan(0)
  })

  it('restores the plan choice on Undo Step and the whole placement on Undo Action', () => {
    const session = setup()
    let response = selectPlan(session, session.takeAction(0, 'grain-utilization'), 'sow')
    response = perform(session, response, 'fence')
    expect(response.state.players[0]!.resources.wood).toBe(4)
    response = session.undoStep()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(8)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(0)
    expect(farmSelection(response)?.farmType).toBe('fence')
    response = session.commitSelectionChoice(0, { edges: FENCE_EDGES, palisadeEdges: [], extraWood: 0 })
    expect(response.ok, response.error).toBe(true)
    response = session.undoAction()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.actionSpaces.find((space) => space.id === 'grain-utilization')!.takenBy).toHaveLength(0)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 8, grain: 2, food: 20 })
    response = selectPlan(session, session.takeAction(0, 'grain-utilization'), 'original')
    response = perform(session, response, 'sow')
    response = perform(session, response, 'bake')
    expect(waiting(response).request.kind).toBe('confirm-next-player')
  })

  it('also replaces the composite when Archway grants use of Grain Utilization', () => {
    const session = setup((state) => {
      const player = state.players[0]!
      player.minorPlayed.push('D051_Archway')
      state.actionSpaces.push(...createPlayerActionSpaces(state))
      state.actionSpaces.find((space) => space.id === 'D051_Archway')!.takenBy = [{ playerId: player.id, workerId: player.workers.find((worker) => worker.isActive)!.id }]
      state.players.forEach((owner) => markAllWorkersUsed(state, owner))
    })
    let response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    const accept = choiceOptions(response).find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    response = session.resolveChoice(0, accept!.value)
    expect(waiting(response).promptKey).toBe('ui.interactionMoveFarmerToSpace')
    response = session.resolveChoice(0, 'grain-utilization')
    response = selectPlan(session, response, 'sow')
    response = perform(session, response, 'fence')
    expect(response.state.players[0]!.resources.wood).toBe(4)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
  })

  it('keeps subaction replacements available after declining the whole-action replacement', () => {
    const session = setup((state) => {
      const player = state.players[0]!
      player.occupationPlayed = ['A097_Freshman']
      player.occupationHand = ['A116_WoodCutter']
    })
    let response = selectPlan(session, session.takeAction(0, 'grain-utilization'), 'original')
    response = choose(session, response, 'actions.bake-bread.name')
    expect(waiting(response).promptKey).toBe('ui.interactionSelectReplacement')
    expect(choiceOptions(response).some((option) => option.sourceCard === 'A097_Freshman')).toBe(true)
    response = choose(session, response, 'ui.interactionDoNotReplace')
    expect(waiting(response).promptKey).toBe('ui.interactionBakeBreadChoice')
    response = session.resolveChoice(0, 'Major_Fireplace1')
    expect(waiting(response).promptKey).toBe('ui.interactionBakeBreadCount')
    response = session.resolveChoice(0, 'count-Major_Fireplace1-1')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 22 })
    expect(response.state.players[0]!.cardStates.A097_Freshman?.flagged).not.toBe(true)
  })

  it.each(['absent', 'opponent'] as const)('offers no fence replacement when the card is %s', (owner) => {
    const session = setup((state) => {
      state.players[0]!.minorPlayed = []
      if (owner === 'opponent') state.players[1]!.minorPlayed = [CARD_ID]
    })
    const response = session.takeAction(0, 'grain-utilization')
    expect(response.ok, response.error).toBe(true)
    expect(waiting(response).promptKey).toBe('ui.interactionGrainUtilizationChoice')
    expect(choiceOptions(response).some((option) => option.sourceCard === CARD_ID)).toBe(false)
  })

  it('restores the pending composite original branch and executes its subactions', () => {
    const session = setup()
    let response = session.takeAction(0, 'grain-utilization')
    const cursor = session.createSessionPrivateCursor()
    session.loadState(JSON.parse(JSON.stringify(response.state)))
    session.restoreSessionPrivateCursor(cursor)
    response = selectPlan(session, session.getState(), 'original')
    response = perform(session, response, 'bake')
    response = perform(session, response, 'sow')
    expect(response.ok, response.error).toBe(true)
    expect(waiting(response).request.kind).toBe('confirm-next-player')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 8, grain: 0, food: 22 })
  })
})
