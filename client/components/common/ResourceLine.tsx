import type { Locale } from '../../../shared/i18n'
import type { PaymentResourceKey, PaymentResourceMap } from '../../../shared/contract/types'
import { PAYMENT_RESOURCE_KEYS, isCardProvidedPaymentResourceKey } from '../../../shared/contract/resource-keys'
import { extendedResourceKeyList } from '../../../shared/contract/state-constants'

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

const paymentResourceKeys = (resources: PaymentResourceMap): PaymentResourceKey[] => [
  ...PAYMENT_RESOURCE_KEYS,
  ...Object.keys(resources)
    .filter(isCardProvidedPaymentResourceKey)
    .filter((key) => (resources[key] ?? 0) > 0)
    .sort(),
]

const iconClassForKey = (key: PaymentResourceKey | 'bonusVp'): string => {
  const direct = RESOURCE_ICON_CLASS[key]
  if (direct) return direct
  if (key !== 'bonusVp' && isCardProvidedPaymentResourceKey(key)) {
    const localId = key.split(':')[1] ?? ''
    const representedResource = PAYMENT_RESOURCE_KEYS.find((paymentKey) => localId.includes(paymentKey))
    return representedResource ? RESOURCE_ICON_CLASS[representedResource] ?? representedResource : 'bonusVp'
  }
  return key
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
  const keys = mode === 'payment' ? paymentResourceKeys(resources) : extendedResourceKeyList
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
          <span className={`res-icon res-icon-${iconClassForKey(key)}`} />
          <span className="resource-inline-amount">{amount}</span>
        </span>
      ))}
    </span>
  )
}
