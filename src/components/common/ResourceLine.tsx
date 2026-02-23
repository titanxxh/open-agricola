import type { Locale } from '../../i18n'
import { t } from '../../i18n'
import type { Resource } from '../../game/types'
import { resourceKeyList } from '../../logic/state'

type Props = {
  locale: Locale
  resources: Partial<Resource>
  hideZero?: boolean
  emptyLabel?: string
  className?: string
}

export const ResourceLine = ({
  locale,
  resources,
  hideZero = true,
  emptyLabel,
  className,
}: Props) => {
  const items = resourceKeyList
    .map((key) => ({ key, amount: resources[key] ?? 0 }))
    .filter(({ amount }) => !hideZero || amount > 0)
    .filter(({ amount }) => amount > 0)
  if (items.length === 0) {
    return emptyLabel ? <span className="resource-inline-empty">{emptyLabel}</span> : null
  }
  return (
    <span className={`resource-inline${className ? ` ${className}` : ''}`}>
      {items.map(({ key, amount }) => (
        <span
          key={`resource-${key}`}
          className={`resource-inline-item resource-${key}`}
          data-resource={key}
          data-amount={amount}
        >
          <span className="resource-inline-label">
            {t(locale, `resources.${key}`)}
          </span>
          <span className="resource-inline-amount">{amount}</span>
        </span>
      ))}
    </span>
  )
}
