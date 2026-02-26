import { describe, it } from 'vitest'

function dynamicProgrammingWithTrace(player: any, costs: any, target: number | null = null, ignoreResources = false) {
  const reserve = player.getExchangeResources()
  
  const fees = costs.fees ?? [costs.fee ?? {}]
  const trades = costs.trades ?? []
  const bonuses = costs.bonuses ?? []
  
  if (bonuses.length > 0 || fees.length > 1) {
    return null
  }
  
  const baseFee = fees[0] || {}
  
  type DPState = {
    nb: number
    resources: Record<string, number>
    sources: string[]
    tradeUsage: { tradeIndex: number, times: number }[]
  }
  
  const dp: Map<string, DPState> = new Map()
  
  if (Object.keys(baseFee).length === 0) {
    dp.set('EMPTY', { nb: 0, resources: {}, sources: [], tradeUsage: [] })
  } else {
    const initialKey = JSON.stringify(baseFee)
    dp.set(initialKey, { nb: 0, resources: { ...baseFee }, sources: [], tradeUsage: [] })
  }
  
  for (let tradeIdx = 0; tradeIdx < trades.length; tradeIdx++) {
    const trade = trades[tradeIdx]
    const max = trade.max ?? 15
    const nbGain = trade.nb ?? 1
    
    const tradeCost: Record<string, number> = {}
    for (const key of Object.keys(trade)) {
      if (key !== 'max' && key !== 'nb' && key !== 'sources' && key !== 'conditions' && key !== '_name') {
        tradeCost[key] = trade[key] as number
      }
    }
    
    const newDp = new Map<string, DPState>()
    
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
        
        const newTradeUsage = [...state.tradeUsage]
        if (t > 0) {
          newTradeUsage.push({ tradeIndex: tradeIdx, times: t })
        }
        
        const existing = newDp.get(newKey)
        if (!existing || existing.nb < newNb) {
          newDp.set(newKey, {
            nb: newNb,
            resources: newResources,
            sources: t > 0 ? [...state.sources, ...(trade.sources ?? [])] : state.sources,
            tradeUsage: newTradeUsage
          })
        }
      }
    }
    
    dp.clear()
    for (const [k, v] of newDp) dp.set(k, v)
  }
  
  const result: any[] = []
  for (const state of dp.values()) {
    let valid = true
    for (const [res, amount] of Object.entries(state.resources)) {
      if (amount < 0) { valid = false; break }
      if (!ignoreResources && amount > 0 && (reserve[res] ?? 0) < amount) { valid = false; break }
    }
    if (!valid) continue
    if (target !== null && state.nb !== target) continue
    
    const tradeUsageMap: Record<string, number> = {}
    for (const usage of state.tradeUsage) {
      const tradeName = trades[usage.tradeIndex]._name ?? `trade_${usage.tradeIndex}`
      tradeUsageMap[tradeName] = usage.times
    }
    
    const combo: any = {
      nb: state.nb,
      ...state.resources,
      _tradeUsage: tradeUsageMap
    }
    if (state.sources.length > 0) combo.sources = state.sources
    
    result.push(combo)
  }
  
  return result
}

describe('DP with Trade Usage', () => {
  it('show combinations with trade usage', () => {
    const player = {
      getExchangeResources: () => ({ wood: 10, food: 10, reed: 0 })
    }

    const costs = {
      fee: { wood: 2 },
      trades: [
        { _name: 'wood_to_food', max: 3, nb: 1, wood: -1, food: 2 },
        { _name: 'food_to_reed', max: 2, nb: 2, food: -1, reed: 1 }
      ]
    }

    console.log('=== DP with Trade Usage Tracking ===\n')
    console.log('输入:')
    console.log('  fee: { wood: 2 }')
    console.log('  trades:')
    console.log('    1) wood_to_food: 最多3次, 每次用1 wood换2 food')
    console.log('    2) food_to_reed: 最多2次, 每次用2 food换1 reed (得2单位)')
    console.log('  reserve: { wood: 10, food: 10, reed: 0 }\n')

    const result = dynamicProgrammingWithTrace(player, costs, null)

    console.log('输出 (所有有效组合):\n')
    for (const combo of result) {
      console.log(`组合 ${combo.nb} 单位:`)
      console.log(`  消耗: wood=${combo.wood}, food=${combo.food}, reed=${combo.reed ?? 0}`)
      console.log(`  trade使用: ${JSON.stringify(combo._tradeUsage)}`)
      console.log()
    }
  })
})
