import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { recordRoundPlacement } from '../../shared/cards/helpers/round-placement'

import { workersAvailable, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/D/D024_BrotherlyLove'

const playedKey = (cardId: string, type: 'minor' | 'occupation') => `${type}:${cardId}`

const setup = (options?: {
  withCard?: boolean
  familySize?: number
  workersAvailable?: number
}) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 3

  const player = state.players[0]!
  const familySize = options?.familySize ?? 4
  const workersAvailable = options?.workersAvailable ?? 1
  setActiveWorkerCount(player, familySize)
  player.rooms = 5

  if (options?.withCard ?? true) {
    player.minorPlayed.push('D024_BrotherlyLove')
  }

  // Simulate 3 farmers already placed by marking spaces as taken by the player
  const forest = state.actionSpaces.find((space) => space.id === 'forest')
  const clayPit = state.actionSpaces.find((space) => space.id === 'clay-pit')
  const farmland = state.actionSpaces.find((space) => space.id === 'farmland')
  if (forest) forest.takenBy = [{ playerId: player.id, workerId: '1' }]
  if (clayPit) clayPit.takenBy = [{ playerId: player.id, workerId: '2' }]
  if (farmland) farmland.takenBy = [{ playerId: player.id, workerId: '3' }]

  // If we still need to reach `workersAvailable === N` place remaining surplus on sink
  const activeCount = player.workers.filter((w) => w.isActive).length
  const placedCount = 3
  const expectedAtHome = Math.max(0, activeCount - placedCount)
  if (expectedAtHome > workersAvailable) {
    setWorkersAtHome(state, player, workersAvailable)
  }

  // Record round placements so the card can find where own farmers are
  recordRoundPlacement(player, 'forest', '1')
  recordRoundPlacement(player, 'clay-pit', '2')
  recordRoundPlacement(player, 'farmland', '3')

  session.loadState(state)
  return session
}

describe('D024_BrotherlyLove session', () => {
  it('with card and 4 family, 1 worker left: own-farmer spaces are available', () => {
    const state = setup({ withCard: true, workersAvailable: 1 }).getState()
    expect(state.ok).toBe(true)
    // Forest is occupied by own farmer — should be available via Brotherly Love
    expect(state.actionAvailability?.forest).toBe(true)
    expect(state.actionAvailability?.['clay-pit']).toBe(true)
    expect(state.actionAvailability?.farmland).toBe(true)
  })

  it('without card: own-farmer spaces are not available', () => {
    const state = setup({ withCard: false, workersAvailable: 1 }).getState()
    expect(state.ok).toBe(true)
    // Without the card, spaces occupied by own farmers should not be available
    expect(state.actionAvailability?.forest).toBe(false)
    expect(state.actionAvailability?.['clay-pit']).toBe(false)
    expect(state.actionAvailability?.farmland).toBe(false)
  })

  it('does not activate when familySize != 4', () => {
    const state = setup({ withCard: true, familySize: 3, workersAvailable: 1 }).getState()
    expect(state.ok).toBe(true)
    // With familySize 3, the card should not activate
    expect(state.actionAvailability?.forest).toBe(false)
  })

  it('does not activate when workersAvailable != 1', () => {
    const state = setup({ withCard: true, familySize: 5, workersAvailable: 2 }).getState()
    expect(state.ok).toBe(true)
    // With 2 workers, not all 3 others are placed yet, so card doesn't activate
    expect(state.actionAvailability?.forest).toBe(false)
  })

  it('lets the player reuse own-farmer space and execute the action', () => {
    const session = setup({ withCard: true, workersAvailable: 1 })

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    // Player should have received wood from forest
    expect(resp.state.players[0]!.resources.wood).toBeGreaterThan(0)
    expect(workersAvailable(resp.state, resp.state.players[0]!)).toBe(0)
    // The space should still be occupied by the player
    const forest = resp.state.actionSpaces.find((space) => space.id === 'forest')
    expect(forest?.takenBy.some((t) => t.playerId === resp.state.players[0]!.id)).toBe(true)
  })

  it('does not allow using spaces occupied by other players', () => {
    const session = setup({ withCard: true, workersAvailable: 1 })
    const state = session.getState().state
    // Mark a space as occupied by opponent
    const reedBank = state.actionSpaces.find((space) => space.id === 'reed-bank')
    if (reedBank) {
      reedBank.takenBy = state.players[1]!.id
    }
    session.loadState(state)

    const result = session.getState()
    // Opponent's space should NOT be available via Brotherly Love
    expect(result.actionAvailability?.['reed-bank']).toBe(false)
  })
})
