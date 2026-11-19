/** A Woodpile Hook card as the native Card Source a Workshop draft holds (ADR 0052). */
export const WOODPILE_SOURCE = `import { defineMinorCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardListenerRegistration } from '../card-listeners'

const CARD_ID = 'CUSTOM_WoodpileHook'

const fishing: CardListenerRegistration = {
  id: 'woodpile-hook-fishing', cardIds: [CARD_ID], actionSpaces: ['fishing'], phases: ['before'],
  handler: () => ({ flow: gainLeaf(CARD_ID, { wood: 1 }), sourceCard: CARD_ID }),
}

export const CUSTOM_WoodpileHook = defineMinorCard({
  meta: { id: CARD_ID, name: 'Woodpile Hook', deck: 'community', number: 0, desc: ['Each time you use Fishing, also get 1 <WOOD>.'], cost: { wood: 1 } },
  impl: { listeners: [fishing] },
})
`
