import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { ActionSpace, FutureMeeple, PlayerState, Resource } from '../../../shared/game/types'

const RESOURCE_LABELS: Record<string, string> = {
  wood: 'wood', clay: 'clay', reed: 'reed', stone: 'stone',
  grain: 'grain', vegetable: 'vegetable', food: 'food',
  sheep: 'sheep', boar: 'boar', cattle: 'cattle',
}

const BOARD_W = 1000
const BOARD_H = 795

type Pos = { top: number; left: number; width: number; height: number; size: 's' | 'std' }

const CX = 170

const SIDE_ACTIONS: Record<string, Pos> = {
  'copse':             { top: 18,  left: 5,   width: 60,  height: 83,  size: 's' },
  'grove':             { top: 110, left: 5,   width: 60,  height: 86,  size: 's' },
  'resource-market-4': { top: 236, left: 5,   width: 110, height: 65,  size: 'std' },
  'hollow-4':          { top: 313, left: 6,   width: 60,  height: 86,  size: 's' },
  'lessons-4':         { top: 412, left: 2,   width: 115, height: 94,  size: 'std' },
  'traveling-players': { top: 516, left: 53,  width: 65,  height: 84,  size: 's' },
}

const CENTRAL_ACTIONS: Record<string, Pos> = {
  'farm-expansion': { top: -3,  left: 30 + CX,  width: 115, height: 134, size: 'std' },
  'meeting-place':  { top: 134, left: 31 + CX,  width: 115, height: 72,  size: 'std' },
  'grain-seeds':    { top: 220, left: 30 + CX,  width: 115, height: 69,  size: 'std' },
  'farmland':       { top: 310, left: 30 + CX,  width: 115, height: 80,  size: 'std' },
  'forest':         { top: 203, left: 253 + CX, width: 60,  height: 86,  size: 's' },
  'clay-pit':       { top: 306, left: 175 + CX, width: 60,  height: 86,  size: 's' },
  'lessons':        { top: 406, left: 30 + CX,  width: 115, height: 94,  size: 'std' },
  'reed-bank':      { top: 411, left: 254 + CX, width: 60,  height: 86,  size: 's' },
  'day-laborer':    { top: 526, left: 30 + CX,  width: 115, height: 74,  size: 'std' },
  'fishing':        { top: 514, left: 175 + CX, width: 62,  height: 86,  size: 's' },
}

const BASE_POS: Record<string, Pos> = { ...SIDE_ACTIONS, ...CENTRAL_ACTIONS }

type SlotPos = { top: number; left: number }

const ROUND_POS: Record<number, SlotPos> = {
  1:  { top: 2,   left: 167 + CX },
  2:  { top: 1,   left: 331 + CX },
  3:  { top: 1,   left: 493 + CX },
  4:  { top: 1,   left: 657 + CX },
  5:  { top: 156, left: 330 + CX },
  6:  { top: 156, left: 493 + CX },
  7:  { top: 156, left: 657 + CX },
  8:  { top: 311, left: 330 + CX },
  9:  { top: 311, left: 493 + CX },
  10: { top: 462, left: 330 + CX },
  11: { top: 462, left: 493 + CX },
  12: { top: 626, left: 6 + CX },
  13: { top: 626, left: 172 + CX },
  14: { top: 626, left: 489 + CX },
}

const ROUND_SLOT_SIZE = 140

const HARVEST_POS: Record<number, SlotPos> = {
  4:  { top: 64,  left: 788 + CX },
  7:  { top: 213, left: 787 + CX },
  9:  { top: 370, left: 630 + CX },
  11: { top: 532, left: 632 + CX },
  13: { top: 663, left: 302 + CX },
  14: { top: 688, left: 617 + CX },
}

const ACCUMULATE_DIR: Record<string, 'left' | 'right' | 'bottom'> = {
  'forest': 'left',
  'reed-bank': 'left',
  'grove': 'left',
  'traveling-players': 'left',
  'clay-pit': 'right',
  'fishing': 'right',
  'hollow-4': 'right',
  'copse': 'right',
  'sheep-market': 'bottom',
  'western-quarry': 'bottom',
  'eastern-quarry': 'bottom',
  'pig-market': 'bottom',
  'cattle-market': 'bottom',
}

const RESOURCE_OFFSET: Record<string, React.CSSProperties> = {
  'forest':            { left: -54, bottom: 5 },
  'reed-bank':         { left: -75, bottom: 7 },
  'clay-pit':          { bottom: 5, left: 92 },
  'fishing':           { bottom: 10, left: 98 },
  'grove':             { left: -51, bottom: 3 },
  'hollow-4':          { left: 87, bottom: 9 },
  'traveling-players': { left: -54, bottom: 1 },
  'copse':             { left: 87, bottom: 5 },
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
  canTakeAction: (space: ActionSpace, player: PlayerState) => boolean
  takeAction: (space: ActionSpace) => void
  currentRound: number
  devMode: boolean
}

