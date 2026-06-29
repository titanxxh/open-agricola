import { describe, expect, it } from 'vitest'

import { actingPlayerIndex, buildPlayerUrl, parseArgs } from '../agent-playtest'

describe('agent-playtest Moor mode', () => {
  it('adds Farmers of the Moor room flags to player URLs', () => {
    const args = parseArgs([
      '--players', '4',
      '--room', 'dev4',
      '--url', 'http://localhost:5173',
      '--moor',
    ])

    expect(args.moor).toBe(true)
    expect(args.maxSteps).toBe(320)
    expect(buildPlayerUrl(args, 3)).toBe(
      'http://localhost:5173/?player=p3&transport=ws&room=dev4&devMode=1&enableFarmersOfTheMoor=true&allowIncompleteFarmersOfTheMoorMinorDeal=true',
    )
  })

  it('uses the pending player page for out-of-turn Moor harvest prompts', () => {
    expect(actingPlayerIndex({ currentPlayerIndex: 0, pending: { type: 'heating', playerIndex: 1 } })).toBe(1)
    expect(actingPlayerIndex({ currentPlayerIndex: 2, pending: null })).toBe(2)
  })
})
