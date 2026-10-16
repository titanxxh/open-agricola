import { describe, expect, it } from 'vitest'
import { cloneState, createInitialState, normalizeState } from '../state-bootstrap'
import { getPlayedCardKeys } from '../../domain/player'
import type { ActionSpace } from '../../contract/types'
import { appendImmediateEvents } from '../../events/append'
import { EventStore } from '../../events/store'

describe('cloneState', () => {
  it('preserves round and derives played cards from canonical arrays', () => {
    const state = createInitialState(42)
    state.round = 6
    state.players[0].minorPlayed = ['A003_PaperKnife']

    const cloned = cloneState(state)

    expect(cloned.round).toBe(6)
    expect(cloned.players[0]?.minorPlayed).toEqual(['A003_PaperKnife'])
    expect(getPlayedCardKeys(cloned.players[0]!)).toContain('minor:A003_PaperKnife')
  })

  it('initializes playedCards as empty array on created and cloned players', () => {
    const state = createInitialState(42)
    const cloned = cloneState(state)

    expect(state.players[0].playedCards).toEqual([])
    expect(cloned.players[0].playedCards).toEqual([])
  })

  it('does not share nested references', () => {
    const state = createInitialState(42)
    const cloned = cloneState(state)

    cloned.players[0].resources.wood = 99
    cloned.players[0].roomTiles.push({ row: 2, col: 2 })

    expect(state.players[0].resources.wood).not.toBe(99)
    expect(state.players[0].roomTiles).not.toHaveLength(cloned.players[0].roomTiles.length)
  })
})


describe('caller-owned action definitions in cloneState', () => {
  const customState = () => {
    const state = createInitialState(42, { playerCount: 2 })
    const player = state.players[0]!
    player.resources.wood = 3
    player.resources.food = 0
    player.cardStates.cloneRule = { counters: { uses: 1 } }
    const custom: ActionSpace = {
      ...state.actionSpaces[0]!,
      id: '__clone_owned_action__',
      linkedGroupId: 'clone-linked',
      maxOccupancy: 2,
      resources: { ...state.actionSpaces[0]!.resources, wood: 3 },
      gainPerRound: { wood: 1 },
      takenBy: [{ playerId: player.id, workerId: '1' }],
      blockedBy: [{ playerId: player.id, workerId: '2', sourceSpaceId: 'forest' }],
      flow: { type: 'seq', children: [{ type: 'leaf', actionId: 'gain', params: { food: 1 } }] },
      canBeExecutedByPlayer: (_state, owner) => owner.resources.wood >= 2,
      execute: context => {
        context.player.resources.food += 4
        return { type: 'ok', resourcesGained: { food: 4 } }
      },
      resolveChoice: (_context, choice) => ({ type: 'ok', resourcesGained: { wood: choice === 'wood' ? 2 : 0 } }),
      flowFactory: context => ({ type: 'leaf', actionId: 'gain', params: { wood: context.player.resources.wood } }),
    }
    state.actionSpaces.push(custom)
    appendImmediateEvents(state, [{ type: 'resource.moved', resources: { food: 1 },
      from: { kind: 'supply' }, to: { kind: 'player', playerId: player.id }, reason: 'cardEffect' }])
    return { state, custom }
  }

  it('keeps executable rules while independently copying their mutable state through JSON fallback', () => {
    const { state, custom } = customState()
    const before = JSON.stringify(state)
    expect(() => structuredClone(state)).toThrowError(DOMException)

    const cloned = cloneState(state)
    const space = cloned.actionSpaces.find(entry => entry.id === custom.id)
    expect(space).toBeDefined()
    if (!space) throw new Error('Expected the cloned custom action')
    const player = cloned.players[0]!
    const eventSink = new EventStore().beginFrame({ sourceActionId: custom.id }).sink
    const context = { state: cloned, player, space, actionHooks: undefined, eventSink }
    expect(space.canBeExecutedByPlayer(cloned, player)).toBe(true)
    expect(space.execute(context)).toEqual({ type: 'ok', resourcesGained: { food: 4 } })
    expect(player.resources.food).toBe(4)
    expect(state.players[0]!.resources.food).toBe(0)
    expect(space.resolveChoice?.(context, 'wood')).toEqual({ type: 'ok', resourcesGained: { wood: 2 } })
    expect(space.flowFactory?.({ ...context, previewMode: 'base' }))
      .toEqual({ type: 'leaf', actionId: 'gain', params: { wood: 3 } })
    expect(space.canBeExecutedByPlayer).toBe(custom.canBeExecutedByPlayer)
    expect(space.execute).toBe(custom.execute)
    expect(space.resolveChoice).toBe(custom.resolveChoice)
    expect(space.flowFactory).toBe(custom.flowFactory)
    expect(space).toMatchObject({ linkedGroupId: 'clone-linked', maxOccupancy: 2,
      gainPerRound: { wood: 1 }, resources: { wood: 3 },
      takenBy: [{ playerId: 'p1', workerId: '1' }],
      blockedBy: [{ playerId: 'p1', workerId: '2', sourceSpaceId: 'forest' }] })
    expect(cloned.events).toEqual(state.events)
    expect(cloned.events[0]).not.toBe(state.events[0])

    player.resources.wood = 0
    expect(space.canBeExecutedByPlayer(cloned, player)).toBe(false)
    space.resources.wood = 99
    space.gainPerRound.wood = 99
    space.takenBy[0]!.workerId = 'changed'
    space.blockedBy![0]!.sourceSpaceId = 'changed'
    player.cardStates.cloneRule!.counters!.uses = 9
    const flow = space.flow
    if (flow?.type !== 'seq' || flow.children[0]?.type !== 'leaf' || !flow.children[0].params) throw new Error('Expected nested flow data')
    flow.children[0].params.food = 99
    const event = cloned.events.find(entry => entry.type === 'resource.moved')
    if (event?.type !== 'resource.moved') throw new Error('Expected cloned resource event')
    event.resources.food = 99
    expect(JSON.stringify(state)).toBe(before)
  })

  it('still rejects unknown serialized action definitions during cold normalization', () => {
    const { state, custom } = customState()
    const restored = normalizeState(JSON.parse(JSON.stringify(state)))

    expect(restored.actionSpaces.some(space => space.id === custom.id)).toBe(false)
    expect(state.actionSpaces.find(space => space.id === custom.id)?.execute).toBe(custom.execute)
  })
})
