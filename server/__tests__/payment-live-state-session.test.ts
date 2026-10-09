import { describe, expect, it } from 'vitest'
import type { ActionFlow, ComplexCost, GameState } from '../../shared/contract/types'
import type { SessionResponse } from '../game/authoritative-session'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { createWorkSession } from './_helpers/session-fixtures'

const CARD = 'Test_Provider'

const provider = (suffix: string) => ({
  key: `${CARD}:${suffix}` as const,
  sourceCard: CARD,
  available: 1,
  covers: [{ resource: 'food' as const, costAmount: 1, paymentAmount: 1 }],
  consume: { type: 'actionSpace' as const, spaceId: 'clay-pit', resource: 'clay' as const },
})

/** After Forest, the test card asks the player to pay `cost`. */
const setup = (cost: ComplexCost, configure: (state: GameState) => void, optional = false) => {
  const session = createWorkSession({ configure: (state) => {
    state.players[0]!.minorPlayed = [CARD]
    configure(state)
  } })
  const flow: ActionFlow = { type: 'leaf', actionId: 'pay', sourceCard: CARD, params: { cost }, ...(optional ? { optional: true } : {}) }
  session.withCtx(() => requireActiveCardRegistry('live payment state').registerListener({
    id: `${CARD}:after-forest`, cardIds: [CARD], phases: ['after'], actions: ['place-farmer'], mandatory: true,
    handler: (context) => context.space?.id !== 'forest' ? undefined : { sourceCard: CARD, flow },
  }))
  return session
}

const paid = (option: { labelParams?: Record<string, unknown> }) => Object.fromEntries(
  Object.entries((option.labelParams?.resourcesPaid ?? {}) as Record<string, number>).filter(([, amount]) => amount > 0))
const menu = (r: SessionResponse) =>
  r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' ? r.interaction.request.options : []
const waiting = (r: SessionResponse) => r.interaction.stateId === 'wait'
  ? { kind: r.interaction.request.kind, playerIndex: r.interaction.playerIndex }
  : { kind: r.interaction.stateId }
const logs = (r: SessionResponse, key: string) => r.state.log.filter((entry) => entry.key === key)
const clayPit = (r: SessionResponse) => r.state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay
const total = (r: SessionResponse) => r.scores?.find((score) => score.playerId === r.state.players[0]!.id)?.total

