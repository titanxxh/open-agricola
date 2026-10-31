import type { CSSProperties } from 'react'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type { MoorSpecialActionId } from '../../../shared/moor/types'
import { publicAssetUrl } from '../../utils/public-asset-url'

const actionArtwork: Record<MoorSpecialActionId, { image: string; top: number }> = {
  'fell-trees': { image: 'moor-special-1-2-terrain', top: 76 },
  'slash-and-burn': { image: 'moor-special-1-2-terrain', top: 176 },
  'cut-peat': { image: 'moor-special-1-2-terrain', top: 275 },
  'horse-market': { image: 'moor-special-1-2-market-work', top: 76 },
  'hiring-fair': { image: 'moor-special-1-2-market-work', top: 176 },
  'black-market': { image: 'moor-special-1-2-market-work', top: 275 },
  'illicit-work': { image: 'moor-special-1-2-market-work', top: 372 },
}

/** Card art the action's icon is cut from. */
export const specialActionIconArtUrl = (actionId: MoorSpecialActionId): string =>
  publicAssetUrl(`/assets/moor/special-action-card/${actionArtwork[actionId].image}.webp`)

export const specialActionIconStyle = (actionId: MoorSpecialActionId): CSSProperties => ({
  backgroundImage: `url("${specialActionIconArtUrl(actionId)}")`,
  backgroundPosition: `-18px -${actionArtwork[actionId].top / 2}px`,
})

export const specialActionLabel = (locale: Locale, actionId: MoorSpecialActionId) =>
  t(locale, `moor.specialActions.${actionId}`)
