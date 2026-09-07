import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import type { ActionDefinition, ActionFlow } from '../../shared/contract/types'
import type { CardListenerRegistration } from '../../shared/cards/card-listeners'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { setWorkersAtHome } from '../../shared/domain/player'
import { payAction } from '../../shared/actions/effects/pay'
import type { ActionRegistry } from '../../shared/engine/registry'

const setup = (flow: ActionFlow, food = 0) => {
  const session = new GameSession(830, undefined, { playerCount: 2 })
  for (const player of session.state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    for (const key of Object.keys(player.resources) as Array<keyof typeof player.resources>) player.resources[key] = 0
    setWorkersAtHome(session.state, player, 2)
  }
  session.state.currentPlayerIndex = 0
  session.state.players[0]!.resources.food = food
  const registry = (session as unknown as { registry: ActionRegistry }).registry
  registry.register({ ...payAction, id: '__completion_pay__' })
  const action: ActionDefinition = { ...registry.get('forest')!, flow, canBeExecutedByPlayer: () => true }
  registry.register(action)
  Object.assign(session.state.actionSpaces.find((space) => space.id === 'forest')!, action, { takenBy: [] })
  return { session, registry }
}

const before = (session: GameSession, cardId: string, actionId: string, flow: ActionFlow, mandatory = false) => {
  session.state.players[0]!.occupationPlayed.push(cardId)
  const listener: CardListenerRegistration = {
    id: cardId, cardIds: [cardId], actions: [actionId], phases: ['before'], mandatory,
    handler: () => ({ sourceCard: cardId, flow }),
  }
  session.withCtx(() => requireActiveCardRegistry('completion session test').registerListener(listener))
}

const finishChoices = (session: GameSession, response: SessionResponse): SessionResponse => {
  for (let index = 0; index < 20; index += 1) {
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId !== 'wait'
      || (response.interaction.request.kind !== 'choice' && response.interaction.request.kind !== 'select-trigger')) return response
    const option = response.interaction.request.options.find((entry) => !entry.disabled && !['__skip__', '__pass__'].includes(entry.value))
      ?? response.interaction.request.options.find((entry) => !entry.disabled)
    if (!option) throw new Error('no enabled completion choice')
    response = session.resolveChoice(response.interaction.playerIndex, option.value)
  }
  throw new Error('test flow did not finish')
}

const pay = (food: number): ActionFlow => ({ type: 'leaf', actionId: '__completion_pay__', params: { cost: { food } } })

