import type {
  ComplexCost,
  PaymentResourceKey,
  PaymentResourceMap,
  Resource,
} from '../../../contract/types'
import type {
  CostCandidate,
  CostCandidateDerivationContext,
  CostCandidateDeriver,
  DerivedCostCandidate,
} from '../../cost-candidate-deriver'
import { applyCostOverride, isComplexCost } from './affordability'

const uniqueInOrder = (values: readonly string[]): string[] => {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

export const normalizeCost = (
  cost: PaymentResourceMap,
): PaymentResourceMap => {
  const result: PaymentResourceMap = {}
  for (const [key, value] of Object.entries(cost).sort(([left], [right]) => left.localeCompare(right))) {
    if (typeof value !== 'number' || value === 0) continue
    result[key as PaymentResourceKey] = value
  }
  return result
}

const candidateDeriverError = (
  message: string,
  deriver?: Pick<CostCandidateDeriver, 'id' | 'sourceCardId'>,
) => new Error([
  'candidateDeriver',
  deriver?.id ? `id=${deriver.id}` : undefined,
  deriver?.sourceCardId ? `sourceCardId=${deriver.sourceCardId}` : undefined,
  message,
].filter(Boolean).join(' '))

const assertNonNegativeCost = (
  cost: PaymentResourceMap,
  deriver: CostCandidateDeriver,
): PaymentResourceMap => {
  for (const [key, value] of Object.entries(cost)) {
    if (typeof value === 'number' && value < 0) {
      throw candidateDeriverError(`negative cost ${key}=${value}`, deriver)
    }
  }
  return cost
}

const normalizeCandidate = (candidate: CostCandidate): CostCandidate => ({
  cost: normalizeCost(candidate.cost),
  feeIndex: candidate.feeIndex,
  metadata: {
    sourceCards: uniqueInOrder(candidate.metadata.sourceCards),
  },
  applied: new Set(candidate.applied),
})

const costSignature = (cost: PaymentResourceMap): string =>
  JSON.stringify(Object.entries(normalizeCost(cost)))

const visitedSignature = (candidate: CostCandidate): string =>
  JSON.stringify({
    cost: Object.entries(normalizeCost(candidate.cost)),
    feeIndex: candidate.feeIndex ?? null,
    applied: [...candidate.applied].sort(),
  })

const mergeSourcesInto = (
  target: CostCandidate,
  source: CostCandidate,
) => {
  target.metadata.sourceCards = uniqueInOrder([
    ...target.metadata.sourceCards,
    ...source.metadata.sourceCards,
  ])
}

export const expandCostCandidates = (
  cost: PaymentResourceMap | ComplexCost,
): CostCandidate[] => {
  const toCandidate = (
    fee: PaymentResourceMap,
    feeIndex?: number,
  ): CostCandidate => ({
    cost: normalizeCost(fee),
    feeIndex,
    metadata: { sourceCards: [] },
    applied: new Set(),
  })

  if (!isComplexCost(cost)) {
    return [toCandidate(cost)]
  }
  if (cost.fees && cost.fees.length > 0) {
    return cost.fees.map((fee, feeIndex) => toCandidate(fee, feeIndex))
  }
  return [toCandidate(cost.fee ?? {})]
}

export const applyCostDeltasToCandidates = (
  candidates: CostCandidate[],
  deltas: Partial<Resource>[],
): CostCandidate[] =>
  candidates.map((candidate) => {
    const cost = deltas.reduce(
      (current, delta) => normalizeCost(applyCostOverride(current, delta)),
      candidate.cost,
    )
    return {
      ...candidate,
      cost,
      metadata: {
        sourceCards: [...candidate.metadata.sourceCards],
      },
      applied: new Set(candidate.applied),
    }
  })

export const mergeDuplicateCostCandidates = (
  candidates: CostCandidate[],
): CostCandidate[] => {
  const merged = new Map<string, CostCandidate>()
  const result: CostCandidate[] = []
  for (const candidate of candidates) {
    const normalized = normalizeCandidate(candidate)
    const key = costSignature(normalized.cost)
    const existing = merged.get(key)
    if (existing) {
      mergeSourcesInto(existing, normalized)
      continue
    }
    merged.set(key, normalized)
    result.push(normalized)
  }
  return result
}

const validateDerivers = (derivers: CostCandidateDeriver[]) => {
  const seen = new Map<string, CostCandidateDeriver>()
  for (const deriver of derivers) {
    if (!deriver.id.trim()) {
      throw candidateDeriverError('empty id', deriver)
    }
    if (!deriver.sourceCardId.trim()) {
      throw candidateDeriverError('empty sourceCardId', deriver)
    }
    const existing = seen.get(deriver.id)
    if (existing) {
      throw candidateDeriverError(
        `duplicate id duplicateSourceCardId=${existing.sourceCardId}`,
        deriver,
      )
    }
    seen.set(deriver.id, deriver)
  }
}

const validateContext = (context: CostCandidateDerivationContext) => {
  if (context.targetCardTypes.length === 0) {
    throw candidateDeriverError(`targetCardId=${context.targetCardId} empty targetCardTypes`)
  }
}

const finalizeDerivedCandidate = (
  base: CostCandidate,
  next: DerivedCostCandidate,
  deriver: CostCandidateDeriver,
): CostCandidate => ({
  cost: assertNonNegativeCost(normalizeCost(next.cost), deriver),
  feeIndex: base.feeIndex,
  metadata: {
    sourceCards: uniqueInOrder([
      ...base.metadata.sourceCards,
      deriver.sourceCardId,
    ]),
  },
  applied: new Set([...base.applied, deriver.id]),
})

export const deriveCostCandidates = (
  baseCandidates: CostCandidate[],
  derivers: CostCandidateDeriver[],
  context: CostCandidateDerivationContext,
): CostCandidate[] => {
  validateContext(context)
  validateDerivers(derivers)

  const results: CostCandidate[] = []
  const seen = new Map<string, CostCandidate>()

  const visit = (candidate: CostCandidate) => {
    const normalized = normalizeCandidate(candidate)
    const key = visitedSignature(normalized)
    const existing = seen.get(key)
    if (existing) {
      mergeSourcesInto(existing, normalized)
      return
    }
    seen.set(key, normalized)
    results.push(normalized)

    for (const deriver of derivers) {
      if (normalized.applied.has(deriver.id)) continue
      for (const next of deriver.derive(normalized, context)) {
        visit(finalizeDerivedCandidate(normalized, next, deriver))
      }
    }
  }

  for (const candidate of baseCandidates) {
    visit(candidate)
  }

  return mergeDuplicateCostCandidates(results)
}
