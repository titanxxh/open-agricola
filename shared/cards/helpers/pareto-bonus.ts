import type { Resource } from '../../game/types'
import type { BonusScoreLevel } from '../card-effects'

export function paretoOptimal(levels: BonusScoreLevel[]): BonusScoreLevel[] {
  const key = (cost: Partial<Resource>) => JSON.stringify(cost)
  const best = new Map<string, BonusScoreLevel>()
  for (const lv of levels) {
    const k = key(lv.cost)
    const ex = best.get(k)
    if (!ex || lv.score > ex.score) best.set(k, lv)
  }
  return [...best.values()]
}
