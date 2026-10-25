import { getLanguageManifest } from '../../services/language-pack'
import { getLoadedLocales } from '../../../shared/i18n'
import { t as translateMessage } from '../../../shared/i18n'
import { useEffect, useRef, useState } from 'react'
import { getLlmConfig, translateCardContent, type LlmConfig } from '../../services/llm'
import { useLocale } from '../../contexts/LocaleContext'

type CardLocaleContent = {
  name: string
  desc: string[]
  rules?: string[]
  prerequisite?: string
}

type CardLocales = Record<string, CardLocaleContent>

const supportedLanguages = () => getLanguageManifest()?.languages.map(language => language.id) ?? getLoadedLocales()

export function isLocaleEntryComplete(entry: CardLocaleContent | undefined): boolean {
  if (!entry) return false
  if (typeof entry.name !== 'string' || entry.name.trim().length === 0) return false
  if (!Array.isArray(entry.desc)) return false
  return entry.desc.some((line) => typeof line === 'string' && line.trim().length > 0)
}

/**
 * Languages that need a translation when the modal opens. Returns every
 * SUPPORTED_LANGS entry that isn't `currentLang` and isn't already complete in
 * `locales`. Caller skips auto-translation when this is empty.
 */
export function getMissingLanguages(
  currentLang: string,
  locales: CardLocales,
): string[] {
  return supportedLanguages().filter(
    (lang) => lang !== currentLang && !isLocaleEntryComplete(locales[lang]),
  )
}

