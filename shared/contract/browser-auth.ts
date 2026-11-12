export const BROWSER_AUTH_VERSION = 2
export const BROWSER_AUTH_HEADER = 'x-oa-browser-protocol'
export const BROWSER_WS_PROTOCOL = 'oa.browser.v2'

export interface BrowserAuthPolicy {
  version: typeof BROWSER_AUTH_VERSION
  buildId: string
  appOrigin: string
  apiOrigin: string
}
