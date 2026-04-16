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
        pendingFieldSelectionsLength={0}
        maxFieldSelections={0}
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
        pendingFieldSelectionsLength={0}
        maxFieldSelections={0}
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
        pendingFieldSelectionsLength={0}
        maxFieldSelections={0}
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
})
