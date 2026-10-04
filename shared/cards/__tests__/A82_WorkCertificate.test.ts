import { describe, expect, it } from 'vitest'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../card-listeners'
import type { GameState, PlayerState, ActionSpace, ActionFlow } from '../../contract/types'

import '../A/A082_WorkCertificate'

const CARD_ID = 'A082_WorkCertificate'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: id, color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [{ id: '1', isActive: true, isNewborn: false }],
    rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [CARD_ID],
    occupationHand: [], occupationPlayed: [], houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [],
  }) as unknown as PlayerState

const accumSpace = (id: string, resource: 'wood' | 'clay' | 'reed' | 'stone', count: number): ActionSpace =>
  ({
    id,
    nameKey: `actions.${id}.name`,
    descriptionKey: `actions.${id}.description`,
    roundAvailable: 1,
    gainPerRound: { [resource]: 1 } as Partial<Record<string, number>>,
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' }),
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      [resource]: count,
    } as never,
    takenBy: [],
  }) as ActionSpace

const createState = (player: PlayerState, spaces: ActionSpace[]): GameState =>
  ({
    round: 1, currentPlayerIndex: 0, players: [player],
    actionSpaces: spaces, log: [],
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  } as unknown as GameState)

describe('A082_WorkCertificate', () => {
  const findListener = () =>
    getRegisteredCardListeners().find(
      (l) => l.id === 'A82-work-certificate-after-place-farmer',
    )

  it('emits collect leaves with actionContext (not gain) so the source space is decremented', () => {
    const listener = findListener()
    expect(listener).toBeDefined()
    const player = createPlayer()
    const forest = accumSpace('forest', 'wood', 4)
    const state = createState(player, [forest])

    const result = executeCardListener(listener!, {
      state, player, space: forest,
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeDefined()
    const flow = result!.flow as Extract<ActionFlow, { type: 'xor' }>
    expect(flow.type).toBe('xor')
    expect(flow.children.length).toBeGreaterThan(0)
    // All children must be `collect` leaves with actionContext (not `gain`).
    for (const child of flow.children) {
      expect(child.type).toBe('leaf')
      // narrow
      if (child.type === 'leaf') {
        expect(child.actionId).toBe('collect')
        expect(child.actionContext?.spaceId).toBe('forest')
        expect(child.actionContext?.resource).toBe('wood')
        expect(child.actionContext?.amount).toBe(1)
      }
    }
  })

  it('skips when no accumulation space has >= 4 resources', () => {
    const listener = findListener()
    const player = createPlayer()
    const forest = accumSpace('forest', 'wood', 3)
    const state = createState(player, [forest])

    const result = executeCardListener(listener!, {
      state, player, space: forest,
      actionId: 'place-farmer', phase: 'after',
    } as unknown as CardListenerContext)

    expect(result).toBeUndefined()
  })
})
