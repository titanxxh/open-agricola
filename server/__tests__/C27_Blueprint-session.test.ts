import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { computeAllBuyableCombinations, resolveCardCostWithModifiers, resolveCardCostWithModifiersDetailed } from '../../shared/actions/payment/internal'
import { isComplexCost } from '../../shared/actions/payment/internal'
import {
  collectComputeChoiceCandidates,
  executeCardListener,
  getRegisteredCardListeners,
  type CardListenerContext,
} from '../../shared/cards/card-listeners'
import '../../shared/cards/C/C27_Blueprint'
import '../../shared/cards/B/B131_Equipper'

const CARD_ID = 'C27_Blueprint'
const ROUTING_LISTENER_ID = 'C27-blueprint-compute-choice-candidates'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

/**
 * C27 Blueprint — verify-only.
 *
 * BGA `Cards/C/C27_Blueprint.php::onPlayerComputeCardCosts` clones every
 * matching stone cost trade for `Major_Joinery`, `Major_Pottery`,
 * `Major_Basket` only. OA mirrors that with card-purchase cost candidates.
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

  it.each(ALLOWED_MAJORS)('adds sourced stone discount candidate for %s', (majorId) => {
    const { state, player } = setup()
    const baseCost = { wood: 2, stone: 2 }
    const resolved = resolveCardCostWithModifiersDetailed(
      state,
      player,
      'improvement',
      majorId,
      baseCost,
    )
    expect(isComplexCost(resolved.cost)).toBe(true)
    if (!isComplexCost(resolved.cost)) return
    expect(resolved.cost.fees).toEqual([
      baseCost,
      { wood: 2, stone: 1 },
    ])
    expect(resolved.cost.bonuses).toBeUndefined()
    expect(resolved.candidateMetadataByFeeIndex?.[1]?.sources).toEqual([CARD_ID])
  })

  it('surfaces only the discounted payment path for allowed majors', () => {
    const { state, player } = setup()
    player.resources = {
      ...player.resources,
      wood: 5,
      stone: 5,
    }
    const resolved = resolveCardCostWithModifiersDetailed(
      state,
      player,
      'improvement',
      'Major_Joinery',
      { wood: 2, stone: 2 },
    )
    expect(isComplexCost(resolved.cost)).toBe(true)
    if (!isComplexCost(resolved.cost)) return

    const options = computeAllBuyableCombinations(player, resolved.cost)
    // ADR 0004 amendment: the printed {wood:2, stone:2} row is strictly
    // dominated by the discounted row and pruned from the payment options.
    expect(options.some((option) =>
      option.resourcesPaid.wood === 2 &&
      option.resourcesPaid.stone === 2,
    )).toBe(false)
    expect(options.some((option) =>
      option.resourcesPaid.wood === 2 &&
      option.resourcesPaid.stone === 1 &&
      option.feeIndex === 1 &&
      resolved.candidateMetadataByFeeIndex?.[option.feeIndex]?.sources.includes(CARD_ID),
    )).toBe(true)
  })

  it('does NOT reduce cost for non-listed majors (e.g. Major_Fireplace)', () => {
    const { state, player } = setup()
    const baseCost = { clay: 2 }
    const resolved = resolveCardCostWithModifiers(
      state,
      player,
      'improvement',
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
      'improvement',
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
 * CraftsmanshipPromoter pattern). The cost discount is handled by the
 * card-purchase candidate pipeline above.
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
      actionId: 'improvement',
      params: { types: ['minor'] },
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
      actionId: 'improvement',
      params: { types: ['minor'] },
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
      actionId: 'improvement',
      params: { types: ['minor'] },
      phase: 'computeChoiceCandidates',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })

  it('does not inject majors into B131 card-derived minor improvement choices', () => {
    const { state, player } = setupWithResources()

    const extras = collectComputeChoiceCandidates(
      state,
      player,
      'improvement',
      { types: ['minor'], trueAction: false },
      'B131_Equipper',
    )

    expect(extras.some((option) => option.value === 'major:Major_Joinery')).toBe(false)
  })
})
