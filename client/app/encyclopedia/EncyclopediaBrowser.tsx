import { useEffect, useId, useMemo, useRef } from 'react'
import { t, type Locale } from '../../../shared/i18n'
import type { CardEncyclopedia } from '../../services/card-encyclopedia'
import { EncyclopediaDetail } from './EncyclopediaDetail'
import { EncyclopediaFace } from './EncyclopediaFace'
import { EncyclopediaFieldValue } from './EncyclopediaFieldValue'
import { EncyclopediaActiveFilters, EncyclopediaFilterEntry, EncyclopediaFilterPanel } from './EncyclopediaFilters'
import { EncyclopediaSearch } from './EncyclopediaSearch'
import { encyclopediaBrowseStore, useEncyclopediaBrowseState, type EncyclopediaBrowseStore } from './encyclopedia-browse-store'
import { encyclopediaItems, type EncyclopediaItem } from './encyclopedia-item'
import { encyclopediaTypeLabel } from './encyclopedia-labels'
import type { EncyclopediaNavigation } from './encyclopedia-navigation'
import { paginateEncyclopedia } from './encyclopedia-pagination'
import { encyclopediaResults } from './encyclopedia-results'
import { encyclopediaFieldText } from './encyclopedia-text'

type BrowserProps = {
  encyclopedia: CardEncyclopedia
  navigation: EncyclopediaNavigation
  locale: Locale
  store?: EncyclopediaBrowseStore
}

export function EncyclopediaBrowser({ encyclopedia, navigation, locale, store = encyclopediaBrowseStore }: BrowserProps) {
  const state = useEncyclopediaBrowseState(store)
  const items = useMemo(() => encyclopediaItems(encyclopedia), [encyclopedia])
  const results = useMemo(
    () => encyclopediaResults(items, { query: state.query, filters: state.filters }),
    [items, state.query, state.filters],
  )
  const slice = paginateEncyclopedia(results, state.page)
  const resultsRef = useRef<HTMLElement>(null)
  const countId = useId()
  const { selectedKey } = navigation

  useEffect(() => {
    if (slice.page !== state.page) store.setPage(slice.page)
  }, [slice.page, state.page, store])

  const lastOpened = useRef<string | null>(null)
  useEffect(() => {
    if (selectedKey !== null) {
      lastOpened.current = selectedKey
      return
    }
    const opener = [...(resultsRef.current?.querySelectorAll<HTMLButtonElement>('button[data-entry-key]') ?? [])]
      .find(button => button.dataset.entryKey === lastOpened.current)
    opener?.focus({ preventScroll: true })
    lastOpened.current = null
  }, [selectedKey])

  const goToPage = (page: number) => {
    store.setPage(page)
    const results = resultsRef.current
    if (results && results.getBoundingClientRect().top < 0) results.scrollIntoView({ block: 'start' })
  }

  const filterProps = { store, locale, items, resultCount: slice.total }

  return (
    <div className="encyclopedia-browser">
      <EncyclopediaSearch store={store} locale={locale} />
      <div className="encyclopedia-browser__layout">
        <EncyclopediaFilterPanel {...filterProps} />
        <section ref={resultsRef} className="encyclopedia-results" aria-labelledby={countId}>
          <div className="encyclopedia-results__bar">
            <h2 id={countId} className="encyclopedia-results__count">
              {t(locale, 'ui.encyclopedia.results.count', { count: slice.total })}
            </h2>
            <p className="encyclopedia-results__bilingual">{t(locale, 'ui.encyclopedia.search.bilingual')}</p>
            <EncyclopediaFilterEntry {...filterProps} />
          </div>
          <EncyclopediaActiveFilters {...filterProps} />
          {slice.total === 0
            ? <EmptyResults locale={locale} onClear={() => store.reset()} />
            : (
              <ol className="encyclopedia-gallery">
                {slice.items.map(item => (
                  <GalleryEntry key={item.entry.key} item={item} locale={locale} onOpen={navigation.openEntry} />
                ))}
              </ol>
            )}
          {slice.pageCount > 1 ? (
            <nav className="encyclopedia-pagination" aria-label={t(locale, 'ui.encyclopedia.pagination.label')}>
              <button type="button" className="btn-secondary" disabled={slice.page <= 1} onClick={() => goToPage(slice.page - 1)}>
                {t(locale, 'ui.encyclopedia.pagination.previous')}
              </button>
              <span className="encyclopedia-pagination__status" aria-live="polite">
                {t(locale, 'ui.encyclopedia.pagination.status', { page: slice.page, total: slice.pageCount })}
              </span>
              <button type="button" className="btn-secondary" disabled={slice.page >= slice.pageCount} onClick={() => goToPage(slice.page + 1)}>
                {t(locale, 'ui.encyclopedia.pagination.next')}
              </button>
            </nav>
          ) : null}
        </section>
      </div>
      {selectedKey !== null ? (
        <EncyclopediaDetail
          entryKey={selectedKey}
          item={encyclopedia.byKey.get(selectedKey)}
          locale={locale}
          onClose={navigation.closeEntry}
        />
      ) : null}
    </div>
  )
}

function GalleryEntry({ item, locale, onOpen }: { item: EncyclopediaItem; locale: Locale; onOpen: (key: string) => void }) {
  const { entry } = item
  const markId = useId()
  const nameField = encyclopediaFieldText(item, 'name', locale)
  const name = nameField?.text || t(locale, 'ui.encyclopedia.fallback.missing')
  const meta = [entry.displayNumber, encyclopediaTypeLabel(locale, entry.publicType)].filter(Boolean).join(' · ')
  return (
    <li className="encyclopedia-gallery__item">
      <div className="encyclopedia-gallery__face" aria-hidden="true">
        <EncyclopediaFace item={item} locale={locale} />
      </div>
      <button
        type="button"
        className="encyclopedia-gallery__open"
        data-entry-key={entry.key}
        aria-label={t(locale, 'ui.encyclopedia.results.open', { name })}
        aria-describedby={nameField?.status === 'fallback' ? markId : undefined}
        onClick={() => onOpen(entry.key)}
      >
        <span className="encyclopedia-gallery__name">
          {nameField ? <EncyclopediaFieldValue text={nameField} locale={locale} markId={markId}>{name}</EncyclopediaFieldValue> : name}
        </span>
        <span className="encyclopedia-gallery__meta">{meta}</span>
      </button>
    </li>
  )
}

function EmptyResults({ locale, onClear }: { locale: Locale; onClear: () => void }) {
  return (
    <div className="encyclopedia-empty">
      <h3>{t(locale, 'ui.encyclopedia.empty.title')}</h3>
      <p>{t(locale, 'ui.encyclopedia.empty.hint')}</p>
      <button type="button" className="btn-secondary" onClick={onClear}>{t(locale, 'ui.encyclopedia.empty.clear')}</button>
    </div>
  )
}
