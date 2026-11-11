import type { Locale } from '../../../shared/i18n'
import type { ScanAlienEventCard, ScanSpaceMerchantCard } from '../../../shared/scan-cards'
import { publicAssetUrl } from '../../utils/public-asset-url'
import { roundedPath, type FrameCorner } from './framePath'
import { ScanText } from './ScanText'
import { ScanBadge, ScanCategory, ScanPortrait } from './ScanFrame'

type BandCard = ScanSpaceMerchantCard | ScanAlienEventCard

// The face is three tiles printed on white stock: a header with the title plate, the art window
// with its foot, and a lower tile with the side plates and the text panel. Outer tile edges are in
// face pixels; outlines are stroked on the centre of the printed lines.
const MID = 117.5
const LEFT = 1.15
const RIGHT = 233.85
const HEADER = { top: 1.05, bottom: 53.8 }
const WINDOW = { top: 56.6, bottom: 148.75, foot: 198.9, footHalf: 70.2 }
const LOWER = { top: 151.75, notch: 201.85, notchHalf: 71.9, bottom: 372.95 }
// The foot's sides run at 60 degrees; insetting a side by d moves it d / cos(30deg) sideways.
const SLOPE = Math.tan(Math.PI / 6)
const SIDE = 1 / Math.cos(Math.PI / 6)
const KEY = 0.6
const PLATE = 5.4
const ART = 3.3

const footHalf = (y: number, inset: number) => WINDOW.footHalf - (y - WINDOW.bottom) * SLOPE - inset * SIDE
const notchHalf = (y: number, inset: number) => LOWER.notchHalf - (y - LOWER.top) * SLOPE + inset * SIDE

const mirrored = (half: readonly FrameCorner[]): FrameCorner[] =>
  [...half, ...[...half].reverse().map(([x, y, r]): FrameCorner => [2 * MID - x, y, r])]

const headerTile = (d: number, outer: number, inner: number) => roundedPath([
  [LEFT + d, HEADER.top + d, outer],
  [RIGHT - d, HEADER.top + d, outer],
  [RIGHT - d, HEADER.bottom - d, inner],
  [LEFT + d, HEADER.bottom - d, inner],
])

const windowTile = (d: number, corner: number, footTop: number, footBottom: number) => {
  const side = WINDOW.bottom - d
  const foot = WINDOW.foot - d
  return roundedPath([
    [LEFT + d, WINDOW.top + d, corner],
    [LEFT + d, side, corner],
    ...mirrored([
      [MID - footHalf(side, d), side, footTop],
      [MID - footHalf(foot, d), foot, footBottom],
    ]),
    [RIGHT - d, side, corner],
    [RIGHT - d, WINDOW.top + d, corner],
  ])
}

const LOWER_TOP = LOWER.top + KEY
const LOWER_NOTCH = LOWER.notch + KEY
const PATHS = {
  header: headerTile(KEY, 14.4, 0.9),
  title: headerTile(PLATE, 9.6, 1),
  window: windowTile(KEY, 0.9, 2, 2.5),
  art: windowTile(ART, 0.6, 1.2, 1.5),
  lower: roundedPath([
    [LEFT + KEY, LOWER_TOP, 1.9],
    ...mirrored([
      [MID - notchHalf(LOWER_TOP, KEY), LOWER_TOP, 2.5],
      [MID - notchHalf(LOWER_NOTCH, KEY), LOWER_NOTCH, 1.5],
    ]),
    [RIGHT - KEY, LOWER_TOP, 1.9],
    [RIGHT - KEY, LOWER.bottom - KEY, 14.4],
    [LEFT + KEY, LOWER.bottom - KEY, 14.4],
  ]),
  panel: roundedPath([
    [LEFT + 5.5, 201.25, 1.2],
    ...mirrored([[MID - 44.5, LOWER.notch + 5.6, 0]]),
    [RIGHT - 5.5, 201.25, 1.2],
    [RIGHT - 5.5, LOWER.bottom - 5.3, 9.6],
    [LEFT + 5.5, LOWER.bottom - 5.3, 9.6],
  ]),
}

// Tile colours: shadowed bevel, flat face, lit bevel, and how strongly the print is mottled.
const BODY = {
  'space-merchant': { shade: [50, 44, 42], flat: [199, 79, 50], lit: [205, 152, 125], mottle: 0.05 },
  'alien-event': { shade: [45, 52, 58], flat: [98, 142, 184], lit: [192, 208, 220], mottle: 0.25 },
} as const

// Lighting at 30 degrees puts a flat face at 0.5, so the ramp runs shade, flat, lit across the bevel.
const ramp = (layout: BandCard['layout'], channel: 0 | 1 | 2) => {
  const { shade, flat, lit } = BODY[layout]
  const stops = [shade[channel], (shade[channel] + flat[channel]) / 2, flat[channel], lit[channel], lit[channel]]
  return stops.map((c) => (c / 255).toFixed(4)).join(' ')
}

