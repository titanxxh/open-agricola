import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/A/A153_PigOwner'
import type { AnytimeAction } from '../../shared/contract/types';

const CARD_ID = 'A153_PigOwner'

describe('A153_PigOwner session', () => {
  const setup = (boar = 0) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push(CARD_ID)
    player.resources.boar = boar
    // Place the pigs in a pasture so they count as "on the farm" (A153 counts
    // on-farm pigs, not supply). Pasture covers 2 spaces in row 2 to avoid
    // colliding with default rooms at row 0.
    if (boar > 0) {
      player.pastures = [
        {
          id: 'p1',
          tiles: [{ row: 2, col: 0 }, { row: 2, col: 1 }],
          animalType: 'boar',
          animalCount: boar,
          stables: 0,
        } as any,
      ]
    }
    session.loadState(state)
    session.devPlayCard(0, CARD_ID)
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  it('not available with < 5 boar', () => {
    const session = setup(4)
    const resp = enterActiveInteraction(session)
    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('A153-pig-owner-anytime')
  })

  it('available with >= 5 boar, grants 3 VP', () => {
    const session = setup(5)
    const resp = enterActiveInteraction(session)
    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).toContain('A153-pig-owner-anytime')

    const resp2 = session.takeAnytimeAction(0, 'A153-pig-owner-anytime')
    expect(resp2.ok).toBe(true)
    expect(resp2.state.players[0]!.cardStates?.A153_PigOwner?.counters?.bonusVp).toBe(3)
  })

  it('not available after flagged (one-time)', () => {
    const session = setup(5)
    enterActiveInteraction(session)

    const resp2 = session.takeAnytimeAction(0, 'A153-pig-owner-anytime')
    expect(resp2.ok).toBe(true)
    expect(isCardFlagged(resp2.state.players[0]!, CARD_ID)).toBe(true)

    // Should no longer appear in anytime actions
    const anytimeIds = resp2.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('A153-pig-owner-anytime')
  })
})
