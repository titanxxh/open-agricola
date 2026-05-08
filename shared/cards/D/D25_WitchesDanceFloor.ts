import { MinorImprovement } from '../types'
import type { ExtraSowableField } from '../card-effects'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { PlayerState } from '../../contract/types'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { canSow } from '../../actions/effects/sow'
import { dispatchReapListener } from '../../actions/effects/reap'
import type { CardImpl } from '../registry'

const CARD_ID = 'D25_WitchesDanceFloor'

type CardCrop = { crop: 'grain' | 'vegetable'; remaining: number }

const GRAIN_INITIAL = 3
const VEGETABLE_INITIAL = 2
const VIRTUAL_TILE = { row: -1, col: 25 }

const getCardCrop = (player: PlayerState): CardCrop | null =>
  readCardExtraData<CardCrop>(player, CARD_ID, 'cardCrop') ?? null

const setCardCrop = (player: PlayerState, crop: CardCrop | null) =>
  writeCardExtraData(player, CARD_ID, 'cardCrop', crop)

const isDoableListener: CardListenerRegistration = {
  id: 'D25-witches-dance-floor-isdoable-sow',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (canSow(context.player)) return
    if (getCardCrop(context.player)) return
    if (context.player.resources.grain <= 0 && context.player.resources.vegetable <= 0) return
    return { doable: true }
  },
}

export const D25_WitchesDanceFloor = new MinorImprovement({
  id: CARD_ID,
  name: "Witches' Dance Floor",
  deck: 'D',
  number: 25,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'This card is a field that you can sow in, an occupation, and the "Fireplace" major improvement with all of its effects.',
    'You can play it only via a "Minor Improvement" action.',
    '[Anytime]',
    '<VEGETABLE> <ARROW> 2<FOOD>      <BOAR> <ARROW> 2<FOOD>',
    '<SHEEP> <ARROW> 2<FOOD>      <CATTLE> <ARROW> 3<FOOD>',
    '[__Bake Bread__ action:]',
    '<GRAIN> <ARROW> 2<FOOD>',
  ],
  cost: {},
  vp: 0,
  prerequisite: 'see below',
  providesField: true,
  providesOccupation: true,
  fireplaceIdentity: true,
  alsoCountsAs: ['major'],
  mustBePlayedViaMinorAction: true,
  isCookery: true,
  isBaking: true,
  exchanges: [
    { from: { vegetable: 1 }, to: { food: 2 }, triggers: ['anytime'] },
    { from: { boar: 1 }, to: { food: 2 }, triggers: ['anytime'] },
    { from: { sheep: 1 }, to: { food: 2 }, triggers: ['anytime'] },
    { from: { cattle: 1 }, to: { food: 3 }, triggers: ['anytime'] },
    { from: { grain: 1 }, to: { food: 2 }, triggers: ['bake-bread'] },
  ],
})

export const D25_WitchesDanceFloor_impl = {
  listeners: [isDoableListener],
  effect: {
  id: CARD_ID,

  onComputeSowableFields: (player): ExtraSowableField[] => {
    if (getCardCrop(player)) return []
    return [
      {
        tile: VIRTUAL_TILE,
        allowedCrops: ['grain', 'vegetable'],
        sourceCard: CARD_ID,
      },
    ]
  },

  onSowExtraField: (player, tile, crop): boolean => {
    if (tile.row !== VIRTUAL_TILE.row || tile.col !== VIRTUAL_TILE.col) return false
    if (crop !== 'grain' && crop !== 'vegetable') return false
    if (getCardCrop(player)) return false
    if (player.resources[crop] <= 0) return false
    player.resources[crop] -= 1
    setCardCrop(player, {
      crop,
      remaining: crop === 'grain' ? GRAIN_INITIAL : VEGETABLE_INITIAL,
    })
    return true
  },

  onHarvestFieldPhase: (state, player) => {
    const cardCrop = getCardCrop(player)
    if (!cardCrop || cardCrop.remaining <= 0) return
    player.resources[cardCrop.crop] += 1
    dispatchReapListener(state, player, cardCrop.crop, 1)
    cardCrop.remaining -= 1
    setCardCrop(player, cardCrop.remaining <= 0 ? null : cardCrop)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
