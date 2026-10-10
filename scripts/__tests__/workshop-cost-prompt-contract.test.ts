import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

describe('workshop cost prompt contract', () => {
  it('documents supported cost paths and official-card-only cost APIs', () => {
    const files = [
      read('docs/CUSTOM_CARD_SANDBOX.md'),
    ]

    for (const content of files) {
      expect(content).toMatch(/computeCosts[\s\S]{0,1000}costs[\s\S]{0,1000}trades[\s\S]{0,1000}bonuses/)
      expect(content).toMatch(/paymentResourceProviders/)
      expect(content).toMatch(/payment-only|虚拟支付资源/)
      expect(content).toMatch(/(?:deriveCardCostCandidate[\s\S]{0,240}(?:official-card|官方卡)|(?:official-card|官方卡)[\s\S]{0,240}deriveCardCostCandidate)/i)
      expect(content).toMatch(/(?:getBaseCosts[\s\S]{0,240}(?:official-card|官方卡)|(?:official-card|官方卡)[\s\S]{0,240}getBaseCosts)/i)
      // computeExchanges is an open listener phase; its result shape is documented with it.
      expect(content).toMatch(/computeExchanges[\s\S]{0,600}extraExchanges/)
    }
  })

  it('requires mandatory capped bonuses for improvement-wide discounts', () => {
    const guidance = [
      read('docs/CUSTOM_CARD_SANDBOX.md'),
    ]

    for (const content of guidance) {
      expect(content).toMatch(/(?:改良|improvement)[\s\S]{0,500}capDiscountAtCost/i)
      expect(content).toMatch(/capDiscountAtCost[\s\S]{0,240}optional/)
      expect(content).toMatch(/optional:\s*false/)
      expect(content).toMatch(/sources:\s*\[CARD_ID\]/)
      expect(content).toMatch(/costs[^\n]*(简单|普通 action|simple action)/i)
    }

    const example = read('docs/community-card-examples.md').split('## 5.')[0]!.split('## 4.')[1]!
    expect(example).toContain('bonuses:')
    expect(example).toContain('capDiscountAtCost: true')
    expect(example).toContain('optional: false')
    expect(example).not.toContain('costs: { wood: -1 }')

    const recording = read('tests/llm-card-gen/recordings/M11-improvement-cost-reduction.txt')
    expect(recording).toContain('bonuses:')
    expect(recording).toContain('capDiscountAtCost: true')
    expect(recording).toContain('optional: false')
  })
})
