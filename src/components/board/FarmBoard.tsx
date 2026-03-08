import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { FarmTilePosition, PlayerState, Resource } from '../../../shared/game/types'
import { formatAnimalCounts, formatResources } from '../../../shared/logic/format'
import { getMinorImprovement } from '../../../shared/game/minor-improvements'
import { getOccupation } from '../../../shared/game/occupations'
import { canPayResources } from '../../../shared/actions/effects/pay'
import { emptyResources } from '../../../shared/logic/state'
import type { AnimalReorgState } from '../../types/ui'
import { ResourceLine } from '../common/ResourceLine'
import { PlayerCard, type CardType } from '../common/PlayerCard'

type FarmCell = {
  key: string
  type: 'tile' | 'post' | 'fence-h' | 'fence-v'
  tileRow?: number
  tileCol?: number
  fenceId?: string
}

type FieldInfo = { crop: 'grain' | 'vegetable' | null; remaining: number }

type Props = {
  locale: Locale
  players: PlayerState[]
  currentPlayer: PlayerState
  displayPlayer: PlayerState
  devMode: boolean
  currentStartPlayerId: string
  nextStartPlayerId: string
  playedCards: string[]
  farmCells: FarmCell[]
  roomPositions: Set<string>
  fieldPositions: Set<string>
  fieldMap: Map<string, FieldInfo>
  stablePositions: Set<string>
  pendingRoomSet: Set<string>
  pendingStableSet: Set<string>
  canSelectRooms: boolean
  canSelectStables: boolean
  canSelectPlow: boolean
  canSelectSow: boolean
  maxStableSelections: number
  plowSelectableSet: Set<string>
  pendingPlowTile: FarmTilePosition | null
  pendingSowSelections: Record<string, 'grain' | 'vegetable'>
  sowRemaining: { grain: number; vegetable: number }
  pastureTiles: Map<string, { pastureId: string; isCorner: boolean }>
  pastureDisplayMap: Map<
    string,
    { animalType: 'sheep' | 'boar' | 'cattle' | null; animalCount: number }
  >
  pastureCapacityMap: Map<string, number>
  houseDisplay: { animalType: 'sheep' | 'boar' | 'cattle' | null; animalCount: number }
  stableDisplayMap: Map<
    string,
    { animalType: 'sheep' | 'boar' | 'cattle' | null; animalCount: number }
  >
  isReorgActive: boolean
  reorgRemaining: { sheep: number; boar: number; cattle: number } | null
  hasReorgOverflow: boolean
  animalReorg: AnimalReorgState | null
  pendingFenceSet: Set<string>
  existingFenceSet: Set<string>
  canSelectFences: boolean
  toggleRoomTile: (tile: FarmTilePosition) => void
  toggleStableTile: (tile: FarmTilePosition) => void
  togglePlowTile: (tile: FarmTilePosition) => void
  updateSowSelection: (tile: FarmTilePosition, value: string) => void
  toggleFenceEdge: (edgeId: string) => void
  adjustReorgAnimal: (
    zoneId: string,
    animalType: 'sheep' | 'boar' | 'cattle',
    delta: number,
  ) => void
  confirmAnimalReorg: () => void
  cancelAnimalDiscardPrompt: () => void
  setViewPlayerId: (value: string) => void
  isSelectingMinor: boolean
  isSelectingOccupation: boolean
  isSelectingImprovementAny: boolean
  futureCardResources: Record<
    string,
    {
      playerId: string
      name: string
      color: PlayerState['color']
      resources: Partial<Resource>
    }[]
  >
  resolveChoice: (value: string) => void
  isInteractive: boolean
}

