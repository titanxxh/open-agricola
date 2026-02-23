import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameState } from '../../../shared/game/types'
import { persistGame } from '../api'

const createState = (): GameState => ({
  round: 1,
  currentPlayerIndex: 0,
  players: [],
  actionSpaces: [
    {
      id: 'test',
      nameKey: 'actions.test.name',
      descriptionKey: 'actions.test.description',
      roundAvailable: 1,
      gainPerRound: {},
      canBeExecutedByPlayer: () => true,
      execute: () => ({ type: 'ok' }),
      resources: {
        wood: 0,
        clay: 0,
        reed: 0,
        stone: 0,
        food: 0,
        grain: 0,
        vegetable: 0,
        sheep: 0,
        boar: 0,
        cattle: 0,
        begging: 0,
      },
      takenBy: null,
    },
  ],
  log: [],
  roundStartSnapshot: null,
  roundActionOrder: Array.from({ length: 14 }).map(() => null),
  gameSeed: 1,
  availableMajorImprovements: [],
  futureMeeples: [],
  pendingFutureMeeples: [],
  gameOver: false,
})

describe('api contract', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('persistGame serializes action spaces safely', async () => {
    const state = createState()
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ ok: true }) })
    vi.stubGlobal('fetch', fetchMock)

    await persistGame(state)

    const call = fetchMock.mock.calls[0]
    const payload = JSON.parse(call?.[1]?.body as string) as { state: GameState }
    const action = payload.state.actionSpaces[0] as Record<string, unknown>
    expect(action.canBeExecutedByPlayer).toBeUndefined()
    expect(action.execute).toBeUndefined()
    expect(action.resolveChoice).toBeUndefined()
  })
})
