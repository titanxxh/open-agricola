import { useState } from 'react'
import { t, type Locale } from '../../../shared/i18n'

type Props = {
  locale: Locale
  availableByType: { sheep: number; boar: number; cattle: number }
  onConfirm: (counts: { sheep: number; boar: number; cattle: number }) => void
  onCancel: () => void
}

const TURNS = { sheep: 3, boar: 5, cattle: 7 } as const

export const AnimalQuantitySelectPanel = ({
  locale, availableByType, onConfirm, onCancel,
}: Props) => {
  const [counts, setCounts] = useState({ sheep: 0, boar: 0, cattle: 0 })
  const total = counts.sheep + counts.boar + counts.cattle
  const foodPreview =
    counts.sheep * TURNS.sheep + counts.boar * TURNS.boar + counts.cattle * TURNS.cattle

  const setCount = (type: 'sheep' | 'boar' | 'cattle', value: number) => {
    const normalized = Number.isFinite(value) ? Math.floor(value) : 0
    const clamped = Math.max(0, Math.min(availableByType[type], normalized))
    setCounts((prev) => ({ ...prev, [type]: clamped }))
  }

  return (
    <div className="animal-quantity-select-panel">
      <div className="prompt">{t(locale, 'ui.interactionAnimalQuantitySelect')}</div>
      {(['sheep', 'boar', 'cattle'] as const).map((type) => (
        <div key={type} className="row">
          <label>{t(locale, 'ui.interactionAnimalQuantityRow', {
            type: t(locale, `resources.${type}`),
            max: availableByType[type],
          })}</label>
          <input
            type="number"
            min={0}
            max={availableByType[type]}
            value={counts[type]}
            onChange={(e) => setCount(type, Number(e.target.value))}
            disabled={availableByType[type] === 0}
          />
        </div>
      ))}
      <div className="preview">{t(locale, 'ui.interactionAnimalQuantityTotalFood', { n: foodPreview })}</div>
      <div className="actions">
        <button disabled={total < 1} onClick={() => onConfirm(counts)}>
          {t(locale, 'ui.interactionAnimalQuantityConfirm')}
        </button>
        <button onClick={onCancel}>
          {t(locale, 'ui.interactionAnimalQuantityCancel')}
        </button>
      </div>
    </div>
  )
}
