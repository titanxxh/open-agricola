import type {
  CardCostCandidate,
  CardCostCandidateMetadata,
  ComplexCost,
  PaymentResourceKey,
  PaymentResourceMap,
  Resource,
} from '../../../contract/types'
import { isComplexCost } from './affordability'

const PAYMENT_RESOURCE_KEYS: PaymentResourceKey[] = [
  'wood',
  'clay',
  'reed',
  'stone',
  'food',
  'grain',
  'vegetable',
  'sheep',
  'boar',
  'cattle',
  'begging',
  'fence',
  'stable',
]

const cloneResources = (resources: PaymentResourceMap): PaymentResourceMap => ({ ...resources })

const cloneCandidate = (candidate: CardCostCandidate): CardCostCandidate => ({
  resources: cloneResources(candidate.resources),
  originalFeeIndex: candidate.originalFeeIndex,
  sources: [...candidate.sources],
})

const candidateKey = (candidate: CardCostCandidate) =>
  JSON.stringify({
    resources: PAYMENT_RESOURCE_KEYS
      .filter((key) => candidate.resources[key] !== undefined)
      .map((key) => [key, candidate.resources[key] ?? 0]),
    originalFeeIndex: candidate.originalFeeIndex,
    sources: candidate.sources,
  })

export const normalizeCardCostCandidates = (
  baseCost: PaymentResourceMap | ComplexCost,
): CardCostCandidate[] => {
  const fees = isComplexCost(baseCost)
    ? baseCost.fees && baseCost.fees.length > 0
      ? baseCost.fees
      : baseCost.fee
        ? [baseCost.fee]
        : [{}]
    : [baseCost]
  return fees.map((resources, index) => ({
    resources: cloneResources(resources),
    originalFeeIndex: index,
    sources: [],
  }))
}

export const dedupeCardCostCandidates = (
  candidates: readonly CardCostCandidate[],
): CardCostCandidate[] => {
  const seen = new Set<string>()
  const out: CardCostCandidate[] = []
  for (const candidate of candidates) {
    const normalized = cloneCandidate(candidate)
    const key = candidateKey(normalized)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(normalized)
  }
  return out
}

const appendSource = (sources: readonly string[], source: string) =>
  sources.includes(source) ? [...sources] : [...sources, source]

export const appendDiscountedCardCostCandidates = (
  candidates: readonly CardCostCandidate[],
  source: string,
  discount: Partial<Resource>,
): CardCostCandidate[] => {
  const derived: CardCostCandidate[] = []
  for (const candidate of candidates) {
    let changed = false
    const resources = cloneResources(candidate.resources)
    for (const [rawKey, rawAmount] of Object.entries(discount)) {
      const amount = rawAmount ?? 0
      if (amount <= 0) continue
      const key = rawKey as PaymentResourceKey
      if (candidate.resources[key] === undefined) continue
      resources[key] = Math.max(0, (resources[key] ?? 0) - amount)
      changed = true
    }
    if (!changed) continue
    derived.push({
      resources,
      originalFeeIndex: candidate.originalFeeIndex,
      sources: appendSource(candidate.sources, source),
    })
  }
  return dedupeCardCostCandidates([...candidates, ...derived])
}

export const buildCandidateMetadataByFeeIndex = (
  candidates: readonly CardCostCandidate[],
): Record<number, CardCostCandidateMetadata> => {
  const metadata: Record<number, CardCostCandidateMetadata> = {}
  candidates.forEach((candidate, index) => {
    metadata[index] = {
      originalFeeIndex: candidate.originalFeeIndex,
      sources: [...candidate.sources],
    }
  })
  return metadata
}
