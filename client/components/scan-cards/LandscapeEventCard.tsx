import { useRef, type CSSProperties } from 'react'
import { t, type Locale } from '../../../shared/i18n'
import { LANDSCAPE_FRAME_PARTS, type ScanEventCard } from '../../../shared/scan-cards'
import { useElementWidth } from '../../hooks/useElementWidth'
import { publicAssetUrl } from '../../utils/public-asset-url'
import { roundedPath } from './framePath'
import { ScanText } from './ScanText'
import { ScanCategory } from './ScanFrame'

// Under the art the face is one gold plate on white stock: the title band, whose rim runs down both
// sides and along the foot around a sunken linen panel. Edges are in face pixels on a 420 x 262.5
// face; strokes sit on the printed lines.
const OUTER = { left: 1.6, right: 418.35, top: 73.25, bottom: 259.85, radius: 16 }
const PANEL = { left: 7, right: 413.2, top: 112.8, bottom: 254.5 }
const PATHS = {
  outer: roundedPath([
    [OUTER.left, OUTER.top, OUTER.radius],
    [OUTER.right, OUTER.top, OUTER.radius],
    [OUTER.right, OUTER.bottom, OUTER.radius],
    [OUTER.left, OUTER.bottom, OUTER.radius],
  ]),
  panel: roundedPath([
    [PANEL.left, PANEL.top, 12.2],
    [PANEL.right, PANEL.top, 10.8],
    [PANEL.right, PANEL.bottom, 11.3],
    [PANEL.left, PANEL.bottom, 10.2],
  ]),
}

// The plate is brightest under the title and darkens to bronze in the lower corners.
const GOLD = { side: 'rgb(198 176 94)', centre: 'rgb(240 228 121)', bronze: 'rgb(120 98 63)' }
// The occupation slice of card_frames.jpg, cropped to its mottled body and spread over the plate.
const MOTTLE = { x: 1285, y: 545, width: 590, height: 440, scale: 0.72 }
// The official parchment tile at the scale of the printed linen.
const LINEN = { width: 243.1, height: 114.76 }
// The offspring sprig in both lower corners of the linen, mirrored on the right; the weave is left out
// in a thin ring around it.
const SPRIG = { width: 34.29, height: 45.9, left: 10.5, leftTop: 205.9, right: 409.89, rightTop: 204.8 }
const SPRIG_TONE = 'rgb(230 234 223)'
const SPRIG_HALO = { colour: 'rgb(232 228 160)', opacity: 0.3, grow: 0.8, soften: 0.4 }
// Light from the upper right: how far a slope facing away darkens each channel, and how far one facing
// it is screened towards white. The shine is raised to a power so only the steepest lit slopes catch it.
const SHADE = [0.62, 0.59, 0.4] as const
const SHINE = { amount: 0.6, power: 4 }
const shine = {
  amplitude: SHINE.amount / (1 - 0.5 ** SHINE.power),
  offset: (-SHINE.amount * 0.5 ** SHINE.power) / (1 - 0.5 ** SHINE.power),
}

