// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GameLoadScreen } from '../GameLoadScreen'

vi.mock('../../../contexts/LocaleContext', () => ({
  useLocale: () => ({
    t: (key: string) => key === 'platform.backToLobbyPlain'
      ? 'Back to Lobby'
      : key,
  }),
}))

describe('GameLoadScreen', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('keeps a native home link available while loading', () => {
    render(<GameLoadScreen percent={20} label="Loading" />)

    expect(screen.getByRole('link', { name: 'Back to Lobby' }))
      .toHaveAttribute('href', '/')
  })

  it('does not duplicate the home brand inside an embedded game', () => {
    window.history.replaceState(null, '', '/?page=game&embedded=1')

    render(<GameLoadScreen percent={20} label="Loading" />)

    expect(screen.queryByRole('link', { name: 'Back to Lobby' }))
      .not.toBeInTheDocument()
    expect(screen.queryByText('Open Agricola')).not.toBeInTheDocument()
  })

  it('can hide the home brand in an embedded evidence drawer', () => {
    render(
      <GameLoadScreen
        percent={20}
        label="Loading"
        showHomeLink={false}
      />,
    )

    expect(screen.queryByRole('link', { name: 'Back to Lobby' }))
      .not.toBeInTheDocument()
  })
})
