/**
 * Workshop AI Card Designer.
 *
 * The system prompt fed to the LLM lives in `client/services/llmPrompts.ts`.
 * Sandbox constraints visible to users (sandbox-error tooltips, "what can I
 * write" hints, etc.) MUST stay consistent with the single source of truth:
 *   docs/CUSTOM_CARD_SANDBOX.md
 *
 * CI runs `pnpm run check:prompt-sync` to keep llmPrompts.ts and the SANDBOX
 * doc aligned with the underlying source code (cardEffectHooks /
 * isActionHookPhase / DENIED_IDENTIFIERS / DENIED_PROPERTY_ACCESS).
 *
 * If you add UI copy here that lists hooks / phases / denied identifiers,
 * link to the SANDBOX doc rather than embedding a parallel list.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getLlmConfig, saveLlmConfig, clearLlmConfig,
  getProvider, listModelsFor, defaultModelFor,
  streamChat, extractCardFromResponse, generateCardArt, buildCardArtPrompt,
  supportsImageGeneration, KEY_LLM_CONFIG_ART,
  PROVIDER_LABELS, PROVIDER_KEY_HINTS,
  type LlmConfig, type LlmProvider, type ChatMessage, type ReferenceImage,
} from '../../services/llm'
import { CARD_DESIGNER_SYSTEM_PROMPT } from '../../services/llmPrompts'
import { LocalizationModal, isLocaleEntryComplete } from './LocalizationModal'
import { useLocale } from '../../contexts/LocaleContext'
import { ResourceText } from '../../components/common/ResourceText'
import { Section } from '../../components/common/Section'
import { API_BASE } from '../../config'
import { useWorkshopDraft } from './useWorkshopDraft'
import type {
  WorkshopClientDraft,
  WorkshopStage,
} from './workshop-draft-model'

type ApiFetch = (path: string, init?: RequestInit) => Promise<Response>

const cookieApiFetch: ApiFetch = (path, init) => fetch(`${API_BASE}${path}`, {
  ...init,
  credentials: 'include',
})

/** Generate a card ID from a display name — English only */
function autoCardId(name: string): string {
  // Keep only ASCII letters, digits, underscores
  const slug = name.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40)
  return slug ? `CUSTOM_${slug}` : ''
}

/** Check if a card ID is valid (CUSTOM_ prefix, ASCII only, min length) */
function isValidCardId(id: string): { valid: boolean; reason?: string } {
  if (!id.startsWith('CUSTOM_')) return { valid: false, reason: 'ID 必须以 CUSTOM_ 开头' }
  if (id.length < 8) return { valid: false, reason: 'ID 太短，至少 8 个字符' }
  if (/[^a-zA-Z0-9_]/.test(id)) return { valid: false, reason: 'ID 只能包含英文字母、数字和下划线' }
  return { valid: true }
}

async function uploadArt(
  dataUrl: string,
  apiFetch: ApiFetch,
): Promise<string | null> {
  try {
    const resp = await apiFetch('/api/workshop/art', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ dataUrl }),
    })
    const d = await resp.json()
    if (d.ok && d.url) return `${API_BASE}${d.url}`
    return null
  } catch {
    return null
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Build the "current language" content fed to LocalizationModal. The modal
 * shows this read-only as the source for the translate button. Picking the
 * right source matters: if the user has already filled in a translation for
 * the active UI language we want to honour it, otherwise fall back to the
 * editor inputs the user is actually looking at.
 */
export function pickLocalizationCurrentContent(args: {
  locale: string
  cardLocales: Record<string, { name: string; desc: string[]; prerequisite?: string }>
  cardName: string
  prerequisite: string
  extractedName: string | undefined
  extractedDesc: string[] | undefined
  extractedPrerequisite: string | undefined
}): { name: string; desc: string[]; prerequisite?: string } {
  const localeEntry = args.cardLocales[args.locale]
  const editorPrereq = args.prerequisite || args.extractedPrerequisite
  if (localeEntry?.name && (localeEntry.desc?.length ?? 0) > 0) {
    return {
      name: localeEntry.name,
      desc: localeEntry.desc,
      prerequisite: localeEntry.prerequisite ?? editorPrereq,
    }
  }
  return {
    name: args.cardName || args.extractedName || '',
    desc: args.extractedDesc ?? [],
    prerequisite: editorPrereq,
  }
}

export type ExtractedCard = {
  card: {
    id: string
    name: string
    card_type: 'minor' | 'occupation'
    cost: Record<string, number>
    vp: number
    desc: string[]
    prerequisite?: string
    modifiers?: unknown[]
    locales?: Record<string, { name: string; desc: string[]; prerequisite?: string }>
  }
  sourceCode?: string
}

type DisplayMessage = ChatMessage & { streaming?: boolean; isError?: boolean; promptSnapshot?: string }

export type ApiCard = {
  id: string          // DB row id
  card_id: string     // CUSTOM_xxx
  card_type: string
  name: string
  description: string
  art_url: string | null
  effect_code: string | null
  card_json: Record<string, unknown>  // already parsed by server
  status: string
  updated_at: number
}

// ── Markdown with code copy ─────────────────────────────────────────────────

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code.trim()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="ai-code-block">
      <div className="ai-code-header">
        {lang && <span className="ai-code-lang">{lang}</span>}
        <button type="button" className="ai-code-copy" onClick={handleCopy}>
          {copied ? '✓' : '复制'}
        </button>
      </div>
      <pre><code>{code}</code></pre>
    </div>
  )
}

function MessageContent({ text }: { text: string }) {
  // Split on complete code blocks first
  const parts = text.split(/(```[\s\S]*?```)/g)

  // Check if there's an unclosed code block at the end (during streaming)
  const lastPart = parts[parts.length - 1] ?? ''
  const openMatch = lastPart.match(/^([\s\S]*?)(```(\w*)\n[\s\S]*)$/)

  const renderedParts: { type: 'text' | 'code'; content: string; lang?: string }[] = []

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i] ?? ''
    const codeMatch = part.match(/^```(\w*)\n?([\s\S]*?)```$/)
    if (codeMatch) {
      renderedParts.push({ type: 'code', lang: codeMatch[1] ?? '', content: codeMatch[2] ?? '' })
    } else {
      renderedParts.push({ type: 'text', content: part })
    }
  }

  if (openMatch) {
    // Text before the unclosed block
    if (openMatch[1]) renderedParts.push({ type: 'text', content: openMatch[1] })
    // Unclosed code block — render as code anyway
    const openLang = openMatch[3] ?? ''
    const openCode = (openMatch[2] ?? '').replace(/^```\w*\n?/, '')
    renderedParts.push({ type: 'code', lang: openLang, content: openCode })
  } else {
    const codeMatch = lastPart.match(/^```(\w*)\n?([\s\S]*?)```$/)
    if (codeMatch) {
      renderedParts.push({ type: 'code', lang: codeMatch[1] ?? '', content: codeMatch[2] ?? '' })
    } else if (lastPart) {
      renderedParts.push({ type: 'text', content: lastPart })
    }
  }

  return (
    <>
      {renderedParts.map((part, i) =>
        part.type === 'code'
          ? <CodeBlock key={i} lang={part.lang ?? ''} code={part.content} />
          : <span key={i}>{part.content}</span>
      )}
    </>
  )
}

// ── Inline Config Bar ─────────────────────────────────────────────────────────

