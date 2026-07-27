import { useEffect, useMemo, useState } from 'react'
import type { ClientInteractionState } from '../../shared/contract/protocol/game'
import type { SerializedGameState } from '../../shared/session/serialization'
import type { Locale } from '../../shared/i18n'
import { positionKey } from '../../shared/domain/farm'
import { rehydrateStateForClient } from '../../client/services/rehydrate'
import {
  buildActionBoardProjection,
  buildFarmBoardProjection,
} from '../../client/app/farm-board-projection'
import { splitBoardActionSpaces } from '../../client/app/game-container-helpers'
import { ActionBoard } from '../../client/components/board/ActionBoard'
import { PlayerFarmPanel } from '../../client/components/board/PlayerFarmPanel'
import { PlayerTabs } from '../../client/components/board/PlayerTabs'
import { StageBar } from '../../client/components/board/StageBar'
import type { ReplayPerspective } from './types'

const idleInteraction: ClientInteractionState = {
  stateId: 'idle',
  allowedCommands: [],
  anytimeActions: [],
}

const noOp = () => {}

export function ReplayBoard({
  frame,
  locale,
  perspective,
}: {
  frame: SerializedGameState
  locale: Locale
  perspective: ReplayPerspective
}) {
  const state = rehydrateStateForClient(frame)
  const perspectivePlayerId = perspective === 'open'
    ? null
    : state.players[Number(perspective.slice(1)) - 1]?.id ?? null
  const [viewedPlayerId, setViewedPlayerId] = useState(
    perspectivePlayerId ?? state.players[0]?.id ?? '',
  )

  useEffect(() => {
    setViewedPlayerId((current) =>
      state.players.some((player) => player.id === current)
        ? current
        : perspectivePlayerId ?? state.players[0]?.id ?? '',
    )
  }, [perspectivePlayerId, state.players])

  const displayPlayer = state.players.find((player) => player.id === viewedPlayerId)
    ?? state.players[0]
  const currentPlayer = state.players[state.currentPlayerIndex] ?? state.players[0]
  const actionMap = useMemo(
    () => new Map(state.actionSpaces.map((action) => [action.id, action])),
    [state.actionSpaces],
  )
  const roundSlots = useMemo(
    () => state.roundActionOrder.map((id, index) => ({
      round: index + 1,
      action: id ? actionMap.get(id) : undefined,
    })),
    [actionMap, state.roundActionOrder],
  )
  const { baseActions } = useMemo(
    () => splitBoardActionSpaces(state.actionSpaces, state.roundActionOrder),
    [state.actionSpaces, state.roundActionOrder],
  )
  const farmProjection = useMemo(
    () => buildFarmBoardProjection({
      displayPlayer,
      interaction: idleInteraction,
      selectionInteraction: null,
      players: state.players,
      state,
      pastureCapacities: Object.fromEntries(
        state.players.map((player) => [player.id, player.pastureCapacities]),
      ),
    }),
    [displayPlayer, state],
  )
  const actionProjection = useMemo(
    () => buildActionBoardProjection({
      locale,
      players: state.players,
      baseActions,
      roundSlots,
      currentRound: state.round,
    }),
    [baseActions, locale, roundSlots, state.players, state.round],
  )

  if (!displayPlayer || !currentPlayer) return null

  const farmView = {
    ...farmProjection,
    locale,
    activePlayerId: perspectivePlayerId ?? currentPlayer.id,
    currentStartPlayerId: state.players.find((player) => player.startPlayer)?.id ?? '',
    nextStartPlayerId: state.players.find((player) => player.startPlayer)?.id ?? '',
    fieldPositions: new Set(displayPlayer.fields.map(positionKey)),
    maxStableSelections: 0,
    plowSelectableSet: new Set<string>(),
    pendingPlowTile: null,
    pendingPositionSelections: new Set<string>(),
    pendingSowSelections: {},
    sowRemaining: { grain: 0, vegetable: 0, wood: 0, stone: 0 },
    isReorgActive: false,
    hasReorgOverflow: false,
    animalReorg: null,
    pendingFenceSet: new Set<string>(),
    isSelectingMinor: false,
    isSelectingOccupation: false,
    isSelectingImprovementAny: false,
    selectableMinorIds: new Set<string>(),
    selectableOccupationIds: new Set<string>(),
    cardAvailability: {},
    futureCardResources: {},
    devMode: perspective === 'open',
    isInteractive: false,
  }
  const farmActions = {
    togglePositionSelection: noOp,
    toggleRoomTile: noOp,
    toggleStableTile: noOp,
    toggleFarmHand: noOp,
    togglePlowTile: noOp,
    updateSowSelection: noOp,
    toggleFenceEdge: noOp,
    adjustReorgAnimal: noOp,
    confirmAnimalReorg: noOp,
    cancelAnimalDiscardPrompt: noOp,
    setViewPlayerId: setViewedPlayerId,
    resolveChoice: noOp,
  }

  return (
    <div className="replay-board">
      <section className="replay-board__action" aria-label="Action board">
        <ActionBoard
          locale={locale}
          baseActions={baseActions}
          roundSlots={roundSlots}
          currentPlayer={currentPlayer}
          players={state.players}
          futureMeeples={state.futureMeeples}
          canTakeAction={() => false}
          takeAction={noOp}
          currentRound={state.round}
          devMode={false}
          actionSpaceReservations={actionProjection.actionSpaceReservations}
          actionSpaceAttachments={actionProjection.actionSpaceAttachments}
          leftActionNames={actionProjection.leftActionNames}
        />
      </section>
      <section className="replay-board__farm" aria-label="Player farm">
        <StageBar currentRound={state.round} locale={locale} />
        <PlayerTabs
          players={state.players.map((player, index) => ({
            id: player.id,
            name: player.name,
            color: player.color,
            isYou: player.id === perspectivePlayerId,
            isCurrent: index === state.currentPlayerIndex,
          }))}
          active={displayPlayer.id}
          onChange={setViewedPlayerId}
        />
        <PlayerFarmPanel
          state={state}
          viewedPlayerId={displayPlayer.id}
          view={farmView}
          actions={farmActions}
        />
      </section>
    </div>
  )
}
