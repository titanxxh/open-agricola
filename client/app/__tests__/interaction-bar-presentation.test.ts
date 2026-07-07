import { describe, expect, it, vi } from 'vitest'

import {
  buildInteractionBarModel,
  buildInteractionBarActions,
  type InteractionBarPresentationInput,
} from '../interaction-bar-presentation'
import type { ActionChoiceOption } from '../../../shared/contract/types'

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

  it('derives body priority before rendering', () => {
    const input = baseInput()
    input.pending.heating = {
      playerName: 'P1',
      required: 2,
      maxFuelPayable: 1,
      maxWoodConvertibleToFuel: 1,
    }
    input.pending.harvestFeedPlayerName = 'P2'
    expect(buildInteractionBarModel(input).body.kind).toBe('heating')

    input.pending.resourceQuantitySelect = {
      availableByResource: { wood: 1 },
      onConfirm: noop,
      onCancel: noop,
    }
    expect(buildInteractionBarModel(input).body.kind).toBe('resourceQuantitySelect')

    input.pending.resourceBatchExchangeSelect = {
      discardAvailableByResource: { wood: 1 },
      receiveResources: ['food'],
      maxTotal: 1,
      onConfirm: noop,
      onCancel: noop,
    }
    expect(buildInteractionBarModel(input).body.kind).toBe('resourceBatchExchangeSelect')

    input.pending.animalReorg = { playerIndex: 0, spaceId: 'space' }
    expect(buildInteractionBarModel(input).body.kind).toBe('animalReorg')
  })

  it('derives visible choice options and confirm disabled states', () => {
    const cancel: ActionChoiceOption = { value: 'cancel', labelKey: 'ui.interactionCancelButton' }
    const confirm: ActionChoiceOption = { value: 'confirm', labelKey: 'ui.interactionConfirmButton' }
    const input = baseInput()
    input.pending.choice = {
      promptKey: 'ui.interactionPlowSelect',
      options: [cancel, confirm],
      playerIndex: 0,
      spaceId: 'space',
    }

    input.farm.hasPendingPlowSelection = false
    let model = buildInteractionBarModel(input)
    expect(model.choice?.visibleOptions.map((entry) => entry.option.value)).toEqual(['confirm'])
    expect(model.choice?.visibleOptions.find((entry) => entry.option.value === 'confirm')?.disabled).toBe(true)

    input.farm.hasPendingPlowSelection = true
    model = buildInteractionBarModel(input)
    expect(model.choice?.visibleOptions.map((entry) => entry.option.value)).toEqual(['confirm'])
    expect(model.choice?.visibleOptions[0]?.disabled).toBe(false)

    input.pending.choice.promptKey = 'ui.interactionSelection'
    input.pending.choice.promptParams = { minSelections: 0, maxSelections: 1 }
    input.farm.pendingPositionSelectionsLength = 0
    model = buildInteractionBarModel(input)
    expect(model.choice?.visibleOptions.find((entry) => entry.option.value === 'confirm')?.disabled).toBe(false)

    input.pending.choice.promptKey = 'ui.interactionFenceSelect'
    input.pending.choice.promptParams = undefined
    input.farm.pendingFenceEdgesLength = 1
    input.farm.selecting.fences = true
    input.farm.fence.borrowedSources = {
      donors: [],
      selectedPlayerId: null,
      onSelect: noop,
      hasMissingSources: true,
    }
    model = buildInteractionBarModel(input)
    expect(model.choice?.visibleOptions.find((entry) => entry.option.value === 'confirm')?.disabled).toBe(true)
  })

  it('covers farm selection enabled and disabled decisions in the model', () => {
    const confirm: ActionChoiceOption = { value: 'confirm', labelKey: 'ui.interactionConfirmButton' }
    const input = baseInput()
    input.pending.choice = {
      promptKey: 'ui.interactionRoomSelect',
      options: [confirm],
      playerIndex: 0,
      spaceId: 'space',
    }

    let model = buildInteractionBarModel(input)
    expect(model.choice?.visibleOptions[0]?.disabled).toBe(true)

    input.farm.pendingRoomTilesLength = 1
    model = buildInteractionBarModel(input)
    expect(model.choice?.visibleOptions[0]?.disabled).toBe(false)

    input.pending.choice.promptKey = 'ui.interactionStableSelect'
    input.farm.pendingRoomTilesLength = 0
    input.farm.pendingStableTilesLength = 0
    input.farm.pendingFarmHandSelected = false
    model = buildInteractionBarModel(input)
    expect(model.choice?.visibleOptions[0]?.disabled).toBe(true)

    input.farm.pendingFarmHandSelected = true
    model = buildInteractionBarModel(input)
    expect(model.choice?.visibleOptions[0]?.disabled).toBe(false)

    input.pending.choice.promptKey = 'ui.interactionSowSelect'
    input.farm.pendingFarmHandSelected = false
    input.farm.pendingSowSelectionsLength = 0
    model = buildInteractionBarModel(input)
    expect(model.choice?.visibleOptions[0]?.disabled).toBe(true)

    input.farm.pendingSowSelectionsLength = 1
    model = buildInteractionBarModel(input)
    expect(model.choice?.visibleOptions[0]?.disabled).toBe(false)

    input.pending.choice.promptKey = 'ui.interactionSelection'
    input.pending.choice.promptParams = { minSelections: 1, maxSelections: 2 }
    input.farm.pendingPositionSelectionsLength = 0
    model = buildInteractionBarModel(input)
    expect(model.choice?.visibleOptions[0]?.disabled).toBe(true)
  })

  it('derives choice titles, subtitles, hints, errors, and suppressed option visibility', () => {
    const input = baseInput()
    input.pending.choice = {
      promptKey: 'ui.interactionStableSelect',
      promptParams: { hintKey: 'ui.interactionFarmHandHint' },
      options: [{ value: 'confirm', labelKey: 'ui.interactionConfirmButton' }],
      playerIndex: 0,
      spaceId: 'space',
    }
    input.farm.pendingFarmHandSelected = true
    input.farm.pendingStableTilesLength = 0
    input.farm.maxStableSelections = 2
    input.farm.selecting.stables = true
    input.farm.errors.stable = 'bad stable'

    let model = buildInteractionBarModel(input)
    expect(model.choice?.title.key).toBe('ui.interactionStableSelect')
    expect(model.choice?.hint?.key).toBe('ui.interactionFarmHandHint')
    expect(model.choice?.subtitles).toEqual([
      { key: 'ui.interactionStableSelectSubtitle', params: { selected: 1, max: '2+' } },
      { key: 'ui.interactionFarmHandHint', className: 'interaction-farmhand-hint' },
    ])
    expect(model.choice?.errors).toEqual([{ text: 'bad stable' }])
    expect(model.choice?.showOptions).toBe(true)

    input.pending.suppressChoiceOptions = true
    model = buildInteractionBarModel(input)
    expect(model.choice?.showOptions).toBe(false)
  })

  it('represents non-choice body states and top controls in the model', () => {
    const input = baseInput()
    input.controls.canUndoStep = true
    input.controls.canUndoAction = true
    input.controls.historyLength = 2
    input.controls.hasActionStartSnapshot = true
    input.controls.anytimeActions = [{ id: 'anytime-test', labelKey: 'ui.interactionConfirmSwitch' }]
    let model = buildInteractionBarModel(input)
    expect(model.body.kind).toBe('none')
    expect(model.controls).toMatchObject({
      canUndoStep: true,
      canUndoAction: true,
      historyLength: 2,
      hasActionStartSnapshot: true,
    })
    expect(model.controls.anytimeActions).toHaveLength(1)

    input.pending.animalReorg = { playerIndex: 0, spaceId: 'space' }
    model = buildInteractionBarModel(input)
    expect(model.body).toMatchObject({
      kind: 'animalReorg',
      title: { key: 'ui.interactionReorgAnimalsTitle' },
    })

    input.pending.animalReorg = null
    input.pending.resourceQuantitySelect = {
      availableByResource: { wood: 1 },
      onConfirm: noop,
      onCancel: noop,
    }
    model = buildInteractionBarModel(input)
    expect(model.body.kind).toBe('resourceQuantitySelect')

    input.pending.resourceQuantitySelect = null
    input.pending.resourceBatchExchangeSelect = {
      discardAvailableByResource: { wood: 1 },
      receiveResources: ['food'],
      maxTotal: 1,
      onConfirm: noop,
      onCancel: noop,
    }
    model = buildInteractionBarModel(input)
    expect(model.body.kind).toBe('resourceBatchExchangeSelect')

    input.pending.resourceBatchExchangeSelect = null
    input.pending.heating = {
      playerName: 'P1',
      required: 2,
      maxFuelPayable: 1,
      maxWoodConvertibleToFuel: 1,
    }
    model = buildInteractionBarModel(input)
    expect(model.body).toMatchObject({
      kind: 'heating',
      title: { key: 'ui.harvestHeatingTitle' },
      subtitle: { key: 'ui.harvestHeatingSubtitle', params: { player: 'P1', count: 2 } },
    })

    input.pending.heating = null
    input.pending.harvestFeedPlayerName = 'P2'
    model = buildInteractionBarModel(input)
    expect(model.body).toMatchObject({
      kind: 'harvestFeed',
      title: { key: 'ui.harvestFeedTitle' },
      subtitle: { text: 'P2' },
    })

    input.pending.harvestFeedPlayerName = null
    input.isInteractive = false
    model = buildInteractionBarModel(input)
    expect(model.body).toMatchObject({
      kind: 'waiting',
      title: { key: 'ui.statusWaiting' },
    })
  })
})
