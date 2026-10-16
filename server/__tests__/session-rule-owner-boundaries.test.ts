import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { playOccupation } from '../../shared/actions/effects/occupation'
import { isActionVetoedInFlowContext } from '../../shared/actions/flow'
import { getActiveCardRegistry, requireActiveCardRegistry } from '../../shared/cards/active-registry'

const sessions: ReturnType<typeof createWorkSession>[] = []
const game = (options: Parameters<typeof createWorkSession>[0] = {}) => {
  const session = createWorkSession(options)
  sessions.push(session)
  return session
}
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

describe('rule entry points retain their owning session', () => {
  it.each([0, 1])('direct occupation purchase carries the owner into its onBuy fencing query, surcharge=%i', surcharge => {
    const session = game({ configure(state) {
      const player = state.players[0]!
      player.occupationHand = ['C170_AmateurFencer']
      player.resources.food = 5
      player.resources.wood = 0
    } })
    session.actionHooks.register({
      id: 'test:fence-surcharge', actions: ['fence'], phases: ['computeCosts'],
      handler: () => ({ costs: { wood: surcharge } }),
    })
    const player = session.state.players[0]!

    const result = session.withCtx(() => playOccupation(
      player, 'C170_AmateurFencer', { food: 1 }, session.state, 'lessons', session.actionHooks,
    ))

    expect(player.resources).toMatchObject({ food: 4, wood: 0 })
    expect(player.occupationHand).toEqual([])
    expect(player.occupationPlayed).toEqual(['C170_AmateurFencer'])
    expect(player.stats?.totalOccupationBuilt).toBe(1)
    expect(player.pastures).toEqual([])
    expect(result).toEqual(surcharge === 0 ? {
      type: 'flow',
      flow: {
        type: 'leaf', actionId: 'fence', sourceCard: 'C170_AmateurFencer', optional: true,
        actionContext: {
          trueAction: false,
          fencePolicy: {
            segmentBounds: { total: { min: 1, max: 4 } },
            newPastureBounds: { count: { min: 1, max: 1 }, totalSize: { min: 1, max: 1 } },
            costPolicy: { fence: { wood: 0 } },
          },
        },
      },
    } : { type: 'ok' })
    expect(getActiveCardRegistry()).toBeNull()
  })

  const pastureGame = () => game({ configure(state) {
    const player = state.players[0]!
    player.minorPlayed = ['A012_DrinkingTrough']
    player.pastures = [{ id: 'owner-pasture', tiles: [{ row: 0, col: 4 }], animalType: null, animalCount: 0 }]
    player.fenceSegments = ['H-0-4', 'H-1-4', 'V-0-4', 'V-0-5'].map(edge => ({ edge, type: 'fence' }))
  } })

  it('binds its own rules when directly querying nonempty pasture capacities', () => {
    const session = pastureGame()
    expect(getActiveCardRegistry()).toBeNull()

    expect(session.getPastureCapacities()).toEqual({ p1: { 'owner-pasture': 4 }, p2: {} })

    expect(session.state.players[0]!.pastures).toEqual([
      { id: 'owner-pasture', tiles: [{ row: 0, col: 4 }], animalType: null, animalCount: 0 },
    ])
    expect(getActiveCardRegistry()).toBeNull()
  })

  it('uses its own capacity rules inside another session scope and restores that scope', () => {
    const first = pastureGame()
    const second = pastureGame()
    for (const [session, capacity] of [[first, 7], [second, 11]] as const) {
      session.withCtx(() => requireActiveCardRegistry('capacity owner regression').setEffect({
        id: 'A012_DrinkingTrough',
        computePastureCapacityModifiers: () => [{
          sourceCard: 'A012_DrinkingTrough', kind: 'replacement', apply: () => capacity,
        }],
      }))
    }

    second.withCtx(() => {
      const previous = getActiveCardRegistry()
      expect(first.getPastureCapacities()).toEqual({ p1: { 'owner-pasture': 7 }, p2: {} })
      expect(getActiveCardRegistry()).toBe(previous)
      expect(second.getPastureCapacities()).toEqual({ p1: { 'owner-pasture': 11 }, p2: {} })
      expect(getActiveCardRegistry()).toBe(previous)
    })
    expect(first.getPastureCapacities()).toEqual({ p1: { 'owner-pasture': 7 }, p2: {} })
    expect(getActiveCardRegistry()).toBeNull()
  })

  it.each(['ordinary', 'official-discount', 'generic-consumer'])('revalidates Stone Company payment with the owner rules, %s', mode => {
    const target = 'E047_SyrupTap'
    const listenerCard = '__minimum_payment_owner__'
    const session = game({ configure(state) {
      state.round = 14
      state.availableMajorImprovements = ['Major_Well']
      const player = state.players[0]!
      player.minorPlayed = ['A023_StoneCompany',
        ...(mode === 'official-discount' ? ['A075_LumberMill'] : []),
        ...(mode === 'generic-consumer' ? [listenerCard] : [])]
      player.minorHand = [target]
      Object.assign(player.resources, { wood: 10, clay: 10, reed: 10, stone: 10 })
      state.actionSpaces.find(space => space.id === 'western-quarry')!.resources.stone = 1
    } })
    if (mode === 'generic-consumer') {
      session.actionHooks.register({
        id: 'test:owner-plow-veto', actions: ['plow'], phases: ['isDoable'], handler: () => ({ doable: false }),
      })
      session.withCtx(() => requireActiveCardRegistry('minimum payment regression').registerListener({
        id: listenerCard, cardIds: [listenerCard], actions: ['improvement'], phases: ['computeCosts'],
        handler: context => context.cardId ? {
          costs: { wood: isActionVetoedInFlowContext({ ...context, actionId: 'plow' }) ? -1 : 0 },
        } : undefined,
      }))
    }
    let response = session.takeAction(0, 'western-quarry')
    expect(response.ok, response.error).toBe(true)
    for (let guard = 0; guard < 4; guard++) {
      if (response.interaction.stateId !== 'wait') throw new Error('Expected Stone Company choice')
      const request = response.interaction.request
      const options = request.options ?? []
      if (options.some(option => option.value === target)) break
      const accept = request.kind === 'select-trigger'
        ? options.find(option => option.sourceCard === 'A023_StoneCompany')
        : options.find(option => !option.disabled && !['__skip__', '__pass__'].includes(option.value))
      if (!accept) throw new Error('Expected Stone Company optional branch')
      response = session.resolveChoice(response.interaction.playerIndex, accept.value)
      expect(response.ok, response.error).toBe(true)
    }
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'choice' } })
    if (response.interaction.stateId !== 'wait') throw new Error('Expected improvement menu')
    expect(response.interaction.request.options?.map(option => option.value)).toEqual(['Major_Well', target])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 10, stone: 11 })

    response = session.resolveChoice(0, target)

    const paid = mode === 'ordinary' ? { wood: 1, stone: 1 } : { stone: 1 }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorHand).toEqual([])
    expect(response.state.players[0]!.minorPlayed.filter(card => card === target)).toEqual([target])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: mode === 'ordinary' ? 9 : 10, stone: 10 })
    expect(response.interaction).toMatchObject({
      stateId: 'wait', playerIndex: 0, request: { kind: 'confirm-next-player', nextPlayerIndex: 1 },
    })
    expect(response.state.events.filter(event => event.type === 'card.played' && event.cardId === target))
      .toEqual([expect.objectContaining({ actorPlayerId: 'p1', cardType: 'minor', payment: expect.objectContaining({ resources: paid }) })])
    expect(response.state.log.filter(entry => entry.key === 'log.playMinorImprovement' && entry.params?.improvements === target))
      .toEqual([expect.objectContaining({ playerId: 'p1', params: expect.objectContaining({ costResources: paid }) })])
    expect(session.getState().state.players[0]!.resources).toMatchObject({ wood: mode === 'ordinary' ? 9 : 10, stone: 10 })
    expect(getActiveCardRegistry()).toBeNull()
  })
})
