import { useState } from 'react'
import { t, type Locale } from '../../../shared/i18n'
import type { Resource } from '../../../shared/contract/types'

type ResourceKey = keyof Resource

type Props = {
  locale: Locale
  availableByResource: Partial<Record<ResourceKey, number>>
  promptKey?: string
  onConfirm: (counts: Partial<Record<ResourceKey, number>>) => void
  onCancel: () => void
}

export const ResourceQuantitySelectPanel = ({
  locale, availableByResource, promptKey, onConfirm, onCancel,
}: Props) => {
  const entries = Object.entries(availableByResource) as Array<[ResourceKey, number]>
  const [counts, setCounts] = useState<Partial<Record<ResourceKey, number>>>(() =>
    Object.fromEntries(entries.map(([k]) => [k, 0])) as Partial<Record<ResourceKey, number>>,
  )
  const total = entries.reduce((sum, [k]) => sum + (counts[k] ?? 0), 0)

  const setCount = (key: ResourceKey, value: number, max: number) => {
    const normalized = Number.isFinite(value) ? Math.floor(value) : 0
    const clamped = Math.max(0, Math.min(max, normalized))
    setCounts((prev) => ({ ...prev, [key]: clamped }))
  }

  return (
    <div className="resource-quantity-select-panel interaction-resource-quantity-panel">
      <div className="interaction-title">
        {promptKey ? t(locale, promptKey) : t(locale, 'ui.interactionResourceQuantitySelect')}
      </div>
      <div className="resource-quantity-grid">
        {entries.map(([key, max]) => (
          <label key={key} className="resource-quantity-row">
            <span className="resource-quantity-label">{t(locale, 'ui.interactionResourceQuantityRow', {
              type: t(locale, `resources.${key}`),
              max,
            })}</span>
            <input
              type="number"
              min={0}
              max={max}
              value={counts[key] ?? 0}
              onChange={(e) => setCount(key, Number(e.target.value), max)}
              disabled={max === 0}
            />
          </label>
        ))}
      </div>
      <div className="interaction-actions resource-quantity-actions">
        <button type="button" className="is-primary" disabled={total < 1} onClick={() => onConfirm(counts)}>
          {t(locale, 'ui.interactionResourceQuantityConfirm')}
        </button>
        <button type="button" onClick={onCancel}>
          {t(locale, 'ui.interactionResourceQuantityCancel')}
        </button>
      </div>
    </div>
  )
}
