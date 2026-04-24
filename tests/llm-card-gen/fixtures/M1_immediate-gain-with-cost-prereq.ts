// @ts-nocheck
import {
  compileLLMCard,
  registerCard,
  freshState,
  setResources,
  markCardPlayed,
  invokeEffectHook,
} from '../session-helpers'
import type { CardFixture, FixtureResult } from './types'

const CARD_ID = 'CUSTOM_M1_QuickHaul'

const fixture: CardFixture = {
  id: 'M1-immediate-gain-with-cost-prereq',
  cardId: CARD_ID,
  cardType: 'minor',
  userMessage: [
    '请实现一张小改良卡牌：',
    '',
    '- 卡牌类型: 小改良 (MinorImprovement)',
    '- 卡牌名称: 速运',
    '- 打出费用 (cost): 1 wood',
    '- 前置条件 (prerequisite): 3 Occupations',
    '- 效果: 打出本牌时 (onBuy)，立即获得 3 木材和 1 食物。',
    '',
    '请用 onBuy 钩子实现获得效果，使用 gainLeaf(CARD_ID, { wood: 3, food: 1 }) 这种格式返回 ActionFlow。',
  ].join('\n'),
  run(llmCode): FixtureResult {
    let compiled
    try {
      compiled = compileLLMCard({
        llmGeneratedCode: llmCode,
        cardId: CARD_ID,
        cardType: 'minor',
        cardName: '速运',
        cardCost: { wood: 1 },
        cardPrerequisite: '3 Occupations',
      })
    } catch (err) {
      return { ok: false, reason: `compile failed: ${(err as Error).message}` }
    }

    // Verify the card declares the cost (LLM must have included cost in CARD_DEF).
    if (!compiled.cardData.cardJson.cost || compiled.cardData.cardJson.cost.wood !== 1) {
      return {
        ok: false,
        reason: `CARD_DEF.cost = ${JSON.stringify(compiled.cardData.cardJson.cost)}, expected { wood: 1 }`,
      }
    }
    // Verify prerequisite (text-only field).
    if (!compiled.cardData.cardJson.prerequisite) {
      return { ok: false, reason: 'CARD_DEF.prerequisite missing' }
    }

    // Verify the manifest exposes onBuy as an effect hook.
    if (!compiled.manifest.effectHooks?.includes('onBuy')) {
      return {
        ok: false,
        reason: `manifest.effectHooks = ${JSON.stringify(compiled.manifest.effectHooks)}, missing "onBuy"`,
      }
    }

    registerCard(compiled.cardData)

    const state = freshState()
    setResources(state, 0, { wood: 0, food: 0 })
    markCardPlayed(state, 0, CARD_ID, 'minor')
    const player = state.players[0]!

    const result = invokeEffectHook(compiled.compiledCode, CARD_ID, 'onBuy', state, player)
    if (!result.ok) {
      return { ok: false, reason: `onBuy hook threw: ${JSON.stringify(result).slice(0, 300)}` }
    }
    const flow: any = result.result
    if (!flow || flow.type !== 'leaf') {
      return { ok: false, reason: `onBuy did not return a leaf flow: ${JSON.stringify(flow)?.slice(0, 200)}` }
    }
    if (flow.actionId !== 'gain') {
      return { ok: false, reason: `expected actionId=gain, got ${flow.actionId}` }
    }
    const params = flow.params ?? {}
    if (params.wood !== 3) {
      return { ok: false, reason: `expected wood: 3 in params, got ${JSON.stringify(params)}` }
    }
    if (params.food !== 1) {
      return { ok: false, reason: `expected food: 1 in params, got ${JSON.stringify(params)}` }
    }
    return { ok: true }
  },
}

export default fixture
