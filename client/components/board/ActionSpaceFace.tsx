import type { ChoiceDescriptionPreview, Resource } from '../../../shared/contract/types'
import { t, type Locale } from '../../../shared/i18n'
import { ActionSpaceDescription } from './ActionSpaceDescription'
import { ResourceLine } from '../common/ResourceLine'
import { publicAssetUrl } from '../../utils/public-asset-url'
import { useState } from 'react'
import './ActionSpaceFace.css'

/** The same printed frame and rule-plan symbols used by the board's enlarged view. */
export function ActionSpaceFace({ locale, nameKey, preview, fallback, gainPerRound, actionId }: {
  locale: Locale; nameKey: string; preview?: ChoiceDescriptionPreview; fallback?: string; gainPerRound?: Partial<Resource>; actionId?: string
}) {
  const [imageFailed, setImageFailed] = useState(false)
  return (
    <div className="tooltip-action-card action-space-face" data-action-id={actionId}>
      {!imageFailed && <img className="action-space-face__frame" src={publicAssetUrl('/assets/revised/action_frame.png')}
        alt="" onError={() => setImageFailed(true)} />}
      <h4 className="action-header">{t(locale, nameKey)}</h4>
      <div className="action-desc">{gainPerRound && Object.values(gainPerRound).some(amount => amount > 0)
        ? <ResourceLine locale={locale} resources={gainPerRound} />
        : preview ? <ActionSpaceDescription locale={locale} preview={preview} /> : fallback}</div>
    </div>
  )
}
