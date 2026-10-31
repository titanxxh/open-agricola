import { useId, useRef, useState } from 'react'
import { t, type Locale } from '../../../shared/i18n'
import { useEncyclopediaBrowseState, type EncyclopediaBrowseStore } from './encyclopedia-browse-store'

export type EncyclopediaSearchProps = {
  store: EncyclopediaBrowseStore
  locale: Locale
}

/** Search box above the results; every edit updates the shared query at once, except unfinished input-method text. */
export function EncyclopediaSearch({ store, locale }: EncyclopediaSearchProps) {
  const { query } = useEncyclopediaBrowseState(store)
  const [composing, setComposing] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const examplesId = useId()
  const value = composing ?? query

  const clear = () => {
    store.setQuery('')
    input.current?.focus()
  }

  return (
    <div className="encyclopedia-search" role="search">
      <div className="encyclopedia-search__field">
        <input
          ref={input}
          type="search"
          className="encyclopedia-search__input"
          aria-label={t(locale, 'ui.encyclopedia.search.label')}
          aria-describedby={examplesId}
          placeholder={t(locale, 'ui.encyclopedia.search.placeholder')}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          value={value}
          onChange={event => (composing === null ? store.setQuery(event.target.value) : setComposing(event.target.value))}
          onCompositionStart={event => setComposing(event.currentTarget.value)}
          onCompositionEnd={event => {
            setComposing(null)
            store.setQuery(event.currentTarget.value)
          }}
        />
        {value ? (
          <button
            type="button"
            className="encyclopedia-search__clear"
            aria-label={t(locale, 'ui.encyclopedia.search.clear')}
            title={t(locale, 'ui.encyclopedia.search.clear')}
            onClick={clear}
          >
            ×
          </button>
        ) : null}
      </div>
      <p id={examplesId} className="encyclopedia-search__examples">{t(locale, 'ui.encyclopedia.search.examples')}</p>
    </div>
  )
}
