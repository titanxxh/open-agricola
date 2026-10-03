// @vitest-environment jsdom

import { createElement } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ParentCardFace } from '../ParentCardFace'
import { parentCards } from '../../../../shared/parents'

afterEach(() => cleanup())

describe('ParentCardFace', () => {
  it('localizes the server completion infobox without changing the completed tier', () => {
    const { container, rerender } = render(<ParentCardFace id="PS01" locale="zh" infobox="Completed" completedTier={2} />)
    expect(container.querySelector('.parent-card-infobox')).toHaveTextContent('已完成')
    expect(container.querySelector('.parent-card-infobox')).not.toHaveTextContent('Completed')
    rerender(<ParentCardFace id="PS01" locale="en" infobox="Completed" completedTier={2} />)
    expect(container.querySelector('.parent-card-infobox')).toHaveTextContent('Completed')
  })

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

  it('localizes mother card chrome and rule text', () => {
    render(createElement(ParentCardFace, { id: 'PR10', locale: 'zh' }))

    expect(screen.getByRole('img', { name: '母亲 PR10' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '母亲 PR10' })).toBeInTheDocument()
    expect(screen.getByText('母亲')).toBeInTheDocument()
    expect(screen.getByText('第 1 回合')).toBeInTheDocument()
    expect(screen.getByText('获得 1 木材')).toBeInTheDocument()
    expect(screen.getByText('+0.7 分')).toBeInTheDocument()
    expect(screen.getByText(
      '在第 1 回合格上放置 1 木材。该回合开始时，获得这些资源。',
    )).toBeInTheDocument()
  })

  it('localizes father card chrome and rule summaries', () => {
    const { container } = render(createElement(ParentCardFace, { id: 'PS08', locale: 'zh' }))

    expect(screen.getByRole('img', { name: '父亲 PS08' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '父亲 PS08' })).toBeInTheDocument()
    expect(screen.getByText('父亲')).toBeInTheDocument()
    expect(container.querySelector('[data-kind="condition"]')?.textContent).toBe(
      '条件至多 7 / 5 / 3 个未使用农场格',
    )
    expect(container.querySelector('[data-kind="reward"]')?.textContent).toBe(
      '奖励获得 1 谷物 / 蔬菜 / 谷物和 1 蔬菜',
    )
  })

  it('localizes mother field and stable rewards in Chinese', () => {
    const { rerender } = render(createElement(ParentCardFace, { id: 'PR02', locale: 'zh' }))

    expect(screen.getByText('开垦 1 块田')).toBeInTheDocument()

    rerender(createElement(ParentCardFace, { id: 'PR01', locale: 'zh' }))
    expect(screen.getByText('建造 1 个畜栏')).toBeInTheDocument()
    expect(screen.getByText(/可以免费建造这些畜栏/)).toBeInTheDocument()
    expect(screen.getByText('-0.75 分')).toBeInTheDocument()
  })

  it.each(parentCards)('renders the complete rule text of $id in Chinese', (card) => {
    const { container } = render(<ParentCardFace id={card.id} locale="zh" />)
    const rules = container.querySelector('.parent-card-face__text, .parent-card-face__father-lines')
    expect(rules?.textContent).toMatch(/[\u4e00-\u9fff]/)
    expect(rules?.textContent).not.toMatch(/[a-z]/i)
  })

  it('keeps all three Chinese draw rewards and highlights the completed tier', () => {
    const { container } = render(<ParentCardFace id="PS03" locale="zh" completedTier={3} />)
    expect(container.querySelector('[data-kind="reward"]')).toHaveTextContent(
      '抽取 3 张小改良卡，保留 / 抽取 3 张职业卡，保留 / 分别抽取 3 张小改良卡和 3 张职业卡，各保留 1 张',
    )
    expect(container.querySelector('[data-kind="reward"] .is-completed')).toHaveTextContent(
      '分别抽取 3 张小改良卡和 3 张职业卡，各保留',
    )
  })

  it('preserves the completed tier highlights in Chinese', () => {
    const { container } = render(<ParentCardFace id="PS01" locale="zh" completedTier={2} />)
    expect(Array.from(container.querySelectorAll('.is-completed'), (element) => element.textContent))
      .toEqual(['3', '2'])
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
