// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { emptyResources } from '../../../shared/contract/state-constants'
import { ExchangeOverlayPresentation, type ExchangeOverlayDraft } from '../exchange-overlay-presentation'

const baseDraft = (): ExchangeOverlayDraft => ({
  bake: {
    isActive: false,
    info: {},
    options: [],
    counts: {},
    limitById: {},
    summary: { ...emptyResources },
    hasSelection: false,
    hasSummary: false,
    updateCount: vi.fn(),
    reset: vi.fn(),
  },
  anytime: {
    isActive: false,
    options: [],
    counts: {},
    limitById: {},
    summary: { ...emptyResources },
    hasSelection: false,
    hasSummary: false,
    updateCount: vi.fn(),
  },
  harvestFeed: {
    isActive: false,
    options: [],
    counts: {},
    limitById: {},
    convertedFood: 0,
    begging: 0,
    summary: { ...emptyResources },
    hasSummary: false,
    updateCount: vi.fn(),
    reset: vi.fn(),
  },
})

const renderOverlay = (
  draft: ExchangeOverlayDraft,
  actions: Partial<ComponentProps<typeof ExchangeOverlayPresentation>['actions']> = {},
) => render(
  <ExchangeOverlayPresentation
    locale="en"
    isInteractive
    pendingChoice={{ promptKey: 'ui.interactionExchangeChoice', options: [], playerIndex: 0, spaceId: 'space' }}
    harvestPending={{ playerName: 'P1', remaining: 2, foodUsed: 1 }}
    draft={draft}
    cardLabel={(id) => id}
    actions={{
      confirmBakeExchange: vi.fn(),
      confirmAnytimeExchange: vi.fn(),
      cancelAnytimeExchange: vi.fn(),
      confirmHarvestFeed: vi.fn(),
      ...actions,
    }}
  />,
)

describe('ExchangeOverlayPresentation', () => {
  it('renders bake-bread overlay rows and actions', () => {
    const draft = baseDraft()
    const confirmBakeExchange = vi.fn()
    draft.bake.isActive = true
    draft.bake.options = [{ value: 'Major_Fireplace1', labelKey: 'Major_Fireplace1' }]
    draft.bake.info = { Major_Fireplace1: { food: 2, max: 3 } }
    draft.bake.counts = { Major_Fireplace1: 1 }
    draft.bake.limitById = { Major_Fireplace1: 2 }
    draft.bake.summary = { ...emptyResources, food: 2, grain: 1 }
    draft.bake.hasSelection = true
    draft.bake.hasSummary = true

    renderOverlay(draft, { confirmBakeExchange })

    expect(screen.getByText('Bake Bread')).toBeTruthy()
    expect(screen.getByText('Major_Fireplace1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(confirmBakeExchange).toHaveBeenCalledTimes(1)
  })

  it('renders anytime exchange overlay rows and disabled confirm state', () => {
    const draft = baseDraft()
    const cancelAnytimeExchange = vi.fn()
    draft.anytime.isActive = true
    draft.anytime.options = [{
      id: 'Major_CookingHearth1-ex0',
      sourceId: 'Major_CookingHearth1',
      sourceName: 'Cooking Hearth',
      exchangeIndex: 0,
      from: { boar: 1 },
      to: { food: 3 },
      maxTimes: 2,
      tradeIndex: 0,
    }]
    draft.anytime.limitById = { 'Major_CookingHearth1-ex0': 2 }

    renderOverlay(draft, { cancelAnytimeExchange })

    expect(screen.getByText('Exchange Center')).toBeTruthy()
    expect(screen.getByTestId('anytime-exchange-option-Major_CookingHearth1-ex0')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(cancelAnytimeExchange).toHaveBeenCalledTimes(1)
  })

  it('renders harvest-feed overlay progress and confirm action', () => {
    const draft = baseDraft()
    const confirmHarvestFeed = vi.fn()
    draft.harvestFeed.isActive = true
    draft.harvestFeed.options = [{
      id: '__basic__-ex0',
      sourceId: '__basic__',
      sourceName: 'Basic conversion',
      exchangeIndex: 0,
      from: { grain: 1 },
      to: { food: 1 },
      maxTimes: 3,
    }]
    draft.harvestFeed.counts = { '__basic__-ex0': 1 }
    draft.harvestFeed.limitById = { '__basic__-ex0': 3 }
    draft.harvestFeed.convertedFood = 1
    draft.harvestFeed.begging = 1
    draft.harvestFeed.summary = { ...emptyResources, food: 2, grain: 1, begging: 1 }
    draft.harvestFeed.hasSummary = true

    renderOverlay(draft, { confirmHarvestFeed })

    expect(screen.getByText('P1 needs 2 food')).toBeTruthy()
    expect(screen.getByTestId('harvest-feed-option-__basic__-ex0')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(confirmHarvestFeed).toHaveBeenCalledTimes(1)
  })
})
