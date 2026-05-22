import {
  buildSessionWithLLMCard,
  ALL_ZERO_RESOURCES,
  markAllWorkersUsed,
  setActiveWorkerCount,
} from '../session-helpers'
import type { CardFixture, FixtureContext, FixtureResult } from './types'

const CARD_ID = 'CUSTOM_M3_HarvestHelper'

// IMPLEMENTATION NOTES (engine quirks discovered while writing this fixture):
//
// 1. There is no `harvest-feed` listener action. The feeding phase
//    (`executeFeedingLogic` in shared/session/session-core.ts) consumes
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
  // spec §5.1 例外：userMessage 显式指定 onHarvest hook。onStartHarvestFeedingPhase
  // 的 resume 路径有引擎递归 bug（从 cardIndex=0 重启致 stack overflow），onHarvest
  // 是可用替代。这是单卡场景的引擎 quirk，无法在通用 system prompt 里描述，故按
  // spec §5.1 作为 fixture 级最小提示保留——不是去实现化遗漏，勿删。
  userMessage: [
    '请实现一张职业卡牌：',
    '',
    '- 卡牌类型: 职业 (Occupation)',
    '- 卡牌名称: 收获助手',
    '- 效果: 每次收获的喂养阶段开始时，你额外获得 1 食物（用于本次喂养）。',
    '- 实现提示: 请用 effect.onHarvest hook 实现（返回 gainLeaf）。',
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

  scenario(driver) {
    driver.advanceToHarvest()
  },

  assert(session, _ctx): FixtureResult {
    const state = session.getState().state as any
    const p0Beg = state.players[0].resources.begging
    const p1Beg = state.players[1].resources.begging
    if (p0Beg !== 0) return { ok: false, reason: `expected p0.begging=0 (card grants +1 food, 1+1=2 covers cost), got ${p0Beg}` }
    if (p1Beg !== 1) return { ok: false, reason: `expected p1.begging=1 (control player has only 1 of 2 food), got ${p1Beg}` }
    return { ok: true }
  },
}

export default fixture
