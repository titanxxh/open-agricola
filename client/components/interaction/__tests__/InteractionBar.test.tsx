// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { fireEvent, render, screen } from '@testing-library/react'

import type { AnytimeAction } from '../../../../shared/contract/types'
import { getParentCardDefinition } from '../../../../shared/parents'
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
  it.each(['PS01', 'PS03', 'PS04'])('localizes the offered %s father tier and preserves its choice value', (fatherId) => {
    const card = getParentCardDefinition(fatherId)
    if (card?.kind !== 'father') throw new Error('expected a father card')
    const reward = card.rewards[1]
    const value = fatherId === 'PS04' ? `${fatherId}:2:wood,clay` : `${fatherId}:2`
    const labelParams = { tier: 2, requirement: reward.requirementText, reward: reward.rewardText }
    const resolveChoice = vi.fn()
    const { container } = renderBar((input) => {
      input.locale = 'zh'
      input.pending.choice = {
        ...pendingChoice,
        promptKey: 'ui.cards.parentFatherComplete.prompt',
        options: [{
          value,
          sourceCard: fatherId,
          labelKey: 'ui.cards.parentFatherComplete.tier',
          labelParams,
          ...(fatherId === 'PS03' ? {} : {
            descriptionPreview: {
              kind: 'action',
              labelKey: 'ui.cards.parentFatherComplete.tier',
              labelParams,
              effectPreview: {
                kind: 'resourceExchange',
                resourcesGained: fatherId === 'PS04' ? { wood: 1, clay: 1 } : { stone: 2 },
              },
            },
          }),
        }],
      }
    }, { resolveChoice })
    const button = screen.getByRole('button', { name: /第 2 档/ })
    const expected = {
      PS01: '至少 3 块田 -> 获得 2 石料',
      PS03: '至少 2 种动物 -> 抽取 3 张职业卡，保留 1 张',
      PS04: '至少 4 只同类动物 -> 自选 2 种不同建材，各获得 1 份',
    }[fatherId]
    expect(button).toHaveTextContent(expected!)
    expect(button.textContent).not.toMatch(/fields|animals|immediately|occupation/)
    if (fatherId === 'PS04') {
      expect(container.querySelector('[data-resource="wood"]')).toBeInTheDocument()
      expect(container.querySelector('[data-resource="clay"]')).toBeInTheDocument()
    }
    fireEvent.click(button)
    expect(resolveChoice).toHaveBeenCalledWith(value)
  })
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

  it('disables rejected specialized confirmations', () => {
    const heating = renderBar((input) => {
      input.pending.heating = {
        playerName: 'P1',
        required: 1,
        maxFuelPayable: 1,
        maxWoodConvertibleToFuel: 0,
        isConfirmDisabled: () => true,
      }
    })
    expect(screen.getByRole('button', { name: 'Confirm heating' })).toBeDisabled()
    heating.unmount()

    const reorg = renderBar((input) => {
      input.pending.animalReorg = { playerIndex: 0, spaceId: 'space' }
      input.animalReorg.confirmDisabled = true
    })
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
    reorg.unmount()

    const feed = renderBar((input) => {
      input.pending.harvestFeedPlayerName = 'P1'
      input.pending.harvestFeedConfirmDisabled = true
    })
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
    feed.unmount()

    const playerSwitch = renderBar((input) => {
      input.pending.playerSwitch = { fromPlayerIndex: 0, toPlayerIndex: 1 }
      input.pending.playerSwitchConfirmDisabled = true
    })
    expect(screen.getByRole('button', { name: 'Confirm switch' })).toBeDisabled()
    playerSwitch.unmount()

    renderBar((input) => {
      input.pending.nextPlayerIndex = 1
      input.pending.nextPlayerConfirmDisabled = true
    })
    expect(screen.getByRole('button', { name: 'Confirm switch' })).toBeDisabled()
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

  it('localizes seasonal sources in the choice subtitle and payment preview', () => {
    const html = renderBarHtml((input) => {
      input.locale = 'zh'
      input.pending.choice = {
        ...pendingChoice,
        sourceCard: 'through-the-seasons:spring',
        options: [{
          value: 'payment', labelKey: 'prompt.selectPaymentOption',
          effectPreview: {
            kind: 'payment', resourcesPaid: { wood: 1 },
            sourceCards: ['through-the-seasons:autumn'],
          },
        }],
      }
    })
    expect(html).toContain('由 春季 触发')
    expect(html).toContain('秋季')
    expect(html).not.toContain('through-the-seasons:')
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
