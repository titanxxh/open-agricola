import { describe, it, expect } from 'vitest'

type MockPlayer = {
  resources: Record<string, number>
  getExchangeResources: () => Record<string, number>
  getCards: () => { getIds: () => string[] }
}
type CostSpec = Record<string, unknown>
type Combination = Record<string, unknown>

const benchmarkIt = process.env.RUN_BENCHMARKS === '1' ? it : it.skip

const createMockPlayer = (resources: Record<string, number>, playerCards: string[] = []) => ({
  resources,
  getExchangeResources: () => resources,
  getCards: () => ({ getIds: () => playerCards }),
})

function baseline(player: MockPlayer, costs: CostSpec, target: number | null = null, ignoreResources = false) {
  const reserve = player.getExchangeResources()
  const maxReserve = { ...reserve }
  const bonuses = costs.bonuses ?? []
  for (const bonus of bonuses) {
    const choices = bonus.choices ?? [bonus]
    for (const choice of choices) {
      for (const [resource, amount] of Object.entries(choice)) {
        if (resource !== 'optional' && resource !== 'sources' && (amount as number) < 0) {
          maxReserve[resource] = (maxReserve[resource] ?? 0) + (-amount as number)
        }
      }
    }
  }

  const combinations: unknown[] = []
  const fees = costs.fees ?? [costs.fee ?? {}]
  for (const baseCost of fees) {
    baseCost.nb = 0
    pushBaseline(baseCost, combinations, maxReserve, false, ignoreResources)
  }

  const trades = costs.trades ?? []
  for (const trade of trades) {
    let n = 1
    const max = trade.max ?? 15
    const tradeData = { ...trade }
    delete tradeData.max
    tradeData.nb = tradeData.nb ?? 1
    const previousCombinations = [...combinations]
    let newCombinationPushed = true
    while (newCombinationPushed && n < max) {
      newCombinationPushed = false
      for (const combination of previousCombinations) {
        const newComb = { ...combination }
        addCostBaseline(newComb, tradeData, n)
        if (target !== null && newComb.nb > target) continue
        const pushed = pushBaseline(newComb, combinations, maxReserve, false, ignoreResources)
        newCombinationPushed = newCombinationPushed || pushed
      }
      n++
    }
  }

  if (target !== null) return combinations.filter(c => (c.nb ?? -1) === target)

  for (const bonus of bonuses) {
    const oldCombinations = [...combinations]
    const optional = bonus.optional ?? false
    const bonusData = { ...bonus }
    delete bonusData.optional
    combinations.length = 0
    for (const comb of oldCombinations) {
      const choices = bonusData.choices ?? [bonusData]
      for (let i = 0; i < choices.length; i++) {
        const choice = choices[i]
        const combination = { ...comb }
        if (canApply(combination, choice)) {
          addCostBaseline(combination, choice)
          const sources = choice.sources ?? []
          if (sources.length === 1 && sources[0] === 'E123_ResourceHoarder') {
            combination.bonusChoiceIndex = combination.bonusChoiceIndex ?? {}
            combination.bonusChoiceIndex[sources[0]] = i
          }
          pushBaseline(combination, combinations, maxReserve, false, ignoreResources)
        }
      }
    }
    if (optional) {
      for (const c of oldCombinations) {
        if (!combinations.some(existing => eq(existing, c))) {
          pushBaseline(c, combinations, maxReserve, false, ignoreResources)
        }
      }
    }
  }

  const oldCombinations = [...combinations]
  combinations.length = 0
  for (const combination of oldCombinations) {
    pushBaseline(combination, combinations, reserve, true, ignoreResources)
  }

  // Card payment: return card instead of resources
  if (costs.cards?.list) {
    const playerCards = player.getCards?.()?.getIds?.() ?? []
    const validCards = costs.cards.list.filter((c: string) => playerCards.includes(c))
    for (const card of validCards) {
      combinations.push({ nb: 1, card })
    }
  }

  return combinations
}

