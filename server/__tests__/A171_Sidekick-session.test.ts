import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { ActionChoiceOption, Resource } from '../../shared/contract/types'
import { setActiveWorkerCount, workersAvailable } from '../../shared/domain/player'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import '../../shared/cards/A/A171_Sidekick'
import '../../shared/cards/A/A156_Buyer'
import '../../shared/cards/C/C004_WritingBoards'

const CARD_ID = 'A171_Sidekick'
type SeasonId = 'winter' | 'spring' | 'summer' | 'autumn'
type SeasonsState = {
  enableThroughTheSeasons?: boolean
  throughTheSeasons?: {
    startSeason: SeasonId
    currentSeason: SeasonId
  } | null
}

const setup = (options: {
  food?: number
  workers?: number
  enableThroughTheSeasons?: boolean
  currentSeason?: SeasonId
  roundActionOrder?: string[]
  minorHand?: string[]
  extraOccupations?: string[]
  spaceResources?: Record<string, Partial<Resource>>
} = {}) => {
  const session = new GameSession(42, undefined, {
    playerCount: 5,
    enableThroughTheSeasons: options.enableThroughTheSeasons === true,
  } as never)
  const state = session.getState().state as ReturnType<GameSession['getState']>['state'] & SeasonsState
  state.currentPlayerIndex = 0
  state.round = 3
  state.roundActionOrder = state.roundActionOrder.map(() => null)
  if (options.currentSeason) {
    state.enableThroughTheSeasons = true
    state.throughTheSeasons = {
      startSeason: options.currentSeason,
      currentSeason: options.currentSeason,
    }
  }
  const order = options.roundActionOrder ?? ['western-quarry', 'vegetable-seeds', 'eastern-quarry']
  order.forEach((spaceId, index) => {
    state.roundActionOrder[index] = spaceId
  })
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  const owner = state.players[0]!
  owner.occupationPlayed.push(CARD_ID, ...(options.extraOccupations ?? []))
  owner.minorHand = options.minorHand ?? owner.minorHand
  owner.resources.food = options.food ?? 2
  owner.resources.stone = 0
  owner.resources.vegetable = 0
  setActiveWorkerCount(owner, options.workers ?? 3)
  for (const id of ['western-quarry', 'eastern-quarry']) {
    const space = state.actionSpaces.find((candidate) => candidate.id === id)!
    space.resources.stone = id === 'western-quarry' ? 2 : 1
  }
  for (const [spaceId, resources] of Object.entries(options.spaceResources ?? {})) {
    const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)!
    space.resources = { ...space.resources, ...resources }
  }
  session.loadState(state)
  return session
}

const acceptOption = (resp: ReturnType<GameSession['getState']>) =>
  resp.interaction.stateId === 'wait'
    ? resp.interaction.request.options?.find((option: ActionChoiceOption) => option.value !== '__skip__')
    : undefined

