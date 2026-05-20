import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { resourceKeyList } from '../../../shared/contract/state-constants'
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import type {
  PublicEventResourceAnimation,
  PublicEventResourceAnimationEndpoint,
} from '../../app/public-event-notifications'

type PositionedAnimation = {
  animation: PublicEventResourceAnimation
  style: CSSProperties
}

const isVisibleEndpoint = (endpoint: PublicEventResourceAnimationEndpoint, displayPlayerId: string): boolean => {
  if (endpoint.kind === 'playerResources') return endpoint.playerId === displayPlayerId
  if (endpoint.kind === 'farmTile') return endpoint.playerId === displayPlayerId
  return true
}

const findAnchor = (endpoint: PublicEventResourceAnimationEndpoint): HTMLElement | null => {
  if (endpoint.kind === 'supply') {
    return document.querySelector<HTMLElement>('[data-public-event-supply-anchor]')
  }
  if (endpoint.kind === 'actionSpace') {
    return Array.from(document.querySelectorAll<HTMLElement>('.action-card-holder[data-action-id]'))
      .find((element) => element.dataset.actionId === endpoint.actionId) ?? null
  }
  if (endpoint.kind === 'playerResources') {
    return Array.from(document.querySelectorAll<HTMLElement>('.player-resources-compact[data-player-resource-anchor]'))
      .find((element) => element.dataset.playerResourceAnchor === endpoint.playerId) ?? null
  }
  return Array.from(document.querySelectorAll<HTMLElement>('.farm-tile[data-farm-tile-key]'))
    .find((element) =>
      element.dataset.farmTileKey === endpoint.key &&
      element.dataset.farmTilePlayer === endpoint.playerId,
    ) ?? null
}

const centerOf = (rect: DOMRect, rootRect: DOMRect) => ({
  x: rect.left + rect.width / 2 - rootRect.left,
  y: rect.top + rect.height / 2 - rootRect.top,
})

const resourcesForDisplay = (animation: PublicEventResourceAnimation) =>
  resourceKeyList
    .map((key) => ({ key, amount: animation.resources[key] ?? 0 }))
    .filter((entry) => entry.amount > 0)
    .slice(0, 3)

export const PublicEventResourceAnimations = ({
  animations,
  displayPlayerId,
  locale,
}: {
  animations: readonly PublicEventResourceAnimation[]
  displayPlayerId: string
  locale: Locale
}) => {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const visibleAnimations = useMemo(
    () => animations.filter((animation) =>
      isVisibleEndpoint(animation.from, displayPlayerId) &&
      isVisibleEndpoint(animation.to, displayPlayerId),
    ),
    [animations, displayPlayerId],
  )
  const [positioned, setPositioned] = useState<PositionedAnimation[]>([])

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return
    const rootRect = root.getBoundingClientRect()
    const next: PositionedAnimation[] = []
    for (const animation of visibleAnimations) {
      const from = findAnchor(animation.from)
      const to = findAnchor(animation.to)
      if (!from || !to) continue
      const fromCenter = centerOf(from.getBoundingClientRect(), rootRect)
      const toCenter = centerOf(to.getBoundingClientRect(), rootRect)
      next.push({
        animation,
        style: {
          '--from-x': `${fromCenter.x}px`,
          '--from-y': `${fromCenter.y}px`,
          '--to-x': `${toCenter.x}px`,
          '--to-y': `${toCenter.y}px`,
        } as CSSProperties,
      })
    }
    setPositioned(next)
  }, [visibleAnimations])

  return (
    <div className="public-event-resource-animation-layer" ref={rootRef} aria-hidden="true">
      <span
        className="public-event-supply-anchor"
        data-public-event-supply-anchor
        data-testid="public-event-supply-anchor"
      />
      {positioned.map(({ animation, style }) => (
        <div
          key={animation.id}
          className="public-event-resource-animation"
          data-testid={`public-event-resource-animation-${animation.id}`}
          data-kind={animation.kind}
          data-from-kind={animation.from.kind}
          data-to-kind={animation.to.kind}
          style={style}
        >
          {resourcesForDisplay(animation).map(({ key, amount }) => (
            <span key={key} className={`resource-chip resource-${key}`} title={t(locale, `resources.${key}`)}>
              <span className={`res-icon res-icon-${key}`} />
              <span className="resource-chip-count">+{amount}</span>
            </span>
          ))}
        </div>
      ))}
    </div>
  )
}
