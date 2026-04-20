import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { ActionSpace, FutureMeeple, PlayerState, Resource } from '../../../shared/game/types'
import { getRoundPlacementOrder } from '../../../shared/cards/helpers/round-placement'
import { PlayerCard } from '../common/PlayerCard'
import { getOccupation } from '../../../shared/game/occupations'

const BOARD_W_2P = 830
const BOARD_W_WITH_SIDE = 1000
const BOARD_H = 795

type Pos = { top: number; left: number; width: number; height: number; size: 's' | 'std' }

const SIDE_PANEL_OFFSET = 170

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
  'traveling-players': 'left',
  'clay-pit': 'right',
  'fishing': 'right',
  'hollow-4': 'right',
  'hollow': 'right',
  'copse': 'right',
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
  'hollow-4':          { left: 87, bottom: 9 },
  'hollow':            { left: 87, bottom: 9 },
  'traveling-players': { left: -54, bottom: 1 },
  'copse':             { left: 87, bottom: 5 },
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

const ACTION_ICON_DESC: Record<string, string[]> = {
  // Base actions
  'farm-expansion':     ['5<wood>2<reed><arrow><room-wood>', '5<clay>2<reed><arrow><room-clay>', '5<stone>2<reed><arrow><room-stone>', '+', '2<wood> <arrow> <barn>'],
  'meeting-place':      ['<first> + 1<minor>'],
  'grain-seeds':        ['+1<grain>'],
  'farmland':           ['<field>'],
  'day-laborer':        ['+2<food>'],
  'lessons':            ['[Pay] 1<food>*', '1<occupation>'],
  'lessons-3':          ['[Pay] 2<food>', '1<occupation>'],
  'lessons-4':          ['[Pay] 2<food>*', '1<occupation>'],
  'resource-market':    ['+1<reed> / <stone> +1<food>'],
  'resource-market-4':  ['+1<reed>+1<stone>+1<food>'],
  // Round actions
  'fencing':            ['1<wood><arrow><fence-icon>'],
  'grain-utilization':  ['<sow> + <bread>'],
  'major-improvement':  ['1<major>/<minor>'],
  'vegetable-seeds':    ['+1<vegetable>'],
  'cultivation':        ['<field> + <sow>'],
  'wish-children':      ['<child> [▷] 1<minor>'],
  'urgent-wish-children': ['<child-free>'],
  'house-redevelopment':  ['<upgrade>', '[▷] 1<major>/<minor>'],
  'farm-redevelopment':   ['<upgrade>', '[▷] 1<wood><arrow><fence-icon>'],
  'sheep-market':       [],
  'pig-market':         [],
  'cattle-market':      [],
  'western-quarry':     [],
  'eastern-quarry':     [],
}

function getIconLineClassName(actionId?: string): string {
  return actionId === 'resource-market'
    ? 'icon-line icon-line--resource-market'
    : 'icon-line'
}

function getIconTokenClassName(actionId: string | undefined, token: string): string | undefined {
  if (actionId !== 'resource-market') return undefined
  const trimmed = token.trim()
  if (trimmed === '/') return 'icon-token icon-token--slash'
  if (token !== trimmed && trimmed.startsWith('+')) return 'icon-token icon-token--spaced-plus'
  return undefined
}

function renderTextToken(key: number, token: string, actionId?: string): React.ReactNode {
  const className = getIconTokenClassName(actionId, token)
  return className
    ? <span key={key} className={className}>{token}</span>
    : <span key={key}>{token}</span>
}

function renderIconDesc(templates: string[], actionId?: string): React.ReactNode {
  return templates.map((tpl, i) => {
    const parts: React.ReactNode[] = []
    let rest = tpl
    let key = 0
    while (rest.length > 0) {
      // Match <type> icons
      const iconMatch = rest.match(/^<([a-z-]+)>/)
      if (iconMatch) {
        parts.push(<span key={key++} className={`res-icon res-icon-${iconMatch[1]}`} />)
        rest = rest.slice(iconMatch[0].length)
        continue
      }
      // Match [text] brackets
      const textMatch = rest.match(/^\[([^\]]*)\]/)
      if (textMatch) {
        parts.push(<span key={key++} className="text">{textMatch[1]}</span>)
        rest = rest.slice(textMatch[0].length)
        continue
      }
      // Plain text until next < or [
      const nextSpecial = rest.search(/[<\[]/)
      if (nextSpecial === -1) {
        parts.push(renderTextToken(key++, rest, actionId))
        break
      }
      parts.push(renderTextToken(key++, rest.slice(0, nextSpecial), actionId))
      rest = rest.slice(nextSpecial)
    }
    return <div key={i} className={getIconLineClassName(actionId)}>{parts}</div>
  })
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
  canTakeAction: (space: ActionSpace, player: PlayerState) => boolean
  takeAction: (space: ActionSpace) => void
  currentRound: number
  devMode: boolean
}

