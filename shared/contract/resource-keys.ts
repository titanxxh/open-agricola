import type { CardProvidedPaymentResourceKey, PaymentResourceKey, Resource } from '../contract/types'

// Real resources actually held in player.resources / space.resources.
// `begging` is included as a real key because it tracks begging-card count.
export const REAL_RESOURCE_KEYS = [
  'wood', 'clay', 'reed', 'stone',
  'food', 'grain', 'vegetable',
  'sheep', 'boar', 'cattle',
  'begging',
] as const satisfies ReadonlyArray<keyof Resource>

export const PAYMENT_RESOURCE_KEYS = [
  ...REAL_RESOURCE_KEYS,
  'fence',
  'stable',
] as const satisfies ReadonlyArray<PaymentResourceKey>

const PAYMENT_RESOURCE_KEY_SET: ReadonlySet<string> = new Set(PAYMENT_RESOURCE_KEYS)

export const isCardProvidedPaymentResourceKey = (
  key: string,
): key is CardProvidedPaymentResourceKey => {
  const [cardId, localId, ...rest] = key.split(':')
  return rest.length === 0 && !!cardId && !!localId
}

export const isPaymentResourceKey = (key: string): key is PaymentResourceKey =>
  PAYMENT_RESOURCE_KEY_SET.has(key) || isCardProvidedPaymentResourceKey(key)

// Pseudo keys are NEVER stored in player.resources. They live exclusively in
// CardResourceStats.gained to record BGA-style "Plows: N / Built: N rooms"
// progress lines via the same Partial<Resource> storage slot.
export const PSEUDO_RESOURCE_KEYS = [
  'occupation', 'field',
  'roomWood', 'roomClay', 'roomStone',
  'stable',
] as const

export type PseudoResourceKey = (typeof PSEUDO_RESOURCE_KEYS)[number]

const PSEUDO_SET: ReadonlySet<string> = new Set(PSEUDO_RESOURCE_KEYS)

export const isPseudoResourceKey = (key: string): key is PseudoResourceKey =>
  PSEUDO_SET.has(key)
