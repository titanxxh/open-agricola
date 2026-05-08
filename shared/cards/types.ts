// S6a transition shim — preserves existing `from './types'` / `from '../types'`
// imports across all card files. S6b will rewrite card imports directly to
// `shared/cards-display/types` and `shared/contract/cards`, after which this
// shim can be deleted.

export type {
  CardType,
  ExchangeWindow,
  CardExchange,
  CardPrerequisites,
  CardDefinition,
} from '../contract/cards'

export {
  CardBase,
  MinorImprovement,
  Occupation,
  PlayerActionCard,
  getRegisteredMinorImprovement,
  getRegisteredOccupation,
} from '../cards-display/types'

export {
  registerCardLookups,
  registerAdHocMinorImprovement,
  registerAdHocOccupation,
} from './registry-runtime'
