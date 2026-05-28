import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/C/C69_LandConsolidation'
import '../../shared/cards/B/B115_TinsmithMaster'
import '../../shared/cards/E/E71_CowPatty'

const c69AnytimeVisible = (resp: ReturnType<GameSession['takeAction']>) =>
  resp.interaction.anytimeActions?.some((entry) => entry.id === 'C69-land-consolidation-anytime') ?? false

const setupC69ExtraCropSession = (sourceCard: 'B115_TinsmithMaster' | 'E71_CowPatty') => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  state.roundActionOrder = state.roundActionOrder.map(() => null)
  state.roundActionOrder[0] = 'grain-utilization'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorPlayed.push('C69_LandConsolidation')
  if (sourceCard === 'B115_TinsmithMaster') player.occupationPlayed.push(sourceCard)
  if (sourceCard === 'E71_CowPatty') {
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

describe('C69_LandConsolidation session', () => {
  it('hides C69 anytime while B115 extra crop is pending', () => {
    const session = setupC69ExtraCropSession('B115_TinsmithMaster')

    const resp = driveSowUntilExtraCropPrompt(session)

    expect(c69AnytimeVisible(resp)).toBe(false)
  })

  it('hides C69 anytime while E71 extra crop is pending', () => {
    const session = setupC69ExtraCropSession('E71_CowPatty')

    const resp = driveSowUntilExtraCropPrompt(session)

    expect(c69AnytimeVisible(resp)).toBe(false)
  })

  it('shows C69 anytime outside extra crop pending prompts', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorPlayed.push('C69_LandConsolidation')
    player.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] }]
    session.loadState(state)

    expect(c69AnytimeVisible(session.getState())).toBe(true)
  })
})
