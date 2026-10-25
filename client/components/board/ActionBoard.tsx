import { useCallback, useEffect, useMemo, useRef, useState, type FocusEvent, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { ActionSpace, FutureMeeple, FutureMeepleResourceMap, PlayerState } from '../../../shared/contract/types'
import { FutureEffectMarkers, type OwnedScheduledEffect } from './FutureEffectMarkers'
import { PlayerCard } from '../common/PlayerCard'
import { getCardDisplayName, translateCardText } from '../common/cardText'
import { getCardMeta } from '../../services/card-meta'
import { getPlayerDisplayName } from '../../utils/player-name'
import { renderDescriptionPreview } from '../interaction/ActionDescription'
import { ActionSpaceDescription } from './ActionSpaceDescription'

const BOARD_W_2P = 830
const BOARD_W_WITH_SIDE = 1000
const BOARD_W_5P = 1190
const BOARD_W_6P = 1370
const BOARD_H = 795
const MIN_TOUCH_TARGET = 44
const MIN_ACTION_SPACE_WIDTH = 60
const PRECISION_SCALE = MIN_TOUCH_TARGET / MIN_ACTION_SPACE_WIDTH

type Pos = { top: number; left: number; width: number; height: number; size: 's' | 'std' }

type LinkedActionConnector = {
  groupId: string
  fromId: string
  toId: string
  x1: number
  y1: number
  x2: number
  y2: number
  midX: number
  midY: number
}

const SIDE_PANEL_OFFSET = 170
const SHARED_EXTENSION_OFFSET = 360
const SIX_PLAYER_RAIL_OFFSET = 180

const SIDE_ACTIONS: Record<string, Pos> = {
  'copse':             { top: 18,  left: 5,   width: 60,  height: 83,  size: 's' },
  'grove':             { top: 110, left: 54,  width: 60,  height: 86,  size: 's' },
  'resource-market-4': { top: 236, left: 5,   width: 110, height: 65,  size: 'std' },
  'resource-market':   { top: 236, left: 5,   width: 110, height: 65,  size: 'std' },
  'hollow-4':          { top: 313, left: 5,   width: 60,  height: 86,  size: 's' },
  'hollow':            { top: 313, left: 5,   width: 60,  height: 86,  size: 's' },
  'lessons-4':         { top: 412, left: 5,   width: 115, height: 94,  size: 'std' },
  'lessons-3':         { top: 412, left: 5,   width: 115, height: 94,  size: 'std' },
  'traveling-players': { top: 516, left: 53,  width: 65,  height: 84,  size: 's' },
}

const CENTRAL_ACTIONS: Record<string, Pos> = {
  'farm-expansion': { top: -3,  left: 30,  width: 115, height: 134, size: 'std' },
  'meeting-place':  { top: 134, left: 31,  width: 115, height: 72,  size: 'std' },
  'grain-seeds':    { top: 220, left: 30,  width: 115, height: 69,  size: 'std' },
  'farmland':       { top: 310, left: 30,  width: 115, height: 80,  size: 'std' },
  'forest':         { top: 203, left: 253, width: 60,  height: 86,  size: 's' },
  'clay-pit':       { top: 306, left: 175, width: 60,  height: 86,  size: 's' },
  'lessons':        { top: 406, left: 30,  width: 115, height: 94,  size: 'std' },
  'reed-bank':      { top: 411, left: 254, width: 60,  height: 86,  size: 's' },
  'day-laborer':    { top: 526, left: 30,  width: 115, height: 74,  size: 'std' },
  'fishing':        { top: 514, left: 175, width: 62,  height: 86,  size: 's' },
}

const SIDE_ACTION_OVERRIDES: Record<number, Partial<Record<string, Partial<Pos>>>> = {
  3: {
    'resource-market': { top: 255, left: 4, width: 111, height: 64 },
    'hollow': { top: 329, left: 6 },
    'lessons-3': { top: 433, left: 2 },
  },
  4: {
    'grove': { top: 138 },
  },
}

const EXPANSION_56_ACTIONS: Record<string, Pos> = {
  'lessons-56-2f':           { top: 18,  left: 24,  width: 115, height: 94,  size: 'std' },
  'copse-56':                { top: 18,  left: 256, width: 60,  height: 83,  size: 's' },
  'riverbank-forest-56':     { top: 140, left: 112, width: 60,  height: 110, size: 's' },
  'grove-56':                { top: 146, left: 254, width: 60,  height: 86,  size: 's' },
  'lessons-56-variable':     { top: 296, left: 24,  width: 115, height: 94,  size: 'std' },
  'modest-wish-children-56': { top: 296, left: 206, width: 115, height: 94,  size: 'std' },
  'animal-market-56':        { top: 430, left: 24,  width: 115, height: 134, size: 'std' },
  'resource-market-56':      { top: 432, left: 192, width: 110, height: 65,  size: 'std' },
  'hollow-56':               { top: 532, left: 230, width: 60,  height: 86,  size: 's' },
  'house-building-56':       { top: 662, left: 24,  width: 115, height: 134, size: 'std' },
  'traveling-players-56':    { top: 672, left: 244, width: 65,  height: 84,  size: 's' },
}

const SIX_ONLY_ACTIONS: Record<string, Pos> = {
  'farm-supplies-6':  { top: 18,  left: 52, width: 115, height: 94, size: 'std' },
  'resource-trade-6': { top: 138, left: 52, width: 115, height: 94, size: 'std' },
  'corral-6':         { top: 258, left: 52, width: 115, height: 74, size: 'std' },
  'side-job-6':       { top: 358, left: 52, width: 115, height: 94, size: 'std' },
  'improvement-6':    { top: 478, left: 52, width: 115, height: 94, size: 'std' },
}

const SHARED_EXTENSION_PATCHES = [
  'patch-copse',
  'patch-grove',
  'patch-riverbank',
  'patch-resource',
  'patch-hollow',
  'patch-travelers',
  'patch-lessons-a',
  'patch-lessons-b',
  'patch-wish',
  'patch-animal',
  'patch-house',
] as const

const SIX_EXTENSION_PATCHES = [
  'six-farming',
  'six-building',
  'six-corral',
  'six-side-job',
  'six-improvement',
] as const

type SlotPos = { top: number; left: number }

const ROUND_POS: Record<number, SlotPos> = {
  1:  { top: 2,   left: 167 },
  2:  { top: 1,   left: 331 },
  3:  { top: 1,   left: 493 },
  4:  { top: 1,   left: 657 },
  5:  { top: 156, left: 330 },
  6:  { top: 156, left: 493 },
  7:  { top: 156, left: 657 },
  8:  { top: 311, left: 330 },
  9:  { top: 311, left: 493 },
  10: { top: 462, left: 330 },
  11: { top: 462, left: 493 },
  12: { top: 626, left: 6 },
  13: { top: 626, left: 172 },
  14: { top: 626, left: 489 },
}

const ROUND_SLOT_SIZE = 140

const HARVEST_POS: Record<number, SlotPos> = {
  4:  { top: 64,  left: 788 },
  7:  { top: 213, left: 787 },
  9:  { top: 370, left: 630 },
  11: { top: 532, left: 632 },
  13: { top: 663, left: 302 },
  14: { top: 688, left: 617 },
}

const ACCUMULATE_DIR: Record<string, 'left' | 'right' | 'bottom'> = {
  'forest': 'left',
  'reed-bank': 'left',
  'grove': 'left',
  'grove-56': 'left',
  'traveling-players': 'left',
  'traveling-players-56': 'left',
  'clay-pit': 'right',
  'fishing': 'right',
  'hollow-4': 'right',
  'hollow': 'right',
  'hollow-56': 'right',
  'copse': 'right',
  'copse-56': 'right',
  'riverbank-forest-56': 'left',
  'sheep-market': 'bottom',
  'western-quarry': 'bottom',
  'eastern-quarry': 'bottom',
  'pig-market': 'bottom',
  'cattle-market': 'bottom',
}

const RESOURCE_OFFSET: Partial<Record<string, React.CSSProperties>> = {
  'forest':            { left: -54, bottom: 5 },
  'reed-bank':         { left: -75, bottom: 7 },
  'clay-pit':          { bottom: 5, left: 92 },
  'fishing':           { bottom: 10, left: 98 },
  'grove':             { left: -51, bottom: 3 },
  'grove-56':          { left: -51, bottom: 3 },
  'hollow-4':          { left: 87, bottom: 9 },
  'hollow':            { left: 87, bottom: 9 },
  'hollow-56':          { left: 87, bottom: 9 },
  'traveling-players': { left: -54, bottom: 1 },
  'traveling-players-56': { left: -54, bottom: 1 },
  'copse':             { left: 87, bottom: 5 },
  'copse-56':           { left: 87, bottom: 5 },
  'riverbank-forest-56': { left: -54, bottom: 5 },
}

const RESOURCE_OFFSET_OVERRIDES: Record<number, Partial<Record<string, React.CSSProperties>>> = {
  3: {
    'hollow': { left: 85, bottom: 5 },
  },
}

const ACTION_SPRITE: Record<string, string> = {
  'fencing': '0% 0%',
  'sheep-market': '25% 0%',
  'grain-utilization': '50% 0%',
  'major-improvement': '75% 0%',
  'western-quarry': '100% 0%',
  'pig-market': '0% 50%',
  'vegetable-seeds': '25% 50%',
  'eastern-quarry': '50% 50%',
  'cattle-market': '75% 50%',
  'wish-children': '100% 50%',
  'urgent-wish-children': '0% 100%',
  'cultivation': '25% 100%',
  'house-redevelopment': '50% 100%',
  'farm-redevelopment': '75% 100%',
}

const STAGE_LABELS: Record<number, string> = {
  1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6',
}

function getStage(round: number): number {
  if (round <= 4) return 1
  if (round <= 7) return 2
  if (round <= 9) return 3
  if (round <= 11) return 4
  if (round <= 13) return 5
  return 6
}

type RoundSlot = { round: number; action?: ActionSpace }

type Props = {
  locale: Locale
  baseActions: ActionSpace[]
  roundSlots: RoundSlot[]
  currentPlayer: PlayerState
  players: PlayerState[]
  futureMeeples: FutureMeeple[]
  scheduledEffects?: OwnedScheduledEffect[]
  canTakeAction: (space: ActionSpace, player: PlayerState) => boolean
  takeAction: (space: ActionSpace) => void
  currentRound: number
  devMode: boolean
  highlightedActionIds?: ReadonlySet<string>
  actionSpaceSelectionActive?: boolean
  actionSpaceReservations?: ReadonlyMap<string, ActionSpaceReservationDisplay[]>
  actionSpaceAttachments?: ReadonlyMap<string, ActionSpaceAttachmentDisplay[]>
  leftActionNames?: ReadonlyMap<string, string>
  enablePrecisionMode?: boolean
  actionSpaceOutlets?: ReadonlyMap<string, HTMLElement>
}

type TooltipInfo = ({
  kind: 'action'
  actionId: string
  nameKey: string
  spritePos?: string
  action: ActionSpace
  leftActionName?: string
} | {
  kind: 'resource'
  title: string
  description: string
}) & {
  x: number
  y: number
}

type SpaceFarmerMarker = {
  player: PlayerState
  key: string
  isNewbornOnly: boolean
}

type ActionBoardPlayerDisplay = Pick<PlayerState, 'id' | 'name' | 'color'>
type ActionSpaceReservationDisplay = ActionBoardPlayerDisplay & { sourceCardId: string }

type ActionSpaceAttachmentDisplay = ActionBoardPlayerDisplay & {
  resource: keyof FutureMeepleResourceMap
  amount: number
}

type ResourceStackItem = {
  resource: keyof FutureMeepleResourceMap
  amount: number
  player?: PlayerState
}

const FUTURE_RESOURCE_ICON_CLASS: Partial<Record<keyof FutureMeepleResourceMap, string>> = {
  stable: 'barn',
}

const getFutureResourceIconClass = (resource: keyof FutureMeepleResourceMap): string =>
  FUTURE_RESOURCE_ICON_CLASS[resource] ?? resource

const getFutureResourceLabel = (locale: Locale, resource: keyof FutureMeepleResourceMap): string => {
  if (resource === 'field') return t(locale, 'log.parentMotherRewardField')
  if (resource === 'stable') return t(locale, 'log.parentMotherRewardStable')
  if (resource === 'forest') return t(locale, 'ui.tileForest')
  if (resource === 'moor') return t(locale, 'ui.tileMoor')
  return t(locale, `resources.${resource}`)
}

const getBoardPlayerCount = (players: PlayerState[]): 2 | 3 | 4 | 5 | 6 => {
  const count = players.length
  if (count >= 6) return 6
  if (count === 5) return 5
  if (count >= 4) return 4
  if (count === 3) return 3
  return 2
}

const getBoardOffset = (playerCount: 2 | 3 | 4 | 5 | 6) => {
  if (playerCount === 2) return 0
  if (playerCount === 5) return SHARED_EXTENSION_OFFSET
  if (playerCount === 6) return SHARED_EXTENSION_OFFSET + SIX_PLAYER_RAIL_OFFSET
  return SIDE_PANEL_OFFSET
}

const shiftPos = (pos: Pos, leftOffset: number): Pos => ({
  ...pos,
  left: pos.left + leftOffset,
})

const shiftSlotPos = (pos: SlotPos, leftOffset: number): SlotPos => ({
  ...pos,
  left: pos.left + leftOffset,
})

const shiftPositions = (positions: Record<string, Pos>, leftOffset: number): Record<string, Pos> =>
  Object.fromEntries(
    Object.entries(positions).map(([spaceId, pos]) => [
      spaceId,
      shiftPos(pos, leftOffset),
    ]),
  ) as Record<string, Pos>

const centerOfPos = (pos: Pos) => ({
  x: pos.left + pos.width / 2,
  y: pos.top + pos.height / 2,
})

const getLinkedConnector = (
  groupId: string,
  first: ActionSpace,
  second: ActionSpace,
  positions: Record<string, Pos>,
): LinkedActionConnector | null => {
  const firstPos = positions[first.id]
  const secondPos = positions[second.id]
  if (!firstPos || !secondPos) return null

  const firstCenter = centerOfPos(firstPos)
  const secondCenter = centerOfPos(secondPos)
  const horizontal = Math.abs(firstCenter.x - secondCenter.x) >= Math.abs(firstCenter.y - secondCenter.y)
  const [from, fromPos, fromCenter, to, toPos, toCenter] = horizontal
    ? firstCenter.x <= secondCenter.x
      ? [first, firstPos, firstCenter, second, secondPos, secondCenter]
      : [second, secondPos, secondCenter, first, firstPos, firstCenter]
    : firstCenter.y <= secondCenter.y
      ? [first, firstPos, firstCenter, second, secondPos, secondCenter]
      : [second, secondPos, secondCenter, first, firstPos, firstCenter]

  const x1 = horizontal ? fromPos.left + fromPos.width : fromCenter.x
  const y1 = horizontal ? fromCenter.y : fromPos.top + fromPos.height
  const x2 = horizontal ? toPos.left : toCenter.x
  const y2 = horizontal ? toCenter.y : toPos.top

  return {
    groupId,
    fromId: from.id,
    toId: to.id,
    x1,
    y1,
    x2,
    y2,
    midX: (x1 + x2) / 2,
    midY: (y1 + y2) / 2,
  }
}

const getLinkedActionConnectors = (
  spaces: ActionSpace[],
  positions: Record<string, Pos>,
): LinkedActionConnector[] => {
  const byGroup = new Map<string, ActionSpace[]>()
  for (const space of spaces) {
    if (!space.linkedGroupId || !positions[space.id]) continue
    byGroup.set(space.linkedGroupId, [...(byGroup.get(space.linkedGroupId) ?? []), space])
  }
  return Array.from(byGroup.entries()).flatMap(([groupId, group]) => {
    if (group.length !== 2) return []
    const connector = getLinkedConnector(groupId, group[0]!, group[1]!, positions)
    return connector ? [connector] : []
  })
}

const getBasePositions = (playerCount: 2 | 3 | 4 | 5 | 6): Record<string, Pos> => {
  const leftOffset = getBoardOffset(playerCount)
  const shiftedCentral = shiftPositions(CENTRAL_ACTIONS, leftOffset)
  if (playerCount === 5) {
    return { ...EXPANSION_56_ACTIONS, ...shiftedCentral }
  }
  if (playerCount === 6) {
    return {
      ...SIX_ONLY_ACTIONS,
      ...shiftPositions(EXPANSION_56_ACTIONS, SIX_PLAYER_RAIL_OFFSET),
      ...shiftedCentral,
    }
  }
  const basePositions = { ...SIDE_ACTIONS, ...shiftedCentral }
  const overrides = SIDE_ACTION_OVERRIDES[playerCount]
  if (!overrides) return basePositions
  return Object.fromEntries(
    Object.entries(basePositions).map(([spaceId, pos]) => [
      spaceId,
      {
        ...pos,
        ...(overrides[spaceId] ?? {}),
      },
    ]),
  ) as Record<string, Pos>
}

const getResourceOffsets = (playerCount: 2 | 3 | 4 | 5 | 6): Partial<Record<string, React.CSSProperties>> => {
  const overrides = RESOURCE_OFFSET_OVERRIDES[playerCount]
  if (!overrides) return RESOURCE_OFFSET
  return {
    ...RESOURCE_OFFSET,
    ...overrides,
  }
}

const getRoundPositions = (playerCount: 2 | 3 | 4 | 5 | 6): Record<number, SlotPos> => {
  const leftOffset = getBoardOffset(playerCount)
  return Object.fromEntries(
    Object.entries(ROUND_POS).map(([round, pos]) => [
      Number(round),
      shiftSlotPos(pos, leftOffset),
    ]),
  ) as Record<number, SlotPos>
}

const getHarvestPositions = (playerCount: 2 | 3 | 4 | 5 | 6): Record<number, SlotPos> => {
  const leftOffset = getBoardOffset(playerCount)
  return Object.fromEntries(
    Object.entries(HARVEST_POS).map(([round, pos]) => [
      Number(round),
      shiftSlotPos(pos, leftOffset),
    ]),
  ) as Record<number, SlotPos>
}

export const ActionBoard = ({
  locale, baseActions, roundSlots, currentPlayer, players,
  futureMeeples, scheduledEffects = [], canTakeAction, takeAction, currentRound, devMode,
  highlightedActionIds = new Set<string>(),
  actionSpaceSelectionActive = false,
  actionSpaceReservations = new Map<string, ActionSpaceReservationDisplay[]>(),
  actionSpaceAttachments = new Map<string, ActionSpaceAttachmentDisplay[]>(),
  leftActionNames = new Map<string, string>(),
  enablePrecisionMode = false,
  actionSpaceOutlets = new Map<string, HTMLElement>(),
}: Props) => {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [precisionMode, setPrecisionMode] = useState(false)
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null)
  const playerDisplayName = (player: Pick<PlayerState, 'id' | 'name' | 'nameIsDefault'>): string => {
    const index = players.findIndex((candidate) => candidate.id === player.id)
    return getPlayerDisplayName(locale, player.name, index >= 0 ? index : undefined, player.nameIsDefault)
  }
  const playerCount = getBoardPlayerCount(players)
  const boardClassName = `action-board action-board--${playerCount}p`
  const boardWidth = playerCount === 2
    ? BOARD_W_2P
    : playerCount === 5
      ? BOARD_W_5P
      : playerCount === 6
        ? BOARD_W_6P
        : BOARD_W_WITH_SIDE
  const canUsePrecisionMode = enablePrecisionMode && scale < PRECISION_SCALE
  const renderedScale = canUsePrecisionMode && precisionMode ? PRECISION_SCALE : scale
  const basePositions = useMemo(() => getBasePositions(playerCount), [playerCount])
  const resourceOffsets = useMemo(() => getResourceOffsets(playerCount), [playerCount])
  const roundPositions = useMemo(() => getRoundPositions(playerCount), [playerCount])
  const harvestPositions = useMemo(() => getHarvestPositions(playerCount), [playerCount])
  const linkedActionConnectors = useMemo(
    () => getLinkedActionConnectors(baseActions, basePositions),
    [baseActions, basePositions],
  )
  const updateScale = useCallback(() => {
    const el = wrapperRef.current
    if (!el) return
    setScale(el.clientWidth / boardWidth)
  }, [boardWidth])

  useEffect(() => {
    updateScale()
    const el = wrapperRef.current
    if (!el) return
    const ro = new ResizeObserver(updateScale)
    ro.observe(el)
    return () => ro.disconnect()
  }, [updateScale])

  const playerById = useMemo(
    () => new Map(players.map((p) => [p.id, p])),
    [players],
  )

  const buildActionResourceItems = (action: ActionSpace | undefined): ResourceStackItem[] =>
    action
      ? Object.entries(action.resources)
        .filter(([, amount]) => (amount ?? 0) > 0)
        .map(([resource, amount]) => ({
          resource: resource as keyof FutureMeepleResourceMap,
          amount: amount ?? 0,
        }))
      : []

  const renderResourceIcons = (items: ResourceStackItem[]) =>
    items.flatMap((item) => {
      const label = getFutureResourceLabel(locale, item.resource)
      return Array.from({ length: Math.min(item.amount, 6) }, (_, i) => (
        <span
          key={`${item.player?.id ?? 'none'}-${item.resource}-${i}`}
          className={`res-icon res-icon-${getFutureResourceIconClass(item.resource)}`}
          title={item.player ? `${playerDisplayName(item.player)}: ${label}` : undefined}
          aria-label={item.player ? `${playerDisplayName(item.player)}: ${label}` : undefined}
          data-owner-player={item.player?.id}
          data-owner-label={item.player ? `${playerDisplayName(item.player)}: ${label}` : undefined}
          onMouseEnter={(e) => {
            if (!item.player) return
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            setTooltip({
              kind: 'resource',
              title: playerDisplayName(item.player),
              description: label,
              x: rect.right + 8,
              y: rect.top - 8,
            })
          }}
          onMouseLeave={hideTooltip}
        />
      ))
    })

  const renderResourceHolder = (
    space: ActionSpace | undefined,
    isRound = false,
  ) => {
    const items = buildActionResourceItems(space)
    if (!items.length) return null
    const totalCount = items.reduce((sum, item) => sum + item.amount, 0)
    const offset: React.CSSProperties = space ? resourceOffsets[space.id]
      ?? (isRound ? { bottom: 6, right: 30 } : {})
      : (isRound ? { bottom: 6, right: 30 } : {})
    return (
      <div className="resource-holder" data-n={totalCount} style={offset}>
        {renderResourceIcons(items)}
      </div>
    )
  }

  const renderFutureMeepleHolder = (
    action: ActionSpace | undefined,
    options: { round?: number } = {},
  ) => {
    const effects = scheduledEffects.filter(effect => options.round !== undefined ? effect.round === options.round :
      !!action && futureMeeples.some(entry => entry.actionId === action.id && entry.round === effect.round && entry.playerId === effect.playerId && entry.cardId === effect.sourceCard))
    return <FutureEffectMarkers locale={locale} effects={effects} players={players} />
  }

  const renderStableMarker = (space: ActionSpace) => {
    const reservations = actionSpaceReservations.get(space.id)
    if (!reservations?.length) return null
    return reservations.map((owner) => (
      <div key={`${owner.id}:${owner.sourceCardId}`} className="lazybones-stable-marker" data-player-color={owner.color}
        title={`${playerDisplayName(owner)}: ${getCardDisplayName(locale, owner.sourceCardId)}`}>
        <span className="res-icon res-icon-barn" />
      </div>
    ))
  }

  const renderActionSpaceAttachments = (space: ActionSpace) => {
    const items = actionSpaceAttachments.get(space.id)
    if (!items?.length) return null
    return (
      <div className="action-space-attachments">
        {items.flatMap((item, itemIndex) => {
          const label = getFutureResourceLabel(locale, item.resource)
          return Array.from({ length: Math.min(item.amount, 6) }, (_, index) => (
            <span
              key={`${item.id}-${item.resource}-${itemIndex}-${index}`}
              className={`res-icon res-icon-${getFutureResourceIconClass(item.resource)}`}
              title={`${playerDisplayName(item)}: ${label}`}
              aria-label={`${playerDisplayName(item)}: ${label}`}
              data-owner-player={item.id}
              data-owner-label={`${playerDisplayName(item)}: ${label}`}
              onMouseEnter={(e) => {
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                setTooltip({
                  kind: 'resource',
                  title: playerDisplayName(item),
                  description: label,
                  x: rect.right + 8,
                  y: rect.top - 8,
                })
              }}
              onMouseLeave={hideTooltip}
            />
          ))
        })}
      </div>
    )
  }

  const renderExclusiveUseMarker = (space: ActionSpace) => {
    const exclusive = space.exclusiveUse
    if (!exclusive) return null
    const owner = playerById.get(exclusive.playerId)
    return (
      <div className="action-exclusive-use" data-player-color={owner?.color}>
        {owner ? playerDisplayName(owner) : exclusive.playerId}
      </div>
    )
  }

  const isBlocked = (space: ActionSpace) => (space.blockedBy?.length ?? 0) > 0

  const blockedLabel = (space: ActionSpace) => {
    const blocker = space.blockedBy?.[0]
    if (!blocker) return ''
    const source = baseActions.find((candidate) => candidate.id === blocker.sourceSpaceId)
      ?? roundSlots.find((slot) => slot.action?.id === blocker.sourceSpaceId)?.action
    const sourceName = source ? translateCardText(locale, source.nameKey) : blocker.sourceSpaceId
    return `Blocked by ${sourceName}`
  }

  const renderBlockedMarker = (space: ActionSpace) => {
    if (!isBlocked(space)) return null
    return (
      <div className="action-space-lock" aria-hidden="true" title={blockedLabel(space)}>
        <span>🔒</span>
      </div>
    )
  }

  const renderFarmerHolder = (space: ActionSpace) => {
    const entries = space.takenBy
      .map((ref) => {
        const player = playerById.get(ref.playerId)
        const worker = player?.workers?.find((candidate) => candidate.id === ref.workerId)
        return player
          ? {
              player,
              key: `${player.id}-${space.id}-${ref.workerId}`,
              isNewbornOnly: !!worker?.isNewborn,
            }
          : null
      })
      .filter((entry): entry is SpaceFarmerMarker => entry !== null)
    if (entries.length === 0) return null
    return (
      <div className="farmer-holder" data-n={entries.length}>
        {entries.map((entry) => (
          <div
            key={entry.key}
            className="action-farmer-stack"
            title={playerDisplayName(entry.player)}
          >
            <div className={`action-farmer action-farmer-${entry.player.color}${entry.isNewbornOnly ? ' child' : ''}`} />
          </div>
        ))}
      </div>
    )
  }

  const showTooltip = (e: MouseEvent | FocusEvent, action: ActionSpace) => {
    const spritePos = ACTION_SPRITE[action.id]
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const tooltipW = spritePos ? 470 : 240
    const rightSpace = window.innerWidth - rect.right
    const proposedX = rightSpace > tooltipW + 16 ? rect.right + 8 : rect.left - tooltipW - 8
    const x = Math.max(8, Math.min(proposedX, window.innerWidth - Math.min(tooltipW, window.innerWidth - 16) - 8))
    setTooltip({
      kind: 'action',
      actionId: action.id,
      nameKey: action.nameKey,
      spritePos,
      action,
      leftActionName: leftActionNames.get(action.id),
      x,
      y: rect.top,
    })
  }

  const hideTooltip = () => setTooltip(null)

  const renderGainDisplay = (space: ActionSpace) => {
    const gains = Object.entries(space.gainPerRound).filter(([, v]) => (v ?? 0) > 0)
    if (!gains.length) return null
    return (
      <div className="gain-display">
        {gains.map(([res, amt]) => (
          <span key={res} className="gain-entry">
            <span className="gain-amount">{amt}</span>
            <span className={`gain-res-icon res-icon res-icon-${res}`} />
          </span>
        ))}
      </div>
    )
  }

  const hasGainPerRound = (space: ActionSpace) =>
    Object.values(space.gainPerRound).some((v) => (v ?? 0) > 0)

  const renderExtensionScenery = () => {
    if (playerCount < 5) return null
    return (
      <>
        {playerCount === 6 && (
          <div className="action-board-extension action-board-extension--six" aria-hidden="true">
            {SIX_EXTENSION_PATCHES.map((patch) => (
              <div key={patch} className={`action-board-patch action-board-patch--${patch}`} />
            ))}
          </div>
        )}
        <div className="action-board-extension action-board-extension--shared" aria-hidden="true">
          {SHARED_EXTENSION_PATCHES.map((patch) => (
            <div key={patch} className={`action-board-patch action-board-patch--${patch}`} />
          ))}
        </div>
      </>
    )
  }

  const renderLinkedActionMarkers = () => {
    if (linkedActionConnectors.length === 0) return null
    return (
      <svg className="linked-action-markers" aria-hidden="true" focusable="false">
        {linkedActionConnectors.map((connector) => (
          <g
            key={connector.groupId}
            data-linked-group-id={connector.groupId}
            data-linked-from-id={connector.fromId}
            data-linked-to-id={connector.toId}
          >
            <line
              className="linked-action-line linked-action-line--shadow"
              x1={connector.x1}
              y1={connector.y1}
              x2={connector.x2}
              y2={connector.y2}
            />
            <line
              className="linked-action-line"
              x1={connector.x1}
              y1={connector.y1}
              x2={connector.x2}
              y2={connector.y2}
            />
            <circle className="linked-action-node" cx={connector.midX} cy={connector.midY} r="11" />
            <text className="linked-action-symbol" x={connector.midX} y={connector.midY}>↔</text>
          </g>
        ))}
      </svg>
    )
  }

  const renderTooltipBody = (info: Extract<TooltipInfo, { kind: 'action' }>): React.ReactNode => {
    const id = info.actionId
    if (!id) return null
    const action = info.action
    if (action && hasGainPerRound(action)) return renderGainDisplay(action)
    return action?.baseDescriptionPreview ? renderDescriptionPreview(locale, action.baseDescriptionPreview) : action ? t(locale, action.nameKey) : null
  }

  const renderSupplementalRules = (action?: ActionSpace) => action?.rulesKey ? (
    <div className="action-rules">
      <strong>{t(locale, 'ui.supplementalRules')}</strong>
      <p>{t(locale, action.rulesKey)}</p>
    </div>
  ) : null

  const additionalActions = baseActions.filter(space => !basePositions[space.id])
  const localAdditionalActions = additionalActions.filter(space => !actionSpaceOutlets.has(space.id))
  const renderAdditionalAction = (space: ActionSpace) => {
    const canTake = canTakeAction(space, currentPlayer)
    const meta = getCardMeta(space.id)
    if (!meta) {
      return (
        <div
          key={space.id}
          className={[
            'player-action-card-wrapper',
            actionSpaceSelectionActive && canTake && 'choice-available',
            actionSpaceSelectionActive && !canTake && 'choice-unavailable',
          ].filter(Boolean).join(' ')}
          data-action-id={space.id}
          style={{ height: 150 }}
          onMouseEnter={(e) => showTooltip(e, space)}
          onMouseLeave={hideTooltip}
          onFocus={(e) => showTooltip(e, space)}
          onBlur={hideTooltip}
        >
          <button
            className="action-card player-action-space-card"
            aria-label={translateCardText(locale, space.nameKey)}
            onClick={() => takeAction(space)}
            disabled={!canTake}
          >
            <h4 className="action-header">{translateCardText(locale, space.nameKey)}</h4>
            <div className="action-desc">
              {space.baseDescriptionPreview
              ? <ActionSpaceDescription locale={locale} preview={space.baseDescriptionPreview} />
              : t(locale, space.nameKey)}
            </div>
            <div className="action-footer" />
          </button>
          {renderFarmerHolder(space)}
          {renderExclusiveUseMarker(space)}
          {renderBlockedMarker(space)}
        </div>
      )
    }
    let cardType: 'occupation' | 'minor'
    if (meta?.type === 'playerAction') {
      cardType = meta.playerActionCardType ?? 'minor'
    } else {
      cardType = meta?.type === 'occupation' ? 'occupation' : 'minor'
    }
    const owner = players.find((p) =>
      p.minorPlayed.includes(space.id) || p.occupationPlayed.includes(space.id)
    )
    return (
      <div
        key={space.id}
        className={[
          'player-action-card-wrapper',
          actionSpaceSelectionActive && canTake && 'choice-available',
          actionSpaceSelectionActive && !canTake && 'choice-unavailable',
        ].filter(Boolean).join(' ')}
        data-action-id={space.id}
      >
        <PlayerCard
          locale={locale}
          cardId={space.id}
          cardType={cardType}
          onClick={() => canTake && takeAction(space)}
          disabled={!canTake}
          usable={canTake && space.takenBy.length === 0}
          className={space.takenBy.length > 0 ? 'taken' : ''}
        />
        {renderFarmerHolder(space)}
        {renderExclusiveUseMarker(space)}
        {owner && (
          <div className="player-action-card-owner" data-player-color={owner.color}>
            {playerDisplayName(owner)}
          </div>
        )}
      </div>
    )
  }

  return (
    <section className="actions" aria-label={t(locale, 'ui.actionArea')}>
      <h2>{t(locale, 'ui.actionArea')}</h2>
      {canUsePrecisionMode ? (
        <button
          type="button"
          className="action-board-precision-toggle"
          aria-pressed={precisionMode}
          onClick={() => setPrecisionMode((value) => !value)}
        >
          {t(locale, precisionMode ? 'ui.fitActionBoard' : 'ui.enlargeActionBoard')}
        </button>
      ) : null}
      <div
        className={`action-board-wrapper${canUsePrecisionMode && precisionMode ? ' action-board-wrapper--precision' : ''}`}
        ref={wrapperRef}
        style={{ height: BOARD_H * renderedScale }}
      >
        <div className={boardClassName} style={{ transform: `scale(${renderedScale})`, width: boardWidth, height: BOARD_H }}>
          {renderExtensionScenery()}
          {renderLinkedActionMarkers()}

          {baseActions.map((space) => {
            const pos = basePositions[space.id]
            if (!pos) return null
            const accDir = ACCUMULATE_DIR[space.id]
            const blocked = isBlocked(space)
            const canTake = !blocked && canTakeAction(space, currentPlayer)
            const hasFarmer = space.takenBy.length > 0
            const label = blocked ? `${translateCardText(locale, space.nameKey)} (${blockedLabel(space)})` : translateCardText(locale, space.nameKey)
            return (
              <div
                key={space.id}
                className={[
                  'action-card-holder',
                  accDir && `accumulate-${accDir}`,
                  blocked && 'blocked',
                  hasFarmer && !canTake && 'taken',
                  hasFarmer && canTake && 'occupied-available',
                  actionSpaceSelectionActive && canTake && 'choice-available',
                  actionSpaceSelectionActive && !canTake && 'choice-unavailable',
                  highlightedActionIds.has(space.id) && 'event-highlight',
                ].filter(Boolean).join(' ')}
                data-action-id={space.id}
                style={{ position: 'absolute', top: pos.top, left: pos.left, width: pos.width, height: pos.height }}
                onMouseEnter={(e) => showTooltip(e, space)}
                onMouseLeave={hideTooltip}
                onFocus={(e) => showTooltip(e, space)}
                onBlur={hideTooltip}
              >
                <button
                  className={`action-card action-${pos.size}`}
                  onClick={() => takeAction(space)}
                  disabled={!canTake}
                  aria-label={label}
                >
                  <h4 className="action-header">{translateCardText(locale, space.nameKey)}</h4>
                  <div className="action-desc">
                    {accDir && hasGainPerRound(space)
                      ? renderGainDisplay(space)
                      : space.baseDescriptionPreview
                        ? <ActionSpaceDescription locale={locale} preview={space.baseDescriptionPreview} />
                        : t(locale, space.nameKey)}
                  </div>
                  <div className="action-footer" />
                </button>
                {renderResourceHolder(space)}
                {renderFutureMeepleHolder(space)}
                {renderFarmerHolder(space)}
                {renderStableMarker(space)}
                {renderActionSpaceAttachments(space)}
                {renderExclusiveUseMarker(space)}
                {renderBlockedMarker(space)}
              </div>
            )
          })}

          {roundSlots.map((slot) => {
            const pos = roundPositions[slot.round]
            if (!pos) return null
            const isOpen = devMode || currentRound >= slot.round
            const action = slot.action
            const isExclusiveVisible = !!action?.exclusiveUse && currentRound < slot.round
            const accDir = action ? ACCUMULATE_DIR[action.id] : undefined
            const blocked = action ? isBlocked(action) : false
            const canTake = action ? !blocked && canTakeAction(action, currentPlayer) : false
            const hasFarmer = action ? action.takenBy.length > 0 : false
            const label = action ? blocked ? `${translateCardText(locale, action.nameKey)} (${blockedLabel(action)})` : translateCardText(locale, action.nameKey) : undefined
            return (
              <div
                key={`r-${slot.round}`}
                className="turn-action-container"
                style={{ position: 'absolute', top: pos.top, left: pos.left, width: ROUND_SLOT_SIZE, height: ROUND_SLOT_SIZE }}
              >
                {action && (isOpen || isExclusiveVisible) ? (
                  <div
                    className={[
                      'action-card-holder round',
                      isExclusiveVisible && 'exclusive-locked',
                      accDir && `accumulate-${accDir}`,
                      blocked && 'blocked',
                      hasFarmer && !canTake && 'taken',
                      hasFarmer && canTake && 'occupied-available',
                      actionSpaceSelectionActive && canTake && 'choice-available',
                      actionSpaceSelectionActive && !canTake && 'choice-unavailable',
                      highlightedActionIds.has(action.id) && 'event-highlight',
                    ].filter(Boolean).join(' ')}
                    data-action-id={action.id}
                    onMouseEnter={(e) => showTooltip(e, action)}
                    onMouseLeave={hideTooltip}
                    onFocus={(e) => showTooltip(e, action)}
                    onBlur={hideTooltip}
                  >
                    <button
                      className="action-card"
                      onClick={() => takeAction(action)}
                      disabled={!canTake}
                      aria-label={label}
                    >
                      <h4 className="action-header">{translateCardText(locale, action.nameKey)}</h4>
                      <div className="action-desc">
                        {accDir && hasGainPerRound(action)
                          ? renderGainDisplay(action)
                          : action.baseDescriptionPreview
                        ? <ActionSpaceDescription locale={locale} preview={action.baseDescriptionPreview} />
                        : t(locale, action.nameKey)}
                      </div>
                      <div className="action-footer" />
                    </button>
                    {renderResourceHolder(action, true)}
                    {renderFutureMeepleHolder(action, { round: slot.round })}
                    {renderFarmerHolder(action)}
                    {renderExclusiveUseMarker(action)}
                    {renderBlockedMarker(action)}
                  </div>
                ) : (
                  <>
                    <div className="turn-number-placeholder">
                      <span className="turn-stage">{STAGE_LABELS[getStage(slot.round)] ?? ''}</span>
                      <span className="turn-round">{slot.round}</span>
                      <span className="turn-q">?</span>
                    </div>
                    {renderFutureMeepleHolder(action, { round: slot.round })}
                  </>
                )}
              </div>
            )
          })}

          {Object.entries(harvestPositions).map(([r, hp]) => (
            <div
              key={`h-${r}`}
              className={`harvest-marker ${currentRound >= Number(r) ? 'past' : ''}`}
              style={{ position: 'absolute', top: hp.top, left: hp.left }}
              title="Harvest"
            >
              H
            </div>
          ))}
        </div>
      </div>

      {localAdditionalActions.length > 0 ? (
        <div className="player-action-cards-row">
          <h3>{t(locale, 'ui.playerActionCards')}</h3>
          <div className="hand-row">{localAdditionalActions.map(renderAdditionalAction)}</div>
        </div>
      ) : null}
      {additionalActions.map(space => {
        const outlet = actionSpaceOutlets.get(space.id)
        return outlet ? createPortal(renderAdditionalAction(space), outlet, space.id) : null
      })}

      {tooltip && (
        <div
          className="round-action-tooltip"
          style={{ top: tooltip.y, left: tooltip.x }}
        >
          {tooltip.kind === 'action' && tooltip.spritePos ? (
            <>
              <div
                className="tooltip-action-card"
                data-action-id={tooltip.actionId}
              >
                <h4 className="action-header">{translateCardText(locale, tooltip.nameKey!)}</h4>
                <div className="action-desc">{tooltip.action.baseDescriptionPreview
                  ? <ActionSpaceDescription locale={locale} preview={tooltip.action.baseDescriptionPreview} />
                  : renderTooltipBody(tooltip)}</div>
              </div>
              <div className="tooltip-text">
                {tooltip.action.baseDescriptionPreview ? <div>{renderTooltipBody(tooltip)}</div> : null}
                {tooltip.leftActionName && (
                  <p className="tooltip-left-action">
                    {t(locale, 'ui.leftActionSpace', { action: tooltip.leftActionName })}
                  </p>
                )}
                {renderSupplementalRules(tooltip.action)}
              </div>
            </>
          ) : (
            <div className="tooltip-text">
              <strong>{tooltip.kind === 'action' ? translateCardText(locale, tooltip.nameKey!) : tooltip.title}</strong>
              {tooltip.kind === 'action' && tooltip.leftActionName && (
                <p className="tooltip-left-action">
                  {t(locale, 'ui.leftActionSpace', { action: tooltip.leftActionName })}
                </p>
              )}
              {(tooltip.kind === 'action' || tooltip.description) && (
                <div className="tooltip-description">{tooltip.kind === 'action' ? renderTooltipBody(tooltip) : tooltip.description}</div>
              )}
              {tooltip.kind === 'action' && renderSupplementalRules(tooltip.action)}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
