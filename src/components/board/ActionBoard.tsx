import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { ActionSpace, FutureMeeple, PlayerState, Resource } from '../../../shared/game/types'

const BOARD_W = 1000
const BOARD_H = 795

type Pos = { top: number; left: number; width: number; height: number; size: 's' | 'std' }

/*
 * BGA uses 3 boards side-by-side: left-board | add-board | central-board(830px).
 * We merge them into one 1000px-wide board. The central.png background is
 * offset to x=170 so the leftmost 170px acts as the side-board area.
 * All BGA central-board coordinates get +170 added to their x.
 */
const CX = 170 // central-board x-offset

// Side-board actions (BGA add-board / left-board)
const SIDE_ACTIONS: Record<string, Pos> = {
  'copse':             { top: 18,  left: 5,   width: 60,  height: 83,  size: 's' },
  'grove':             { top: 110, left: 5,   width: 60,  height: 86,  size: 's' },
  'resource-market-4': { top: 236, left: 5,   width: 110, height: 65,  size: 'std' },
  'hollow-4':          { top: 313, left: 6,   width: 60,  height: 86,  size: 's' },
  'lessons-4':         { top: 412, left: 2,   width: 115, height: 94,  size: 'std' },
  'traveling-players': { top: 516, left: 53,  width: 65,  height: 84,  size: 's' },
}

// Central-board actions (BGA central board, x offset by CX)
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

export const ActionBoard = ({
  locale, baseActions, roundSlots, currentPlayer, players,
  futureMeeples, canTakeAction, takeAction, currentRound, devMode,
}: Props) => {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

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
    const items = new Map<string, { resource: keyof Resource; amount: number; player?: PlayerState }>()
    const add = (resource: keyof Resource, amount: number, player?: PlayerState) => {
      if (amount <= 0) return
      const key = `${player?.id ?? 'none'}:${resource}`
      const prev = items.get(key)
      if (prev) { prev.amount += amount; return }
      items.set(key, { resource, amount, player })
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
    return Array.from(items.values())
  }

  const renderStack = (action: ActionSpace) => {
    const items = buildStackItems(action)
    if (!items.length) return null
    return (
      <div className="action-stack">
        {items.map((item, i) => {
          const label = `${t(locale, `resources.${item.resource}`)} ${item.amount}`
          const title = item.player ? `${item.player.name}: ${label}` : label
          return (
            <div key={`s-${action.id}-${i}`} className={`resource-chip resource-${item.resource}`} title={title} data-resource={item.resource} data-amount={item.amount}>
              {item.player && <span className={`resource-owner meeple-${item.player.color}`} />}
              <span className={`res-icon res-icon-${item.resource}`} />
              <span className="resource-chip-text">{item.amount}</span>
            </div>
          )
        })}
      </div>
    )
  }

  const renderMeeple = (action: ActionSpace) => {
    const p = players.find((pl) => pl.id === action.takenBy)
    if (!p) return null
    return <div className={`meeple meeple-${p.color}`}><span className="meeple-text">{p.name}</span></div>
  }

  return (
    <section className="actions">
      <h2>{t(locale, 'ui.actionArea')}</h2>
      <div className="action-board-wrapper" ref={wrapperRef} style={{ height: BOARD_H * scale }}>
        <div className="action-board" style={{ transform: `scale(${scale})`, width: BOARD_W, height: BOARD_H }}>

          {/* Base actions */}
          {baseActions.map((space) => {
            const pos = BASE_POS[space.id]
            if (!pos) return null
            return (
              <button
                key={space.id}
                className={`action-card base-action ${space.takenBy ? 'taken' : ''}`}
                data-action-id={space.id}
                data-card-size={pos.size}
                style={{ position: 'absolute', top: pos.top, left: pos.left, width: pos.width, height: pos.height }}
                onClick={() => takeAction(space)}
                disabled={!canTakeAction(space, currentPlayer)}
              >
                <div className="action-title">{t(locale, space.nameKey)}</div>
                <div className="action-desc">{t(locale, space.descriptionKey)}</div>
                {renderStack(space)}
                {renderMeeple(space)}
              </button>
            )
          })}

          {/* Round action slots */}
          {roundSlots.map((slot) => {
            const pos = ROUND_POS[slot.round]
            if (!pos) return null
            const isOpen = devMode || currentRound >= slot.round
            const action = slot.action
            return (
              <div
                key={`r-${slot.round}`}
                className="round-slot"
                style={{ position: 'absolute', top: pos.top, left: pos.left, width: ROUND_SLOT_SIZE, height: ROUND_SLOT_SIZE }}
              >
                {action && isOpen ? (
                  <button
                    className={`action-card round-action ${action.takenBy ? 'taken' : ''}`}
                    data-action-id={action.id}
                    onClick={() => takeAction(action)}
                    disabled={!canTakeAction(action, currentPlayer)}
                  >
                    <div className="action-title">{t(locale, action.nameKey)}</div>
                    <div className="action-desc">{t(locale, action.descriptionKey)}</div>
                    {renderStack(action)}
                    {renderMeeple(action)}
                  </button>
                ) : (
                  <div className={`round-placeholder ${currentRound >= slot.round ? 'past' : ''}`}>
                    <span className="round-number">{slot.round}</span>
                    <span className="round-q">?</span>
                  </div>
                )}
              </div>
            )
          })}

          {/* Harvest markers */}
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
    </section>
  )
}