function pushBaseline(combination: Combination, combinations: Combination[], reserve: Record<string, number>, checkNonNegative = false, ignoreResources = false) {
  for (const c of combinations) {
    const d = { ...combination }
    const c1 = { ...c }
    delete d.sources; delete c1.sources
    delete d.bonusChoiceIndex; delete c1.bonusChoiceIndex
    if (JSON.stringify(d) === JSON.stringify(c1)) return false
  }
  if (!ignoreResources) {
    for (const [res, n] of Object.entries(combination)) {
      if (res === 'nb' || res === 'sources' || res === 'bonusChoiceIndex') continue
      if ((reserve[res] ?? 0) < (n as number)) return false
      if ((n as number) < 0 && checkNonNegative) return false
    }
  }
  combinations.push(combination)
  return true
}

function addCostBaseline(combination: Combination, unitCost: Combination, times = 1) {
  combination.sources = [...new Set([...(combination.sources ?? []), ...(unitCost.sources ?? [])])]
  const conditions = unitCost.conditions ?? {}
  for (const [resource, cost] of Object.entries(unitCost)) {
    if (resource === 'sources' || resource === 'conditions') continue
    for (const [condition, amt] of Object.entries(conditions)) {
      if (condition === 'minNumRooms' && (combination.nb ?? 0) < (amt as number)) continue
    }
    combination[resource] = ((combination[resource] ?? 0) as number) + ((cost as number) * times)
    if (combination[resource] === 0) delete combination[resource]
  }
}

function canApply(combination: Combination, bonus: Combination) {
  if (bonus.conditions) {
    for (const [requirement, amt] of Object.entries(bonus.conditions)) {
      if (requirement === 'minNumRooms' && (combination.nb ?? 0) < (amt as number)) return false
    }
  }
  for (const [resource, amount] of Object.entries(bonus)) {
    if (resource !== 'optional' && resource !== 'sources' && resource !== 'conditions' && (amount as number) < 0 && ((combination[resource] ?? 0) as number) + (amount as number) < 0) return false
  }
  return true
}

function eq(a: Combination, b: Combination) {
  const a1 = { ...a }; const b1 = { ...b }
  delete a1.sources; delete b1.sources
  delete a1.bonusChoiceIndex; delete b1.bonusChoiceIndex
  return JSON.stringify(a1) === JSON.stringify(b1)
}

const RESOURCE_ID: Record<string, number> = { wood: 1, food: 2, reed: 3, clay: 4, stone: 5, sheep: 6, pig: 7, cattle: 8, grain: 9, vegetable: 10 }

function fastHash(combination: Combination) {
  let h = ((combination.nb ?? 0) * 31) >>> 0
  for (const [res, n] of Object.entries(combination)) {
    if (res === 'nb' || res === 'sources' || res === 'bonusChoiceIndex') continue
    const resId = RESOURCE_ID[res] || 0
    h = ((h + resId * 17 + ((n as number) * 31)) * 31) >>> 0
  }
  return h
}

