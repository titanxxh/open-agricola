/**
 * Candidate closure core (#289, ADR 0004).
 *
 * Pure fixpoint enumeration with mandatory saturation. Tests assert the
 * external contract only: which candidate sets come out for which transform
 * collections — never traversal order or internal node bookkeeping.
 */
import { describe, expect, it } from 'vitest'
import { closeCandidates, type CandidateTransform } from '../candidate-closure'

type Probe = { resources: Record<string, number>; sources: string[] }

const key = (candidate: Probe) =>
  JSON.stringify({
    resources: Object.entries(candidate.resources)
      .filter(([, amount]) => amount !== 0)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    sources: [...candidate.sources].sort(),
  })

const resourceSet = (candidates: readonly Probe[]): string[] =>
  [...new Set(candidates.map((candidate) =>
    JSON.stringify(
      Object.entries(candidate.resources)
        .filter(([, amount]) => amount !== 0)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    ),
  ))].sort()

const probe = (resources: Record<string, number>, sources: string[] = []): Probe =>
  ({ resources, sources })

/** Mandatory-style discount: clamps at 0, returns null when nothing saved. */
const discount = (
  source: string,
  resource: string,
  amount: number,
  options: { mandatory?: boolean; maxUses?: number } = {},
): CandidateTransform<Probe> => ({
  source,
  mandatory: options.mandatory,
  maxUses: options.maxUses,
  apply: (candidate) => {
    const before = candidate.resources[resource] ?? 0
    const after = Math.max(0, before - amount)
    if (after === before) return null
    return {
      resources: { ...candidate.resources, [resource]: after },
      sources: [...candidate.sources, source],
    }
  },
})