describe('action completion through public Session commands', () => {
  it('finds the enabling before order and leaves state and private cursor unchanged while querying', () => {
    const { session } = setup({ type: 'seq', children: [pay(1)] })
    before(session, '__completion_B__', '__completion_pay__', { type: 'seq', optional: true, children: [
      { type: 'leaf', actionId: 'pay', params: { cost: { wood: 1 } } },
      { type: 'leaf', actionId: 'gain', params: { food: 1 } },
    ] })
    before(session, '__completion_A__', '__completion_pay__', { type: 'leaf', actionId: 'gain', params: { wood: 1 }, optional: true })
    const beforeQuery = JSON.stringify({ state: session.state, cursor: session.createSessionPrivateCursor() })
    expect(session.getActionAvailability(0).forest).toBe(true)
    expect(session.getActionAvailability(0).forest).toBe(true)
    expect(JSON.stringify({ state: session.state, cursor: session.createSessionPrivateCursor() })).toBe(beforeQuery)
    const response = finishChoices(session, session.takeAction(0, 'forest'))
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 0 })
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy).toHaveLength(1)
  })

  it('does not reuse a consumed before activation to pay a larger mandatory cost', () => {
    const { session } = setup({ type: 'seq', children: [pay(2)] })
    before(session, '__completion_once__', '__completion_pay__', { type: 'leaf', actionId: 'gain', params: { food: 1 } })
    expect(session.getActionAvailability(0).forest).toBe(false)
    expect(session.takeAction(0, 'forest').ok).toBe(false)
    expect(session.state.players[0]!.resources.food).toBe(0)
    expect(session.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy).toEqual([])
  })

  it('preserves a positive isDoable listener when the resulting flow can complete', () => {
    const { session, registry } = setup({ type: 'leaf', actionId: 'gain', params: { food: 1 } })
    const cardId = '__completion_is_doable__'
    const space = session.state.actionSpaces.find((entry) => entry.id === 'forest')!
    const action: ActionDefinition = {
      ...registry.get('forest')!,
      flow: undefined,
      canBeExecutedByPlayer: () => false,
      execute: ({ player }) => {
        player.resources.food += 1
        return { type: 'ok' }
      },
    }
    registry.register(action)
    Object.assign(space, action)
    session.state.players[0]!.occupationPlayed.push(cardId)
    session.withCtx(() => requireActiveCardRegistry('completion session test').registerListener({
      id: cardId,
      cardIds: [cardId],
      actions: ['forest'],
      phases: ['isDoable'],
      handler: () => ({ doable: true }),
    }))

    expect(session.getActionAvailability(0).forest).toBe(true)
    const response = session.takeAction(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(1)
  })

  it('keeps an explicit strict composite predicate as an entry requirement', () => {
    const { session } = setup({ type: 'leaf', actionId: 'gain', params: { food: 1 } })
    const space = session.state.actionSpaces.find((entry) => entry.id === 'forest')!
    space.strictCanExecute = true
    space.canBeExecutedByPlayer = () => false

    expect(session.getActionAvailability(0).forest).toBe(false)
    expect(session.takeAction(0, 'forest').ok).toBe(false)
    expect(space.takenBy).toEqual([])
  })

  it('carries resource consumption between mandatory sequence steps', () => {
    const { session } = setup({ type: 'seq', children: [pay(1), pay(1)] }, 1)
    expect(session.getActionAvailability(0).forest).toBe(false)
    expect(session.takeAction(0, 'forest').ok).toBe(false)
    expect(session.state.players[0]!.resources.food).toBe(1)
  })

  it('includes mandatory before payments even when the original host was initially affordable', () => {
    const { session } = setup({ type: 'seq', children: [pay(1)] }, 1)
    before(session, '__completion_mandatory__', '__completion_pay__', pay(1), true)
    expect(session.getActionAvailability(0).forest).toBe(false)
    expect(session.takeAction(0, 'forest').ok).toBe(false)
    expect(session.state.players[0]!.resources.food).toBe(1)
  })

  it('preserves an explicitly optional inner action while rejecting an impossible mandatory inner action', () => {
    for (const optional of [false, true]) {
      const { session } = setup({ type: 'seq', children: [pay(1), { ...pay(1), optional }] }, 1)
      expect(session.getActionAvailability(0).forest).toBe(optional)
    }
  })

  it.each([false, true])('restores placement and its dependent before benefit after a commit failure, reconnect=%s', (reconnect) => {
    let { session, registry } = setup({ type: 'seq', children: [pay(1), { type: 'leaf', actionId: 'plow' }] })
    before(session, '__completion_placement__', 'forest', { type: 'leaf', actionId: 'gain', params: { food: 1 } })
    const workers = JSON.parse(JSON.stringify(session.state.players[0]!.workers))
    const pending = session.takeAction(0, 'forest')
    expect(pending.ok, pending.error).toBe(true)
    if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'farm-select'
      || pending.interaction.request.farm.farmType !== 'plow') throw new Error('expected plow selection')
    const tile = pending.interaction.request.farm.selectableTiles[0]!
    if (reconnect) {
      const state = JSON.parse(JSON.stringify(session.state))
      const cursor = session.createSessionPrivateCursor()
      session = new GameSession(830, undefined, { playerCount: 2 })
      session.loadState(state)
      session.restoreSessionPrivateCursor(cursor)
      registry = (session as unknown as { registry: ActionRegistry }).registry
    }
    const plow = registry.get('plow')!
    registry.register({ ...plow, resolveChoice: (context, value, payload) => context.state === session.state
      ? { type: 'fail', errorKey: 'log.action' } : plow.resolveChoice!(context, value, payload) })
    const response = session.commitSelectionChoice(0, { tile })
    expect(response.ok).toBe(false)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.fields).toEqual([])
    expect(response.state.players[0]!.workers).toEqual(workers)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy).toEqual([])
    expect(response.interaction.stateId).toBe('idle')
    expect(response.publicEventCancellations?.some((entry) => entry.canceledEventIds.length > 0)).toBe(true)
  })
})
