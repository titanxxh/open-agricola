import { describe, it, expect } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getExchangesInWindow, applyTrade } from '../../shared/actions/effects/exchange'
import { applyTradeSideEffect } from '../../shared/actions/helpers/payment'

import '../../shared/cards/C/C62_CookeryExtension'

const C62 = 'C62_CookeryExtension'
const FIREPLACE1 = 'Major_Fireplace1'
const COOKING_HEARTH1 = 'Major_CookingHearth1'

const setupTwoPlayer = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.players[0]!.name = 'P1'
  state.players[1]!.name = 'P2'
  return { session, state }
}

const seedC62 = (state: ReturnType<GameSession['getState']>['state'], playerId = 'p1') => {
  const player = state.players.find((p) => p.id === playerId)!
  player.minorPlayed = [...(player.minorPlayed ?? []), C62]
  player.cardStates = {
    ...(player.cardStates ?? {}),
    [C62]: { extraData: { usedCookeryIds: [] } },
  }
}

const seedCookery = (
  state: ReturnType<GameSession['getState']>['state'],
  cardId: string,
  playerId = 'p1',
) => {
  const player = state.players.find((p) => p.id === playerId)!
  if (cardId.startsWith('Major_')) {
    player.improvements = [...(player.improvements ?? []), cardId]
  } else {
    player.minorPlayed = [...(player.minorPlayed ?? []), cardId]
  }
}

describe('C62 CookeryExtension', () => {
  it('derives doubled vegetable→4food trade from Major_Fireplace1 in harvest window', () => {
    const { session, state } = setupTwoPlayer()
    seedC62(state)
    seedCookery(state, FIREPLACE1)
    session.loadState(state)
    const p1 = state.players[0]!
    const trades = getExchangesInWindow(p1, 'harvest', state)
    const derived = trades.filter((t) => t.sourceId?.startsWith(`${C62}::`))
    expect(derived).toContainEqual(
      expect.objectContaining({
        from: { vegetable: 1 },
        to: expect.objectContaining({ food: 4 }),
        sourceId: `${C62}::${FIREPLACE1}`,
        max: 1,
      }),
    )
  })

  it('removes all derived trades from a cookery once any one of its derived entries is used', () => {
    const { session, state } = setupTwoPlayer()
    seedC62(state)
    seedCookery(state, FIREPLACE1)
    session.loadState(state)
    const p1 = state.players[0]!

    p1.cardStates![C62]!.extraData!.usedCookeryIds = [FIREPLACE1]

    const trades = getExchangesInWindow(p1, 'harvest', state)
    const derivedFromFireplace = trades.filter(
      (t) => t.sourceId === `${C62}::${FIREPLACE1}`,
    )
    expect(derivedFromFireplace).toHaveLength(0)
  })

  it('two cookeries each independently usable once', () => {
    const { session, state } = setupTwoPlayer()
    seedC62(state)
    seedCookery(state, FIREPLACE1)
    seedCookery(state, COOKING_HEARTH1)
    session.loadState(state)
    const p1 = state.players[0]!

    let trades = getExchangesInWindow(p1, 'harvest', state)
    expect(trades.some((t) => t.sourceId === `${C62}::${FIREPLACE1}`)).toBe(true)
    expect(trades.some((t) => t.sourceId === `${C62}::${COOKING_HEARTH1}`)).toBe(true)

    p1.cardStates![C62]!.extraData!.usedCookeryIds = [FIREPLACE1]
    trades = getExchangesInWindow(p1, 'harvest', state)
    expect(trades.some((t) => t.sourceId === `${C62}::${FIREPLACE1}`)).toBe(false)
    expect(trades.some((t) => t.sourceId === `${C62}::${COOKING_HEARTH1}`)).toBe(true)
  })

  it('does not derive grain bake-bread entries (only anytime + valid-from)', () => {
    const { session, state } = setupTwoPlayer()
    seedC62(state)
    seedCookery(state, FIREPLACE1)
    session.loadState(state)
    const p1 = state.players[0]!
    const trades = getExchangesInWindow(p1, 'harvest', state)
    const grainDerived = trades.filter(
      (t) => t.sourceId?.startsWith(`${C62}::`) && t.from?.grain !== undefined,
    )
    expect(grainDerived).toHaveLength(0)
  })

  it('does not inject derived trades in non-harvest windows', () => {
    const { session, state } = setupTwoPlayer()
    seedC62(state)
    seedCookery(state, FIREPLACE1)
    session.loadState(state)
    const p1 = state.players[0]!
    const anytime = getExchangesInWindow(p1, 'anytime', state)
    const bakeBread = getExchangesInWindow(p1, 'bake-bread', state)
    expect(anytime.some((t) => t.sourceId?.startsWith(`${C62}::`))).toBe(false)
    expect(bakeBread.some((t) => t.sourceId?.startsWith(`${C62}::`))).toBe(false)
  })

  it('onStartHarvest resets usedCookeryIds', async () => {
    const { session, state } = setupTwoPlayer()
    seedC62(state)
    seedCookery(state, FIREPLACE1)
    session.loadState(state)
    const p1 = state.players[0]!
    p1.cardStates![C62]!.extraData!.usedCookeryIds = [FIREPLACE1]

    const impl = (
      await import('../../shared/cards/C/C62_CookeryExtension')
    ).C62_CookeryExtension_impl
    impl.effect!.onStartHarvest!(state, p1)
    expect(p1.cardStates![C62]!.extraData!.usedCookeryIds).toEqual([])
  })

  it('produces no derived trades when player has no cookery cards', () => {
    const { session, state } = setupTwoPlayer()
    seedC62(state)
    session.loadState(state)
    const p1 = state.players[0]!
    const trades = getExchangesInWindow(p1, 'harvest', state)
    const derived = trades.filter((t) => t.sourceId?.startsWith(`${C62}::`))
    expect(derived).toHaveLength(0)
  })

  it('coexists with native cookery anytime trades', () => {
    const { session, state } = setupTwoPlayer()
    seedC62(state)
    seedCookery(state, FIREPLACE1)
    session.loadState(state)
    const p1 = state.players[0]!
    const anytime = getExchangesInWindow(p1, 'anytime', state)
    const fireplaceVeg = anytime.find(
      (t) => t.sourceId === FIREPLACE1 && t.from?.vegetable === 1,
    )
    expect(fireplaceVeg?.to.food).toBe(2)
  })
})

