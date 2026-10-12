import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { ensureCardModifiers } from '../../shared/cards/card-modifiers'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { Engine, ActionRegistry, HookDispatcher, LogStore } from '../../shared/engine'
import { createInternalActionDefinitions } from '../../shared/actions/internal-actions'
import type { ActionFlow, ChoiceDescriptionPreview, ChoiceEffectPreview, SessionResponse } from '../../shared/contract/types'

const sessions: ReturnType<typeof createWorkSession>[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const setup = (configure?: Parameters<typeof createWorkSession>[0]['configure']) => {
  const session = createWorkSession({ seed: 78013, configure: state => {
    for (const player of state.players) Object.assign(player.resources, { food: 20, wood: 5, clay: 5, reed: 5, stone: 5 })
    configure?.(state)
  } })
  sessions.push(session)
  return session
}
const effects = (description?: ChoiceDescriptionPreview): ChoiceEffectPreview[] => {
  if (!description) return []
  if (description.kind === 'conditional') return effects(description.body)
  if (description.kind === 'group') return description.parts.flatMap(effects)
  return description.effectPreview?.kind === 'rule' ? effects(description.effectPreview.description) : description.effectPreview ? [description.effectPreview] : []
}
const options = (response: SessionResponse) => response.interaction.stateId === 'wait' ? response.interaction.request.options ?? [] : []
const describeFlow = (session: ReturnType<typeof createWorkSession>, flow: ActionFlow) => session.withCtx(() => {
  const state = session.state
  const registry = new ActionRegistry()
  for (const definition of [...state.actionSpaces, ...createInternalActionDefinitions(id => registry.get(id))]) registry.register(definition)
  return Engine.fromFlow(flow, { registry, hooks: new HookDispatcher(), log: new LogStore() }, state.players[0]!.id)
    .describe({ state, player: state.players[0]!, space: state.actionSpaces.find(space => space.id === 'meeting-place')! })
})
const enterCardPurchase = (session: ReturnType<typeof createWorkSession>) => {
  let response = session.takeAction(0, 'meeting-place')
  const branch = options(response).find(option => option.value.startsWith('action-improvement-'))
  if (branch) response = session.resolveChoice(0, branch.value)
  return response
}

describe('integrated action prices agree with authoritative execution', () => {
  it('E013 displays its discounted renovation fee and actual anytime pays the same fee', () => {
    const session = setup(state => {
      const player = state.players[0]!
      player.houseType = 'clay'
      player.minorPlayed = ['E013_StoneHouseReconstruction']
      player.occupationPlayed = ['A143_Stonecutter']
    })
    session.withCtx(() => ensureCardModifiers(session.state.players[0]!, 'A143_Stonecutter'))
    const started = session.takeAction(0, 'farmland')
    const entry = started.interaction.anytimeActions.find(action => action.id === 'E13-stone-house-reconstruction-anytime')!
    expect(effects(entry.descriptionPreview)).toContainEqual(expect.objectContaining({ kind: 'payment', resourcesPaid: expect.objectContaining({ stone: 1, reed: 1 }) }))
    const response = session.takeAnytimeAction(0, entry.id)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('stone')
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 4, reed: 4 })
    expect(response.state.events.some(event => event.type === 'resource.paid' && event.paymentFor === 'renovation' && event.resources.stone === 1 && event.resources.reed === 1)).toBe(true)
    expect(response.state.actionSpaces.find(space => space.id === 'house-redevelopment')!.takenBy).toHaveLength(0)
    expect(response.state.log.length).toBeGreaterThan(0)
    expect(response.scores).toBeDefined()
  })
  it('E014 displays each room payment alternative and its real selection pays the selected discounted cost', () => {
    const session = setup(state => {
      state.players[0]!.minorPlayed = ['E014_WoodSaw', 'B013_CarpentersParlor']
      state.players[0]!.resources.reed = 2
      setActiveWorkerCount(state.players[1]!, 3)
    })
    const started = session.takeAction(0, 'farmland')
    const entry = started.interaction.anytimeActions.find(action => action.id === 'E14-wood-saw-anytime')!
    const cost = effects(entry.descriptionPreview).find(effect => effect.kind === 'actionCosts')
    if (cost?.kind !== 'actionCosts') throw new Error('Missing room cost alternatives')
    expect(cost.options.find(option => option.amount === 1)?.paymentOptions).toEqual(expect.arrayContaining([expect.objectContaining({ resourcesPaid: expect.objectContaining({ wood: 2, reed: 2 }) })]))
    let response = session.takeAnytimeAction(0, entry.id)
    const accept = options(response).find(option => option.value !== '__skip__')
    if (accept) response = session.resolveChoice(0, accept.value)
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') throw new Error('Missing room farm selection')
    response = session.commitSelectionChoice(0, { rooms: [response.interaction.request.farm.selectableTiles[0]!] })
    if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'prompt.selectPayment') {
      const selected = options(response).find(option => option.effectPreview?.kind === 'payment' && option.effectPreview.resourcesPaid.wood === 2)
      if (!selected) throw new Error('Missing discounted room payment')
      response = session.resolveChoice(0, selected.value)
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, reed: 0 })
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.events.some(event => event.type === 'resource.paid' && event.paymentFor === 'construct' && event.resources.wood === 2 && event.resources.reed === 2)).toBe(true)
    expect(response.state.actionSpaces.find(space => space.id === 'farm-expansion')!.takenBy).toHaveLength(0)
  })
  it('Grain Depot card option keeps each payment tied to its actual future purchase effect', () => {
    const session = setup(state => {
      state.players[0]!.minorHand = ['B065_GrainDepot', 'A019_Handplow']
    })
    const description = describeFlow(session, { type: 'leaf', actionId: 'improvement', params: { types: ['minor'], allowedPurchases: ['B065_GrainDepot'] } })
    const previews = effects(description)
    expect(previews.filter(effect => effect.kind === 'payment')).toHaveLength(3)
    expect(previews.filter(effect => effect.kind === 'futureSchedule')).toMatchObject([
      { entries: [{ round: 2, endRound: 3, resources: { grain: 1 } }] },
      { entries: [{ round: 2, endRound: 4, resources: { grain: 1 } }] },
      { entries: [{ round: 2, endRound: 5, resources: { grain: 1 } }] },
    ])
    expect(JSON.stringify(description)).not.toContain('A019_Handplow')
    const started = enterCardPurchase(session)
    const card = options(started).find(option => option.value === 'B065_GrainDepot')!
    expect(card.effectPreview?.kind).toBe('rule')
    const payment = session.resolveChoice(0, card.value)
    const stone = options(payment).find(option => option.effectPreview?.kind === 'payment' && option.effectPreview.resourcesPaid.stone === 2)!
    expect(effects(stone.descriptionPreview)).toContainEqual(expect.objectContaining({ kind: 'futureSchedule', entries: [{ round: 2, endRound: 5, resources: { grain: 1 } }] }))
    const response = session.resolveChoice(0, stone.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.stone).toBe(3)
    expect(response.state.futureMeeples.map(entry => entry.round)).toEqual([2, 3, 4, 5])
    expect(response.state.futureMeeples.every(entry => entry.resources.grain === 1)).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain('B065_GrainDepot')
    expect(response.state.events.some(event => event.type === 'resource.paid' && event.resources.stone === 2)).toBe(true)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') expect(confirmNextPlayer(session).ok).toBe(true)
    session.state.players.forEach(player => markAllWorkersUsed(session.state, player))
    const due = session.performRoundEnd()
    expect(due.ok, due.error).toBe(true)
    expect(due.state.round).toBe(2)
    expect(due.state.players[0]!.resources.grain).toBe(1)
    expect(due.state.futureMeeples.map(entry => entry.round)).toEqual([3, 4, 5])
    expect(due.state.events.some(event => event.type === 'resource.moved' && event.sourceCardId === 'B065_GrainDepot')).toBe(true)
  })
  it('Piggy Bank describes a free major before its flag changes and actually pays no improvement resources', () => {
    const session = setup(state => {
      const player = state.players[0]!
      player.minorPlayed = ['E027_PiggyBank']
      player.cardStates.E027_PiggyBank = { counters: { food: 6 } }
      Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0 })
    })
    const before = JSON.stringify(session.state)
    const entry = session.getState().interaction.anytimeActions.find(action => action.id === 'E27-piggy-bank-anytime')!
    expect(entry).toBeDefined()
    const preview = describeFlow(session, { type: 'leaf', actionId: 'improvement', sourceCard: 'E027_PiggyBank', params: { types: ['major'], allowedPurchases: ['Major_Fireplace1'] }, actionContext: { exactCost: {} } })
    expect(effects(preview)).toContainEqual(expect.objectContaining({ kind: 'payment', resourcesPaid: expect.not.objectContaining({ clay: 2 }) }))
    expect(JSON.stringify(preview)).toContain('Major_Fireplace1')
    expect(JSON.stringify(session.state)).toBe(before)
    let response = session.takeAnytimeAction(0, entry.id)
    const fireplace = options(response).find(option => option.value === 'Major_Fireplace1')
    if (!fireplace) throw new Error('Missing free Fireplace')
    response = session.resolveChoice(0, fireplace.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Fireplace1')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, reed: 0, stone: 0, food: 20 })
    expect(response.state.players[0]!.cardStates.E027_PiggyBank?.counters?.food).toBe(0)
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.paymentFor === 'improvement')).toEqual([])
  })
  it('private minor choices stay confined to the acting player in the real sync audience', () => {
    const session = setup(state => {
      state.players[0]!.minorHand = ['B065_GrainDepot', 'A019_Handplow']
    })
    const response = enterCardPurchase(session)
    const owner = session.buildSyncPayload(response, session.state.players[0]!.id)
    expect(JSON.stringify(owner.interaction)).toContain('B065_GrainDepot')
    for (const viewer of [session.state.players[1]!.id, null]) {
      const payload = session.buildSyncPayload(response, viewer)
      expect(JSON.stringify(payload.interaction)).not.toContain('B065_GrainDepot')
      expect(payload.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'private-prompt' }, anytimeActions: [] })
    }
  })
  it('idle anytime private target previews are redacted for opponents and spectators', () => {
    const source = '__test_PrivateAnytimeImprovement__'
    const session = setup(state => {
      state.players[0]!.minorHand = ['B065_GrainDepot', 'A019_Handplow']
      state.players[0]!.minorPlayed = [source]
    })
    session.withCtx(() => requireActiveCardRegistry('private anytime preview').registerListener({
      id: 'test-private-anytime-minor', cardIds: [source], phases: ['anytime'],
      handler: () => ({ flow: { type: 'leaf', actionId: 'improvement', sourceCard: source, params: { types: ['minor'] } } }),
    }))
    const response = session.getState()
    expect(response.interaction.stateId).toBe('idle')
    expect(JSON.stringify(session.buildSyncPayload(response, session.state.players[0]!.id).interaction)).toContain('B065_GrainDepot')
    for (const viewer of [session.state.players[1]!.id, null]) expect(JSON.stringify(session.buildSyncPayload(response, viewer).interaction)).not.toContain('B065_GrainDepot')
  })
})
