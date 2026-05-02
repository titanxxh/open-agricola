import { describe, it, expect } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getExchangesInWindow } from '../../shared/actions/effects/exchange'

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
