import {
  buildSessionWithLLMCard,
  autoAdvanceRoundEnd,
  getBonusBreakdownForSession,
  ALL_ZERO_RESOURCES,
  markAllWorkersUsed,
  setActiveWorkerCount,
} from '../session-helpers'
import type { CardFixture, FixtureContext, FixtureResult, TriggerResult } from './types'

const CARD_ID = 'CUSTOM_M4_CattleSteward'

// IMPLEMENTATION NOTES:
//
// 1. computeBonusScore is a plain number-returning effect hook
//    (shared/cards/card-effects.ts, BonusScoreHandler =
//     (state, player, ctx) => number). It is already in the
//    sandbox allow-list (server/custom-code/engine.ts cardEffectHooks).
//
// 2. `player.resources.cattle` is the TOTAL cattle the player owns
//    (computeBonusScore reads it). Pastures track WHERE animals are placed.
//    `hasPendingAnimals` = total > assigned; if true, performRoundEnd loops
//    on an animalReorg pending that confirmAnimalReorg([]) cannot clear.
//    So p0 must have pasture(s) with animalCount summing to resources.cattle
//    (=4). We give p0 one pasture holding 4 cattle.
//
// 3. autoAdvanceRoundEnd drives performRoundEnd → confirmHarvestFeed([]) /
//    confirmAnimalReorg(<preserve>) / confirmNextPlayer / confirmPlayerSwitch
//    until gameOver. The helper builds a zone list that preserves
//    resources.{sheep,boar,cattle} (passing zones=[] would zero them).
//    We clear both played-card lists + improvements to avoid choice-pendings
//    from built-in card hooks during round-end scoring.
//
// 4. Round 14 is a harvest round. Breeding raises p0.resources.cattle from
//    4 → 5 (one cow per matched-type pasture with ≥2 same-type animals).
//    floor(5 / 2) = 2 — assertion still expects score=2.
//
// 5. The bonus solver must run inside session.withCtx() (see session-helpers.ts:runBonusSolver)
//    so getCardEffect resolves the custom card via sessionCardContext rather than
//    the empty global registry.

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
    '实现方式（重要约束）：',
    '- 用 effect.computeBonusScore 实现，签名 (state, player) => number。',
    '  直接 return Math.floor(player.resources.cattle / 2) 即可。',
    '- 不要返回 { score, label } 对象，返回纯数字。',
    '- 不要用 listener，本卡不需要监听任何行动。',
  ].join('\n'),

  setup(llmCode) {
    const built = buildSessionWithLLMCard(llmCode, {
      cardId: CARD_ID,
      cardType: 'occupation',
      cardName: '牛倌',
    })
    const state = built.session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 14 // final round — next performRoundEnd triggers game-over
    state.players.forEach((p, i) => {
      markAllWorkersUsed(state, p)
      setActiveWorkerCount(p, 1)
      p.resources = { ...ALL_ZERO_RESOURCES, food: 5, cattle: i === 0 ? 4 : 0 }
      p.fields = []
      // p0 needs a pasture holding all 4 cattle so hasPendingAnimals === false.
      // p1 has 0 cattle so an empty pastures array is fine.
      p.pastures = i === 0
        ? [{
            id: 'p0_pasture',
            size: 4,
            tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }],
            stables: 0,
            animalType: 'cattle',
            animalCount: 4,
          }]
        : []
      p.houseAnimalType = null
      p.houseAnimalCount = 0
      p.stableAnimals = {}
      // Avoid choice-prompting built-in cards during round-end scoring.
      p.improvements = []
      p.minorPlayed = []
      p.occupationPlayed = []
    })
    built.session.devPlayCard(0, CARD_ID)
    const ctx: FixtureContext = {
      cardId: CARD_ID,
      cardData: built.cardData,
      manifest: built.manifest,
    }
    return { session: built.session, ctx }
  },

  trigger(session): TriggerResult {
    autoAdvanceRoundEnd(session, { maxIterations: 100 })
    const final = session.getState().state as { gameOver: boolean }
    return {
      steps: [
        { label: 'autoAdvanceRoundEnd → game over', resp: { gameOver: final.gameOver } },
      ],
    }
  },

  assert(session, ctx, _result): FixtureResult {
    const manifest = (ctx.manifest ?? {}) as { effectHooks?: string[] }
    const hooks = manifest.effectHooks ?? []
    if (!hooks.includes('computeBonusScore')) {
      return {
        ok: false,
        reason: `expected effect.computeBonusScore hook in manifest (got effectHooks=${JSON.stringify(hooks)})`,
      }
    }
    const final = session.getState().state as any
    if (final.gameOver !== true) {
      return { ok: false, reason: `expected gameOver=true, got ${final.gameOver}` }
    }
    // runBonusSolver must run inside session.withCtx (see session-helpers.ts:runBonusSolver)
    // so the per-session custom-card effect registry is visible to getCardEffect.
    const p0Entries = getBonusBreakdownForSession(session, 0)
    const p1Entries = getBonusBreakdownForSession(session, 1)
    const p0Card = p0Entries.find((e) => e.cardId === CARD_ID)
    if (!p0Card) {
      return {
        ok: false,
        reason: `expected p0 bonus entry for ${CARD_ID}, got ${JSON.stringify(p0Entries)}`,
      }
    }
    if (p0Card.score !== 2) {
      return {
        ok: false,
        reason: `expected p0 ${CARD_ID} score=2 (4 setup cattle → 5 after breeding → floor(5/2)=2), got ${p0Card.score}`,
      }
    }
    const p1Card = p1Entries.find((e) => e.cardId === CARD_ID)
    if (p1Card !== undefined) {
      return {
        ok: false,
        reason: `expected p1 to have no ${CARD_ID} entry (card not played), got ${JSON.stringify(p1Card)}`,
      }
    }
    return { ok: true }
  },
}

export default fixture
