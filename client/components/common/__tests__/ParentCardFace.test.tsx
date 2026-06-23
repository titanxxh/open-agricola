// @vitest-environment jsdom

import { createElement } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ParentCardFace } from '../ParentCardFace'

afterEach(() => cleanup())

describe('ParentCardFace', () => {
  it('renders father requirements and rewards as compact slash summaries', () => {
    const { container } = render(createElement(ParentCardFace, { id: 'PS08' }))

    const conditionLine = container.querySelector('[data-kind="condition"]')
    const rewardLine = container.querySelector('[data-kind="reward"]')

    expect(conditionLine?.textContent).toContain('at most 7 / 5 / 3 unused farmyard spaces left')
    expect(rewardLine?.textContent).toContain('get 1 grain / 1 vegetable / both 1 grain and 1 vegetable')
    expect(container.querySelectorAll('.parent-card-face__reward')).toHaveLength(0)
  })

  it('marks the completed father tier segment in both summary lines', () => {
    const { container } = render(createElement(ParentCardFace, {
      id: 'PS01',
      completedTier: 2,
    }))

    const completedSegments = Array.from(
      container.querySelectorAll('.parent-card-face__slash-segment.is-completed'),
    ).map((element) => element.textContent)

    expect(completedSegments).toEqual(['3', '2'])
  })
})
