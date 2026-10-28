import { isMoorBalanceRulesEnabled } from '../../contract/game-variants'
import type { GameState } from '../../contract/types'
import { getMajorCardMetadata } from '../major/metadata'

/** Filters only optional card counts; major, cookery and supply identities stay intact. */
export const countsForMoorBalanceRules = (state: GameState, cardId: string): boolean =>
  !isMoorBalanceRulesEnabled(state) || getMajorCardMetadata(cardId)?.requiresFarmersOfTheMoor !== true