describe('A171 Sidekick session', () => {
  const STUB_ID = '__test_sidekick_after_target_state__'
  const LISTENER_ID = 'stub-sidekick-after-target-state'

  it('accepts and chains leftward with one food and one worker per step', () => {
    const session = setup()

    let resp = session.takeAction(0, 'eastern-quarry')
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    let accept = acceptOption(resp)
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)
    const afterFirst = resp.state.players[0]!
    expect(afterFirst.resources).toMatchObject({ food: 1, stone: 1, vegetable: 1 })
    expect(workersAvailable(resp.state, afterFirst)).toBe(1)
    expect(resp.state.actionSpaces.find((space) => space.id === 'vegetable-seeds')?.takenBy).toEqual([
      { playerId: afterFirst.id, workerId: '2' },
    ])

    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    accept = acceptOption(resp)
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)
    const afterSecond = resp.state.players[0]!
    expect(afterSecond.resources).toMatchObject({ food: 0, stone: 3, vegetable: 1 })
    expect(workersAvailable(resp.state, afterSecond)).toBe(0)
    expect(resp.state.actionSpaces.find((space) => space.id === 'western-quarry')?.takenBy).toEqual([
      { playerId: afterSecond.id, workerId: '3' },
    ])
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('confirm-next-player')
  })

  it('declines without paying, placing another worker, or taking the left action', () => {
    const session = setup()

    let resp = session.takeAction(0, 'eastern-quarry')
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    expect(resp.interaction.stateId).toBe('wait')
    resp = session.resolveChoice(0, '__skip__')

    const owner = resp.state.players[0]!
    expect(owner.resources).toMatchObject({ food: 2, stone: 1, vegetable: 0 })
    expect(workersAvailable(resp.state, owner)).toBe(2)
    expect(resp.state.actionSpaces.find((space) => space.id === 'vegetable-seeds')?.takenBy).toEqual([])
  })

  it('does not chain from a fixed board action', () => {
    const session = setup({
      spaceResources: {
        forest: { wood: 2 },
      },
    })

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    expect(acceptOption(resp)).toBeUndefined()
    const owner = resp.state.players[0]!
    expect(owner.resources).toMatchObject({ food: 2, wood: 2, grain: 0 })
    expect(workersAvailable(resp.state, owner)).toBe(2)
    expect(resp.state.actionSpaces.find((space) => space.id === 'grain-seeds')?.takenBy).toEqual([])
  })

  it('does not offer a fixed target vetoed by season doability after paying food', () => {
    const session = setup({
      food: 1,
      enableThroughTheSeasons: true,
      currentSeason: 'winter',
      spaceResources: {
        'clay-pit': { clay: 1 },
      },
    })

    const resp = session.takeAction(0, 'clay-pit')

    expect(resp.ok).toBe(true)
    expect(acceptOption(resp)).toBeUndefined()
    expect(resp.state.players[0]!.resources).toMatchObject({ food: 1, clay: 1 })
    expect(resp.state.actionSpaces.find((space) => space.id === 'farmland')?.takenBy).toEqual([])
  })

  it('does not offer a target action that becomes impossible after paying food', () => {
    const session = setup({
      food: 1,
      roundActionOrder: ['major-improvement', 'eastern-quarry'],
      minorHand: ['C004_WritingBoards'],
    })

    const resp = session.takeAction(0, 'eastern-quarry')

    expect(acceptOption(resp)).toBeUndefined()
    expect(resp.state.players[0]!.resources).toMatchObject({ food: 1, stone: 1 })
    expect(resp.state.actionSpaces.find((space) => space.id === 'major-improvement')?.takenBy).toEqual([])
  })

  it('runs cascaded opponent listeners as the listener owner', () => {
    const session = setup({
      food: 2,
      roundActionOrder: ['western-quarry', 'eastern-quarry'],
      spaceResources: {
        'western-quarry': { stone: 1 },
        'eastern-quarry': { stone: 1 },
      },
    })
    const state = session.getState().state
    const buyer = state.players[1]!
    buyer.occupationPlayed.push('A156_Buyer')
    buyer.resources.food = 1
    buyer.resources.stone = 0
    session.loadState(state)

    let resp = session.takeAction(0, 'eastern-quarry')
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    const sidekick = acceptOption(resp)
    expect(sidekick).toBeDefined()
    resp = session.resolveChoice(0, sidekick!.value)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('confirm-player-switch')
    expect(resp.interaction.request.toPlayerIndex).toBe(1)

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const buyerOption = resp.interaction.request.options?.find((option) =>
      option.sourceCard === 'A156_Buyer' && option.value !== '__skip__',
    )
    expect(buyerOption).toBeDefined()

    resp = session.resolveChoice(1, buyerOption!.value)

    expect(resp.state.players[0]!.resources).toMatchObject({ food: 2, stone: 2 })
    expect(resp.state.players[1]!.resources).toMatchObject({ food: 0, stone: 1 })
  })

  it('evaluates cascaded after-placement listeners after the target action resolves', () => {
    const session = setup({
      extraOccupations: [STUB_ID],
      roundActionOrder: ['vegetable-seeds', 'eastern-quarry'],
    })
    const registry = requireActiveCardRegistry('sidekick-after-target-state')
    registry.registerListener({
      id: LISTENER_ID,
      cardIds: [STUB_ID],
      phases: ['after'],
      actions: ['place-farmer'],
      handler: (context) => {
        if (context.space?.id !== 'vegetable-seeds') return
        if ((context.player.resources.vegetable ?? 0) <= 0) return
        return {
          flow: {
            type: 'leaf',
            actionId: 'gain',
            sourceCard: STUB_ID,
            params: { food: 2 },
          },
          sourceCard: STUB_ID,
        }
      },
    })
    try {
      let resp = session.takeAction(0, 'eastern-quarry')
      resp = resolveTriggerIfPresent(session, resp, CARD_ID)
      const sidekick = acceptOption(resp)
      expect(sidekick).toBeDefined()
      resp = session.resolveChoice(0, sidekick!.value)
      resp = resolveTriggerIfPresent(session, resp, STUB_ID)

      expect(resp.state.players[0]!.resources).toMatchObject({ food: 3, vegetable: 1 })
    } finally {
      registry.removeListenersWhere((listener) => listener.id === LISTENER_ID)
    }
  })
})
