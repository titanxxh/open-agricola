import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type {
  CardResourceStats,
  CropStack,
  FarmTilePosition,
  GameState,
  PlayerState,
  Resource,
} from '../../../shared/contract/types'
import { formatResources } from '../../utils/format'
import { emptyResources } from '../../../shared/contract/state-constants'
import { readCardResourceStats } from '../../../shared/cards/helpers/card-state'
import { getWorkerHeldOnCard } from '../../../shared/cards/helpers/card-held-workers'
import { collectLockedFarmTileKeys } from '../../../shared/cards/card-effects'
import type { ParentCardId } from '../../../shared/parents'
import {
  getPlayerPanelSupplySummary,
  type PlayerPanelSupplySummary,
} from '../../../shared/domain/player-panel-summary'
import { isBorderEdge } from '../../../shared/domain/farm'
import type { AnimalReorgState, ExtraSowTarget, PendingSowCrop } from '../../types/ui'
import { ResourceLine } from '../common/ResourceLine'
import { formatCardStatsLines } from '../common/cardStatsFormat'
import { CardWithCopy } from '../common/CardWithCopy'
import { ParentCardFace } from '../common/ParentCardFace'
import { PlayerCard, type CardType } from '../common/PlayerCard'
import { farmHandTopLeftFromCenterKey } from './farmHandCenter'

type AnimalType = 'sheep' | 'boar' | 'cattle'
type BuildingResource = 'wood' | 'clay' | 'reed' | 'stone'
type CardAnimalDisplay = {
  animalType: AnimalType | null
  animalCount: number
  animalCounts?: Partial<Record<AnimalType, number>>
  capacity: number
  zoneId: string
}

const C146_WORKSHOP_ASSISTANT_ID = 'C146_WorkshopAssistant'
const PARENT_CARD_PREVIEW_WIDTH = 320
const PARENT_CARD_PREVIEW_HEIGHT = Math.round((PARENT_CARD_PREVIEW_WIDTH * 560) / 735)

const parentFatherCompletedTier = (value: unknown): 1 | 2 | 3 | undefined =>
  value === 1 || value === 2 || value === 3 ? value : undefined

const C146_PAIR_STACK_RESOURCES: Record<string, readonly BuildingResource[]> = {
  WC: ['wood', 'clay'],
  WR: ['wood', 'reed'],
  WS: ['wood', 'stone'],
  CR: ['clay', 'reed'],
  CS: ['clay', 'stone'],
  RS: ['reed', 'stone'],
}

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
        {count}/{capacity}
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

const CardStackItem = ({
  item,
  index,
  stackSize,
}: {
  item: string
  index: number
  stackSize: number
}) => {
  const pairResources = C146_PAIR_STACK_RESOURCES[item]
  if (pairResources) {
    return (
      <span className="card-stack-pair">
        {pairResources.map((resource) => (
          <span key={resource} className={`res-icon res-icon-${resource}`} />
        ))}
      </span>
    )
  }
  return (
    <span
      className={`res-icon res-icon-${item}`}
      title={`#${stackSize - index}: ${item}`}
    />
  )
}

const CompactResourceItem = ({
  iconClass,
  value,
  label,
}: {
  iconClass: string
  value: number | string
  label: string
}) => (
  <span className="res-compact-item" title={label} aria-label={label}>
    <span className={`res-icon ${iconClass}`} aria-hidden="true" />
    <span className="res-compact-num">{value}</span>
  </span>
)

