import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A143_Stonecutter } from '../../shared/cards/A/A143_Stonecutter'
import { B95_MasterBricklayer } from '../../shared/cards/B/B95_MasterBricklayer'
import { setWorkersAtHome } from '../../shared/game/player'

// Keep side-effect imports referenced.
void A143_Stonecutter
void B95_MasterBricklayer

describe('A143 + B95 stacking', () => {
  const setup = (rooms: number) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationPlayed = ['A143_Stonecutter', 'B95_MasterBricklayer']
    player.rooms = rooms
    player.resources = {
      ...player.resources,
      wood: 0,
      clay: 0,
      reed: 2,
      stone: 5,
      food: 0,
    }
    if (!state.availableMajorImprovements.includes('Major_Basket')) {
      state.availableMajorImprovements.push('Major_Basket')
    }
    session.loadState(state)
    return session
  }

  it('combines Stonecutter (-1) and MasterBricklayer (-N rooms) on Major stone cost', () => {
    // Player has 4 rooms -> B95 nbNewRooms = 2 -> stone -2. Plus A143 -1 -> total -3.
    // Major_Basket base: 2 reed + 2 stone. After discounts: 2 reed + 0 stone (clamped).
    const session = setup(4)
    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    if (resp.pending.type !== 'choice') return
    const basket = resp.pending.options.find((o) => o.value === 'major:Major_Basket')
    expect(basket).toBeDefined()

    resp = session.resolveChoice(0, basket!.value)
    let steps = 0
    while (resp.pending.type === 'choice' && steps < 8) {
      steps++
      const next = resp.pending.options.find((o) => o.value !== 'cancel')
      if (!next) break
      resp = session.resolveChoice(0, next.value)
    }

    const after = resp.state.players[0]!
    expect(after.improvements).toContain('Major_Basket')
    expect(after.resources.reed).toBe(0) // paid 2 reed
    expect(after.resources.stone).toBe(5) // paid 0 stone, started with 5
  })

  it('only Stonecutter applies when rooms=2 (B95 gives 0 discount)', () => {
    const session = setup(2) // no extra rooms, B95 no-op
    let resp = session.takeAction(0, 'major-improvement')
    if (resp.pending.type !== 'choice') return
    const basket = resp.pending.options.find((o) => o.value === 'major:Major_Basket')
    resp = session.resolveChoice(0, basket!.value)
    let steps = 0
    while (resp.pending.type === 'choice' && steps < 8) {
      steps++
      const next = resp.pending.options.find((o) => o.value !== 'cancel')
      if (!next) break
      resp = session.resolveChoice(0, next.value)
    }
    const after = resp.state.players[0]!
    // A143 only: 2 reed + 1 stone paid
    expect(after.resources.stone).toBe(4) // 5 - 1
  })
})
