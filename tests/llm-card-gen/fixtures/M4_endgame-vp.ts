import {
  compileLLMCard,
  registerCard,
  freshState,
  setResources,
  markCardPlayed,
  invokeEffectHook,
} from '../session-helpers'
import type { CardFixture, FixtureResult } from './types'

const CARD_ID = 'CUSTOM_M4_CattleSteward'

const fixture: CardFixture = {
  id: 'M4-endgame-vp',
  cardId: CARD_ID,
  cardType: 'occupation',
  userMessage: [
    '请实现一张职业卡牌：',
    '',
    '- 卡牌类型: 职业 (Occupation)',
    '- 卡牌名称: 牛倌',
    '- 效果: 局末计分时，你每 2 头牛获得 1 额外分 (向下取整)。',
    '',
    '请用 computeBonusScore (state, player) => { score, label } 实现。',
  ].join('\n'),
  run(llmCode): FixtureResult {
    let compiled
    try {
      compiled = compileLLMCard({
        llmGeneratedCode: llmCode,
        cardId: CARD_ID,
        cardType: 'occupation',
        cardName: '牛倌',
      })
    } catch (err) {
      return { ok: false, reason: `compile failed: ${(err as Error).message}` }
    }

    const hooks: string[] = compiled.manifest.effectHooks ?? []
    if (!hooks.includes('computeBonusScore')) {
      return {
        ok: false,
        reason: `expected effectHooks to include "computeBonusScore", got ${JSON.stringify(hooks)}`,
      }
    }

    registerCard(compiled.cardData)

    const state = freshState()
    setResources(state, 0, { cattle: 4 } as any)
    markCardPlayed(state, 0, CARD_ID, 'occupation')
    const player = state.players[0]!

    const result = invokeEffectHook(
      compiled.compiledCode,
      CARD_ID,
      'computeBonusScore',
      state,
      player,
    )
    if (!result.ok) {
      return {
        ok: false,
        reason: `computeBonusScore threw: ${JSON.stringify(result).slice(0, 300)}`,
      }
    }
    const ret: any = result.result
    if (!ret || typeof ret !== 'object') {
      return { ok: false, reason: `expected scoring object, got ${JSON.stringify(ret)?.slice(0, 200)}` }
    }
    if (typeof ret.score !== 'number') {
      return { ok: false, reason: `expected numeric score, got ${JSON.stringify(ret)}` }
    }
    if (ret.score !== 2) {
      return { ok: false, reason: `expected score=2 (4 cattle / 2), got score=${ret.score}` }
    }
    return { ok: true }
  },
}

export default fixture
