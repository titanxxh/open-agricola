import { describe, expect, it } from 'vitest'

import {
  AVAILABLE_ACTION_SELECTOR,
  FARM_SELECT_PREPARE_SELECTORS,
  actingPlayerIndex,
  buildPlayerUrl,
  findNewAction,
  parseArgs,
  viewFromPayload,
} from '../agent-playtest'

describe('agent-playtest Moor mode', () => {
  it('rejects the documented-but-unimplemented replay flag', () => {
    expect(() => parseArgs(['--replay', 'trace.json'])).toThrow('--replay is not implemented')
  })

  it('rejects documented-but-unimplemented batch flags', () => {
    expect(() => parseArgs(['--url', 'http://localhost:5173', '--games', '20'])).toThrow('--games is not implemented')
    expect(() => parseArgs(['--url', 'http://localhost:5173', '--agents', '4'])).toThrow('--agents is not implemented')
  })

  it('requires a frontend URL unless FRONTEND_URL is set', () => {
    const oldUrl = process.env.FRONTEND_URL
    delete process.env.FRONTEND_URL
    try {
      expect(() => parseArgs(['--moor'])).toThrow('--url is required')
    } finally {
      if (oldUrl === undefined) {
        delete process.env.FRONTEND_URL
      } else {
        process.env.FRONTEND_URL = oldUrl
      }
    }
  })

  it('adds Farmers of the Moor room flags to player URLs', () => {
    const args = parseArgs([
      '--players', '4',
      '--room', 'dev4',
      '--url', 'http://localhost:5173',
      '--moor',
    ])

    expect(args.moor).toBe(true)
    expect(args.maxSteps).toBe(500)
    expect(buildPlayerUrl(args, 3)).toBe(
      'http://localhost:5173/?player=p3&transport=ws&room=dev4&devMode=1&enableFarmersOfTheMoor=true&allowIncompleteFarmersOfTheMoorMinorDeal=true',
    )
  })

  it('uses the pending player page for out-of-turn Moor harvest prompts', () => {
    expect(actingPlayerIndex({ currentPlayerIndex: 0, pending: { type: 'heating', playerIndex: 1 } })).toBe(1)
    expect(actingPlayerIndex({ currentPlayerIndex: 2, pending: null })).toBe(2)
  })

  it('maps worker refs to player ids for trace attribution', () => {
    const before = viewFromPayload({
      state: { round: 1, currentPlayerIndex: 0, players: [{ id: 'p1' }], log: [], actionSpaces: [] },
    })
    const after = viewFromPayload({
      state: {
        round: 1,
        currentPlayerIndex: 0,
        players: [{ id: 'p1' }],
        log: [],
        actionSpaces: [{ id: 'forest', takenBy: [{ playerId: 'p1', workerId: '1' }] }],
      },
    })

    expect(before && after ? findNewAction(before, after, 'p1') : null).toBe('forest')
  })

  it('lets the harness click revealed round cards and prepare farm-select prompts', () => {
    expect(AVAILABLE_ACTION_SELECTOR).toContain('[data-action-id] button.action-card:not([disabled])')
    expect(AVAILABLE_ACTION_SELECTOR).toContain('[data-action-id] .player-card:not(.unselectable)')
    expect(FARM_SELECT_PREPARE_SELECTORS).toContain('.farm-tile.selectable')
    expect(FARM_SELECT_PREPARE_SELECTORS).toContain('.farm-fence-h.selectable')
    expect(FARM_SELECT_PREPARE_SELECTORS).toContain('.sow-choice-button')
  })
})
