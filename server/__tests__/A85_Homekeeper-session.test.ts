import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { getExtraRoomCapacity } from '../../shared/cards/card-effects'

import '../../shared/cards/A/A85_Homekeeper'

const CARD_ID = 'A85_Homekeeper'

describe('A85_Homekeeper session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    return session
  }

  const openWishChildren = (session: GameSession) => {
    const state = session.getState().state
    state.round = 2
    state.roundActionOrder = state.roundActionOrder.map((spaceId) =>
      spaceId === 'wish-children' ? null : spaceId,
    )
    state.roundActionOrder[0] = 'wish-children'

    const wishChildren = state.actionSpaces.find((space) => space.id === 'wish-children')
    if (!wishChildren) throw new Error('wish-children space missing')
    wishChildren.takenBy = null
  }

  it('grants +1 capacity in a clay house when one room is adjacent to both a field and a pasture', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    player.houseType = 'clay'
    player.occupationPlayed = [CARD_ID]
    player.roomTiles = [
      { row: 0, col: 0 },
      { row: 2, col: 2 },
    ]
    player.fields = [{ row: 0, col: 1, crop: null, remaining: 0 }]
    player.pastures = [
      {
        id: 'p1',
        size: 1,
        tiles: [{ row: 1, col: 0 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]

    expect(getExtraRoomCapacity(player)).toBe(1)
  })

  it('does not stack when two rooms both qualify', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    player.houseType = 'stone'
    player.occupationPlayed = [CARD_ID]
    player.roomTiles = [
      { row: 0, col: 0 },
      { row: 2, col: 2 },
    ]
    player.fields = [
      { row: 0, col: 1, crop: null, remaining: 0 },
      { row: 2, col: 3, crop: null, remaining: 0 },
    ]
    player.pastures = [
      {
        id: 'p1',
        size: 1,
        tiles: [{ row: 1, col: 0 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
      {
        id: 'p2',
        size: 1,
        tiles: [{ row: 1, col: 2 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]

    expect(getExtraRoomCapacity(player)).toBe(1)
  })

  it('does not grant capacity when field and pasture are adjacent to different rooms', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    player.houseType = 'clay'
    player.occupationPlayed = [CARD_ID]
    player.roomTiles = [
      { row: 0, col: 0 },
      { row: 2, col: 2 },
    ]
    player.fields = [{ row: 0, col: 1, crop: null, remaining: 0 }]
    player.pastures = [
      {
        id: 'p1',
        size: 1,
        tiles: [{ row: 1, col: 2 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]

    expect(getExtraRoomCapacity(player)).toBe(0)
  })

  it('does not grant extra capacity in a wood house', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    player.houseType = 'wood'
    player.occupationPlayed = [CARD_ID]
    player.roomTiles = [{ row: 0, col: 0 }]
    player.fields = [{ row: 0, col: 1, crop: null, remaining: 0 }]
    player.pastures = [
      {
        id: 'p1',
        size: 1,
        tiles: [{ row: 1, col: 0 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]

    expect(getExtraRoomCapacity(player)).toBe(0)
  })

  it('makes wish-children available through GameSession when rooms equal family size but Homekeeper adds one effective room', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    openWishChildren(session)

    player.houseType = 'clay'
    player.occupationPlayed = [CARD_ID]
    player.rooms = 2
    player.familySize = 2
    player.workersAvailable = 2
    player.roomTiles = [
      { row: 0, col: 0 },
      { row: 2, col: 2 },
    ]
    player.fields = [{ row: 0, col: 1, crop: null, remaining: 0 }]
    player.pastures = [
      {
        id: 'p1',
        size: 1,
        tiles: [{ row: 1, col: 0 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]

    session.loadState(state)

    const loaded = session.getState()
    expect(loaded.ok).toBe(true)
    expect(loaded.pending.type).toBe('none')
    expect(loaded.actionAvailability?.['wish-children']).toBe(true)

    const resp = session.takeAction(0, 'wish-children')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.familySize).toBe(3)
    expect(resp.state.players[0]!.newbornCount).toBe(1)
  })
})
