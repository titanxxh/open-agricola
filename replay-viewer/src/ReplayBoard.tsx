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
import { MajorImprovements } from '../../client/components/board/MajorImprovements'
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

const setupText = {
  en: {
    draft: 'Card draft replay',
    parent: 'Parent Card selection replay',
    round: 'Round',
    pool: 'Available cards',
    kept: 'Already kept',
    submitted: 'Submitted choice',
    mothers: 'Mother candidates',
    fathers: 'Father candidates',
    waiting: 'Not submitted',
    hidden: 'Hidden card',
  },
  zh: {
    draft: '卡牌轮抽回放',
    parent: '父母卡选择回放',
    round: '轮次',
    pool: '当前候选',
    kept: '已经保留',
    submitted: '已提交选择',
    mothers: '母亲卡候选',
    fathers: '父亲卡候选',
    waiting: '尚未提交',
    hidden: '隐藏卡牌',
  },
} as const

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
          aria-label={id === '?' ? setupText[locale].hidden : id}
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
  const text = setupText[locale]
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
              <h3>{player?.name ?? playerId}</h3>
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
  const text = setupText[locale]
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
