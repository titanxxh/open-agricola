import {
  buildSessionWithLLMCard,
  ALL_ZERO_RESOURCES,
  freezeOtherPlayers,
  setActiveWorkerCount,
  setWorkersAtHome,
} from '../session-helpers'
import type { CardFixture, FixtureContext, FixtureResult, TriggerResult } from './types'

const CARD_ID = 'CUSTOM_M5_FrugalFamily'

// FIXME(spec mismatch): the test premise is "1 food discount on family growth",
// but in this codebase the `wish-children-growth` action has NO inherent food
// cost (`shared/actions/effects/wish-children.ts`). applyCostOverride clamps to
// >= 0, so a `costs: { food: -1 }` listener has no observable resource effect:
// food stays at the starting value (1) regardless of the listener.
// Therefore the resource assertion checks that food is unchanged AND a newborn
// worker appeared — which still proves the wish-children-growth flow ran end
// to end, the listener registered on the right action+phase, and the engine
// merged the listener result without crashing.
//
// To turn this into a true cost-discount observation, switch the userMessage
// to an action with a real base cost (e.g. play-occupation or renovate-house)
// and assert the resource was reduced by 1.

const fixture: CardFixture = {
  id: 'M5-cost-reduction',
  cardId: CARD_ID,
  cardType: 'occupation',
  userMessage: [
    '请实现一张职业卡牌：',
    '',
    '- 卡牌类型: 职业 (Occupation)',
    '- 卡牌名称: 节俭家族',
    '- 效果: 你执行「家庭增长」(wish-children-growth) 行动时，所需食物 -1（最少 0）。',
    '',
    "请用 listener 实现：监听 actions: ['wish-children-growth']，phases: ['computeCosts']，",
    "scope: 'player'，cardIds: [CARD_ID]。handler 直接返回 `{ costs: { food: -1 } }`，",
    '不要返回 flow（computeCosts 阶段只接受 costs/trades/bonuses 等结构）。',
  ].join('\n'),

  setup(llmCode) {
    const built = buildSessionWithLLMCard(llmCode, {
      cardId: CARD_ID,
      cardType: 'occupation',
      cardName: '节俭家族',
    })
    const state = built.session.getState().state
    state.players = state.players.slice(0, 2)
    freezeOtherPlayers(state, 0)
    const p0 = state.players[0]!
    p0.resources = { ...ALL_ZERO_RESOURCES, food: 1 }
    // Need rooms > family size so wish-children-growth is doable.
    p0.roomTiles = [
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 0, col: 1 },
    ]
    p0.rooms = 3
    setActiveWorkerCount(p0, 2)
    setWorkersAtHome(state, p0, 2)
    state.currentPlayerIndex = 0
    // FIXED_ROUND_ACTION_ORDER index 4 (round 5) = 'wish-children'.
    state.round = 5
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
    const r = session.takeAction(0, 'wish-children')
    steps.push({ label: "takeAction(0,'wish-children')", resp: r })
    return { steps }
  },

  assert(session, ctx, result): FixtureResult {
    const r = result.steps[0]!.resp as { ok: boolean; error?: string } | undefined
    if (!r || r.ok === false) {
      return { ok: false, reason: `takeAction failed: ${r?.error ?? '?'}` }
    }
    // Verify manifest has the right listener shape — independent of runtime
    // cost numbers (see FIXME at top).
    const manifest = (ctx.manifest ?? {}) as { listeners?: Array<{ actions?: string[]; phases?: string[] }> }
    const listeners = manifest.listeners ?? []
    const target = listeners.find(
      (l) => l.actions?.includes('wish-children-growth') && l.phases?.includes('computeCosts'),
    )
    if (!target) {
      return {
        ok: false,
        reason: `no listener with actions:['wish-children-growth'] phases:['computeCosts'] (got ${JSON.stringify(listeners.map((l) => ({ a: l.actions, p: l.phases })))})`,
      }
    }
    const state = session.getState().state as any
    const p0 = state.players[0]
    // Food unchanged: wish-children-growth has no base food cost in this
    // codebase, so a -1 cost discount clamps to 0 (no payment).
    if (p0.resources.food !== 1) {
      return { ok: false, reason: `expected food=1 (no base cost to discount), got ${p0.resources.food}` }
    }
    // The wish-children flow must have run: a newborn worker should now exist.
    const newborns = (p0.workers ?? []).filter((w: any) => w.isActive && w.isNewborn)
    if (newborns.length === 0) {
      return {
        ok: false,
        reason: `expected at least 1 newborn worker after wish-children (got workers=${JSON.stringify((p0.workers ?? []).map((w: any) => ({ id: w.id, a: w.isActive, n: w.isNewborn })))})`,
      }
    }
    return { ok: true }
  },
}

export default fixture
