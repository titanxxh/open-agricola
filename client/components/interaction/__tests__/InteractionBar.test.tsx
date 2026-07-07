// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { fireEvent, render, screen } from '@testing-library/react'

import type { AnytimeAction } from '../../../../shared/contract/types'
import type { PendingChoice } from '../../../types/ui'
import {
  buildInteractionBarActions,
  buildInteractionBarModel,
  type InteractionBarActions,
  type InteractionBarPresentationInput,
} from '../../../app/interaction-bar-presentation'
import { InteractionBar } from '../InteractionBar'

const noop = () => {}

const anytimeActions: AnytimeAction[] = [
  {
    id: 'anytime-test',
    labelKey: 'ui.interactionConfirmSwitch',
  },
]

const pendingChoice: PendingChoice = {
  promptKey: 'ui.interactionChooseOne',
  options: [{ value: 'confirm', labelKey: 'ui.interactionConfirmButton' }],
  playerIndex: 0,
  spaceId: 'test-space',
}

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

const baseActions = (): InteractionBarActions => buildInteractionBarActions({
  resolveChoice: noop,
  confirmNextPlayer: noop,
  confirmPlayerSwitch: noop,
  confirmHarvestFeed: noop,
  confirmHeating: noop,
  undoStep: noop,
  undoAction: noop,
  showScoring: noop,
  takeAnytimeAction: noop,
  confirmAnimalReorg: noop,
  cancelAnimalDiscardPrompt: noop,
})

const buildBar = (
  configure?: (input: InteractionBarPresentationInput) => void,
  actionOverrides: Partial<InteractionBarActions> = {},
) => {
  const input = baseInput()
  configure?.(input)
  return (
    <InteractionBar
      model={buildInteractionBarModel(input)}
      actions={{ ...baseActions(), ...actionOverrides }}
    />
  )
}

const renderBar = (
  configure?: (input: InteractionBarPresentationInput) => void,
  actionOverrides: Partial<InteractionBarActions> = {},
) => render(buildBar(configure, actionOverrides))

const renderBarHtml = (
  configure?: (input: InteractionBarPresentationInput) => void,
  actionOverrides: Partial<InteractionBarActions> = {},
) => renderToStaticMarkup(buildBar(configure, actionOverrides))

describe('InteractionBar', () => {
  it('confirms heating with selected fuel and wood conversion', () => {
    const confirmHeating = vi.fn()
    renderBar((input) => {
      input.pending.heating = {
        playerName: 'P1',
        required: 2,
        maxFuelPayable: 1,
        maxWoodConvertibleToFuel: 1,
      }
    }, { confirmHeating })

    fireEvent.change(screen.getByLabelText('Wood to convert'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Fuel to pay'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm heating' }))

    expect(confirmHeating).toHaveBeenCalledWith({ woodToFuel: 1, fuelUsed: 2 })
  })

  it('renders animal reorg model data and invokes confirm', () => {
    const confirmAnimalReorg = vi.fn()
    renderBar((input) => {
      input.pending.animalReorg = { playerIndex: 0, spaceId: 'space' }
      input.animalReorg.remaining = { sheep: 1, boar: 0, cattle: 0, horse: 0 }
    }, { confirmAnimalReorg })

    expect(screen.getByText('Reorganize Animals')).toBeTruthy()
    expect(screen.getByText('Pending')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(confirmAnimalReorg).toHaveBeenCalledTimes(1)
  })

  it('renders resource quantity selection and invokes cancel', () => {
    const onCancel = vi.fn()
    renderBar((input) => {
      input.pending.resourceQuantitySelect = {
        availableByResource: { sheep: 2, boar: 1 },
        onConfirm: noop,
        onCancel,
      }
    })

    expect(screen.getByText('Select quantity')).toBeTruthy()
    expect(screen.getByText('Sheep (max 2)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('renders resource batch exchange selection and invokes cancel', () => {
    const onCancel = vi.fn()
    renderBar((input) => {
      input.pending.resourceBatchExchangeSelect = {
        discardAvailableByResource: { wood: 2, clay: 1 },
        receiveResources: ['wood', 'clay', 'reed', 'stone'],
        maxTotal: 4,
        onConfirm: noop,
        onCancel,
      }
    })

    expect(screen.getByText('Exchange building resources')).toBeTruthy()
    expect(screen.getByText('Discard Wood (max 2)')).toBeTruthy()
    expect(screen.getByText('Receive Stone')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('renders top controls and anytime actions and invokes their handlers', () => {
    const undoStep = vi.fn()
    const undoAction = vi.fn()
    const showScoring = vi.fn()
    const takeAnytimeAction = vi.fn()
    renderBar((input) => {
      input.pending.choice = pendingChoice
      input.controls.historyLength = 2
      input.controls.canUndoStep = true
      input.controls.hasActionStartSnapshot = true
      input.controls.canUndoAction = true
      input.controls.anytimeActions = anytimeActions
    }, {
      undoStep,
      undoAction,
      showScoring,
      takeAnytimeAction,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Undo Step' }))
    fireEvent.click(screen.getByRole('button', { name: 'Undo Action' }))
    fireEvent.click(screen.getByRole('button', { name: 'Scoring Pad' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm switch' }))

    expect(undoStep).toHaveBeenCalledTimes(1)
    expect(undoAction).toHaveBeenCalledTimes(1)
    expect(showScoring).toHaveBeenCalledTimes(1)
    expect(takeAnytimeAction).toHaveBeenCalledWith('anytime-test')
  })

  it('renders choice model data and invokes selected action', () => {
    const resolveChoice = vi.fn()
    renderBar((input) => {
      input.pending.choice = {
        ...pendingChoice,
        sourceCard: 'D117_WoodExpert',
      }
    }, { resolveChoice })

    expect(screen.getByText('Please choose an option')).toBeTruthy()
    expect(screen.getByText(/Triggered by/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(resolveChoice).toHaveBeenCalledWith('confirm')
  })

  it('renders payment preview details from choice options', () => {
    const html = renderBarHtml((input) => {
      input.pending.choice = {
        promptKey: 'prompt.selectPayment',
        options: [
          {
            value: 'pay:test:0',
            labelKey: 'prompt.selectPaymentOption',
            labelParams: {
              resourcesPaid: { wood: 2 },
              cardUsed: 'Major_ClayOven',
            },
            effectPreview: {
              kind: 'payment',
              resourcesPaid: { wood: 2 },
              cardUsed: 'Major_ClayOven',
              sourceCards: ['D117_WoodExpert'],
            },
          },
        ],
        playerIndex: 0,
        spaceId: 'major-improvement',
      }
    })

    expect(html).toContain('Pay Resources')
    expect(html).toContain('data-resource="wood"')
    expect(html).toContain('Return')
    expect(html).toContain('Clay Oven')
    expect(html).toContain('via')
  })

  it('renders waiting state while keeping scoring available', () => {
    const showScoring = vi.fn()
    renderBar((input) => {
      input.isInteractive = false
    }, { showScoring })

    expect(screen.getByText('Waiting')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Scoring Pad' }))
    expect(showScoring).toHaveBeenCalledTimes(1)
  })
})
