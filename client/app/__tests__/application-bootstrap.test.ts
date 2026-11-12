// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { startApplication } from '../application-bootstrap'

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe('application bootstrap', () => {
  it('starts the application only in the top-level window', async () => {
    const start = vi.fn().mockResolvedValue(undefined)
    await startApplication(document.body, start)
    expect(start).toHaveBeenCalledOnce()
  })

  it.each(['embedded', 'unreadable'])('keeps %s pages outside the authenticated application', async mode => {
    const root = document.createElement('div')
    document.body.append(root)
    const start = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('window', {
      self: {},
      get top() { if (mode === 'unreadable') throw new Error('Denied'); return {} },
      location: { origin: 'https://formal.example.test', href: 'https://formal.example.test/?page=prerelease-handoff#code=secret' },
    })
    await startApplication(root, start)
    expect(start).not.toHaveBeenCalled()
    const link = root.querySelector('a')
    expect(link?.textContent).toBe('Open Agricola')
    expect(link?.href).toBe('https://formal.example.test/')
    expect(link?.target).toBe('_blank')
    expect(link?.rel).toBe('noopener noreferrer')
  })
})
