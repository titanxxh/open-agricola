import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import type { ActionFlow } from '../../../contract/types'
import { payGainActionFlow } from '../../helpers/pay-gain-node'

const CARD_ID = 'CWM047_StorehouseMinder'

const resources = ['wood', 'clay', 'reed', 'stone'] as const
const subsets = <T>(items: readonly T[], max: number) =>
  Array.from({ length: (1 << items.length) - 1 }, (_, mask) =>
    items.filter((_, i) => ((mask + 1) & (1 << i)) !== 0),
  ).filter((set) => set.length <= max)
const store = (items: readonly string[]): ActionFlow => ({
  type: 'leaf',
  actionId: 'store-on-card',
  sourceCard: CARD_ID,
  params: Object.fromEntries(items.map((r) => [r, 1])),
})
const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => ({
      type: 'xor',
      optional: true,
      children: subsets(
        resources.filter((r) => player.resources[r] > 0),
        4,
      ).map((items) =>
        payGainActionFlow({
          cardId: CARD_ID,
          cost: Object.fromEntries(items.map((r) => [r, 1])),
          followUp: [store(items)],
        }),
      ),
    }),
    onStartHarvest: (_state, player) => {
      const present = resources.filter((r) => (player.cardStates[CARD_ID]?.counters?.[r] ?? 0) > 0)
      return present.length
        ? { type: 'xor', optional: true, children: subsets(present, 2).map(store) }
        : undefined
    },
    onRoundStart: (_state, player) => {
      const present = resources.filter((r) => (player.cardStates[CARD_ID]?.counters?.[r] ?? 0) > 0)
      return present.length
        ? {
            type: 'xor',
            optional: true,
            children: present.map((r) => ({
              type: 'leaf',
              actionId: 'take-from-card',
              sourceCard: CARD_ID,
              params: { [r]: player.cardStates[CARD_ID]!.counters![r] },
            })),
          }
        : undefined
    },
  },
} satisfies CardImpl

export const CWM047_StorehouseMinder = defineOccupationCard({
  meta: {
    id: 'CWM047_StorehouseMinder',
    name: "Storehouse Minder",
    deck: 'CWM',
    number: 47,
    desc: ["When played, you may put 1 to 4 different building resources from your supply on this card. At the start of each harvest, choose up to 2 types already on it and add one of each from the supply. At the start of each round, you may take all resources of one type from this card."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '3+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM047.png',
  },
  presentation: { counters: ['wood', 'clay', 'reed', 'stone'] },
  impl: cardImpl,
})

export const CWM047_StorehouseMinder_impl = CWM047_StorehouseMinder.impl
