import type { PaymentResourceMap } from '../contract/types'

type ResourceCostComparison = 'lower' | 'equal' | 'higher' | 'incomparable'

export const compareResourceCosts = (
  left: Readonly<PaymentResourceMap>,
  right: Readonly<PaymentResourceMap>,
): ResourceCostComparison => {
  const leftAmounts: Readonly<Record<string, number | undefined>> = left
  const rightAmounts: Readonly<Record<string, number | undefined>> = right
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  let lower = false
  let higher = false
  for (const key of keys) {
    const leftAmount = leftAmounts[key] ?? 0
    const rightAmount = rightAmounts[key] ?? 0
    if (leftAmount < rightAmount) lower = true
    if (leftAmount > rightAmount) higher = true
    if (lower && higher) return 'incomparable'
  }
  return lower ? 'lower' : higher ? 'higher' : 'equal'
}
