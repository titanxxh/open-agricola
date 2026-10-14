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
  it('shows Paper Maker as a before exchange, followed by the actual food payment preview', () => {
    const session = setup(0, 1, [target, other])
    const before = JSON.stringify(session.state)
    for (let attempt = 0; attempt < 3; attempt++) {
      const description = preview(session)
      expect(description).toMatchObject({ kind: 'action', labelKey: 'actions.lessons.name' })
      if (description?.kind !== 'action') throw new Error('Missing occupation action description')
      expect(description.effectPreview).toBeUndefined()
    }
    expect(JSON.stringify(session.state)).toBe(before)
    const opening = session.takeAction(0, 'lessons')
    expect(opening.interaction.stateId).toBe('wait')
    if (opening.interaction.stateId !== 'wait' || opening.interaction.request.kind !== 'choice') throw new Error('Missing before exchange')
    const exchange = opening.interaction.request.options?.find(option => option.labelKey === 'ui.interactionResourceExchange')
    expect(exchange?.effectPreview).toEqual({ kind: 'resourceExchange', resourcesPaid: { wood: 1 }, resourcesGained: { food: 1 } })
    if (!exchange) throw new Error('Missing Paper Maker exchange')
    const supplied = session.resolveChoice(0, exchange.value)
    expect(supplied.ok, supplied.error).toBe(true)
    expect(supplied.state.players[0]!.resources).toMatchObject({ food: 1, wood: 0 })
    if (supplied.interaction.stateId !== 'wait' || supplied.interaction.request.kind !== 'choice') throw new Error('Missing occupation choice')
    expect(supplied.interaction.request.options?.find(option => option.value === target)?.descriptionPreview).toMatchObject({
      kind: 'action', labelKey: `occupations.${target}.name`, effectPreview: { kind: 'payment', resourcesPaid: { food: 1 } },
    })
    const response = session.resolveChoice(0, target)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(target)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 0 })
    expect(response.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'resource.paid', sourceCardId: 'B109_PaperMaker', paymentFor: 'cardEffect', resources: { wood: 1 } }),
      expect.objectContaining({ type: 'resource.paid', sourceCardId: target, paymentFor: 'occupation', resources: { food: 1 } }),
    ]))
    expect(response.state.log.length).toBeGreaterThan(0)
    expect(response.scores).toBeDefined()
  })
  it('keeps the optional exchange separate from the occupation food fee', () => {
    const session = setup(1, 1)
    const description = preview(session)
    if (description?.kind !== 'action') throw new Error('Missing occupation action description')
    const payments = paymentPreviews(description.effectPreview)
    expect(payments).toHaveLength(1)
    expect(payments[0]).toMatchObject({ resourcesPaid: { food: 1 } })
    const waiting = session.takeAction(0, 'lessons')
    if (waiting.interaction.stateId !== 'wait' || waiting.interaction.request.kind !== 'choice') throw new Error('Missing optional exchange')
    expect(waiting.interaction.sourceCard).toBe('B109_PaperMaker')
    expect(waiting.interaction.request.options?.some(option => option.labelKey === 'ui.interactionResourceExchange')).toBe(true)
    const skip = waiting.interaction.request.options?.find(option => option.value === '__skip__')
    if (!skip) throw new Error('Missing option to decline Paper Maker')
    const response = session.resolveChoice(0, skip.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(target)
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
