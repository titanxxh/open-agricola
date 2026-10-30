import { describe, expect, it } from 'vitest'
import { cardTextIconNameKeys, cardTextIconTokens, searchableCardText } from '../card-text-icons'

describe('card text icon semantics', () => {
  it('finds the icon tokens printed in card text, in order', () => {
    expect(cardTextIconTokens('Pay 1 <WOOD>: <PIG> <ARROW> 2<FOOD> and <GRAIN_VEG_STACK>')).toEqual(['WOOD', 'PIG', 'ARROW', 'FOOD', 'GRAIN_VEG_STACK'])
  })

  it('names each icon by its existing resource, terrain or action name', () => {
    expect(cardTextIconNameKeys('WOOD')).toEqual(['resources.wood'])
    expect(cardTextIconNameKeys('PIG')).toEqual(['resources.boar'])
    expect(cardTextIconNameKeys('STABLE')).toEqual(['resources.stable'])
    expect(cardTextIconNameKeys('FIELD')).toEqual(['ui.ruleTerrain.field'])
    expect(cardTextIconNameKeys('FOREST')).toEqual(['ui.tileForest'])
    expect(cardTextIconNameKeys('MOOR')).toEqual(['ui.tileMoor'])
    expect(cardTextIconNameKeys('SCORE')).toEqual(['ui.encyclopedia.icons.score'])
    expect(cardTextIconNameKeys('BAKE')).toEqual(['actions.bake-bread.name'])
    expect(cardTextIconNameKeys('GRAIN_VEG_STACK')).toEqual(['resources.grain', 'resources.vegetable'])
  })

  it('gives typography arrows no words and does not recognise unknown tokens', () => {
    expect(cardTextIconNameKeys('ARROW')).toEqual([])
    expect(cardTextIconNameKeys('ARROW-1X')).toEqual([])
    expect(cardTextIconNameKeys('DRAGON')).toBeUndefined()
    expect(cardTextIconNameKeys('constructor')).toBeUndefined()
  })

  it('turns card markup into plain searchable words', () => {
    const names: Record<string, string> = { VEGETABLE: 'Vegetable', FOOD: 'Food', GRAIN: 'Grain' }
    expect(searchableCardText('[Anytime]\n<VEGETABLE> <ARROW> 2<FOOD>\n[__Bake Bread__ action:]  <GRAIN>', (token) => names[token] ?? ''))
      .toBe('Anytime Vegetable 2 Food Bake Bread action: Grain')
    expect(searchableCardText('Build __Joinery__ and __Basketmaker', () => '')).toBe('Build Joinery and Basketmaker')
    expect(searchableCardText('Wood >= Current Round', () => '')).toBe('Wood >= Current Round')
  })

  it('refuses text with an icon it cannot name', () => {
    expect(() => searchableCardText('Gain 1 <DRAGON>', () => 'x')).toThrow('DRAGON')
  })
})
