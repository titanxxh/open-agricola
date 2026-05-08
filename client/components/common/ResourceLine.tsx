import type { Locale } from '../../../shared/i18n'
import type { Resource } from '../../../shared/contract/types'
import { resourceKeyList } from '../../../shared/session/state-constants'

type Props = {
  locale: Locale
  resources: Partial<Resource>
  bonusVp?: number
  hideZero?: boolean
  emptyLabel?: string
  className?: string
}

export const ResourceLine = ({
  locale: _locale,
  resources,
  bonusVp = 0,
  hideZero = true,
  emptyLabel,
  className,
}: Props) => {
  const items: Array<{ key: string; amount: number }> = resourceKeyList
    .map((key) => ({ key, amount: resources[key] ?? 0 }))
    .filter(({ amount }) => !hideZero || amount > 0)
    .filter(({ amount }) => amount > 0)
  if (bonusVp > 0) {
    items.push({ key: 'bonusVp', amount: bonusVp })
  }
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
          <span className={`res-icon res-icon-${key}`} />
          <span className="resource-inline-amount">{amount}</span>
        </span>
      ))}
    </span>
  )
}
