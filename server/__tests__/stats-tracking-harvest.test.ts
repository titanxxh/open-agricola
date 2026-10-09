import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

describe('PlayerStats harvest tracking', () => {
  it('grain reaped from fields adds to harvestedGrain (1 per field)', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    const player = state.players[0]!
    // give player 2 grain fields each with 2 grain on top
    player.fields = [
      {
        row: 0, col: 0,
        stacks: [{ kind: 'grain', remaining: 2 }],
      },
      {
        row: 0, col: 1,
        stacks: [{ kind: 'grain', remaining: 2 }],
      },
    ]
    session.loadState(state)
    expect(session.getState().state.players[0]!.stats.harvestedGrain).toBe(0)

    // call the private reap routine directly via cast.
    // Enter from continueHarvestFieldStart so harvestReapSummary is initialized
    // (continueHarvestReap now relies on entries pre-allocated in field-start).
    const core = session as unknown as { continueHarvestFieldStart: () => void }
    core.continueHarvestFieldStart()

    const after = session.getState().state.players[0]!
    expect(after.stats.harvestedGrain).toBe(2)
  })

  it('vegetable reaped tracked separately', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    const player = state.players[0]!
    player.fields = [
      {
        row: 0, col: 0,
        stacks: [{ kind: 'vegetable', remaining: 1 }],
      },
    ]
    session.loadState(state)

    const core = session as unknown as { continueHarvestFieldStart: () => void }
    core.continueHarvestFieldStart()

    const after = session.getState().state.players[0]!
    expect(after.stats.harvestedVegetable).toBe(1)
    expect(after.stats.harvestedGrain).toBe(0)
  })

  it('harvest reap summary keeps harvested crop details during field phase', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    const player = state.players[0]!
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] },
      { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 1 }] },
    ]
    state.harvestReapSummary = Object.fromEntries(state.players.map((p) => [
      p.id,
      {
        resources: {},
        grainFields: 0,
        vegetableFields: 0,
        harvestedPositions: [],
        harvestedCrops: [],
        harvestCountApplications: [],
      },
    ]))
    session.loadState(state)

    const core = session as unknown as {
      continueHarvestReap: () => void
      continueAfterReapEffects: () => void
    }
    core.continueAfterReapEffects = () => undefined
    core.continueHarvestReap()

    expect(session.getState().state.harvestReapSummary![player.id]!.harvestedCrops).toEqual([
      { row: 0, col: 0, crop: 'grain', amount: 1, sources: ['base'] },
      { row: 0, col: 1, crop: 'vegetable', amount: 1, sources: ['base'] },
    ])
    expect(session.getState().state.harvestReapSummary![player.id]!.harvestCountApplications).toEqual([
      { row: 0, col: 0, crop: 'grain', count: 1, sources: ['base'], tags: [], scope: 'top-stack' },
      { row: 0, col: 1, crop: 'vegetable', count: 1, sources: ['base'], tags: [], scope: 'top-stack' },
    ])
  })
})
