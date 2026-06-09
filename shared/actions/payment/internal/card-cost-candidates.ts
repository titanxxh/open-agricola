import type {
  CardCostCandidate,
  CardCostCandidateMetadata,
  ComplexCost,
  CostAttribution,
  CostAttributionBySource,
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

const hasPositiveResources = (resources: PaymentResourceMap | undefined): boolean =>
  Object.values(resources ?? {}).some((amount) => typeof amount === 'number' && amount > 0)

const cloneCostAttribution = (
  attribution: CostAttributionBySource | undefined,
): CostAttributionBySource | undefined => {
  if (!attribution) return undefined
  const cloned: CostAttributionBySource = {}
  for (const [source, value] of Object.entries(attribution)) {
    const entry: CostAttribution = {}
    if (hasPositiveResources(value.saved)) entry.saved = cloneResources(value.saved!)
    if (hasPositiveResources(value.paid)) entry.paid = cloneResources(value.paid!)
    if (entry.saved || entry.paid) cloned[source] = entry
  }
  return Object.keys(cloned).length > 0 ? cloned : undefined
}

const cloneCandidate = (candidate: CardCostCandidate): CardCostCandidate => ({
  resources: cloneResources(candidate.resources),
  originalFeeIndex: candidate.originalFeeIndex,
  sources: [...candidate.sources],
  ...(candidate.costAttribution
    ? { costAttribution: cloneCostAttribution(candidate.costAttribution) }
    : {}),
})

const candidateKey = (candidate: CardCostCandidate) =>
  JSON.stringify({
    resources: PAYMENT_RESOURCE_KEYS
      .filter((key) => candidate.resources[key] !== undefined)
      .map((key) => [key, candidate.resources[key] ?? 0]),
    originalFeeIndex: candidate.originalFeeIndex,
    sources: candidate.sources,
  })

export const cardCostCandidatesEqual = (
  left: readonly CardCostCandidate[],
  right: readonly CardCostCandidate[],
): boolean => {
  if (left.length !== right.length) return false
  return left.every((candidate, index) => candidateKey(candidate) === candidateKey(right[index]!))
}

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

const mergeResources = (
  left: PaymentResourceMap | undefined,
  right: PaymentResourceMap | undefined,
): PaymentResourceMap | undefined => {
  const merged: PaymentResourceMap = left ? cloneResources(left) : {}
  for (const [rawKey, rawAmount] of Object.entries(right ?? {})) {
    const amount = rawAmount ?? 0
    if (amount <= 0) continue
    const key = rawKey as PaymentResourceKey
    merged[key] = (merged[key] ?? 0) + amount
  }
  return hasPositiveResources(merged) ? merged : undefined
}

const mergeCostAttribution = (
  existing: CostAttributionBySource | undefined,
  source: string,
  delta: CostAttribution,
): CostAttributionBySource | undefined => {
  const cloned = cloneCostAttribution(existing) ?? {}
  const current = cloned[source] ?? {}
  const next: CostAttribution = {
    saved: mergeResources(current.saved, delta.saved),
    paid: mergeResources(current.paid, delta.paid),
  }
  if (next.saved || next.paid) cloned[source] = next
  return Object.keys(cloned).length > 0 ? cloned : undefined
}

export const addCardCostCandidateAttribution = (
  candidate: CardCostCandidate,
  source: string,
  delta: CostAttribution,
): CardCostCandidate => {
  const costAttribution = mergeCostAttribution(candidate.costAttribution, source, delta)
  return {
    resources: cloneResources(candidate.resources),
    originalFeeIndex: candidate.originalFeeIndex,
    sources: appendSource(candidate.sources, source),
    ...(costAttribution ? { costAttribution } : {}),
  }
}

const discountCardCostCandidate = (
  candidate: CardCostCandidate,
  source: string,
  discount: Partial<Resource>,
): CardCostCandidate | null => {
  const resources = cloneResources(candidate.resources)
  const saved: PaymentResourceMap = {}
  for (const [rawKey, rawAmount] of Object.entries(discount)) {
    const amount = rawAmount ?? 0
    if (amount <= 0) continue
    const key = rawKey as PaymentResourceKey
    if (candidate.resources[key] === undefined) continue
    const before = resources[key] ?? 0
    const after = Math.max(0, before - amount)
    const actualSaved = before - after
    if (actualSaved <= 0) continue
    if (after === 0) {
      delete resources[key]
    } else {
      resources[key] = after
    }
    saved[key] = actualSaved
  }
  if (!hasPositiveResources(saved)) return null
  return addCardCostCandidateAttribution(
    { ...candidate, resources },
    source,
    { saved },
  )
}

const deriveDiscountedCardCostCandidates = (
  candidates: readonly CardCostCandidate[],
  source: string,
  discount: Partial<Resource>,
): CardCostCandidate[] =>
  candidates
    .map((candidate) => discountCardCostCandidate(candidate, source, discount))
    .filter((candidate): candidate is CardCostCandidate => Boolean(candidate))

export const appendDiscountedCardCostCandidates = (
  candidates: readonly CardCostCandidate[],
  source: string,
  discount: Partial<Resource>,
): CardCostCandidate[] => {
  const derived = deriveDiscountedCardCostCandidates(candidates, source, discount)
  return dedupeCardCostCandidates([...candidates, ...derived])
}

export const replaceWithDiscountedCardCostCandidates = (
  candidates: readonly CardCostCandidate[],
  source: string,
  discount: Partial<Resource>,
): CardCostCandidate[] => {
  const replaced = candidates.map((candidate) =>
    discountCardCostCandidate(candidate, source, discount) ?? candidate,
  )
  return dedupeCardCostCandidates(replaced)
}

export const buildCandidateMetadataByFeeIndex = (
  candidates: readonly CardCostCandidate[],
): Record<number, CardCostCandidateMetadata> => {
  const metadata: Record<number, CardCostCandidateMetadata> = {}
  candidates.forEach((candidate, index) => {
    metadata[index] = {
      originalFeeIndex: candidate.originalFeeIndex,
      sources: [...candidate.sources],
      ...(candidate.costAttribution
        ? { costAttribution: cloneCostAttribution(candidate.costAttribution) }
        : {}),
    }
  })
  return metadata
}
