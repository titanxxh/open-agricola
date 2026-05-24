import type { Locale } from '../../../shared/i18n'
import type { PaymentResourceKey, PaymentResourceMap } from '../../../shared/contract/types'
import { PAYMENT_RESOURCE_KEYS } from '../../../shared/contract/resource-keys'
import { resourceKeyList } from '../../../shared/contract/state-constants'

type ResourceLineMode = 'inventory' | 'payment'

type Props = {
  locale: Locale
  resources: PaymentResourceMap
  mode?: ResourceLineMode
  bonusVp?: number
  hideZero?: boolean
  emptyLabel?: string
  className?: string
}

const RESOURCE_ICON_CLASS: Partial<Record<PaymentResourceKey | 'bonusVp', string>> = {
  fence: 'fence-icon',
  stable: 'barn',
}

export const ResourceLine = ({
  locale: _locale,
  resources,
  mode = 'inventory',
  bonusVp = 0,
  hideZero = true,
  emptyLabel,
  className,
}: Props) => {
  const keys = mode === 'payment' ? PAYMENT_RESOURCE_KEYS : resourceKeyList
  const items: Array<{ key: PaymentResourceKey | 'bonusVp'; amount: number }> = keys
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
          <span className={`res-icon res-icon-${RESOURCE_ICON_CLASS[key] ?? key}`} />
          <span className="resource-inline-amount">{amount}</span>
        </span>
      ))}
    </span>
  )
}
