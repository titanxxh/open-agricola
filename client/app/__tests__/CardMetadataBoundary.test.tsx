// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetCardsManifestCache, loadCardsManifest } from '../../services/card-meta'
import { CardMetadataBoundary } from '../CardMetadataBoundary'

vi.mock('../../contexts/LocaleContext', () => ({
  useCurrentLocale: () => 'en',
  useLocale: () => ({ t: (key: string) => key }),
}))

beforeEach(() => { __resetCardsManifestCache() })
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CardMetadataBoundary', () => {
  it('renders cached metadata consumers immediately on each mount', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')))
    await loadCardsManifest()

    const first = render(<CardMetadataBoundary><main>Cards ready</main></CardMetadataBoundary>)
    expect(screen.getByText('Cards ready')).toBeVisible()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    first.unmount()

    render(<CardMetadataBoundary><main>Next page ready</main></CardMetadataBoundary>)
    expect(screen.getByText('Next page ready')).toBeVisible()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('keeps consumers gated until the initial metadata request completes', async () => {
    let release = (_response: Response) => {}
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { release = resolve })))
    render(<CardMetadataBoundary><main>Cards ready</main></CardMetadataBoundary>)
    expect(screen.queryByText('Cards ready')).not.toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toBeVisible()

    await act(async () => { release(new Response('{}')) })
    expect(screen.getByText('Cards ready')).toBeVisible()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })
})
