import { ActionReferencePlayerCount } from '../../client/contexts/ActionReferenceContext'
import { t as translateMessage } from '../../shared/i18n'
import { getPlayerDisplayName } from '../../client/utils/player-name'
import { useEffect, useMemo, useState } from 'react'
import type { ClientInteractionState } from '../../shared/contract/protocol/game'
import type { GameState } from '../../shared/contract/types'
import type { SerializedGameState } from '../../shared/session/serialization'
import type { Locale } from '../../shared/i18n'
import type { ParentCardId } from '../../shared/parents'
import { positionKey } from '../../shared/domain/farm'
import { rehydrateStateForClient } from '../../client/services/rehydrate'
import {
  buildActionBoardProjection,
  buildFarmBoardProjection,
} from '../../client/app/farm-board-projection'
import { splitBoardActionSpaces } from '../../client/app/game-container-helpers'
import { ActionBoard } from '../../client/components/board/ActionBoard'
import { MajorImprovements, type MajorSupplyExpansion } from '../../client/components/board/MajorImprovements'
import { PlayerFarmPanel } from '../../client/components/board/PlayerFarmPanel'
import { PlayerTabs } from '../../client/components/board/PlayerTabs'
import { SeasonsBoard } from '../../client/components/board/SeasonsBoard'
import { SpecialActionsPanel } from '../../client/components/board/SpecialActionsPanel'
import { StageBar } from '../../client/components/board/StageBar'
import { ParentCardFace } from '../../client/components/common/ParentCardFace'
import { PlayerCard } from '../../client/components/common/PlayerCard'
import type { ReplayPerspective } from './types'

const idleInteraction: ClientInteractionState = {
  stateId: 'idle',
  allowedCommands: [],
  anytimeActions: [],
}

const noOp = () => {}

const setupText = (locale: string) => ({ "draft": translateMessage(locale, "ui.copy.ReplayBoard.card_draft_replay_27937c"), "parent": translateMessage(locale, "ui.copy.ReplayBoard.parent_card_selection_replay_136587"), "round": translateMessage(locale, "ui.copy.ReplayBoard.round_a7a6c3"), "pool": translateMessage(locale, "ui.copy.ReplayBoard.available_cards_f66487"), "kept": translateMessage(locale, "ui.copy.ReplayBoard.already_kept_15426a"), "submitted": translateMessage(locale, "ui.copy.ReplayBoard.submitted_choice_857d0a"), "mothers": translateMessage(locale, "ui.copy.ReplayBoard.mother_candidates_e6a9d9"), "fathers": translateMessage(locale, "ui.copy.ReplayBoard.father_candidates_0fbfd6"), "waiting": translateMessage(locale, "ui.copy.ReplayBoard.not_submitted_a8ee47"), "hidden": translateMessage(locale, "ui.copy.ReplayBoard.hidden_card_04b619") })

function SetupCards({
  ids,
  kind,
  locale,
}: {
  ids: readonly string[]
  kind: 'occupation' | 'minor' | 'parent'
  locale: Locale
}) {
  if (ids.length === 0) return <span className="replay-setup__empty">—</span>
  return (
    <ul className="replay-setup__cards">
      {ids.map((id, index) => (
        <li
          key={`${id}:${index}`}
          data-card-id={id}
          aria-label={id === '?' ? setupText(locale).hidden : id}
        >
          {id === '?'
            ? <span className="replay-setup__hidden">?</span>
            : kind === 'parent'
              ? <ParentCardFace id={id as ParentCardId} locale={locale} />
              : (
                  <PlayerCard
                    locale={locale}
                    cardId={id}
                    cardType={kind}
                    enablePreview={false}
                  />
                )}
        </li>
      ))}
    </ul>
  )
}

function ReplayDraftPhase({
  state,
  locale,
}: {
  state: GameState
  locale: Locale
}) {
  const draft = state.draft!
  const text = setupText(locale)
  return (
    <section className="replay-setup" data-phase="draft" aria-label={text.draft}>
      <header>
        <h2>{text.draft}</h2>
        <p>{text.round} {draft.round} / {draft.totalRounds}</p>
      </header>
      <div className="replay-setup__players">
        {draft.seatOrder.map((playerId) => {
          const player = state.players.find((candidate) => candidate.id === playerId)
          const pool = draft.pools[playerId] ?? { occ: [], minor: [] }
          const kept = draft.kept[playerId] ?? { occ: [], minor: [] }
          const pending = draft.pendingPicks[playerId]
          return (
            <article key={playerId}>
              <h3>{player ? getPlayerDisplayName(locale, player.name, state.players.indexOf(player), player.nameIsDefault) : playerId}</h3>
              <h4>{text.pool}</h4>
              <SetupCards ids={pool.occ} kind="occupation" locale={locale} />
              <SetupCards ids={pool.minor} kind="minor" locale={locale} />
              <h4>{text.kept}</h4>
              <SetupCards ids={kept.occ} kind="occupation" locale={locale} />
              <SetupCards ids={kept.minor} kind="minor" locale={locale} />
              <h4>{text.submitted}</h4>
              {pending?.occ || pending?.minor
                ? (
                    <>
                      <SetupCards ids={pending.occ ? [pending.occ] : []} kind="occupation" locale={locale} />
                      <SetupCards ids={pending.minor ? [pending.minor] : []} kind="minor" locale={locale} />
                    </>
                  )
                : <p>{text.waiting}</p>}
            </article>
          )
        })}
      </div>
    </section>
  )
}

