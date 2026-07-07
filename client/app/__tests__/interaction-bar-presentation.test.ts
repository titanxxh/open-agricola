import { describe, expect, it, vi } from 'vitest'

import {
  buildInteractionBarModel,
  buildInteractionBarActions,
  type InteractionBarPresentationInput,
} from '../interaction-bar-presentation'

const noop = () => {}

const baseInput = (): InteractionBarPresentationInput => ({
  locale: 'en',
  playerNames: ['P1', 'P2'],
  isInteractive: true,
  pending: {
    animalReorg: null,
    choice: null,
    engineBlocked: null,
    nextPlayerIndex: null,
    playerSwitch: null,
    harvestFeedPlayerName: null,
    heating: null,
    resourceQuantitySelect: null,
    resourceBatchExchangeSelect: null,
    suppressChoiceOptions: false,
  },
  farm: {
    pendingRoomTilesLength: 0,
    maxRoomSelections: 0,
    pendingFenceEdgesLength: 0,
    pendingStableTilesLength: 0,
    maxStableSelections: 0,
    pendingFarmHandSelected: false,
    pendingSowSelectionsLength: 0,
    pendingPositionSelectionsLength: 0,
    maxPositionSelections: 0,
    hasPendingPlowSelection: false,
    errors: {
      fence: '',
      room: '',
      stable: '',
      plow: '',
      sow: '',
    },
    selecting: {
      fences: false,
      rooms: false,
      stables: false,
      plow: false,
      sow: false,
    },
    fence: {
      canBuildPalisades: false,
      placementMode: 'fence',
    },
  },
  animalReorg: {
    state: null,
    remaining: null,
    hasOverflow: false,
  },
  controls: {
    canUndoStep: false,
    canUndoAction: false,
    historyLength: 0,
    hasActionStartSnapshot: false,
    anytimeActions: [],
  },
})

describe('Interaction Bar Presentation', () => {
  it('builds a compact model and action set for rendering', () => {
    const confirmHeating = vi.fn()
    const input = baseInput()
    input.pending.heating = {
      playerName: 'P1',
      required: 2,
      maxFuelPayable: 1,
      maxWoodConvertibleToFuel: 1,
    }

    const model = buildInteractionBarModel(input)
    const actions = buildInteractionBarActions({
      resolveChoice: noop,
      confirmNextPlayer: noop,
      confirmPlayerSwitch: noop,
      confirmHarvestFeed: noop,
      confirmHeating,
      undoStep: noop,
      undoAction: noop,
      showScoring: noop,
      takeAnytimeAction: noop,
      confirmAnimalReorg: noop,
      cancelAnimalDiscardPrompt: noop,
    })

    expect(model.pending.heating?.playerName).toBe('P1')
    expect(model.farm.errors.fence).toBe('')
    expect(model.controls.canUndoStep).toBe(false)

    actions.confirmHeating({ fuelUsed: 2, woodToFuel: 1 })
    expect(confirmHeating).toHaveBeenCalledWith({ fuelUsed: 2, woodToFuel: 1 })
  })
})
