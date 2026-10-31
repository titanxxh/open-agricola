import { t, type Locale } from '../../../shared/i18n'
import type { PaymentResourceKey, PaymentResourceMap } from '../../../shared/contract/types'
import { PAYMENT_RESOURCE_KEYS, isCardProvidedPaymentResourceKey } from '../../../shared/contract/resource-keys'
import { extendedResourceKeyList } from '../../../shared/contract/state-constants'
import { paymentResourceIconClass } from './resource-icon-class'

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

const paymentResourceKeys = (resources: PaymentResourceMap): PaymentResourceKey[] => [
  ...PAYMENT_RESOURCE_KEYS,
  ...Object.keys(resources)
    .filter(isCardProvidedPaymentResourceKey)
    .filter((key) => (resources[key] ?? 0) > 0)
    .sort(),
]

const iconClassForKey = (key: PaymentResourceKey | 'bonusVp'): string => {
  if (key === 'bonusVp') return key
  if (isCardProvidedPaymentResourceKey(key)) {
    const localId = key.split(':')[1] ?? ''
    const representedResource = PAYMENT_RESOURCE_KEYS.find((paymentKey) => localId.includes(paymentKey))
    return representedResource ? paymentResourceIconClass(representedResource) : 'bonusVp'
  }
  return paymentResourceIconClass(key)
}

const labelKeyForResource = (key: PaymentResourceKey | 'bonusVp'): string => {
  if (!isCardProvidedPaymentResourceKey(key)) return `resources.${key}`
  const localId = key.split(':')[1] ?? ''
  return `resources.${PAYMENT_RESOURCE_KEYS.find(resource => localId.includes(resource)) ?? 'bonusVp'}`
}

export const ResourceLine = ({
  locale,
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
    <span className={`resource-inline${className ? ` ${className}` : ''}`} data-resource-mode={mode}>
      {items.map(({ key, amount }) => (
        <span
          key={`resource-${key}`}
          className={`resource-inline-item resource-${key}`}
          data-resource={key}
          data-amount={amount}
          role="img"
          aria-label={`${amount} ${t(locale, labelKeyForResource(key))}`}
        >
          <span className={`res-icon res-icon-${iconClassForKey(key)}`} />
          <span className="resource-inline-amount">{amount}</span>
        </span>
      ))}
    </span>
  )
}