const SowChoiceButtons = ({
  locale,
  tileKey,
  currentValue,
  allowedCrops,
  availableGrain,
  availableVegetable,
  availableWood,
  availableStone,
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
  availableStone: number
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
    {
      crop: 'stone',
      enabled: allowedCrops.includes('stone') && availableStone > 0,
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

export type FarmBoardProps = {
  locale: Locale
  players: PlayerState[]
  currentPlayer: PlayerState
  displayPlayer: PlayerState
  activePlayerId?: string
  playerPanelSummary?: PlayerPanelSupplySummary
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
  farmHandSelectableSet: Set<string>
  pendingFarmHandKey: string | null
  builtSpecialStableKeys: Set<string>
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
  cardDisplayMap?: Map<string, CardAnimalDisplay>
  isReorgActive: boolean
  reorgRemaining: { sheep: number; boar: number; cattle: number } | null
  hasReorgOverflow: boolean
  animalReorg: AnimalReorgState | null
  pendingFenceSet: Set<string>
  pendingFenceSourceMap?: Record<string, string>
  pendingPalisadeSet?: Set<string>
  existingFenceSet: Set<string>
  fenceSelectableSet: Set<string>
  fencePlacementMode?: 'fence' | 'palisade'
  toggleRoomTile: (tile: FarmTilePosition) => void
  toggleStableTile: (tile: FarmTilePosition) => void
  toggleFarmHand: (tile: FarmTilePosition) => void
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
  highlightedFarmTileKeys?: ReadonlySet<string>
  highlightedFenceEdgeIds?: ReadonlySet<string>
}

type TooltipPosition = {
  top: number
  left: number
}

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
  const hasCounters = Object.keys(visibleCounters).length > 0 || bonusVp > 0 || stack.length > 0 || hasCardStacks
  const statsLines = formatCardStatsLines(resourceStats, rawId, locale)
  const hasResourceStats = statsLines.length > 0

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
          {bonusVp > 0 ? (
            <div
              className="resource-chip resource-bonusVp"
              title={t(locale, 'ui.cardStats.bonusVp')}
            >
              <span className="res-icon res-icon-bonusVp" />
              <span className="resource-chip-count">{bonusVp}</span>
            </div>
          ) : null}
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
                <CardStackItem
                  key={`stack-${i}`}
                  item={res}
                  index={i}
                  stackSize={stack.length}
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
          {statsLines.map((line) => (
            <div key={line.key} className="played-card-stats-section">
              <div className="played-card-stats-label">{t(locale, line.labelKey)}</div>
              {line.resources ? (
                <ResourceLine
                  locale={locale}
                  resources={{ ...emptyResources, ...line.resources }}
                  className="played-card-stats-line"
                />
              ) : line.value !== undefined ? (
                <div className="played-card-stats-value">{line.value}</div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

const ParentCardTile = ({
  locale,
  id,
  infobox,
  completedTier,
  devMode,
}: {
  locale: Locale
  id: ParentCardId
  infobox?: string
  completedTier?: 1 | 2 | 3
  devMode: boolean
}) => {
  return (
    <CardWithCopy
      locale={locale}
      cardId={id}
      devMode={devMode}
      className="parent-card-tile"
      previewCard={<ParentCardFace id={id} infobox={infobox} completedTier={completedTier} />}
      previewWidth={PARENT_CARD_PREVIEW_WIDTH}
      previewHeight={PARENT_CARD_PREVIEW_HEIGHT}
      previewClassName="parent-card-hover-preview"
      data-card-id={id}
    >
      <ParentCardFace id={id} infobox={infobox} completedTier={completedTier} />
    </CardWithCopy>
  )
}

export const FarmBoard = ({
  locale,
  players,
  currentPlayer,
  displayPlayer,
  activePlayerId,
  playerPanelSummary,
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
  farmHandSelectableSet,
  pendingFarmHandKey,
  builtSpecialStableKeys,
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
  cardDisplayMap = new Map(),
  isReorgActive,
  reorgRemaining,
  pendingFenceSet,
  pendingFenceSourceMap,
  pendingPalisadeSet,
  existingFenceSet,
  fenceSelectableSet,
  fencePlacementMode,
  toggleRoomTile,
  toggleStableTile,
  toggleFarmHand,
  togglePlowTile,
  updateSowSelection,
  toggleFenceEdge,
  adjustReorgAnimal,
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
  highlightedFarmTileKeys = new Set<string>(),
  highlightedFenceEdgeIds = new Set<string>(),
}: FarmBoardProps) => {
  const activeFarmPlayerId = activePlayerId ?? currentPlayer.id
  const canInteractHand = displayPlayer.id === activeFarmPlayerId && isInteractive
  const summary = playerPanelSummary ?? getPlayerPanelSupplySummary({ players } as GameState, displayPlayer)
  const roomIconClass = `res-icon-room-${displayPlayer.houseType}`
  const compactLabels = locale === 'zh'
    ? {
        family: '家庭成员容量',
        rooms: '房间',
        housing: '住房容量',
        fields: '田地',
        fence: '栅栏容量',
        stable: '畜栏供给',
      }
    : {
        family: 'Family capacity',
        rooms: 'Rooms',
        housing: 'Housing capacity',
        fields: 'Fields',
        fence: 'Fence capacity',
        stable: 'Stable supply',
      }

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
        <div className="player-resources-compact" data-player-resource-anchor={displayPlayer.id}>
          <span className="res-compact-group">
            <CompactResourceItem iconClass="res-icon-wood" value={displayPlayer.resources.wood} label={`${t(locale, 'resources.wood')}: ${displayPlayer.resources.wood}`} />
            <CompactResourceItem iconClass="res-icon-clay" value={displayPlayer.resources.clay} label={`${t(locale, 'resources.clay')}: ${displayPlayer.resources.clay}`} />
            <CompactResourceItem iconClass="res-icon-reed" value={displayPlayer.resources.reed} label={`${t(locale, 'resources.reed')}: ${displayPlayer.resources.reed}`} />
            <CompactResourceItem iconClass="res-icon-stone" value={displayPlayer.resources.stone} label={`${t(locale, 'resources.stone')}: ${displayPlayer.resources.stone}`} />
            <CompactResourceItem iconClass="res-icon-grain" value={displayPlayer.resources.grain} label={`${t(locale, 'resources.grain')}: ${displayPlayer.resources.grain}`} />
            <CompactResourceItem iconClass="res-icon-vegetable" value={displayPlayer.resources.vegetable} label={`${t(locale, 'resources.vegetable')}: ${displayPlayer.resources.vegetable}`} />
          </span>
          <span className="res-compact-divider" />
          <span className="res-compact-group">
            <CompactResourceItem iconClass="res-icon-food" value={displayPlayer.resources.food} label={`${t(locale, 'resources.food')}: ${displayPlayer.resources.food}`} />
            <CompactResourceItem iconClass="res-icon-sheep" value={displayPlayer.resources.sheep} label={`${t(locale, 'resources.sheep')}: ${displayPlayer.resources.sheep}`} />
            <CompactResourceItem iconClass="res-icon-boar" value={displayPlayer.resources.boar} label={`${t(locale, 'resources.boar')}: ${displayPlayer.resources.boar}`} />
            <CompactResourceItem iconClass="res-icon-cattle" value={displayPlayer.resources.cattle} label={`${t(locale, 'resources.cattle')}: ${displayPlayer.resources.cattle}`} />
            {displayPlayer.resources.begging > 0 && (<>
              <CompactResourceItem iconClass="res-icon-begging" value={displayPlayer.resources.begging} label={`${t(locale, 'resources.begging')}: ${displayPlayer.resources.begging}`} />
            </>)}
          </span>
          {displayPlayer.resources.fuel !== undefined || displayPlayer.resources.horse !== undefined ? (<>
            <span className="res-compact-divider" />
            <span className="res-compact-group">
              <CompactResourceItem iconClass="res-icon-fuel" value={displayPlayer.resources.fuel ?? 0} label={`${t(locale, 'resources.fuel')}: ${displayPlayer.resources.fuel ?? 0}`} />
              <CompactResourceItem iconClass="res-icon-horse" value={displayPlayer.resources.horse ?? 0} label={`${t(locale, 'resources.horse')}: ${displayPlayer.resources.horse ?? 0}`} />
            </span>
          </>) : null}
          <span className="res-compact-divider" />
          <span className="res-compact-group">
            <CompactResourceItem iconClass="res-icon-child" value={`${summary.family.used}/${summary.family.limit}`} label={`${compactLabels.family}: ${summary.family.used}/${summary.family.limit}`} />
            <CompactResourceItem iconClass={roomIconClass} value={summary.rooms.count} label={`${compactLabels.rooms}: ${summary.rooms.count}`} />
            <CompactResourceItem iconClass="res-icon-child-free" value={summary.housingCapacity.value} label={`${compactLabels.housing}: ${summary.housingCapacity.value}`} />
            <CompactResourceItem iconClass="res-icon-field" value={displayPlayer.fields.length} label={`${compactLabels.fields}: ${displayPlayer.fields.length}`} />
            <CompactResourceItem iconClass="res-icon-fence-icon" value={`${summary.fence.used}/${summary.fence.limit}`} label={`${compactLabels.fence}: ${summary.fence.used}/${summary.fence.limit}`} />
            <CompactResourceItem iconClass="res-icon-barn" value={`${summary.stable.used}/${summary.stable.limit}`} label={`${compactLabels.stable}: ${summary.stable.used}/${summary.stable.limit}`} />
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
          const terrain = (displayPlayer.farmTerrain ?? []).find(
            (tile) => tile.row === tileRow && tile.col === tileCol,
          )
          const terrainLabel =
            terrain?.kind === 'forest'
              ? t(locale, 'ui.tileForest')
              : terrain?.kind === 'moor'
                ? t(locale, 'ui.tileMoor')
                : null
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
          const availableStone =
            sowRemaining.stone + (currentSowChoice === 'stone' ? 1 : 0)
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
              data-farm-tile-key={tileKey}
              data-farm-tile-player={displayPlayer.id}
              className={`farm-cell farm-tile${
                isRoom
                  ? ' room'
                  : isField
                    ? ' field'
                    : isStable
                      ? ' stable'
                      : ''
              }${terrain ? ` farm-terrain-${terrain.kind}` : ''}${isTileLocked ? ' locked' : ''}${isTileSelectable ? ' selectable' : ''}${isTileSelected ? ' selected' : ''}${
                isStableSelectable ? ' stable-selectable' : ''
              }${isStableSelected ? ' stable-selected' : ''}${highlightedFarmTileKeys.has(tileKey) ? ' event-highlight' : ''}`}
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
              {isStable ? (
                <div
                  className="stable-barn-icon"
                  data-player-color={displayPlayer.color}
                >
                  <span className="res-icon res-icon-barn" />
                </div>
              ) : null}
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
                      ? null
                      : terrainLabel ?? t(locale, 'ui.tileEmpty')}
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
                  availableStone={availableStone}
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
          const sourcePlayerId = builtSegment
            ? builtSegment.source?.kind === 'borrowed'
              ? builtSegment.source.ownerPlayerId
              : displayPlayer.id
            : isPendingFence && edgeId && pendingFenceSourceMap?.[edgeId]
              ? pendingFenceSourceMap[edgeId]
              : isPending
                ? displayPlayer.id
                : null
          const sourcePlayerColor = sourcePlayerId
            ? players.find((player) => player.id === sourcePlayerId)?.color ?? displayPlayer.color
            : undefined
          return (
            <div
              key={cell.key}
              className={`farm-cell farm-${cell.type}${isActive ? ' active' : ''}${
                isPending ? ' selected' : ''
              }${segmentType ? ' ' + segmentType : ''}${isSelectable ? ' selectable' : ''}${blockedForPalisade ? ' palisade-disabled' : ''}${edgeId && highlightedFenceEdgeIds.has(edgeId) ? ' event-highlight' : ''}`}
              data-player-color={sourcePlayerColor}
              onClick={() => {
                if (isSelectable && edgeId) {
                  toggleFenceEdge(edgeId)
                }
              }}
            />
          )
        }
        if (cell.type === 'post') {
          const centerTopLeft = farmHandTopLeftFromCenterKey(cell.key)
          const centerKey = centerTopLeft
            ? `${centerTopLeft.row}-${centerTopLeft.col}`
            : null
          if (centerKey && builtSpecialStableKeys.has(centerKey)) {
            return (
              <div key={cell.key} className="farm-cell farm-post">
                <div
                  className="farmhand-center-overlay farmhand-center-built"
                  data-farmhand-center-key={centerKey}
                  data-player-color={displayPlayer.color}
                  title={t(locale, 'ui.tileStable')}
                >
                  <span className="res-icon res-icon-barn farmhand-center-icon" aria-hidden="true" />
                </div>
              </div>
            )
          }
          const isFarmHandCenter =
            isInteractive && !!centerKey && farmHandSelectableSet.has(centerKey)
          if (isFarmHandCenter && centerTopLeft && centerKey) {
            const isCenterSelected = pendingFarmHandKey === centerKey
            return (
              <div key={cell.key} className="farm-cell farm-post">
                <button
                  type="button"
                  className={`farmhand-center-overlay${
                    isCenterSelected
                      ? ' farmhand-center-selected'
                      : ' farmhand-center-candidate'
                  }`}
                  data-farmhand-center-key={centerKey}
                  aria-pressed={isCenterSelected}
                  title={t(locale, 'ui.tileStable')}
                  onClick={() => toggleFarmHand(centerTopLeft)}
                />
              </div>
            )
          }
        }
        return <div key={cell.key} className={`farm-cell farm-${cell.type}`} />
      })}
    </div>
    {isInteractive && extraSowTargets.length > 0 ? (
      <div className="extra-sow-tray" aria-label="extra-sow-tray">
        <div className="extra-sow-targets">
          {(() => {
            const counts = new Map<string, number>()
            extraSowTargets.forEach((target) => {
              const src = target.sourceCard ?? ''
              counts.set(src, (counts.get(src) ?? 0) + 1)
            })
            const seen = new Map<string, number>()
            return extraSowTargets.map((target) => {
              const src = target.sourceCard ?? ''
              const idx = (seen.get(src) ?? 0) + 1
              seen.set(src, idx)
              const total = counts.get(src) ?? 1
              const baseLabel = getExtraSowTargetLabel(target.sourceCard, target.key)
              const label = total > 1 ? `${baseLabel} (${idx}/${total})` : baseLabel
              const currentSowChoice = isInteractive ? (pendingSowSelections[target.key] ?? '') : ''
              const availableGrain =
                sowRemaining.grain + (currentSowChoice === 'grain' ? 1 : 0)
              const availableVegetable =
                sowRemaining.vegetable + (currentSowChoice === 'vegetable' ? 1 : 0)
              const availableWood =
                sowRemaining.wood + (currentSowChoice === 'wood' ? 1 : 0)
              const availableStone =
                sowRemaining.stone + (currentSowChoice === 'stone' ? 1 : 0)
              return (
                <div key={target.key} className="extra-sow-target">
                  <div className="extra-sow-label">{label}</div>
                  <SowChoiceButtons
                    locale={locale}
                    tileKey={target.key}
                    currentValue={currentSowChoice}
                    allowedCrops={target.allowedCrops}
                    availableGrain={availableGrain}
                    availableVegetable={availableVegetable}
                    availableWood={availableWood}
                    availableStone={availableStone}
                    isInteractive={isInteractive}
                    updateSowSelection={updateSowSelection}
                    tile={target.tile}
                  />
                </div>
              )
            })
          })()}
        </div>
      </div>
    ) : null}
    <div className="played-cards">
      <h3>{t(locale, 'ui.playedCards')}</h3>
      {displayPlayer.parentCards?.mother || displayPlayer.parentCards?.father ? (
        <div className="parent-cards-row">
          {displayPlayer.parentCards?.mother ? (
            <ParentCardTile
              locale={locale}
              id={displayPlayer.parentCards.mother}
              infobox={displayPlayer.cardStates?.[displayPlayer.parentCards.mother]?.infobox}
              devMode={devMode}
            />
          ) : null}
          {displayPlayer.parentCards?.father ? (
            <ParentCardTile
              locale={locale}
              id={displayPlayer.parentCards.father}
              infobox={displayPlayer.cardStates?.[displayPlayer.parentCards.father]?.infobox}
              completedTier={parentFatherCompletedTier(
                displayPlayer.cardStates?.[displayPlayer.parentCards.father]?.extraData?.fatherCompletedTier,
              )}
              devMode={devMode}
            />
          ) : null}
        </div>
      ) : null}
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
          const rawExtraData = displayPlayer.cardStates?.[rawId]?.extraData
          const c146Pairs = rawId === C146_WORKSHOP_ASSISTANT_ID && Array.isArray(rawExtraData?.pairs)
            ? rawExtraData.pairs.filter((pair): pair is string => typeof pair === 'string')
            : null
          const cardStack = c146Pairs ?? displayPlayer.cardStates?.[rawId]?.stack ?? []
          const rawCardCrop = displayPlayer.cardStates?.[rawId]?.extraData?.cardCrop as
            | { crop: 'grain' | 'vegetable' | 'wood'; remaining: number }
            | undefined
          const rawStacks = displayPlayer.cardStates?.[rawId]?.extraData?.stacks as
            | { kind: 'grain' | 'vegetable' | 'wood' | 'stone'; remaining: number }[]
            | undefined
          const rawCardFieldStacks = displayPlayer.cardStates?.[rawId]?.extraData?.cardFieldStacks as
            | { crop: 'grain' | 'vegetable' | 'wood' | 'stone'; remaining: number }[]
            | undefined
          const cardStacks: CropStack[] | null =
            rawCardFieldStacks && rawCardFieldStacks.length > 0
              ? rawCardFieldStacks.map((s) => ({ kind: s.crop, remaining: s.remaining }))
              : rawStacks && rawStacks.length > 0
                ? rawStacks.map((s) => ({ kind: s.kind, remaining: s.remaining }))
              : rawCardCrop && rawCardCrop.remaining > 0
                ? [{ kind: rawCardCrop.crop, remaining: rawCardCrop.remaining }]
                : null
          const internalKeys = new Set(['usedRound'])
          const displayCounters = Object.fromEntries(
            Object.entries(cardStateCounters).filter(([key, count]) => !internalKeys.has(key) && count > 0),
          )
          const heldWorkerId = getWorkerHeldOnCard(displayPlayer, rawId)
          const cardDisplay = cardDisplayMap.get(rawId)

          return (
            <div key={`played-${index}`} className="played-card-slot">
              <PlayedCardStats
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
              {isReorgActive && cardDisplay ? (
                <div className="played-card-reorg">
                  <AnimalCount
                    count={cardDisplay.animalCount}
                    animalType={cardDisplay.animalType}
                    capacity={cardDisplay.capacity}
                  />
                  <div className="pasture-controls">
                    {(['sheep', 'boar', 'cattle'] as const).map((animalType) => {
                      const cardAnimalCounts = cardDisplay.animalCounts ?? {}
                      const count =
                        cardAnimalCounts[animalType] ??
                        (cardDisplay.animalType === animalType ? cardDisplay.animalCount : 0)
                      const totalCount =
                        (cardAnimalCounts.sheep ?? 0) +
                        (cardAnimalCounts.boar ?? 0) +
                        (cardAnimalCounts.cattle ?? 0) ||
                        cardDisplay.animalCount
                      const canDecrease =
                        count > 0
                      const canIncrease =
                        (reorgRemaining?.[animalType] ?? 0) > 0 &&
                        cardDisplay.capacity > 0 &&
                        totalCount < cardDisplay.capacity
                      return (
                        <div key={animalType} className="pasture-control-row">
                          <span className="pasture-control-label">
                            {t(locale, `resources.${animalType}`)}
                          </span>
                          <button
                            onClick={() =>
                              adjustReorgAnimal(cardDisplay.zoneId, animalType, -1)
                            }
                            disabled={!isInteractive || !canDecrease}
                          >
                            -
                          </button>
                          <span className="pasture-control-value">{count}</span>
                          <button
                            onClick={() =>
                              adjustReorgAnimal(cardDisplay.zoneId, animalType, 1)
                            }
                            disabled={!isInteractive || !canIncrease}
                          >
                            +
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
    <div className="hand-cards">
      <h3>{t(locale, 'ui.handCards')}</h3>
      {displayPlayer.id === activeFarmPlayerId || devMode ? (
        <div className="hand-sections" data-hand-anchor={displayPlayer.id}>
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
