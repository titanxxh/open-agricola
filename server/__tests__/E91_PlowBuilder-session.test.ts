import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import {
  readCardExtraData,
  writeCardExtraData,
  setCardFlag,
} from '../../shared/cards/helpers/card-state'
import {
  getRegisteredCardListeners,
  executeCardListener,
  type CardListenerContext,
} from '../../shared/cards/card-listeners'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import '../../shared/cards/E/E91_PlowBuilder'
import type { AnytimeAction } from '../../shared/game/types'

const CARD_ID = 'E91_PlowBuilder'

describe('E91_PlowBuilder session', () => {
  /**
   * BGA gates the anytime action on a per-harvest `usedJoinery` flag set by
   * an Exchange-event listener (Joinery used during the harvest), not just
   * on owning the card. Sprint 5e mirrored this with a `trade-applied`
   * listener; tests below set the flag directly via the same helper to
   * decouple from Joinery's exchange listing.
   */
  const setup = (round = 4, options?: { joineryUsed?: boolean }) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = round

    const player = state.players[0]!
    player.occupationHand.push(CARD_ID)
    session.loadState(state)
    session.devPlayCard(0, CARD_ID)

    // Give the player Major_Joinery and food
    const st2 = session.getState().state
    const p = st2.players[0]!
    p.improvements.push('Major_Joinery')
    p.resources.food = 5
    if (options?.joineryUsed !== false) {
      writeCardExtraData(p, CARD_ID, 'usedJoinery', true)
    }
    session.loadState(st2)

    return session
  }

  /** Take farmland action to enter active interaction */
  const enterActiveInteraction = (session: GameSession) => {
    const resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    return resp
  }

  it('available during harvest round with Joinery used + food', () => {
    const session = setup(4) // round 4 is a harvest round
    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).toContain('E91-plow-builder-anytime')
  })

  it('pay 1 food and plow 1 field', () => {
    const session = setup(4)
    enterActiveInteraction(session)

    // Take the anytime action
    let resp = session.takeAnytimeAction(0, 'E91-plow-builder-anytime')
    expect(resp.ok).toBe(true)

    // After paying food, plow action starts — should show farmSelect for tile selection
    expect(resp.pending.type).toBe('choice')
    expect(resp.interaction.stateId).toBe('wait')

    // Commit the plow choice
    const tile = resp.interaction.farm.selectableTiles[0]
    expect(tile).toBeDefined()
    resp = session.resolveChoice(0, 'confirm', { tile })
    expect(resp.ok).toBe(true)

    const p = resp.state.players[0]!
    // Should have paid 1 food (started with 5)
    expect(p.resources.food).toBe(4)
    // Should have gained a new field
    expect(p.fields.length).toBeGreaterThanOrEqual(1)
    // Card should be flagged (one-time per harvest)
    expect(p.cardStates?.[CARD_ID]?.flagged).toBe(true)
  })

  it('NOT available in non-harvest round', () => {
    const session = setup(3) // round 3 is not a harvest round
    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).not.toContain('E91-plow-builder-anytime')
  })

  it('NOT available without food', () => {
    const session = setup(4)
    const state = session.getState().state
    state.players[0]!.resources.food = 0
    session.loadState(state)

    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).not.toContain('E91-plow-builder-anytime')
  })

  it('NOT available when Joinery owned but not used this harvest', () => {
    // Sprint 5e change: anytime now gates on usedJoinery flag, not just
    // ownership. Without the flag, action does not appear.
    const session = setup(4, { joineryUsed: false })
    const resp = enterActiveInteraction(session)
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).not.toContain('E91-plow-builder-anytime')
  })

  it('trade-applied listener sets usedJoinery on Major_Joinery sourceId', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    session.loadState(state)

    const listener = getRegisteredCardListeners().find(
      (l) => l.id === 'E91-plow-builder-trade-applied',
    )
    expect(listener).toBeDefined()

    expect(readCardExtraData<boolean>(player, CARD_ID, 'usedJoinery')).toBeUndefined()

    executeCardListener(listener!, {
      state,
      player,
      actionId: 'trade-applied',
      phase: 'immediatelyAfter',
      extraData: { sourceId: 'Major_Joinery', times: 1 },
    } as unknown as CardListenerContext)
    expect(readCardExtraData<boolean>(player, CARD_ID, 'usedJoinery')).toBe(true)
  })

  it('trade-applied listener ignores non-Joinery sourceIds (e.g. Fireplace)', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    session.loadState(state)

    const listener = getRegisteredCardListeners().find(
      (l) => l.id === 'E91-plow-builder-trade-applied',
    )!

    executeCardListener(listener, {
      state,
      player,
      actionId: 'trade-applied',
      phase: 'immediatelyAfter',
      extraData: { sourceId: 'Major_Fireplace1', times: 1 },
    } as unknown as CardListenerContext)
    expect(readCardExtraData<boolean>(player, CARD_ID, 'usedJoinery')).toBeFalsy()
  })

  it('trade-applied listener accepts Major_Joinery upgrade prefix matches', () => {
    // Future-proofing: BGA prefix-matches Major_Joinery to catch potential
    // upgrade ids; we mirror with startsWith.
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    session.loadState(state)

    const listener = getRegisteredCardListeners().find(
      (l) => l.id === 'E91-plow-builder-trade-applied',
    )!

    executeCardListener(listener, {
      state,
      player,
      actionId: 'trade-applied',
      phase: 'immediatelyAfter',
      extraData: { sourceId: 'Major_JoineryDeluxe', times: 1 },
    } as unknown as CardListenerContext)
    expect(readCardExtraData<boolean>(player, CARD_ID, 'usedJoinery')).toBe(true)
  })

  it('onAfterHarvest clears both the per-use flag and usedJoinery', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    setCardFlag(player, CARD_ID, true)
    writeCardExtraData(player, CARD_ID, 'usedJoinery', true)
    session.loadState(state)

    runCardEffectHook(state, player, CARD_ID, 'onAfterHarvest')
    expect(player.cardStates?.[CARD_ID]?.flagged).toBe(false)
    expect(readCardExtraData<boolean>(player, CARD_ID, 'usedJoinery')).toBe(false)
  })

  it('Joinery onHarvest dispatches trade-applied → E91 sees usedJoinery', async () => {
    // Integration: build a session, give the player Major_Joinery + wood,
    // run Joinery's onHarvest hook, and confirm E91's trade-applied
    // listener flipped the usedJoinery flag without any manual setup.
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.improvements.push('Major_Joinery')
    player.resources.wood = 1
    player.resources.food = 0
    session.loadState(state)

    expect(readCardExtraData<boolean>(player, CARD_ID, 'usedJoinery')).toBeFalsy()
    runCardEffectHook(state, player, 'Major_Joinery', 'onHarvest')
    expect(player.resources.wood).toBe(0)
    expect(player.resources.food).toBe(2)
    expect(readCardExtraData<boolean>(player, CARD_ID, 'usedJoinery')).toBe(true)
  })

  it('one-time per harvest (flagged after use, reset at onAfterHarvest)', () => {
    const session = setup(4)
    enterActiveInteraction(session)

    // Use the anytime action
    let resp = session.takeAnytimeAction(0, 'E91-plow-builder-anytime')
    expect(resp.ok).toBe(true)

    // Complete the plow
    const tile = resp.interaction.farm.selectableTiles[0]
    expect(tile).toBeDefined()
    resp = session.resolveChoice(0, 'confirm', { tile })
    expect(resp.ok).toBe(true)

    // Card should now be flagged
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.flagged).toBe(true)

    // The anytime action should no longer appear
    const ids = resp.interaction.anytimeActions.map((a: AnytimeAction) => a.id)
    expect(ids).not.toContain('E91-plow-builder-anytime')
  })
})
