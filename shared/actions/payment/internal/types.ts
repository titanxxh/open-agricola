import type { Resource, Trade } from '../../../game/types'

export type InternalSolution = {
  resourcesRemaining: Partial<Resource>
  tradesUsed: { trade: Trade; times: number }[]
  bonusUsed?: string
  bonusChoiceIndex?: Record<string, number>
  feeIndex?: number
}
