import type { Locale } from '../../../shared/i18n'
import { ALIEN_ARTIFACT_FRAME_PARTS, type ScanAlienArtifactCard } from '../../../shared/scan-cards'
import { publicAssetUrl } from '../../utils/public-asset-url'
import { ScanText } from './ScanText'
import { ScanBadge, ScanCategory, ScanPortrait } from './ScanFrame'

// The X07–X12 print is the official minor frame redrawn in green. Face pixels throughout, measured from
// the six scans: the minor slice of card_frames.jpg sits where they print it, under a gradient map from
// its luminance to their green. The print's lower rim sits higher than the slice's, so the slice's lower
// part, hidden by the panel but for that rim, is drawn a little shorter.
const SLICE_PARTS = [
  { x: 0.647, y: 1.191, width: 233.901, height: 228.67, viewBox: '632 0 632 616' },
  { x: 0.647, y: 228.4, width: 233.901, height: 144.25, viewBox: '632 612 632 394' },
]
const GREEN = {
  r: '0.157 0.157 0.161 0.165 0.169 0.173 0.184 0.204 0.227 0.255 0.282 0.31 0.337 0.365 0.388 0.408 0.42 0.447 0.478 0.506 0.541 0.573 0.584 0.612 0.643 0.671 0.745 0.776 0.843 0.941 0.969 0.98 0.98',
  g: '0.176 0.176 0.18 0.184 0.192 0.2 0.22 0.247 0.282 0.322 0.361 0.404 0.443 0.486 0.525 0.561 0.576 0.608 0.639 0.667 0.694 0.722 0.722 0.729 0.733 0.737 0.808 0.831 0.878 0.949 0.969 0.98 0.976',
  b: '0.157 0.157 0.157 0.157 0.157 0.157 0.161 0.165 0.173 0.18 0.188 0.196 0.2 0.208 0.212 0.216 0.216 0.227 0.239 0.255 0.271 0.286 0.298 0.373 0.463 0.553 0.627 0.667 0.765 0.922 0.957 0.969 0.965',
}
// Negative points sit on the official coin darkened to the print's bronze; white figures map to its cream.
const BRONZE = {
  r: '0.176 0.188 0.2 0.211 0.223 0.235 0.246 0.255 0.261 0.268 0.274 0.28 0.287 0.293 0.299 0.306 0.312 0.319 0.325 0.331 0.338 0.344 0.35 0.353 0.354 0.355 0.356 0.357 0.358 0.359 0.36 0.361 0.886',
  g: '0.196 0.208 0.221 0.233 0.245 0.257 0.27 0.275 0.275 0.276 0.276 0.277 0.277 0.278 0.278 0.281 0.285 0.29 0.294 0.299 0.303 0.308 0.312 0.315 0.316 0.317 0.319 0.32 0.321 0.323 0.324 0.325 0.863',
  b: '0.118 0.123 0.129 0.134 0.14 0.145 0.151 0.153 0.153 0.153 0.153 0.153 0.153 0.153 0.153 0.153 0.154 0.154 0.155 0.155 0.156 0.156 0.157 0.157 0.158 0.158 0.159 0.159 0.159 0.16 0.16 0.161 0.702',
}
// Both plates sit a little inside the slice's own, so they are drawn over it.
const TITLE_PLATE = 'M 50.11 6.26 L 185.38 6.26 L 160.97 48.09 L 74.41 48.09 Z'
const TEXT_PANEL = 'M 6.3 200.32 L 74 207.1 L 158.8 207.1 L 228.7 200.29 L 228.7 357.65 A 9.8 9.8 0 0 1 218.9 367.45 L 16.1 367.45 A 9.8 9.8 0 0 1 6.3 357.65 Z'
// The panel is sunk into the body: its upper and left walls are in shade, the lower and right ones lit.
const PANEL_SHADE = 'M 6.3 357.65 L 6.3 200.32 L 74 207.1 L 158.8 207.1 L 228.7 200.29'
const PANEL_LIGHT = 'M 228.7 200.29 L 228.7 357.65 A 9.8 9.8 0 0 1 218.9 367.45 L 16.1 367.45 A 9.8 9.8 0 0 1 6.3 357.65'
const LINEN = { x: 6.3, y: 200.29, width: 222.4, height: 104.98 }
// The slice's passing arrows lie alone in the white gaps beside the window; cards that do not pass
// print a sprig there instead.
const ARROW_GAPS = 'M 0 112.5 H 36.5 V 143.25 H 0 Z M 198.5 112.5 H 235 V 143.25 H 198.5 Z'
const SPRIGS = [
  { href: ALIEN_ARTIFACT_FRAME_PARTS.sprigLeft, x: 0, y: 100.5, width: 51.5, height: 49 },
  { href: ALIEN_ARTIFACT_FRAME_PARTS.sprigRight, x: 180.5, y: 95.5, width: 54, height: 54 },
]

function GradientMap({ id, table }: { id: string; table: typeof GREEN }) {
  return (
    <filter id={id} colorInterpolationFilters="sRGB">
      <feColorMatrix type="matrix" values="0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0 0 0 1 0" />
      <feComponentTransfer>
        <feFuncR type="table" tableValues={table.r} />
        <feFuncG type="table" tableValues={table.g} />
        <feFuncB type="table" tableValues={table.b} />
      </feComponentTransfer>
    </filter>
  )
}