function ConfigBar({ config, onConfigured, onClear, storageKey, capability }: {
  config: LlmConfig | null
  onConfigured: () => void
  onClear: () => void
  storageKey?: string
  capability: 'chat' | 'image'
}) {
  const [expanded, setExpanded] = useState(!config)
  const [provider, setProvider] = useState<LlmProvider>(config?.provider ?? 'gemini')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(() => {
    if (!config) return defaultModelFor(getProvider('gemini'), capability) ?? ''
    // Validate the saved model against this panel's capability. If it doesn't
    // qualify (e.g. user saved a chat-only model in the image panel), fall back
    // to the provider's preferred model for this capability.
    const def = getProvider(config.provider)
    const valid = listModelsFor(def, capability)
    if (valid.some(m => m.id === config.model)) return config.model
    return defaultModelFor(def, capability) ?? ''
  })
  const [showKey, setShowKey] = useState(false)

  const handleProviderChange = (p: LlmProvider) => {
    setProvider(p)
    const next = defaultModelFor(getProvider(p), capability)
    setModel(next ?? '')
  }

  const handleSave = () => {
    if (!apiKey.trim()) return
    saveLlmConfig({ provider, apiKey: apiKey.trim(), model }, storageKey)
    setExpanded(false)
    onConfigured()
  }

  const handleClear = () => {
    clearLlmConfig(storageKey)
    setApiKey('')
    setExpanded(true)
    onClear()
  }

  if (!expanded && config) {
    // Detect stale-but-saved model that no longer matches the panel's capability
    // (e.g. a previously saved gemini-2.5-flash for the image panel after Task 3
    // trimmed the model list). Surface a subtle warning so the user knows to fix it.
    let stale = false
    try {
      const def = getProvider(config.provider)
      if (def.models.length > 0) {
        const validIds = listModelsFor(def, capability).map(m => m.id)
        if (!validIds.includes(config.model)) stale = true
      }
    } catch { /* unknown provider — leave hint off */ }

    return (
      <div className="ai-config-bar">
        <span className="ai-provider-tag">{config.provider} / {config.model}</span>
        {stale && (
          <span className="ai-config-bar-stale" title={`'${config.model}' 不再可用，请点击「切换」更新`}>已失效</span>
        )}
        <button type="button" className="btn-link" onClick={() => setExpanded(true)}>切换</button>
        <button type="button" className="btn-link ai-config-bar-clear" onClick={handleClear}>清除</button>
      </div>
    )
  }

  return (
    <div className="ai-config-bar ai-config-bar-expanded">
      <div className="ai-config-bar-row">
        <strong>AI 提供商配置</strong>
        <span className="ai-config-bar-hint">API Key 仅保存在本地，不会上传到服务器</span>
        {config && (
          <button type="button" className="btn-link" onClick={() => setExpanded(false)}>折叠</button>
        )}
      </div>

      <div className="ai-config-bar-fields">
        <div className="ai-provider-btns">
          {(['gemini', 'openrouter', 'deepseek', 'aihubmix'] as LlmProvider[]).map(p => (
            <button
              key={p}
              type="button"
              className={`ai-provider-btn${provider === p ? ' active' : ''}`}
              onClick={() => handleProviderChange(p)}
            >
              {PROVIDER_LABELS[p]}
            </button>
          ))}
        </div>

        {(() => {
          const providerDef = getProvider(provider)
          const availableModels = listModelsFor(providerDef, capability)
          if (availableModels.length === 0) {
            // Provider has models but none support this capability.
            return (
              <span className="ai-model-mismatch">
                {capability === 'image'
                  ? '该 provider 不支持图像生成，请切换 provider'
                  : '该 provider 不支持代码/聊天生成，请切换 provider'}
              </span>
            )
          }
          return (
            <select value={model} onChange={e => setModel(e.target.value)} className="ai-model-select">
              {availableModels.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          )
        })()}

        <div className="ai-key-input-row">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="API Key"
            autoComplete="off"
            className="ai-config-bar-input"
          />
          <button type="button" className="btn-link ai-toggle-key" onClick={() => setShowKey(s => !s)}>
            {showKey ? '隐藏' : '显示'}
          </button>
        </div>

        {PROVIDER_KEY_HINTS[provider] && (
          <div className="form-hint">
            获取 Key：<a href={`https://${PROVIDER_KEY_HINTS[provider]}`} target="_blank" rel="noopener noreferrer">{PROVIDER_KEY_HINTS[provider]}</a>
          </div>
        )}

        <button type="button" className="btn-primary" onClick={handleSave} disabled={!apiKey.trim() || !model.trim()}>
          保存配置
        </button>
      </div>
    </div>
  )
}

function ConfigStatusSummary({
  artConfig,
  abilityConfig,
  locale,
  t,
}: {
  artConfig: LlmConfig | null
  abilityConfig: LlmConfig | null
  locale: 'zh' | 'en'
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  const statusText = (heading: string, config: LlmConfig | null) => {
    if (!config) {
      return locale === 'zh'
        ? `${heading}：${t('platform.aiConfigStatusMissing')}`
        : `${heading}: ${t('platform.aiConfigStatusMissing')}`
    }
    const provider = PROVIDER_LABELS[config.provider] ?? config.provider
    return locale === 'zh'
      ? `${heading}：${provider} · ${config.model}`
      : `${heading}: ${provider} · ${config.model}`
  }

  return (
    <div className="ai-config-status-summary" aria-label={t('platform.aiConfigStatusLabel')}>
      <span className={`ai-config-status-chip${artConfig ? '' : ' is-missing'}`}>
        {statusText(t('platform.aiConfigImageHeading'), artConfig)}
      </span>
      <span className={`ai-config-status-chip${abilityConfig ? '' : ' is-missing'}`}>
        {statusText(t('platform.aiConfigAbilityHeading'), abilityConfig)}
      </span>
    </div>
  )
}

// ── BGA Reference Image Picker ────────────────────────────────────────────────

/** BGA card image URL given deck letter and card number */
function bgaImgUrl(deck: string, num: number) {
  return `/bga-img/deck${deck}/${deck}${String(num).padStart(3, '0')}.png`
}

// All BGA card images: decks A-E, minors 1-84, occupations 85-168
const DECKS = ['A', 'B', 'C', 'D', 'E'] as const
const MINOR_REF_IMAGES = DECKS.flatMap(d => Array.from({ length: 84 }, (_, i) => bgaImgUrl(d, i + 1)))
const OCC_REF_IMAGES = DECKS.flatMap(d => Array.from({ length: 84 }, (_, i) => bgaImgUrl(d, i + 85)))

async function fetchRefImage(url: string): Promise<ReferenceImage | null> {
  try {
    const resp = await fetch(url)
    if (!resp.ok) return null
    const blob = await resp.blob()
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        const data = dataUrl.split(',')[1] ?? ''
        resolve({ data, mimeType: blob.type || 'image/png' })
      }
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function RefImagePicker({ cardType, selected, onToggle }: {
  cardType: 'minor' | 'occupation'
  selected: string[]
  onToggle: (url: string) => void
}) {
  const { locale } = useLocale()
  const allImages = cardType === 'minor' ? MINOR_REF_IMAGES : OCC_REF_IMAGES
  // Show 6 random images, stable per mount
  const [images] = useState(() => sampleN(allImages, 6))

  return (
    <div className="ai-ref-picker">
      <div className="ai-ref-picker-label">
        {locale === 'zh' ? `参考图片（最多选3张）` : 'Reference images (up to 3)'}
      </div>
      <div className="ai-ref-picker-grid">
        {images.map(url => {
          const isSelected = selected.includes(url)
          const maxed = selected.length >= 3 && !isSelected
          return (
            <button
              key={url}
              type="button"
              className={`ai-ref-thumb${isSelected ? ' selected' : ''}${maxed ? ' maxed' : ''}`}
              onClick={() => !maxed && onToggle(url)}
              title={isSelected ? (locale === 'zh' ? '取消选择' : 'Deselect') : (locale === 'zh' ? '选为参考' : 'Use as reference')}
            >
              <img src={url} alt="" />
              {isSelected && <span className="ai-ref-check">✓</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Canvas Art Processing ──────────────────────────────────────────────────────

async function processCardArt(dataUrl: string, cardType: 'minor' | 'occupation'): Promise<string> {
  const SIZE = 512
  const BORDER = 8
  const GOLD = '#c9a227'
  const R = SIZE / 2 - BORDER / 2 - 2

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = SIZE
      canvas.height = SIZE
      const ctx = canvas.getContext('2d')!
      const cx = SIZE / 2
      const cy = SIZE / 2

      const buildPath = () => {
        ctx.beginPath()
        if (cardType === 'occupation') {
          ctx.arc(cx, cy, R, 0, Math.PI * 2)
        } else {
          // Flat-top hexagon (matching BGA card sprites)
          for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i
            const x = cx + R * Math.cos(angle)
            const y = cy + R * Math.sin(angle)
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.closePath()
        }
      }

      // Clip and draw image cover-fit
      ctx.save()
      buildPath()
      ctx.clip()
      const scale = Math.max(SIZE / img.width, SIZE / img.height)
      const iw = img.width * scale
      const ih = img.height * scale
      ctx.drawImage(img, (SIZE - iw) / 2, (SIZE - ih) / 2, iw, ih)
      ctx.restore()

      // Gold border on top
      buildPath()
      ctx.strokeStyle = GOLD
      ctx.lineWidth = BORDER
      ctx.stroke()

      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = dataUrl
  })
}

// ── Art Panel ─────────────────────────────────────────────────────────────────

function ArtPanel({ cardType, cardName, artUrl, setArtUrl, refCache, configVersion, apiFetch }: {
  cardType: 'minor' | 'occupation'
  cardName: string
  artUrl: string | null
  setArtUrl: (url: string | null) => void
  refCache?: Map<string, ReferenceImage>
  configVersion?: number
  apiFetch: ApiFetch
}) {
  const { locale, t } = useLocale()
  const [config, setConfig] = useState<LlmConfig | null>(() => getLlmConfig(KEY_LLM_CONFIG_ART))

  // Re-read config when the parent's lifted ConfigBar updates it.
  useEffect(() => {
    setConfig(getLlmConfig(KEY_LLM_CONFIG_ART))
  }, [configVersion])
  const [artSubject, setArtSubject] = useState('')
  const [generating, setGenerating] = useState(false)
  const [artPrompt, setArtPrompt] = useState('')
  const [selectedRefs, setSelectedRefs] = useState<string[]>([])
  const [artError, setArtError] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setArtError('')
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsDataURL(file)
      })
      const processed = await processCardArt(dataUrl, cardType)
      const uploaded = await uploadArt(processed, apiFetch)
      setArtUrl(uploaded ?? processed)
    } catch (err) {
      setArtError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleToggleRef = (url: string) => {
    setSelectedRefs(prev =>
      prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]
    )
  }

  // Auto-generate prompt when subject or card type changes
  useEffect(() => {
    if (!artSubject.trim()) {
      setArtPrompt('')
      return
    }
    setArtPrompt(buildCardArtPrompt(artSubject.trim(), cardType, locale as 'zh' | 'en'))
  }, [artSubject, cardType, locale])

  const canGenerateArt = config ? supportsImageGeneration(config) : false

  const handleGenerate = async () => {
    if (!artPrompt.trim() || generating || !canGenerateArt || !config) return
    setGenerating(true)
    setArtError('')
    try {
      // Use pre-fetched cache when available, fall back to live fetch
      const refImages = selectedRefs.length > 0
        ? (await Promise.all(selectedRefs.map(url => refCache?.get(url) ? Promise.resolve(refCache.get(url)!) : fetchRefImage(url)))).filter((r): r is ReferenceImage => r !== null)
        : undefined
      const rawDataUrl = await generateCardArt(artPrompt, config, refImages)
      if (!rawDataUrl) {
        setArtError(locale === 'zh'
          ? '⚠️ 图片生成失败：API 未返回图片数据，请检查 API Key 权限和模型是否支持图片生成'
          : '⚠️ Image generation failed: API returned no image data. Check API key permissions and model support.')
        return
      }
      // Process through hexagonal/circular gold border clipping
      const dataUrl = await processCardArt(rawDataUrl, cardType)
      const uploaded = await uploadArt(dataUrl, apiFetch)
      if (!uploaded) {
        setArtError(locale === 'zh'
          ? '⚠️ 图片上传到服务器失败，图片仅在本地显示'
          : '⚠️ Failed to upload art to server, showing local preview only')
      }
      setArtUrl(uploaded ?? dataUrl)
    } catch (err) {
      setArtError(err instanceof Error ? err.message : 'Art generation error')
    } finally {
      setGenerating(false)
    }
  }

  const borderLabel = cardType === 'occupation'
    ? (locale === 'zh' ? '圆形金边' : 'circular gold-trimmed')
    : (locale === 'zh' ? '六角形金边' : 'hexagonal gold-trimmed')

  return (
    <div className="ai-art-panel">
      <div className="ai-art-panel-header">
        <h3>{locale === 'zh' ? '🖼 卡牌图片' : '🖼 Card Art'}</h3>
        <span className="ai-art-border-tag">{borderLabel}</span>
      </div>

      {!config && (
        <div className="ai-panel-needs-config">
          {locale === 'zh'
            ? `请先在顶部「${t('platform.aiConfig')}」中配置图片生成模型。`
            : `Configure an image-generation model in the top "${t('platform.aiConfig')}" section first.`}
        </div>
      )}

      {artUrl && (
        <div className="ai-art-preview-area">
          <img src={artUrl} alt={cardName || 'card art'} className="ai-art-preview-img" />
        </div>
      )}

      {config && (
        <>
          <div className="form-field">
            <label>
              {cardType === 'occupation'
                ? (locale === 'zh' ? '描述人物形象（如：一个正在锻造铁器的快乐铁匠）' : 'Describe the character (e.g., a cheerful blacksmith forging iron)')
                : (locale === 'zh' ? '描述物品（如：一个由木头和藤条编织的中世纪摇篮）' : 'Describe the object (e.g., a medieval cradle made of wood and wicker)')
              }
            </label>
            <input
              type="text"
              value={artSubject}
              onChange={e => setArtSubject(e.target.value)}
              placeholder={cardType === 'occupation'
                ? (locale === 'zh' ? '一个正在采摘水果的快乐农夫' : 'a cheerful farmer picking fruit')
                : (locale === 'zh' ? '一把质朴的中世纪木锤' : 'a rustic medieval wooden mallet')
              }
            />
          </div>

          {artPrompt && (
            <div className="ai-art-prompt-preview">
              <div className="ai-art-prompt-label">{locale === 'zh' ? '生成提示词' : 'Generation Prompt'}</div>
              <textarea
                className="ai-art-prompt-text"
                value={artPrompt}
                onChange={e => setArtPrompt(e.target.value)}
                rows={4}
              />
            </div>
          )}

          {canGenerateArt && (
            <RefImagePicker
              cardType={cardType}
              selected={selectedRefs}
              onToggle={handleToggleRef}
            />
          )}

          {canGenerateArt ? (
            <button
              type="button"
              className="btn-primary ai-art-gen-btn"
              onClick={handleGenerate}
              disabled={generating || !artPrompt.trim()}
            >
              {generating
                ? (locale === 'zh' ? '生成中…' : 'Generating…')
                : selectedRefs.length > 0
                  ? (locale === 'zh' ? `生成图片（${selectedRefs.length}张参考）` : `Generate (${selectedRefs.length} refs)`)
                  : (locale === 'zh' ? '生成卡牌图片' : 'Generate Card Art')
              }
            </button>
          ) : (
            <div className="ai-art-no-gen">
              {locale === 'zh'
                ? '图片生成需要 Gemini、OpenAI 或 OpenRouter 图片模型'
                : 'Image gen requires Gemini, OpenAI, or OpenRouter image models'
              }
            </div>
          )}

          {artError && <div className="form-error" style={{ marginTop: 8 }}>{artError}</div>}
        </>
      )}

      <div className="ai-art-upload-section">
        <div className="ai-art-upload-divider">
          <span>{locale === 'zh' ? '或者上传自己的图片' : 'Or upload your own image'}</span>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />
        <button
          type="button"
          className="btn-secondary ai-art-upload-btn"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading
            ? (locale === 'zh' ? '处理中…' : 'Processing…')
            : (locale === 'zh' ? '上传图片' : 'Upload Image')
          }
        </button>
        <div className="ai-art-upload-hint">
          {cardType === 'occupation'
            ? (locale === 'zh' ? '上传后自动裁剪为圆形 + 金边' : 'Auto-cropped to circle + gold border')
            : (locale === 'zh' ? '上传后自动裁剪为六角形 + 金边' : 'Auto-cropped to hexagon + gold border')
          }
        </div>
      </div>
    </div>
  )
}

// ── Ability Chat Panel ────────────────────────────────────────────────────────

function AbilityPanel({
  cardType, cardName, prerequisite, costHint, extracted, setExtracted, artUrl, onImport,
  sandboxErrors, onSandboxErrorsConsumed, validationErrors, onValidationErrorsConsumed,
  configVersion,
}: {
  cardType: 'minor' | 'occupation'
  cardName: string
  prerequisite?: string
  costHint?: string
  extracted: ExtractedCard | null
  setExtracted: (e: ExtractedCard | null) => void
  artUrl: string | null
  onImport: (card: ExtractedCard, artUrl: string | null) => void
  sandboxErrors?: string[] | null
  onSandboxErrorsConsumed?: () => void
  validationErrors?: string | null
  onValidationErrorsConsumed?: () => void
  configVersion?: number
}) {
  const { locale, t } = useLocale()
  const [config, setConfig] = useState<LlmConfig | null>(() => getLlmConfig())

  // Re-read config when the parent's lifted ConfigBar updates it.
  useEffect(() => {
    setConfig(getLlmConfig())
  }, [configVersion])
  const [chatError, setChatError] = useState('')
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessages = useCallback(async (chatHistory: ChatMessage[], promptSnapshot?: string) => {
    if (!config) return
    setStreaming(true)
    setChatError('')

    const assistantMsg: DisplayMessage = { role: 'assistant', content: '', streaming: true, promptSnapshot }
    setMessages(prev => [...prev, assistantMsg])

    try {
      let fullText = ''
      for await (const chunk of streamChat(chatHistory, CARD_DESIGNER_SYSTEM_PROMPT, config)) {
        fullText += chunk
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: fullText, streaming: true, promptSnapshot }
          return updated
        })
      }

      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: fullText, promptSnapshot }
        return updated
      })

      const parsed = extractCardFromResponse(fullText)
      if (parsed?.card) {
        setExtracted({
          card: parsed.card as ExtractedCard['card'],
          sourceCode: parsed.sourceCode || undefined,
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      setChatError(msg)
      setMessages(prev => prev.filter(m => !m.streaming))
    } finally {
      setStreaming(false)
    }
  }, [config, setChatError, setExtracted])

  const handleSend = useCallback(async () => {
    if (!input.trim() || !config || streaming) return

    // Prepend card context to user message
    const typeLabel = cardType === 'occupation' ? '职业卡 (Occupation)' : '小发展卡 (Minor Improvement)'
    const parts = [`卡牌类型: ${typeLabel}`]
    if (cardName.trim()) parts.push(`卡牌名称: ${cardName.trim()}`)
    if (prerequisite?.trim()) parts.push(`前置条件: ${prerequisite.trim()}`)
    if (costHint?.trim()) parts.push(`消耗资源: ${costHint.trim()}`)
    // Include existing source code as context when starting a fresh conversation
    // (e.g., user navigated away, came back, and loaded a saved card)
    if (messages.length === 0 && extracted?.sourceCode) {
      parts.push(`\n当前已有代码:\n\`\`\`typescript\n${extracted.sourceCode}\n\`\`\``)
    }
    const context = `[${parts.join(', ')}]\n`

    const userContent = input.trim()
    const enrichedContent = context + userContent

    const userMsg: DisplayMessage = { role: 'user', content: userContent }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')

    // Send enriched version to LLM but display original to user
    const chatHistory: ChatMessage[] = newMessages.map((m, i) => ({
      role: m.isError ? 'user' as const : m.role,
      content: i === newMessages.length - 1 ? enrichedContent : m.content,
    }))
    // Build prompt snapshot for inspection
    const promptSnapshot = [
      `[SYSTEM]\n${CARD_DESIGNER_SYSTEM_PROMPT}`,
      ...chatHistory.map(m => `[${m.role.toUpperCase()}]\n${m.content}`),
    ].join('\n\n---\n\n')
    await sendMessages(chatHistory, promptSnapshot)
  }, [input, config, messages, streaming, sendMessages, cardType, cardName, extracted])

  // Auto-inject sandbox errors
  useEffect(() => {
    if (!sandboxErrors?.length || streaming || !config) return

    const errorText = [
      '⚠️ 沙盒运行报错',
      '',
      '我导入的卡牌在沙盒中运行时出现了以下错误：',
      '',
      ...sandboxErrors.map((e, i) => `${i + 1}. ${e}`),
      '',
      '请根据这些错误修改卡牌定义，并给出完整的修复后 JSON。',
    ].join('\n')

    const errorMsg: DisplayMessage = { role: 'user', content: errorText, isError: true }
    const newMessages = [...messages, errorMsg]
    setMessages(newMessages)
    onSandboxErrorsConsumed?.()

    const chatHistory: ChatMessage[] = newMessages.map(m => ({ role: m.isError ? 'user' as const : m.role, content: m.content }))
    void sendMessages(chatHistory)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sandboxErrors])

  const handleInjectValidationError = useCallback(() => {
    if (!validationErrors || streaming || !config) return
    const errorText = [
      '⚠️ 代码验证失败',
      '',
      '保存卡牌时服务端返回了以下验证错误：',
      '',
      validationErrors,
      '',
      '请修复这些错误，重新给出完整的卡牌代码。注意不要使用 import 语句，所有依赖通过参数注入。',
    ].join('\n')

    const errorMsg: DisplayMessage = { role: 'user', content: errorText, isError: true }
    const newMessages = [...messages, errorMsg]
    setMessages(newMessages)
    onValidationErrorsConsumed?.()

    const chatHistory: ChatMessage[] = newMessages.map(m => ({ role: m.isError ? 'user' as const : m.role, content: m.content }))
    void sendMessages(chatHistory)
  }, [validationErrors, streaming, config, messages, sendMessages, onValidationErrorsConsumed])

  const handleResend = useCallback((msgIndex: number) => {
    if (streaming || !config) return
    // Truncate to messages up to and including this user message
    const truncated = messages.slice(0, msgIndex + 1)
    setMessages(truncated)
    const chatHistory: ChatMessage[] = truncated.map(m => ({
      role: m.isError ? 'user' as const : m.role,
      content: m.content,
    }))
    const promptSnapshot = [
      `[SYSTEM]\n${CARD_DESIGNER_SYSTEM_PROMPT}`,
      ...chatHistory.map(m => `[${m.role.toUpperCase()}]\n${m.content}`),
    ].join('\n\n---\n\n')
    void sendMessages(chatHistory, promptSnapshot)
  }, [streaming, config, messages, sendMessages])

  return (
    <div className="ai-ability-panel">
      <div className="ai-ability-panel-header">
        <h3>{locale === 'zh' ? '💬 卡牌能力' : '💬 Card Ability'}</h3>
        {extracted && (
          <button
            type="button"
            className="btn-primary ws-btn-sm"
            onClick={() => onImport(extracted, artUrl)}
          >
            {locale === 'zh' ? '导入手动编辑器（可微调字段）→' : 'Import to manual editor →'}
          </button>
        )}
      </div>

      {!config && (
        <div className="ai-panel-needs-config">
          {locale === 'zh'
            ? `请先在顶部「${t('platform.aiConfig')}」中配置能力生成模型。`
            : `Configure an ability-generation model in the top "${t('platform.aiConfig')}" section first.`}
        </div>
      )}

      {chatError && <div className="form-error" style={{ marginTop: 4, marginBottom: 4 }}>{chatError}</div>}

      <div className="ai-chat-area">
        {messages.length === 0 && (
          <div className="ai-chat-hint">
            <p>{locale === 'zh' ? '描述你想设计的卡牌效果，AI 会生成符合 Agricola 规范的卡牌定义。' : 'Describe the card effect you want. AI will generate an Agricola-compatible card definition.'}</p>
            <p>{locale === 'zh' ? '示例：' : 'Examples:'}</p>
            <ul>
              <li>{locale === 'zh' ? '"工人回家时可以花 1 粮食换 3 食物，费用 1 木头"' : '"Spend 1 grain for 3 food when workers return home, costs 1 wood"'}</li>
              <li>{locale === 'zh' ? '"建造房间时节省 1 黏土"' : '"Save 1 clay when building rooms"'}</li>
            </ul>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`ai-message ai-message-${msg.role}${msg.isError ? ' ai-message-error' : ''}`}>
            <div className="ai-message-role">
              {msg.isError ? (locale === 'zh' ? '沙盒报错' : 'Sandbox Error')
                : msg.role === 'user' ? (locale === 'zh' ? '你' : 'You')
                : 'AI'}
              {msg.role === 'user' && !streaming && (
                <button
                  type="button"
                  className="btn-link ai-resend-btn"
                  onClick={() => handleResend(i)}
                  title={locale === 'zh' ? '从这条消息重新发送' : 'Resend from this message'}
                >
                  ↻
                </button>
              )}
            </div>
            {msg.role === 'assistant' && msg.promptSnapshot && (
              <details className="ai-prompt-details">
                <summary className="ai-prompt-summary">
                  {locale === 'zh' ? '查看完整 Prompt' : 'View full prompt'}
                </summary>
                <pre className="ai-prompt-text">{msg.promptSnapshot}</pre>
              </details>
            )}
            <div className={`ai-message-content${msg.streaming ? ' ai-streaming' : ''}`}>
              {msg.role === 'assistant'
                ? <MessageContent text={msg.content || (msg.streaming ? '▋' : '')} />
                : (msg.content || (msg.streaming ? '▋' : ''))
              }
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {extracted && (
        <div className="ai-extracted-summary">
          <span className="ws-badge">{extracted.card.card_type === 'minor' ? (locale === 'zh' ? '小改进' : 'Minor') : (locale === 'zh' ? '职业' : 'Occupation')}</span>
          <span className="ai-extracted-name">{extracted.card.name}</span>
          <ResourceText text={(extracted.card.desc ?? []).join(' ')} />
        </div>
      )}

      {validationErrors && (
        <div className="ai-validation-error-bar">
          <div className="ai-validation-error-text">
            ⚠️ {locale === 'zh' ? '代码验证失败' : 'Code validation failed'}：{validationErrors}
          </div>
          <button
            type="button"
            className="btn-primary ws-btn-sm"
            onClick={handleInjectValidationError}
            disabled={streaming || !config}
          >
            {locale === 'zh' ? '发送给 AI 修复' : 'Send to AI to fix'}
          </button>
        </div>
      )}

      {config && (
        <div className="ai-input-area">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={locale === 'zh' ? '描述你想要的卡牌效果…' : 'Describe the card effect…'}
            rows={2}
            disabled={streaming}
          />
          <button
            type="button"
            className="btn-primary ai-send-btn"
            onClick={handleSend}
            disabled={streaming || !input.trim()}
          >
            {streaming ? '…' : '→'}
          </button>
        </div>
      )}
    </div>
  )
}

function sampleN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, n)
}

