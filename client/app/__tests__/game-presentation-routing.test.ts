import { describe, expect, it } from 'vitest'
import type { ClientInteractionState } from '../../../shared/contract/protocol/game'
import type { InteractionRequest } from '../../../shared/contract/types'
import {
  mobilePresentationForInteraction,
  mobilePresentationRoute,
  type GamePresentation,
} from '../game-presentation-routing'

type Cases = {
  [K in InteractionRequest['kind']]: {
    request: Extract<InteractionRequest, { kind: K }>
    presentation: GamePresentation | null
  }
}

const cases = {
  choice: {
    request: { kind: 'choice', options: [] },
    presentation: 'action',
  },
  'animal-reorg': {
    request: { kind: 'animal-reorg', zones: [] },
    presentation: 'farm',
  },
  'confirm-next-player': {
    request: { kind: 'confirm-next-player', nextPlayerIndex: 1 },
    presentation: null,
  },
  'confirm-player-switch': {
    request: { kind: 'confirm-player-switch', fromPlayerIndex: 0, toPlayerIndex: 1 },
    presentation: null,
  },
  feed: {
    request: { kind: 'feed', remaining: 1, foodUsed: 0 },
    presentation: 'farm',
  },
  heating: {
    request: {
      kind: 'heating',
      playerId: 'p1',
      required: 1,
      maxFuelPayable: 1,
      maxWoodConvertibleToFuel: 1,
    },
    presentation: 'farm',
  },
  'farm-select': {
    request: {
      kind: 'farm-select',
      farm: { farmType: 'plow', selectableTiles: [] },
    },
    presentation: 'farm',
  },
  selection: {
    request: {
      kind: 'selection',
      selection: { kind: 'farm-position', selectablePositions: [], maxSelections: 1 },
    },
    presentation: 'farm',
  },
  'card-draft': {
    request: {
      kind: 'card-draft',
      mode: 'simultaneous',
      round: 1,
      totalRounds: 7,
      poolSize: 7,
      seatOrder: [],
      pools: {},
      pendingPicks: [],
      kept: {},
    },
    presentation: 'cards',
  },
  'select-trigger': {
    request: { kind: 'select-trigger', ownerPlayerId: 'p1', options: [] },
    presentation: 'action',
  },
  'engine-blocked': {
    request: { kind: 'engine-blocked', actionId: 'test' },
    presentation: null,
  },
  'resource-quantity-select': {
    request: { kind: 'resource-quantity-select', cardId: 'test', availableByResource: {} },
    presentation: null,
  },
  'resource-batch-exchange-select': {
    request: {
      kind: 'resource-batch-exchange-select',
      cardId: 'test',
      discardAvailableByResource: {},
      receiveResources: [],
      maxTotal: 1,
    },
    presentation: null,
  },
} satisfies Cases

const waitFor = (request: InteractionRequest): ClientInteractionState => ({
  stateId: 'wait',
  playerIndex: 0,
  request,
  allowedCommands: [],
  anytimeActions: [],
})

describe('mobile game presentation routing', () => {
  it.each(Object.entries(cases))('maps %s explicitly', (_kind, testCase) => {
    expect(mobilePresentationForInteraction(waitFor(testCase.request))).toBe(testCase.presentation)
  })

  it('opens cards for an occupation-hand selection', () => {
    expect(mobilePresentationForInteraction(waitFor({
      kind: 'selection',
      selection: {
        kind: 'occupation-hand',
        selectableCards: [],
        minSelections: 1,
        maxSelections: 1,
      },
    }))).toBe('cards')
  })

  it('keeps one route key while the same interaction payload synchronizes', () => {
    const first = waitFor({
      kind: 'farm-select',
      farm: { farmType: 'plow', selectableTiles: [{ row: 0, col: 0 }] },
    })
    const synchronized = waitFor({
      kind: 'farm-select',
      farm: { farmType: 'plow', selectableTiles: [{ row: 0, col: 1 }] },
    })

    expect(mobilePresentationRoute(first, 3)?.key)
      .toBe(mobilePresentationRoute(synchronized, 3)?.key)
    expect(mobilePresentationRoute(synchronized, 4)?.key)
      .not.toBe(mobilePresentationRoute(first, 3)?.key)
  })

  it('does not use card identity to identify a route', () => {
    const first = {
      ...waitFor({ kind: 'choice', options: [] }),
      sourceCard: 'A001',
    } satisfies ClientInteractionState
    const synchronized = {
      ...first,
      sourceCard: 'B002',
    } satisfies ClientInteractionState

    expect(mobilePresentationRoute(first, 3)?.key)
      .toBe(mobilePresentationRoute(synchronized, 3)?.key)
  })

  it('distinguishes a new request when its stable server context changes', () => {
    const first = {
      ...waitFor({ kind: 'choice', options: [] }),
      promptKey: 'ui.firstPrompt',
    } satisfies ClientInteractionState
    const next = {
      ...first,
      promptKey: 'ui.nextPrompt',
    } satisfies ClientInteractionState

    expect(mobilePresentationRoute(first, 3)?.key)
      .not.toBe(mobilePresentationRoute(next, 3)?.key)
  })
})
