// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { installOfficialCardRegistry } from '../../../../shared/cards/__tests__/card-environment'
import { EngineStack } from '../../../../shared/engine'
import { registerLanguagePack } from '../../../../shared/i18n'
import { serializeState } from '../../../../shared/session/serialization'
import { createInitialState } from '../../../../shared/session/state-bootstrap'
import { rehydrateStateForClient, type ClientGameState } from '../../../services/rehydrate'
import guestIcon from '../../common/guest-icon.svg'
import { PlayerFarmPanel, type PlayerFarmPanelProps } from '../PlayerFarmPanel'

installOfficialCardRegistry()

function state(pending: number): ClientGameState {
  const game = createInitialState(73, { playerCount: 2 })
  game.currentPlayerIndex = 0
  const snapshot = serializeState(game, { engineStack: new EngineStack() })
  if (pending > 0) snapshot.players[0]!.playerPanelSummary.guests = { pending }
  return rehydrateStateForClient(snapshot)
}

const view: PlayerFarmPanelProps['view'] = {
  locale: 'en',
  visiblePlayerIds: ['p1'],
  devMode: false,
  currentStartPlayerId: '',
  nextStartPlayerId: '',
  playedCards: [],
  farmCells: [],
  roomPositions: new Set(),
  fieldPositions: new Set(),
  fieldMap: new Map(),
  stablePositions: new Set(),
  pendingRoomSet: new Set(),
  pendingStableSet: new Set(),
  roomSelectableSet: new Set(),
  stableSelectableSet: new Set(),
  farmHandSelectableSet: new Set(),
  pendingFarmHandKey: null,
  builtSpecialStableKeys: new Set(),
  maxStableSelections: 0,
  plowSelectableSet: new Set(),
  pendingPlowTile: null,
  positionSelectableSet: new Set(),
  pendingPositionSelections: new Set(),
  pendingSowSelections: {},
  sowRemaining: { grain: 0, vegetable: 0, wood: 0, stone: 0 },
  sowSelectableMap: new Map(),
  extraSowTargets: [],
  pastureTiles: new Map(),
  pastureDisplayMap: new Map(),
  pastureCapacityMap: new Map(),
  houseDisplayMap: new Map(),
  stableDisplayMap: new Map(),
  isReorgActive: false,
  reorgRemaining: null,
  hasReorgOverflow: false,
  animalReorg: null,
  pendingFenceSet: new Set(),
  existingFenceSet: new Set(),
  fenceSelectableSet: new Set(),
  isSelectingMinor: false,
  isSelectingOccupation: false,
  isSelectingImprovementAny: false,
  selectableMinorIds: new Set(),
  selectableOccupationIds: new Set(),
  cardAvailability: {},
  futureCardResources: {},
  isInteractive: true,
}

const actions: PlayerFarmPanelProps['actions'] = {
  togglePositionSelection: () => {},
  toggleRoomTile: () => {},
  toggleStableTile: () => {},
  toggleFarmHand: () => {},
  togglePlowTile: () => {},
  updateSowSelection: () => {},
  toggleFenceEdge: () => {},
  adjustReorgAnimal: () => {},
  confirmAnimalReorg: () => {},
  cancelAnimalDiscardPrompt: () => {},
  setViewPlayerId: () => {},
  resolveChoice: () => {},
}

const panel = (game: ClientGameState, viewedPlayerId: string, locale = view.locale) =>
  <PlayerFarmPanel state={game} viewedPlayerId={viewedPlayerId} view={{ ...view, locale }} actions={actions} />
const familyItem = (container: HTMLElement) => container.querySelector('.res-icon-child')!.closest('.res-compact-item')!
const guestItem = (container: HTMLElement) => container.querySelector('[data-testid="player-pending-guests"]')

describe('PlayerFarmPanel pending Guests', () => {
  it('shows the Guests the viewed player can still dispatch this round right after the family members', () => {
    const locale = 'en-x-guest-test'
    registerLanguagePack({ version: 1, locale, messages: { 'ui.guest.pending': 'Guests available ({count})' } })
    const { container } = render(panel(state(2), 'p1', locale))

    const guests = screen.getByRole('img', { name: 'Guests available (2)' })
    expect(guests).toHaveAttribute('title', 'Guests available (2)')
    expect(guests).toHaveTextContent(/^2$/)
    expect(guests?.querySelector('img')).toHaveAttribute('src', guestIcon)
    expect(familyItem(container)).toHaveTextContent('2/5')
    expect(guests?.previousElementSibling).toBe(familyItem(container))
  })

  it('shows the count of the player whose farm is viewed, not of the player to move', () => {
    const game = state(1)

    const { container, rerender } = render(panel(game, 'p2'))
    expect(guestItem(container)).toBeNull()
    rerender(panel(game, 'p1'))
    expect(guestItem(container)).toHaveTextContent(/^1$/)
  })

  it('drops the count once the Guest is dispatched or void, leaving the family members as they were', () => {
    const { container, rerender } = render(panel(state(1), 'p1'))
    expect(guestItem(container)).toHaveTextContent(/^1$/)

    rerender(panel(state(0), 'p1'))

    expect(guestItem(container)).toBeNull()
    expect(familyItem(container)).toHaveTextContent('2/5')
  })
})