function AlienArtifactFrame({ id, passing }: { id: string; passing: boolean }) {
  const green = `${id}-green`
  const linen = `${id}-linen`
  return (
    <svg className="scan-artifact__frame" viewBox="0 0 235 374" aria-hidden="true">
      <defs>
        <GradientMap id={green} table={GREEN} />
        <filter id={`${id}-tint`} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 0.92 0 0  0 0 0 1 0" />
        </filter>
        <filter id={`${id}-shade`} x="-5%" y="-5%" width="110%" height="110%">
          <feGaussianBlur stdDeviation="0.7" />
        </filter>
        <filter id={`${id}-soft`} x="0" y="0" width="235" height="374" filterUnits="userSpaceOnUse">
          <feGaussianBlur stdDeviation="1.5" />
        </filter>
        <pattern id={linen} patternUnits="userSpaceOnUse" {...LINEN}>
          <image href={publicAssetUrl(ALIEN_ARTIFACT_FRAME_PARTS.linen)} width={LINEN.width} height={LINEN.height} preserveAspectRatio="none" />
        </pattern>
        <clipPath id={`${id}-gaps`}>
          <path d={`M 0 0 H 235 V 374 H 0 Z ${ARROW_GAPS}`} clipRule="evenodd" />
        </clipPath>
        <clipPath id={`${id}-outside`}>
          <path d={`M 0 0 H 235 V 374 H 0 Z ${TEXT_PANEL}`} clipRule="evenodd" />
        </clipPath>
        <clipPath id={`${id}-panel`}>
          <path d={TEXT_PANEL} />
        </clipPath>
      </defs>
      <g clipPath={passing ? undefined : `url(#${id}-gaps)`}>
        {SLICE_PARTS.map(({ viewBox, ...box }) => (
          <svg key={viewBox} {...box} viewBox={viewBox} preserveAspectRatio="none">
            <image href={publicAssetUrl(ALIEN_ARTIFACT_FRAME_PARTS.slice)} width="1896" height="1006" filter={`url(#${green})`} />
          </svg>
        ))}
      </g>
      <g clipPath={`url(#${id}-outside)`}>
        <path className="scan-artifact__wall scan-artifact__wall--shade" d={PANEL_SHADE} filter={`url(#${id}-shade)`} />
        <path className="scan-artifact__wall scan-artifact__wall--light" d={PANEL_LIGHT} />
      </g>
      <g filter={`url(#${id}-tint)`}>
        <path d={TITLE_PLATE} fill={`url(#${linen})`} />
        <path d={TEXT_PANEL} fill={`url(#${linen})`} />
      </g>
      <g clipPath={`url(#${id}-panel)`}>
        <path className="scan-artifact__inset" d={TEXT_PANEL} filter={`url(#${id}-soft)`} />
      </g>
      <path className="scan-artifact__line scan-artifact__line--title" d={TITLE_PLATE} />
      <path className="scan-artifact__line" d={TEXT_PANEL} />
    </svg>
  )
}

/** Maps for the HTML coin and category roundel, in their own SVG as on the offspring face. */
function AlienArtifactChromeFilters({ id }: { id: string }) {
  return (
    <svg className="scan-artifact__defs" width="0" height="0" aria-hidden="true">
      <GradientMap id={`${id}-chrome-green`} table={GREEN} />
      <GradientMap id={`${id}-bronze`} table={BRONZE} />
    </svg>
  )
}

function AlienArtifactSprigs() {
  return (
    <svg className="scan-artifact__sprigs" viewBox="0 0 235 374" aria-hidden="true">
      {SPRIGS.map(({ href, ...box }) => (
        <image key={href} href={publicAssetUrl(href)} {...box} preserveAspectRatio="none" />
      ))}
    </svg>
  )
}

export function AlienArtifactCard({ card, locale }: { card: ScanAlienArtifactCard; locale: Locale }) {
  const id = `scan-artifact-${card.id}`
  return (
    <ScanPortrait locale={locale} cardId={card.id} label={card.name} layout="alien-artifact">
      <div className="scan-artifact" data-deck="X">
        <AlienArtifactChromeFilters id={id} />
        <AlienArtifactFrame id={id} passing={card.passing === true} />
        <img className="scan-stack-art" src={publicAssetUrl(card.art)} alt="" />
        {card.passing ? null : <AlienArtifactSprigs />}
        {card.overlay ? <img className="scan-stack-over" src={publicAssetUrl(card.overlay)} alt="" /> : null}
        <h3 className="scan-title">{card.name}</h3>
        <span className="scan-number">{card.number}</span>
        {card.vp !== undefined ? (
          <span className="card-score" data-negative={card.vp < 0 || undefined} style={card.vp < 0 ? { filter: `url(#${id}-bronze)` } : undefined}>
            {card.vp}
          </span>
        ) : null}
        {card.bonusPoints ? <span className="scan-artifact__bonus" /> : null}
        <ScanBadge deck={card.deck} />
        <ScanCategory category={card.category} style={{ filter: `url(#${id}-chrome-green)` }} />
        <div className="scan-copy"><ScanText text={card.text} /></div>
      </div>
    </ScanPortrait>
  )
}
