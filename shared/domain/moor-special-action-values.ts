import type { GameState, Resource } from '../contract/types'
import type { MoorSpecialActionId } from '../moor/types'

type BaseResources = {
  cost: Partial<Resource>
  gain: Partial<Resource>
}

export const MOOR_SPECIAL_ACTION_BORROW_FOOD = 2

export const moorSpecialActionBorrowCost = (state: GameState, cardId?: string): Partial<Resource> =>
  state.farmersOfTheMoor?.specialActionCards.find(card => card.id === cardId)?.location.kind === 'playerFaceUp'
    ? { food: MOOR_SPECIAL_ACTION_BORROW_FOOD } : {}

/** Printed base resources for the current player count, before card bonuses or borrowing. */
export const moorSpecialActionBaseResources = (
  actionId: MoorSpecialActionId,
  playerCount: number,
): BaseResources => {
  switch (actionId) {
    case 'cut-peat': return { cost: {}, gain: { fuel: 3 } }
    case 'fell-trees': return { cost: {}, gain: { wood: 2 } }
    case 'slash-and-burn': return { cost: {}, gain: {} }
    case 'horse-market': return { cost: { food: [2, 5, 6].includes(playerCount) ? 1 : 0 }, gain: { horse: 1 } }
    case 'hiring-fair': return { cost: {}, gain: { food: playerCount === 3 ? 2 : 1 } }
    case 'black-market': return { cost: { fuel: 1 }, gain: {} }
    case 'illicit-work': return { cost: { food: 1, fuel: 1 }, gain: {} }
  }
}
