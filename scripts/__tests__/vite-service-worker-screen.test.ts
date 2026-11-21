import { describe, expect, it } from 'vitest'
import type { Rolldown } from 'vite'
import { screenFiles } from '../vite-service-worker'

const chunk = (fileName: string, imports: string[], facadeModuleId: string | null = null, css: string[] = []) =>
  ({ type: 'chunk', fileName, imports, facadeModuleId, viteMetadata: { importedCss: new Set(css) } }) as unknown as Rolldown.OutputChunk

describe('the game screen files the Pages Worker warms', () => {
  it('follows the screen chunk through its static imports and stylesheets', () => {
    const bundle = {
      a: chunk('assets/GameContainerApi-1.js', ['assets/PlayerCard-2.js', 'assets/jsx-runtime-3.js'], '/repo/client/app/GameContainerApi.tsx', ['assets/GameContainerApi-1.css']),
      b: chunk('assets/PlayerCard-2.js', ['assets/jsx-runtime-3.js'], null, ['assets/PlayerCard-2.css']),
      c: chunk('assets/jsx-runtime-3.js', []),
      d: chunk('assets/Workshop-4.js', ['assets/jsx-runtime-3.js'], '/repo/client/sandbox/index.tsx'),
      e: { type: 'asset', fileName: 'assets/logo.png' },
    } as unknown as Rolldown.OutputBundle
    expect(screenFiles(bundle, 'client/app/GameContainerApi.tsx')).toEqual([
      'assets/GameContainerApi-1.css', 'assets/GameContainerApi-1.js', 'assets/PlayerCard-2.css', 'assets/PlayerCard-2.js', 'assets/jsx-runtime-3.js',
    ])
  })

  it('fails the build when the screen chunk disappears', () => {
    expect(() => screenFiles({} as Rolldown.OutputBundle, 'client/app/GameContainerApi.tsx')).toThrow('GameContainerApi.tsx')
  })
})
