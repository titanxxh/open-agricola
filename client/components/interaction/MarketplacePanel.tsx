import { useState } from 'react'
import { t, type Locale } from '../../../shared/i18n'
import type { MarketplaceGood, MarketplaceRequest, MarketplaceTransfer } from '../../../shared/contract/marketplace'
import './marketplace.css'

type RowDraft = { direction: '' | MarketplaceTransfer['direction']; teammatePlayerId: string; amount: number }
type Props = {
  locale: Locale
  request: MarketplaceRequest
  actorName: string
  isConfirmDisabled?: (transfers: MarketplaceTransfer[]) => boolean
  onConfirm: (transfers: MarketplaceTransfer[]) => void
}

export function MarketplacePanel({ locale, request, actorName, onConfirm, isConfirmDisabled }: Props) {
  const [rows, setRows] = useState<Partial<Record<MarketplaceGood, RowDraft>>>({})
  const rowFor = (good: MarketplaceGood): RowDraft => rows[good] ?? {
    direction: '', teammatePlayerId: request.teammates[0]?.playerId ?? '', amount: 1,
  }
  const update = (good: MarketplaceGood, change: Partial<RowDraft>) => setRows(previous => ({
    ...previous, [good]: { ...(previous[good] ?? { direction: '', teammatePlayerId: request.teammates[0]?.playerId ?? '', amount: 1 }), ...change },
  }))
  const selected = request.goods.flatMap((resource): MarketplaceTransfer[] => {
    const row = rowFor(resource)
    return row.direction ? [{ resource, direction: row.direction, teammatePlayerId: row.teammatePlayerId, amount: row.amount }] : []
  })
  const maxTransfer = (good: MarketplaceGood, row: RowDraft): number => {
    const inventory = row.direction === 'take'
      ? request.teammates.find(mate => mate.playerId === row.teammatePlayerId)?.availableByResource
      : request.availableByResource
    return Math.max(0, (inventory?.[good] ?? 0) - 1)
  }
  const valid = selected.length > 0 && selected.every(row => Number.isSafeInteger(row.amount) && row.amount >= 1
    && row.amount <= maxTransfer(row.resource, row) && request.teammates.some(mate => mate.playerId === row.teammatePlayerId))

  return <div className="marketplace-panel">
    <div className="interaction-title">{t(locale, 'ui.marketplace.prompt')}</div>
    <div className="marketplace-rows">
      {request.goods.map(good => {
        const row = rowFor(good)
        const mate = request.teammates.find(candidate => candidate.playerId === row.teammatePlayerId)
        const active = row.direction !== ''
        const giver = row.direction === 'take' ? mate?.name ?? '' : actorName
        const resource = t(locale, `resources.${good}`)
        return <fieldset className="marketplace-row" data-marketplace-resource={good} key={good}>
          <legend><span className={`res-icon res-icon-${good}`} aria-hidden="true" /> {resource}</legend>
          <label>{t(locale, 'ui.marketplace.direction')}
            <select value={row.direction} onChange={event => {
              const direction = event.target.value
              if (direction === '' || direction === 'give' || direction === 'take') update(good, { direction })
            }}>
              <option value="">{t(locale, 'ui.marketplace.none')}</option>
              <option value="give">{t(locale, 'ui.marketplace.give')}</option>
              <option value="take">{t(locale, 'ui.marketplace.take')}</option>
            </select>
          </label>
          <label>{t(locale, 'ui.marketplace.teammate')}
            <select disabled={!active} value={row.teammatePlayerId} onChange={event => update(good, { teammatePlayerId: event.target.value })}>
              {request.teammates.map(teammate => <option key={teammate.playerId} value={teammate.playerId}>{teammate.name}</option>)}
            </select>
          </label>
          <label>{t(locale, 'ui.marketplace.quantity')}
            <input type="number" min={1} max={maxTransfer(good, row)} step={1} disabled={!active}
              value={Number.isFinite(row.amount) ? row.amount : ''} onChange={event => update(good, { amount: Number(event.target.value) })} />
          </label>
          {active && <output className="marketplace-tax" aria-live="polite">
            {t(locale, 'ui.marketplace.giverPays', { giver, goods: `${row.amount} ${resource}`, tax: `1 ${resource}` })}
          </output>}
        </fieldset>
      })}
    </div>
    {!valid && <p className="marketplace-hint">{t(locale, selected.length ? 'ui.marketplace.insufficientGoods' : 'ui.marketplace.emptySelection')}</p>}
    <div className="interaction-actions">
      <button type="button" className="is-primary" disabled={!valid || isConfirmDisabled?.(selected)} onClick={() => onConfirm(selected)}>
        {t(locale, 'ui.marketplace.confirm')}
      </button>
    </div>
  </div>
}