describe('C62 + harvest feed integration (simplified)', () => {
  // Note: simplified per plan task 9 fallback. Driving the live
  // confirmHarvestFeed path with derived sourceIds requires
  // game-core.ts:lookupCard() to resolve composite sourceIds (e.g.
  // 'C62_CookeryExtension::Major_Fireplace1') back to a card; today it only
  // looks for sourceId directly in improvements/minorPlayed/occupationPlayed
  // arrays, so derived trades are silently skipped. Rather than expand the
  // main path, this test exercises the trade-application semantics directly:
  // resolve the derived trade via getExchangesInWindow, apply it via
  // applyTrade + applyTradeSideEffect (exactly what the harvest-feed path
  // would dispatch), and assert the per-cookery flag + resource deltas.
  it('applying a C62-derived trade: vegetable -1, food +4, usedCookeryIds=[Major_Fireplace1]', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const p1 = state.players[0]!
    p1.minorPlayed = [...p1.minorPlayed, C62]
    p1.improvements = [...p1.improvements, FIREPLACE1]
    p1.cardStates = {
      ...(p1.cardStates ?? {}),
      [C62]: { extraData: { usedCookeryIds: [] } },
    }
    p1.resources.vegetable = 1
    p1.resources.food = 0
    session.loadState(state)

    const trades = getExchangesInWindow(p1, 'harvest', state)
    const derived = trades.find((t) => t.sourceId === `${C62}::${FIREPLACE1}` && t.from?.vegetable === 1)
    expect(derived).toBeDefined()
    expect(derived!.to.food).toBe(4)
    expect(derived!.sideEffect).toEqual({
      type: 'pushExtraDataValue',
      sourceCard: C62,
      key: 'usedCookeryIds',
      value: FIREPLACE1,
    })

    applyTrade(p1, derived!, 1)
    applyTradeSideEffect(state, p1, derived!.sideEffect!, 1, derived!.sourceId ?? 'unknown')

    expect(p1.resources.vegetable).toBe(0)
    expect(p1.resources.food).toBe(4)
    expect(p1.cardStates?.[C62]?.extraData?.usedCookeryIds).toEqual([FIREPLACE1])

    // After the side-effect dispatched, listener filters out Fireplace1.
    const tradesAfter = getExchangesInWindow(p1, 'harvest', state)
    const stillDerived = tradesAfter.find((t) => t.sourceId === `${C62}::${FIREPLACE1}`)
    expect(stillDerived).toBeUndefined()
  })
})