function optimized(player: MockPlayer, costs: CostSpec, target: number | null = null, ignoreResources = false) {
  const reserve = player.getExchangeResources()
  const maxReserve = { ...reserve }
  const bonuses = costs.bonuses ?? []
  for (const bonus of bonuses) {
    const choices = bonus.choices ?? [bonus]
    for (const choice of choices) {
      for (const [resource, amount] of Object.entries(choice)) {
        if (resource !== 'optional' && resource !== 'sources' && (amount as number) < 0) {
          maxReserve[resource] = (maxReserve[resource] ?? 0) + (-amount as number)
        }
      }
    }
  }

  const combinations: unknown[] = []
  const hashes = new Set<number>()

  const fees = costs.fees ?? [costs.fee ?? {}]
  for (const baseCost of fees) {
    baseCost.nb = 0
    pushOptimized(baseCost, combinations, hashes, maxReserve, false, ignoreResources)
  }

  const trades = costs.trades ?? []
  for (const trade of trades) {
    const max = trade.max ?? 15
    const tradeData = { ...trade }
    delete tradeData.max
    tradeData.nb = tradeData.nb ?? 1
    const count = combinations.length
    for (let i = 0; i < count; i++) {
      const baseCombination = combinations[i]
      for (let n = 1; n <= max; n++) {
        const newNb = (baseCombination.nb ?? 0) + (n * tradeData.nb)
        if (target !== null && newNb > target) break
        const newCombination = { ...baseCombination }
        addCostOptimized(newCombination, tradeData, n)
        newCombination.nb = newNb
        if (isDominated(newCombination, combinations)) continue
        pushOptimized(newCombination, combinations, hashes, maxReserve, false, ignoreResources)
      }
    }
  }

  if (target !== null) return combinations.filter(c => (c.nb ?? -1) === target)

  for (const bonus of bonuses) {
    const optional = bonus.optional ?? false
    const bonusData = { ...bonus }
    delete bonusData.optional
    const newCombinations: unknown[] = []
    const newHashes = new Set<number>()
    if (optional) { newCombinations.push(...combinations); hashes.forEach(h => newHashes.add(h)) }
    for (const comb of combinations) {
      const choices = bonusData.choices ?? [bonusData]
      for (let i = 0; i < choices.length; i++) {
        const choice = choices[i]
        const combination = { ...comb }
        if (canApply(combination, choice)) {
          addCostOptimized(combination, choice)
          const sources = choice.sources ?? []
          if (sources.length === 1 && sources[0] === 'E123_ResourceHoarder') {
            combination.bonusChoiceIndex = combination.bonusChoiceIndex ?? {}
            combination.bonusChoiceIndex[sources[0]] = i
          }
          pushOptimized(combination, newCombinations, newHashes, maxReserve, false, ignoreResources)
        }
      }
    }
    combinations.length = 0; combinations.push(...newCombinations)
    hashes.clear(); newHashes.forEach(h => hashes.add(h))
  }

  const result: unknown[] = []
  const resultHashes = new Set<number>()
  for (const combination of combinations) {
    let valid = true
    for (const [res, n] of Object.entries(combination)) {
      if (res === 'nb' || res === 'sources' || res === 'bonusChoiceIndex') continue
      if (((reserve[res] ?? 0) as number) < (n as number) || (n as number) < 0) { valid = false; break }
    }
    if (valid) {
      const hash = fastHash(combination)
      if (!resultHashes.has(hash)) { result.push(combination); resultHashes.add(hash) }
    }
  }

  if (costs.cards?.list) {
    const playerCards = player.getCards?.()?.getIds?.() ?? []
    const validCards = costs.cards.list.filter((c: string) => playerCards.includes(c))
    for (const card of validCards) {
      result.push({ nb: 1, card })
    }
  }

  return result
}

function pushOptimized(combination: Combination, combinations: Combination[], hashes: Set<number>, reserve: Record<string, number>, checkNonNegative = false, ignoreResources = false) {
  const hash = fastHash(combination)
  if (hashes.has(hash)) return false
  if (!ignoreResources) {
    for (const [res, n] of Object.entries(combination)) {
      if (res === 'nb' || res === 'sources' || res === 'bonusChoiceIndex') continue
      if ((reserve[res] ?? 0) < (n as number)) return false
      if ((n as number) < 0 && checkNonNegative) return false
    }
  }
  combinations.push(combination)
  hashes.add(hash)
  return true
}

function addCostOptimized(combination: Combination, unitCost: Combination, times = 1) {
  combination.sources = [...new Set([...(combination.sources ?? []), ...(unitCost.sources ?? [])])]
  const conditions = unitCost.conditions ?? {}
  for (const resource of Object.keys(unitCost)) {
    if (resource === 'sources' || resource === 'conditions') continue
    let skip = false
    for (const [condition, amt] of Object.entries(conditions)) {
      if (condition === 'minNumRooms' && (combination.nb ?? 0) < (amt as number)) { skip = true; break }
    }
    if (skip) continue
    const cost = unitCost[resource] as number
    combination[resource] = ((combination[resource] ?? 0) as number) + (cost * times)
    if (combination[resource] === 0) delete combination[resource]
  }
}

function isDominated(combination: Combination, combinations: Combination[]) {
  const nb = combination.nb ?? 0
  for (const existing of combinations) {
    const existingNb = existing.nb ?? 0
    if (existingNb < nb) continue
    let dominated = true
    for (const [res, amount] of Object.entries(combination)) {
      if (res === 'nb' || res === 'sources' || res === 'bonusChoiceIndex') continue
      const existingAmount = existing[res] ?? 0
      if ((existingAmount as number) > (amount as number)) { dominated = false; break }
    }
    if (dominated) return true
  }
  return false
}

class LRUCache<K, V> {
  private cache = new Map<K, V>()
  constructor(private maxSize: number) {}
  get(key: K): V | undefined { return this.cache.get(key) }
  set(key: K, value: V) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }
    this.cache.set(key, value)
  }
}

