// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PlayerCard } from '../PlayerCard'

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html')
const costItems = (html: string) => [...parse(html).querySelectorAll('.card-cost-item')]
  .map(item => ({
    amount: Number(item.textContent?.trim()),
    icon: [...(item.querySelector('.res-icon')?.classList ?? [])].find(name => name.startsWith('res-icon-')),
  }))

describe.each(['en', 'zh'] as const)('PlayerCard printed costs in %s', locale => {
  it.each([
    ['A009_YoungAnimalMarket', [{ amount: 1, icon: 'res-icon-sheep' }]],
    ['D009_GameTrade', [{ amount: 2, icon: 'res-icon-sheep' }]],
    ['E021_SheepRug', [{ amount: 1, icon: 'res-icon-sheep' }]],
    ['M032_PeatHut', [{ amount: 2, icon: 'res-icon-reed' }, { amount: 5, icon: 'res-icon-fuel' }]],
    ['M059_NaturesFertilizer', [{ amount: 2, icon: 'res-icon-vegetable' }, { amount: 1, icon: 'res-icon-boar' }]],
    ['M073_StockBreedingPrize', [{ amount: 1, icon: 'res-icon-sheep' }]],
    ['M108_GrainDistillery', [{ amount: 2, icon: 'res-icon-stone' }, { amount: 1, icon: 'res-icon-sheep' }]],
  ] as const)('shows the full printed cost of %s', (cardId, expected) => {
    const html = renderToStaticMarkup(<PlayerCard locale={locale} cardId={cardId} cardType="minor" />)
    expect(costItems(html)).toEqual(expected)
  })

  it('shows cattle and horse costs while omitting zero resources', () => {
    const html = renderToStaticMarkup(<PlayerCard locale={locale} cardId="CUSTOM_AnimalCost" cardType="minor"
      cardMeta={{ id: 'CUSTOM_AnimalCost', name: 'Animal cost', deck: 'CUSTOM', number: 1,
        cost: { cattle: 2, horse: 1, sheep: 0, fuel: 0 } }} />)
    expect(costItems(html)).toEqual([{ amount: 2, icon: 'res-icon-cattle' }, { amount: 1, icon: 'res-icon-horse' }])
  })

  it('shows animals and fuel in alternative costs', () => {
    const html = renderToStaticMarkup(<PlayerCard locale={locale} cardId="CUSTOM_AlternativeCost" cardType="minor"
      cardMeta={{ id: 'CUSTOM_AlternativeCost', name: 'Alternative cost', deck: 'CUSTOM', number: 2,
        altCosts: [{ sheep: 1 }, { fuel: 2 }] }} />)
    const doc = parse(html)
    expect(costItems(html)).toEqual([{ amount: 1, icon: 'res-icon-sheep' }, { amount: 2, icon: 'res-icon-fuel' }])
    expect(doc.querySelector('.card-cost-separator')?.textContent).toBe('/')
  })
})
