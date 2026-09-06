import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { EXTRA_CROP_PLACEMENT_CONTEXT_KEY, isExtraCropPlacementActionContext } from '../../shared/actions/helpers/extra-crop-placement-context'

import '../../shared/cards/C/C069_LandConsolidation'
import '../../shared/cards/B/B115_TinsmithMaster'
import '../../shared/cards/B/B113_PatchCaregiver'
import '../../shared/cards/E/E071_CowPatty'
import '../../shared/cards/C/C057_Crudite'

const CARD_ID = 'C069_LandConsolidation'
const ANYTIME_ID = 'C69-land-consolidation-anytime'

const c69AnytimeVisible = (resp: ReturnType<GameSession['takeAction']>) =>
  resp.interaction.anytimeActions?.some((entry) => entry.id === ANYTIME_ID) ?? false

const pendingActionContext = (session: GameSession) =>
  (session.getEngineStack().peekPendingEnvelope()?.contextSnapshot as
    | { actionContext?: Record<string, unknown> }
    | undefined
  )?.actionContext

const setupC69ExtraCropSession = (sourceCard: 'B115_TinsmithMaster' | 'E071_CowPatty') => {
  const session = new GameSession()
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  state.roundActionOrder = state.roundActionOrder.map(() => null)
  state.roundActionOrder[0] = 'grain-utilization'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorPlayed.push('C069_LandConsolidation')
  if (sourceCard === 'B115_TinsmithMaster') player.occupationPlayed.push(sourceCard)
  if (sourceCard === 'E071_CowPatty') {
    player.minorPlayed.push(sourceCard)
    player.resources.cattle = 1
    player.pastures = [{ id: 'p1', size: 1, tiles: [{ row: 0, col: 1 }], stables: 0, animalType: 'cattle', animalCount: 1 }]
  }
  player.resources.grain = 1
  player.fields = [{ row: 0, col: 0, stacks: [] }]
  session.loadState(state)
  return session
}

const driveSowUntilExtraCropPrompt = (session: GameSession) => {
  let resp = session.takeAction(0, 'grain-utilization')
  expect(resp.ok).toBe(true)
  resp = session.commitSelectionChoice(0, {
    crops: [{ row: 0, col: 0, crop: 'grain' }],
  })
  expect(resp.interaction.stateId).toBe('wait')
  return resp
}

const setupParity = (grainCounts: number[] = []) => {
  const session = new GameSession(5069, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.resources.food = 20
  })
  const player = state.players[0]!
  player.minorPlayed = [CARD_ID]
  player.fields = grainCounts.map((remaining, index) => ({
    row: 0, col: index, stacks: [{ kind: 'grain' as const, remaining }],
  }))
  session.loadState(state)
  return session
}

const playC69 = () => {
  const session = new GameSession(50690, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = ['C057_Crudite']
    player.occupationHand = ['__test_placeholder__']
    player.resources.food = 20
  })
  state.players[0]!.minorHand = [CARD_ID, 'C057_Crudite']
  session.loadState(state)

  let response = session.takeAction(0, 'meeting-place')
  for (let depth = 0; depth < 4 && response.state.players[0]!.minorHand.includes(CARD_ID); depth++) {
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') break
    const options = response.interaction.request.options ?? []
    const option = options.find((candidate) => candidate.value === CARD_ID)
      ?? options.find((candidate) => candidate.value.startsWith('action-improvement-'))
    expect(option).toBeDefined()
    if (!option) break
    response = session.resolveChoice(response.interaction.playerIndex, option.value)
  }
  return response
}

const useC69 = (session: GameSession, position: { row: number; col: number }) => {
  let response = session.takeAction(0, 'farmland')
  expect(c69AnytimeVisible(response)).toBe(true)
  response = session.takeAnytimeAction(0, ANYTIME_ID)
  expect(response.interaction).toMatchObject({
    stateId: 'wait', request: { kind: 'selection' },
  })
  return session.commitSelectionChoice(0, { positions: [position] })
}

