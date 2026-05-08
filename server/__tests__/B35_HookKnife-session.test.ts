import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/B/B35_HookKnife'
import type { AnytimeAction } from '../../shared/contract/types';

const CARD_ID = 'B35_HookKnife'

describe('B35_HookKnife session', () => {
  const setup = (sheep = 0, playerCount = 2) => {
    const session = new GameSession(undefined, undefined, { playerCount })
    const state = session.getState().state
    state.players = state.players.slice(0, playerCount)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.minorHand.push(CARD_ID)
    player.resources.sheep = sheep
    session.loadState(state)
    session.devPlayCard(0, CARD_ID)
    return session
  }

  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    return resp
  }

  it('2-player: not available with 7 sheep (threshold is 8)', () => {
    const session = setup(7, 2)
    const resp = enterActiveInteraction(session)
    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('B35-hook-knife-anytime')
  })

  it('2-player: available with 8 sheep, grants 2 VP', () => {
    const session = setup(8, 2)
    const resp = enterActiveInteraction(session)
    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).toContain('B35-hook-knife-anytime')

    const resp2 = session.takeAnytimeAction(0, 'B35-hook-knife-anytime')
    expect(resp2.ok).toBe(true)
    expect(resp2.state.players[0]!.cardStates?.B35_HookKnife?.counters?.bonusVp).toBe(2)
  })

  it('3-player: threshold is 7, available with 7 sheep', () => {
    const session = setup(7, 3)
    const resp = enterActiveInteraction(session)
    const anytimeIds = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).toContain('B35-hook-knife-anytime')

    const resp2 = session.takeAnytimeAction(0, 'B35-hook-knife-anytime')
    expect(resp2.ok).toBe(true)
    expect(resp2.state.players[0]!.cardStates?.B35_HookKnife?.counters?.bonusVp).toBe(2)
  })

  it('one-time only', () => {
    const session = setup(8, 2)
    enterActiveInteraction(session)

    const resp2 = session.takeAnytimeAction(0, 'B35-hook-knife-anytime')
    expect(resp2.ok).toBe(true)
    expect(isCardFlagged(resp2.state.players[0]!, CARD_ID)).toBe(true)

    // Should no longer appear in anytime actions
    const anytimeIds = resp2.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(anytimeIds).not.toContain('B35-hook-knife-anytime')
  })
})
