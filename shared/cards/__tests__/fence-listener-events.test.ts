import { describe, expect, it } from 'vitest'
import type { DraftGameEvent } from '../../contract/events'
import type { GameState, PlayerState, Resource } from '../../contract/types'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import { isCardFlagged } from '../helpers/card-state'
import { B27_Toolbox_impl } from '../B/B27_Toolbox'
import { B140_FarmyardWorker_impl } from '../B/B140_FarmyardWorker'

const resources = (overrides: Partial<Resource> = {}): Resource => ({
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
  ...overrides,
})

const player = (cardId: string): PlayerState => ({
  id: 'p1',
  name: 'P1',
  color: 'red',
  resources: resources(),
  workers: [],
  rooms: 2,
  houseType: 'wood',
  fields: [],
  roomTiles: [],
  stableTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [cardId],
  occupationHand: [],
  occupationPlayed: [cardId],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  pastures: [],
  fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false,
  activeModifiers: [],
  cardStates: {},
} as unknown as PlayerState)

const state = (actor: PlayerState): GameState => ({
  round: 1,
  roundPhase: 'work',
  players: [actor],
  actionSpaces: [],
} as unknown as GameState)

const context = (
  actor: PlayerState,
  actionEvents: DraftGameEvent<'farm.fenceBuilt'>[],
): CardListenerContext => ({
  state: state(actor),
  player: actor,
  actionId: 'fence',
  phase: 'after',
  transactionEvents: actionEvents,
  actionEvents,
  result: { type: 'ok' },
} as CardListenerContext)

const listenerById = (
  listeners: readonly CardListenerRegistration[] | undefined,
  id: string,
) => {
  const listener = listeners?.find((entry) => entry.id === id)
  expect(listener).toBeDefined()
  return listener!
}

describe('fence listener event guards', () => {
  it('B27 Toolbox ignores fence cancel/no-op after-hook', () => {
    const actor = player('B27_Toolbox')
    const listener = listenerById(B27_Toolbox_impl.listeners, 'B27-flag-fencing')

    listener.handler(context(actor, []))

    expect(isCardFlagged(actor, 'B27_Toolbox')).toBe(false)
  })

  it('B140 FarmyardWorker ignores fence cancel/no-op after-hook', () => {
    const actor = player('B140_FarmyardWorker')
    const listener = listenerById(B140_FarmyardWorker_impl.listeners, 'B140-farmyard-worker-after-farmyard')

    const result = listener.handler(context(actor, []))

    expect(result).toBeUndefined()
  })
})
