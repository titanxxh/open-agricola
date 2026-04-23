import M1 from './M1_immediate-gain-with-cost-prereq'
import M2 from './M2_per-action-bonus'
import M3 from './M3_harvest-feed-modifier'
import M4 from './M4_endgame-vp'
import M5 from './M5_cost-reduction'
import M6 from './M6_cardstate-counter'
import M7 from './M7_anytime-ability'
import M8 from './M8_cross-player-trigger'
import M9 from './M9_future-meeple'
import type { CardFixture } from './types'

export const fixtures: CardFixture[] = [M1, M2, M3, M4, M5, M6, M7, M8, M9]
export type { CardFixture }
