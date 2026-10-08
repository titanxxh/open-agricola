import {
  buildSessionWithLLMCard,
  ALL_ZERO_RESOURCES,
  freezeOtherPlayers,
  setActiveWorkerCount,
  setHand,
  setWorkersAtHome,
  markAllWorkersUsed,
} from '../session-helpers'
import type { CardFixture, FixtureContext, FixtureResult } from './types'

const CARD_ID = 'CUSTOM_M9_Foreseer'

const fixture: CardFixture = {
  id: 'M9-future-meeple',
  cardId: CARD_ID,
  cardType: 'occupation',
  userMessage: [
    '请实现一张职业卡牌：',
    '',
    '- 卡牌类型: 职业 (Occupation)',
    '- 卡牌名称: 预兆者',
    '- 效果: 打出此卡时，预放 1 木材，在下一轮开始时获得。',
  ].join('\n'),

  setup(llmCode, options) {
    const built = buildSessionWithLLMCard(llmCode, {
      historicalRecording: options?.historicalRecording,
      cardId: CARD_ID,
      cardType: 'occupation',
      cardName: '预兆者',
    })
    const state = built.session.getState().state
    state.players = state.players.slice(0, 2)
    freezeOtherPlayers(state, 0)
    setActiveWorkerCount(state.players[1]!, 0)
    const p0 = state.players[0]!
    p0.resources = { ...ALL_ZERO_RESOURCES, food: 5 }
    setHand(state, 0, { occupation: [CARD_ID] })
    setActiveWorkerCount(p0, 2)
    setWorkersAtHome(state, p0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const ctx: FixtureContext = {
      cardId: CARD_ID,
      cardData: built.cardData,
      manifest: built.manifest,
    }
    return { session: built.session, ctx }
  },

  scenario(driver, ctx) {
    driver.playOccupationViaLessons(0)
    const state = driver.getState().state
    const p0 = state.players[0]
    const entries = state.futureMeeples.filter(entry => entry.playerId === p0.id && entry.cardId === CARD_ID)
    if (p0.resources.wood !== 0 || entries.length !== 1
      || entries[0].resources.wood !== 1 || entries[0].round !== state.round + 1) {
      throw new Error('Expected exactly one next-round wood and no immediate wood')
    }
    ctx.scheduledRound = state.round + 1
    state.players.forEach(player => markAllWorkersUsed(state, player))
    driver.advanceToHarvest()
    const next = driver.getState().state
    if (next.round !== ctx.scheduledRound || next.players[0].resources.wood !== 1
      || next.futureMeeples.some(entry => entry.cardId === CARD_ID)) {
      throw new Error('Next-round wood must arrive once and remove its scheduled entry')
    }
    next.players.forEach(player => markAllWorkersUsed(next, player))
    driver.advanceToHarvest()
  },

  assert(session, _ctx): FixtureResult {
    const state = session.getState().state as any
    const p0 = state.players[0]
    if (!p0.occupationPlayed.includes('CUSTOM_M9_Foreseer')) {
      return { ok: false, reason: `expected CUSTOM_M9_Foreseer in occupationPlayed, got ${JSON.stringify(p0.occupationPlayed)}` }
    }
    if (p0.resources.wood !== 1 || state.futureMeeples.some((entry: { cardId?: string }) => entry.cardId === CARD_ID)) {
      return { ok: false, reason: 'Delayed reward repeated or was not cleaned up' }
    }
    const gains = state.events.filter((event: { type: string; sourceCardId?: string }) =>
      event.type === 'resource.moved' && event.sourceCardId === CARD_ID)
    if (gains.length !== 1) return { ok: false, reason: 'Expected one delayed resource event with card source' }
    return { ok: true }
  },
}

export default fixture