// The official parchment tile, scaled to span a plate without a seam across it.
const PARCHMENT = { width: 222, height: 104.79, left: 6.5 }

function XBandFrame({ id, layout, parchment }: { id: string; layout: BandCard['layout']; parchment: string }) {
  const { mottle } = BODY[layout]
  const paper = publicAssetUrl(parchment)
  return (
    <svg className="scan-episode__frame" viewBox="0 0 235 374" aria-hidden="true">
      <defs>
        {(['title', 'panel'] as const).map((plate) => (
          <pattern
            key={plate}
            id={`${id}-${plate}`}
            patternUnits="userSpaceOnUse"
            x={PARCHMENT.left}
            y={plate === 'title' ? HEADER.top + PLATE : 201}
            width={PARCHMENT.width}
            height={PARCHMENT.height}
          >
            <image href={paper} width={PARCHMENT.width} height={PARCHMENT.height} preserveAspectRatio="none" />
          </pattern>
        ))}
        <filter id={`${id}-bevel`} x="0" y="0" width="235" height="374" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.3" result="height" />
          <feDiffuseLighting in="height" surfaceScale="2.5" diffuseConstant="1" lightingColor="#fff" result="light">
            <feDistantLight azimuth="250" elevation="30" />
          </feDiffuseLighting>
          <feComponentTransfer in="light" result="ramp">
            <feFuncR type="table" tableValues={ramp(layout, 0)} />
            <feFuncG type="table" tableValues={ramp(layout, 1)} />
            <feFuncB type="table" tableValues={ramp(layout, 2)} />
          </feComponentTransfer>
          <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="3" seed="4" />
          <feColorMatrix type="matrix" values="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 0 0 0 1" result="noise" />
          <feComposite in="ramp" in2="noise" operator="arithmetic" k2="1" k3={mottle} k4={-mottle / 2} result="paint" />
          <feComposite in="paint" in2="SourceAlpha" operator="in" />
        </filter>
        <filter id={`${id}-soft`} x="0" y="0" width="235" height="374" filterUnits="userSpaceOnUse">
          <feGaussianBlur stdDeviation="1.5" />
        </filter>
        {(['title', 'panel'] as const).map((plate) => (
          <clipPath key={plate} id={`${id}-${plate}-clip`}>
            <path d={PATHS[plate]} />
          </clipPath>
        ))}
      </defs>
      <g filter={`url(#${id}-bevel)`} fillRule="evenodd">
        <path d={`${PATHS.header} ${PATHS.title}`} />
        <path d={`${PATHS.window} ${PATHS.art}`} />
        <path d={`${PATHS.lower} ${PATHS.panel}`} />
      </g>
      {(['title', 'panel'] as const).map((plate) => (
        <g key={plate} clipPath={`url(#${id}-${plate}-clip)`}>
          <path d={PATHS[plate]} fill={`url(#${id}-${plate})`} />
          <path className="scan-episode__inset" d={PATHS[plate]} filter={`url(#${id}-soft)`} />
        </g>
      ))}
      <path className="scan-episode__outline" d={`${PATHS.title} ${PATHS.panel}`} />
      <path className="scan-episode__window" d={PATHS.art} />
      <path className="scan-episode__keyline" d={`${PATHS.header} ${PATHS.window} ${PATHS.lower}`} />
    </svg>
  )
}

export function XBandCard({ card, locale }: { card: BandCard; locale: Locale }) {
  return (
    <ScanPortrait locale={locale} cardId={card.id} label={card.name} layout={card.layout}>
      <div className="scan-episode" data-deck="X" data-layout={card.layout}>
        <img className="scan-stack-art" src={publicAssetUrl(card.art)} alt="" />
        <XBandFrame id={`scan-episode-${card.id}`} layout={card.layout} parchment={card.frame} />
        {card.overlay ? <img className="scan-stack-over" src={publicAssetUrl(card.overlay)} alt="" /> : null}
        <h3 className="scan-title">{card.name}</h3>
        <span className="scan-number">{card.number}</span>
        {card.bannerValue !== undefined ? <span className="card-score">{card.bannerValue}</span> : null}
        <ScanBadge deck={card.deck} />
        <ScanCategory category={card.category} />
        <div className="scan-copy">
          <ScanText text={card.text} />
        </div>
      </div>
    </ScanPortrait>
  )
}

export function SpaceMerchantCard({ card, locale }: { card: ScanSpaceMerchantCard; locale: Locale }) {
  return <XBandCard card={card} locale={locale} />
}

export function AlienEventCard({ card, locale }: { card: ScanAlienEventCard; locale: Locale }) {
  return <XBandCard card={card} locale={locale} />
}
