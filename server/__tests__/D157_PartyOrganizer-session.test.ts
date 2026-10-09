import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { D157_PartyOrganizer_impl } from '../../shared/cards/D/D157_PartyOrganizer'
import {
  setActiveWorkerCount,
  setNewbornCount,
  setWorkersAtHome,
  familySize,
} from '../../shared/domain/player'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'
import { specialEffectAction } from '../../shared/actions/effects/special-effect'
import type {
  ActionHookPhase,
  ActionHookResult,
} from '../../shared/actions/hooks'
import type { CardListenerContext } from '../../shared/cards/card-listeners'
import type { ActionSpace, GameState, PlayerState } from '../../shared/contract/types'

const CARD_ID = 'D157_PartyOrganizer'

const buildOpponentLikePlayer = (overrides: Partial<PlayerState>): PlayerState => {
  // Lightweight player fixture for listener handler unit calls. Family size
  // is read from the workers array, so we build workers minimally.
  const session = new GameSession(42)
  const state = session.getState().state
  const proto = state.players[1]!
  return { ...proto, ...overrides } as PlayerState
}

describe('D157 Party Organizer — listener', () => {
  it('listener handler triggers when opponent reaches family of exactly 5', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    const owner = state.players[0]!
    const opponent = state.players[1]!
    owner.minorPlayed.push(CARD_ID)
    setActiveWorkerCount(opponent, 5)
    setNewbornCount(opponent, 0)
    expect(familySize(opponent)).toBe(5)

    const handler = D157_PartyOrganizer_impl.listeners[0]!.handler
    const ctx: CardListenerContext = {
      state,
      player: opponent,
      triggerPlayer: opponent,
      ownerPlayer: owner,
      effectPlayer: owner,
      actionId: 'family-growth',
      phase: 'after' as ActionHookPhase,
    } as unknown as CardListenerContext
    const result = handler(ctx) as ActionHookResult | undefined
    expect(result).toBeTruthy()
    expect(result?.sourceCard).toBe(CARD_ID)
    expect(isCardFlagged(owner, CARD_ID)).toBe(false)
    expect(result?.flow?.type).toBe('seq')
    if (result?.flow?.type !== 'seq') throw new Error('expected seq flow')
    expect(result.flow.children).toHaveLength(2)
    expect(result.flow.children[0]).toMatchObject({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'set-flag', flag: true },
      actionContext: { targetPlayerId: owner.id },
    })
    expect(result.flow.children[1]).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      sourceCard: CARD_ID,
      params: { food: 8 },
    })

    const flagLeaf = result.flow.children[0]
    if (flagLeaf.type !== 'leaf') throw new Error('expected flag leaf')
    specialEffectAction.execute({
      state,
      player: opponent,
      space: { id: 'special-effect' } as ActionSpace,
      sourceCard: flagLeaf.sourceCard,
      params: flagLeaf.params,
      actionContext: flagLeaf.actionContext,
    })
    expect(isCardFlagged(owner, CARD_ID)).toBe(true)

    const result2 = handler(ctx)
    expect(result2).toBeUndefined()
  })

  it('listener handler does not fire when opponent only has 4', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    const owner = state.players[0]!
    const opponent = state.players[1]!
    owner.minorPlayed.push(CARD_ID)
    setActiveWorkerCount(opponent, 4)
    setNewbornCount(opponent, 0)

    const handler = D157_PartyOrganizer_impl.listeners[0]!.handler
    const ctx = {
      state,
      player: owner,
      triggerPlayer: opponent,
      actionId: 'family-growth',
      phase: 'after',
    } as unknown as CardListenerContext
    expect(handler(ctx)).toBeUndefined()
    expect(isCardFlagged(owner, CARD_ID)).toBe(false)
  })

  it('listener handler does not fire when opponent has 3 → no trigger', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    const owner = state.players[0]!
    const opponent = state.players[1]!
    owner.minorPlayed.push(CARD_ID)
    setActiveWorkerCount(opponent, 3)
    setNewbornCount(opponent, 0)

    const handler = D157_PartyOrganizer_impl.listeners[0]!.handler
    const ctx = {
      state,
      player: owner,
      triggerPlayer: opponent,
      actionId: 'family-growth',
      phase: 'after',
    } as unknown as CardListenerContext
    expect(handler(ctx)).toBeUndefined()
  })

  it('computeBonusScore: +3 VP when owner has 5 + sole 5-family', () => {
    const session = new GameSession(42)
    const state = session.getState().state as GameState
    const owner = state.players[0]!
    setActiveWorkerCount(owner, 5)
    setActiveWorkerCount(state.players[1]!, 4)

    const compute = D157_PartyOrganizer_impl.effect.computeBonusScore!
    expect(compute(state, owner)).toBe(3)
  })

  it('computeBonusScore: 0 VP when multiple players have 5', () => {
    const session = new GameSession(42)
    const state = session.getState().state as GameState
    const owner = state.players[0]!
    setActiveWorkerCount(owner, 5)
    setActiveWorkerCount(state.players[1]!, 5)

    const compute = D157_PartyOrganizer_impl.effect.computeBonusScore!
    expect(compute(state, owner)).toBe(0)
  })

  it('computeBonusScore: 0 VP when owner has < 5 family', () => {
    const session = new GameSession(42)
    const state = session.getState().state as GameState
    const owner = state.players[0]!
    setActiveWorkerCount(owner, 4)

    const compute = D157_PartyOrganizer_impl.effect.computeBonusScore!
    expect(compute(state, owner)).toBe(0)
  })
})

// Silence unused import warnings (kept for consistency / future tests)
void buildOpponentLikePlayer
void setWorkersAtHome
