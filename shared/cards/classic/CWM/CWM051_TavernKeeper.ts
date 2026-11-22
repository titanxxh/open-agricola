import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { gainLeaf } from '../../helpers/pay-gain-node'
import { familySize } from '../../../domain/player'

const CARD_ID = 'CWM051_TavernKeeper'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onStartHarvest: (_state, player) =>
      player.rooms > familySize(player) ? gainLeaf(CARD_ID, { grain: 1, food: 1 }) : undefined,
    computeBonusScore: (_state, player) => Math.max(0, player.rooms - familySize(player)),
  },
} satisfies CardImpl

export const CWM051_TavernKeeper = defineOccupationCard({
  meta: {
    id: 'CWM051_TavernKeeper',
    name: "Tavern Keeper",
    deck: 'CWM',
    number: 51,
    desc: ["At the start of each harvest, if you have at least one empty room, you get 1 <GRAIN> and 1 <FOOD>. Each empty room is worth 1 bonus <SCORE> at the end of the game."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '4+',
    passing: false,
    extraVp: true,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM051.png',
  },
  impl: cardImpl,
})

export const CWM051_TavernKeeper_impl = CWM051_TavernKeeper.impl
