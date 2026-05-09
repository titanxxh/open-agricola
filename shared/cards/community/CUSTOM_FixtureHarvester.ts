// Generated from Open Agricola workshop. Do not hand-edit.
// Workshop card: CUSTOM_FixtureHarvester
// Author: fixture (github: @fixture)
// Submitted: fixture

import type { CardImpl } from '../registry'
import { CUSTOM_FixtureHarvester } from '../../cards-display/community/CUSTOM_FixtureHarvester'
export { CUSTOM_FixtureHarvester }


const CARD_ID = 'CUSTOM_FixtureHarvester'
const CARD_IMPL: CardImpl = { effect: { id: CARD_ID, onHarvest: () => ({ type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: CARD_ID }) } }

export const CUSTOM_FixtureHarvester_impl = CARD_IMPL satisfies CardImpl
