import { describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import type { SessionResponse } from '../game/authoritative-session'

const CARD = '__test_stale_payment_menu__'

const choiceOptions = (r: SessionResponse) =>
  r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' ? r.interaction.request.options : []
const paid = (option: { labelParams?: Record<string, unknown> }) => JSON.stringify(Object.fromEntries(
  Object.entries((option.labelParams?.resourcesPaid ?? {}) as Record<string, number>).filter(([, amount]) => amount > 0)))
const waiting = (r: SessionResponse) => r.interaction.stateId === 'wait'
  ? { kind: r.interaction.request.kind, playerIndex: r.interaction.playerIndex }
  : { kind: r.interaction.stateId }
const logs = (r: SessionResponse, key: string) => r.state.log.filter((entry) => entry.key === key)
const scoreOf = (r: SessionResponse, key?: string) => {
  const score = r.scores?.find((entry) => entry.playerId === r.state.players[0]!.id)
  return key ? score?.categories.find((category) => category.key === key)?.total : score?.total
}

/** After Forest, the test card asks for one of three alternative payments. */
const payAfterForest = (fees: Array<Record<string, number>>) => ({
  id: `${CARD}:after`, cardIds: [CARD], phases: ['after' as const], actions: ['place-farmer'], mandatory: true,
  handler: (ctx: { space?: { id: string } }) => ctx.space?.id !== 'forest' ? undefined : {
    sourceCard: CARD,
    flow: { type: 'leaf' as const, actionId: 'pay', sourceCard: CARD, params: { cost: { fees } } },
  },
})

describe('#1070 payment menu choice after an anytime action', () => {
  it('does not settle a different payment after Fireplace cooking', () => {
    const session = createWorkSession({ configure: (state) => {
      const player = state.players[0]!
      player.minorPlayed = [CARD]
      player.improvements = ['Major_Fireplace1']
      state.availableMajorImprovements = state.availableMajorImprovements.filter((id) => id !== 'Major_Fireplace1')
      player.resources = { ...player.resources, food: 0, reed: 1, grain: 1, vegetable: 1 }
    } })
    // Stand-in for a card cost with three alternatives (ComplexCost.fees).
    session.withCtx(() => requireActiveCardRegistry('stale payment menu').registerListener(payAfterForest([{ food: 1 }, { grain: 1 }, { reed: 1 }])))

    let r = session.takeAction(0, 'forest')
    expect(r.ok, r.error).toBe(true)
    expect(waiting(r)).toEqual({ kind: 'choice', playerIndex: 0 })
    expect(choiceOptions(r).map(paid)).toEqual(['{"reed":1}', '{"grain":1}'])
    expect(r.state.players[0]!.resources).toMatchObject({ food: 0, reed: 1, grain: 1, vegetable: 1, wood: 3 })
    expect(logs(r, 'log.placeFarmer')).toHaveLength(1)
    expect(logs(r, 'log.cardEffectPay')).toEqual([])
    expect(scoreOf(r, 'grains')).toBe(1)
    expect(scoreOf(r, 'vegetables')).toBe(1)
    const issued = choiceOptions(r).map((option) => option.value)
    const grain = choiceOptions(r).find((option) => paid(option) === '{"grain":1}')!

    r = session.takeAnytimeAction(0, 'exchange')
    expect(r.ok, r.error).toBe(true)
    expect(waiting(r)).toEqual({ kind: 'choice', playerIndex: 0 })
    expect(choiceOptions(r).map((option) => option.value)).toContain('trade:3:1')
    expect(r.state.players[0]!.resources).toMatchObject({ food: 0, vegetable: 1 })
    expect(logs(r, 'log.cardEffectPay')).toEqual([])
    expect(scoreOf(r, 'vegetables')).toBe(1)

    r = session.resolveChoice(0, 'trade:3:1') // Fireplace: 1 vegetable -> 2 food
    expect(r.ok, r.error).toBe(true)
    // The issued payment menu is shown again unchanged.
    expect(waiting(r)).toEqual({ kind: 'choice', playerIndex: 0 })
    expect(choiceOptions(r).map((option) => option.value)).toEqual(issued)
    expect(choiceOptions(r).map(paid)).toEqual(['{"reed":1}', '{"grain":1}'])
    expect(r.state.players[0]!.resources).toMatchObject({ food: 2, vegetable: 0, grain: 1, reed: 1 })
    expect(logs(r, 'log.actionDetail')).toContainEqual(expect.objectContaining({
      params: expect.objectContaining({ action: 'actions.exchange.name' }),
    }))
    expect(logs(r, 'log.cardEffectPay')).toEqual([])
    expect(scoreOf(r, 'vegetables')).toBe(-1)
    expect(scoreOf(r, 'grains')).toBe(1)

    r = session.resolveChoice(0, grain.value)
    // Before the fix: ok=true and 1 food was paid instead of the selected grain.
    expect(r.ok, r.error).toBe(true)
    expect(waiting(r)).toEqual({ kind: 'confirm-next-player', playerIndex: 0 })
    expect(r.state.players[0]!.resources).toMatchObject({ food: 2, grain: 0, reed: 1 })
    expect(logs(r, 'log.cardEffectPay')).toEqual([
      expect.objectContaining({ params: expect.objectContaining({ cost: { grain: 1 }, cardId: CARD }) }),
    ])
    expect(scoreOf(r, 'grains')).toBe(-1)
  })

  it('rejects a payment that is no longer available and keeps the menu for another choice', () => {
    const session = createWorkSession({ configure: (state) => {
      const player = state.players[0]!
      player.minorPlayed = [CARD]
      player.resources = { ...player.resources, food: 0, clay: 1, reed: 1, grain: 0 }
    } })
    session.withCtx(() => {
      const registry = requireActiveCardRegistry('stale payment menu')
      registry.registerListener(payAfterForest([{ clay: 1 }, { reed: 1 }, { grain: 1 }]))
      // Stand-in for an anytime ability that spends the clay.
      registry.registerListener({
        id: `${CARD}:spend-clay`, cardIds: [CARD], phases: ['anytime'],
        handler: ({ player }) => (player.resources.clay ?? 0) > 0
          ? { labelKey: 'ui.yes', flow: { type: 'leaf', actionId: 'pay', sourceCard: CARD, params: { cost: { clay: 1 } } } }
          : undefined,
      })
    })

    let r = session.takeAction(0, 'forest')
    expect(r.ok, r.error).toBe(true)
    expect(waiting(r)).toEqual({ kind: 'choice', playerIndex: 0 })
    expect(choiceOptions(r).map(paid)).toEqual(['{"clay":1}', '{"reed":1}'])
    expect(r.state.players[0]!.resources).toMatchObject({ clay: 1, reed: 1 })
    expect(logs(r, 'log.cardEffectPay')).toEqual([])
    const total = scoreOf(r)
    const issued = choiceOptions(r).map((option) => option.value)
    const clay = choiceOptions(r).find((option) => paid(option) === '{"clay":1}')!

    r = session.takeAnytimeAction(0, `${CARD}:spend-clay`)
    expect(r.ok, r.error).toBe(true)
    expect(waiting(r)).toEqual({ kind: 'choice', playerIndex: 0 })
    expect(choiceOptions(r).map((option) => option.value)).toEqual(issued)
    expect(r.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 1 })
    expect(logs(r, 'log.cardEffectPay')).toEqual([
      expect.objectContaining({ params: expect.objectContaining({ cost: { clay: 1 } }) }),
    ])
    expect(scoreOf(r)).toBe(total)

    r = session.resolveChoice(0, clay.value)
    expect(r.ok).toBe(false)
    expect(r.error).toBe('log.payFail')
    expect(waiting(r)).toEqual({ kind: 'choice', playerIndex: 0 })
    expect(choiceOptions(r).map((option) => option.value)).toEqual(issued)
    expect(r.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 1 })
    expect(logs(r, 'log.cardEffectPay')).toHaveLength(1)
    expect(scoreOf(r)).toBe(total)

    const reed = choiceOptions(r).find((option) => paid(option) === '{"reed":1}')!
    r = session.resolveChoice(0, reed.value)
    expect(r.ok, r.error).toBe(true)
    expect(waiting(r)).toEqual({ kind: 'confirm-next-player', playerIndex: 0 })
    expect(r.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0 })
    expect(logs(r, 'log.cardEffectPay')).toEqual([
      expect.objectContaining({ params: expect.objectContaining({ cost: { reed: 1 } }) }),
      expect.objectContaining({ params: expect.objectContaining({ cost: { clay: 1 } }) }),
    ])
    expect(scoreOf(r)).toBe(total)
  })
})
