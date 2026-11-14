import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { createEventQuery } from '../../../events/query'
import { animalKeysForState } from '../../../contract/animals'
import { gainLeaf } from '../../helpers/pay-gain-node'

const CARD_ID = 'OLD_I97_Slaughterhouse'

const cardImpl = {
  effect: { id: CARD_ID, computeHarvestFeedingOrderPriority: () => 1 },
  listeners: [
    {
      id: CARD_ID + '-slaughter',
      cardIds: [CARD_ID],
      actions: ['exchange'],
      phases: ['after'],
      scope: 'opponent',
      handler: (context) =>
        createEventQuery(context.actionEvents ?? [])
          .filter('resource.exchanged')
          .some(
            (e) =>
              (e.gained.food ?? 0) > 0 &&
              animalKeysForState(context.state).some((animal) => (e.paid[animal] ?? 0) > 0),
          )
          ? { sourceCard: CARD_ID, flow: gainLeaf(CARD_ID, { food: 1 }) }
          : undefined,
    },
  ],
} satisfies CardImpl

export const OLD_I97_Slaughterhouse = defineMinorCard({
  meta: {
    id: 'OLD_I97_Slaughterhouse',
    name: '屠宰场',
    deck: 'I',
    number: 97,
    desc: [
      '每次其他玩家将至少1只动物转化为食物时，你获得1份食物。每个丰收时节的喂养阶段，你最后进行结算。K299屠宰工和I97屠宰场的拥有者按照正常(下1回合)顺序结算。',
    ],
    cost: {
      stone: 2,
      clay: 2,
    },
    vp: 2,
    prerequisite: '',
    passing: false,
    extraVp: false,
    implemented: true,
    locales: {
      zh: {
        name: '屠宰场',
        desc: [
          '每次其他玩家将至少1只动物转化为食物时，你获得1份食物。每个丰收时节的喂养阶段，你最后进行结算。K299屠宰工和I97屠宰场的拥有者按照正常(下1回合)顺序结算。',
        ],
        prerequisite: '',
      },
    },
  },
  impl: cardImpl,
})
export const OLD_I97_Slaughterhouse_impl = OLD_I97_Slaughterhouse.impl
