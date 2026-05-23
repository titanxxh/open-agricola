// @vitest-environment jsdom

import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CardPassedEvent } from '../../../../shared/contract/events'
import { PublicEventCardPassAnimation } from '../PublicEventCardPassAnimation'

const rect = (left: number, top: number, width = 50, height = 50) => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
  width,
  height,
  x: left,
  y: top,
  toJSON: () => ({}),
}) as DOMRect

const makeEvent = (overrides: Partial<CardPassedEvent> = {}): CardPassedEvent => ({
  type: 'card.passed',
  schemaVersion: 1,
  id: 'evt-1',
  seq: 1,
  round: 1,
  phase: 'work',
  visibility: 'public',
  cardId: 'A1_Shelter',
  fromPlayerId: 'p1',
  toPlayerId: 'p2',
  ...overrides,
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PublicEventCardPassAnimation', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('两个 anchor 都存在时渲染 overlay 并设置 CSS 变量', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const el = this as HTMLElement
      if (el.dataset.cardAnchor === 'A1_Shelter') return rect(10, 20)
      if (el.dataset.handAnchor === 'p2') return rect(200, 300)
      return rect(0, 0)
    })

    const fromCardEl = document.createElement('div')
    fromCardEl.dataset.cardAnchor = 'A1_Shelter'
    document.body.appendChild(fromCardEl)

    const toHandEl = document.createElement('div')
    toHandEl.dataset.handAnchor = 'p2'
    document.body.appendChild(toHandEl)

    const { container } = render(<PublicEventCardPassAnimation events={[makeEvent()]} />)

    const overlay = container.querySelector('.card-pass-overlay') as HTMLElement | null
    expect(overlay).not.toBeNull()
    expect(overlay!.style.getPropertyValue('--to-x')).toMatch(/px$/)
    expect(overlay!.style.getPropertyValue('--from-x')).toMatch(/px$/)
  })

  it('缺失 anchor 时不渲染 overlay', () => {
    const { container } = render(
      <PublicEventCardPassAnimation events={[makeEvent({ id: 'evt-2' })]} />,
    )
    expect(container.querySelector('.card-pass-overlay')).toBeNull()
  })
})
