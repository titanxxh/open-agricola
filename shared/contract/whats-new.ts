/**
 * What's New: player-facing release notes maintained as host data, not source.
 * The owner publishes `whats-new.json` through `deploy-operations.sh --whats-new`;
 * the server rereads it per request and the header dialog shows the newest entries.
 */
export const WHATS_NEW_FILENAME = 'whats-new.json'
export const WHATS_NEW_MAX_BYTES = 256 * 1024
/** Releases served to the client; the file may keep a longer history. */
export const WHATS_NEW_RELEASE_LIMIT = 5

/** One note in every language the owner wrote, keyed by language id (`zh`, `en`, …). */
export type WhatsNewText = Readonly<Record<string, string>>
export type WhatsNewRelease = Readonly<{ version: string; date: string; items: readonly WhatsNewText[] }>
export type WhatsNew = Readonly<{ releases: readonly WhatsNewRelease[] }>

const MAX_RELEASES = 200
const MAX_ITEMS = 30
const MAX_TEXT_LENGTH = 500
const MAX_VERSION_LENGTH = 32

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const hasControlCharacters = (text: string) => /[\p{Cc}\p{Cf}]/u.test(text)

function isCalendarDate(text: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  const date = new Date(`${text}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text
}

/**
 * Validates the host file or the HTTP response. Releases are listed newest first,
 * so dates may not increase down the list. Errors name the offending path.
 */
export function parseWhatsNew(value: unknown): WhatsNew {
  if (!isRecord(value) || Object.keys(value).some(key => key !== 'releases') || !Array.isArray(value.releases)) {
    throw new Error('Expected { "releases": [...] }')
  }
  if (value.releases.length > MAX_RELEASES) throw new Error(`releases: at most ${MAX_RELEASES} entries`)
  const versions = new Set<string>()
  const releases = value.releases.map((release: unknown, index): WhatsNewRelease => {
    const where = `releases[${index}]`
    if (!isRecord(release) || Object.keys(release).some(key => !['version', 'date', 'items'].includes(key))) {
      throw new Error(`${where}: expected only version, date and items`)
    }
    const { version, date, items } = release
    if (typeof version !== 'string' || version.trim() !== version || !version
      || version.length > MAX_VERSION_LENGTH || hasControlCharacters(version)) {
      throw new Error(`${where}.version: expected 1-${MAX_VERSION_LENGTH} visible characters without surrounding spaces`)
    }
    if (versions.has(version)) throw new Error(`${where}.version: duplicate ${version}`)
    versions.add(version)
    if (typeof date !== 'string' || !isCalendarDate(date)) throw new Error(`${where}.date: expected YYYY-MM-DD`)
    if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) {
      throw new Error(`${where}.items: expected 1-${MAX_ITEMS} notes`)
    }
    return {
      version, date, items: items.map((item: unknown, itemIndex): WhatsNewText => {
        const itemWhere = `${where}.items[${itemIndex}]`
        if (!isRecord(item) || Object.keys(item).length === 0) throw new Error(`${itemWhere}: expected { "<language>": "<text>" }`)
        for (const [language, text] of Object.entries(item)) {
          if (!/^[a-z]{2,3}(?:-[a-z0-9]+)*$/.test(language)) throw new Error(`${itemWhere}: invalid language id ${language}`)
          if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT_LENGTH || hasControlCharacters(text)) {
            throw new Error(`${itemWhere}.${language}: expected 1-${MAX_TEXT_LENGTH} characters on one line`)
          }
        }
        return { ...item } as WhatsNewText
      }),
    }
  })
  releases.forEach((release, index) => {
    if (index > 0 && release.date > releases[index - 1].date) {
      throw new Error(`releases[${index}].date: list releases newest first (${release.date} follows ${releases[index - 1].date})`)
    }
  })
  return { releases }
}

/** The note in the viewer's language, else English, else the first language written. */
export function whatsNewText(text: WhatsNewText, locale: string): string {
  const written = (language: string) => Object.hasOwn(text, language) ? text[language] : undefined
  return written(locale) ?? written('en') ?? Object.values(text)[0]
}
