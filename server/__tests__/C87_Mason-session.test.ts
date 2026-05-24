import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/C/C87_Mason'

describe('C87_Mason session', () => {
  const roomTiles = (count: number) =>
    Array.from({ length: count }, (_, col) => ({ row: 0, col }))

  const setup = (options?: { houseType?: 'wood' | 'clay' | 'stone'; rooms?: number }) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('C87_Mason')
    player.resources.food = 10
    player.houseType = options?.houseType ?? 'stone'
    player.rooms = options?.rooms ?? 4
    player.roomTiles = roomTiles(player.rooms)
    session.loadState(state)
    session.devPlayCard(0, 'C87_Mason')
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  it('available when stone house + 4 rooms + hasRoom → builds a real fifth room', () => {
    const session = setup({ houseType: 'stone', rooms: 4 })
    const state = session.getState().state
    const initialRooms = state.players[0]!.rooms

    enterActiveInteraction(session)

    const resp = session.takeAnytimeAction(0, 'C87-mason-anytime')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('farm-select')

    const built = session.resolveChoice(0, 'confirm', {
      rooms: [{ row: 0, col: 4 }],
    })
    expect(built.ok).toBe(true)

    const updatedPlayer = built.state.players[0]!
    expect(updatedPlayer.rooms).toBe(initialRooms + 1)
    expect(updatedPlayer.roomTiles).toContainEqual({ row: 0, col: 4 })
    expect(isCardFlagged(updatedPlayer, 'C87_Mason')).toBe(true)
  })

  it('NOT available when houseType is wood', () => {
    const session = setup({ houseType: 'wood', rooms: 4 })
    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('C87-mason-anytime')
  })

  it('NOT available when houseType is clay', () => {
    const session = setup({ houseType: 'clay', rooms: 4 })
    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('C87-mason-anytime')
  })

  it('NOT available when rooms < 4', () => {
    const session = setup({ houseType: 'stone', rooms: 3 })
    const resp = enterActiveInteraction(session)

    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('C87-mason-anytime')
  })

  it('NOT available after flagged (one-time)', () => {
    const session = setup({ houseType: 'stone', rooms: 4 })

    enterActiveInteraction(session)

    const resp1 = session.takeAnytimeAction(0, 'C87-mason-anytime')
    expect(resp1.ok).toBe(true)
    const built = session.resolveChoice(0, 'confirm', {
      rooms: [{ row: 0, col: 4 }],
    })
    expect(built.ok).toBe(true)

    // Should no longer be available
    const anytimeIds = built.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('C87-mason-anytime')
  })

  it('onBuy sets hasRoom extraData', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    const hasRoom = readCardExtraData<boolean>(player, 'C87_Mason', 'hasRoom')
    expect(hasRoom).toBe(true)
  })
})
