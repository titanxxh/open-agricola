import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/C/C101_StallHolder'

describe('C101_StallHolder session', () => {
  const setup = (opts?: { stableCount?: number }) => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('C101_StallHolder')
    player.resources.grain = 5
    player.resources.food = 0

    if (opts?.stableCount) {
      // Add unfenced stables (not inside any pasture)
      for (let i = 0; i < opts.stableCount; i++) {
        player.stableTiles.push({ row: 0, col: 2 + i })
      }
    }

    session.loadState(state)
    session.devPlayCard(0, 'C101_StallHolder')
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  it('C101 S1: playing Stall Holder through Lessons keeps the occupation in play', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.players[0]!.occupationHand = ['C101_StallHolder']
    session.loadState(state)

    const response = session.takeAction(0, 'lessons')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('C101_StallHolder')
  })

  it('C101 S2: with 0 unfenced stables pay 2 grain and gain 1 VP plus 1 food', () => {
    const session = setup({ stableCount: 0 })

    enterActiveInteraction(session)

    const resp = session.takeAnytimeAction(0, 'C101-stall-holder-anytime')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.grain).toBe(3) // 5 - 2
    expect(player.resources.food).toBe(1) // 0 + 1 (0 unfenced stables + 1)
    expect(player.cardStates?.C101_StallHolder?.counters?.bonusVp).toBe(1)
    expect(isCardFlagged(player, 'C101_StallHolder')).toBe(true)
  })

  it('C101 S3: with 3 unfenced stables pay 2 grain and gain 1 VP plus 4 food', () => {
    const session = setup({ stableCount: 3 })

    enterActiveInteraction(session)

    const resp = session.takeAnytimeAction(0, 'C101-stall-holder-anytime')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.grain).toBe(3) // 5 - 2
    expect(player.resources.food).toBe(4) // 0 + 4 (3 unfenced stables + 1)
    expect(player.cardStates?.C101_StallHolder?.counters?.bonusVp).toBe(1)
    expect(isCardFlagged(player, 'C101_StallHolder')).toBe(true)
  })

  it('C101 supplemental: counts the B85 FarmHand stable as unfenced', () => {
    const session = setup({ stableCount: 0 })
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationPlayed.push('B085_FarmHand')
    player.cardStates = {
      ...player.cardStates,
      B085_FarmHand: { extraData: { position: { row: 0, col: 0 } } },
    }
    session.loadState(state)

    enterActiveInteraction(session)

    const resp = session.takeAnytimeAction(0, 'C101-stall-holder-anytime')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(2) // 1 unfenced stable + 1
  })

  it('C101 S4: fewer than 2 grain keeps Stall Holder unavailable', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.grain = 1 // Not enough (need 2)
    session.loadState(state)

    const resp = enterActiveInteraction(session)
    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('C101-stall-holder-anytime')
  })

  it('C101 S5: Stall Holder can be used only once in the same round', () => {
    const session = setup()

    enterActiveInteraction(session)

    const resp = session.takeAnytimeAction(0, 'C101-stall-holder-anytime')
    expect(resp.ok).toBe(true)
    expect(isCardFlagged(resp.state.players[0]!, 'C101_StallHolder')).toBe(true)

    // Verify anytime action is no longer available
    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('C101-stall-holder-anytime')
  })
})