// ── Main AiCardDesigner ───────────────────────────────────────────────────────

type CardLocaleEntry = {
  name: string
  desc: string[]
  prerequisite?: string
}

const WORKSHOP_STAGES: WorkshopStage[] = [
  'metadata',
  'art',
  'ability',
  'localization',
  'validation',
]

const readLocales = (value: unknown): Record<string, CardLocaleEntry> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, CardLocaleEntry>
    : {}

const draftToExtracted = (draft: WorkshopClientDraft): ExtractedCard => {
  const cardJson = draft.cardJson
  const cost = cardJson.cost && typeof cardJson.cost === 'object' && !Array.isArray(cardJson.cost)
    ? cardJson.cost as Record<string, number>
    : {}
  return {
    card: {
      id: draft.cardId,
      name: draft.name,
      card_type: draft.cardType,
      cost,
      vp: typeof cardJson.vp === 'number' ? cardJson.vp : 0,
      desc: Array.isArray(cardJson.desc)
        ? cardJson.desc.filter((value): value is string => typeof value === 'string')
        : [],
      prerequisite: typeof cardJson.prerequisite === 'string'
        ? cardJson.prerequisite
        : undefined,
      modifiers: Array.isArray(cardJson.modifiers) ? cardJson.modifiers : [],
      locales: readLocales(cardJson.locales),
    },
    sourceCode: draft.effectCode ?? undefined,
  }
}

