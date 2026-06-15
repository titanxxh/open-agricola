import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('workshop cost prompt contract', () => {
  it('documents supported cost paths and official-card-only cost APIs', () => {
    const files = [
      read('client/services/llmPrompts.ts'),
      read('docs/CUSTOM_CARD_SANDBOX.md'),
    ]

    for (const content of files) {
      expect(content).toMatch(/computeCosts[\s\S]{0,1000}costs[\s\S]{0,1000}trades[\s\S]{0,1000}bonuses/)
      expect(content).toMatch(/paymentResourceProviders/)
      expect(content).toMatch(/payment-only|虚拟支付资源/)
      expect(content).toMatch(/deriveCardCostCandidate[\s\S]{0,240}官方卡/)
      expect(content).toMatch(/getBaseCosts[\s\S]{0,240}官方卡/)
      expect(content).toMatch(/computeExchanges[\s\S]{0,240}(不可用|不支持|不要|官方卡)/)
    }
  })
})
