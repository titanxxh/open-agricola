import { describe, it, expect } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getExchangesInWindow } from '../../shared/actions/effects/exchange'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C062_CookeryExtension'

const C62 = 'C062_CookeryExtension'
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
      await import('../../shared/cards/C/C062_CookeryExtension')
    ).C062_CookeryExtension_impl
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

describe('C62 + harvest feed integration', () => {
  it('does not open a feed wait when its only derived harvest trades are unaffordable', () => {
    const session = new GameSession(62)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4
    state.roundPhase = 'work'
    for (const player of state.players) {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 0)
      player.resources.food = 0
    }
    const player = state.players[0]!
    setActiveWorkerCount(player, 1)
    seedC62(state, player.id)
    seedCookery(state, FIREPLACE1, player.id)
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.interaction.stateId === 'wait'
      && response.interaction.request.kind === 'feed'
      && response.interaction.playerIndex === 0).toBe(false)
    expect(response.state.players[0]!.resources.begging).toBe(2)
  })

  const setupFeed = () => {
    const session = new GameSession(6200, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.round = 4
    state.roundPhase = 'work'
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 0)
      player.resources.food = 20
    })
    const player = state.players[0]!
    setActiveWorkerCount(player, 1)
    player.resources.food = 0
    player.resources.vegetable = 1
    seedC62(state, player.id)
    seedCookery(state, FIREPLACE1, player.id)
    session.loadState(state)
    let offered = session.performRoundEnd()
    if (
      offered.interaction.stateId === 'wait'
      && offered.interaction.request.kind === 'choice'
      && offered.interaction.request.options?.some((option) => option.value === '__skip__')
    ) {
      offered = session.resolveChoice(offered.interaction.playerIndex, '__skip__')
    }
    expect(offered.interaction).toMatchObject({
      stateId: 'wait',
      playerIndex: 0,
      request: { kind: 'feed' },
    })
    if (offered.interaction.stateId !== 'wait' || offered.interaction.request.kind !== 'feed') {
      throw new Error('expected C62 harvest feed')
    }
    const exchange = offered.interaction.request.exchangeCatalog?.find((entry) =>
      entry.sourceId === `${C62}::${FIREPLACE1}` && entry.from.vegetable === 1,
    )
    expect(exchange).toMatchObject({ from: { vegetable: 1 }, to: { food: 4 }, max: 1 })
    return { session, offered, exchange: exchange! }
  }

  it('executes the doubled exchange through the authoritative feed command', () => {
    const { session, exchange } = setupFeed()
    const response = session.resolveChoice(0, 'confirm', { selections: [{
      sourceId: exchange.sourceId, exchangeIndex: exchange.exchangeIndex, count: 1,
    }] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 0, food: 2, begging: 0 })
    expect(response.state.players[0]!.cardStates?.[C62]?.extraData?.usedCookeryIds).toEqual([FIREPLACE1])
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'harvest.feedConverted', source: `${C62}::${FIREPLACE1}`,
      cost: { vegetable: 1 }, food: { food: 4 },
    }))
  })

  it('rejects a forged or over-limit derived source atomically and permits retry', () => {
    const { session, offered, exchange } = setupFeed()
    const before = JSON.stringify({ state: offered.state, interaction: offered.interaction })
    const forged = session.resolveChoice(0, 'confirm', { selections: [{
      sourceId: `${C62}::Major_Fireplace2`, exchangeIndex: exchange.exchangeIndex, count: 1,
    }] })
    expect(forged.ok).toBe(false)
    expect(JSON.stringify({ state: forged.state, interaction: forged.interaction })).toBe(before)

    const duplicate = session.resolveChoice(0, 'confirm', { selections: [
      { sourceId: exchange.sourceId, exchangeIndex: exchange.exchangeIndex, count: 1 },
      { sourceId: exchange.sourceId, exchangeIndex: exchange.exchangeIndex, count: 1 },
    ] })
    expect(duplicate.ok).toBe(false)
    expect(JSON.stringify({ state: duplicate.state, interaction: duplicate.interaction })).toBe(before)

    const accepted = session.resolveChoice(0, 'confirm', { selections: [{
      sourceId: exchange.sourceId, exchangeIndex: exchange.exchangeIndex, count: 1,
    }] })
    expect(accepted.ok, accepted.error).toBe(true)
    expect(accepted.state.players[0]!.resources.vegetable).toBe(0)
  })
})
