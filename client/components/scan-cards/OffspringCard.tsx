import { t, type Locale } from '../../../shared/i18n'
import { OFFSPRING_FRAME_PARTS, type ScanOffspringCard } from '../../../shared/scan-cards'
import { publicAssetUrl } from '../../utils/public-asset-url'
import { ScanText } from './ScanText'
import { ScanBadge, ScanCategory, ScanPortrait } from './ScanFrame'

// Gradient map from the official major slice's luminance to the offspring navy, sampled from the WB scans.
const NAVY = {
  r: '0.094 0.115 0.136 0.157 0.172 0.188 0.198 0.201 0.205 0.209 0.213 0.224 0.241 0.258 0.281 0.305 0.328 0.348 0.367 0.387 0.406 0.44 0.475 0.511 0.546 0.608 0.673 0.738 0.815 0.893 0.948 0.966 0.984',
  g: '0.094 0.121 0.149 0.176 0.197 0.217 0.232 0.24 0.244 0.248 0.253 0.262 0.278 0.293 0.315 0.337 0.359 0.377 0.395 0.412 0.43 0.463 0.497 0.531 0.565 0.624 0.685 0.746 0.819 0.892 0.944 0.962 0.98',
  b: '0.118 0.159 0.201 0.243 0.28 0.318 0.357 0.39 0.398 0.407 0.415 0.423 0.431 0.439 0.454 0.47 0.485 0.501 0.517 0.532 0.548 0.576 0.605 0.635 0.664 0.708 0.754 0.799 0.849 0.899 0.936 0.954 0.973',
}

// Plate outlines in face pixels, measured from the WB scans. The offspring title plate is smaller
// than the official slice's title window, so the window is first filled with the body navy.
const TITLE_WINDOW = 'M 46.73 5.82 L 74.55 53.1 L 162.29 52.64 L 189.96 5.61 Z'
const TITLE_PLATE = 'M 50.4 7 L 74.19 47.78 L 160.3 47.78 L 184.1 7 Z'
const ASSIGN_PLATE = 'M 15.65 7.21 A 9.21 9.21 0 0 0 6.51 16.44 L 6.64 82.98 A 0.74 0.74 0 0 0 7.22 83.71 L 43.78 91.82 A 1.26 1.26 0 0 0 45.14 91.22 L 68.17 51.44 A 1.04 1.04 0 0 0 68.17 50.4 L 43.78 8.25 A 2.52 2.52 0 0 0 41.58 6.99 Z'
const TEXT_PANEL = 'M 7.93 200.51 A 1.02 1.02 0 0 0 6.8 201.53 L 6.95 357.13 A 9.71 9.71 0 0 0 16.68 366.83 L 219.3 366.67 A 9.4 9.4 0 0 0 228.69 357.26 L 228.46 201.51 A 0.95 0.95 0 0 0 227.42 200.57 L 160.52 207.16 L 74.15 207.2 Z'
const SPRIG = { width: 31.63, height: 42.48, left: 6.96, right: 228.7, top: 324.3 }
// The light bevel the scans print outside the plate edges that face down and right.
const RIMS = [
  { d: 'M 184.1 7 L 160.3 47.78', color: 'rgb(147 148 159)' },
  { d: 'M 160.3 47.78 L 74.19 47.78', color: 'rgb(99 104 134)' },
  { d: 'M 68.48 50.92 L 44.68 92.02', color: 'rgb(158 160 168)' },
  { d: 'M 44.68 92.02 L 6.64 83.58', color: 'rgb(75 85 122)' },
]

function OffspringFrame({ id, body }: { id: string; body: string }) {
  const navy = `${id}-navy`
  const parchment = `${id}-parchment`
  const soften = `${id}-soften`
  const sprig = publicAssetUrl(OFFSPRING_FRAME_PARTS.sprig)
  return (
    <>
      <svg className="scan-offspring__defs" width="0" height="0" aria-hidden="true">
        <filter id={navy} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0 0 0 1 0" />
          <feComponentTransfer>
            <feFuncR type="table" tableValues={NAVY.r} />
            <feFuncG type="table" tableValues={NAVY.g} />
            <feFuncB type="table" tableValues={NAVY.b} />
          </feComponentTransfer>
        </filter>
      </svg>
      <span
        className="scan-offspring__body"
        style={{ backgroundImage: `url(${publicAssetUrl(body)})`, filter: `url(#${navy})` }}
      />
      <svg className="scan-offspring__plates" viewBox="0 0 235 374" aria-hidden="true">
        <defs>
          <pattern id={parchment} patternUnits="userSpaceOnUse" width="235" height="374">
            <image href={publicAssetUrl(OFFSPRING_FRAME_PARTS.parchment)} width="235" height="374" preserveAspectRatio="none" />
          </pattern>
          <filter id={soften}>
            <feGaussianBlur stdDeviation="0.3" />
          </filter>
        </defs>
        <path className="scan-offspring__window" d={TITLE_WINDOW} />
        <g className="scan-offspring__rims" filter={`url(#${soften})`}>
          {RIMS.map((rim) => <path key={rim.d} d={rim.d} stroke={rim.color} />)}
        </g>
        <path className="scan-offspring__plate" d={TITLE_PLATE} fill={`url(#${parchment})`} />
        <path className="scan-offspring__plate" d={ASSIGN_PLATE} fill={`url(#${parchment})`} />
        <path className="scan-offspring__plate" d={TEXT_PANEL} fill={`url(#${parchment})`} />
        <image className="scan-offspring__sprig" href={sprig} x={SPRIG.left} y={SPRIG.top} width={SPRIG.width} height={SPRIG.height} preserveAspectRatio="none" />
        <image
          className="scan-offspring__sprig"
          href={sprig}
          transform={`translate(${SPRIG.right} 0) scale(-1 1)`}
          y={SPRIG.top}
          width={SPRIG.width}
          height={SPRIG.height}
          preserveAspectRatio="none"
        />
      </svg>
    </>
  )
}

export function OffspringCard({ card, locale }: { card: ScanOffspringCard; locale: Locale }) {
  return (
    <ScanPortrait locale={locale} cardId={card.id} label={card.name} layout="offspring">
      <div className="scan-offspring" data-deck="L">
        <OffspringFrame id={`scan-offspring-${card.id}`} body={card.frame} />
        <img className="scan-stack-art" src={publicAssetUrl(card.art)} alt="" />
        <p className="scan-assign">{t(locale, 'ui.encyclopedia.scanFace.offspringAssign')}</p>
        <h3 className="scan-title">{card.name}</h3>
        <span className="scan-number">{card.number}</span>
        <ScanCategory category={card.category} />
        <ScanBadge deck={card.deck} />
        <div className="scan-copy"><ScanText text={card.text} /></div>
      </div>
    </ScanPortrait>
  )
}
