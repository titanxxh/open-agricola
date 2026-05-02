import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'

import '../../shared/cards/E/E73_Scythe'
import type { ActionFlow, Field } from '../../shared/game/types'
import { getAdHocAction } from '../../shared/actions/helpers/ad-hoc-action-registry'
import { reap } from '../../shared/actions/effects/reap'

const CARD_ID = 'E73_Scythe'

const makeField = (
  row: number,
  col: number,
  stacks: Array<{ kind: 'grain' | 'vegetable'; remaining: number }>,
): Field => ({ row, col, stacks })

const setupSession = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = 4
  return { session, state }
}

describe('E73_Scythe session — token model + reap full stack', () => {
  it('triggers when a field has at least 2 crops total (single-stack ≥2)', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = [
      // single-stack field with 3 grain (qualifies: >=2 crops)
      makeField(0, 0, [{ kind: 'grain', remaining: 3 }]),
    ]
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)!
    const flow = effect.onStartHarvestFieldPhase!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('xor')
    const xor = flow as Extract<ActionFlow, { type: 'xor' }>
    expect(xor.optional).toBe(true)
    expect(xor.children.length).toBe(1)
  })

  it('does NOT trigger when only 1 crop on a field', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = [
      makeField(0, 0, [{ kind: 'grain', remaining: 1 }]),
    ]
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)!
    const flow = effect.onStartHarvestFieldPhase!(state, player)
    expect(flow).toBeUndefined()
  })

  it('does NOT trigger when no fields planted', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = []
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)!
    const flow = effect.onStartHarvestFieldPhase!(state, player)
    expect(flow).toBeUndefined()
  })

  it('reaps the entire stack (multi-stack field — all crops in one go)', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = [
      // BGA "multi-stack" example: vegetable on top of grain
      makeField(0, 0, [
        { kind: 'grain', remaining: 1 },
        { kind: 'vegetable', remaining: 1 },
      ]),
      // a different field with crops — should NOT be touched
      makeField(0, 1, [{ kind: 'grain', remaining: 2 }]),
    ]
    player.resources.grain = 0
    player.resources.vegetable = 0
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)!
    const flow = effect.onStartHarvestFieldPhase!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('xor')
    const xor = flow as Extract<ActionFlow, { type: 'xor' }>
    // both fields qualify (totalRemaining ≥2)
    expect(xor.children.length).toBe(2)

    // pick child for field index 0 — execute it via the registered ad-hoc action.
    const firstChild = xor.children[0] as Extract<ActionFlow, { type: 'leaf' }>
    expect(firstChild.actionId).toBe('card_E73_Scythe_harvest-field')
    expect(firstChild.params).toEqual({ fieldIndex: 0 })

    const adHoc = getAdHocAction('card_E73_Scythe_harvest-field')!
    const result = adHoc.execute({
      state,
      player,
      params: { fieldIndex: 0 },
      sourceCard: CARD_ID,
    } as Parameters<typeof adHoc.execute>[0])

    expect(result.type).toBe('ok')
    // both stacks fully reaped: 1 grain + 1 vegetable
    expect(player.resources.grain).toBe(1)
    expect(player.resources.vegetable).toBe(1)
    // selected field is now empty
    expect(player.fields[0]!.stacks.length).toBe(0)
    // other field untouched (still has its 2 grain)
    expect(player.fields[1]!.stacks[0]!.remaining).toBe(2)
  })

  it('reaps a deep multi-stack field (2 grain + 1 vegetable) all at once', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = [
      makeField(0, 0, [
        { kind: 'grain', remaining: 2 },
        { kind: 'vegetable', remaining: 1 },
      ]),
    ]
    player.resources.grain = 0
    player.resources.vegetable = 0
    session.loadState(state)

    const adHoc = getAdHocAction('card_E73_Scythe_harvest-field')!
    const result = adHoc.execute({
      state,
      player,
      params: { fieldIndex: 0 },
      sourceCard: CARD_ID,
    } as Parameters<typeof adHoc.execute>[0])

    expect(result.type).toBe('ok')
    expect(player.resources.grain).toBe(2)
    expect(player.resources.vegetable).toBe(1)
    expect(player.fields[0]!.stacks.length).toBe(0)
  })

  it('main reap does not double-harvest the field after Scythe empties it', () => {
    // After Scythe's harvest leaf empties the field, the main reap path
    // (shared/actions/effects/reap.ts) iterates fields and skips empty ones —
    // so no double-harvest is possible.
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.fields = [
      makeField(0, 0, [
        { kind: 'grain', remaining: 1 },
        { kind: 'vegetable', remaining: 1 },
      ]),
    ]
    player.resources.grain = 0
    player.resources.vegetable = 0
    session.loadState(state)

    // Scythe-harvest the field
    const adHoc = getAdHocAction('card_E73_Scythe_harvest-field')!
    adHoc.execute({
      state,
      player,
      params: { fieldIndex: 0 },
      sourceCard: CARD_ID,
    } as Parameters<typeof adHoc.execute>[0])

    expect(player.resources.grain).toBe(1)
    expect(player.resources.vegetable).toBe(1)
    expect(player.fields[0]!.stacks.length).toBe(0)

    // Now invoke the main reap helper directly — should be a no-op for the empty field.
    reap(state, player)
    // Resources unchanged: still 1 grain + 1 vegetable (no double).
    expect(player.resources.grain).toBe(1)
    expect(player.resources.vegetable).toBe(1)
  })
})
