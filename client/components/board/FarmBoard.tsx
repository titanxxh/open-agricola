import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type {
  CardResourceStats,
  CropStack,
  FarmTilePosition,
  PlayerState,
  Resource,
} from '../../../shared/game/types'
import { formatAnimalCounts, formatResources } from '../../../shared/logic/format'
import { emptyResources } from '../../../shared/logic/state-constants'
import { familySize } from '../../../shared/game/player'
import { readCardResourceStats } from '../../../shared/cards/helpers/card-state'
import { getWorkerHeldOnCard } from '../../../shared/cards/helpers/card-held-workers'
import { getFenceCount } from '../../../shared/actions/effects/fencing'
import { collectLockedFarmTileKeys } from '../../../shared/cards/card-effects'
import { isBorderEdge } from '../../../shared/game/farm'
import type { AnimalReorgState, ExtraSowTarget, PendingSowCrop } from '../../types/ui'
import { ResourceLine } from '../common/ResourceLine'
import { PlayerCard, type CardType } from '../common/PlayerCard'

type AnimalType = 'sheep' | 'boar' | 'cattle'

const AnimalCount = ({
  count,
  animalType,
  capacity,
}: {
  count: number
  animalType: AnimalType | null
  capacity: number
}) => {
  if (!animalType) {
    return (
      <span className="pasture-count">
        0/{capacity}
      </span>
    )
  }
  return (
    <span className="pasture-count">
      {count}
      <span className={`res-icon res-icon-${animalType}`} style={{ marginLeft: '2px', marginRight: '2px' }} />
      /{capacity}
    </span>
  )
}

const FieldCropStack = ({
  locale,
  stacks,
}: {
  locale: Locale
  stacks: CropStack[]
}) => {
  if (stacks.length === 0) return null
  const tooltip = stacks
    .map((s) => `${t(locale, `resources.${s.kind}`)} ${s.remaining}`)
    .join(' · ')
  // Dominant kind = top stack (used for backward-compat class on the outer span
  // so legacy single-stack visuals stay identical).
  const topKind = stacks[stacks.length - 1].kind
  return (
    <div
      className={`field-crop field-crop-${topKind}`}
      title={tooltip}
      aria-label={tooltip}
    >
      {stacks.map((stack, stackIdx) => (
        <span
          key={`stack-${stackIdx}-${stack.kind}`}
          className={`field-crop-segment field-crop-${stack.kind}`}
        >
          {Array.from({ length: stack.remaining }, (_, index) => (
            <span
              key={`${stack.kind}-${stackIdx}-${index}`}
              className={`res-icon res-icon-${stack.kind} field-crop-icon`}
              aria-hidden="true"
            />
          ))}
        </span>
      ))}
    </div>
  )
}