type TooltipInfo = {
  actionId: string
  nameKey: string
  descKey: string
  spritePos: string
  x: number
  y: number
}

export const ActionBoard = ({
  locale, baseActions, roundSlots, currentPlayer, players,
  futureMeeples, canTakeAction, takeAction, currentRound, devMode,
}: Props) => {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null)

  const updateScale = useCallback(() => {
    const el = wrapperRef.current
    if (!el) return
    setScale(el.clientWidth / BOARD_W)
  }, [])

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
    const offset: React.CSSProperties = RESOURCE_OFFSET[space.id]
      ?? (isRound ? { bottom: 6, right: 30 } : {})
    return (
      <div className="resource-holder" data-n={totalCount} style={offset}>
        {items.flatMap((item) =>
          Array.from({ length: Math.min(item.amount, 6) }, (_, i) => (
            <span key={`${item.resource}-${i}`} className={`res-icon res-icon-${item.resource}`} />
          ))
        )}
      </div>
    )
  }

  const renderFarmerHolder = (space: ActionSpace) => {
    const p = players.find((pl) => pl.id === space.takenBy)
    if (!p) return null
    return (
      <div className="farmer-holder">
        <div className={`meeple meeple-${p.color}`}>
          <span className="meeple-text">{p.name}</span>
        </div>
      </div>
    )
  }

  const showTooltip = (e: MouseEvent, action: ActionSpace) => {
    const spritePos = ACTION_SPRITE[action.id]
    if (!spritePos) return
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const tooltipW = 360
    const rightSpace = window.innerWidth - rect.right
    const x = rightSpace > tooltipW + 16 ? rect.right + 8 : rect.left - tooltipW - 8
    setTooltip({
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
        <div className="action-board" style={{ transform: `scale(${scale})`, width: BOARD_W, height: BOARD_H }}>

          {baseActions.map((space) => {
            const pos = BASE_POS[space.id]
            if (!pos) return null
            const accDir = ACCUMULATE_DIR[space.id]
            return (
              <div
                key={space.id}
                className={[
                  'action-card-holder',
                  accDir && `accumulate-${accDir}`,
                  space.takenBy && 'taken',
                ].filter(Boolean).join(' ')}
                data-action-id={space.id}
                style={{ position: 'absolute', top: pos.top, left: pos.left, width: pos.width, height: pos.height }}
              >
                <button
                  className={`action-card action-${pos.size}`}
                  onClick={() => takeAction(space)}
                  disabled={!canTakeAction(space, currentPlayer)}
                >
                  <h4 className="action-header">{t(locale, space.nameKey)}</h4>
                  <div className="action-desc">
                    {accDir && hasGainPerRound(space)
                      ? renderGainDisplay(space)
                      : t(locale, space.descriptionKey)}
                  </div>
                  <div className="action-footer" />
                </button>
                {renderResourceHolder(space)}
                {renderFarmerHolder(space)}
              </div>
            )
          })}

          {roundSlots.map((slot) => {
            const pos = ROUND_POS[slot.round]
            if (!pos) return null
            const isOpen = devMode || currentRound >= slot.round
            const action = slot.action
            const accDir = action ? ACCUMULATE_DIR[action.id] : undefined
            const spritePos = action ? ACTION_SPRITE[action.id] : undefined
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
                      action.takenBy && 'taken',
                    ].filter(Boolean).join(' ')}
                    data-action-id={action.id}
                    onMouseEnter={(e) => showTooltip(e, action)}
                    onMouseLeave={hideTooltip}
                  >
                    <button
                      className="action-card"
                      onClick={() => takeAction(action)}
                      disabled={!canTakeAction(action, currentPlayer)}
                    >
                      <h4 className="action-header">{t(locale, action.nameKey)}</h4>
                      <div className="action-desc">
                        {accDir && hasGainPerRound(action)
                          ? renderGainDisplay(action)
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

          {Object.entries(HARVEST_POS).map(([r, hp]) => (
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

      {tooltip && (
        <div
          className="round-action-tooltip"
          style={{ top: tooltip.y, left: tooltip.x }}
        >
          <div className="tooltip-card-img" style={{ backgroundPosition: tooltip.spritePos }} />
          <div className="tooltip-text">
            <strong>{t(locale, tooltip.nameKey)}</strong>
            <p>{t(locale, tooltip.descKey)}</p>
          </div>
        </div>
      )}
    </section>
  )
}
