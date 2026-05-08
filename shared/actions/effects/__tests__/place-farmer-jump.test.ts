import { describe, it, expect } from 'vitest'
import { GameSession } from '../../../../server/game/authoritative-session'
import { placeFarmerAction } from '../place-farmer'
import { setWorkersAtHome } from '../../../domain/player'
import { addWorkerRef } from '../../../domain/space'
import { createInitialPlayerStats } from '../../../logic/stats'

const buildState = () => {
  const session = new GameSession(undefined, undefined, { playerCount: 2 })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.stats = createInitialPlayerStats({ isFirstPlayer: false })
  player.resources = { ...player.resources, food: 5, grain: 2, wood: 10 }
  return { session, state, player }
}

describe('place-farmer effect viaCardJump branch', () => {
  it('moves worker from current space to targetSpace and bumps placedFarmers', () => {
    const { state, player } = buildState()
    const fromSpace = state.actionSpaces.find(s => s.id === 'grain-utilization')!
    const targetSpace = state.actionSpaces.find(s => s.id === 'fencing')!
    addWorkerRef(fromSpace, player.id, '1')
    const placedBefore = player.stats!.placedFarmers

    const actionContext: Record<string, unknown> = {
      viaCardJump: true,
      sourceCard: 'B130_FullPeasant',
      workerId: '1',
      targetSpaceId: 'fencing',
    }
    const result = placeFarmerAction.execute({
      state,
      player,
      space: fromSpace,
      actionContext,
    })

    expect(fromSpace.takenBy).toEqual([])
    expect(targetSpace.takenBy).toEqual([{ playerId: player.id, workerId: '1' }])
    expect(player.stats!.placedFarmers).toBe(placedBefore + 1)
    expect(actionContext.jumpChain).toEqual(['B130_FullPeasant'])
    // The jump effect returns a leaf that defers expansion to the engine: when
    // the engine builds this leaf it will (via expandFlow) substitute in the
    // target action's flow subtree, propagating sourceCard + actionContext to
    // every inner leaf. The unit-level assertion here only checks the leaf
    // shape; the engine-level expansion is exercised in the parity smoke test
    // (server/__tests__/place-farmer-jump-recursion.test.ts).
    expect(result.type).toBe('flow')
    if (result.type === 'flow') {
      expect(result.flow.type).toBe('leaf')
      if (result.flow.type === 'leaf') {
        expect(result.flow.actionId).toBe('fencing')
        expect(result.flow.expandFlow).toBe(true)
        expect(result.flow.sourceCard).toBe('B130_FullPeasant')
        expect(result.flow.actionContext).toMatchObject({
          viaCardJump: true,
          sourceCard: 'B130_FullPeasant',
          jumpChain: ['B130_FullPeasant'],
        })
      }
    }
  })

  it('appends to existing jumpChain when nested', () => {
    const { state, player } = buildState()
    const fromSpace = state.actionSpaces.find(s => s.id === 'grain-utilization')!
    addWorkerRef(fromSpace, player.id, '1')

    const actionContext: Record<string, unknown> = {
      viaCardJump: true,
      sourceCard: 'B130_FullPeasant',
      workerId: '1',
      targetSpaceId: 'fencing',
      jumpChain: ['A129_Swagman'],
    }
    placeFarmerAction.execute({ state, player, space: fromSpace, actionContext })
    expect(actionContext.jumpChain).toEqual(['A129_Swagman', 'B130_FullPeasant'])
  })

  it('fails when workerId is not on any space', () => {
    const { state, player } = buildState()
    const result = placeFarmerAction.execute({
      state,
      player,
      space: state.actionSpaces[0]!,
      actionContext: {
        viaCardJump: true,
        sourceCard: 'X',
        workerId: '99',
        targetSpaceId: 'fencing',
      },
    })
    expect(result.type).toBe('fail')
  })

  it('fails when targetSpaceId does not exist', () => {
    const { state, player } = buildState()
    const fromSpace = state.actionSpaces.find(s => s.id === 'grain-utilization')!
    addWorkerRef(fromSpace, player.id, '1')
    const result = placeFarmerAction.execute({
      state,
      player,
      space: fromSpace,
      actionContext: {
        viaCardJump: true,
        sourceCard: 'X',
        workerId: '1',
        targetSpaceId: 'no-such-space',
      },
    })
    expect(result.type).toBe('fail')
  })

  it('fails when targetSpace is not in computeAllowedPlacementSpaces (e.g. occupied)', () => {
    const { state, player } = buildState()
    const fromSpace = state.actionSpaces.find(s => s.id === 'grain-utilization')!
    const targetSpace = state.actionSpaces.find(s => s.id === 'fencing')!
    addWorkerRef(fromSpace, player.id, '1')
    addWorkerRef(targetSpace, state.players[1]!.id, '1')

    const result = placeFarmerAction.execute({
      state,
      player,
      space: fromSpace,
      actionContext: {
        viaCardJump: true,
        sourceCard: 'X',
        workerId: '1',
        targetSpaceId: 'fencing',
      },
    })
    expect(result.type).toBe('fail')
    expect(fromSpace.takenBy).toEqual([{ playerId: player.id, workerId: '1' }])
  })

  it('does not consume family pool (worker count unchanged)', () => {
    const { state, player } = buildState()
    const fromSpace = state.actionSpaces.find(s => s.id === 'grain-utilization')!
    addWorkerRef(fromSpace, player.id, '1')
    const activeBefore = player.workers.filter(w => w.isActive).length

    placeFarmerAction.execute({
      state,
      player,
      space: fromSpace,
      actionContext: {
        viaCardJump: true,
        sourceCard: 'X',
        workerId: '1',
        targetSpaceId: 'fencing',
      },
    })
    expect(player.workers.filter(w => w.isActive).length).toBe(activeBefore)
  })
})
