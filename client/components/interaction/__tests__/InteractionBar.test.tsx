// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { fireEvent, render, screen } from '@testing-library/react'

import type { AnytimeAction } from '../../../../shared/contract/types'
import type { PendingChoice } from '../../../types/ui'
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

describe('InteractionBar', () => {
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
            { value: 'WC', labelKey: 'cards.C146_WorkshopAssistant.pair.WC' },
            { value: 'WR', labelKey: 'cards.C146_WorkshopAssistant.pair.WR' },
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

    expect(html).toContain('Optional action')
    expect(html).toContain('Triggered by')
    expect(html).toContain('Cabbage Buyer')
    expect(html).toContain('Exchange resources')
    expect(html).toContain('data-resource=\"food\"')
    expect(html).toContain('data-resource=\"vegetable\"')
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
})
