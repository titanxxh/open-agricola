import type { Locale } from '../../../shared/i18n'
import type { ScanCropCirclesCard } from '../../../shared/scan-cards'
import { publicAssetUrl } from '../../utils/public-asset-url'
import { ActionFrame, type ActionFrameBand } from './ActionFrame'
import { ScanText } from './ScanText'
import { ScanCategory, ScanPortrait } from './ScanFrame'

// The title band gains two turns of the side vines and the text panel loses rows from its middle, so the corner
// sprouts, the knot and the bottom border keep their size.
const BANDS: readonly ActionFrameBand[] = [
  [0, 122, 0, 122],
  [86, 122, 122, 157],
  [86, 122, 157, 183.7],
  [122, 244, 183.7, 305.7],
  [420, 740, 305.7, 620.1],
  [740, 769, 620.1, 649.1],
]

export function CropCirclesCard({ card, locale }: { card: ScanCropCirclesCard; locale: Locale }) {
  return (
    <ScanPortrait locale={locale} cardId={card.id} label={card.name} layout="crop-circles">
      <div className="scan-crop scan-official-action" data-deck="X">
        <img className="scan-bottom-art" src={publicAssetUrl(card.art)} alt="" />
        <ActionFrame src={publicAssetUrl(card.frame)} bands={BANDS} className="scan-crop__frame" />
        <span className="scan-number">{card.number}</span>
        <h3 className="scan-title">{card.name}</h3>
        <ScanCategory category={card.category} />
        <div className="scan-copy">
          <ScanText text={card.text} />
        </div>
      </div>
    </ScanPortrait>
  )
}