export const FarmBoard = ({
  locale,
  players,
  currentPlayer,
  displayPlayer,
  currentStartPlayerId,
  nextStartPlayerId,
  playedCards,
  farmCells,
  roomPositions,
  fieldPositions,
  fieldMap,
  stablePositions,
  pendingRoomSet,
  pendingStableSet,
  canSelectRooms,
  canSelectStables,
  canSelectPlow,
  canSelectSow,
  maxStableSelections,
  plowSelectableSet,
  pendingPlowTile,
  pendingSowSelections,
  sowRemaining,
  pastureTiles,
  pastureDisplayMap,
  pastureCapacityMap,
  houseDisplay,
  stableDisplayMap,
  isReorgActive,
  reorgRemaining,
  hasReorgOverflow,
  animalReorg,
  pendingFenceSet,
  existingFenceSet,
  canSelectFences,
  toggleRoomTile,
  toggleStableTile,
  togglePlowTile,
  updateSowSelection,
  toggleFenceEdge,
  adjustReorgAnimal,
  confirmAnimalReorg,
  cancelAnimalDiscardPrompt,
  setViewPlayerId,
  isSelectingMinor,
  isSelectingOccupation,
  isSelectingImprovementAny,
  futureCardResources,
  resolveChoice,
  devMode,
  isInteractive,
}: Props) => {
  const canInteractHand = displayPlayer.id === currentPlayer.id && isInteractive
  const houseLabelKey = (() => {
    if (displayPlayer.roomTiles.length === 0) return null
    let target = displayPlayer.roomTiles[0]
    displayPlayer.roomTiles.forEach((tile) => {
      if (tile.row > target.row) {
        target = tile
        return
      }
      if (tile.row === target.row && tile.col < target.col) {
        target = tile
      }
    })
    return `${target.row}-${target.col}`
  })()

  return (
    <section className="center">
    <div className="farm-header">
      <div>
        <h2>{t(locale, 'ui.farmTitle')}</h2>
        <div className="player-summary">{displayPlayer.name}</div>
        <div className="player-resources">
          <ResourceLine
            locale={locale}
            resources={displayPlayer.resources}
            emptyLabel={t(locale, 'ui.noResources')}
          />
        </div>
      </div>
      <div className="player-tabs-container">
        <div className="player-tabs">
          {players.map((player) => (
            <button
              key={player.id}
              className={`player-tab ${player.id === displayPlayer.id ? 'active' : ''}`}
              onClick={() => setViewPlayerId(player.id)}
            >
              <span className="player-tab-label">
                {player.name}
                {currentPlayer.id === player.id ? (
                  <span
                    className="turn-marker"
                    title={t(locale, 'ui.activePlayer')}
                  >
                    ◀
                  </span>
                ) : null}
                {currentStartPlayerId === player.id ? (
                  <span
                    className="start-marker current"
                    title={t(locale, 'ui.startPlayer')}
                  >
                    ★
                  </span>
                ) : null}
                {nextStartPlayerId === player.id ? (
                  <span
                    className="start-marker next"
                    title={t(locale, 'ui.nextStartPlayer')}
                  >
                    ➜
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
        <div className="player-tabs-legend">
          <div className="legend-item">
            <span className="turn-marker">◀</span>
            <span className="legend-text">{t(locale, 'ui.legendActive')}</span>
          </div>
          <div className="legend-item">
            <span className="start-marker current">★</span>
            <span className="legend-text">{t(locale, 'ui.legendStart')}</span>
          </div>
          <div className="legend-item">
            <span className="start-marker next">➜</span>
            <span className="legend-text">{t(locale, 'ui.legendNextStart')}</span>
          </div>
        </div>
      </div>
    </div>
    <div className="farm-stats">
      <div className="farm-item">
        <div className="farm-label">{t(locale, 'ui.rooms')}</div>
        <div className="farm-value">{displayPlayer.rooms}</div>
      </div>
      <div className="farm-item">
        <div className="farm-label">{t(locale, 'ui.houseType')}</div>
        <div className="farm-value">
          {displayPlayer.houseType === 'clay'
            ? t(locale, 'ui.houseClay')
            : displayPlayer.houseType === 'stone'
              ? t(locale, 'ui.houseStone')
              : t(locale, 'ui.houseWood')}
        </div>
      </div>
      <div className="farm-item">
        <div className="farm-label">{t(locale, 'ui.fields')}</div>
        <div className="farm-value">{displayPlayer.fields.length}</div>
      </div>
      <div className="farm-item">
        <div className="farm-label">{t(locale, 'ui.fences')}</div>
        <div className="farm-value">{displayPlayer.fences}</div>
      </div>
      <div className="farm-item">
        <div className="farm-label">{t(locale, 'ui.family')}</div>
        <div className="farm-value">{displayPlayer.familySize}</div>
      </div>
      <div className="farm-item">
        <div className="farm-label">{t(locale, 'ui.workers')}</div>
        <div className="farm-value">{displayPlayer.workersAvailable}</div>
      </div>
    </div>
    <div className="farm-grid">
      {farmCells.map((cell) => {
        if (cell.type === 'tile') {
          const tileRow = cell.tileRow ?? 0
          const tileCol = cell.tileCol ?? 0
          const tileKey = `${tileRow}-${tileCol}`
          const isRoom = roomPositions.has(tileKey)
          const isField = fieldPositions.has(tileKey)
          const isStable = stablePositions.has(tileKey)
          const isRoomSelectable =
            isInteractive &&
            canSelectRooms &&
            !isRoom &&
            !isField &&
            !isStable &&
            !pastureTiles.has(tileKey)
          const isRoomSelected = isInteractive && pendingRoomSet.has(tileKey)
          const isStableSelected = isInteractive && pendingStableSet.has(tileKey)
          const maxStableReached = pendingStableSet.size >= maxStableSelections
          const isStableSelectable =
            isInteractive &&
            canSelectStables &&
            !isRoom &&
            !isField &&
            !isStable &&
            (!maxStableReached || isStableSelected)
          const isPlowSelectable =
            isInteractive && canSelectPlow && plowSelectableSet.has(tileKey)
          const isPlowSelected =
            isInteractive && pendingPlowTile
            ? `${pendingPlowTile.row}-${pendingPlowTile.col}` === tileKey
            : false
          const isTileSelectable =
            isRoomSelectable || isPlowSelectable || isStableSelectable
          const isTileSelected =
            isRoomSelected || isPlowSelected || isStableSelected
          const fieldInfo = fieldMap.get(tileKey)
          const isEmptyField = !!fieldInfo && fieldInfo.crop === null
          const cropLabel =
            fieldInfo?.crop && fieldInfo.remaining > 0
              ? `${t(locale, `resources.${fieldInfo.crop}`)} ${fieldInfo.remaining}`
              : ''
          const isSowSelectable = isInteractive && canSelectSow && isEmptyField
          const currentSowChoice = isInteractive ? (pendingSowSelections[tileKey] ?? '') : ''
          const availableGrain =
            sowRemaining.grain + (currentSowChoice === 'grain' ? 1 : 0)
          const availableVegetable =
            sowRemaining.vegetable + (currentSowChoice === 'vegetable' ? 1 : 0)
          const pastureInfo = pastureTiles.get(tileKey)
          const pastureDisplay = pastureInfo
            ? pastureDisplayMap.get(pastureInfo.pastureId)
            : null
          const pastureCapacity = pastureInfo
            ? pastureCapacityMap.get(pastureInfo.pastureId) ?? 0
            : 0
          const pastureAnimalType = pastureDisplay?.animalType ?? null
          const pastureAnimalCount = pastureDisplay?.animalCount ?? 0
          const pastureLabel = pastureInfo?.isCorner
            ? pastureAnimalType
              ? `${pastureAnimalCount}${t(
                  locale,
                  `resources.${pastureAnimalType}`,
                )}/${pastureCapacity}`
              : `0/${pastureCapacity}`
            : null
          const houseLabel =
            tileKey === houseLabelKey
              ? houseDisplay.animalCount > 0
                ? `${houseDisplay.animalCount}${t(
                    locale,
                    `resources.${houseDisplay.animalType}`,
                  )}/1`
                : '0/1'
              : null
          const stableDisplay = stableDisplayMap.get(tileKey)
          const stableLabel = stableDisplay
            ? stableDisplay.animalType
              ? `${stableDisplay.animalCount}${t(
                  locale,
                  `resources.${stableDisplay.animalType}`,
                )}/1`
              : '0/1'
            : null
          return (
            <div
              key={cell.key}
              className={`farm-cell farm-tile${
                isRoom
                  ? ' room'
                  : isField
                    ? ' field'
                    : isStable
                      ? ' stable'
                      : ''
              }${isTileSelectable ? ' selectable' : ''}${isTileSelected ? ' selected' : ''}${
                isStableSelectable ? ' stable-selectable' : ''
              }${isStableSelected ? ' stable-selected' : ''}`}
              onClick={() => {
                if (isRoomSelectable) {
                  toggleRoomTile({ row: tileRow, col: tileCol })
                  return
                }
                if (isStableSelectable) {
                  toggleStableTile({ row: tileRow, col: tileCol })
                  return
                }
                if (isPlowSelectable) {
                  togglePlowTile({ row: tileRow, col: tileCol })
                }
              }}
            >
              <span className="farm-tile-text">
                {isRoom
                  ? displayPlayer.houseType === 'clay'
                    ? t(locale, 'ui.houseClay')
                    : displayPlayer.houseType === 'stone'
                      ? t(locale, 'ui.houseStone')
                      : t(locale, 'ui.houseWood')
                  : isField
                    ? t(locale, 'ui.tileField')
                    : isStable
                      ? t(locale, 'ui.tileStable')
                      : t(locale, 'ui.tileEmpty')}
              </span>
              {isSowSelectable ? (
                <select
                  value={currentSowChoice}
                  onChange={(event) =>
                    updateSowSelection({ row: tileRow, col: tileCol }, event.target.value)
                  }
                  disabled={!isInteractive}
                >
                  <option value="">{t(locale, 'ui.sowSelectNone')}</option>
                  {availableGrain > 0 ? (
                    <option value="grain">{t(locale, 'resources.grain')}</option>
                  ) : null}
                  {availableVegetable > 0 ? (
                    <option value="vegetable">{t(locale, 'resources.vegetable')}</option>
                  ) : null}
                </select>
              ) : null}
              {cropLabel ? <div className="field-crop">{cropLabel}</div> : null}
              {pastureInfo?.isCorner ? (
                <div className="pasture-info">
                  <div className="pasture-count">{pastureLabel}</div>
                  {isReorgActive ? (
                    <div className="pasture-controls">
                      {(['sheep', 'boar', 'cattle'] as const).map((animalType) => {
                        const count =
                          pastureAnimalType === animalType ? pastureAnimalCount : 0
                        const canDecrease =
                          pastureAnimalType === animalType && count > 0
                        const canIncrease =
                          (reorgRemaining?.[animalType] ?? 0) > 0 &&
                          pastureCapacity > 0 &&
                          (pastureAnimalType !== animalType || count < pastureCapacity)
                        return (
                          <div key={animalType} className="pasture-control-row">
                            <span className="pasture-control-label">
                              {t(locale, `resources.${animalType}`)}
                            </span>
                            <button
                              onClick={() =>
                                adjustReorgAnimal(pastureInfo.pastureId, animalType, -1)
                              }
                              disabled={!isInteractive || !canDecrease}
                            >
                              -
                            </button>
                            <span className="pasture-control-value">{count}</span>
                            <button
                              onClick={() =>
                                adjustReorgAnimal(pastureInfo.pastureId, animalType, 1)
                              }
                              disabled={!isInteractive || !canIncrease}
                            >
                              +
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {houseLabel ? (
                <div className="pasture-info">
                  <div className="pasture-count">{houseLabel}</div>
                  {isReorgActive ? (
                    <div className="pasture-controls">
                      {(['sheep', 'boar', 'cattle'] as const).map((animalType) => {
                        const count =
                          houseDisplay.animalType === animalType
                            ? houseDisplay.animalCount
                            : 0
                        const canDecrease =
                          houseDisplay.animalType === animalType && count > 0
                        const canIncrease =
                          (reorgRemaining?.[animalType] ?? 0) > 0 &&
                          (houseDisplay.animalType !== animalType || count < 1)
                        return (
                          <div key={animalType} className="pasture-control-row">
                            <span className="pasture-control-label">
                              {t(locale, `resources.${animalType}`)}
                            </span>
                            <button
                              onClick={() =>
                                adjustReorgAnimal('house', animalType, -1)
                              }
                              disabled={!isInteractive || !canDecrease}
                            >
                              -
                            </button>
                            <span className="pasture-control-value">{count}</span>
                            <button
                              onClick={() => adjustReorgAnimal('house', animalType, 1)}
                              disabled={!isInteractive || !canIncrease}
                            >
                              +
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {stableLabel ? (
                <div className="pasture-info">
                  <div className="pasture-count">{stableLabel}</div>
                  {isReorgActive ? (
                    <div className="pasture-controls">
                      {(['sheep', 'boar', 'cattle'] as const).map((animalType) => {
                        const count =
                          stableDisplay?.animalType === animalType
                            ? stableDisplay.animalCount
                            : 0
                        const canDecrease =
                          stableDisplay?.animalType === animalType && count > 0
                        const canIncrease =
                          (reorgRemaining?.[animalType] ?? 0) > 0 &&
                          (stableDisplay?.animalType !== animalType || count < 1)
                        return (
                          <div key={animalType} className="pasture-control-row">
                            <span className="pasture-control-label">
                              {t(locale, `resources.${animalType}`)}
                            </span>
                            <button
                              onClick={() =>
                                adjustReorgAnimal(`stable:${tileKey}`, animalType, -1)
                              }
                              disabled={!isInteractive || !canDecrease}
                            >
                              -
                            </button>
                            <span className="pasture-control-value">{count}</span>
                            <button
                              onClick={() =>
                                adjustReorgAnimal(`stable:${tileKey}`, animalType, 1)
                              }
                              disabled={!isInteractive || !canIncrease}
                            >
                              +
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )
        }
        if (cell.type === 'fence-h' || cell.type === 'fence-v') {
          const edgeId = cell.fenceId ?? ''
          const isExisting = edgeId && existingFenceSet.has(edgeId)
          const isPending = isInteractive && edgeId && pendingFenceSet.has(edgeId)
          const isActive = isExisting || isPending
          const isSelectable = isInteractive && canSelectFences && edgeId && !isExisting
          return (
            <div
              key={cell.key}
              className={`farm-cell farm-${cell.type}${isActive ? ' active' : ''}${
                isPending ? ' selected' : ''
              }${isSelectable ? ' selectable' : ''}`}
              onClick={() => {
                if (isSelectable && edgeId) {
                  toggleFenceEdge(edgeId)
                }
              }}
            />
          )
        }
        return <div key={cell.key} className={`farm-cell farm-${cell.type}`} />
      })}
    </div>
    {isReorgActive ? (
      <div className="reorg-panel">
        <div className="reorg-panel-title">{t(locale, 'ui.reorgPendingTitle')}</div>
        <div className="reorg-panel-summary">
          <div className="reorg-panel-row">
            <span>{t(locale, 'ui.reorgPending')}</span>
            <span>
              {formatAnimalCounts(
                locale,
                reorgRemaining ?? { sheep: 0, boar: 0, cattle: 0 },
              )}
            </span>
          </div>
          {hasReorgOverflow ? (
            <div className="reorg-error">{t(locale, 'ui.reorgOverAssign')}</div>
          ) : null}
        </div>
        {animalReorg?.confirmDiscard ? (
          <div className="reorg-warning">
            <div>
              {t(locale, 'ui.reorgDiscardPrompt', {
                animals: formatAnimalCounts(
                  locale,
                  reorgRemaining ?? { sheep: 0, boar: 0, cattle: 0 },
                ),
              })}
            </div>
            <div className="reorg-actions">
              <button onClick={cancelAnimalDiscardPrompt} disabled={!isInteractive}>
                {t(locale, 'ui.reorgAdjustMore')}
              </button>
              <button onClick={confirmAnimalReorg} disabled={!isInteractive}>
                {t(locale, 'ui.reorgDiscardConfirm')}
              </button>
            </div>
          </div>
        ) : (
          <div className="reorg-actions">
            <button onClick={confirmAnimalReorg} disabled={!isInteractive || hasReorgOverflow}>
              {t(locale, 'ui.reorgConfirm')}
            </button>
          </div>
        )}
      </div>
    ) : null}

    <div className="played-cards">
      <h3>{t(locale, 'ui.playedCards')}</h3>
      <div className="played-row">
        {playedCards.map((cardId, index) => {
          const [kind, rawId] = cardId.includes(':')
            ? cardId.split(':')
            : ['', cardId]
          const isMinor = kind === 'minor'
          const isOccupation = kind === 'occupation'
          const cardType: CardType = isOccupation ? 'occupation' : isMinor ? 'minor' : 'major'
          const futureEntries = futureCardResources[rawId] ?? []
          const cardStateCounters = displayPlayer.cardStates?.[rawId]?.counters ?? {}
          const hasCounters = Object.values(cardStateCounters).some((count) => count > 0)
          
          return (
            <div key={`played-${index}`} className="played-card-wrapper">
              <PlayerCard
                locale={locale}
                cardId={rawId}
                cardType={cardType}
                devMode={devMode}
              />
              {futureEntries.length > 0 || hasCounters ? (
                <div className="card-future">
                  {Object.entries(cardStateCounters).map(([resKey, count]) => {
                    if (count <= 0) return null
                    const isKnownResource = resKey in emptyResources
                    return (
                      <div
                        key={`state-${rawId}-${resKey}`}
                        className={isKnownResource ? `resource-chip resource-${resKey}` : 'card-future-item'}
                        title={`${count} ${t(locale, `resources.${resKey}`)}`}
                      >
                        <span className="resource-chip-text">
                          {count} {t(locale, `resources.${resKey}`)}
                        </span>
                      </div>
                    )
                  })}
                  {futureEntries.map((entry, entryIndex) => {
                    const label = formatResources(
                      locale,
                      { ...emptyResources, ...entry.resources },
                      true,
                    )
                    return (
                      <div
                        key={`future-${rawId}-${entry.playerId}-${entryIndex}`}
                        className="card-future-item"
                        title={`${entry.name}: ${label}`}
                      >
                        <span className={`card-future-dot meeple-${entry.color}`} />
                        <ResourceLine
                          locale={locale}
                          resources={{ ...emptyResources, ...entry.resources }}
                          className="card-future-text"
                        />
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
    <div className="hand-cards">
      <h3>{t(locale, 'ui.handCards')}</h3>
      {displayPlayer.id === currentPlayer.id || devMode ? (
        <div className="hand-sections">
          <div className="hand-section occupation">
            <div className="hand-section-title">{t(locale, 'ui.occupationCards')}</div>
            <div className="hand-row">
              {displayPlayer.occupationHand.length === 0 ? (
                <div className="hand-empty">{t(locale, 'ui.noOccupationCards')}</div>
              ) : (
                displayPlayer.occupationHand.map((cardId) => {
                  const occupation = getOccupation(cardId)
                  const canPlay = occupation
                    ? canPayResources(displayPlayer, occupation.cost ?? {})
                    : false
                  const canInteract = canInteractHand && canPlay
                  return (
                    <PlayerCard
                      key={`occupation-${cardId}`}
                      locale={locale}
                      cardId={cardId}
                      cardType="occupation"
                      devMode={devMode}
                      onClick={() => {
                        if (isSelectingOccupation && canInteract) {
                          resolveChoice(cardId)
                        }
                      }}
                      disabled={!canInteract}
                      selectable={isSelectingOccupation && canInteract}
                    />
                  )
                })
              )}
            </div>
          </div>
          <div className="hand-section minor">
            <div className="hand-section-title">{t(locale, 'ui.minorCards')}</div>
            <div className="hand-row">
              {displayPlayer.minorHand.length === 0 ? (
                <div className="hand-empty">{t(locale, 'ui.noHandCards')}</div>
              ) : (
                displayPlayer.minorHand.map((cardId) => {
                  const improvement = getMinorImprovement(cardId)
                  const canPlay = improvement
                    ? canPayResources(displayPlayer, improvement.cost ?? {})
                    : false
                  const canInteract = canInteractHand && canPlay
                  const canSelect =
                    (isSelectingMinor || isSelectingImprovementAny) && canInteract
                  return (
                    <PlayerCard
                      key={`hand-${cardId}`}
                      locale={locale}
                      cardId={cardId}
                      cardType="minor"
                      devMode={devMode}
                      onClick={() => {
                        if (canSelect) {
                          const value = isSelectingImprovementAny
                            ? `minor:${cardId}`
                            : cardId
                          resolveChoice(value)
                        }
                      }}
                      disabled={!canInteract}
                      selectable={canSelect}
                    />
                  )
                })
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="hand-hidden">{t(locale, 'ui.handHidden')}</div>
      )}
    </div>
  </section>
  )
}