const cache = new LRUCache<string, unknown[]>(100)

function withCache(player: MockPlayer, costs: CostSpec, target: number | null = null, ignoreResources = false) {
  const reserve = player.getExchangeResources()
  const reserveKey = Object.entries(reserve).sort((a, b) => a[0].localeCompare(b[0])).map(x => `${x[0]}:${x[1]}`).join(',')
  const costKey = JSON.stringify(costs)
  const cacheKey = `${reserveKey}|${costKey}|${target}|${ignoreResources}`
  const cached = cache.get(cacheKey)
  if (cached) return cached
  const result = optimized(player, costs, target, ignoreResources)
  cache.set(cacheKey, result)
  return result
}

// ============================================================
// DYNAMIC PROGRAMMING: For simple fee + trades (no bonuses)
// ============================================================
function dynamicProgramming(player: MockPlayer, costs: CostSpec, target: number | null = null, ignoreResources = false) {
  const reserve = player.getExchangeResources()
  
  const fees = costs.fees ?? [costs.fee ?? {}]
  const trades = costs.trades ?? []
  const bonuses = costs.bonuses ?? []
  
  if (bonuses.length > 0 || fees.length > 1 || costs.cards) {
    return baseline(player, costs, target, ignoreResources)
  }
  
  const baseFee = fees[0] || {}
  
  const dp: Map<string, { nb: number, resources: Record<string, number>, sources: string[] }> = new Map()
  
  if (Object.keys(baseFee).length === 0) {
    dp.set('EMPTY', { nb: 0, resources: {}, sources: [] })
  } else {
    const initialKey = JSON.stringify(baseFee)
    dp.set(initialKey, { nb: 0, resources: { ...baseFee }, sources: [] })
  }
  
  for (const trade of trades) {
    const max = trade.max ?? 15
    const nbGain = trade.nb ?? 1
    const tradeCost: Record<string, number> = {}
    for (const key of Object.keys(trade)) {
      if (key !== 'max' && key !== 'nb' && key !== 'sources' && key !== 'conditions') {
        tradeCost[key] = trade[key] as number
      }
    }
    
    const newDp = new Map<string, { nb: number, resources: Record<string, number>, sources: string[] }>()
    
    for (const [key, state] of dp) {
      for (let t = 0; t <= max; t++) {
        const newResources: Record<string, number> = { ...state.resources }
        
        for (const [res, cost] of Object.entries(tradeCost)) {
          const current = newResources[res] ?? 0
          newResources[res] = current + cost * t
        }
        
        const newNb = state.nb + t * nbGain
        if (target !== null && newNb > target) break
        
        const newKey = JSON.stringify(newResources)
        
        if (!newDp.has(newKey) || newDp.get(newKey)!.nb < newNb) {
          newDp.set(newKey, { 
            nb: newNb, 
            resources: newResources, 
            sources: t > 0 ? [...state.sources, ...(trade.sources ?? [])] : state.sources
          })
        }
      }
    }
    
    dp.clear()
    for (const [k, v] of newDp) dp.set(k, v)
  }
  
  const result: unknown[] = []
  for (const state of dp.values()) {
    let hasNegative = false
    let exceedsReserve = false
    for (const [res, amount] of Object.entries(state.resources)) {
      if (amount < 0) {
        hasNegative = true
        break
      }
      if (!ignoreResources && amount > 0 && (reserve[res] ?? 0) < amount) {
        exceedsReserve = true
        break
      }
    }
    if (hasNegative || exceedsReserve) continue
    if (target !== null && state.nb !== target) continue
    
    const combo: Record<string, unknown> = { nb: state.nb }
    for (const [k, v] of Object.entries(state.resources)) {
      if (v !== 0) combo[k] = v
    }
    if (state.sources.length > 0) combo.sources = state.sources
    result.push(combo)
  }
  
  return result
}

function normalize(c: Record<string, unknown>) { 
  const n: Record<string, unknown> = { nb: c.nb }
  for (const [k, v] of Object.entries(c)) {
    if (k !== 'sources' && k !== 'bonusChoiceIndex') n[k] = v
  }
  return n 
}

function equal(a: unknown[], b: unknown[]) {
  if (a.length !== b.length) return false
  const aN = a.map(normalize).sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)))
  const bN = b.map(normalize).sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)))
  return JSON.stringify(aN) === JSON.stringify(bN)
}

