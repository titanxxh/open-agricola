import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import type { AnytimeAction } from '../../../../shared/game/types'
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
  it('renders top controls and anytime actions above pending content', () => {
    const html = renderToStaticMarkup(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={pendingChoice}
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

  it('stays visible with only top controls in the interactive idle state', () => {
    const html = renderToStaticMarkup(
      <InteractionBar
        pendingAnimalReorg={null}
        pendingChoice={null}
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
    expect(html).toContain('Triggered by Cabbage Buyer')
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
    expect(html).toContain('Return Clay Oven')
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
        hasWoodPalisadesCard={false}
        fencePlacementMode="fence"
        setFencePlacementMode={noop}
      />,
    )

    expect(html).not.toContain('fence-mode-toggle')
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
        hasWoodPalisadesCard={true}
        fencePlacementMode="fence"
        setFencePlacementMode={noop}
      />,
    )

    expect(html).toContain('fence-mode-toggle')
    expect(html).toContain('Fence (1 wood)')
    expect(html).toContain('Palisade (2 wood, +1 VP)')
  })
})
