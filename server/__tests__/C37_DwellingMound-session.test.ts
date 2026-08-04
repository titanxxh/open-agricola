import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C037_DwellingMound'

const CARD_ID = 'C037_DwellingMound'

describe('C37 Dwelling Mound session', () => {
  it('attributes the additional food paid for plowing', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources = { ...player.resources, food: 1 }
    session.loadState(state)

    let resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    resp = session.commitSelectionChoice(0, { tile: { row: 0, col: 1 } })

    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.food).toBe(0)
    expect(after.fields).toContainEqual(expect.objectContaining({ row: 0, col: 1 }))
    expect(readCardResourceStats(after, CARD_ID)?.paid).toEqual({ food: 1 })
  })

  it('does not record an unaffordable plow', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources = { ...player.resources, food: 0 }
    session.loadState(state)

    const action = session.takeAction(0, 'farmland')
    expect(action.ok).toBe(true)
    const rejected = session.commitSelectionChoice(0, { tile: { row: 0, col: 1 } })
    expect(rejected.ok).toBe(false)
    expect(readCardResourceStats(rejected.state.players[0]!, CARD_ID)).toBeUndefined()
  })
})
