import { describe, expect, it } from 'vitest'
import {
  baseUrlFromKnownAgricolaAsset,
  extractAgricolaCdnBasesFromText,
} from '../sync-bga-cdn-github-var'

describe('sync-bga-cdn-github-var', () => {
  it('derives the image base from Agricola CSS asset URLs', () => {
    expect(
      baseUrlFromKnownAgricolaAsset(
        'https://x.boardgamearena.net/data/themereleases/current/games/agricola/260622-2114/agricola.css',
      ),
    ).toBe('https://x.boardgamearena.net/data/themereleases/current/games/agricola/260622-2114/img')
  })

  it('derives the image base from the Agricola game version embedded in BGA HTML', () => {
    const html = String.raw`
      {"id":1430,"name":"agricola","display_name_en":"Agricola","version":"260622-2114","status":"public"}
    `

    expect(extractAgricolaCdnBasesFromText(html)).toEqual([
      'https://x.boardgamearena.net/data/themereleases/current/games/agricola/260622-2114/img',
    ])
  })
})