export function LocalizationModal({
  currentContent,
  currentLang,
  locales,
  onSave,
  onClose,
}: {
  currentContent: CardLocaleContent
  currentLang: string
  locales: CardLocales
  onSave: (locales: CardLocales) => void
  onClose: () => void
}) {
  const { locale } = useLocale()
  const availableLangs = supportedLanguages().filter(l => l !== currentLang)
  const [targetLang, setTargetLang] = useState(availableLangs[0] ?? 'en')

  // Initialize target fields from existing locales or empty
  const existing = locales[targetLang]
  const [targetName, setTargetName] = useState(existing?.name ?? '')
  const [targetDesc, setTargetDesc] = useState(existing?.desc?.join('\n') ?? '')
  const [targetPrerequisite, setTargetPrerequisite] = useState(existing?.prerequisite ?? '')

  const [translating, setTranslating] = useState(false)
  const [autoTranslating, setAutoTranslating] = useState(false)
  const [error, setError] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    dialogRef.current?.querySelector<HTMLElement>('input, textarea, select, button')?.focus()
    return () => opener?.focus()
  }, [])

  const langLabel = (lang: string) => getLanguageManifest()?.languages.find(language => language.id === lang)?.name ?? new Intl.DisplayNames([lang], { type: 'language' }).of(lang) ?? lang

  // On mount: if any supported language is missing a translation, fire one
  // request per missing language, merge results into `locales`, and persist
  // via `onSave` (which also closes the modal). On error or missing config,
  // leave the modal open so the user can correct it manually.
  useEffect(() => {
    if (!isLocaleEntryComplete(currentContent)) return
    const missing = getMissingLanguages(currentLang, locales)
    if (missing.length === 0) return

    const config = getLlmConfig()
    if (!config) {
      setError(translateMessage(locale, "ui.copy.app_workshop_LocalizationModal.please_configure_llm_api_key_first_82666c"))
      return
    }

    let cancelled = false
    setAutoTranslating(true)
    setError('')
    ;(async () => {
      try {
        const updated: CardLocales = {
          ...locales,
          [currentLang]: {
            ...locales[currentLang],
            name: currentContent.name,
            desc: currentContent.desc,
            prerequisite: currentContent.prerequisite || undefined,
          },
        }
        for (const lang of missing) {
          if (cancelled) return
          const result = await translateCardContent(
            {
              name: currentContent.name,
              desc: currentContent.desc,
              prerequisite: currentContent.prerequisite,
            },
            lang,
            config as LlmConfig,
          )
          if (cancelled) return
          updated[lang] = {
            ...locales[lang],
            name: result.name,
            desc: result.desc,
            prerequisite: result.prerequisite || undefined,
          }
        }
        if (!cancelled) onSave(updated)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : (translateMessage(locale, "ui.copy.app_workshop_LocalizationModal.auto_translation_failed_8cbe1c")))
          setAutoTranslating(false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
    // run once on mount; the modal is re-mounted each time it opens, so we
    // intentionally don't list deps that would re-trigger translations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleLangChange = (lang: string) => {
    setTargetLang(lang)
    const ex = locales[lang]
    setTargetName(ex?.name ?? '')
    setTargetDesc(ex?.desc?.join('\n') ?? '')
    setTargetPrerequisite(ex?.prerequisite ?? '')
    setError('')
  }

  const handleTranslate = async () => {
    const config = getLlmConfig()
    if (!config) {
      setError(translateMessage(locale, "ui.copy.app_workshop_LocalizationModal.please_configure_llm_api_key_first_82666c"))
      return
    }
    setTranslating(true)
    setError('')
    try {
      const result = await translateCardContent(
        {
          name: currentContent.name,
          desc: currentContent.desc,
          prerequisite: currentContent.prerequisite,
        },
        targetLang,
        config as LlmConfig,
      )
      setTargetName(result.name)
      setTargetDesc(result.desc.join('\n'))
      setTargetPrerequisite(result.prerequisite ?? '')
    } catch (err) {
      setError(err instanceof Error ? err.message : (translateMessage(locale, "ui.copy.app_workshop_LocalizationModal.translation_failed_a88445")))
    } finally {
      setTranslating(false)
    }
  }

  const handleSave = () => {
    const updated = { ...locales }
    if (targetName.trim() || targetDesc.trim() || targetPrerequisite.trim()
      || locales[targetLang]?.rules?.some((line) => line.trim())) {
      updated[targetLang] = {
        ...locales[targetLang],
        name: targetName.trim(),
        desc: targetDesc.split('\n').filter(l => l.trim()),
        prerequisite: targetPrerequisite.trim() || undefined,
      }
    } else {
      delete updated[targetLang]
    }
    // Also store the current language content
    updated[currentLang] = {
      ...locales[currentLang],
      name: currentContent.name,
      desc: currentContent.desc,
      prerequisite: currentContent.prerequisite || undefined,
    }
    onSave(updated)
  }

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !dialogRef.current) return
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ))
    if (focusable.length === 0) return
    const first = focusable[0]!
    const last = focusable.at(-1)!
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="localization-modal-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className="localization-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="localization-dialog-title"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleDialogKeyDown}
      >
        <div className="localization-modal-header">
          <h3 id="localization-dialog-title">{translateMessage(locale, "ui.copy.app_workshop_LocalizationModal.localization_6ab594")}</h3>
          <button type="button" className="btn-link" onClick={onClose}>
            {translateMessage(locale, "ui.copy.app_workshop_LocalizationModal.close_6cf4a7")}
          </button>
        </div>
        {autoTranslating && (
          <div className="localization-auto-status" role="status" aria-live="polite">
            {translateMessage(locale, "ui.copy.app_workshop_LocalizationModal.auto_translating_and_saving_f574da")}
          </div>
        )}
        <div className="localization-modal-body">
          {/* Top: current language content (read-only) */}
          <div className="localization-section">
            <div className="localization-section-label">
              {translateMessage(locale, "ui.copy.app_workshop_LocalizationModal.current_language_19a67a")}: {langLabel(currentLang)}
            </div>
            <div className="localization-field">
              <label>{translateMessage(locale, "ui.copy.app_workshop_LocalizationModal.name_dd4dc4")}</label>
              <div className="readonly-text">{currentContent.name || '—'}</div>
            </div>
            <div className="localization-field">
              <label>{translateMessage(locale, "ui.copy.app_workshop_LocalizationModal.description_4ffe9f")}</label>
              <div className="readonly-text">{currentContent.desc.join('\n') || '—'}</div>
            </div>
            {currentContent.prerequisite && (
              <div className="localization-field">
                <label>{translateMessage(locale, "ui.copy.app_workshop_LocalizationModal.prerequisite_e4c750")}</label>
                <div className="readonly-text">{currentContent.prerequisite}</div>
              </div>
            )}
          </div>

          {/* Middle: language switcher + translate button */}
          <div className="localization-divider">
            <select
              className="localization-lang-select"
              value={targetLang}
              onChange={e => handleLangChange(e.target.value)}
              disabled={translating}
              aria-label={translateMessage(locale, "ui.copy.app_workshop_LocalizationModal.target_language_7bcfed")}
            >
              {availableLangs.map(l => (
                <option key={l} value={l}>{langLabel(l)}</option>
              ))}
            </select>
            <button
              type="button"
              className="localization-translate-btn"
              onClick={handleTranslate}
              disabled={translating}
            >
              {translating
                ? (translateMessage(locale, "ui.copy.app_workshop_LocalizationModal.translating_9a8375"))
                : (translateMessage(locale, "ui.copy.app_workshop_LocalizationModal.translate_783f42"))
              }
            </button>
          </div>

          {/* Bottom: target language content (editable) */}
          <div className="localization-section">
            <div className="localization-section-label">
              {langLabel(targetLang)}
            </div>
            <div className="localization-field">
              <label htmlFor="localization-target-name">{translateMessage(locale, "ui.copy.app_workshop_LocalizationModal.name_dd4dc4")}</label>
              <input
                id="localization-target-name"
                type="text"
                value={targetName}
                onChange={e => setTargetName(e.target.value)}
                placeholder={translateMessage(locale, "ui.copy.app_workshop_LocalizationModal.translated_card_name_5defcd")}
              />
            </div>
            <div className="localization-field">
              <label htmlFor="localization-target-description">{translateMessage(locale, "ui.copy.app_workshop_LocalizationModal.description_4ffe9f")}</label>
              <textarea
                id="localization-target-description"
                value={targetDesc}
                onChange={e => setTargetDesc(e.target.value)}
                placeholder={translateMessage(locale, "ui.copy.app_workshop_LocalizationModal.translated_description_one_per_line_267476")}
              />
            </div>
            <div className="localization-field">
              <label htmlFor="localization-target-prerequisite">{translateMessage(locale, "ui.copy.app_workshop_LocalizationModal.prerequisite_e4c750")}</label>
              <input
                id="localization-target-prerequisite"
                type="text"
                value={targetPrerequisite}
                onChange={e => setTargetPrerequisite(e.target.value)}
                placeholder={translateMessage(locale, "ui.copy.app_workshop_LocalizationModal.translated_prerequisite_514226")}
              />
            </div>
          </div>

          {error && <div className="localization-error" role="alert">{error}</div>}
        </div>
        <div className="localization-modal-footer">
          <button type="button" className="btn-link" onClick={onClose}>
            {translateMessage(locale, "ui.copy.app_workshop_LocalizationModal.cancel_998b9c")}
          </button>
          <button type="button" className="btn-primary" onClick={handleSave}>
            {translateMessage(locale, "ui.copy.app_workshop_LocalizationModal.save_ec8e6d")}
          </button>
        </div>
      </div>
    </div>
  )
}
