// Generated from Open Agricola workshop. Do not hand-edit.
// Workshop card: CUSTOM_FixtureHarvester
// Author: fixture (github: @fixture)
// Submitted: fixture

import { defineMinorCard } from '../card-source';
const CARD_ID = 'CUSTOM_FixtureHarvester';
export const CUSTOM_FixtureHarvester = defineMinorCard({
    meta: { id: CARD_ID, name: 'Fixture Harvester', deck: 'community', number: 0, desc: ['Each harvest, gain 1 <FOOD>. (Community deck fixture card; not a real card.)'], cost: { wood: 1 }, vp: 0 },
    impl: { effect: { id: CARD_ID, onHarvest: () => ({ type: 'leaf', actionId: 'gain', params: { food: 1 }, sourceCard: CARD_ID }) } },
});

export const CUSTOM_FixtureHarvester_impl = CUSTOM_FixtureHarvester.impl
