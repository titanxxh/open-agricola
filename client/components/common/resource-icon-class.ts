import type { PaymentResource } from '../../../shared/contract/types'

const ICON_CLASS: Partial<Record<keyof PaymentResource, string>> = {
  fence: 'fence-icon',
  stable: 'barn',
}

export const paymentResourceIconClass = (key: keyof PaymentResource): string => ICON_CLASS[key] ?? key
