import { defineMinorCard } from '../card-source'
import type { CardExchange } from '../../contract/cards'
import type { CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase } from '../../actions/hooks'
import type { CardImpl } from '../registry'
import { getPlayerCookeryCards } from '../helpers/cookery'

const CARD_ID = 'C62_CookeryExtension'
const VALID_FROM_RESOURCES: readonly string[] = ['vegetable', 'sheep', 'boar', 'cattle']

const computeExchangesListener: CardListenerRegistration = {
  id: 'C62-cookery-extension-compute-exchanges',
  cardIds: [CARD_ID],
  phases: ['computeExchanges' as ActionHookPhase],
  handler: (ctx) => {
    const window = (ctx.extraData as { window?: string } | undefined)?.window
    if (window !== 'harvest') return
    const player = ctx.player
    if (!player.minorPlayed?.includes(CARD_ID)) return

    const used = (player.cardStates?.[CARD_ID]?.extraData?.usedCookeryIds ?? []) as string[]
    const out: CardExchange[] = []

    for (const cookery of getPlayerCookeryCards(player)) {
      if (used.includes(cookery.id)) continue
      for (const ex of cookery.exchanges ?? []) {
        if (!ex.triggers?.includes('anytime')) continue
        const fromKeys = Object.keys(ex.from ?? {})
        if (fromKeys.length !== 1) continue
        const fromKey = fromKeys[0]
        if ((ex.from as Record<string, number>)[fromKey] !== 1) continue
        if (!VALID_FROM_RESOURCES.includes(fromKey)) continue
        out.push({
          from: { ...ex.from },
          to: { ...ex.to, food: (ex.to.food ?? 0) * 2 },
          triggers: ['harvest'],
          max: 1,
          sourceId: `${CARD_ID}::${cookery.id}`,
          sideEffect: {
            type: 'pushExtraDataValue',
            sourceCard: CARD_ID,
            key: 'usedCookeryIds',
            value: cookery.id,
          },
        })
      }
    }

    if (out.length === 0) return
    return { extraExchanges: out, sourceCard: CARD_ID }
  },
}

const cardImpl = {
  effect: {
    id: CARD_ID,
    onStartHarvest: (_state, player) => {
      player.cardStates ??= {}
      player.cardStates[CARD_ID] ??= {} as never
      const cs = player.cardStates[CARD_ID]
      cs.extraData = { ...(cs.extraData ?? {}), usedCookeryIds: [] }
      return
    },
  },
  listeners: [computeExchangesListener],
} satisfies CardImpl

export const C62_CookeryExtension = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Cookery Extension',
    deck: 'C',
    number: 62,
    category: 'FOOD_PROVIDER',
    desc: [
        'Each harvest, you can use each of your cooking improvements once to get double the amount of <FOOD> for 1 animal or <VEGETABLE>.',
      ],
    cost: { clay: 2 },
    implemented: true,
  },
  impl: cardImpl,
})

export const C62_CookeryExtension_impl = C62_CookeryExtension.impl
