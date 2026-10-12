import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { Engine, ActionRegistry, HookDispatcher, LogStore } from '../../shared/engine'
import { createInternalActionDefinitions } from '../../shared/actions/internal-actions'
import { ensureCardModifiers } from '../../shared/cards/card-modifiers'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import type { ChoiceEffectPreview } from '../../shared/contract/types'

const sessions: ReturnType<typeof createWorkSession>[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const target = 'A123_FrameBuilder'
const other = 'B121_Geologist'
const setup = (food = 0, wood = 1, hand = [target]) => {
  const session = createWorkSession({ seed: 5109, configure: state => {
    const player = state.players[0]!
    player.occupationPlayed = ['B109_PaperMaker']
    player.occupationHand = hand
    Object.assign(player.resources, { food, wood })
  } })
  sessions.push(session)
  return session
}
const preview = (session: ReturnType<typeof createWorkSession>, params?: Record<string, unknown>, base = false) => session.withCtx(() => {
  const state = session.state
  const player = state.players[0]!
  const space = state.actionSpaces.find(candidate => candidate.id === 'lessons')!
  const registry = new ActionRegistry()
  for (const definition of [...state.actionSpaces, ...createInternalActionDefinitions(id => registry.get(id))]) registry.register(definition)
  return Engine.fromFlow({ type: 'leaf', actionId: 'occupation', params }, { registry, hooks: new HookDispatcher(), log: new LogStore() }, player.id)
    .describe({ state, player, space, previewMode: base ? 'base' : undefined })
})
const paymentPreviews = (effect?: ChoiceEffectPreview): Extract<ChoiceEffectPreview, { kind: 'payment' }>[] => {
  if (effect?.kind === 'payment') return [effect]
  if (effect?.kind !== 'rule') return []
  const description = effect.description
  return description.kind === 'group' ? description.parts.flatMap(part => part.kind === 'action' ? paymentPreviews(part.effectPreview) : []) : []
}

describe('occupation fees come from the actual payment plan', () => {
  it('shows Paper Maker wood payment in both action and card choice, then pays exactly that wood', () => {
    const session = setup(0, 1, [target, other])
    const before = JSON.stringify(session.state)
    for (let attempt = 0; attempt < 3; attempt++) expect(preview(session)).toMatchObject({ kind: 'action', effectPreview: { kind: 'payment', resourcesPaid: { wood: 1, food: 0 }, sourceCards: ['B109_PaperMaker'] } })
    expect(JSON.stringify(session.state)).toBe(before)
    const opening = session.takeAction(0, 'lessons')
    expect(opening.interaction.stateId).toBe('wait')
    if (opening.interaction.stateId !== 'wait') throw new Error('Missing occupation choice')
    expect(opening.interaction.request.options?.find(option => option.value === target)?.descriptionPreview).toMatchObject({ kind: 'action', labelKey: `occupations.${target}.name`, effectPreview: { kind: 'payment', resourcesPaid: { wood: 1, food: 0 } } })
    const response = session.resolveChoice(0, target)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(target)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 0 })
    expect(response.state.events.some(event => event.type === 'resource.paid' && event.resources.wood === 1 && event.bonusSources?.includes('B109_PaperMaker'))).toBe(true)
    expect(response.state.log.length).toBeGreaterThan(0)
    expect(response.scores).toBeDefined()
  })
  it('retains both affordable food and wood payment choices instead of selecting a guessed price', () => {
    const session = setup(1, 1)
    const description = preview(session)
    if (description?.kind !== 'action') throw new Error('Missing occupation action description')
    const payments = paymentPreviews(description.effectPreview)
    expect(payments).toHaveLength(2)
    expect(payments.map(payment => ({ food: payment.resourcesPaid.food ?? 0, wood: payment.resourcesPaid.wood ?? 0 }))).toEqual(expect.arrayContaining([{ food: 1, wood: 0 }, { food: 0, wood: 1 }]))
    const waiting = session.takeAction(0, 'lessons')
    expect(waiting.interaction.stateId).toBe('wait')
    if (waiting.interaction.stateId !== 'wait') throw new Error('Missing payment choice')
    expect(waiting.interaction.promptKey).toBe('prompt.selectPayment')
    const food = waiting.interaction.request.options?.find(option => option.effectPreview?.kind === 'payment' && option.effectPreview.resourcesPaid.food === 1)
    if (!food) throw new Error('Missing food payment')
    const response = session.resolveChoice(0, food.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 1 })
    expect(response.state.events.some(event => event.type === 'resource.paid' && event.resources.food === 1)).toBe(true)
  })
  it('uses existing active modifier trades and exact-cost input through the same solver', () => {
    const session = setup(0, 2)
    session.withCtx(() => {
      const player = session.state.players[0]!
      player.occupationPlayed = [other]
      player.minorPlayed = ['A028_ForestSchool']
      ensureCardModifiers(player, 'A028_ForestSchool')
    })
    expect(preview(session, { exactCost: { food: 2 }, allowedCards: [target] })).toMatchObject({ kind: 'action', effectPreview: { kind: 'payment', resourcesPaid: { wood: 2, food: 0 } } })
    expect(preview(session)).toMatchObject({ kind: 'action', effectPreview: { kind: 'payment', resourcesPaid: { wood: 1, food: 0 } } })
    const response = session.takeAction(0, 'lessons')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 1 })
    expect(response.state.players[0]!.occupationPlayed).toContain(target)
  })
  it('keeps card-dependent fees as named branches, while base rules reveal no hand cards', () => {
    const session = setup(2, 0, [target, other])
    session.withCtx(() => requireActiveCardRegistry('occupation payment preview').registerListener({
      id: 'test-occupation-target-dependent-cost', cardIds: ['B109_PaperMaker'], actions: ['occupation'], phases: ['computeCosts'],
      handler: context => context.cardId === other ? { costs: { food: 1 } } : undefined,
    }))
    const description = preview(session)
    if (description?.kind !== 'action' || description.effectPreview?.kind !== 'rule' || description.effectPreview.description.kind !== 'group') throw new Error('Missing target-dependent fee branches')
    expect(description.effectPreview.description).toMatchObject({ operator: 'xor', parts: [
      { labelKey: `occupations.${target}.name`, effectPreview: { kind: 'payment', resourcesPaid: { food: 1 } } },
      { labelKey: `occupations.${other}.name`, effectPreview: { kind: 'payment', resourcesPaid: { food: 2 } } },
    ] })
    expect(JSON.stringify(preview(session, undefined, true))).not.toContain(target)
    expect(preview(session, undefined, true)).toMatchObject({ kind: 'action', effectPreview: { kind: 'occupationFees', food: [0, 1] } })
    expect(preview(session, { allowedCards: [target] })).toMatchObject({ kind: 'action', effectPreview: { kind: 'payment', resourcesPaid: { food: 1 } } })
    const opening = session.takeAction(0, 'lessons')
    expect(opening.interaction.stateId).toBe('wait')
    const response = session.resolveChoice(0, other)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.occupationPlayed).toContain(other)
  })
  it('describes and consumes a card-provided payment resource without charging the player food', () => {
    const session = setup(0, 0)
    const source = '__test_OccupationPaymentProvider__'
    const resource = '__test_OccupationPaymentProvider__:forest-wood' as const
    const forest = session.state.actionSpaces.find(space => space.id === 'forest')!
    session.state.players[0]!.occupationPlayed = [source]
    forest.resources.wood = 2
    session.withCtx(() => requireActiveCardRegistry('occupation provider preview').registerListener({
      id: 'test-occupation-payment-resource', cardIds: [source], actions: ['occupation'], phases: ['computeCosts'],
      handler: context => ({ paymentResourceProviders: [{
        key: resource, sourceCard: source, available: context.state.actionSpaces.find(space => space.id === 'forest')!.resources.wood,
        covers: [{ resource: 'food', costAmount: 1, paymentAmount: 1 }],
        consume: { type: 'actionSpace', spaceId: 'forest', resource: 'wood' },
      }] }),
    }))
    expect(preview(session)).toMatchObject({ kind: 'action', effectPreview: { kind: 'payment', resourcesPaid: { [resource]: 1, food: 0 }, sourceCards: [source] } })
    const response = session.takeAction(0, 'lessons')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(target)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.actionSpaces.find(space => space.id === 'forest')!.resources.wood).toBe(1)
    expect(response.state.events.some(event => event.type === 'resource.paid' && event.resources[resource] === 1)).toBe(true)
  })
  it('does not describe or play an occupation when no payment is affordable', () => {
    const session = setup(0, 0)
    const description = preview(session)
    expect(description).toMatchObject({ kind: 'action', labelKey: 'actions.lessons.name' })
    if (description?.kind === 'action') expect(description.effectPreview).toBeUndefined()
    const response = session.takeAction(0, 'lessons')
    expect(response.ok).toBe(false)
    expect(response.state.players[0]!.occupationPlayed).not.toContain(target)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 0 })
  })
})
