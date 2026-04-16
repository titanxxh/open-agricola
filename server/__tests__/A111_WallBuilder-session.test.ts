import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import '../../shared/cards/A/A111_WallBuilder'

const CARD_ID = 'A111_WallBuilder'

describe('A111_WallBuilder session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 3

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.playedCards.push(`occupation:${CARD_ID}`)
    // Enough for a wood room (5 wood + 2 reed).
    player.resources = { ...player.resources, wood: 10, reed: 3, clay: 0, stone: 0 }
    player.houseType = 'wood'

    session.loadState(state)
    return session
  }

  it('queues 1 FOOD on each of next 4 round spaces after building a room', () => {
    const session = setup()

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    // farm-expansion OR between construct & stables with both resources present.
    if (resp.pending.type === 'choice') {
      const constructOption = resp.pending.options.find(
        (o) => o.labelKey === 'actions.construct.name',
      )
      expect(constructOption).toBeDefined()
      resp = session.resolveChoice(0, constructOption!.value)
    }
    expect(resp.interaction.stateId).toBe('farmSelect')
    if (resp.interaction.stateId !== 'farmSelect') return
    expect(resp.interaction.farm.farmType).toBe('room')
    if (resp.interaction.farm.farmType !== 'room') return

    const room = resp.interaction.farm.selectableTiles[0]!
    resp = session.commitFarmChoice(0, 'room', { rooms: [room] })
    expect(resp.ok).toBe(true)

    const playerId = resp.state.players[0]!.id
    const entries = resp.state.futureMeeples.filter(
      (e) => e.cardId === CARD_ID && e.playerId === playerId,
    )
    expect(entries).toHaveLength(4)
    const rounds = entries.map((e) => e.round).sort((a, b) => a - b)
    expect(rounds).toEqual([4, 5, 6, 7])
    entries.forEach((entry) => {
      expect(entry.resources.food).toBe(1)
    })
  })

  it('does not trigger when card is not played', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 3

    const player = state.players[0]!
    player.resources = { ...player.resources, wood: 10, reed: 3 }

    session.loadState(state)

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    if (resp.pending.type === 'choice') {
      const constructOption = resp.pending.options.find(
        (o) => o.labelKey === 'actions.construct.name',
      )
      resp = session.resolveChoice(0, constructOption!.value)
    }
    if (resp.interaction.stateId !== 'farmSelect') return
    if (resp.interaction.farm.farmType !== 'room') return

    const room = resp.interaction.farm.selectableTiles[0]!
    resp = session.commitFarmChoice(0, 'room', { rooms: [room] })
    expect(resp.ok).toBe(true)
    const entries = resp.state.futureMeeples.filter((e) => e.cardId === CARD_ID)
    expect(entries).toHaveLength(0)
  })
})
