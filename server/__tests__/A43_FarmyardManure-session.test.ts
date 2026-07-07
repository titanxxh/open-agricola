import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import '../../shared/cards/A/A043_FarmyardManure'

const CARD_ID = 'A043_FarmyardManure'

describe('A043_FarmyardManure session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 3

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    // Give wood so we can afford stables (1 wood each).
    player.resources.wood = 5

    session.loadState(state)
    return session
  }

  it('queues 1 FOOD on next 3 round spaces after building a stable', () => {
    const session = setup()

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    // With wood only (no reed), farm-expansion auto-selects stables → farmSelect.
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.farm.farmType).toBe('stable')
    if (resp.interaction.request.farm.farmType !== 'stable') return

    const stable = resp.interaction.request.farm.selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { stables: [stable] })
    expect(resp.ok).toBe(true)

    // Expect 3 future-meeple entries owned by our player for the next 3 rounds.
    const playerId = resp.state.players[0]!.id
    const entries = resp.state.futureMeeples.filter(
      (e) => e.cardId === CARD_ID && e.playerId === playerId,
    )
    expect(entries).toHaveLength(3)
    const rounds = entries.map((e) => e.round).sort((a, b) => a - b)
    expect(rounds).toEqual([4, 5, 6])
    entries.forEach((entry) => {
      expect(entry.resources.food).toBe(1)
    })
  })

  it('fires only once per turn even if multiple stables are built', () => {
    const session = setup()

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId !== 'wait') return
    if (resp.interaction.request.farm.farmType !== 'stable') return

    const [t1, t2] = resp.interaction.request.farm.selectableTiles
    resp = session.commitSelectionChoice(0, { stables: [t1!, t2!] })
    expect(resp.ok).toBe(true)

    const entries = resp.state.futureMeeples.filter((e) => e.cardId === CARD_ID)
    // still only 3 entries (not 6) because the card fires once per action
    expect(entries).toHaveLength(3)
  })

  it('does not trigger when card is not played', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.resources.wood = 5

    session.loadState(state)

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId !== 'wait') return
    if (resp.interaction.request.farm.farmType !== 'stable') return

    const stable = resp.interaction.request.farm.selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { stables: [stable] })
    expect(resp.ok).toBe(true)
    const entries = resp.state.futureMeeples.filter((e) => e.cardId === CARD_ID)
    expect(entries).toHaveLength(0)
  })
})
