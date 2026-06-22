import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { ActionChoiceOption, Resource } from '../../shared/contract/types'
import { setActiveWorkerCount, workersAvailable } from '../../shared/domain/player'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import '../../shared/cards/A/A171_Sidekick'
import '../../shared/cards/A/A156_Buyer'
import '../../shared/cards/C/C4_WritingBoards'

const CARD_ID = 'A171_Sidekick'

const setup = (options: {
  food?: number
  workers?: number
  roundActionOrder?: string[]
  minorHand?: string[]
  extraOccupations?: string[]
  spaceResources?: Record<string, Partial<Resource>>
} = {}) => {
  const session = new GameSession(42, undefined, { playerCount: 5 })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 3
  state.roundActionOrder = state.roundActionOrder.map(() => null)
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
    ? resp.interaction.options?.find((option: ActionChoiceOption) => option.value !== '__skip__')
    : undefined

describe('A171 Sidekick session', () => {
  const STUB_ID = '__test_sidekick_after_target_state__'
  const LISTENER_ID = 'stub-sidekick-after-target-state'

  it('accepts and chains leftward with one food and one worker per step', () => {
    const session = setup()

    let resp = session.takeAction(0, 'eastern-quarry')
    let accept = acceptOption(resp)
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)
    const afterFirst = resp.state.players[0]!
    expect(afterFirst.resources).toMatchObject({ food: 1, stone: 1, vegetable: 1 })
    expect(workersAvailable(resp.state, afterFirst)).toBe(1)
    expect(resp.state.actionSpaces.find((space) => space.id === 'vegetable-seeds')?.takenBy).toEqual([
      { playerId: afterFirst.id, workerId: '2' },
    ])

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
    expect(resp.interaction.stateId).toBe('wait')
    resp = session.resolveChoice(0, '__skip__')

    const owner = resp.state.players[0]!
    expect(owner.resources).toMatchObject({ food: 2, stone: 1, vegetable: 0 })
    expect(workersAvailable(resp.state, owner)).toBe(2)
    expect(resp.state.actionSpaces.find((space) => space.id === 'vegetable-seeds')?.takenBy).toEqual([])
  })

  it('can chain from a fixed board action to its physical left action', () => {
    const session = setup({
      spaceResources: {
        forest: { wood: 2 },
      },
    })

    let resp = session.takeAction(0, 'forest')
    const accept = acceptOption(resp)
    expect(accept).toBeDefined()

    resp = session.resolveChoice(0, accept!.value)

    const owner = resp.state.players[0]!
    expect(owner.resources).toMatchObject({ food: 1, wood: 2, grain: 1 })
    expect(resp.state.actionSpaces.find((space) => space.id === 'grain-seeds')?.takenBy).toEqual([
      { playerId: owner.id, workerId: '2' },
    ])
  })

  it('does not offer a target action that becomes impossible after paying food', () => {
    const session = setup({
      food: 1,
      roundActionOrder: ['major-improvement', 'eastern-quarry'],
      minorHand: ['C4_WritingBoards'],
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
    const sidekick = acceptOption(resp)
    expect(sidekick).toBeDefined()
    resp = session.resolveChoice(0, sidekick!.value)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('confirm-player-switch')
    expect(resp.interaction.toPlayerIndex).toBe(1)

    resp = confirmPlayerSwitch(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const buyerOption = resp.interaction.options?.find((option) =>
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
      const sidekick = acceptOption(resp)
      expect(sidekick).toBeDefined()
      resp = session.resolveChoice(0, sidekick!.value)

      expect(resp.state.players[0]!.resources).toMatchObject({ food: 3, vegetable: 1 })
    } finally {
      registry.removeListenersWhere((listener) => listener.id === LISTENER_ID)
    }
  })
})
