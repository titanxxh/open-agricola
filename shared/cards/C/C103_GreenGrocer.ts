import { payGainActionFlow } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C103_GreenGrocer } from '../../cards-display/C/C103_GreenGrocer'
export { C103_GreenGrocer }

const CARD_ID = C103_GreenGrocer.id

export const C103_GreenGrocer_impl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (_state, player) => {

    const options = [
      { cost: { cattle: 1 }, gain: { vegetable: 1 } },
      { cost: { vegetable: 1 }, gain: { cattle: 1 } },
      { cost: { sheep: 2 }, gain: { vegetable: 1 } },
      { cost: { vegetable: 1 }, gain: { sheep: 2 } },
      { cost: { food: 2 }, gain: { grain: 1 } },
      { cost: { grain: 1 }, gain: { food: 2 } },
    ].filter(({ cost }) =>
      Object.entries(cost).every(([k, v]) => (player.resources[k as keyof typeof player.resources] ?? 0) >= v),
    )

    if (options.length === 0) return

    const children = options.map(({ cost, gain }) =>
      payGainActionFlow({ cardId: CARD_ID, cost, gain }),
    )

    return { type: 'xor', optional: true, children }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
