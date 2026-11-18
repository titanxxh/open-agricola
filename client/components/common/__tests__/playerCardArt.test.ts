import { describe, expect, it } from 'vitest'
import requiredPublicAssetList from '../../../../public-assets.required.json'
import { classicCardArtPath, officialCardArtPath } from '../playerCardArt'

const requiredPublicAssets = new Set(requiredPublicAssetList.files)

/** Card IDs of every classic card source, `shared/cards/classic/<deck>/<id>.ts`; modules are not loaded. */
const classicCardIds = Object.keys(import.meta.glob('/shared/cards/classic/*/*.ts'))
  .map((path) => path.slice(path.lastIndexOf('/') + 1, -'.ts'.length))

describe('classic card art', () => {
  it.each([
    ['CE203_Shepherd', 'occupation', '/assets/classic/CE/CE203.png'],
    ['CI097_Slaughterhouse', 'minor', '/assets/classic/CI/CI097.png'],
    ['CWM001_Example', 'minor', '/assets/classic/CWM/CWM001.png'],
    ['CC024_Example', 'occupation', '/assets/classic/CC/CC024.png'],
  ] as const)('maps %s to its classic face', (cardId, cardType, path) => {
    expect(classicCardArtPath(cardId)).toBe(path)
    expect(officialCardArtPath(cardId, cardType)).toBe(path)
  })

  it('keeps revised and Moor card art unchanged', () => {
    expect(classicCardArtPath('C112_Thresher')).toBeUndefined()
    expect(officialCardArtPath('C112_Thresher', 'occupation')).toBe('/assets/revised/deckC/C112.png')
    expect(officialCardArtPath('E001_PoleBarns', 'minor')).toBe('/assets/revised/deckE/E001.png')
    expect(officialCardArtPath('M068_Church', 'minor')).toBe('/assets/moor/minor/M068.png')
    expect(officialCardArtPath('A169_OffSiter', 'occupation')).toBe('/assets/player56/A169.png')
  })

  it('requires the face of every classic card in the pinned public assets', () => {
    expect(classicCardIds.length).toBeGreaterThan(0)
    const missing = classicCardIds
      .map((id) => classicCardArtPath(id)?.slice(1))
      .filter((path) => !path || !requiredPublicAssets.has(path))
    expect(missing).toEqual([])
  })
})