const SowChoiceButtons = ({
  locale,
  tileKey,
  currentValue,
  allowedCrops,
  availableGrain,
  availableVegetable,
  availableWood,
  isInteractive,
  updateSowSelection,
  tile,
}: {
  locale: Locale
  tileKey: string
  currentValue: PendingSowCrop | ''
  allowedCrops: PendingSowCrop[]
  availableGrain: number
  availableVegetable: number
  availableWood: number
  isInteractive: boolean
  updateSowSelection: (tile: FarmTilePosition, value: string) => void
  tile: FarmTilePosition
}) => {
  const options = ([
    {
      crop: 'grain',
      enabled: allowedCrops.includes('grain') && availableGrain > 0,
    },
    {
      crop: 'vegetable',
      enabled: allowedCrops.includes('vegetable') && availableVegetable > 0,
    },
    {
      crop: 'wood',
      enabled: allowedCrops.includes('wood') && availableWood > 0,
    },
  ] as const).filter((option) => option.enabled || currentValue === option.crop)

  return (
    <div className="sow-choice-group" role="radiogroup" aria-label={`${tileKey}-sow-choice`}>
      <button
        type="button"
        className={`sow-choice-button sow-choice-clear${currentValue === '' ? ' active' : ''}`}
        onClick={() => updateSowSelection(tile, '')}
        disabled={!isInteractive}
        aria-pressed={currentValue === ''}
        title={t(locale, 'ui.sowSelectNone')}
      >
        {t(locale, 'ui.sowSelectNone')}
      </button>
      {options.map(({ crop }) => (
        <button
          key={crop}
          type="button"
          className={`sow-choice-button${currentValue === crop ? ' active' : ''}`}
          onClick={() => updateSowSelection(tile, crop)}
          disabled={!isInteractive}
          aria-pressed={currentValue === crop}
          title={t(locale, `resources.${crop}`)}
        >
          <span className={`res-icon res-icon-${crop}`} aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}

type FarmCell = {
  key: string
  type: 'tile' | 'post' | 'fence-h' | 'fence-v'
  tileRow?: number
  tileCol?: number
  fenceId?: string
}

type FieldInfo = { stacks: CropStack[] }

const humanizeSourceCard = (sourceCard: string) => {
  const displayId = sourceCard.includes('_')
    ? sourceCard.split('_').slice(1).join('_')
    : sourceCard
  return displayId
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
}

const getExtraSowTargetLabel = (sourceCard: string | undefined, tileKey: string) =>
  sourceCard ? humanizeSourceCard(sourceCard) || sourceCard : tileKey

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
  roomSelectableSet: Set<string>
  stableSelectableSet: Set<string>
  maxStableSelections: number
  plowSelectableSet: Set<string>
  pendingPlowTile: FarmTilePosition | null
  positionSelectableSet: Set<string>
  pendingPositionSelections: Set<string>
  togglePositionSelection: (tile: FarmTilePosition) => void
  pendingSowSelections: Record<string, PendingSowCrop>
  sowRemaining: Record<PendingSowCrop, number>
  sowSelectableMap: Map<string, PendingSowCrop[]>
  extraSowTargets: ExtraSowTarget[]
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
  pendingPalisadeSet?: Set<string>
  existingFenceSet: Set<string>
  fenceSelectableSet: Set<string>
  fencePlacementMode?: 'fence' | 'palisade'
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
  selectableMinorIds: Set<string>
  selectableOccupationIds: Set<string>
  cardAvailability: Record<string, boolean>
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
  occupationHandSelection?: {
    kind: 'occupation-hand'
    selectableCards: string[]
    minSelections: number
    maxSelections: number
  }
  onConfirmOccupationHandSelection?: (cardIds: string[]) => void
}

type TooltipPosition = {
  top: number
  left: number
}

const hasAnyResource = (resources: Partial<Resource>) =>
  Object.values(resources).some((value) => typeof value === 'number' && value > 0)

const PlayedCardStats = ({
  locale,
  rawId,
  cardType,
  cardInfobox,
  devMode,
  futureEntries,
  displayCounters,
  resourceStats,
  stack,
  cardStacks,
  heldWorkerId,
  playerColor,
}: {
  locale: Locale
  rawId: string
  cardType: CardType
  cardInfobox?: string
  devMode: boolean
  futureEntries: {
    playerId: string
    name: string
    color: PlayerState['color']
    resources: Partial<Resource>
  }[]
  displayCounters: Record<string, number>
  resourceStats?: CardResourceStats
  stack: string[]
  cardStacks?: CropStack[] | null
  heldWorkerId?: string
  playerColor?: PlayerState['color']
}) => {
  const [open, setOpen] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState<TooltipPosition | null>(null)
  const triggerRef = useRef<HTMLDivElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const bonusVp = displayCounters.bonusVp ?? 0
  const visibleCounters = Object.fromEntries(
    Object.entries(displayCounters).filter(([key]) => key !== 'bonusVp'),
  )
  const hasCardStacks = !!cardStacks && cardStacks.some((s) => s.remaining > 0)
  const hasCounters = Object.keys(visibleCounters).length > 0 || stack.length > 0 || hasCardStacks
  const hasPaid = hasAnyResource(resourceStats?.paid ?? {})
  const hasGained = hasAnyResource(resourceStats?.gained ?? {})
  const hasResourceStats = hasPaid || hasGained || bonusVp > 0

  useLayoutEffect(() => {
    if (!open || !hasResourceStats) return

    const updatePosition = () => {
      if (!triggerRef.current || !tooltipRef.current) return

      const margin = 12
      const gap = 10
      const triggerRect = triggerRef.current.getBoundingClientRect()
      const tooltipRect = tooltipRef.current.getBoundingClientRect()

      let left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2
      left = Math.max(margin, Math.min(left, window.innerWidth - tooltipRect.width - margin))

      let top = triggerRect.top - tooltipRect.height - gap
      if (top < margin) {
        top = triggerRect.bottom + gap
      }
      if (top + tooltipRect.height > window.innerHeight - margin) {
        top = Math.max(margin, window.innerHeight - tooltipRect.height - margin)
      }

      setTooltipPosition({ top, left })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, hasResourceStats])

  return (
    <div
      ref={triggerRef}
      className={`played-card-wrapper${hasResourceStats ? ' has-stats' : ''}`}
      tabIndex={hasResourceStats ? 0 : undefined}
      onMouseEnter={() => hasResourceStats && setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => hasResourceStats && setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <PlayerCard
        locale={locale}
        cardId={rawId}
        cardType={cardType}
        infobox={cardInfobox}
        devMode={devMode}
      />
      {futureEntries.length > 0 || hasCounters ? (
        <div className="card-future">
          {Object.entries(visibleCounters).map(([resKey, count]) => {
            if (count <= 0) return null
            const isKnownResource = resKey in emptyResources
            return (
              <div
                key={`state-${rawId}-${resKey}`}
                className={isKnownResource ? `resource-chip resource-${resKey}` : 'card-future-item'}
                title={`${count} ${t(locale, `resources.${resKey}`)}`}
              >
                {isKnownResource ? (
                  <>
                    <span className={`res-icon res-icon-${resKey}`} />
                    <span className="resource-chip-count">{count}</span>
                  </>
                ) : (
                  <span className="resource-chip-text">
                    {count} {t(locale, `resources.${resKey}`)}
                  </span>
                )}
              </div>
            )
          })}
          {stack.length > 0 && (
            <div className="card-stack">
              {[...stack].reverse().map((res, i) => (
                <span
                  key={`stack-${i}`}
                  className={`res-icon res-icon-${res}`}
                  title={`#${stack.length - i}: ${res}`}
                />
              ))}
            </div>
          )}
          {hasCardStacks && cardStacks && (
            <FieldCropStack locale={locale} stacks={cardStacks} />
          )}
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
      {heldWorkerId ? (
        <div
          className={`action-farmer action-farmer-${playerColor ?? 'red'} held-worker-marker`}
          data-testid={`played-card-held-worker-${rawId}`}
          title={t(locale, 'ui.heldWorkerOnCard')}
        />
      ) : null}
      {open && hasResourceStats ? (
        <div
          ref={tooltipRef}
          className="played-card-stats-tooltip"
          role="tooltip"
          style={{
            top: tooltipPosition?.top ?? -9999,
            left: tooltipPosition?.left ?? -9999,
          }}
        >
          <div className="played-card-stats-title">
            {t(locale, `occupations.${rawId}.name`).includes('.name') &&
            t(locale, `minorImprovements.${rawId}.name`).includes('.name') &&
            t(locale, `improvements.${rawId}.name`).includes('.name')
              ? rawId
              : t(
                  locale,
                  cardType === 'occupation'
                    ? `occupations.${rawId}.name`
                    : cardType === 'minor'
                      ? `minorImprovements.${rawId}.name`
                      : `improvements.${rawId}.name`,
                )}
          </div>
          {hasPaid ? (
            <div className="played-card-stats-section">
              <div className="played-card-stats-label">{t(locale, 'ui.cardStatsPaid')}</div>
              <ResourceLine
                locale={locale}
                resources={{ ...emptyResources, ...(resourceStats?.paid ?? {}) }}
                className="played-card-stats-line"
              />
            </div>
          ) : null}
          {hasGained || bonusVp > 0 ? (
            <div className="played-card-stats-section">
              <div className="played-card-stats-label">{t(locale, 'ui.cardStatsGained')}</div>
              <ResourceLine
                locale={locale}
                resources={{ ...emptyResources, ...(resourceStats?.gained ?? {}) }}
                bonusVp={bonusVp}
                className="played-card-stats-line"
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
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
  roomSelectableSet,
  stableSelectableSet,
  maxStableSelections,
  plowSelectableSet,
  pendingPlowTile,
  positionSelectableSet,
  pendingPositionSelections,
  togglePositionSelection,
  pendingSowSelections,
  sowRemaining,
  sowSelectableMap,
  extraSowTargets,
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
  pendingPalisadeSet,
  existingFenceSet,
  fenceSelectableSet,
  fencePlacementMode,
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
  selectableMinorIds,
  selectableOccupationIds,
  cardAvailability,
  futureCardResources,
  resolveChoice,
  devMode,
  isInteractive,
  occupationHandSelection,
  onConfirmOccupationHandSelection,
}: Props) => {
  const canInteractHand = displayPlayer.id === currentPlayer.id && isInteractive

  // Multi-select state for occupation-hand selection interaction
  const isMultiOccupationSelect = !!occupationHandSelection
  const [selectedOccIds, setSelectedOccIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    setSelectedOccIds(new Set())
  }, [occupationHandSelection?.selectableCards.join('|')])

  const toggleOcc = (id: string) => {
    setSelectedOccIds((prev) => {
      if (prev.has(id)) {
        const next = new Set(prev)
        next.delete(id)
        return next
      }
      if (occupationHandSelection && prev.size >= occupationHandSelection.maxSelections) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }
  const lockedTileKeys = collectLockedFarmTileKeys(displayPlayer)
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
        <div className="player-resources-compact">
          <span className="res-compact-group">
            <span className="res-icon res-icon-wood" /><span className="res-compact-num">{displayPlayer.resources.wood}</span>
            <span className="res-icon res-icon-clay" /><span className="res-compact-num">{displayPlayer.resources.clay}</span>
            <span className="res-icon res-icon-reed" /><span className="res-compact-num">{displayPlayer.resources.reed}</span>
            <span className="res-icon res-icon-stone" /><span className="res-compact-num">{displayPlayer.resources.stone}</span>
            <span className="res-icon res-icon-grain" /><span className="res-compact-num">{displayPlayer.resources.grain}</span>
            <span className="res-icon res-icon-vegetable" /><span className="res-compact-num">{displayPlayer.resources.vegetable}</span>
          </span>
          <span className="res-compact-divider" />
          <span className="res-compact-group">
            <span className="res-icon res-icon-food" /><span className="res-compact-num">{displayPlayer.resources.food}</span>
            <span className="res-icon res-icon-sheep" /><span className="res-compact-num">{displayPlayer.resources.sheep}</span>
            <span className="res-icon res-icon-boar" /><span className="res-compact-num">{displayPlayer.resources.boar}</span>
            <span className="res-icon res-icon-cattle" /><span className="res-compact-num">{displayPlayer.resources.cattle}</span>
            {displayPlayer.resources.begging > 0 && (<>
              <span className="res-icon res-icon-begging" /><span className="res-compact-num">{displayPlayer.resources.begging}</span>
            </>)}
          </span>
          <span className="res-compact-divider" />
          <span className="res-compact-group">
            <span className="res-compact-label">{locale === 'zh' ? '人' : 'F'}</span><span className="res-compact-num">{familySize(displayPlayer)}</span>
            <span className="res-compact-label">{locale === 'zh' ? '屋' : 'R'}</span><span className="res-compact-num">{displayPlayer.rooms}</span>
            <span className="res-icon res-icon-field" /><span className="res-compact-num">{displayPlayer.fields.length}</span>
            <span className="res-icon res-icon-fence-icon" /><span className="res-compact-num">{getFenceCount(displayPlayer)}</span>
            <span className="res-icon res-icon-barn" /><span className="res-compact-num">{displayPlayer.stableTiles?.length ?? 0}</span>
          </span>
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
            isInteractive && roomSelectableSet.has(tileKey)
          const isRoomSelected = isInteractive && pendingRoomSet.has(tileKey)
          const isStableSelected = isInteractive && pendingStableSet.has(tileKey)
          const maxStableReached = pendingStableSet.size >= maxStableSelections
          const isStableSelectable =
            isInteractive &&
            stableSelectableSet.has(tileKey) &&
            (!maxStableReached || isStableSelected)
          const isPlowSelectable =
            isInteractive && plowSelectableSet.has(tileKey)
          const isPlowSelected =
            isInteractive && pendingPlowTile
            ? `${pendingPlowTile.row}-${pendingPlowTile.col}` === tileKey
            : false
          const isFieldSelectable = isInteractive && positionSelectableSet.has(tileKey)
          const isFieldSelected = isInteractive && pendingPositionSelections.has(tileKey)
          const isTileSelectable =
            isRoomSelectable || isPlowSelectable || isStableSelectable || isFieldSelectable
          const isTileSelected =
            isRoomSelected || isPlowSelected || isStableSelected || isFieldSelected
          const isTileLocked = lockedTileKeys.has(tileKey)
          const fieldInfo = fieldMap.get(tileKey)
          const isEmptyField = !!fieldInfo && fieldInfo.stacks.length === 0
          const cropStack =
            fieldInfo && fieldInfo.stacks.length > 0
              ? (
                  <FieldCropStack
                    locale={locale}
                    stacks={fieldInfo.stacks}
                  />
                )
              : null
          const allowedSowCrops = sowSelectableMap.get(tileKey) ?? []
          const isSowSelectable =
            isInteractive && isEmptyField && allowedSowCrops.length > 0
          const currentSowChoice = isInteractive ? (pendingSowSelections[tileKey] ?? '') : ''
          const availableGrain =
            sowRemaining.grain + (currentSowChoice === 'grain' ? 1 : 0)
          const availableVegetable =
            sowRemaining.vegetable + (currentSowChoice === 'vegetable' ? 1 : 0)
          const availableWood =
            sowRemaining.wood + (currentSowChoice === 'wood' ? 1 : 0)
          const pastureInfo = pastureTiles.get(tileKey)
          const pastureDisplay = pastureInfo
            ? pastureDisplayMap.get(pastureInfo.pastureId)
            : null
          const pastureCapacity = pastureInfo
            ? pastureCapacityMap.get(pastureInfo.pastureId) ?? 0
            : 0
          const pastureAnimalType = pastureDisplay?.animalType ?? null
          const pastureAnimalCount = pastureDisplay?.animalCount ?? 0
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
              }${isTileLocked ? ' locked' : ''}${isTileSelectable ? ' selectable' : ''}${isTileSelected ? ' selected' : ''}${
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
                if (isFieldSelectable) {
                  togglePositionSelection({ row: tileRow, col: tileCol })
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
                <SowChoiceButtons
                  locale={locale}
                  tileKey={tileKey}
                  currentValue={currentSowChoice}
                  allowedCrops={allowedSowCrops}
                  availableGrain={availableGrain}
                  availableVegetable={availableVegetable}
                  availableWood={availableWood}
                  isInteractive={isInteractive}
                  updateSowSelection={updateSowSelection}
                  tile={{ row: tileRow, col: tileCol }}
                />
              ) : null}
              {cropStack}
              {pastureInfo?.isCorner ? (
                <div className="pasture-info">
                  <div className="pasture-count"><AnimalCount count={pastureAnimalCount} animalType={pastureAnimalType} capacity={pastureCapacity} /></div>
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
                  <div className="pasture-count"><AnimalCount count={houseDisplay.animalCount} animalType={houseDisplay.animalType} capacity={1} /></div>
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
                  <div className="pasture-count"><AnimalCount count={stableDisplay?.animalCount ?? 0} animalType={stableDisplay?.animalType ?? null} capacity={1} /></div>
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
              {isTileLocked && (
                <div className="farm-cell-locked-overlay">
                  <span className="farm-cell-lock-icon">🔒</span>
                </div>
              )}
            </div>
          )
        }
        if (cell.type === 'fence-h' || cell.type === 'fence-v') {
          const edgeId = cell.fenceId ?? ''
          const isExisting = edgeId && existingFenceSet.has(edgeId)
          const isPendingFence = isInteractive && edgeId && pendingFenceSet.has(edgeId)
          const isPendingPalisade =
            isInteractive && edgeId && !!pendingPalisadeSet && pendingPalisadeSet.has(edgeId)
          const isPending = isPendingFence || isPendingPalisade
          const isActive = isExisting || isPending
          const blockedForPalisade =
            fencePlacementMode === 'palisade' && !!edgeId && !isBorderEdge(edgeId)
          const isSelectable =
            isInteractive &&
            !!edgeId &&
            !isExisting &&
            fenceSelectableSet.has(edgeId) &&
            !blockedForPalisade
          const builtSegment = edgeId
            ? displayPlayer.fenceSegments.find((s) => s.edge === edgeId)
            : undefined
          const segmentType: 'fence' | 'palisade' | null = builtSegment
            ? builtSegment.type
            : isPendingPalisade
              ? 'palisade'
              : isPendingFence
                ? 'fence'
                : null
          return (
            <div
              key={cell.key}
              className={`farm-cell farm-${cell.type}${isActive ? ' active' : ''}${
                isPending ? ' selected' : ''
              }${segmentType ? ' ' + segmentType : ''}${isSelectable ? ' selectable' : ''}${blockedForPalisade ? ' palisade-disabled' : ''}`}
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
    {isInteractive && extraSowTargets.length > 0 ? (
      <div className="extra-sow-tray" aria-label="extra-sow-tray">
        <div className="extra-sow-targets">
          {extraSowTargets.map((target) => {
            const currentSowChoice = isInteractive ? (pendingSowSelections[target.key] ?? '') : ''
            const availableGrain =
              sowRemaining.grain + (currentSowChoice === 'grain' ? 1 : 0)
            const availableVegetable =
              sowRemaining.vegetable + (currentSowChoice === 'vegetable' ? 1 : 0)
            const availableWood =
              sowRemaining.wood + (currentSowChoice === 'wood' ? 1 : 0)
            return (
              <div key={target.key} className="extra-sow-target">
                <div className="extra-sow-label">
                  {getExtraSowTargetLabel(target.sourceCard, target.key)}
                </div>
                <SowChoiceButtons
                  locale={locale}
                  tileKey={target.key}
                  currentValue={currentSowChoice}
                  allowedCrops={target.allowedCrops}
                  availableGrain={availableGrain}
                  availableVegetable={availableVegetable}
                  availableWood={availableWood}
                  isInteractive={isInteractive}
                  updateSowSelection={updateSowSelection}
                  tile={target.tile}
                />
              </div>
            )
          })}
        </div>
      </div>
    ) : null}
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
          const cardInfobox = displayPlayer.cardStates?.[rawId]?.infobox
          const cardStateCounters = displayPlayer.cardStates?.[rawId]?.counters ?? {}
          const resourceStats = readCardResourceStats(displayPlayer, rawId)
          const cardStack = displayPlayer.cardStates?.[rawId]?.stack ?? []
          const rawCardCrop = displayPlayer.cardStates?.[rawId]?.extraData?.cardCrop as
            | { crop: 'grain' | 'vegetable'; remaining: number }
            | undefined
          const cardStacks: CropStack[] | null =
            rawCardCrop && rawCardCrop.remaining > 0
              ? [{ kind: rawCardCrop.crop, remaining: rawCardCrop.remaining }]
              : null
          const internalKeys = new Set(['usedRound'])
          const displayCounters = Object.fromEntries(
            Object.entries(cardStateCounters).filter(([key, count]) => !internalKeys.has(key) && count > 0),
          )
          const heldWorkerId = getWorkerHeldOnCard(displayPlayer, rawId)

          return (
            <PlayedCardStats
              key={`played-${index}`}
              locale={locale}
              rawId={rawId}
              cardType={cardType}
              cardInfobox={cardInfobox}
              devMode={devMode}
              futureEntries={futureEntries}
              displayCounters={displayCounters}
              resourceStats={resourceStats}
              stack={cardStack}
              cardStacks={cardStacks}
              heldWorkerId={heldWorkerId}
              playerColor={displayPlayer.color}
            />
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
                  if (isMultiOccupationSelect) {
                    const isSelectable = occupationHandSelection!.selectableCards.includes(cardId)
                    return (
                      <PlayerCard
                        key={`occupation-${cardId}`}
                        locale={locale}
                        cardId={cardId}
                        cardType="occupation"
                        devMode={devMode}
                        onClick={() => {
                          if (isSelectable) toggleOcc(cardId)
                        }}
                        disabled={!isSelectable}
                        selectable={isSelectable}
                        selected={selectedOccIds.has(cardId)}
                      />
                    )
                  }
                  const canPlay = cardAvailability[`occupation:${cardId}`] !== false
                  const isSelectingThisHand = isSelectingOccupation
                  const isOptionSelectable =
                    !isSelectingThisHand || selectableOccupationIds.has(cardId)
                  const canInteract = isSelectingThisHand
                    ? canInteractHand && isOptionSelectable
                    : canInteractHand && canPlay && isOptionSelectable
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
                      disabled={
                        isSelectingThisHand
                          ? !canInteractHand || !isOptionSelectable
                          : !canInteractHand || !canPlay || !isOptionSelectable
                      }
                      selectable={isSelectingOccupation && canInteract}
                    />
                  )
                })
              )}
            </div>
            {isMultiOccupationSelect && occupationHandSelection && (
              <div className="hand-select-confirm">
                <button
                  type="button"
                  disabled={
                    selectedOccIds.size < occupationHandSelection.minSelections ||
                    selectedOccIds.size > occupationHandSelection.maxSelections
                  }
                  onClick={() => onConfirmOccupationHandSelection?.([...selectedOccIds])}
                  data-testid="occupation-hand-confirm"
                >
                  {t(locale, 'ui.interactionOccupationHandConfirm', {
                    selected: selectedOccIds.size,
                    max: occupationHandSelection.maxSelections,
                  })}
                </button>
              </div>
            )}
          </div>
          <div className="hand-section minor">
            <div className="hand-section-title">{t(locale, 'ui.minorCards')}</div>
            <div className="hand-row">
              {displayPlayer.minorHand.length === 0 ? (
                <div className="hand-empty">{t(locale, 'ui.noHandCards')}</div>
              ) : (
                displayPlayer.minorHand.map((cardId) => {
                  const canPlay = cardAvailability[`minor:${cardId}`] !== false
                  const isSelectingThisHand =
                    isSelectingMinor || isSelectingImprovementAny
                  const isOptionSelectable =
                    !isSelectingThisHand ||
                    selectableMinorIds.has(cardId)
                  const canInteract = isSelectingThisHand
                    ? canInteractHand && isOptionSelectable
                    : canInteractHand && canPlay && isOptionSelectable
                  const canSelect =
                    isSelectingThisHand && canInteract
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
                      disabled={
                        isSelectingThisHand
                          ? !canInteractHand || !isOptionSelectable
                          : !canInteractHand || !canPlay || !isOptionSelectable
                      }
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
