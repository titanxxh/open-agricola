import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { resolveCardCostWithModifiers } from '../../shared/actions/helpers/pay-helpers'
import { isComplexCost } from '../../shared/actions/helpers/payment'
import {
  executeCardListener,
  getRegisteredCardListeners,
  type CardListenerContext,
} from '../../shared/cards/card-listeners'
import '../../shared/cards/C/C27_Blueprint'

const CARD_ID = 'C27_Blueprint'
const ROUTING_LISTENER_ID = 'C27-blueprint-compute-choice-candidates'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

/**
 * C27 Blueprint — verify-only.
 *
 * BGA `Cards/C/C27_Blueprint.php::onPlayerComputeCardCosts` reduces stone by 1
 * for `Major_Joinery`, `Major_Pottery`, `Major_Basket` only. The listener in
 * `shared/cards/C/C27_Blueprint.ts` allow-lists exactly these three ids and
 * subtracts `stone: -1`. This test confirms the BGA-aligned cost path.
 */
describe('C27_Blueprint session — verify chooseOne aligned to BGA majors', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    session.loadState(state)
    return { session, state, player: session.getState().state.players[0]! }
  }

  const ALLOWED_MAJORS = ['Major_Joinery', 'Major_Pottery', 'Major_Basket'] as const

  it.each(ALLOWED_MAJORS)('reduces stone cost by 1 for %s', (majorId) => {
    const { state, player } = setup()
    // Joinery cost: { wood: 2, stone: 2 }. Pottery / Basket also include stone.
    // The listener subtracts stone:-1, mutating cost in place via applyCostOverride.
    const baseCost = { wood: 2, stone: 2 }
    const resolved = resolveCardCostWithModifiers(
      state,
      player,
      'improvement-any',
      majorId,
      baseCost,
    )
    expect(isComplexCost(resolved)).toBe(false)
    if (isComplexCost(resolved)) return
    expect(resolved.stone).toBe(1)
    expect(resolved.wood).toBe(2)
  })

  it('does NOT reduce cost for non-listed majors (e.g. Major_Fireplace)', () => {
    const { state, player } = setup()
    const baseCost = { clay: 2 }
    const resolved = resolveCardCostWithModifiers(
      state,
      player,
      'improvement-any',
      'Major_Fireplace',
      baseCost,
    )
    expect(isComplexCost(resolved)).toBe(false)
    if (isComplexCost(resolved)) return
    expect(resolved.clay).toBe(2)
  })

  it('does NOT reduce cost when player does not own C27', () => {
    const { state } = setup()
    const other = state.players[1]!
    const baseCost = { wood: 2, stone: 2 }
    const resolved = resolveCardCostWithModifiers(
      state,
      other,
      'improvement-any',
      'Major_Joinery',
      baseCost,
    )
    expect(isComplexCost(resolved)).toBe(false)
    if (isComplexCost(resolved)) return
    expect(resolved.stone).toBe(2)
  })
})

/**
 * BGA `C27_Blueprint`'s second behavior — "you can build the major
 * improvements ... even when taking a Minor Improvement action" — is
 * implemented via a `computeChoiceCandidates` listener that injects the 3
 * allowed majors into the minor-improvement choice list (mirrors D131
 * CraftsmanshipPromoter pattern). Cost discount mechanism (BGA trade-clone
 * vs our straight stone:-1 override) is registered as §2.5 simplification.
 */
describe('C27_Blueprint session — minor-improvement routing for 3 majors', () => {
  const ALLOWED_MAJORS = ['Major_Joinery', 'Major_Pottery', 'Major_Basket'] as const

  const setupWithResources = (overrides?: { playC27?: boolean }) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 5
    const player = state.players[0]!
    if (overrides?.playC27 !== false) {
      player.minorPlayed.push(CARD_ID)
    }
    // Plenty of resources so each allowed major is affordable
    player.resources = {
      ...player.resources,
      food: 10,
      wood: 5,
      clay: 5,
      stone: 5,
      reed: 5,
    }
    session.loadState(state)
    return { session, state, player: session.getState().state.players[0]! }
  }

  it('listener injects 3 allowed majors when player owns C27', () => {
    const { state, player } = setupWithResources()
    const listener = findListener(ROUTING_LISTENER_ID)
    expect(listener).toBeDefined()

    const result = executeCardListener(listener!, {
      state,
      player,
      actionId: 'minor-improvement',
      phase: 'computeChoiceCandidates',
    } as unknown as CardListenerContext)

    expect(result?.extraOptions).toBeDefined()
    const values = (result!.extraOptions ?? []).map((o) => o.value).sort()
    for (const major of ALLOWED_MAJORS) {
      expect(values).toContain(`major:${major}`)
    }
    for (const opt of result!.extraOptions ?? []) {
      expect(opt.sourceCard).toBe(CARD_ID)
    }
  })

  it('listener returns nothing when player does not own C27', () => {
    const { state, player } = setupWithResources({ playC27: false })
    const listener = findListener(ROUTING_LISTENER_ID)!

    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'minor-improvement',
      phase: 'computeChoiceCandidates',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('listener filters out majors that are not on the supply', () => {
    const { state, player } = setupWithResources()
    state.availableMajorImprovements = ['Major_Fireplace1', 'Major_Well']
    const listener = findListener(ROUTING_LISTENER_ID)!

    const result = executeCardListener(listener, {
      state,
      player,
      actionId: 'minor-improvement',
      phase: 'computeChoiceCandidates',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })
})