describe('C069_LandConsolidation session', () => {
  it('C069 S1: Land Consolidation can be played for free', () => {
    const response = playC69()

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('C069 S2: exactly three grain in a farmyard field exchange for one vegetable in that field', () => {
    const response = useC69(setupParity([3]), { row: 0, col: 0 })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([
      { kind: 'vegetable', remaining: 1 },
    ])
    expect(c69AnytimeVisible(response)).toBe(false)
  })

  for (const [scenario, grain] of [['S3', 2], ['S4', 4]] as const) {
    it(`C069 ${scenario}: a field with ${grain} grain is not eligible`, () => {
      const response = setupParity([grain]).getState()

      expect(c69AnytimeVisible(response)).toBe(false)
      expect(response.state.players[0]!.fields[0]!.stacks).toEqual([
        { kind: 'grain', remaining: grain },
      ])
    })
  }

  it('C069 S5: with two eligible fields only the selected field is exchanged', () => {
    const response = useC69(setupParity([3, 3]), { row: 0, col: 1 })

    expect(response.state.players[0]!.fields.map((field) => field.stacks)).toEqual([
      [{ kind: 'grain', remaining: 3 }],
      [{ kind: 'vegetable', remaining: 1 }],
    ])
  })

  it('C069 S6: exactly three grain on a compatible Card Field exchange for one vegetable there', () => {
    const session = new GameSession(803, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']
    player.minorPlayed.push(CARD_ID)
    player.occupationPlayed.push('B113_PatchCaregiver')
    player.cardStates.B113_PatchCaregiver = {
      extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 3 }] },
    }
    session.loadState(state)

    const response = useC69(session, { row: -1, col: 2113 })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates.B113_PatchCaregiver?.extraData?.cardFieldStacks).toEqual([
      { crop: 'vegetable', remaining: 1 },
    ])
  })

  it('C069 S7: Land Consolidation is hidden while a Tinsmith Master extra crop is pending', () => {
    const session = setupC69ExtraCropSession('B115_TinsmithMaster')

    const resp = driveSowUntilExtraCropPrompt(session)

    expect(c69AnytimeVisible(resp)).toBe(false)
    expect(isExtraCropPlacementActionContext(pendingActionContext(session))).toBe(true)
  })

  it('hides C69 anytime while E71 extra crop is pending', () => {
    const session = setupC69ExtraCropSession('E071_CowPatty')

    const resp = driveSowUntilExtraCropPrompt(session)

    expect(c69AnytimeVisible(resp)).toBe(false)
    expect(isExtraCropPlacementActionContext(pendingActionContext(session))).toBe(true)
  })

  it('shows C69 anytime during normal sow crop placement', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    state.roundPhase = 'work'
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[0] = 'grain-utilization'
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorPlayed.push('C069_LandConsolidation')
    player.resources.grain = 1
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] },
      { row: 0, col: 1, stacks: [] },
    ]
    session.loadState(state)

    const resp = session.takeAction(0, 'grain-utilization')

    expect(resp.ok).toBe(true)
    expect(c69AnytimeVisible(resp)).toBe(true)
    expect(isExtraCropPlacementActionContext(pendingActionContext(session))).toBe(false)
  })

  it('keeps extra crop marker through pending roundtrip without top-level field', () => {
    const session = setupC69ExtraCropSession('B115_TinsmithMaster')
    driveSowUntilExtraCropPrompt(session)

    const serialized = serializeSessionSnapshot(session.getState().state, session)
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serialized))))
    const envelope = restored.getEngineStack().peekPendingEnvelope() as
      | ({ contextSnapshot?: { actionContext?: Record<string, unknown> } } & Record<string, unknown>)
      | null

    expect(envelope?.[EXTRA_CROP_PLACEMENT_CONTEXT_KEY]).toBeUndefined()
    expect(isExtraCropPlacementActionContext(envelope?.contextSnapshot?.actionContext)).toBe(true)
    expect(c69AnytimeVisible(restored.getState())).toBe(false)
  })

  it('shows C69 anytime outside extra crop pending prompts', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorPlayed.push('C069_LandConsolidation')
    player.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] }]
    session.loadState(state)

    expect(c69AnytimeVisible(session.getState())).toBe(true)
  })

  it('replaces grain with vegetable on a compatible Card Field (regression)', () => {
    const session = new GameSession(803, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorPlayed.push('C069_LandConsolidation')
    player.occupationPlayed.push('B113_PatchCaregiver')
    player.cardStates.B113_PatchCaregiver = {
      extraData: { cardFieldStacks: [{ crop: 'grain', remaining: 3 }] },
    }
    session.loadState(state)

    const started = session.takeAction(0, 'farmland')
    expect(c69AnytimeVisible(started)).toBe(true)
    let resp = session.takeAnytimeAction(0, 'C69-land-consolidation-anytime')
    expect(resp.interaction.stateId).toBe('wait')
    resp = session.commitSelectionChoice(0, { positions: [{ row: -1, col: 2113 }] })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.cardStates.B113_PatchCaregiver?.extraData?.cardFieldStacks).toEqual([
      { crop: 'vegetable', remaining: 1 },
    ])
  })
})
