import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { EXTRA_CROP_PLACEMENT_CONTEXT_KEY, isExtraCropPlacementActionContext } from '../../shared/actions/helpers/extra-crop-placement-context'

import '../../shared/cards/C/C069_LandConsolidation'
import '../../shared/cards/B/B115_TinsmithMaster'
import '../../shared/cards/E/E071_CowPatty'

const c69AnytimeVisible = (resp: ReturnType<GameSession['takeAction']>) =>
  resp.interaction.anytimeActions?.some((entry) => entry.id === 'C69-land-consolidation-anytime') ?? false

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

describe('C069_LandConsolidation session', () => {
  it('hides C69 anytime while B115 extra crop is pending', () => {
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
})
