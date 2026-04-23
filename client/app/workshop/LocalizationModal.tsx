import { useState } from 'react'
import { getLlmConfig, translateCardContent, type LlmConfig } from '../../services/llmService'
import { useLocale } from '../../contexts/LocaleContext'

type CardLocaleContent = {
  name: string
  desc: string[]
  prerequisite?: string
}

type CardLocales = Record<string, CardLocaleContent>

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
  const [error, setError] = useState('')

  const langLabel = (lang: string) => lang === 'zh' ? '中文' : lang === 'en' ? 'English' : lang

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
    if (targetName.trim() || targetDesc.trim()) {
      updated[targetLang] = {
        name: targetName.trim(),
        desc: targetDesc.split('\n').filter(l => l.trim()),
        ...(targetPrerequisite.trim() ? { prerequisite: targetPrerequisite.trim() } : {}),
      }
    } else {
      delete updated[targetLang]
    }
    // Also store the current language content
    updated[currentLang] = {
      name: currentContent.name,
      desc: currentContent.desc,
      ...(currentContent.prerequisite ? { prerequisite: currentContent.prerequisite } : {}),
    }
    onSave(updated)
  }

  return (
    <div className="localization-modal-overlay" onClick={onClose}>
      <div className="localization-modal" onClick={e => e.stopPropagation()}>
        <div className="localization-modal-header">
          <h3>{locale === 'zh' ? '本地化' : 'Localization'}</h3>
          <button type="button" className="btn-link" onClick={onClose}>
            {locale === 'zh' ? '关闭' : 'Close'}
          </button>
        </div>
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
              <label>{locale === 'zh' ? '名称' : 'Name'}</label>
              <input
                type="text"
                value={targetName}
                onChange={e => setTargetName(e.target.value)}
                placeholder={locale === 'zh' ? '翻译后的卡牌名称' : 'Translated card name'}
              />
            </div>
            <div className="localization-field">
              <label>{locale === 'zh' ? '描述' : 'Description'}</label>
              <textarea
                value={targetDesc}
                onChange={e => setTargetDesc(e.target.value)}
                placeholder={locale === 'zh' ? '翻译后的描述（每行一条）' : 'Translated description (one per line)'}
              />
            </div>
            <div className="localization-field">
              <label>{locale === 'zh' ? '前置条件' : 'Prerequisite'}</label>
              <input
                type="text"
                value={targetPrerequisite}
                onChange={e => setTargetPrerequisite(e.target.value)}
                placeholder={locale === 'zh' ? '翻译后的前置条件' : 'Translated prerequisite'}
              />
            </div>
          </div>

          {error && <div className="localization-error">{error}</div>}
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
