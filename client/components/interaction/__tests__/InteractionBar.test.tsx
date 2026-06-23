// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { fireEvent, render, screen } from '@testing-library/react'

import type { AnytimeAction } from '../../../../shared/contract/types'
import type { PendingChoice } from '../../../types/ui'
import {
  __resetCardsManifestCache,
  loadCardsManifest,
  type CardsManifestPayload,
} from '../../../services/card-meta'
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

afterEach(() => {
  __resetCardsManifestCache()
  vi.unstubAllGlobals()
})

describe('InteractionBar', () => {
  it('confirms heating with selected fuel and wood conversion', () => {
    const confirmHeating = vi.fn()
    render(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={null}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="en"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={0}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={0}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={false}
        isSelectingRooms={false}
        isSelectingStables={false}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={true}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        heatingPending={{
          playerName: 'P1',
          required: 2,
          maxFuelPayable: 1,
          maxWoodConvertibleToFuel: 1,
        }}
        confirmHeating={confirmHeating}
        onUndo={noop}
        onUndoAction={noop}
        canUndoStep={false}
        canUndoAction={false}
        onShowScoring={noop}
        historyLength={0}
        hasActionStartSnapshot={false}
        anytimeActions={[]}
        takeAnytimeAction={noop}
      />,
    )

    fireEvent.change(screen.getByLabelText('Wood to convert'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Fuel to pay'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm heating' }))

    expect(confirmHeating).toHaveBeenCalledWith({ woodToFuel: 1, fuelUsed: 2 })
  })

  it('allows empty confirm for optional farm-position selection prompts', () => {
    const resolveChoice = vi.fn()
    const optionalSelectionChoice: PendingChoice = {
      promptKey: 'ui.interactionSelection',
      promptParams: { minSelections: 0, maxSelections: 1 },
      options: [{ value: 'confirm', labelKey: 'ui.interactionSelectionConfirm' }],
      playerIndex: 0,
      spaceId: 'test-space',
    }

    render(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={optionalSelectionChoice}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="en"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={0}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={1}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={false}
        isSelectingRooms={false}
        isSelectingStables={false}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={true}
        resolveChoice={resolveChoice}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={0}
        hasActionStartSnapshot={false}
        anytimeActions={[]}
        takeAnytimeAction={noop}
      />,
    )

    const confirm = screen.getByRole('button', { name: 'Confirm' })
    expect(confirm).not.toBeDisabled()

    fireEvent.click(confirm)
    expect(resolveChoice).toHaveBeenCalledWith('confirm')
  })

  it('keeps confirm disabled for required farm-position selection prompts with no selection', () => {
    const requiredSelectionChoice: PendingChoice = {
      promptKey: 'ui.interactionSelection',
      promptParams: { minSelections: 1, maxSelections: 1 },
      options: [{ value: 'confirm', labelKey: 'ui.interactionSelectionConfirm' }],
      playerIndex: 0,
      spaceId: 'test-space',
    }

    render(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={requiredSelectionChoice}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="en"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={0}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={1}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={false}
        isSelectingRooms={false}
        isSelectingStables={false}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={true}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={0}
        hasActionStartSnapshot={false}
        anytimeActions={[]}
        takeAnytimeAction={noop}
      />,
    )

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  })

  it('enables stable-select confirm when only a B85 farmHand is selected', () => {
    const stableSelectChoice: PendingChoice = {
      promptKey: 'ui.interactionStableSelect',
      options: [{ value: 'confirm', labelKey: 'ui.interactionConfirmButton' }],
      playerIndex: 0,
      spaceId: 'stable-space',
    }

    render(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={stableSelectChoice}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="en"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={1}
        pendingFarmHandSelected={true}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={0}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={false}
        isSelectingRooms={false}
        isSelectingStables={true}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={true}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={0}
        hasActionStartSnapshot={false}
        anytimeActions={[]}
        takeAnytimeAction={noop}
      />,
    )

    expect(screen.getByRole('button', { name: 'Confirm' })).not.toBeDisabled()
  })

  it('shows a Farm Hand hint when a B85 farmHand candidate is selected', () => {
    const stableSelectChoice: PendingChoice = {
      promptKey: 'ui.interactionStableSelect',
      options: [{ value: 'confirm', labelKey: 'ui.interactionConfirmButton' }],
      playerIndex: 0,
      spaceId: 'stable-space',
    }

    const { container } = render(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={stableSelectChoice}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="en"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={1}
        maxStableSelections={4}
        pendingFarmHandSelected={true}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={0}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={false}
        isSelectingRooms={false}
        isSelectingStables={true}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={true}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={0}
        hasActionStartSnapshot={false}
        anytimeActions={[]}
        takeAnytimeAction={noop}
      />,
    )

    expect(container.textContent).toContain('Selected 2 / Max 4+')
    expect(container.textContent).toContain('Farm Hand stable selected')
  })

  it('keeps stable-select confirm disabled when nothing is selected', () => {
    const stableSelectChoice: PendingChoice = {
      promptKey: 'ui.interactionStableSelect',
      options: [{ value: 'confirm', labelKey: 'ui.interactionConfirmButton' }],
      playerIndex: 0,
      spaceId: 'stable-space',
    }

    render(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={stableSelectChoice}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="en"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={1}
        pendingFarmHandSelected={false}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={0}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={false}
        isSelectingRooms={false}
        isSelectingStables={true}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={true}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={0}
        hasActionStartSnapshot={false}
        anytimeActions={[]}
        takeAnytimeAction={noop}
      />,
    )

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
  })

  it('renders animal reorg pending summary and confirm action in the bottom bar', () => {
    const html = renderToStaticMarkup(
      <InteractionBar
        pendingAnimalReorg={{ playerIndex: 0, spaceId: 'reorganize' }}
        pendingChoice={null}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="en"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={0}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={0}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={false}
        isSelectingRooms={false}
        isSelectingStables={false}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={true}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={0}
        hasActionStartSnapshot={false}
        anytimeActions={[]}
        takeAnytimeAction={noop}
        animalReorg={{ zones: [], confirmDiscard: false }}
        reorgRemaining={{ sheep: 0, boar: 2, cattle: 0 }}
        hasReorgOverflow={false}
        confirmAnimalReorg={noop}
        cancelAnimalDiscardPrompt={noop}
      />,
    )

    expect(html).toContain('interaction-reorg-panel')
    expect(html).toContain('Pending Animals')
    expect(html).toContain('Sheep 0 · Boar 2 · Cattle 0')
    expect(html).toContain('Confirm')
  })

  it('renders B157 Salter anytime label with BGA-style conversion wording', () => {
    const html = renderToStaticMarkup(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={null}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="en"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={0}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={0}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={false}
        isSelectingRooms={false}
        isSelectingStables={false}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={true}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={0}
        hasActionStartSnapshot={false}
        anytimeActions={[{ id: 'B157-salter-anytime', labelKey: 'cards.B157_Salter.anytime' }]}
        takeAnytimeAction={noop}
      />,
    )

    expect(html).toContain('Convert animals to food')
    expect(html).not.toContain('Salt animals')
  })

  it('renders resource quantity selection inside the interaction bar', () => {
    const html = renderToStaticMarkup(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={null}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="en"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={0}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={0}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={false}
        isSelectingRooms={false}
        isSelectingStables={false}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={true}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={0}
        hasActionStartSnapshot={false}
        anytimeActions={[]}
        takeAnytimeAction={noop}
        resourceQuantitySelect={{
          availableByResource: { sheep: 2, boar: 1, cattle: 0 },
          promptKey: 'cards.B157_Salter.pickAnimals',
          onConfirm: noop,
          onCancel: noop,
        }}
      />,
    )

    expect(html).toContain('interaction-bar__body')
    expect(html).toContain('resource-quantity-select-panel')
    expect(html).toContain('interaction-resource-quantity-panel')
    expect(html).toContain('Pick animals to salt')
    expect(html).toContain('Sheep (max 2)')
  })

  it('calls resource quantity cancel from the bottom bar panel', () => {
    const onCancel = vi.fn()
    render(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={null}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="en"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={0}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={0}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={false}
        isSelectingRooms={false}
        isSelectingStables={false}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={true}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={0}
        hasActionStartSnapshot={false}
        anytimeActions={[]}
        takeAnytimeAction={noop}
        resourceQuantitySelect={{
          availableByResource: { sheep: 2, boar: 1 },
          promptKey: 'cards.B157_Salter.pickAnimals',
          onConfirm: noop,
          onCancel,
        }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('renders resource batch exchange selection inside the interaction bar', () => {
    const html = renderToStaticMarkup(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={null}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="en"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={0}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={0}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={false}
        isSelectingRooms={false}
        isSelectingStables={false}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={true}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={0}
        hasActionStartSnapshot={false}
        anytimeActions={[]}
        takeAnytimeAction={noop}
        resourceBatchExchangeSelect={{
          discardAvailableByResource: { wood: 2, clay: 1 },
          receiveResources: ['wood', 'clay', 'reed', 'stone'],
          maxTotal: 4,
          onConfirm: noop,
          onCancel: noop,
        }}
      />,
    )

    expect(html).toContain('resource-batch-exchange-panel')
    expect(html).toContain('Exchange building resources')
    expect(html).toContain('Discard Wood (max 2)')
    expect(html).toContain('Receive Stone')
  })

  it('renders redacted private prompts as waiting without the batch exchange form', () => {
    const html = renderToStaticMarkup(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={null}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="en"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={0}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={0}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={false}
        isSelectingRooms={false}
        isSelectingStables={false}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={false}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={0}
        hasActionStartSnapshot={false}
        anytimeActions={[]}
        takeAnytimeAction={noop}
        resourceBatchExchangeSelect={null}
      />,
    )

    expect(html).toContain('Waiting')
    expect(html).not.toContain('resource-batch-exchange-panel')
    expect(html).not.toContain('Exchange building resources')
  })

  it('renders top controls and anytime actions above pending content', () => {
    const html = renderToStaticMarkup(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={pendingChoice}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="en"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={0}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={0}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={false}
        isSelectingRooms={false}
        isSelectingStables={false}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={true}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={2}
        hasActionStartSnapshot={true}
        anytimeActions={anytimeActions}
        takeAnytimeAction={noop}
      />,
    )
    const topIndex = html.indexOf('interaction-bar__top')
    const bodyIndex = html.indexOf('interaction-bar__body')
    const topSection = html.slice(topIndex, bodyIndex)

    expect(html).toContain('interaction-bar__top')
    expect(html).toContain('interaction-bar__body')
    expect(topIndex).toBeGreaterThanOrEqual(0)
    expect(bodyIndex).toBeGreaterThan(topIndex)
    expect(html).toContain('Undo Step')
    expect(html).toContain('Undo Action')
    expect(html).toContain('Scoring Pad')
    expect(topSection).toContain('anytime-bar--inline')
    expect(topSection).toContain('Anytime Actions')
    expect(html).toContain('Please choose an option')
  })

  it('renders multi-select prompt params and resource labels as icons', () => {
    const html = renderToStaticMarkup(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={{
          promptKey: 'ui.interactionWorkshopAssistantSelect',
          promptParams: { needed: 2 },
          options: [
            { value: 'WC', labelKey: 'ui.interactionResourcePair', labelParams: { left: 'WOOD', right: 'CLAY' } },
            { value: 'WR', labelKey: 'ui.interactionResourcePair', labelParams: { left: 'WOOD', right: 'REED' } },
          ],
          playerIndex: 0,
          spaceId: 'card_C146_WorkshopAssistant_choosePairs',
        }}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="en"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={0}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={0}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={false}
        isSelectingRooms={false}
        isSelectingStables={false}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={true}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={0}
        hasActionStartSnapshot={false}
        anytimeActions={[]}
        takeAnytimeAction={noop}
      />,
    )

    expect(html).toContain('Choose 2 pair(s) of building resources')
    expect(html).not.toContain('{needed}')
    expect(html).toContain('res-icon-wood')
    expect(html).toContain('res-icon-clay')
    expect(html).toContain('res-icon-reed')
    expect(html).not.toContain('1 wood + 1 clay')
  })

  it('renders description-preview resource labels as icons', () => {
    const html = renderToStaticMarkup(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={{
          promptKey: 'ui.interactionChooseOne',
          sourceCard: 'C146_WorkshopAssistant',
          options: [
            {
              value: 'flow-1',
              labelKey: 'ui.interactionResourcePair',
              labelParams: { left: 'WOOD', right: 'REED' },
              descriptionPreview: {
                kind: 'action',
                labelKey: 'ui.interactionResourcePair',
                labelParams: { left: 'WOOD', right: 'REED' },
              },
            },
            { value: '__skip__', labelKey: 'ui.interactionOptionalSkip' },
          ],
          playerIndex: 0,
          spaceId: 'card_C146_WorkshopAssistant_takePair',
        }}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="en"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={0}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={0}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={false}
        isSelectingRooms={false}
        isSelectingStables={false}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={true}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={0}
        hasActionStartSnapshot={false}
        anytimeActions={[]}
        takeAnytimeAction={noop}
      />,
    )

    expect(html).toContain('res-icon-wood')
    expect(html).toContain('res-icon-reed')
    expect(html).not.toContain('&lt;WOOD&gt;')
    expect(html).not.toContain('&lt;REED&gt;')
  })

  it('renders engine-blocked prompt without choice action buttons', () => {
    const html = renderToStaticMarkup(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={null}
        pendingEngineBlocked={{ promptKey: 'ui.interactionEngineBlocked' }}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="en"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={0}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={0}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={false}
        isSelectingRooms={false}
        isSelectingStables={false}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={true}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={1}
        hasActionStartSnapshot={false}
        anytimeActions={[]}
        takeAnytimeAction={noop}
      />,
    )
    const body = html.slice(html.indexOf('interaction-bar__body'))

    expect(body).toContain('This required action cannot continue. Undo to choose a different path.')
    expect(body).not.toContain('interaction-actions')
    expect(body).not.toContain('Confirm')
    expect(body).not.toContain('Anytime Actions')
  })

  it('stays visible with only top controls in the interactive idle state', () => {
    const html = renderToStaticMarkup(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={null}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="en"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={0}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={0}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={false}
        isSelectingRooms={false}
        isSelectingStables={false}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={true}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={1}
        hasActionStartSnapshot={false}
        anytimeActions={[]}
        takeAnytimeAction={noop}
      />,
    )

    expect(html).toContain('interaction-bar__top')
    expect(html).toContain('Undo Step')
    expect(html).not.toContain('interaction-bar__body')
    expect(html).not.toContain('Waiting')
    expect(html).not.toContain('anytime-bar--inline')
    expect(html).not.toContain('Anytime Actions')
  })

  it('shows waiting state when there is no pending content and interaction is disabled', () => {
    const html = renderToStaticMarkup(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={null}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="en"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={0}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={0}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={false}
        isSelectingRooms={false}
        isSelectingStables={false}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={false}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={1}
        hasActionStartSnapshot={false}
        anytimeActions={[]}
        takeAnytimeAction={noop}
      />,
    )

    expect(html).toContain('interaction-bar__top')
    expect(html).toContain('interaction-bar__body')
    expect(html).toContain('Waiting')
  })

  it('keeps the scoring pad button enabled while waiting for another player', () => {
    const html = renderToStaticMarkup(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={null}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="en"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={0}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={0}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={false}
        isSelectingRooms={false}
        isSelectingStables={false}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={false}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={1}
        hasActionStartSnapshot={false}
        anytimeActions={[]}
        takeAnytimeAction={noop}
      />,
    )
    const scoringButton = html.match(/<button[^>]*>Scoring Pad<\/button>/)?.[0] ?? ''

    expect(scoringButton).not.toContain('disabled')
  })

  it('falls back to readable card id when card-name i18n key is missing', () => {
    const choiceWithMissingCardName: PendingChoice = {
      promptKey: 'ui.interactionChooseOccupation',
      options: [{ value: 'E149_Pavernun', labelKey: 'occupations.E149_Pavernun.name' }],
      playerIndex: 0,
      spaceId: 'lessons',
    }
    const html = renderToStaticMarkup(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={choiceWithMissingCardName}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="zh"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={0}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={0}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={false}
        isSelectingRooms={false}
        isSelectingStables={false}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={true}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={1}
        hasActionStartSnapshot={false}
        anytimeActions={[]}
        takeAnytimeAction={noop}
      />,
    )

    expect(html).toContain('E149 Pavernun')
    expect(html).not.toContain('occupations.E149_Pavernun.name')
  })

  it('renders generic cards.*.name option labels through card metadata', async () => {
    const manifest: CardsManifestPayload = {
      A112_ScytheWorker: {
        meta: {
          id: 'A112_ScytheWorker',
          name: 'Scythe Worker',
          deck: 'A',
          number: 112,
          type: 'occupation',
        },
        module: 'shared/cards/A/A112_ScytheWorker',
        reaches: [],
      },
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => manifest,
    } as Response))
    await loadCardsManifest()

    const triggerSelectChoice: PendingChoice = {
      promptKey: 'ui.interactionSelectTrigger',
      options: [
        {
          value: 'A112_ScytheWorker',
          labelKey: 'cards.A112_ScytheWorker.name',
          sourceCard: 'A112_ScytheWorker',
        },
        { value: '__pass__', labelKey: 'ui.interactionSelectTriggerPass' },
      ],
      playerIndex: 0,
      spaceId: 'harvest',
    }
    const html = renderToStaticMarkup(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={triggerSelectChoice}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="en"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={0}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={0}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={false}
        isSelectingRooms={false}
        isSelectingStables={false}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={true}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={1}
        hasActionStartSnapshot={false}
        anytimeActions={[]}
        takeAnytimeAction={noop}
      />,
    )

    expect(html).toContain('Scythe Worker')
    expect(html).not.toContain('cards.A112_ScytheWorker.name')
  })

  it('shows the trigger card name in a subtitle when pending choice has sourceCard', () => {
    const triggeredChoice: PendingChoice = {
      promptKey: 'ui.interactionOptionalAction',
      options: [
        {
          value: 'action-pay-resources-0',
          labelKey: 'actions.pay-resources.name',
          effectPreview: {
            kind: 'resourceExchange',
            resourcesPaid: { food: 3 },
            resourcesGained: { vegetable: 1 },
          },
        },
        { value: '__skip__', labelKey: 'ui.interactionOptionalSkip' },
      ],
      playerIndex: 0,
      spaceId: 'house-redevelopment',
      sourceCard: 'D161_CabbageBuyer',
    }
    const html = renderToStaticMarkup(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={triggeredChoice}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="en"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={0}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={0}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={false}
        isSelectingRooms={false}
        isSelectingStables={false}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={true}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={1}
        hasActionStartSnapshot={false}
        anytimeActions={[]}
        takeAnytimeAction={noop}
      />,
    )

    expect(html).not.toContain('Optional action')
    expect(html).toContain('Optional: Exchange resources')
    expect(html).toContain('Triggered by')
    expect(html).toContain('Cabbage Buyer')
    expect(html).toContain('Do not use')
    expect(html).toContain('Exchange resources')
    expect(html).toContain('data-resource=\"food\"')
    expect(html).toContain('data-resource=\"vegetable\"')
  })

  it('renders card optional choice keys through flow descriptions', () => {
    const triggeredChoice: PendingChoice = {
      promptKey: 'ui.interactionOptionalAction',
      options: [
        {
          value: 'action-e53-exchange',
          labelKey: 'cards.E53_BoarSpear.choice',
          descriptionPreview: {
            kind: 'action',
            labelKey: 'actions.exchange.description',
          },
        },
        { value: '__skip__', labelKey: 'ui.interactionOptionalSkip' },
      ],
      playerIndex: 0,
      spaceId: 'pig-market',
      sourceCard: 'E53_BoarSpear',
    }
    const html = renderToStaticMarkup(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={triggeredChoice}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="en"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={0}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={0}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={false}
        isSelectingRooms={false}
        isSelectingStables={false}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={true}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={1}
        hasActionStartSnapshot={false}
        anytimeActions={[]}
        takeAnytimeAction={noop}
      />,
    )

    expect(html).not.toContain('cards.E53_BoarSpear.choice')
    expect(html).toContain('Optional: Exchange resources')
    expect(html).toContain('Triggered by')
    expect(html).toContain('Boar Spear')
    expect(html).toContain('Do not use')
  })

  it('renders payment previews with concrete cost main text and pay-resources subtitle', () => {
    const paymentChoice: PendingChoice = {
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
          },
        },
      ],
      playerIndex: 0,
      spaceId: 'major-improvement',
    }

    const html = renderToStaticMarkup(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={paymentChoice}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="en"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={0}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={0}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={false}
        isSelectingRooms={false}
        isSelectingStables={false}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={true}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={1}
        hasActionStartSnapshot={false}
        anytimeActions={[]}
        takeAnytimeAction={noop}
      />,
    )

    expect(html).toContain('Pay Resources')
    expect(html).toContain('data-resource=\"wood\"')
    expect(html).toContain('Return')
    expect(html).toContain('Clay Oven')
  })

  it('renders payment source cards from candidate cost metadata', () => {
    const paymentChoice: PendingChoice = {
      promptKey: 'prompt.selectPayment',
      options: [
        {
          value: 'pay:test:0',
          labelKey: 'prompt.selectPaymentOption',
          labelParams: {
            resourcesPaid: { wood: 1 },
            sourceCards: ['D117_WoodExpert'],
          },
          effectPreview: {
            kind: 'payment',
            resourcesPaid: { wood: 1 },
            sourceCards: ['D117_WoodExpert'],
          },
        },
      ],
      playerIndex: 0,
      spaceId: 'major-improvement',
    }

    const html = renderToStaticMarkup(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={paymentChoice}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="en"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={0}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={0}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={false}
        isSelectingRooms={false}
        isSelectingStables={false}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={true}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={1}
        hasActionStartSnapshot={false}
        anytimeActions={[]}
        takeAnytimeAction={noop}
      />,
    )

    expect(html).toContain('via D117 Wood Expert')
    expect(html).not.toContain('D117_WoodExpert')
  })

  it('renders recursive action descriptions for composite choice options', () => {
    const compositeChoice: PendingChoice = {
      promptKey: 'ui.interactionChooseOne',
      options: [
        {
          value: 'sower-sow',
          labelKey: 'actions.pop-card-stack.name',
          descriptionPreview: {
            kind: 'group',
            separator: ', ',
            parts: [
              {
                kind: 'action',
                labelKey: 'actions.pop-card-stack.name',
              },
              {
                kind: 'action',
                labelKey: 'actions.pay.name',
                effectPreview: {
                  kind: 'payment',
                  resourcesPaid: { reed: 1 },
                },
              },
              {
                kind: 'action',
                labelKey: 'actions.sow.name',
              },
            ],
          },
        },
      ],
      playerIndex: 0,
      spaceId: 'test-space',
    }
    const html = renderToStaticMarkup(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={compositeChoice}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="en"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={0}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={0}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={false}
        isSelectingRooms={false}
        isSelectingStables={false}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={true}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={1}
        hasActionStartSnapshot={false}
        anytimeActions={[]}
        takeAnytimeAction={noop}
      />,
    )

    expect(html).toContain('Remove Resources')
    expect(html).toContain('Pay')
    expect(html).toContain('Sow')
    expect(html).toContain('data-resource=\"reed\"')
  })

  it('renders parent resource choice options with resource icons and tier text', () => {
    const parentChoice: PendingChoice = {
      promptKey: 'ui.cards.parentFatherComplete.prompt',
      options: [
        {
          value: 'PS04:2:wood,stone',
          labelKey: 'ui.cards.parentFatherComplete.tier',
          labelParams: {
            tier: 2,
            requirement: 'If you have at least 4 boar',
            reward: 'Choose 2 different building resources (wood + stone)',
          },
          sourceCard: 'PS04',
          descriptionPreview: {
            kind: 'action',
            labelKey: 'ui.cards.parentFatherComplete.tier',
            labelParams: {
              tier: 2,
              requirement: 'If you have at least 4 boar',
              reward: 'Choose 2 different building resources',
            },
            effectPreview: {
              kind: 'resourceExchange',
              resourcesGained: { wood: 1, stone: 1 },
            },
          },
        },
      ],
      playerIndex: 0,
      spaceId: 'complete-parent-father',
    }
    const html = renderToStaticMarkup(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={parentChoice}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="en"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={0}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={0}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={false}
        isSelectingRooms={false}
        isSelectingStables={false}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={true}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={1}
        hasActionStartSnapshot={false}
        anytimeActions={[]}
        takeAnytimeAction={noop}
      />,
    )

    expect(html).toContain('Tier 2')
    expect(html).not.toContain('wood + stone')
    expect(html).toContain('data-resource=\"wood\"')
    expect(html).toContain('data-resource=\"stone\"')
  })

  it('hides fence/palisade mode toggle when player has not played B30 Wood Palisades', () => {
    const fencePendingChoice: PendingChoice = {
      promptKey: 'ui.interactionFenceSelect',
      options: [{ value: 'confirm', labelKey: 'ui.interactionConfirmButton' }],
      playerIndex: 0,
      spaceId: 'fence-space',
    }
    const html = renderToStaticMarkup(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={fencePendingChoice}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="en"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={0}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={0}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={true}
        isSelectingRooms={false}
        isSelectingStables={false}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={true}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={1}
        hasActionStartSnapshot={false}
        anytimeActions={[]}
        takeAnytimeAction={noop}
        canBuildPalisades={false}
        fencePlacementMode="fence"
        setFencePlacementMode={noop}
      />,
    )

    expect(html).not.toContain('fence-mode-toggle')
  })

  it('shows the Carpenter Bench pasture limit during its fence selection', () => {
    const fencePendingChoice: PendingChoice = {
      promptKey: 'ui.interactionFenceSelect',
      promptParams: { hintKey: 'ui.interactionCarpentersBenchFenceHint' },
      options: [{ value: 'confirm', labelKey: 'ui.interactionConfirmButton' }],
      playerIndex: 0,
      spaceId: 'forest',
      sourceCard: 'B15_CarpentersBench',
    }
    const html = renderToStaticMarkup(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={fencePendingChoice}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="zh"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={0}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={0}
        hasPendingPlowSelection={false}
        fenceErrorText="选择的围栏必须恰好围出要求数量的新牧场"
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={true}
        isSelectingRooms={false}
        isSelectingStables={false}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={true}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={1}
        hasActionStartSnapshot={false}
        anytimeActions={[]}
        takeAnytimeAction={noop}
      />,
    )

    expect(html).toContain('木匠长凳只能围成 1 个新牧场')
    expect(html).toContain('不能拆成 2 个圈地')
  })

  it('renders disabled options greyed-out with disabled attribute and choice-option-disabled class', () => {
    const disabledChoice: PendingChoice = {
      promptKey: 'ui.interactionChooseOne',
      options: [
        { value: 'play', labelKey: 'ui.interactionConfirmButton', disabled: true, disabledReasonKey: 'cards.B3_Moonshine.choicePlayDisabled' },
        { value: 'pass', labelKey: 'ui.interactionOptionalSkip' },
      ],
      playerIndex: 0,
      spaceId: 'test-space',
    }
    const html = renderToStaticMarkup(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={disabledChoice}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="en"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={0}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={0}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={false}
        isSelectingRooms={false}
        isSelectingStables={false}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={true}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={1}
        hasActionStartSnapshot={false}
        anytimeActions={[]}
        takeAnytimeAction={noop}
      />,
    )

    // The disabled option should have disabled attribute, choice-option-disabled class, and tooltip
    expect(html).toContain('choice-option-disabled')
    // title attribute value may be HTML-encoded by renderToStaticMarkup
    expect(html).toContain('Not enough food (need 2)')
    // Verify disabled HTML attribute is present on the play button
    const playButtonMatch = html.match(/<button[^>]*choice-option-disabled[^>]*>/)
    expect(playButtonMatch).not.toBeNull()
    expect(playButtonMatch![0]).toContain('disabled')
    // The pass option should NOT have the disabled class
    const afterPlayButton = html.slice(html.indexOf('choice-option-disabled') + 1)
    expect(afterPlayButton).not.toContain('choice-option-disabled')
  })

  it('shows fence/palisade mode toggle when player has played B30 Wood Palisades', () => {
    const fencePendingChoice: PendingChoice = {
      promptKey: 'ui.interactionFenceSelect',
      options: [{ value: 'confirm', labelKey: 'ui.interactionConfirmButton' }],
      playerIndex: 0,
      spaceId: 'fence-space',
    }
    const html = renderToStaticMarkup(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={fencePendingChoice}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="en"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={0}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={0}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={true}
        isSelectingRooms={false}
        isSelectingStables={false}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={true}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={1}
        hasActionStartSnapshot={false}
        anytimeActions={[]}
        takeAnytimeAction={noop}
        canBuildPalisades={true}
        fencePlacementMode="fence"
        setFencePlacementMode={noop}
      />,
    )

    expect(html).toContain('fence-mode-toggle')
    expect(html).toContain('Fence (1 wood)')
    expect(html).toContain('Palisade (2 wood, +1 VP)')
  })

  it('shows borrowed fence donor controls with cap and allocation counts', () => {
    const selectBorrowedFenceSource = vi.fn()
    const fencePendingChoice: PendingChoice = {
      promptKey: 'ui.interactionFenceSelect',
      options: [{ value: 'confirm', labelKey: 'ui.interactionConfirmButton' }],
      playerIndex: 0,
      spaceId: 'fence-space',
    }

    render(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={fencePendingChoice}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="en"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={0}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={0}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={true}
        isSelectingRooms={false}
        isSelectingStables={false}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={true}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={1}
        hasActionStartSnapshot={false}
        anytimeActions={[]}
        takeAnytimeAction={noop}
        canBuildPalisades={true}
        fencePlacementMode="fence"
        setFencePlacementMode={noop}
        borrowedFenceSources={{
          donors: [
            { playerId: 'p2', name: 'Player B', color: 'blue', cap: 2, allocated: 1 },
            { playerId: 'p3', name: 'Player C', color: 'black', cap: 1, allocated: 0 },
          ],
          selectedPlayerId: 'p3',
          onSelect: selectBorrowedFenceSource,
          hasMissingSources: false,
        }}
      />,
    )

    expect(screen.getByText('Borrowed fence source')).toBeInTheDocument()
    const donorButton = screen.getByRole('button', { name: /Player B.*1\/2/ })
    expect(donorButton).toHaveAttribute('data-player-color', 'blue')
    fireEvent.click(donorButton)
    expect(selectBorrowedFenceSource).toHaveBeenCalledWith('p2')
    expect(screen.queryByText('Palisade (2 wood, +1 VP)')).not.toBeInTheDocument()
  })

  it('disables borrowed fence confirm while selected ordinary edges lack donor sources', () => {
    const fencePendingChoice: PendingChoice = {
      promptKey: 'ui.interactionFenceSelect',
      options: [{ value: 'confirm', labelKey: 'ui.interactionConfirmButton' }],
      playerIndex: 0,
      spaceId: 'fence-space',
    }

    render(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={fencePendingChoice}
        pendingEngineBlocked={null}
        pendingNextPlayerIndex={null}
        pendingPlayerSwitch={null}
        locale="en"
        playerNames={['P1', 'P2']}
        pendingRoomTilesLength={0}
        maxRoomSelections={0}
        pendingStableTilesLength={0}
        maxStableSelections={0}
        pendingSowSelectionsLength={0}
        pendingPositionSelectionsLength={0}
        maxPositionSelections={0}
        hasPendingPlowSelection={false}
        fenceErrorText=""
        roomErrorText=""
        stableErrorText=""
        plowErrorText=""
        sowErrorText=""
        isSelectingFences={true}
        isSelectingRooms={false}
        isSelectingStables={false}
        isSelectingPlow={false}
        isSelectingSow={false}
        isInteractive={true}
        resolveChoice={noop}
        confirmNextPlayer={noop}
        confirmPlayerSwitch={noop}
        harvestFeedPlayerName={null}
        confirmHarvestFeed={noop}
        onUndo={noop}
        onUndoAction={noop}
        onShowScoring={noop}
        historyLength={1}
        hasActionStartSnapshot={false}
        anytimeActions={[]}
        takeAnytimeAction={noop}
        borrowedFenceSources={{
          donors: [{ playerId: 'p2', name: 'Player B', color: 'blue', cap: 2, allocated: 0 }],
          selectedPlayerId: null,
          onSelect: noop,
          hasMissingSources: true,
        }}
      />,
    )

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
    expect(screen.getByText('Choose a source for every selected fence.')).toBeInTheDocument()
  })
})