describe('closeCandidates', () => {
  it('returns the base candidates unchanged when there are no transforms', () => {
    const base = [probe({ clay: 3 }), probe({ wood: 2 })]
    const result = closeCandidates(base, [], { key })
    expect(resourceSet(result)).toEqual(resourceSet(base))
  })

  it('keeps both the original and the derived candidate for an optional transform', () => {
    const result = closeCandidates(
      [probe({ stone: 3 })],
      [discount('CardA', 'stone', 1)],
      { key },
    )
    expect(resourceSet(result)).toEqual(resourceSet([
      probe({ stone: 3 }),
      probe({ stone: 2 }),
    ]))
  })

  it('drops unsaturated intermediates for a mandatory transform', () => {
    const result = closeCandidates(
      [probe({ stone: 3 })],
      [discount('CardA', 'stone', 1, { mandatory: true })],
      { key },
    )
    expect(resourceSet(result)).toEqual(resourceSet([probe({ stone: 2 })]))
  })

  it('keeps candidates a mandatory transform cannot touch', () => {
    const result = closeCandidates(
      [probe({ clay: 2 })],
      [discount('CardA', 'stone', 1, { mandatory: true })],
      { key },
    )
    expect(resourceSet(result)).toEqual(resourceSet([probe({ clay: 2 })]))
  })

  // A143 Stonecutter (-1 stone) + C122 Bricklayer-shaped (-2 stone), both
  // mandatory, against a 2-stone cost. Every application order clamps to the
  // same terminal {stone:0}; the {stone:1} intermediate must never leak.
  it('converges mandatory discount chains across clamping to a single terminal set', () => {
    const result = closeCandidates(
      [probe({ stone: 2 })],
      [
        discount('A143', 'stone', 1, { mandatory: true }),
        discount('C122', 'stone', 2, { mandatory: true }),
      ],
      { key },
    )
    expect(resourceSet(result)).toEqual(resourceSet([probe({ stone: 0 })]))
  })

  // Grill-clarified scenario: optional "pay 1 wood instead of 2 clay" plus a
  // mandatory "-1 wood". The replacement branch must receive the mandatory
  // discount ({wood:1} → {}), and the undiscounted {wood:1} intermediate is
  // filtered out; the untouched base {clay:2} stays (no wood to discount).
  it('applies mandatory discounts to optional replacement branches and hides the raw branch', () => {
    const replaceClayWithWood: CandidateTransform<Probe> = {
      source: 'Replacer',
      apply: (candidate) => {
        if ((candidate.resources.clay ?? 0) < 2) return null
        return {
          resources: { ...candidate.resources, clay: 0, wood: (candidate.resources.wood ?? 0) + 1 },
          sources: [...candidate.sources, 'Replacer'],
        }
      },
    }
    const result = closeCandidates(
      [probe({ clay: 2 })],
      [replaceClayWithWood, discount('WoodDiscount', 'wood', 1, { mandatory: true })],
      { key },
    )
    expect(resourceSet(result)).toEqual(resourceSet([
      probe({ clay: 2 }),
      probe({}),
    ]))
  })

  it('honors maxUses for repeated optional applications', () => {
    const result = closeCandidates(
      [probe({ wood: 5 })],
      [discount('CardA', 'wood', 1, { maxUses: 3 })],
      { key },
    )
    expect(resourceSet(result)).toEqual(resourceSet([
      probe({ wood: 5 }),
      probe({ wood: 4 }),
      probe({ wood: 3 }),
      probe({ wood: 2 }),
    ]))
  })

  // Fixed-price cards (A27/E27/C95/E109 shape): input-independent optional
  // transforms. Every candidate derives the same fixed row; dedupe keeps one
  // and the closure terminates without any special "base candidate" kind.
  it('emits an input-independent fixed-price row exactly once', () => {
    const fixedPrice: CandidateTransform<Probe> = {
      source: 'Fixed',
      apply: () => probe({ clay: 1, stone: 1 }, ['Fixed']),
    }
    const result = closeCandidates(
      [probe({ clay: 4 }), probe({ wood: 3 })],
      [fixedPrice],
      { key },
    )
    expect(resourceSet(result)).toEqual(resourceSet([
      probe({ clay: 4 }),
      probe({ wood: 3 }),
      probe({ clay: 1, stone: 1 }),
    ]))
  })

  it('is invariant under every permutation of a mixed transform collection', () => {
    const transforms: CandidateTransform<Probe>[] = [
      {
        source: 'Fixed',
        apply: () => probe({ clay: 1, stone: 1 }, ['Fixed']),
      },
      discount('Mandatory', 'stone', 1, { mandatory: true }),
      {
        source: 'Replacer',
        apply: (candidate) => {
          if ((candidate.resources.clay ?? 0) < 2) return null
          return {
            resources: { ...candidate.resources, clay: (candidate.resources.clay ?? 0) - 2, wood: (candidate.resources.wood ?? 0) + 1 },
            sources: [...candidate.sources, 'Replacer'],
          }
        },
      },
    ]
    const permute = (items: CandidateTransform<Probe>[]): CandidateTransform<Probe>[][] =>
      items.length <= 1
        ? [items]
        : items.flatMap((item, index) =>
            permute([...items.slice(0, index), ...items.slice(index + 1)]).map(
              (tail) => [item, ...tail],
            ),
          )
    const results = permute(transforms).map((ordered) =>
      JSON.stringify(resourceSet(closeCandidates([probe({ clay: 3, stone: 2 })], ordered, { key }))),
    )
    expect(new Set(results).size).toBe(1)
  })

  // D95 SiteManager shape: one candidate fans out into several derived rows
  // (one per resource subset). A transform may return an array.
  it('supports one-to-many transforms', () => {
    const fanOut: CandidateTransform<Probe> = {
      source: 'FanOut',
      apply: (candidate) => {
        const keys = Object.keys(candidate.resources).filter(
          (resource) => (candidate.resources[resource] ?? 0) > 0,
        )
        if (keys.length === 0) return null
        return keys.map((resource) => ({
          resources: { ...candidate.resources, [resource]: (candidate.resources[resource] ?? 0) - 1, food: 1 },
          sources: [...candidate.sources, 'FanOut'],
        }))
      },
    }
    const result = closeCandidates([probe({ clay: 2, stone: 1 })], [fanOut], { key })
    expect(resourceSet(result)).toEqual(resourceSet([
      probe({ clay: 2, stone: 1 }),
      probe({ clay: 1, stone: 1, food: 1 }),
      probe({ clay: 2, food: 1 }),
    ]))
  })

  it('reports a defensive warning when the closure exceeds the candidate limit', () => {
    const warnings: number[] = []
    closeCandidates(
      [probe({ wood: 30 })],
      [
        discount('CardA', 'wood', 1, { maxUses: 30 }),
        discount('CardB', 'wood', 2, { maxUses: 15 }),
      ],
      {
        key,
        warnLimit: 16,
        onWarn: (count) => warnings.push(count),
      },
    )
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0]!).toBeGreaterThan(16)
  })
})
