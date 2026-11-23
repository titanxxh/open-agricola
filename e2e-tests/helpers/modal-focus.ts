import type { Page } from '@playwright/test'

/**
 * Leaves a stylesheet loading for as long as the page lives, as the lobby's donation widget does on a slow network.
 * WebKit hands focus back from a closed modal only once the page's style is up to date, and focus() skips that
 * update while a stylesheet is loading (#2004).
 */
export async function keepStylesheetLoading(page: Page) {
  await page.route('**/never-loads.css', () => {})
  // Added after the load event, which a loading stylesheet would hold back.
  await page.addInitScript(() => addEventListener('load', () => {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = '/never-loads.css'
    document.head.append(link)
  }))
}
