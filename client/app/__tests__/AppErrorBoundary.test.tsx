// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppErrorBoundary } from '../AppErrorBoundary'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AppErrorBoundary', () => {
  it('renders a recovery surface instead of clearing the React root', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const Crash = () => {
      throw new Error('chunk failed')
    }

    render(
      <AppErrorBoundary fallback={<div role="alert">Page failed to load</div>}>
        <Crash />
      </AppErrorBoundary>,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('Page failed to load')
  })
})
