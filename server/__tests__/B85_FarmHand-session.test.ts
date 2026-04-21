import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'

import { setActiveWorkerCount, familySize } from '../../shared/game/player'
import '../../shared/cards/B/B85_FarmHand'
import type { AnytimeAction } from '../../shared/game/types';

describe('B85_FarmHand session', () => {
  const make2x2Fields = () => [
    { row: 0, col: 2, crop: null as null, remaining: 0 },
    { row: 0, col: 3, crop: null as null, remaining: 0 },
    { row: 1, col: 2, crop: null as null, remaining: 0 },
    { row: 1, col: 3, crop: null as null, remaining: 0 },
  ]

  const setup = (options?: { wood?: number; fields?: typeof make2x2Fields extends () => infer R ? R : never }) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('B85_FarmHand')
    player.resources.wood = options?.wood ?? 5
    player.resources.food = 10
    player.fields = options?.fields ?? make2x2Fields()
    session.loadState(state)
    session.devPlayCard(0, 'B85_FarmHand')
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  it('anytime available with 2x2 fields and 2+ wood', () => {
    const session = setup()
    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).toContain('B85-farm-hand-anytime')
  })

  it('anytime not available without 2x2 fields', () => {
    const session = setup({
      fields: [
        { row: 0, col: 2, crop: null, remaining: 0 },
        { row: 0, col: 3, crop: null, remaining: 0 },
        { row: 1, col: 2, crop: null, remaining: 0 },
        // missing fourth field in 2x2 block
      ],
    })
    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('B85-farm-hand-anytime')
  })

  it('anytime not available without enough wood', () => {
    const session = setup({ wood: 1 })
    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('B85-farm-hand-anytime')
  })

  it('build Farm Hand: pay 2 wood, gain +1 room capacity', () => {
    const session = setup({ wood: 5 })
    const state = session.getState().state
    const initialRooms = state.players[0]!.rooms

    enterActiveInteraction(session)

    const resp = session.takeAnytimeAction(0, 'B85-farm-hand-anytime')
    expect(resp.ok).toBe(true)

    const updatedPlayer = resp.state.players[0]!
    expect(updatedPlayer.resources.wood).toBe(3) // 5 - 2
    expect(updatedPlayer.rooms).toBe(initialRooms + 1)
    expect(isCardFlagged(updatedPlayer, 'B85_FarmHand')).toBe(true)
  })

  it('once per game: not available after first use', () => {
    const session = setup({ wood: 10 })

    enterActiveInteraction(session)

    const resp1 = session.takeAnytimeAction(0, 'B85-farm-hand-anytime')
    expect(resp1.ok).toBe(true)

    // Should no longer be available
    const anytimeIds = resp1.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('B85-farm-hand-anytime')
  })

  it('Farm Hand room enables family growth', () => {
    const session = setup({ wood: 5 })
    const state = session.getState().state
    const player = state.players[0]!
    // Set family size equal to rooms so growth is blocked
    player.rooms = 2
    setActiveWorkerCount(player, 2)
    session.loadState(state)

    enterActiveInteraction(session)

    // Use anytime action to gain +1 room
    const resp = session.takeAnytimeAction(0, 'B85-farm-hand-anytime')
    expect(resp.ok).toBe(true)

    const updatedPlayer = resp.state.players[0]!
    expect(updatedPlayer.rooms).toBe(3)
    expect(familySize(updatedPlayer)).toBe(2)
    // Now rooms (3) > familySize (2), so family growth should be possible
    expect(updatedPlayer.rooms > familySize(updatedPlayer)).toBe(true)
  })

  it('2x2 detection works with non-adjacent fields', () => {
    // Has 4 fields but NOT in a 2x2 block
    const session = setup({
      fields: [
        { row: 0, col: 0, crop: null, remaining: 0 },
        { row: 0, col: 2, crop: null, remaining: 0 },
        { row: 2, col: 0, crop: null, remaining: 0 },
        { row: 2, col: 2, crop: null, remaining: 0 },
      ],
    })
    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('B85-farm-hand-anytime')
  })
})
