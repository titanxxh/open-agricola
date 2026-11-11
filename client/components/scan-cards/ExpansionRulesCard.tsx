import type { Locale } from '../../../shared/i18n'
import type { ScanExpansionRulesCard } from '../../../shared/scan-cards'
import { publicAssetUrl } from '../../utils/public-asset-url'
import { ScanText } from './ScanText'
import { ScanPortrait } from './ScanFrame'

// The parchment is toned by its luminance alone, so its own warm cast drops out and its grain lands on the
// print's olive tan.
const OLIVE_TAN = '0.4032 0.7916 0.1537 0 -0.1762  0.4111 0.8071 0.1567 0 -0.2434  0.4941 0.97 0.1884 0 -0.6125  0 0 0 1 0'
// The print pales towards its cut edge over about 6 face px; a blurred stroke on the card outline gives that falloff.
const RIM = { color: '#fbf6e4', width: 4, blur: 2.3 }

export function ExpansionRulesCard({ card, locale }: { card: ScanExpansionRulesCard; locale: Locale }) {
  const tone = `scan-rules-${card.id}-tone`
  const rim = `scan-rules-${card.id}-rim`
  return (
    <ScanPortrait locale={locale} cardId={card.id} label={card.name} layout="expansion-rules">
      <div className="scan-rules">
        <svg className="scan-rules__parchment" viewBox="0 0 235 374" preserveAspectRatio="none" aria-hidden="true">
          <filter id={tone} colorInterpolationFilters="sRGB">
            <feColorMatrix type="matrix" values={OLIVE_TAN} />
          </filter>
          <filter id={rim} x="-10" y="-10" width="255" height="394" filterUnits="userSpaceOnUse">
            <feGaussianBlur stdDeviation={RIM.blur} />
          </filter>
          <image href={publicAssetUrl(card.frame)} width="235" height="374" preserveAspectRatio="none" filter={`url(#${tone})`} />
          <rect width="235" height="374" rx="16" fill="none" stroke={RIM.color} strokeWidth={RIM.width} filter={`url(#${rim})`} />
        </svg>
        <img className="scan-rules-logo" src={publicAssetUrl(card.art)} alt="" />
        <div className="scan-copy">
          <ScanText text={card.text} />
        </div>
      </div>
    </ScanPortrait>
  )
}
