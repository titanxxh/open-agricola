import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import '../../shared/cards/B/B032_Kettle'
import '../../shared/cards/C/C115_Sower'
import '../../shared/cards/D/D106_WhiskyDistiller'

const KETTLE = 'B032_Kettle'
const SOWER = 'C115_Sower'
const SOWER_ANYTIME_ID = 'C115-sower-anytime'
const WHISKY = 'D106_WhiskyDistiller'

describe('anytime — composite pending policy/UI consistency', () => {
  it('UI interaction snapshot and listAnytimeEntries agree on composite-hosted pending', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    for (const p of state.players) {
      p.minorHand = ['__test_placeholder__']
      p.occupationHand = ['__test_placeholder__']
    }
    const p0 = state.players[0]!
    p0.minorPlayed.push(KETTLE)
    p0.minorPlayed.push(WHISKY)
    p0.minorPlayed.push(SOWER)
    if (!p0.cardStates[SOWER]) p0.cardStates[SOWER] = {}
    p0.cardStates[SOWER]!.stack = ['reed']
    p0.resources = { ...p0.resources, grain: 10, food: 0, reed: 0 }
    session.loadState(state)

    expect(session.takeAction(0, 'farmland').ok).toBe(true)
    // Land directly on C115's composite pending without going through exchange
    const nested = session.takeAnytimeAction(0, SOWER_ANYTIME_ID)
    expect(nested.ok).toBe(true)

    // UI view from buildInteraction
    const interaction = nested.interaction as {
      stateId: string
      promptKey?: string
      anytimeActions: Array<{ id: string }>
      request?: { kind?: string }
      options?: Array<{ value: string }>
    }
    expect(interaction.stateId).toBe('wait')
    expect(interaction.promptKey).toBeTruthy()
    expect(interaction.request.options).toBeTruthy()
    expect((interaction.request.options ?? []).length).toBeGreaterThan(0)

    // Server-side view from listAnytimeEntries (used by takeAnytimeAction policy check)
    const serverEntries = (session as unknown as {
      listAnytimeEntries: () => Array<{ descriptor: { id: string } }>
    }).listAnytimeEntries()
    const serverIds = serverEntries.map((e) => e.descriptor.id).sort()
    const uiIds = interaction.anytimeActions.map((a) => a.id).sort()

    // The two lists MUST agree — that's the invariant the policy helper guarantees
    expect(serverIds).toEqual(uiIds)

    // Policy snapshot inspection (via @internal accessor)
    const policySnap = (session as unknown as {
      computeAnytimePolicySnapshot: () => { allowed: boolean; blockedIds?: ReadonlyArray<string>; reason?: string }
    }).computeAnytimePolicySnapshot()
    expect(policySnap.allowed).toBe(true)
    // C115's xor doesn't trigger exchange/bake-bread/reorg blocks, so blockedIds is []
    expect(policySnap.blockedIds).toEqual([])
  })
})
