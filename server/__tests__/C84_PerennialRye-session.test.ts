import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'
import '../../shared/cards/C/C84_PerennialRye'

describe('C84_PerennialRye session', () => {
  const setup = (round = 2) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = round
    const player = state.players[0]!
    player.resources.food = 1
    player.resources.grain = 3
    player.resources.sheep = 3
    player.resources.boar = 0
    player.resources.cattle = 0
    // Add a pasture large enough to hold 4 sheep (2 tiles = capacity 4)
    player.pastures = [
      {
        id: 'p1',
        size: 2,
        tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
        stables: 0,
      },
    ]
    player.fenceSegments = [
      { row: 0, col: 0, side: 'top' },
      { row: 0, col: 0, side: 'left' },
      { row: 0, col: 0, side: 'bottom' },
      { row: 0, col: 1, side: 'top' },
      { row: 0, col: 1, side: 'right' },
      { row: 0, col: 1, side: 'bottom' },
    ]
    // Directly place card
    player.minorPlayed.push('C84_PerennialRye')
    session.loadState(state)
    return session
  }

  it('available in non-harvest round with grain and breedable animals', () => {
    const session = setup(2)
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    const ids = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(ids).toContain('C84-perennial-rye-anytime')
  })

  it('NOT available in harvest round (round 4)', () => {
    const session = setup(4)
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    const ids = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(ids).not.toContain('C84-perennial-rye-anytime')
  })

  it('choosing sheep: pay 1 grain, gain 1 sheep, flagged', () => {
    const session = setup(2)
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)

    // With only sheep breedable (count >= 2), XOR auto-resolves to single option (seq)
    let resp2 = session.takeAnytimeAction(0, 'C84-perennial-rye-anytime')
    expect(resp2.ok).toBe(true)

    // Gaining an animal triggers animal reorganization
    if (resp2.pending.type === 'animalReorg') {
      // Place all 4 sheep in the pasture
      resp2 = session.confirmAnimalReorg(0, [
        { id: 'p1', zoneType: 'pasture', animalType: 'sheep', animalCount: 4 },
      ])
      expect(resp2.ok).toBe(true)
    }

    const p = resp2.state.players[0]!
    expect(p.resources.grain).toBe(2)
    expect(p.resources.sheep).toBe(4)
    expect(isCardFlagged(p, 'C84_PerennialRye')).toBe(true)
  })

  it('not available without grain', () => {
    const session = setup(2)
    const state = session.getState().state
    state.players[0]!.resources.grain = 0
    session.loadState(state)
    const resp = session.takeAction(0, 'farmland')
    const ids = resp.interaction.anytimeActions.map((a: any) => a.id)
    expect(ids).not.toContain('C84-perennial-rye-anytime')
  })
})