type TooltipInfo = {
  kind: 'action' | 'resource'
  actionId?: string
  nameKey?: string
  descKey?: string
  title?: string
  description?: string
  spritePos?: string
  x: number
  y: number
}

type SpaceFarmerMarker = {
  player: PlayerState
  key: string
  hasOffspring?: boolean
}

const isFamilyGrowthAction = (spaceId: string) =>
  spaceId.startsWith('wish-children') || spaceId.startsWith('urgent-wish-children')

const getBoardPlayerCount = (players: PlayerState[]): 2 | 3 | 4 => {
  const count = players.length
  if (count >= 4) return 4
  if (count === 3) return 3
  return 2
}

const getBoardOffset = (playerCount: 2 | 3 | 4) =>
  playerCount === 2 ? 0 : SIDE_PANEL_OFFSET

const shiftPos = (pos: Pos, leftOffset: number): Pos => ({
  ...pos,
  left: pos.left + leftOffset,
})

const shiftSlotPos = (pos: SlotPos, leftOffset: number): SlotPos => ({
  ...pos,
  left: pos.left + leftOffset,
})

const getBasePositions = (playerCount: 2 | 3 | 4): Record<string, Pos> => {
  const leftOffset = getBoardOffset(playerCount)
  const shiftedCentral = Object.fromEntries(
    Object.entries(CENTRAL_ACTIONS).map(([spaceId, pos]) => [
      spaceId,
      shiftPos(pos, leftOffset),
    ]),
  ) as Record<string, Pos>
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

const getResourceOffsets = (playerCount: 2 | 3 | 4): Partial<Record<string, React.CSSProperties>> => {
  const overrides = RESOURCE_OFFSET_OVERRIDES[playerCount]
  if (!overrides) return RESOURCE_OFFSET
  return {
    ...RESOURCE_OFFSET,
    ...overrides,
  }
}

const getRoundPositions = (playerCount: 2 | 3 | 4): Record<number, SlotPos> => {
  const leftOffset = getBoardOffset(playerCount)
  return Object.fromEntries(
    Object.entries(ROUND_POS).map(([round, pos]) => [
      Number(round),
      shiftSlotPos(pos, leftOffset),
    ]),
  ) as Record<number, SlotPos>
}

const getHarvestPositions = (playerCount: 2 | 3 | 4): Record<number, SlotPos> => {
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
  futureMeeples, canTakeAction, takeAction, currentRound, devMode,
}: Props) => {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null)
  const playerCount = getBoardPlayerCount(players)
  const boardClassName = `action-board action-board--${playerCount}p`
  const boardWidth = playerCount === 2 ? BOARD_W_2P : BOARD_W_WITH_SIDE
  const basePositions = useMemo(() => getBasePositions(playerCount), [playerCount])
  const resourceOffsets = useMemo(() => getResourceOffsets(playerCount), [playerCount])
  const roundPositions = useMemo(() => getRoundPositions(playerCount), [playerCount])
  const harvestPositions = useMemo(() => getHarvestPositions(playerCount), [playerCount])

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

  const farmerMarkersBySpace = useMemo(() => {
    const markers = new Map<string, SpaceFarmerMarker[]>()
    const push = (spaceId: string, marker: SpaceFarmerMarker) => {
      const current = markers.get(spaceId) ?? []
      current.push(marker)
      markers.set(spaceId, current)
    }

    players.forEach((player) => {
      getRoundPlacementOrder(player).forEach((spaceId, index) => {
        push(spaceId, {
          player,
          key: `${player.id}-${spaceId}-${index}`,
          hasOffspring: isFamilyGrowthAction(spaceId),
        })
      })
    })

    return markers
  }, [players])

  const buildStackItems = (action: ActionSpace) => {
    const items: { resource: keyof Resource; amount: number; player?: PlayerState }[] = []
    const seen = new Map<string, number>()
    const add = (resource: keyof Resource, amount: number, player?: PlayerState) => {
      if (amount <= 0) return
      const key = `${player?.id ?? 'none'}:${resource}`
      const idx = seen.get(key)
      if (idx !== undefined) { items[idx].amount += amount; return }
      seen.set(key, items.length)
      items.push({ resource, amount, player })
    }
    for (const [k, v] of Object.entries(action.resources)) {
      if ((v ?? 0) > 0) add(k as keyof Resource, v ?? 0)
    }
    for (const fm of futureMeeples) {
      if (fm.actionId !== action.id) continue
      const owner = playerById.get(fm.playerId)
      for (const [k, v] of Object.entries(fm.resources)) {
        if ((v ?? 0) > 0) add(k as keyof Resource, v ?? 0, owner)
      }
    }
    return items
  }

  const renderResourceHolder = (space: ActionSpace, isRound = false) => {
    const items = buildStackItems(space)
    if (!items.length) return null
    const totalCount = items.reduce((sum, item) => sum + item.amount, 0)
    const offset: React.CSSProperties = resourceOffsets[space.id]
      ?? (isRound ? { bottom: 6, right: 30 } : {})
    return (
      <div className="resource-holder" data-n={totalCount} style={offset}>
        {items.flatMap((item) =>
          Array.from({ length: Math.min(item.amount, 6) }, (_, i) => (
            <span
              key={`${item.player?.id ?? 'none'}-${item.resource}-${i}`}
              className={`res-icon res-icon-${item.resource}`}
              title={item.player ? `${item.player.name}: ${t(locale, `resources.${item.resource}`)}` : undefined}
              aria-label={item.player ? `${item.player.name}: ${t(locale, `resources.${item.resource}`)}` : undefined}
              data-owner-player={item.player?.id}
              data-owner-label={item.player ? `${item.player.name}: ${t(locale, `resources.${item.resource}`)}` : undefined}
              onMouseEnter={(e) => {
                if (!item.player) return
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                setTooltip({
                  kind: 'resource',
                  title: item.player.name,
                  description: t(locale, `resources.${item.resource}`),
                  x: rect.right + 8,
                  y: rect.top - 8,
                })
              }}
              onMouseLeave={hideTooltip}
            />
          ))
        )}
      </div>
    )
  }

  const lazyboneStablesBySpace = useMemo(() => {
    const map = new Map<string, PlayerState>()
    for (const player of players) {
      const spaces = (player.cardStates?.['E148_Lazybones']?.extraData as { spaces?: string[] } | undefined)?.spaces
      if (!spaces) continue
      for (const spaceId of spaces) {
        map.set(spaceId, player)
      }
    }
    return map
  }, [players])

  const renderStableMarker = (space: ActionSpace) => {
    const owner = lazyboneStablesBySpace.get(space.id)
    if (!owner) return null
    return (
      <div className="lazybones-stable-marker" data-player-color={owner.color} title={`${owner.name}: Lazybones`}>
        <span className="res-icon res-icon-barn" />
      </div>
    )
  }

  const renderFarmerHolder = (space: ActionSpace) => {
    const markers = farmerMarkersBySpace.get(space.id)
    // Fallback: if there are no custom markers for this space, synthesize one
    // per occupant from `takenBy` (one marker per placed worker).
    const fallbackEntries = space.takenBy
      .map((ref) => {
        const player = players.find((pl) => pl.id === ref.playerId)
        return player
          ? {
              player,
              key: `${player.id}-${space.id}-${ref.workerId}-fallback`,
              hasOffspring: false,
            }
          : null
      })
      .filter((entry): entry is { player: PlayerState; key: string; hasOffspring: boolean } => entry !== null)
    const entries = markers && markers.length > 0 ? markers : fallbackEntries
    if (entries.length === 0) return null
    return (
      <div className="farmer-holder" data-n={entries.length}>
        {entries.map((entry) => (
          <div
            key={entry.key}
            className={`action-farmer-stack${entry.hasOffspring ? ' has-offspring' : ''}`}
            title={entry.player.name}
          >
            {entry.hasOffspring && (
              <div className={`action-farmer action-farmer-${entry.player.color} child`} />
            )}
            <div className={`action-farmer action-farmer-${entry.player.color}`} />
          </div>
        ))}
      </div>
    )
  }

  const showTooltip = (e: MouseEvent, action: ActionSpace) => {
    const spritePos = ACTION_SPRITE[action.id]
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const tooltipW = 360
    const rightSpace = window.innerWidth - rect.right
    const x = rightSpace > tooltipW + 16 ? rect.right + 8 : rect.left - tooltipW - 8
    setTooltip({
      kind: 'action',
      actionId: action.id,
      nameKey: action.nameKey,
      descKey: action.descriptionKey,
      spritePos,
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

  return (
    <section className="actions">
      <h2>{t(locale, 'ui.actionArea')}</h2>
      <div className="action-board-wrapper" ref={wrapperRef} style={{ height: BOARD_H * scale }}>
        <div className={boardClassName} style={{ transform: `scale(${scale})`, width: boardWidth, height: BOARD_H }}>

          {baseActions.map((space) => {
            const pos = basePositions[space.id]
            if (!pos) return null
            const accDir = ACCUMULATE_DIR[space.id]
            const canTake = canTakeAction(space, currentPlayer)
            const hasFarmer = (farmerMarkersBySpace.get(space.id)?.length ?? 0) > 0 || space.takenBy.length > 0
            return (
              <div
                key={space.id}
                className={[
                  'action-card-holder',
                  accDir && `accumulate-${accDir}`,
                  hasFarmer && !canTake && 'taken',
                  hasFarmer && canTake && 'occupied-available',
                ].filter(Boolean).join(' ')}
                data-action-id={space.id}
                style={{ position: 'absolute', top: pos.top, left: pos.left, width: pos.width, height: pos.height }}
                onMouseEnter={(e) => showTooltip(e, space)}
                onMouseLeave={hideTooltip}
              >
                <button
                  className={`action-card action-${pos.size}`}
                  onClick={() => takeAction(space)}
                  disabled={!canTake}
                >
                  <h4 className="action-header">{t(locale, space.nameKey)}</h4>
                  <div className="action-desc">
                    {accDir && hasGainPerRound(space)
                      ? renderGainDisplay(space)
                      : ACTION_ICON_DESC[space.id]?.length
                        ? renderIconDesc(ACTION_ICON_DESC[space.id], space.id)
                        : t(locale, space.descriptionKey)}
                  </div>
                  <div className="action-footer" />
                </button>
                {renderResourceHolder(space)}
                {renderFarmerHolder(space)}
                {renderStableMarker(space)}
              </div>
            )
          })}

          {roundSlots.map((slot) => {
            const pos = roundPositions[slot.round]
            if (!pos) return null
            const isOpen = devMode || currentRound >= slot.round
            const action = slot.action
            const accDir = action ? ACCUMULATE_DIR[action.id] : undefined
            const canTake = action ? canTakeAction(action, currentPlayer) : false
            const hasFarmer = action
              ? (farmerMarkersBySpace.get(action.id)?.length ?? 0) > 0 || action.takenBy.length > 0
              : false
            return (
              <div
                key={`r-${slot.round}`}
                className="turn-action-container"
                style={{ position: 'absolute', top: pos.top, left: pos.left, width: ROUND_SLOT_SIZE, height: ROUND_SLOT_SIZE }}
              >
                {action && isOpen ? (
                  <div
                    className={[
                      'action-card-holder round',
                      accDir && `accumulate-${accDir}`,
                      hasFarmer && !canTake && 'taken',
                      hasFarmer && canTake && 'occupied-available',
                    ].filter(Boolean).join(' ')}
                    data-action-id={action.id}
                    onMouseEnter={(e) => showTooltip(e, action)}
                    onMouseLeave={hideTooltip}
                  >
                    <button
                      className="action-card"
                      onClick={() => takeAction(action)}
                      disabled={!canTake}
                    >
                      <h4 className="action-header">{t(locale, action.nameKey)}</h4>
                      <div className="action-desc">
                        {accDir && hasGainPerRound(action)
                          ? renderGainDisplay(action)
                          : ACTION_ICON_DESC[action.id]?.length
                            ? renderIconDesc(ACTION_ICON_DESC[action.id], action.id)
                            : t(locale, action.descriptionKey)}
                      </div>
                      <div className="action-footer" />
                    </button>
                    {renderResourceHolder(action, true)}
                    {renderFarmerHolder(action)}
                  </div>
                ) : (
                  <div className="turn-number-placeholder">
                    <span className="turn-stage">{STAGE_LABELS[getStage(slot.round)] ?? ''}</span>
                    <span className="turn-round">{slot.round}</span>
                    <span className="turn-q">?</span>
                  </div>
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

      {/* Dynamic PlayerActionCard action spaces — rendered as BGA-style cards */}
      {baseActions.filter((s) => !basePositions[s.id]).length > 0 && (
        <div className="player-action-cards-row">
          <h3>{t(locale, 'ui.playerActionCards')}</h3>
          <div className="hand-row">
            {baseActions.filter((s) => !basePositions[s.id]).map((space) => {
              const canTake = canTakeAction(space, currentPlayer)
              const isOccupation = !!getOccupation(space.id)
              const cardType = isOccupation ? 'occupation' as const : 'minor' as const
              const owner = players.find((p) =>
                p.minorPlayed.includes(space.id) || p.occupationPlayed.includes(space.id)
              )
              return (
                <div key={space.id} className="player-action-card-wrapper">
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
                  {owner && (
                    <div className="player-action-card-owner" data-player-color={owner.color}>
                      {owner.name}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tooltip && (
        <div
          className="round-action-tooltip"
          style={{ top: tooltip.y, left: tooltip.x }}
        >
          {tooltip.kind === 'action' && tooltip.spritePos && (
            <div className="tooltip-card-img" style={{ backgroundPosition: tooltip.spritePos }} />
          )}
          <div className="tooltip-text">
            <strong>{tooltip.kind === 'action' ? t(locale, tooltip.nameKey!) : tooltip.title}</strong>
            {(tooltip.kind === 'action' || tooltip.description) && (
              <p>{tooltip.kind === 'action' ? t(locale, tooltip.descKey!) : tooltip.description}</p>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
