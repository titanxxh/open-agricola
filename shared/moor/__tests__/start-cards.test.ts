import { describe, expect, it } from 'vitest'
import { moorStartCards } from '../start-cards'

const terrainKeys = (id: string) => {
  const card = moorStartCards.find((candidate) => candidate.id === id)
  if (!card) throw new Error(`missing ${id}`)
  return card.terrain
    .map((tile) => `${tile.kind}:${tile.row},${tile.col}`)
    .sort()
}

describe('Farmers of the Moor start cards', () => {
  it('uses game coordinates with rooms in the lower-left corner', () => {
    expect(Object.fromEntries(moorStartCards.map((card) => [card.id, terrainKeys(card.id)]))).toEqual({
      'moor-start-1': [
        'forest:0,3',
        'forest:1,2',
        'forest:1,3',
        'forest:2,3',
        'forest:2,4',
        'moor:0,0',
        'moor:0,1',
        'moor:1,1',
      ],
      'moor-start-2': [
        'forest:0,1',
        'forest:0,2',
        'forest:0,3',
        'forest:2,3',
        'forest:2,4',
        'moor:1,1',
        'moor:1,2',
        'moor:2,1',
      ],
      'moor-start-3': [
        'forest:0,2',
        'forest:0,3',
        'forest:0,4',
        'forest:1,4',
        'forest:2,4',
        'moor:1,2',
        'moor:2,1',
        'moor:2,2',
      ],
      'moor-start-4': [
        'forest:0,1',
        'forest:1,1',
        'forest:1,3',
        'forest:2,1',
        'forest:2,3',
        'moor:0,3',
        'moor:0,4',
        'moor:1,4',
      ],
      'moor-start-5': [
        'forest:0,3',
        'forest:0,4',
        'forest:1,4',
        'forest:2,3',
        'forest:2,4',
        'moor:1,1',
        'moor:1,2',
        'moor:1,3',
      ],
      'moor-start-6': [
        'forest:0,0',
        'forest:0,1',
        'forest:0,4',
        'forest:1,4',
        'forest:2,4',
        'moor:0,2',
        'moor:0,3',
        'moor:1,3',
      ],
      'moor-start-7': [
        'forest:0,1',
        'forest:1,1',
        'forest:1,4',
        'forest:2,3',
        'forest:2,4',
        'moor:0,2',
        'moor:1,2',
        'moor:2,2',
      ],
      'moor-start-8': [
        'forest:0,4',
        'forest:1,1',
        'forest:1,4',
        'forest:2,1',
        'forest:2,2',
        'moor:1,2',
        'moor:1,3',
        'moor:2,3',
      ],
      'moor-start-9': [
        'forest:0,0',
        'forest:0,1',
        'forest:1,1',
        'forest:2,1',
        'forest:2,2',
        'moor:0,2',
        'moor:1,2',
        'moor:1,3',
      ],
    })
  })
})