function LandscapeEventFrame({ id, paper }: { id: string; paper: string }) {
  const sprig = publicAssetUrl(LANDSCAPE_FRAME_PARTS.sprig)
  return (
    <svg className="scan-event__frame" viewBox="0 0 420 262.5" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-gold`} gradientUnits="userSpaceOnUse" x1="0" x2="420" y1="0" y2="0">
          <stop offset="0.262" stopColor={GOLD.side} />
          <stop offset="0.5" stopColor={GOLD.centre} />
          <stop offset="0.738" stopColor={GOLD.side} />
        </linearGradient>
        {([0, 420] as const).map((x) => (
          <radialGradient
            key={x}
            id={`${id}-bronze-${x}`}
            gradientUnits="userSpaceOnUse"
            cx="0"
            cy="0"
            r="1"
            gradientTransform={`translate(${x} 262.5) scale(104 62)`}
          >
            <stop offset="0.54" stopColor={GOLD.bronze} />
            <stop offset="1" stopColor={GOLD.bronze} stopOpacity="0" />
          </radialGradient>
        ))}
        <pattern id={`${id}-paper`} patternUnits="userSpaceOnUse" x={PANEL.left} y={PANEL.top} width={LINEN.width} height={LINEN.height}>
          <image href={publicAssetUrl(paper)} width={LINEN.width} height={LINEN.height} preserveAspectRatio="none" />
        </pattern>
        <clipPath id={`${id}-plate`}>
          <path d={`${PATHS.outer} ${PATHS.panel}`} clipRule="evenodd" />
        </clipPath>
        <clipPath id={`${id}-panel`}>
          <path d={PATHS.panel} />
        </clipPath>
        <filter id={`${id}-mottle`} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="0.105 0.205 0.04 0 0.283 0.105 0.205 0.04 0 0.283 0.105 0.205 0.04 0 0.283 0 0 0 1 0" />
        </filter>
        <filter id={`${id}-bevel`} x="0" y="0" width="420" height="262.5" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          {/* A sharp edge for the strong shading next to the lines, a wider one for its tail. */}
          <feGaussianBlur in="SourceAlpha" stdDeviation="0.5" result="edge" />
          <feGaussianBlur in="SourceAlpha" stdDeviation="1.2" result="tail" />
          <feComposite in="edge" in2="tail" operator="arithmetic" k2="0.7" k3="0.3" result="height" />
          <feDiffuseLighting in="height" surfaceScale="3" diffuseConstant="1" lightingColor="#fff" result="light">
            <feDistantLight azimuth="320" elevation="30" />
          </feDiffuseLighting>
          <feComponentTransfer in="light" result="shade">
            <feFuncR type="linear" slope={2 * SHADE[0]} intercept={1 - SHADE[0]} />
            <feFuncG type="linear" slope={2 * SHADE[1]} intercept={1 - SHADE[1]} />
            <feFuncB type="linear" slope={2 * SHADE[2]} intercept={1 - SHADE[2]} />
          </feComponentTransfer>
          <feComponentTransfer in="light" result="shine">
            <feFuncR type="gamma" amplitude={shine.amplitude} exponent={SHINE.power} offset={shine.offset} />
            <feFuncG type="gamma" amplitude={shine.amplitude} exponent={SHINE.power} offset={shine.offset} />
            <feFuncB type="gamma" amplitude={shine.amplitude} exponent={SHINE.power} offset={shine.offset} />
          </feComponentTransfer>
          <feBlend in="SourceGraphic" in2="shade" mode="multiply" result="shaded" />
          <feBlend in="shaded" in2="shine" mode="screen" />
          <feComposite in2="SourceAlpha" operator="in" />
        </filter>
        <filter id={`${id}-paper-tint`} colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 0.94 0 0 0 0 0 1 0" />
        </filter>
        <filter id={`${id}-soft`} x="0" y="0" width="420" height="262.5" filterUnits="userSpaceOnUse">
          <feGaussianBlur stdDeviation="1.5" />
        </filter>
        <filter id={`${id}-sprig-halo`} x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
          <feMorphology in="SourceAlpha" operator="dilate" radius={SPRIG_HALO.grow} />
          <feGaussianBlur stdDeviation={SPRIG_HALO.soften} />
          <feComposite in2="SourceAlpha" operator="out" result="ring" />
          <feFlood floodColor={SPRIG_HALO.colour} floodOpacity={SPRIG_HALO.opacity} />
          <feComposite in2="ring" operator="in" />
        </filter>
        <filter id={`${id}-sprig-tone`} colorInterpolationFilters="sRGB">
          <feFlood floodColor={SPRIG_TONE} />
          <feComposite in2="SourceAlpha" operator="in" />
        </filter>
      </defs>
      <g filter={`url(#${id}-bevel)`}>
        <g clipPath={`url(#${id}-plate)`}>
          <rect y="60" width="420" height="202.5" fill={`url(#${id}-gold)`} />
          <rect y="60" width="420" height="202.5" fill={`url(#${id}-bronze-0)`} />
          <rect y="60" width="420" height="202.5" fill={`url(#${id}-bronze-420)`} />
          <svg
            className="scan-event__mottle"
            x={-2.4}
            y={OUTER.top - 1}
            width={MOTTLE.width * MOTTLE.scale}
            height={MOTTLE.height * MOTTLE.scale}
            viewBox={`${MOTTLE.x} ${MOTTLE.y} ${MOTTLE.width} ${MOTTLE.height}`}
            preserveAspectRatio="none"
          >
            <image href={publicAssetUrl(LANDSCAPE_FRAME_PARTS.gold)} width="1896" height="1006" filter={`url(#${id}-mottle)`} />
          </svg>
        </g>
      </g>
      <path d={PATHS.panel} fill={`url(#${id}-paper)`} filter={`url(#${id}-paper-tint)`} />
      {(['halo', 'tone'] as const).map((layer) => (
        <g key={layer} className={`scan-event__sprig scan-event__sprig--${layer}`} filter={`url(#${id}-sprig-${layer})`}>
          <image href={sprig} x={SPRIG.left} y={SPRIG.leftTop} width={SPRIG.width} height={SPRIG.height} preserveAspectRatio="none" />
          <image
            href={sprig}
            transform={`translate(${SPRIG.right} 0) scale(-1 1)`}
            y={SPRIG.rightTop}
            width={SPRIG.width}
            height={SPRIG.height}
            preserveAspectRatio="none"
          />
        </g>
      ))}
      <g clipPath={`url(#${id}-panel)`}>
        <path className="scan-event__inset" d={PATHS.panel} filter={`url(#${id}-soft)`} />
      </g>
      <path className="scan-event__line" d={`${PATHS.outer} ${PATHS.panel}`} />
    </svg>
  )
}

export function LandscapeEventCard({ card, locale }: { card: ScanEventCard; locale: Locale }) {
  const rootRef = useRef<HTMLElement>(null)
  const measuredWidth = useElementWidth(rootRef, !globalThis.CSS?.supports?.('transform', 'scale(calc(100cqi / 420px))'))
  const sizingStyle: CSSProperties & { '--card-content-scale'?: number } = {
    '--card-content-scale': measuredWidth !== undefined ? measuredWidth / 420 : undefined,
  }
  return (
    <article
      ref={rootRef}
      className="scan-event"
      style={sizingStyle}
      data-card-id={card.id}
      data-layout="landscape-event"
      role="group"
      aria-label={card.name}
    >
      <div className="scan-event__face">
        <img className="scan-stack-art" src={publicAssetUrl(card.art)} alt="" />
        <LandscapeEventFrame id={`scan-event-${card.id}`} paper={card.frame} />
        <img className="scan-event__scroll" src={publicAssetUrl(LANDSCAPE_FRAME_PARTS.scroll)} alt="" />
        <img className="scan-event__scroll scan-event__scroll--mirror" src={publicAssetUrl(LANDSCAPE_FRAME_PARTS.scroll)} alt="" />
        {card.overlay ? <img className="scan-stack-over" src={publicAssetUrl(card.overlay)} alt="" /> : null}
        <span className="scan-number">{card.number}</span>
        <h3 className="scan-title">{card.name}</h3>
        <ScanCategory category={card.category} />
        <div className="scan-event-body">
          <ScanText text={card.text} />
          <p className="scan-event-footer">{t(locale, 'ui.encyclopedia.scanFace.globalEventFooter')}</p>
        </div>
      </div>
    </article>
  )
}