describe('payments follow live state at the Session boundary', () => {
  it('does not carry a house-type discount into another game', () => {
    const cost: ComplexCost = { fee: { clay: 3 }, bonuses: [{ discount: { clay: 1 }, conditions: { houseTypeClay: 1 } }] }
    const clayHouse = setup(cost, (state) => {
      state.players[0]!.houseType = 'clay'
      state.players[0]!.resources = { ...state.players[0]!.resources, clay: 2 }
    }, true)
    const clayBaseline = total(clayHouse.getState())
    let r = clayHouse.takeAction(0, 'forest')
    expect(r.ok, r.error).toBe(true)
    expect(waiting(r)).toEqual({ kind: 'choice', playerIndex: 0 })
    expect(r.state.players[0]!.resources.clay).toBe(2)
    expect(logs(r, 'log.cardEffectPay')).toEqual([])
    expect(total(r)).toBe(clayBaseline)
    r = clayHouse.resolveChoice(0, menu(r).find((option) => option.value !== '__skip__')!.value)
    expect(r.ok, r.error).toBe(true)
    expect(waiting(r)).toEqual({ kind: 'confirm-next-player', playerIndex: 0 })
    expect(r.state.players[0]!.resources.clay).toBe(0)
    expect(logs(r, 'log.cardEffectPay')).toEqual([expect.objectContaining({ params: expect.objectContaining({ cost: { clay: 2 } }) })])
    expect(total(r)).toBe(clayBaseline)

    // Same resources and cost in a new game, but a wood house: the bonus does not apply.
    const woodHouse = setup(cost, (state) => {
      state.players[0]!.houseType = 'wood'
      state.players[0]!.resources = { ...state.players[0]!.resources, clay: 2 }
    }, true)
    const woodBaseline = total(woodHouse.getState())
    r = woodHouse.takeAction(0, 'forest')
    expect(r.ok, r.error).toBe(true)
    // Not affordable without the bonus, so the optional payment is not offered.
    expect(waiting(r)).toEqual({ kind: 'confirm-next-player', playerIndex: 0 })
    expect(r.state.players[0]!.resources.clay).toBe(2)
    expect(logs(r, 'log.cardEffectPay')).toEqual([])
    expect(total(r)).toBe(woodBaseline)
  })

  it('offers a provider payment only while its action space can back it', () => {
    const cost: ComplexCost = { fee: { food: 1 }, paymentResourceProviders: [provider('clay')] }
    const empty = setup(cost, (state) => {
      state.players[0]!.resources = { ...state.players[0]!.resources, food: 1 }
      state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = 0
    })
    const emptyBaseline = total(empty.getState())
    let r = empty.takeAction(0, 'forest')
    // Only real food can pay, so it settles without a menu.
    expect(r.ok, r.error).toBe(true)
    expect(waiting(r)).toEqual({ kind: 'confirm-next-player', playerIndex: 0 })
    expect(r.state.players[0]!.resources.food).toBe(0)
    expect(clayPit(r)).toBe(0)
    expect(logs(r, 'log.cardEffectPay')).toEqual([expect.objectContaining({ params: expect.objectContaining({ cost: { food: 1 } }) })])
    expect(total(r)).toBe(emptyBaseline)

    const backed = setup(cost, (state) => {
      state.players[0]!.resources = { ...state.players[0]!.resources, food: 1 }
      state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = 1
    })
    const backedBaseline = total(backed.getState())
    r = backed.takeAction(0, 'forest')
    expect(r.ok, r.error).toBe(true)
    expect(waiting(r)).toEqual({ kind: 'choice', playerIndex: 0 })
    expect(menu(r).map(paid)).toEqual(expect.arrayContaining([{ food: 1 }, { [`${CARD}:clay`]: 1 }]))
    expect(r.state.players[0]!.resources.food).toBe(1)
    expect(logs(r, 'log.cardEffectPay')).toEqual([])
    expect(total(r)).toBe(backedBaseline)

    const viaProvider = menu(r).find((option) => paid(option)[`${CARD}:clay`] === 1)!
    r = backed.resolveChoice(0, viaProvider.value)
    expect(r.ok, r.error).toBe(true)
    expect(waiting(r)).toEqual({ kind: 'confirm-next-player', playerIndex: 0 })
    expect(r.state.players[0]!.resources.food).toBe(1)
    expect(clayPit(r)).toBe(0)
    expect(logs(r, 'log.cardEffectPay')).toHaveLength(1)
    expect(total(r)).toBe(backedBaseline)
  })

  it('never offers two provider keys that one backing pool cannot cover together', () => {
    const cost: ComplexCost = { fee: { food: 2 }, paymentResourceProviders: [provider('a'), provider('b')] }
    const session = setup(cost, (state) => {
      state.players[0]!.resources = { ...state.players[0]!.resources, food: 1 }
      state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = 1
    })

    const baseline = total(session.getState())
    const r = session.takeAction(0, 'forest')

    expect(r.ok, r.error).toBe(true)
    expect(waiting(r)).toEqual({ kind: 'choice', playerIndex: 0 })
    expect(menu(r).map(paid)).toEqual(expect.arrayContaining([
      { food: 1, [`${CARD}:a`]: 1 },
      { food: 1, [`${CARD}:b`]: 1 },
    ]))
    expect(menu(r).map(paid)).not.toContainEqual({ [`${CARD}:a`]: 1, [`${CARD}:b`]: 1 })
    expect(r.state.players[0]!.resources.food).toBe(1)
    expect(clayPit(r)).toBe(1)
    expect(logs(r, 'log.cardEffectPay')).toEqual([])
    expect(total(r)).toBe(baseline)
  })
})
