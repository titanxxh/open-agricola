import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { playOccupation } from '../../shared/actions/effects/occupation'
import { playImprovement, playMinorImprovement } from '../../shared/actions/effects/improvement'
import { isActionVetoedInFlowContext } from '../../shared/actions/flow'
import { getActiveCardRegistry, requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'

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

  it.each([false, true])('keeps owner renovation vetoes in fixed-rule admission, veto=%s', vetoed => {
    const session = game({ configure(state) {
      state.round = 7
      state.players.forEach(player => {
        player.resources.food = 20
        markAllWorkersUsed(state, player)
      })
      const player = state.players[0]!
      player.occupationPlayed = ['E087_MasterRenovator']
      Object.assign(player.resources, { clay: 1, reed: 1 })
    } })
    session.actionHooks.register({
      id: 'test:renovation-veto', actions: ['renovate-house'], phases: ['isDoable'],
      handler: () => vetoed ? { doable: false } : undefined,
    })

    const response = autoAdvanceRoundEnd(session, { onChoice(interaction, current) {
      const accept = interaction.request.options?.find(option => !option.disabled
        && !['__skip__', '__pass__'].includes(option.value))
      if (!accept) throw new Error('Expected discounted renovation option')
      return current.resolveChoice(interaction.playerIndex, accept.value)
    } })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(8)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.players[0]!.houseType).toBe(vetoed ? 'wood' : 'clay')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: vetoed ? 1 : 0, reed: vetoed ? 1 : 0 })
    expect(response.state.events.filter(event => event.type === 'farm.renovated'))
      .toHaveLength(vetoed ? 0 : 1)
    expect(response.state.events.filter(event => event.type === 'worker.placed')).toEqual([])
    expect(response.state.players[0]!.stats?.placedFarmers).toBe(0)
  })

  describe.each(['minor', 'combined'])('direct %s improvement helper', helper => {
    it.each([false, true])('keeps the owner while M018 passes and checks its followup, veto=%s', vetoed => {
      const card = 'M018_RegisterOfCraftsmen'
      const listenerCard = '__direct_improvement_owner__'
      const targets = ['Major_Joinery', 'Major_Pottery', 'Major_Basket']
      const session = game({
        options: { enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true },
        configure(state) {
          const player = state.players[0]!
          player.minorHand = [card]
          player.minorPlayed = [listenerCard]
          player.improvements = ['Major_Fireplace1', 'Major_Fireplace2']
          Object.assign(player.resources, { wood: 1, stone: 1, clay: 0, reed: 0 })
          state.availableMajorImprovements = [...targets]
        },
      })
      session.actionHooks.register({
        id: 'test:direct-improvement-veto', actions: ['plow'], phases: ['isDoable'],
        handler: () => vetoed ? { doable: false } : undefined,
      })
      session.withCtx(() => requireActiveCardRegistry('direct improvement regression').registerListener({
        id: listenerCard, cardIds: [listenerCard], actions: ['improvement'], phases: ['computeCosts'],
        handler: context => context.cardId && targets.includes(context.cardId) ? {
          costs: { wood: isActionVetoedInFlowContext({ ...context, actionId: 'plow' }) ? -1 : 0 },
        } : undefined,
      }))
      const player = session.state.players[0]!

      const result = session.withCtx(() => helper === 'minor'
        ? playMinorImprovement(session.state, player, card, 'minor-improvement', undefined, 'minorAction', undefined, session.actionHooks)
        : playImprovement(session.state, player, card, 'minor', undefined, undefined, session.actionHooks))

      expect(result.type).toBe(vetoed ? 'flow' : 'ok')
      if (result.type !== 'flow' && result.type !== 'ok') throw new Error('Expected completed direct minor purchase')
      if (vetoed) expect(result).toMatchObject({
        type: 'flow', flow: {
          type: 'leaf', actionId: 'improvement', sourceCard: card,
          params: { types: ['major'], allowedPurchases: ['Major_Joinery'], trueAction: false },
        },
      })
      expect(player.resources).toMatchObject({ wood: 1, stone: 1, clay: 0, reed: 0 })
      expect(player.minorHand).toEqual([])
      expect(player.minorPlayed).toEqual([listenerCard])
      expect(session.state.players[1]!.minorHand).toEqual(['__test_placeholder__', card])
      expect(result.extraData).toMatchObject({ improvementPayment: { improvementId: card, resourcesPaid: {} } })
      expect(getActiveCardRegistry()).toBeNull()
    })
  })

  it('keeps the owner in the shared direct major-purchase activation', () => {
    const session = game({ configure(state) {
      state.availableMajorImprovements = ['Major_Joinery']
      Object.assign(state.players[0]!.resources, { wood: 2, stone: 2, food: 0 })
    } })
    session.actionHooks.register({
      id: 'test:major-on-buy-veto', actions: ['plow'], phases: ['isDoable'], handler: () => ({ doable: false }),
    })
    session.withCtx(() => requireActiveCardRegistry('major onBuy regression').setEffect({
      id: 'Major_Joinery',
      onBuy: (state, player, _payment, context) => ({
        type: 'leaf', actionId: 'gain', params: { food: isActionVetoedInFlowContext({
          actionHooks: context?.actionHooks, state, player,
          space: state.actionSpaces.find(space => space.id === 'major-improvement')!, actionId: 'plow',
        }) ? 2 : 0 },
      }),
    }))
    const player = session.state.players[0]!

    const result = session.withCtx(() => playImprovement(session.state, player, 'Major_Joinery', 'major', undefined, undefined, session.actionHooks))

    expect(result).toMatchObject({ type: 'flow', flow: { type: 'leaf', actionId: 'gain', params: { food: 2 } } })
    if (result.type !== 'flow') throw new Error('Expected direct major onBuy flow')
    expect(player.resources).toMatchObject({ wood: 0, stone: 0, food: 0 })
    expect(player.improvements).toEqual(['Major_Joinery'])
    expect(session.state.availableMajorImprovements).toEqual([])
    expect(result.extraData).toMatchObject({ improvementPayment: { improvementId: 'Major_Joinery', resourcesPaid: { wood: 2, stone: 2 } } })
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
