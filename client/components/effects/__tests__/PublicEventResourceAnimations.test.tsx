// @vitest-environment jsdom

import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PublicEventResourceAnimation } from '../../../app/public-event-notifications'
import { PublicEventResourceAnimations } from '../PublicEventResourceAnimations'

const rect = (left: number, top: number) => ({
  left,
  top,
  right: left + 20,
  bottom: top + 20,
  width: 20,
  height: 20,
  x: left,
  y: top,
  toJSON: () => ({}),
}) as DOMRect

const moveAnimation = (toPlayerId = 'p1'): PublicEventResourceAnimation => ({
  id: 'anim-1',
  kind: 'move',
  resources: { wood: 2 },
  from: { kind: 'actionSpace', actionId: 'forest' },
  to: { kind: 'playerResources', playerId: toPlayerId },
})

const farmAnimation = (toPlayerId = 'p1'): PublicEventResourceAnimation => ({
  id: 'farm-1',
  kind: 'move',
  resources: { grain: 1 },
  from: { kind: 'supply' },
  to: { kind: 'farmTile', playerId: toPlayerId, key: '1-2' },
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PublicEventResourceAnimations', () => {
  it('shows a minus for payments and exchanges leaving the player resources', () => {
    const animations: PublicEventResourceAnimation[] = [
      { id: 'payment', kind: 'payment', resources: { wood: 1 }, from: { kind: 'playerResources', playerId: 'p1' }, to: { kind: 'supply' } },
      { id: 'exchange-pay', kind: 'exchange', resources: { grain: 2 }, from: { kind: 'playerResources', playerId: 'p1' }, to: { kind: 'supply' } },
      { id: 'exchange-gain', kind: 'exchange', resources: { food: 4 }, from: { kind: 'supply' }, to: { kind: 'playerResources', playerId: 'p1' } },
    ]
    render(<><div className="player-resources-compact" data-player-resource-anchor="p1" />
      <PublicEventResourceAnimations animations={animations} displayPlayerId="p1" locale="zh" /></>)
    expect(screen.getByTestId('public-event-resource-animation-payment')).toHaveTextContent('−1')
    expect(screen.getByTestId('public-event-resource-animation-exchange-pay')).toHaveTextContent('−2')
    expect(screen.getByTestId('public-event-resource-animation-exchange-gain')).toHaveTextContent('+4')
  })

  it('renders visible animation chips for resolvable action and player anchors', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const element = this as HTMLElement
      if (element.classList.contains('public-event-resource-animation-layer')) return rect(0, 0)
      if (element.dataset.actionId === 'forest') return rect(100, 120)
      if (element.dataset.playerResourceAnchor === 'p1') return rect(300, 320)
      if (element.dataset.publicEventSupplyAnchor !== undefined) return rect(500, 80)
      return rect(0, 0)
    })

    render(
      <>
        <div className="action-card-holder" data-action-id="forest" />
        <div className="player-resources-compact" data-player-resource-anchor="p1" />
        <PublicEventResourceAnimations animations={[moveAnimation()]} displayPlayerId="p1" locale="en" />
      </>,
    )

    expect(screen.getByTestId('public-event-resource-animation-anim-1')).toHaveAttribute('data-kind', 'move')
    expect(screen.getByTestId('public-event-resource-animation-anim-1')).toHaveAttribute('data-from-kind', 'actionSpace')
    expect(screen.getByTestId('public-event-resource-animation-anim-1')).toHaveStyle({
      '--from-x': '110px',
      '--from-y': '130px',
      '--to-x': '310px',
      '--to-y': '330px',
    })
    expect(screen.getByText('+2')).toBeTruthy()
  })

  it('filters out other players player-resource endpoints', () => {
    render(
      <>
        <div className="action-card-holder" data-action-id="forest" />
        <div className="player-resources-compact" data-player-resource-anchor="p2" />
        <PublicEventResourceAnimations animations={[moveAnimation('p2')]} displayPlayerId="p1" locale="en" />
      </>,
    )

    expect(screen.queryByTestId('public-event-resource-animation-anim-1')).toBeNull()
  })

  it('filters out other players farm tile endpoints', () => {
    render(
      <>
        <div className="farm-tile" data-farm-tile-key="1-2" data-farm-tile-player="p2" />
        <PublicEventResourceAnimations animations={[farmAnimation('p2')]} displayPlayerId="p1" locale="en" />
      </>,
    )

    expect(screen.queryByTestId('public-event-resource-animation-farm-1')).toBeNull()
  })

  it('renders supply endpoint anchor for payment animations', () => {
    render(
      <PublicEventResourceAnimations
        animations={[{
          id: 'pay-1',
          kind: 'payment',
          resources: { clay: 1 },
          from: { kind: 'playerResources', playerId: 'p1' },
          to: { kind: 'supply' },
        }]}
        displayPlayerId="p1"
        locale="en"
      />,
    )

    expect(screen.getByTestId('public-event-supply-anchor')).toHaveAttribute('data-public-event-supply-anchor')
  })
})