type AiCardDesignerProps = {
  initialCard?: ApiCard
  onImport: (card: ExtractedCard, artUrl: string | null) => void
  onClose: () => void
  onAddToSandboxAndRestart?: (cardDbId: string) => Promise<void>
  sandboxErrors?: string[] | null
  onSandboxErrorsConsumed?: () => void
  onCardLoaded?: (cardDbId: string) => void
  apiFetch?: ApiFetch
}

export function AiCardDesigner({
  initialCard,
  onImport,
  onClose,
  onAddToSandboxAndRestart,
  sandboxErrors,
  onSandboxErrorsConsumed,
  onCardLoaded,
  apiFetch,
}: AiCardDesignerProps) {
  const { locale, t } = useLocale()
  const workshopApiFetch = apiFetch ?? cookieApiFetch
  const [cardType, setCardType] = useState<'minor' | 'occupation'>('minor')
  const [cardName, setCardName] = useState('')
  const [cardIdInput, setCardIdInput] = useState('')
  const [prerequisite, setPrerequisite] = useState('')
  const [costInput, setCostInput] = useState('')
  const [extracted, setExtracted] = useState<ExtractedCard | null>(null)
  const [artUrl, setArtUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [validationErrors, setValidationErrors] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [refCache, setRefCache] = useState<Map<string, ReferenceImage>>(new Map())
  const [myCards, setMyCards] = useState<ApiCard[]>([])
  const [currentCardDbId, setCurrentCardDbId] = useState<string | null>(null)
  const [showLocalizationModal, setShowLocalizationModal] = useState(false)
  const [cardLocales, setCardLocales] = useState<Record<string, CardLocaleEntry>>({})
  const [pendingStage, setPendingStage] = useState<WorkshopStage | null>(null)
  const hydratedWorkspaceRef = useRef('')
  const [abilityConfig, setAbilityConfig] = useState<LlmConfig | null>(() => getLlmConfig())
  const [artConfig, setArtConfig] = useState<LlmConfig | null>(() => getLlmConfig(KEY_LLM_CONFIG_ART))
  const [configVersion, setConfigVersion] = useState(0)
  const {
    state: controllerState,
    loading: controllerLoading,
    error: controllerError,
    updateDraft,
    checkpoint,
    retryCheckpoint,
    changeStage,
    resolveConflict,
  } = useWorkshopDraft({
    cardId: currentCardDbId ?? '',
    apiFetch: workshopApiFetch,
  })
  const workspaceState = controllerState?.workspaceId === currentCardDbId
    ? controllerState
    : null

  useEffect(() => {
    let cancelled = false
    const prefetchUrls = [
      ...sampleN(MINOR_REF_IMAGES, 3),
      ...sampleN(OCC_REF_IMAGES, 3),
    ]
    void Promise.all(
      prefetchUrls.map(async url => ({ url, image: await fetchRefImage(url) })),
    ).then(entries => {
      if (cancelled) return
      setRefCache(previous => {
        const next = new Map(previous)
        for (const { url, image } of entries) {
          if (image) next.set(url, image)
        }
        return next
      })
    })
    return () => { cancelled = true }
  }, [])

  const refreshMyCards = useCallback(() => {
    void workshopApiFetch('/api/workshop/cards?scope=mine')
      .then(response => response.json())
      .then(data => {
        if (data.ok) setMyCards(data.cards as ApiCard[])
      })
      .catch(reason => {
        console.warn('[AiCardDesigner] Failed to load saved designs:', reason)
      })
  }, [workshopApiFetch])

  useEffect(() => { refreshMyCards() }, [refreshMyCards])

  const hydrateDraft = useCallback((draft: WorkshopClientDraft) => {
    const restored = draftToExtracted(draft)
    const rawDraft = draft.cardJson._draft && typeof draft.cardJson._draft === 'object'
      ? draft.cardJson._draft as { prerequisite?: string; costInput?: string }
      : {}
    setCardType(draft.cardType)
    setCardName(draft.name)
    setCardIdInput(draft.cardId)
    setPrerequisite(rawDraft.prerequisite ?? restored.card.prerequisite ?? '')
    setCostInput(rawDraft.costInput ?? Object.entries(restored.card.cost)
      .map(([resource, amount]) => `${amount} ${resource}`)
      .join(' '))
    setExtracted(restored)
    setArtUrl(draft.artUrl)
    setCardLocales(restored.card.locales ?? {})
  }, [])

  useEffect(() => {
    if (!workspaceState) return
    const hydrationKey = `${workspaceState.workspaceId}:${workspaceState.baseRevision}`
    if (hydratedWorkspaceRef.current === hydrationKey) return
    hydratedWorkspaceRef.current = hydrationKey
    hydrateDraft(workspaceState.draft)
  }, [hydrateDraft, workspaceState])

  const patchDraft = useCallback((
    apply: (current: WorkshopClientDraft) => WorkshopClientDraft,
  ) => {
    if (workspaceState) updateDraft(apply(workspaceState.draft))
  }, [updateDraft, workspaceState])

  const handleLoadCard = useCallback((apiCard: ApiCard) => {
    const cardJson = apiCard.card_json
    const nextType = cardJson.card_type === 'occupation' || apiCard.card_type === 'occupation'
      ? 'occupation'
      : 'minor'
    const nextExtracted: ExtractedCard = {
      card: {
        id: typeof cardJson.id === 'string' ? cardJson.id : apiCard.card_id,
        name: apiCard.name,
        card_type: nextType,
        cost: cardJson.cost && typeof cardJson.cost === 'object'
          ? cardJson.cost as Record<string, number>
          : {},
        vp: typeof cardJson.vp === 'number' ? cardJson.vp : 0,
        desc: Array.isArray(cardJson.desc)
          ? cardJson.desc.filter((value): value is string => typeof value === 'string')
          : [],
        prerequisite: typeof cardJson.prerequisite === 'string'
          ? cardJson.prerequisite
          : undefined,
        modifiers: Array.isArray(cardJson.modifiers) ? cardJson.modifiers : [],
        locales: readLocales(cardJson.locales),
      },
      sourceCode: apiCard.effect_code ?? undefined,
    }
    const rawDraft = cardJson._draft && typeof cardJson._draft === 'object'
      ? cardJson._draft as { prerequisite?: string; costInput?: string }
      : {}
    setCardType(nextType)
    setCardName(apiCard.name)
    setCardIdInput(apiCard.card_id)
    setPrerequisite(rawDraft.prerequisite ?? nextExtracted.card.prerequisite ?? '')
    setCostInput(rawDraft.costInput ?? Object.entries(nextExtracted.card.cost)
      .map(([resource, amount]) => `${amount} ${resource}`)
      .join(' '))
    setExtracted(nextExtracted)
    setArtUrl(apiCard.art_url)
    setCardLocales(nextExtracted.card.locales ?? {})
    setCurrentCardDbId(apiCard.id)
    onCardLoaded?.(apiCard.id)
  }, [onCardLoaded])

  useEffect(() => {
    if (initialCard) handleLoadCard(initialCard)
  }, [handleLoadCard, initialCard])

  useEffect(() => {
    if (!pendingStage || !workspaceState) return
    void changeStage(pendingStage).then(changed => {
      if (changed) setPendingStage(null)
    })
  }, [changeStage, pendingStage, workspaceState])

  const buildCardJson = (): Record<string, unknown> => ({
    id: cardIdInput,
    name: cardName,
    card_type: cardType,
    deck: 'CUSTOM',
    number: 0,
    desc: extracted?.card.desc ?? [],
    cost: extracted?.card.cost ?? {},
    vp: extracted?.card.vp ?? 0,
    prerequisite: extracted?.card.prerequisite ?? (prerequisite || undefined),
    modifiers: extracted?.card.modifiers ?? [],
    implemented: true,
    _draft: {
      prerequisite: prerequisite || undefined,
      costInput: costInput || undefined,
    },
    ...(Object.keys(cardLocales).length > 0 ? { locales: cardLocales } : {}),
  })

  const createDraft = async (): Promise<string | null> => {
    const name = extracted?.card.name.trim() || cardName.trim()
    if (!name) {
      setError(locale === 'zh' ? '请先设置卡牌名称' : 'Card name is required')
      return null
    }
    const nextCardId = isValidCardId(cardIdInput.trim()).valid
      ? cardIdInput.trim()
      : autoCardId(name)
    const idCheck = isValidCardId(nextCardId)
    if (!idCheck.valid) {
      setError(locale === 'zh'
        ? `卡牌 ID 格式错误：${idCheck.reason}`
        : `Invalid card ID: ${idCheck.reason}`)
      return null
    }
    setSaving(true)
    setError('')
    setSaveSuccess(false)
    try {
      const response = await workshopApiFetch('/api/workshop/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_id: nextCardId,
          card_type: extracted?.card.card_type ?? cardType,
          name,
          description: (extracted?.card.desc ?? []).join(' '),
          card_json: { ...buildCardJson(), id: nextCardId, name },
          art_url: artUrl,
          status: 'draft',
          ...(extracted?.sourceCode ? { effect_code: extracted.sourceCode } : {}),
        }),
      })
      const data = await response.json() as {
        ok: boolean
        id?: string
        error?: string
        errors?: string[]
      }
      if (!response.ok || !data.ok || !data.id) {
        const details = data.errors?.join('\n')
        if (details) setValidationErrors(details)
        setError([
          data.error ?? (locale === 'zh' ? '保存失败' : 'Save failed'),
          details,
        ].filter(Boolean).join(':\n'))
        return null
      }
      setCardIdInput(nextCardId)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
      return data.id
    } catch {
      setError(locale === 'zh' ? '网络错误' : 'Network error')
      return null
    } finally {
      setSaving(false)
    }
  }

  const handleSaveCard = async (): Promise<string | null> => {
    if (workspaceState) {
      setSaving(true)
      setError('')
      const saved = await checkpoint()
      setSaving(false)
      if (!saved) return null
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
      refreshMyCards()
      return workspaceState.workspaceId
    }
    if (currentCardDbId) {
      setError(locale === 'zh'
        ? '草稿尚未恢复，请稍后重试'
        : 'Draft is still loading. Try again shortly.')
      return null
    }
    const dbId = await createDraft()
    if (!dbId) return null
    setCurrentCardDbId(dbId)
    onCardLoaded?.(dbId)
    refreshMyCards()
    return dbId
  }

  const updateCardType = (next: 'minor' | 'occupation') => {
    setCardType(next)
    patchDraft(current => ({
      ...current,
      cardType: next,
      cardJson: { ...current.cardJson, card_type: next },
    }))
  }

  const updateCardName = (next: string) => {
    const previousAutoId = autoCardId(cardName)
    const nextAutoId = autoCardId(next)
    const shouldUpdateId = (!cardIdInput || cardIdInput === previousAutoId) && nextAutoId.length > 7
    setCardName(next)
    if (shouldUpdateId) setCardIdInput(nextAutoId)
    patchDraft(current => ({
      ...current,
      name: next,
      cardId: shouldUpdateId ? nextAutoId : current.cardId,
      cardJson: {
        ...current.cardJson,
        name: next,
        id: shouldUpdateId ? nextAutoId : current.cardId,
      },
    }))
  }

  const updateCardId = (next: string) => {
    setCardIdInput(next)
    patchDraft(current => ({
      ...current,
      cardId: next,
      cardJson: { ...current.cardJson, id: next },
    }))
  }

  const updatePrerequisite = (next: string) => {
    setPrerequisite(next)
    patchDraft(current => {
      const rawDraft = current.cardJson._draft && typeof current.cardJson._draft === 'object'
        ? current.cardJson._draft as Record<string, unknown>
        : {}
      return {
        ...current,
        cardJson: {
          ...current.cardJson,
          prerequisite: next || undefined,
          _draft: {
            ...rawDraft,
            prerequisite: next || undefined,
            costInput: costInput || undefined,
          },
        },
      }
    })
  }

  const updateCost = (next: string) => {
    setCostInput(next)
    patchDraft(current => {
      const rawDraft = current.cardJson._draft && typeof current.cardJson._draft === 'object'
        ? current.cardJson._draft as Record<string, unknown>
        : {}
      return {
        ...current,
        cardJson: {
          ...current.cardJson,
          _draft: {
            ...rawDraft,
            prerequisite: prerequisite || undefined,
            costInput: next || undefined,
          },
        },
      }
    })
  }

  const updateArt = (next: string | null) => {
    setArtUrl(next)
    patchDraft(current => ({ ...current, artUrl: next }))
  }

  const updateLocales = (next: Record<string, CardLocaleEntry>) => {
    setCardLocales(next)
    patchDraft(current => ({
      ...current,
      cardJson: { ...current.cardJson, locales: next },
    }))
  }

  const updateExtracted = (next: ExtractedCard | null) => {
    setExtracted(next)
    if (!next) return
    const nextCardId = isValidCardId(next.card.id).valid ? next.card.id : cardIdInput
    const nextLocales = { ...cardLocales, ...(next.card.locales ?? {}) }
    setCardType(next.card.card_type)
    setCardName(next.card.name)
    setCardIdInput(nextCardId)
    setPrerequisite(next.card.prerequisite ?? prerequisite)
    setCardLocales(nextLocales)
    patchDraft(current => ({
      ...current,
      cardId: nextCardId,
      cardType: next.card.card_type,
      name: next.card.name,
      description: next.card.desc.join(' '),
      effectCode: next.sourceCode ?? null,
      compiledCode: null,
      codeManifest: null,
      cardJson: {
        ...current.cardJson,
        ...next.card,
        id: nextCardId,
        name: next.card.name,
        card_type: next.card.card_type,
        deck: 'CUSTOM',
        number: 0,
        implemented: true,
        locales: nextLocales,
        _draft: {
          prerequisite: (next.card.prerequisite ?? prerequisite) || undefined,
          costInput: costInput || undefined,
        },
      },
    }))
  }

  const handleStageChange = async (stage: WorkshopStage) => {
    if (workspaceState) {
      await changeStage(stage)
      return
    }
    setPendingStage(stage)
    if (!currentCardDbId) await handleSaveCard()
  }

  const handleSaveAndAddToSandbox = async () => {
    if (!onAddToSandboxAndRestart) return
    const cardDbId = await handleSaveCard()
    if (cardDbId) await onAddToSandboxAndRestart(cardDbId)
  }

  const localizationReady = isLocaleEntryComplete(cardLocales.zh)
  const metadataReady = Boolean(cardName.trim() && isValidCardId(cardIdInput.trim()).valid)
  const readiness: Record<WorkshopStage, boolean> = {
    metadata: metadataReady,
    art: Boolean(artUrl),
    ability: Boolean(extracted?.sourceCode),
    localization: localizationReady,
    validation: Boolean(
      metadataReady
      && artUrl
      && extracted?.sourceCode
      && localizationReady
      && workspaceState?.sandboxPassVersionId,
    ),
  }
  const activeStage = workspaceState?.stage ?? 'metadata'
  const activeStageIndex = WORKSHOP_STAGES.indexOf(activeStage)
  const stageCopy: Record<WorkshopStage, { label: string; helper: string }> = locale === 'zh'
    ? {
        metadata: { label: '基础信息', helper: '名称、类型与卡牌 ID' },
        art: { label: '卡面图', helper: '提示词、参考图与候选' },
        ability: { label: '卡牌能力', helper: '对话、源码与验证' },
        localization: { label: '本地化', helper: '补齐中英文案' },
        validation: { label: '验证与交付', helper: '沙盒测试和发布检查' },
      }
    : {
        metadata: { label: 'Card details', helper: 'Name, type, and card ID' },
        art: { label: 'Card art', helper: 'Prompt, references, and candidates' },
        ability: { label: 'Card ability', helper: 'Conversation, source, and validation' },
        localization: { label: 'Localization', helper: 'Complete Chinese and English copy' },
        validation: { label: 'Validate & hand off', helper: 'Sandbox test and publish checks' },
      }
  const saveStatus = saving
    ? (locale === 'zh' ? '正在保存' : 'Saving')
    : controllerState?.save.status === 'dirty'
      ? (locale === 'zh' ? '有未保存修改' : 'Unsaved changes')
      : controllerState?.save.status === 'offline'
        ? (locale === 'zh' ? '离线，已保存在本机' : 'Offline, saved locally')
        : controllerState?.save.status === 'conflict'
          ? (locale === 'zh' ? '需要选择草稿版本' : 'Draft choice required')
          : (locale === 'zh' ? '已保存' : 'Saved')
  const descriptionLines = extracted?.card.desc ?? []

  return (
    <div className="ai-designer aicw-shell">
      <header className="aicw-header">
        <div className="aicw-heading">
          <span>{locale === 'zh' ? '卡牌工坊 / AI 卡牌设计师' : 'Card Workshop / AI Card Designer'}</span>
          <div>
            <h2>{cardName || (locale === 'zh' ? '新卡牌草稿' : 'New card draft')}</h2>
            <span className="aicw-draft-badge">
              {workspaceState?.status === 'published'
                ? (locale === 'zh' ? '已发布' : 'Published')
                : (locale === 'zh' ? '草稿' : 'Draft')}
            </span>
          </div>
          <code>{cardIdInput || 'CUSTOM_'}</code>
        </div>
        <div className="aicw-header-actions">
          <span className={`aicw-save-state is-${controllerState?.save.status ?? 'saved'}`} aria-live="polite">
            {saveStatus}
          </span>
          <button
            type="button"
            className={`aicw-button aicw-button-primary${saveSuccess ? ' is-success' : ''}`}
            onClick={() => { void handleSaveCard() }}
            disabled={saving || !metadataReady || Boolean(currentCardDbId && controllerLoading)}
          >
            {saveSuccess
              ? (locale === 'zh' ? '已保存' : 'Saved')
              : (locale === 'zh' ? '保存草稿' : 'Save draft')}
          </button>
          <button type="button" className="aicw-button" onClick={onClose}>
            {locale === 'zh' ? '关闭' : 'Close'}
          </button>
        </div>
      </header>

      <div className="ai-designer-config-section">
        <Section
          collapsible
          defaultCollapsed={Boolean(abilityConfig && artConfig)}
          locale={locale}
          icon=""
          title={t('platform.aiConfig')}
          actions={
            <ConfigStatusSummary
              artConfig={artConfig}
              abilityConfig={abilityConfig}
              locale={locale}
              t={t}
            />
          }
          variant="parchment"
        >
          {!abilityConfig && !artConfig && (
            <div className="ai-config-missing-alert">
              <strong>{t('platform.aiConfigMissingTitle')}</strong>
              <span>{t('platform.aiConfigMissingBody')}</span>
            </div>
          )}
          <div className="ai-config-grid">
            <div className="ai-config-grid-col">
              <h4 className="ai-config-grid-heading">{t('platform.aiConfigImageHeading')}</h4>
              <ConfigBar
                storageKey={KEY_LLM_CONFIG_ART}
                capability="image"
                config={artConfig}
                onConfigured={() => {
                  setArtConfig(getLlmConfig(KEY_LLM_CONFIG_ART))
                  setConfigVersion(value => value + 1)
                }}
                onClear={() => {
                  setArtConfig(null)
                  setConfigVersion(value => value + 1)
                }}
              />
            </div>
            <div className="ai-config-grid-col">
              <h4 className="ai-config-grid-heading">{t('platform.aiConfigAbilityHeading')}</h4>
              <ConfigBar
                capability="chat"
                config={abilityConfig}
                onConfigured={() => {
                  setAbilityConfig(getLlmConfig())
                  setConfigVersion(value => value + 1)
                }}
                onClear={() => {
                  setAbilityConfig(null)
                  setConfigVersion(value => value + 1)
                }}
              />
            </div>
          </div>
        </Section>
      </div>

      {myCards.length > 0 && (
        <div className="aicw-design-picker">
          <label htmlFor="aicw-card-picker">{locale === 'zh' ? '切换草稿' : 'Switch draft'}</label>
          <select
            id="aicw-card-picker"
            value={currentCardDbId ?? ''}
            onChange={event => {
              const card = myCards.find(item => item.id === event.target.value)
              if (card) handleLoadCard(card)
            }}
          >
            <option value="">{locale === 'zh' ? '选择已有卡牌' : 'Select a saved card'}</option>
            {myCards.map(card => (
              <option key={card.id} value={card.id}>
                {card.name} · {card.card_type === 'minor'
                  ? (locale === 'zh' ? '小发展' : 'Minor')
                  : (locale === 'zh' ? '职业' : 'Occupation')}
              </option>
            ))}
          </select>
        </div>
      )}

      {controllerState?.conflict && (
        <section className="aicw-conflict" role="alert">
          <div>
            <strong>{locale === 'zh' ? '服务器上已有更新' : 'The server draft changed'}</strong>
            <span>
              {locale === 'zh'
                ? '请选择保留服务器整份草稿，或用本机整份草稿覆盖后继续。'
                : 'Keep the complete server draft, or retry with the complete local draft.'}
            </span>
          </div>
          <div>
            <button type="button" className="aicw-button" onClick={() => { void resolveConflict('server') }}>
              {locale === 'zh' ? '使用服务器草稿' : 'Use server draft'}
            </button>
            <button type="button" className="aicw-button aicw-button-primary" onClick={() => { void resolveConflict('local') }}>
              {locale === 'zh' ? '保留本机草稿' : 'Keep local draft'}
            </button>
          </div>
        </section>
      )}

      {(controllerError || controllerState?.save.status === 'offline' || controllerState?.save.status === 'error') && (
        <section className="aicw-recovery" role="status">
          <span>
            {controllerError
              ?? controllerState?.save.error
              ?? (locale === 'zh' ? '修改已保存在本机。' : 'Changes are saved on this device.')}
          </span>
          {controllerState && (
            <button type="button" className="aicw-button" onClick={() => { void retryCheckpoint() }}>
              {locale === 'zh' ? '重试保存' : 'Retry save'}
            </button>
          )}
        </section>
      )}

      <main className="aicw-layout">
        <aside className="aicw-preview-pane">
          <div className="aicw-section-heading">
            <span>{locale === 'zh' ? '实时卡牌' : 'Live card'}</span>
            <small>{locale === 'zh' ? '当前已采用草稿' : 'Current adopted draft'}</small>
          </div>
          <article className={`aicw-card is-${cardType}`}>
            <div className="aicw-card-meta">
              <span>{cardType === 'minor'
                ? (locale === 'zh' ? '小发展' : 'Minor')
                : (locale === 'zh' ? '职业' : 'Occupation')}</span>
              <span>{costInput || (locale === 'zh' ? '无费用' : 'No cost')}</span>
            </div>
            <div className="aicw-card-art">
              {artUrl
                ? <img src={artUrl} alt={cardName || (locale === 'zh' ? '卡牌图片' : 'Card art')} />
                : <span>{locale === 'zh' ? '尚未采用卡面图' : 'No adopted art yet'}</span>}
            </div>
            <div className="aicw-card-copy">
              <h3>{cardLocales[locale]?.name || cardName || (locale === 'zh' ? '未命名卡牌' : 'Untitled card')}</h3>
              {prerequisite && <p className="aicw-prerequisite">{prerequisite}</p>}
              {descriptionLines.length > 0
                ? descriptionLines.map((line, index) => <ResourceText key={`${line}-${index}`} text={line} />)
                : <p className="aicw-empty-copy">{locale === 'zh' ? '能力说明会在采用代码后显示。' : 'Ability text appears after code is adopted.'}</p>}
              <code>{cardIdInput || 'CUSTOM_'}</code>
            </div>
          </article>
          <div className="aicw-readiness" aria-label={locale === 'zh' ? '草稿完整度' : 'Draft completeness'}>
            {WORKSHOP_STAGES.slice(0, 4).map(stage => (
              <div key={stage}>
                <span className={readiness[stage] ? 'is-ready' : ''} aria-hidden="true" />
                <strong>{stageCopy[stage].label}</strong>
                <small>{readiness[stage]
                  ? (locale === 'zh' ? '已就绪' : 'Ready')
                  : (locale === 'zh' ? '待完成' : 'Incomplete')}</small>
              </div>
            ))}
          </div>
        </aside>

        <section className="aicw-workspace">
          <nav className="aicw-stage-rail" aria-label={locale === 'zh' ? '设计阶段' : 'Design stages'}>
            <span className="aicw-stage-title">{locale === 'zh' ? '设计阶段' : 'Design stages'}</span>
            {WORKSHOP_STAGES.map((stage, index) => (
              <button
                type="button"
                key={stage}
                className={activeStage === stage ? 'is-active' : ''}
                aria-current={activeStage === stage ? 'step' : undefined}
                onClick={() => { void handleStageChange(stage) }}
              >
                <span className={`aicw-stage-marker${readiness[stage] ? ' is-ready' : ''}`}>
                  {readiness[stage] ? '✓' : index + 1}
                </span>
                <span>
                  <strong>{stageCopy[stage].label}</strong>
                  <small>{stageCopy[stage].helper}</small>
                </span>
              </button>
            ))}
            <div className="aicw-stage-progress">
              <span>{locale === 'zh' ? '当前步骤' : 'Current step'}</span>
              <strong>{activeStageIndex + 1} / {WORKSHOP_STAGES.length}</strong>
            </div>
          </nav>

          <div className="aicw-stage-content" key={activeStage}>
            <div className="aicw-stage-heading">
              <div>
                <span>{locale === 'zh' ? '当前任务' : 'Current task'}</span>
                <h2>{stageCopy[activeStage].label}</h2>
                <p>{stageCopy[activeStage].helper}</p>
              </div>
              <span className={`aicw-status-tag${readiness[activeStage] ? ' is-ready' : ''}`}>
                {readiness[activeStage]
                  ? (locale === 'zh' ? '已就绪' : 'Ready')
                  : (locale === 'zh' ? '进行中' : 'In progress')}
              </span>
            </div>

            {currentCardDbId && controllerLoading && (
              <div className="aicw-loading" role="status">
                {locale === 'zh' ? '正在恢复草稿…' : 'Restoring draft…'}
              </div>
            )}

            {!controllerLoading && activeStage === 'metadata' && (
              <div className="aicw-metadata">
                <fieldset>
                  <legend>{locale === 'zh' ? '卡牌类型' : 'Card type'}</legend>
                  <div className="ai-card-type-toggle">
                    <button type="button" className={`ai-type-btn${cardType === 'minor' ? ' active' : ''}`} onClick={() => updateCardType('minor')}>
                      {locale === 'zh' ? '小发展' : 'Minor improvement'}
                    </button>
                    <button type="button" className={`ai-type-btn${cardType === 'occupation' ? ' active' : ''}`} onClick={() => updateCardType('occupation')}>
                      {locale === 'zh' ? '职业' : 'Occupation'}
                    </button>
                  </div>
                </fieldset>
                <label>
                  <span>{locale === 'zh' ? '英文卡牌名' : 'Card name'}</span>
                  <input type="text" value={cardName} onChange={event => updateCardName(event.target.value)} placeholder={locale === 'zh' ? '例如 Medieval Mallet' : 'e.g. Medieval Mallet'} />
                </label>
                <label>
                  <span>{locale === 'zh' ? '卡牌 ID' : 'Card ID'}</span>
                  <input type="text" className="aicw-code-input" value={cardIdInput} onChange={event => updateCardId(event.target.value)} placeholder="CUSTOM_MedievalMallet" />
                  {cardIdInput && !isValidCardId(cardIdInput).valid && <small className="form-error">{isValidCardId(cardIdInput).reason}</small>}
                </label>
                {cardType === 'minor' && (
                  <div className="aicw-field-row">
                    <label>
                      <span>{t('platform.prerequisite')}</span>
                      <input id="ai-prerequisite-input" type="text" value={prerequisite} onChange={event => updatePrerequisite(event.target.value)} placeholder={locale === 'zh' ? '可选，如：2 个职业' : 'Optional, e.g. 2 occupations'} />
                    </label>
                    <label>
                      <span>{t('platform.cost')}</span>
                      <input id="ai-cost-input" type="text" value={costInput} onChange={event => updateCost(event.target.value)} placeholder={locale === 'zh' ? '可选，如：1 木 2 黏土' : 'Optional, e.g. 1 wood 2 clay'} />
                    </label>
                  </div>
                )}
                <div className="aicw-inline-actions">
                  <span>{locale === 'zh' ? '保存后即可进入图片、能力和本地化步骤。' : 'Save once to unlock the remaining design stages.'}</span>
                  <button type="button" className="aicw-button aicw-button-primary" disabled={!metadataReady || saving} onClick={() => { void handleStageChange('art') }}>
                    {locale === 'zh' ? '保存并继续到卡面图' : 'Save and continue to art'}
                  </button>
                </div>
              </div>
            )}

            {!controllerLoading && activeStage === 'art' && (
              <ArtPanel
                cardType={cardType}
                cardName={cardName}
                artUrl={artUrl}
                setArtUrl={updateArt}
                refCache={refCache}
                configVersion={configVersion}
                apiFetch={workshopApiFetch}
              />
            )}

            {!controllerLoading && activeStage === 'ability' && (
              <AbilityPanel
                cardType={cardType}
                cardName={cardName}
                prerequisite={prerequisite}
                costHint={costInput}
                extracted={extracted}
                setExtracted={updateExtracted}
                artUrl={artUrl}
                onImport={onImport}
                sandboxErrors={sandboxErrors}
                onSandboxErrorsConsumed={onSandboxErrorsConsumed}
                validationErrors={validationErrors}
                onValidationErrorsConsumed={() => setValidationErrors(null)}
                configVersion={configVersion}
              />
            )}

            {!controllerLoading && activeStage === 'localization' && (
              <div className="aicw-localization">
                <div>
                  <strong>{localizationReady
                    ? (locale === 'zh' ? '中文本地化已完整' : 'Chinese localization is complete')
                    : (locale === 'zh' ? '中文本地化尚未完成' : 'Chinese localization is incomplete')}</strong>
                  <p>{locale === 'zh' ? '英文原文保留在卡牌定义中；提交社区 PR 前必须补齐中文名称与说明。' : 'English stays in the card definition; Chinese name and description are required before handoff.'}</p>
                </div>
                <button type="button" className="aicw-button aicw-button-primary" onClick={() => setShowLocalizationModal(true)} disabled={!cardName.trim()}>
                  {localizationReady
                    ? (locale === 'zh' ? '检查本地化' : 'Review localization')
                    : (locale === 'zh' ? '开始本地化' : 'Start localization')}
                </button>
              </div>
            )}

            {!controllerLoading && activeStage === 'validation' && (
              <div className="aicw-validation">
                <ul>
                  {WORKSHOP_STAGES.slice(0, 4).map(stage => (
                    <li key={stage} className={readiness[stage] ? 'is-ready' : ''}>
                      <span aria-hidden="true">{readiness[stage] ? '✓' : '–'}</span>
                      <div>
                        <strong>{stageCopy[stage].label}</strong>
                        <small>{readiness[stage]
                          ? (locale === 'zh' ? '已完成' : 'Complete')
                          : stageCopy[stage].helper}</small>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="aicw-handoff">
                  <div>
                    <strong>{locale === 'zh' ? '下一步：固定版本沙盒测试' : 'Next: sandbox-test a fixed version'}</strong>
                    <span>{locale === 'zh' ? '先保存当前草稿，再进入沙盒验证运行结果。' : 'Save the current draft before validating it in the sandbox.'}</span>
                  </div>
                  <div>
                    <button type="button" className="aicw-button" onClick={() => { void handleSaveCard() }} disabled={saving || !metadataReady}>
                      {locale === 'zh' ? '保存检查点' : 'Save checkpoint'}
                    </button>
                    {onAddToSandboxAndRestart && (
                      <button type="button" className="aicw-button aicw-button-primary" onClick={() => { void handleSaveAndAddToSandbox() }} disabled={saving || !extracted?.sourceCode}>
                        {locale === 'zh' ? '加入沙盒并测试' : 'Add to sandbox and test'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <footer className="aicw-stage-footer">
              <span>{activeStageIndex + 1} / {WORKSHOP_STAGES.length} · {stageCopy[activeStage].label}</span>
              {activeStageIndex < WORKSHOP_STAGES.length - 1 && (
                <button type="button" className="aicw-button" onClick={() => { void handleStageChange(WORKSHOP_STAGES[activeStageIndex + 1]!) }}>
                  {locale === 'zh' ? '下一阶段' : 'Next stage'}
                </button>
              )}
            </footer>
          </div>
        </section>
      </main>

      {showLocalizationModal && (
        <LocalizationModal
          currentContent={pickLocalizationCurrentContent({
            locale,
            cardLocales,
            cardName,
            prerequisite,
            extractedName: extracted?.card.name,
            extractedDesc: extracted?.card.desc,
            extractedPrerequisite: extracted?.card.prerequisite,
          })}
          currentLang={locale}
          locales={cardLocales}
          onSave={(updatedLocales) => {
            updateLocales(updatedLocales)
            setShowLocalizationModal(false)
          }}
          onClose={() => setShowLocalizationModal(false)}
        />
      )}
      {error && <div className="form-error ai-error" style={{ whiteSpace: 'pre-wrap' }}>{error}</div>}
    </div>
  )
}
