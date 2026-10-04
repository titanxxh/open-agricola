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

const SUPPORTED_LANGS = ['zh', 'en'] as const

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
  return SUPPORTED_LANGS.filter(
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
  const availableLangs = ['zh', 'en'].filter(l => l !== currentLang)
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

  const langLabel = (lang: string) => lang === 'zh' ? '中文' : lang === 'en' ? 'English' : lang

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
      setError(locale === 'zh' ? '请先配置 LLM API Key' : 'Please configure LLM API Key first')
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
          setError(err instanceof Error ? err.message : (locale === 'zh' ? '自动翻译失败' : 'Auto-translation failed'))
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
      setError(locale === 'zh' ? '请先配置 LLM API Key' : 'Please configure LLM API Key first')
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
      setError(err instanceof Error ? err.message : (locale === 'zh' ? '翻译失败' : 'Translation failed'))
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
          <h3 id="localization-dialog-title">{locale === 'zh' ? '本地化' : 'Localization'}</h3>
          <button type="button" className="btn-link" onClick={onClose}>
            {locale === 'zh' ? '关闭' : 'Close'}
          </button>
        </div>
        {autoTranslating && (
          <div className="localization-auto-status" role="status" aria-live="polite">
            {locale === 'zh' ? '正在自动翻译并保存…' : 'Auto-translating and saving…'}
          </div>
        )}
        <div className="localization-modal-body">
          {/* Top: current language content (read-only) */}
          <div className="localization-section">
            <div className="localization-section-label">
              {locale === 'zh' ? '当前语言' : 'Current Language'}: {langLabel(currentLang)}
            </div>
            <div className="localization-field">
              <label>{locale === 'zh' ? '名称' : 'Name'}</label>
              <div className="readonly-text">{currentContent.name || '—'}</div>
            </div>
            <div className="localization-field">
              <label>{locale === 'zh' ? '描述' : 'Description'}</label>
              <div className="readonly-text">{currentContent.desc.join('\n') || '—'}</div>
            </div>
            {currentContent.prerequisite && (
              <div className="localization-field">
                <label>{locale === 'zh' ? '前置条件' : 'Prerequisite'}</label>
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
              aria-label={locale === 'zh' ? '目标语言' : 'Target language'}
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
                ? (locale === 'zh' ? '翻译中…' : 'Translating…')
                : (locale === 'zh' ? '翻译' : 'Translate')
              }
            </button>
          </div>

          {/* Bottom: target language content (editable) */}
          <div className="localization-section">
            <div className="localization-section-label">
              {langLabel(targetLang)}
            </div>
            <div className="localization-field">
              <label htmlFor="localization-target-name">{locale === 'zh' ? '名称' : 'Name'}</label>
              <input
                id="localization-target-name"
                type="text"
                value={targetName}
                onChange={e => setTargetName(e.target.value)}
                placeholder={locale === 'zh' ? '翻译后的卡牌名称' : 'Translated card name'}
              />
            </div>
            <div className="localization-field">
              <label htmlFor="localization-target-description">{locale === 'zh' ? '描述' : 'Description'}</label>
              <textarea
                id="localization-target-description"
                value={targetDesc}
                onChange={e => setTargetDesc(e.target.value)}
                placeholder={locale === 'zh' ? '翻译后的描述（每行一条）' : 'Translated description (one per line)'}
              />
            </div>
            <div className="localization-field">
              <label htmlFor="localization-target-prerequisite">{locale === 'zh' ? '前置条件' : 'Prerequisite'}</label>
              <input
                id="localization-target-prerequisite"
                type="text"
                value={targetPrerequisite}
                onChange={e => setTargetPrerequisite(e.target.value)}
                placeholder={locale === 'zh' ? '翻译后的前置条件' : 'Translated prerequisite'}
              />
            </div>
          </div>

          {error && <div className="localization-error" role="alert">{error}</div>}
        </div>
        <div className="localization-modal-footer">
          <button type="button" className="btn-link" onClick={onClose}>
            {locale === 'zh' ? '取消' : 'Cancel'}
          </button>
          <button type="button" className="btn-primary" onClick={handleSave}>
            {locale === 'zh' ? '保存' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
