import {
  ALL_ZERO_RESOURCES,
  buildSessionWithLLMCard,
  freezeOtherPlayers,
  setActiveWorkerCount,
  setHand,
  setWorkersAtHome,
} from '../session-helpers'
import type { CardFixture, FixtureContext, FixtureResult } from './types'

const CARD_ID = 'CUSTOM_M11_MedievalMallet'

type M11Context = FixtureContext & {
  improvementChoices?: string[]
  paymentSignatures?: string[]
  afterPurchase?: {
    resources: Record<string, number>
    minorPlayed: string[]
    logKeys: string[]
  }
}

const paymentSignature = (resources: Record<string, number> | undefined): string =>
  JSON.stringify(Object.fromEntries(
    Object.entries(resources ?? {})
      .filter(([, amount]) => amount > 0)
      .sort(([left], [right]) => left.localeCompare(right)),
  ))

const fixture: CardFixture = {
  id: 'M11-improvement-cost-reduction',
  cardId: CARD_ID,
  cardType: 'occupation',
  userMessage: [
    '请实现一张职业卡牌：',
    '',
    '- 卡牌类型: 职业 (Occupation)',
    '- 卡牌名称: 中世纪木槌',
    '- 效果: 打出后，建造房间和购买改良时各少支付 2 木材。',
  ].join('\n'),

  setup(llmCode) {
    const built = buildSessionWithLLMCard(llmCode, {
      cardId: CARD_ID,
      cardType: 'occupation',
      cardName: '中世纪木槌',
    })
    const state = built.session.getState().state
    state.players = state.players.slice(0, 2)
    freezeOtherPlayers(state, 0)
    const player = state.players[0]!
    player.resources = { ...ALL_ZERO_RESOURCES, wood: 3, reed: 2, clay: 2 }
    player.stableTiles = [
      { row: 0, col: 4 },
      { row: 1, col: 4 },
      { row: 2, col: 4 },
      { row: 0, col: 3 },
    ]
    setHand(state, 0, {
      minor: ['B043_Chophouse', 'D059_EarthOven'],
      occupation: ['__test_placeholder__'],
    })
    setHand(state, 1, { minor: ['__test_placeholder__'], occupation: ['__test_placeholder__'] })
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    built.session.devPlayCard(0, CARD_ID)
    const ctx: M11Context = {
      cardId: CARD_ID,
      cardData: built.cardData,
      manifest: built.manifest,
    }
    return { session: built.session, ctx }
  },

  scenario(driver, ctx) {
    const m11 = ctx as M11Context
    const improvement = driver.takeActionRaw(0, 'major-improvement')
    m11.improvementChoices = improvement.interaction.request?.options?.map((option) => option.value) ?? []

    const payment = driver.resolveChoiceRaw(0, 'B043_Chophouse')
    const paymentOptions = payment.interaction.request?.options ?? []
    m11.paymentSignatures = paymentOptions.map((option) =>
      paymentSignature((option as { labelParams?: { resourcesPaid?: Record<string, number> } }).labelParams?.resourcesPaid),
    )
    const free = paymentOptions.find((option) =>
      paymentSignature((option as { labelParams?: { resourcesPaid?: Record<string, number> } }).labelParams?.resourcesPaid) === '{}',
    )
    if (!free) {
      throw new Error(
        `expected free B043 payment, got ${JSON.stringify(m11.paymentSignatures)} from ${JSON.stringify(payment.interaction)}`,
      )
    }

    driver.resolveChoice(0, free.value)
    const afterPurchase = driver.getState().state.players[0]!
    m11.afterPurchase = {
      resources: { ...afterPurchase.resources },
      minorPlayed: [...afterPurchase.minorPlayed],
      logKeys: driver.getState().state.log.map((entry) => entry.key),
    }
    driver.takeAction(0, 'farm-expansion')
  },

  assert(session, ctx): FixtureResult {
    const m11 = ctx as M11Context
    if (!m11.improvementChoices?.includes('B043_Chophouse')) {
      return { ok: false, reason: `expected B043 choice, got ${JSON.stringify(m11.improvementChoices)}` }
    }
    if (m11.improvementChoices.includes('D059_EarthOven')) {
      return { ok: false, reason: 'D059 must be unavailable without a returned Fireplace' }
    }
    if (JSON.stringify(m11.paymentSignatures) !== JSON.stringify(['{}', '{"clay":2}'])) {
      return { ok: false, reason: `expected free and 2-clay payments, got ${JSON.stringify(m11.paymentSignatures)}` }
    }
    if (!m11.afterPurchase?.minorPlayed.includes('B043_Chophouse')) {
      return { ok: false, reason: `expected B043 to be bought, got ${JSON.stringify(m11.afterPurchase?.minorPlayed)}` }
    }
    if (
      m11.afterPurchase.resources.wood !== 3 ||
      m11.afterPurchase.resources.reed !== 2 ||
      m11.afterPurchase.resources.clay !== 2
    ) {
      return { ok: false, reason: `free B043 purchase changed resources: ${JSON.stringify(m11.afterPurchase.resources)}` }
    }
    if (!m11.afterPurchase.logKeys.includes('log.playMinorImprovement')) {
      return { ok: false, reason: `missing B043 purchase log: ${JSON.stringify(m11.afterPurchase.logKeys)}` }
    }
    const state = session.getState().state
    const player = state.players[0]!
    if (player.rooms !== 3 || player.roomTiles.length !== 3) {
      return { ok: false, reason: `expected one room to be built, got rooms=${player.rooms} roomTiles=${JSON.stringify(player.roomTiles)}` }
    }
    if (player.resources.wood !== 0 || player.resources.reed !== 0 || player.resources.clay !== 2) {
      return { ok: false, reason: `expected room to cost 3 wood and 2 reed, got ${JSON.stringify(player.resources)}` }
    }
    const constructPayment = state.events.find(
      event => event.type === 'resource.paid' && event.paymentFor === 'construct',
    )
    if (constructPayment?.type !== 'resource.paid' || !constructPayment.bonusSources?.includes(CARD_ID)) {
      return { ok: false, reason: `construct payment missing ${CARD_ID} source: ${JSON.stringify(constructPayment)}` }
    }
    const constructLogHasSource = state.log.some((entry) => {
      if (entry.key !== 'log.actionDetail') return false
      const detailParts = entry.params?.detailParts as { bonusSources?: string[] } | undefined
      return detailParts?.bonusSources?.includes(CARD_ID) === true
    })
    if (!constructLogHasSource) {
      return { ok: false, reason: `construct log missing ${CARD_ID} source: ${JSON.stringify(state.log)}` }
    }
    return { ok: true }
  },
}

export default fixture
