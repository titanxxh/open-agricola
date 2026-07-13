// @vitest-environment jsdom

import { createElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ParentCardFace } from '../ParentCardFace'

afterEach(() => cleanup())

describe('ParentCardFace', () => {
  it('preserves mother and father card chrome and rule text in English', () => {
    const { container, rerender } = render(createElement(ParentCardFace, {
      id: 'PR10',
      locale: 'en',
    }))

    expect(screen.getByRole('img', { name: 'Mother PR10' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Mother PR10' })).toBeInTheDocument()
    expect(screen.getByText('mother')).toBeInTheDocument()
    expect(screen.getByText('Round 1')).toBeInTheDocument()
    expect(screen.getByText('Gain 1 Wood')).toBeInTheDocument()
    expect(screen.getByText('+0.7 VP')).toBeInTheDocument()
    expect(screen.getByText(
      'Place 1 wood on round space 1. At the start of that round, you get the wood.',
    )).toBeInTheDocument()

    rerender(createElement(ParentCardFace, { id: 'PS08', locale: 'en' }))

    expect(screen.getByRole('img', { name: 'Father PS08' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Father PS08' })).toBeInTheDocument()
    expect(screen.getByText('father')).toBeInTheDocument()
    expect(container.querySelector('[data-kind="condition"]')?.textContent).toBe(
      'Reqat most 7 / 5 / 3 unused farmyard spaces left',
    )
    expect(container.querySelector('[data-kind="reward"]')?.textContent).toBe(
      'Rewardget 1 grain / 1 vegetable / both 1 grain and 1 vegetable',
    )
  })

  it('localizes mother card chrome while preserving the English rule text', () => {
    render(createElement(ParentCardFace, { id: 'PR10', locale: 'zh' }))

    expect(screen.getByRole('img', { name: '母亲 PR10' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '母亲 PR10' })).toBeInTheDocument()
    expect(screen.getByText('母亲')).toBeInTheDocument()
    expect(screen.getByText('第 1 回合')).toBeInTheDocument()
    expect(screen.getByText('获得 1 木材')).toBeInTheDocument()
    expect(screen.getByText('+0.7 分')).toBeInTheDocument()
    expect(screen.getByText(
      'Place 1 wood on round space 1. At the start of that round, you get the wood.',
    )).toBeInTheDocument()
  })

  it('localizes father card chrome while preserving the English rule summaries', () => {
    const { container } = render(createElement(ParentCardFace, { id: 'PS08', locale: 'zh' }))

    expect(screen.getByRole('img', { name: '父亲 PS08' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '父亲 PS08' })).toBeInTheDocument()
    expect(screen.getByText('父亲')).toBeInTheDocument()
    expect(container.querySelector('[data-kind="condition"]')?.textContent).toBe(
      '条件at most 7 / 5 / 3 unused farmyard spaces left',
    )
    expect(container.querySelector('[data-kind="reward"]')?.textContent).toBe(
      '奖励get 1 grain / 1 vegetable / both 1 grain and 1 vegetable',
    )
  })

  it('localizes mother field and stable rewards in Chinese', () => {
    const { rerender } = render(createElement(ParentCardFace, { id: 'PR02', locale: 'zh' }))

    expect(screen.getByText('开垦 1 块田')).toBeInTheDocument()

    rerender(createElement(ParentCardFace, { id: 'PR01', locale: 'zh' }))
    expect(screen.getByText('建造 1 个畜栏')).toBeInTheDocument()
  })

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
