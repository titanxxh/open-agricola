import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import type { CardListenerRegistration } from '../../shared/cards/card-listeners'
import { isActionVetoedInFlowContext } from '../../shared/actions/flow'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { autoAdvanceRoundEnd } from './_helpers/round-end'

const CARD = '__runtime_listener__'
const sessions: ReturnType<typeof createWorkSession>[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const game = (options: Parameters<typeof createWorkSession>[0] = {}) => {
  const session = createWorkSession({ ...options, configure: state => {
    state.players[0]!.minorPlayed = [CARD]
    options.configure?.(state)
  } })
  sessions.push(session)
  session.actionHooks.register({ id: 'test:plow-veto', actions: ['plow'], phases: ['isDoable'], handler: () => ({ doable: false }) })
  return session
}
const install = (session: ReturnType<typeof game>, action: string, phase: NonNullable<CardListenerRegistration['phases']>[number], handler: (vetoed: boolean, context: Parameters<NonNullable<CardListenerRegistration['handler']>>[0]) => ReturnType<NonNullable<CardListenerRegistration['handler']>>) => {
  session.withCtx(() => requireActiveCardRegistry('specialized listener test').registerListener({
    id: `${CARD}:${phase}`, cardIds: [CARD], actions: [action], phases: [phase],
    handler: context => handler(isActionVetoedInFlowContext({ ...context, actionId: 'plow' }), context),
  }))
}
const bonus = (vetoed: boolean) => vetoed ? { flow: { type: 'leaf' as const, actionId: 'gain', sourceCard: CARD, params: { stone: 1 } } } : undefined

describe('specialized listeners retain the owning generic rules', () => {
  it('uses the veto when injecting an improvement candidate', () => {
    const session = game({ configure: state => { state.players[0]!.resources.clay = 3 } })
    install(session, 'improvement', 'computeChoiceCandidates', vetoed => ({ extraOptions: vetoed
      ? [{ value: 'Major_Fireplace1', labelKey: 'cards.Major_Fireplace1.name' }] : [] }))
    let offered = session.takeAction(0, 'meeting-place')
    expect(offered.ok, offered.error).toBe(true)
    if (offered.interaction.stateId === 'wait' && offered.interaction.request.kind === 'choice') {
      const minor = offered.interaction.request.options.find(option => option.value.startsWith('action-improvement-'))
      if (minor) offered = session.resolveChoice(0, minor.value)
    }
    const bought = offered
    expect(bought.ok, bought.error).toBe(true)
    expect(bought.state.players[0]!.improvements).toContain('Major_Fireplace1')
    expect(bought.state.players[0]!.resources.clay).toBe(1)
  })

  it('uses the veto when admitting a specific occupation choice', () => {
    const session = game({ configure: state => {
      state.players[0]!.occupationHand = ['A102_Grocer']
      state.players[0]!.resources.food = 5
    } })
    install(session, 'occupation', 'isDoable', (vetoed, context) => context.choice ? { doable: !vetoed } : undefined)
    const rejected = session.takeAction(0, 'lessons')
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players[0]!.occupationPlayed).not.toContain('A102_Grocer')
    expect(rejected.state.players[0]!.resources.food).toBe(5)
  })

  it('keeps the veto while Taps contributes a Moor purchase as an extra turn', () => {
    const session = game({ options: { enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true }, configure: state => {
      const owner = state.players[0]!
      owner.minorPlayed.push('M057_Taps')
      owner.resources.clay = 2
      owner.resources.food = 10
      owner.resources.fuel = 10
      markAllWorkersUsed(state, owner)
      state.currentPlayerIndex = 1
    } })
    const blackMarket = session.state.farmersOfTheMoor!.specialActionCards.find(card => card.actions.includes('black-market'))!
    session.state.farmersOfTheMoor!.specialActionCards = [{ ...blackMarket, actions: ['black-market'] }]
    install(session, 'improvement', 'computeChoiceCandidates', vetoed => ({ extraOptions: vetoed
      ? [{ value: 'Major_Fireplace1', labelKey: 'cards.Major_Fireplace1.name' }] : [] }))
    const placed = session.takeAction(1, 'forest')
    expect(placed.ok, placed.error).toBe(true)
    const bought = confirmNextPlayer(session)
    expect(bought.ok, bought.error).toBe(true)
    expect(bought.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'confirm-next-player', nextPlayerIndex: 1 } })
    expect(bought.state.players[0]!.cardStates?.M057_Taps?.extraData?.usedThisRound).toBe(true)
    expect(bought.state.players[0]!.improvements).toContain('Major_Fireplace1')
    expect(bought.state.players[0]!.resources).toMatchObject({ clay: 0, fuel: 9 })
  })

  it('uses the veto in per-card purchase cost queries', () => {
    const session = game({ configure: state => {
      state.players[0]!.occupationHand = ['A102_Grocer']
      state.players[0]!.occupationPlayed = ['__existing_occupation__']
      state.players[0]!.resources.food = 0
    } })
    install(session, 'occupation', 'computeCosts', (vetoed, context) => context.cardId ? { costs: { food: vetoed ? -1 : 0 } } : undefined)
    const played = session.takeAction(0, 'lessons')
    expect(played.ok, played.error).toBe(true)
    expect(played.state.players[0]!.occupationPlayed).toContain('A102_Grocer')
    expect(played.state.players[0]!.resources.food).toBe(0)
  })

  it('uses the veto when deriving an exchange catalog', () => {
    const session = game({ configure: state => { state.players[0]!.resources.wood = 1 } })
    install(session, 'compute-exchanges', 'computeExchanges', vetoed => ({ extraExchanges: vetoed
      ? [{ from: { wood: 1 }, to: { food: 2 }, triggers: ['anytime'] }] : [] }))
    const offered = session.takeAnytimeAction(0, 'exchange')
    expect(offered.ok, offered.error).toBe(true)
    if (offered.interaction.stateId !== 'wait' || offered.interaction.request.kind !== 'choice') throw new Error('Expected derived trade')
    const option = offered.interaction.request.options.find(option => option.value.startsWith('trade:') && option.sourceCard === CARD)
    expect(option).toBeDefined()
    const food = offered.state.players[0]!.resources.food
    const traded = session.resolveChoice(0, option!.value)
    expect(traded.ok, traded.error).toBe(true)
    expect(traded.state.players[0]!.resources).toMatchObject({ wood: 0, food: food + 2 })
  })

  it('uses the veto after a trade settles', () => {
    const session = game({ configure: state => {
      state.players[0]!.improvements = ['Major_Fireplace1']
      state.players[0]!.resources.vegetable = 1
    } })
    install(session, 'trade-applied', 'immediatelyAfter', bonus)
    const offered = session.takeAnytimeAction(0, 'exchange')
    expect(offered.ok, offered.error).toBe(true)
    if (offered.interaction.stateId !== 'wait' || offered.interaction.request.kind !== 'choice') throw new Error('Expected cooking trade')
    const option = offered.interaction.request.options.find(option => option.value.startsWith('trade:'))!
    const traded = session.resolveChoice(0, option.value)
    expect(traded.ok, traded.error).toBe(true)
    expect(traded.state.players[0]!.resources).toMatchObject({ vegetable: 0, stone: 1 })
  })

  it('uses the veto after the Harvest field is reaped', () => {
    const session = game({ configure: state => {
      state.round = 4
      state.players.forEach(player => { markAllWorkersUsed(state, player); player.resources.food = 20 })
      state.players[0]!.fields = [{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 2 }] }]
    } })
    install(session, 'reap', 'immediatelyAfter', bonus)
    const harvested = autoAdvanceRoundEnd(session)
    expect(harvested.ok, harvested.error).toBe(true)
    expect(harvested.state.round).toBe(5)
    expect(harvested.state.players[0]!.resources).toMatchObject({ grain: 1, stone: 1 })
  })

  it.each(['before', 'after'] as const)('uses the veto for a Moor %s reaction', phase => {
    const session = game({ options: { enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true } })
    install(session, 'moor-action', phase, bonus)
    const card = session.state.farmersOfTheMoor!.specialActionCards.find(card => card.actions.includes('hiring-fair'))!
    const hired = session.takeSpecialAction(0, card.id, 'hiring-fair')
    expect(hired.ok, hired.error).toBe(true)
    expect(hired.state.players[0]!.resources.stone).toBe(1)
  })
})