describe('Pay Combination DP', () => {
  const tests = [
    { name: 'Simple fee', costs: { fee: { wood: 3, reed: 1 } }, resources: { wood: 10, reed: 5 } },
    { name: 'Multiple fees', costs: { fees: [{ wood: 2 }, { reed: 3 }] }, resources: { wood: 10, reed: 5 } },
    { name: 'With trades', costs: { fee: { wood: 1 }, trades: [{ max: 3, nb: 1, wood: -1, food: 2 }] }, resources: { wood: 5, food: 0 } },
    { name: 'With bonuses', costs: { fee: { wood: 5 }, bonuses: [{ optional: true, wood: -1 }] }, resources: { wood: 10 } },
    { name: 'Complex', costs: { fees: [{ wood: 3 }, { reed: 4 }], trades: [{ max: 5, nb: 1, wood: -1, food: 2 }, { max: 3, nb: 2, reed: -1, clay: 1 }], bonuses: [{ optional: true, wood: -1 }, { optional: false, food: -1 }] }, resources: { wood: 10, reed: 5, food: 3, clay: 2 } },
    { name: 'With target', costs: { fee: { wood: 1 }, trades: [{ max: 5, nb: 1, wood: -1, food: 2 }] }, resources: { wood: 10, food: 0 }, target: 3 },
    { name: 'DP trade test', costs: { fee: { wood: 2 }, trades: [{ max: 3, nb: 1, wood: -1, food: 1 }, { max: 2, nb: 2, food: -1, reed: 1 }] }, resources: { wood: 10, food: 10, reed: 0 } },
    { name: 'Card payment', costs: { fee: { wood: 5 }, cards: { type: 'Major', list: ['Major_Pottery'] } }, resources: { wood: 5 }, playerCards: ['Major_Pottery'] },
    { name: 'Full cost', costs: { fee: { wood: 3 }, trades: [{ max: 3, nb: 1, wood: -1, food: 2 }], bonuses: [{ optional: true, wood: -1 }], cards: { type: 'Major', list: ['Major_Pottery'] } }, resources: { wood: 10, food: 0 }, playerCards: ['Major_Pottery'] },
  ]

  const iter = 1000

  for (const tc of tests) {
    it(`same results: ${tc.name}`, () => {
      const player = createMockPlayer(tc.resources, tc.playerCards ?? [])
      const base = baseline(player, tc.costs, tc.target ?? null)
      const dp = dynamicProgramming(player, tc.costs, tc.target ?? null)
      expect(equal(base, dp)).toBe(true)
    })

    benchmarkIt(`benchmark: ${tc.name}`, () => {
      const player = createMockPlayer(tc.resources, tc.playerCards ?? [])
      
      baseline(player, tc.costs, tc.target ?? null)
      optimized(player, tc.costs, tc.target ?? null)
      dynamicProgramming(player, tc.costs, tc.target ?? null)
      withCache(player, tc.costs, tc.target ?? null)
      
      const t0 = performance.now()
      for (let i = 0; i < iter; i++) baseline(player, tc.costs, tc.target ?? null)
      const baselineTime = performance.now() - t0
      
      const t1 = performance.now()
      for (let i = 0; i < iter; i++) optimized(player, tc.costs, tc.target ?? null)
      const optimizedTime = performance.now() - t1
      
      const t2 = performance.now()
      for (let i = 0; i < iter; i++) dynamicProgramming(player, tc.costs, tc.target ?? null)
      const dpTime = performance.now() - t2
      
      const t3 = performance.now()
      for (let i = 0; i < iter; i++) withCache(player, tc.costs, tc.target ?? null)
      const cacheTime = performance.now() - t3
      
      console.log(`\n${tc.name}:`)
      console.log(`  Baseline:   ${baselineTime.toFixed(2)}ms`)
      console.log(`  Optimized:  ${optimizedTime.toFixed(2)}ms (${(baselineTime/optimizedTime).toFixed(2)}x)`)
      console.log(`  DP:         ${dpTime.toFixed(2)}ms (${(baselineTime/dpTime).toFixed(2)}x)`)
      console.log(`  Cache:      ${cacheTime.toFixed(2)}ms (${(baselineTime/cacheTime).toFixed(2)}x)`)
    })
  }
})
