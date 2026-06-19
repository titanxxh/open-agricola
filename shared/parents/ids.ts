import type { FatherParentCardId, MotherParentCardId, ParentCardId } from './types'

export const MOTHER_PARENT_CARD_IDS = [
  'PR01', 'PR02', 'PR03', 'PR04', 'PR05', 'PR06',
  'PR07', 'PR08', 'PR09', 'PR10', 'PR11', 'PR12',
] as const satisfies readonly MotherParentCardId[]

export const FATHER_PARENT_CARD_IDS = [
  'PS01', 'PS02', 'PS03', 'PS04', 'PS05', 'PS06',
  'PS07', 'PS08', 'PS09', 'PS10', 'PS11', 'PS12',
] as const satisfies readonly FatherParentCardId[]

export const PARENT_CARD_IDS = [
  ...MOTHER_PARENT_CARD_IDS,
  ...FATHER_PARENT_CARD_IDS,
] as const satisfies readonly ParentCardId[]

const PARENT_CARD_ID_SET = new Set<string>(PARENT_CARD_IDS)
const MOTHER_PARENT_CARD_ID_SET = new Set<string>(MOTHER_PARENT_CARD_IDS)
const FATHER_PARENT_CARD_ID_SET = new Set<string>(FATHER_PARENT_CARD_IDS)

export const isParentCardId = (id: string): id is ParentCardId => PARENT_CARD_ID_SET.has(id)
export const isMotherParentCardId = (id: string): id is MotherParentCardId => MOTHER_PARENT_CARD_ID_SET.has(id)
export const isFatherParentCardId = (id: string): id is FatherParentCardId => FATHER_PARENT_CARD_ID_SET.has(id)
