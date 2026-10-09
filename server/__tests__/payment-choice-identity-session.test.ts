import { describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import type { SessionResponse } from '../game/authoritative-session'

const CARD = '__test_stale_payment_menu__'
const choiceOptions = (r: SessionResponse) =>
  r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' ? r.interaction.request.options : []
const paid = (option: { labelParams?: Record<string, unknown> }) => JSON.stringify(Object.fromEntries(
  Object.entries((option.labelParams?.resourcesPaid ?? {}) as Record<string, number>).filter(([, amount]) => amount > 0)))

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
    session.withCtx(() => requireActiveCardRegistry('stale payment menu').registerListener({
      id: `${CARD}:after`, cardIds: [CARD], phases: ['after'], actions: ['place-farmer'], mandatory: true,
      handler: (ctx) => ctx.space?.id !== 'forest' ? undefined : {
        sourceCard: CARD,
        flow: { type: 'leaf', actionId: 'pay', sourceCard: CARD, params: { cost: { fees: [{ food: 1 }, { grain: 1 }, { reed: 1 }] } } },
      },
    }))

    let r = session.takeAction(0, 'forest')
    expect(choiceOptions(r).map(paid)).toEqual(['{"reed":1}', '{"grain":1}'])
    const grain = choiceOptions(r).find((option) => paid(option) === '{"grain":1}')!

    r = session.takeAnytimeAction(0, 'exchange')
    expect(r.ok, r.error).toBe(true)
    r = session.resolveChoice(0, 'trade:3:1') // Fireplace: 1 vegetable -> 2 food
    expect(r.ok, r.error).toBe(true)
    // The issued menu is still shown unchanged.
    expect(choiceOptions(r).map(paid)).toEqual(['{"reed":1}', '{"grain":1}'])

    const before = structuredClone(r.state.players[0]!.resources)
    r = session.resolveChoice(0, grain.value)
    const after = r.state.players[0]!.resources
    // Before the fix: ok=true and 1 food was paid instead of the selected grain.
    expect(r.ok, r.error).toBe(true)
    expect(after.food).toBe(before.food)
    expect(after.grain).toBe(before.grain - 1)
  })

  it('rejects a payment that is no longer available and keeps the menu for another choice', () => {
    const session = createWorkSession({ configure: (state) => {
      const player = state.players[0]!
      player.minorPlayed = [CARD]
      player.resources = { ...player.resources, food: 0, clay: 1, reed: 1, grain: 0 }
    } })
    session.withCtx(() => {
      const registry = requireActiveCardRegistry('stale payment menu')
      registry.registerListener({
        id: `${CARD}:after`, cardIds: [CARD], phases: ['after'], actions: ['place-farmer'], mandatory: true,
        handler: (ctx) => ctx.space?.id !== 'forest' ? undefined : {
          sourceCard: CARD,
          flow: { type: 'leaf', actionId: 'pay', sourceCard: CARD, params: { cost: { fees: [{ clay: 1 }, { reed: 1 }, { grain: 1 }] } } },
        },
      })
      // Stand-in for an anytime ability that spends the clay.
      registry.registerListener({
        id: `${CARD}:spend-clay`, cardIds: [CARD], phases: ['anytime'],
        handler: ({ player }) => (player.resources.clay ?? 0) > 0
          ? { labelKey: 'ui.yes', flow: { type: 'leaf', actionId: 'pay', sourceCard: CARD, params: { cost: { clay: 1 } } } }
          : undefined,
      })
    })

    let r = session.takeAction(0, 'forest')
    expect(choiceOptions(r).map(paid)).toEqual(['{"clay":1}', '{"reed":1}'])
    const clay = choiceOptions(r).find((option) => paid(option) === '{"clay":1}')!
    r = session.takeAnytimeAction(0, `${CARD}:spend-clay`)
    expect(r.ok, r.error).toBe(true)
    expect(r.state.players[0]!.resources.clay).toBe(0)

    const before = structuredClone(r.state.players[0]!.resources)
    r = session.resolveChoice(0, clay.value)
    expect(r.ok).toBe(false)
    expect(r.state.players[0]!.resources).toEqual(before)
    expect(choiceOptions(r).map(paid)).toEqual(['{"clay":1}', '{"reed":1}'])

    const reed = choiceOptions(r).find((option) => paid(option) === '{"reed":1}')!
    r = session.resolveChoice(0, reed.value)
    expect(r.ok, r.error).toBe(true)
    expect(r.state.players[0]!.resources).toMatchObject({ clay: 0, reed: 0 })
  })
})