function ReplayParentSelectionPhase({
  state,
  locale,
}: {
  state: GameState
  locale: Locale
}) {
  const selection = state.parentSelection!
  const text = setupText(locale)
  return (
    <section className="replay-setup" data-phase="parent-selection" aria-label={text.parent}>
      <header><h2>{text.parent}</h2></header>
      <div className="replay-setup__players">
        {state.players.map((player, index) => {
          const candidates = selection.candidates[player.id]
          const submission = selection.submissions[player.id]
          return (
            <article key={player.id}>
              <h3>{getPlayerDisplayName(locale, player.name, index, player.nameIsDefault)}</h3>
              <h4>{text.mothers}</h4>
              <SetupCards
                ids={(candidates?.mother ?? []) as readonly string[]}
                kind="parent"
                locale={locale}
              />
              <h4>{text.fathers}</h4>
              <SetupCards
                ids={(candidates?.father ?? []) as readonly string[]}
                kind="parent"
                locale={locale}
              />
              <h4>{text.submitted}</h4>
              {submission
                ? (
                    <SetupCards
                      ids={[submission.mother, submission.father] as readonly string[]}
                      kind="parent"
                      locale={locale}
                    />
                  )
                : <p>{text.waiting}</p>}
            </article>
          )
        })}
      </div>
    </section>
  )
}

function ReplayBoardContent({
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
  const [majorSupplyExpansion, setMajorSupplyExpansion] = useState<MajorSupplyExpansion>(null)

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
  const { baseActions, seasonActions } = useMemo(
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

  if (state.phase === 'draft' && state.draft) {
    return <ReplayDraftPhase state={state} locale={locale} />
  }
  if (state.phase === 'parent-selection' && state.parentSelection) {
    return <ReplayParentSelectionPhase state={state} locale={locale} />
  }
  if (!displayPlayer || !currentPlayer) return null

  const farmView = {
    ...farmProjection,
    locale,
    viewerPlayerId: perspectivePlayerId,
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
      {state.enableThroughTheSeasons && state.throughTheSeasons ? (
        <section className="replay-board__action">
          <SeasonsBoard
            locale={locale}
            throughTheSeasons={state.throughTheSeasons}
            seasonActions={seasonActions}
            players={state.players}
            canTakeAction={() => false}
            takeAction={noOp}
          />
        </section>
      ) : null}
      {state.enableFarmersOfTheMoor && state.farmersOfTheMoor ? (
        <section className="replay-board__action">
          <SpecialActionsPanel
            locale={locale}
            playerCount={state.players.length}
            cards={state.farmersOfTheMoor.specialActionCards}
            currentPlayerId={currentPlayer.id}
            availability={currentPlayer.moorSpecialActionAvailability}
            canTakeSpecialAction={() => false}
            selected={null}
            onTakeAction={noOp}
          />
        </section>
      ) : null}
      <MajorImprovements
        locale={locale}
        expansion={majorSupplyExpansion}
        onExpansionChange={setMajorSupplyExpansion}
        availableMajorImprovements={state.availableMajorImprovements}
        majorImprovementSupply={state.majorImprovementSupply}
        isSelectingMajor={false}
        selectableMajorIds={new Set()}
        cardAvailability={{}}
        isInteractive={false}
        resolveChoice={noOp}
        futureCardResources={{}}
        devMode={false}
      />
      <section className="replay-board__farm" aria-label="Player farm">
        <StageBar currentRound={state.round} locale={locale} />
        <PlayerTabs
          locale={locale}
          players={state.players.map((player, index) => ({
            id: player.id,
            name: getPlayerDisplayName(locale, player.name, index, player.nameIsDefault),
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

export function ReplayBoard(props: Parameters<typeof ReplayBoardContent>[0]) {
  return <ActionReferencePlayerCount.Provider value={props.frame.players.length}>
    <ReplayBoardContent {...props} />
  </ActionReferencePlayerCount.Provider>
}
