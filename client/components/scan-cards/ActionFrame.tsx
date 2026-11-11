import type { ReactNode } from 'react'
import type { ActionFrameBand } from './actionFrameRows'

export type { ActionFrameBand } from './actionFrameRows'

const FRAME = { width: 628, height: 769 }
const FACE_HEIGHT = (FRAME.width * 374) / 235

/** An image cut like the official frame (the frame itself, or a mask drawn on its pixels) stacked in the bands. */
export function ActionFrameBands({ href, bands }: { href: string; bands: readonly ActionFrameBand[] }) {
  return bands.map(([top, bottom, y, end], i) => {
    const overlap = i < bands.length - 1 ? 1 : 0
    const height = end - y + overlap
    const source = (bottom - top) * (height / (end - y))
    return (
      <svg key={top + '-' + y} x={0} y={y} width={FRAME.width} height={height} viewBox={`0 ${top} ${FRAME.width} ${source}`} preserveAspectRatio="none">
        <image href={href} width={FRAME.width} height={FRAME.height} />
      </svg>
    )
  })
}

/**
 * The official action frame re-stacked in horizontal bands on the face. Each band runs one pixel under the next
 * to keep the joins free of anti-aliasing gaps. Children draw over it in frame pixels.
 */
export function ActionFrame({ src, bands, className, children }: {
  src: string
  bands: readonly ActionFrameBand[]
  className: string
  children?: ReactNode
}) {
  return (
    <svg className={className} viewBox={`0 0 ${FRAME.width} ${FACE_HEIGHT}`} aria-hidden="true">
      <ActionFrameBands href={src} bands={bands} />
      {children}
    </svg>
  )
}
