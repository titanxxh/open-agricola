/**
 * Candidate Closure core (ADR 0004).
 *
 * Order-agnostic replacement for cost modifier ordering: instead of applying
 * cost transforms in a curated sequence, compute the fixpoint of the
 * transform set over the base candidates. The result equals the union of
 * every application order's output, so it cannot depend on registration
 * order. Mandatory Saturation then keeps only candidates with no applicable
 * mandatory transform left, so mandatory chains converge to the same
 * terminal set regardless of order.
 *
 * Internal to shared/actions/payment/. Pure: no GameState dependency.
 */

export type CandidateTransform<C> = {
  /** Card id owning this transform — used for use-tracking and tie-break. */
  source: string
  /** BGA "costs less" (true) vs "can pay instead" (false/omitted). */
  mandatory?: boolean
  /** Applications allowed per derivation chain. Default 1. */
  maxUses?: number
  /**
   * Returns the derived candidate(s), or null when not applicable.
   * Returning an array fans one candidate out into several derived rows.
   */
  apply: (candidate: C) => C | readonly C[] | null
}

export type CandidateClosureOptions<C> = {
  /** Dedupe key for candidates (resources + identity metadata). */
  key: (candidate: C) => string
  /** Defensive cap: emit a warning (no truncation) past this node count. */
  warnLimit?: number
  onWarn?: (nodeCount: number) => void
}

const DEFAULT_WARN_LIMIT = 512

type ClosureNode<C> = {
  candidate: C
  usesBySource: Record<string, number>
}

export const closeCandidates = <C>(
  base: readonly C[],
  transforms: readonly CandidateTransform<C>[],
  options: CandidateClosureOptions<C>,
): C[] => {
  // Fixed source-id ordering: a reproducibility tie-break only — the
  // resulting set is permutation-invariant by construction.
  const ordered = [...transforms].sort((left, right) =>
    left.source < right.source ? -1 : left.source > right.source ? 1 : 0,
  )

  const nodeKey = (node: ClosureNode<C>) =>
    JSON.stringify({
      candidate: options.key(node.candidate),
      uses: Object.entries(node.usesBySource).sort(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0,
      ),
    })

  const warnLimit = options.warnLimit ?? DEFAULT_WARN_LIMIT
  let warned = false
  const visited = new Set<string>()
  const frontier: ClosureNode<C>[] = []
  const pushNode = (node: ClosureNode<C>) => {
    const k = nodeKey(node)
    if (visited.has(k)) return
    visited.add(k)
    if (!warned && visited.size > warnLimit) {
      warned = true
      ;(options.onWarn ??
        ((count: number) =>
          console.warn(`[candidate-closure] node count ${count} exceeded warn limit ${warnLimit}`)))(
        visited.size,
      )
    }
    frontier.push(node)
  }
  for (const candidate of base) {
    pushNode({ candidate, usesBySource: {} })
  }

  const out = new Map<string, C>()
  while (frontier.length > 0) {
    const node = frontier.pop()!
    for (const transform of ordered) {
      const used = node.usesBySource[transform.source] ?? 0
      if (used >= (transform.maxUses ?? 1)) continue
      const derived = transform.apply(node.candidate)
      if (derived === null) continue
      const derivedList = Array.isArray(derived) ? derived : [derived as C]
      for (const candidate of derivedList) {
        pushNode({
          candidate,
          usesBySource: { ...node.usesBySource, [transform.source]: used + 1 },
        })
      }
    }
    // Mandatory Saturation: only emit candidates with no applicable
    // mandatory transform left; unsaturated nodes stay derivation-only.
    const saturated = ordered.every((transform) => {
      if (!transform.mandatory) return true
      const used = node.usesBySource[transform.source] ?? 0
      if (used >= (transform.maxUses ?? 1)) return true
      const derived = transform.apply(node.candidate)
      return derived === null || (Array.isArray(derived) && derived.length === 0)
    })
    if (!saturated) continue
    const candidateKey = options.key(node.candidate)
    if (!out.has(candidateKey)) out.set(candidateKey, node.candidate)
  }
  return [...out.values()]
}
