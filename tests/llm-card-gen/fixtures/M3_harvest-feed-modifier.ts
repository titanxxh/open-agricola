import {
  buildSessionWithLLMCard,
  ALL_ZERO_RESOURCES,
  markAllWorkersUsed,
  setActiveWorkerCount,
} from '../session-helpers'
import type { CardFixture, FixtureContext, FixtureResult, TriggerResult } from './types'

const CARD_ID = 'CUSTOM_M3_HarvestHelper'

// IMPLEMENTATION NOTES (engine quirks discovered while writing this fixture):
//
// 1. There is no `harvest-feed` listener action. The feeding phase
//    (`executeFeedingLogic` in shared/session/game-core.ts) consumes
//    `player.resources.food` directly — it is not dispatched through the
//    listener pipeline, so a `listeners: [{ actions: ['harvest-feed'], ... }]`
//    handler can never fire here.
//
// 2. Effect hooks like `onBeforeFeed` exist in the prompt's allowlist (see
//    shared/cards/E/E30_ChildsToy.ts and E159_OldMiser.ts) but the custom-code
//    sandbox JSON-clones `state` / `player` into the V8 isolate, so direct
//    mutation (`player.resources.food += 1`) does NOT propagate back to the
//    host state. Mutating effect hooks like `onBeforeFeed` cannot be
//    implemented through the sandbox.
//
// 3. `onStartHarvestFeedingPhase` would seem the obvious choice but its
//    resume path (`resumeStageFlow` → `continueHarvestEffects`) restarts
//    `onStartHarvestFeedingPhase` from cardIndex=0, causing infinite recursion
//    for any card whose handler returns a flow. The viable hook is
//    `onHarvest`: its resume threads `cardIndex` through `continueHarvestEffects`
//    correctly, so a `return gainLeaf(CARD_ID, { food: 1 })` runs once per
//    owner before the feeding phase begins.
//
// Setup keeps each player to 1 active adult, so feeding requires 2 food. p0
// starts with 1 food and gets +1 from the card → 2 → no begging. p1 starts
// with 1 food, no card, no convertible resources → must beg 1.

const fixture: CardFixture = {
  id: 'M3-harvest-feed-modifier',
  cardId: CARD_ID,
  cardType: 'occupation',
  userMessage: [
    '请实现一张职业卡牌：',
    '',
    '- 卡牌类型: 职业 (Occupation)',
    '- 卡牌名称: 收获助手',
    '- 效果: 每次收获的喂养阶段开始时，你额外获得 1 食物（用于本次喂养）。',
    '',
    '实现方式（重要约束）：',
    "- 用 effect.onHarvest 实现，签名 (state, player) => ActionFlow。",
    '- 必须 **return** `gainLeaf(CARD_ID, { food: 1 })`，不要直接 `player.resources.food += 1`。',
    '  （沙盒会 JSON 克隆 state/player，直接 mutate 不会反映到主机状态，',
    '   只有返回的 ActionFlow 会被引擎执行。）',
    '- 不要使用 listener，因为引擎的喂养扣食阶段不经过 listener 行动派发。',
  ].join('\n'),

  setup(llmCode) {
    const built = buildSessionWithLLMCard(llmCode, {
      cardId: CARD_ID,
      cardType: 'occupation',
      cardName: '收获助手',
    })
    const state = built.session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4 // harvest round
    state.players.forEach((p) => {
      // Single adult: required = familySize*2 - newborn = 2.
      setActiveWorkerCount(p, 1)
      p.resources = { ...ALL_ZERO_RESOURCES, food: 1 }
      p.fields = []
      p.pastures = []
    })
    // Both players need workers used so performRoundEnd advances into harvest.
    state.players.forEach((p) => markAllWorkersUsed(state, p))
    built.session.devPlayCard(0, CARD_ID)
    const ctx: FixtureContext = {
      cardId: CARD_ID,
      cardData: built.cardData,
      manifest: built.manifest,
    }
    return { session: built.session, ctx }
  },

  trigger(session): TriggerResult {
    const steps: TriggerResult['steps'] = []
    let resp = session.performRoundEnd() as {
      ok: boolean
      pending?: { type?: string; playerIndex?: number }
    }
    steps.push({ label: 'performRoundEnd', resp })
    let safety = 0
    while (resp.pending?.type === 'harvestFeed' && safety++ < 10) {
      const pi = resp.pending.playerIndex!
      resp = session.confirmHarvestFeed(pi, []) as typeof resp
      steps.push({ label: `confirmHarvestFeed(${pi}, [])`, resp })
    }
    return { steps }
  },

  assert(session, ctx, result): FixtureResult {
    // Manifest sanity: we expect onStartHarvestFeedingPhase in effectHooks.
    const manifest = (ctx.manifest ?? {}) as { effectHooks?: string[] }
    const hooks = manifest.effectHooks ?? []
    if (!hooks.includes('onHarvest')) {
      return {
        ok: false,
        reason: `expected effect.onHarvest hook in manifest (got effectHooks=${JSON.stringify(hooks)})`,
      }
    }
    const last = result.steps[result.steps.length - 1]!.resp as
      | { ok: boolean; error?: string }
      | undefined
    if (last && last.ok === false) {
      return { ok: false, reason: `last step failed: ${last.error ?? '?'}` }
    }
    const state = session.getState().state as any
    const p0Beg = state.players[0].resources.begging
    const p1Beg = state.players[1].resources.begging
    if (p0Beg !== 0) {
      return { ok: false, reason: `expected p0.begging=0 (card grants +1 food, 1+1=2 covers cost), got ${p0Beg}` }
    }
    if (p1Beg !== 1) {
      return { ok: false, reason: `expected p1.begging=1 (control player has only 1 of 2 food), got ${p1Beg}` }
    }
    return { ok: true }
  },
}

export default fixture
