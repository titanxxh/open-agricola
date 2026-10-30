import { t as translateMessage } from '../../../shared/i18n'
/**
 * Workshop AI Card Designer.
 *
 * Browser generation, prompts and reference tools live in client/services/llm/generation/.
 * Sandbox constraints visible to users (sandbox-error tooltips, "what can I
 * write" hints, etc.) MUST stay consistent with the single source of truth:
 *   docs/CUSTOM_CARD_SANDBOX.md
 *
 * CI runs `pnpm run check:prompt-sync` for whitelist names. Runtime semantics
 * are guarded by deployed sandbox contracts, browser loop tests and card behavior tests.
 *
 * If you add UI copy here that lists hooks / phases / denied identifiers,
 * link to the SANDBOX doc rather than embedding a parallel list.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getLlmConfig, saveLlmConfig, clearLlmConfig,
  getProvider, listModelsFor, defaultModelFor,
  generateCardArt, buildCardArtPrompt,
  supportsImageGeneration, KEY_LLM_CONFIG_ART,
  PROVIDER_LABELS, PROVIDER_KEY_HINTS,
  type LlmConfig, type LlmProvider, type ReferenceImage,
} from '../../services/llm'
import { WorkshopAbilityPanel } from './WorkshopAbilityPanel'
import type { PlaytestFailure, PlaytestSource } from '../../services/llm/generation/request'
import { sandboxFailureFor, type SandboxPlaytest } from './sandbox-playtest'
import { LocalizationModal, isLocaleEntryComplete } from './LocalizationModal'
import { useLocale } from '../../contexts/LocaleContext'
import { PlayerCard } from '../../components/common/PlayerCard'
import { Section } from '../../components/common/Section'
import type { CardMeta } from '../../services/card-meta'
import { resolveCardArtUrl } from '../../../shared/utils/card-art-url'
import { sourceFingerprint } from '../../../shared/projections/workshop-generation'
import { API_BASE } from '../../config'
import { publicAssetUrl } from '../../utils/public-asset-url'
import { useWorkshopDraft } from './useWorkshopDraft'
import type {
  AbilityCandidate,
  ArtCandidate,
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
function isValidCardId(id: string, locale: string = 'zh'): { valid: boolean; reason?: string } {
  if (!id.startsWith('CUSTOM_')) {
    return {
      valid: false,
      reason: translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.id_must_start_with_custom_c4c8b7"),
    }
  }
  if (id.length < 8) {
    return {
      valid: false,
      reason: translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.id_must_contain_at_least_8_characters_508fca"),
    }
  }
  if (/[^a-zA-Z0-9_]/.test(id)) {
    return {
      valid: false,
      reason: translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.id_may_only_contain_ascii_letters_numbers_f78a06"),
    }
  }
  return { valid: true }
}

const COST_RESOURCE_ALIASES: Record<string, string> = {
  wood: 'wood',
  木材: 'wood',
  木: 'wood',
  clay: 'clay',
  黏土: 'clay',
  粘土: 'clay',
  reed: 'reed',
  芦苇: 'reed',
  蘆葦: 'reed',
  stone: 'stone',
  石材: 'stone',
  石头: 'stone',
  石: 'stone',
  food: 'food',
  食物: 'food',
  grain: 'grain',
  谷物: 'grain',
  vegetable: 'vegetable',
  蔬菜: 'vegetable',
  sheep: 'sheep',
  羊: 'sheep',
  boar: 'boar',
  野猪: 'boar',
  cattle: 'cattle',
  牛: 'cattle',
  fuel: 'fuel',
  燃料: 'fuel',
  horse: 'horse',
  马: 'horse',
}

function parseWorkshopCostInput(input: string): Record<string, number> {
  const cost: Record<string, number> = {}
  const aliases = Object.keys(COST_RESOURCE_ALIASES)
    .sort((left, right) => right.length - left.length)
    .join('|')
  const pattern = new RegExp(`(\\d+)\\s*<?(${aliases})>?`, 'gi')
  for (const match of input.matchAll(pattern)) {
    const amount = Number(match[1])
    const resource = COST_RESOURCE_ALIASES[match[2]!.toLowerCase()]
    if (resource && amount > 0) cost[resource] = (cost[resource] ?? 0) + amount
  }
  return cost
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
 * shows this read-only as the source for the translate button.
 */
export function pickLocalizationCurrentContent(args: {
  cardLocales: Record<string, { name: string; desc: string[]; prerequisite?: string }>
  cardName: string
  prerequisite: string
  extractedName: string | undefined
  extractedDesc: string[] | undefined
  extractedPrerequisite: string | undefined
}): { name: string; desc: string[]; prerequisite?: string } {
  const localeEntry = args.cardLocales.en
  return {
    name: args.cardName || args.extractedName || localeEntry?.name || '',
    desc: args.extractedDesc ?? localeEntry?.desc ?? [],
    prerequisite: args.prerequisite
      || args.extractedPrerequisite
      || localeEntry?.prerequisite,
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
    rules?: string[]
    prerequisite?: string
    modifiers?: unknown[]
    locales?: Record<string, CardLocaleEntry>
  }
  sourceCode?: string
}


export type ApiCard = {
  id: string          // DB row id
  card_id: string     // CUSTOM_xxx
  card_type: string
  name: string
  description: string
  art_url: string | null
  effect_code: string | null
  card_json: Record<string, unknown>  // already parsed by server
  review_status: string
  live: boolean
  updated_at: number
}

type WorkshopDraftVersion = {
  id: string
  version_number: number
  card_json: Record<string, unknown>
  art_url: string | null
  created_at: number
}

// ── Markdown with code copy ─────────────────────────────────────────────────

// ── Inline Config Bar ─────────────────────────────────────────────────────────

function ConfigBar({ config, onConfigured, onClear, storageKey, capability }: {
  config: LlmConfig | null
  onConfigured: () => void
  onClear: () => void
  storageKey?: string
  capability: 'chat' | 'image'
}) {
  const { locale } = useLocale()
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
          <span className="ai-config-bar-stale" title={translateMessage(locale, "ui.copy.client_app_workshop_AiCardDesigner_tsx.is_no_longer_available_select_switch_to_f190df", { value0: config.model })}>{translateMessage(locale, "ui.copy.client_app_workshop_AiCardDesigner_tsx.unavailable_fa14b0")}</span>
        )}
        <button type="button" className="btn-link" onClick={() => setExpanded(true)}>{translateMessage(locale, "ui.copy.client_app_workshop_AiCardDesigner_tsx.switch_5a77f0")}</button>
        <button type="button" className="btn-link ai-config-bar-clear" onClick={handleClear}>{translateMessage(locale, "ui.copy.client_app_workshop_AiCardDesigner_tsx.clear_cf745b")}</button>
      </div>
    )
  }

  return (
    <div className="ai-config-bar ai-config-bar-expanded">
      <div className="ai-config-bar-row">
        <strong>{translateMessage(locale, "ui.copy.client_app_workshop_AiCardDesigner_tsx.ai_provider_settings_5eb883")}</strong>
        <span className="ai-config-bar-hint">{translateMessage(locale, "ui.copy.client_app_workshop_AiCardDesigner_tsx.api_keys_are_stored_on_this_device_d8ae09")}</span>
        {config && (
          <button type="button" className="btn-link" onClick={() => setExpanded(false)}>{translateMessage(locale, "ui.copy.client_app_workshop_AiCardDesigner_tsx.collapse_79a836")}</button>
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
                  ? translateMessage(locale, "ui.copy.client_app_workshop_AiCardDesigner_tsx.this_provider_does_not_support_image_generation_dd6eab")
                  : translateMessage(locale, "ui.copy.client_app_workshop_AiCardDesigner_tsx.this_provider_does_not_support_code_chat_31479d")}
              </span>
            )
          }
          return (
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              className="ai-model-select"
              aria-label={capability === 'image'
                ? translateMessage(locale, "ui.copy.client_app_workshop_AiCardDesigner_tsx.image_generation_model_52bd52")
                : translateMessage(locale, "ui.copy.client_app_workshop_AiCardDesigner_tsx.ability_generation_model_c05b7f")}
            >
              {availableModels.map(m => (
                <option key={m.id} value={m.id}>{m.labelKey ? translateMessage(locale, m.labelKey) : m.label}</option>
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
            {showKey ? translateMessage(locale, "ui.copy.client_app_workshop_AiCardDesigner_tsx.hide_d2e660") : translateMessage(locale, "ui.copy.client_app_workshop_AiCardDesigner_tsx.show_520bd3")}
          </button>
        </div>

        {PROVIDER_KEY_HINTS[provider] && (
          <div className="form-hint">
            {translateMessage(locale, "ui.copy.client_app_workshop_AiCardDesigner_tsx.get_an_api_key_afb3e8")}<a href={`https://${PROVIDER_KEY_HINTS[provider]}`} target="_blank" rel="noopener noreferrer">{PROVIDER_KEY_HINTS[provider]}</a>
          </div>
        )}

        <button type="button" className="btn-primary" onClick={handleSave} disabled={!apiKey.trim() || !model.trim()}>
          {translateMessage(locale, "ui.copy.client_app_workshop_AiCardDesigner_tsx.save_settings_c61488")}</button>
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
  locale: string
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  const statusText = (heading: string, config: LlmConfig | null) => {
    if (!config) {
      return translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.separator_64832f", { value0: heading, value1: t('platform.aiConfigStatusMissing') })
    }
    const provider = PROVIDER_LABELS[config.provider] ?? config.provider
    return translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.separator_8c963e", { value0: heading, value1: provider, value2: config.model })
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

// ── the reference Reference Image Picker ────────────────────────────────────────────────

/** The reference card image URL given deck letter and card number */
function refImgUrl(deck: string, num: number) {
  return publicAssetUrl(`/assets/revised/deck${deck}/${deck}${String(num).padStart(3, '0')}.png`)
}

// All the reference card images: decks A-E, minors 1-84, occupations 85-168
const DECKS = ['A', 'B', 'C', 'D', 'E'] as const
const MINOR_REF_IMAGES = DECKS.flatMap(d => Array.from({ length: 84 }, (_, i) => refImgUrl(d, i + 1)))
const OCC_REF_IMAGES = DECKS.flatMap(d => Array.from({ length: 84 }, (_, i) => refImgUrl(d, i + 85)))

async function fetchRefImage(url: string): Promise<ReferenceImage | null> {
  try {
    const resp = await fetch(url)
    if (!resp.ok) return null
    const blob = await resp.blob()
    if (!(blob instanceof Blob)) return null
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
        {translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.reference_images_up_to_3_8165f2")}
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
              title={isSelected ? (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.deselect_ce60df")) : (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.use_as_reference_98c8bd"))}
              aria-label={isSelected ? (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.deselect_reference_775b4a")) : (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.select_reference_c44346"))}
              aria-pressed={isSelected}
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

// Card face icon box geometry, mirrored from client/styles/card-sprite.css:
//   .player-card.occupation .card-icon { width: 180.95px;  height: 189.645px }
//   .player-card.minor      .card-icon { width: 182.125px; height: 189.9975px }
// Both boxes are slightly taller than wide. Art must ship at that ratio —
// a square canvas leaves the card face no good option, only cropping the
// sides (cover) or letterboxing it (contain).
const CARD_ART_ICON_BOX = {
  occupation: { width: 180.95, height: 189.645 },
  minor: { width: 182.125, height: 189.9975 },
} as const

// Badge width as a share of the canvas width, measured off official deck art
// (which uses the very same badge-with-transparent-corners layout):
//   deckE/E089.png (occupation): circle   383x383 of 512 -> 74.8% wide
//   deckE/E001.png (minor):      hexagon  441x384 of 512 -> 86.1% wide
// The two card types differ because a flat-top hexagon is 1.155x wider than
// tall, so it needs more width to carry the same visual height. Filling the
// canvas edge to edge instead swallows the frame's wheat-ear ornaments and
// reads as "the art is too big" next to an official card.
export const CARD_ART_BADGE_RATIO = {
  occupation: 383 / 512,
  minor: 441 / 512,
} as const

export function cardArtCanvasSize(cardType: 'minor' | 'occupation'): {
  width: number
  height: number
} {
  const width = 512
  const box = CARD_ART_ICON_BOX[cardType]
  return { width, height: Math.round((width * box.height) / box.width) }
}

async function processCardArt(dataUrl: string, cardType: 'minor' | 'occupation'): Promise<string> {
  const { width: WIDTH, height: HEIGHT } = cardArtCanvasSize(cardType)
  const BORDER = 8
  const GOLD = '#c9a227'
  // R is the path radius; the stroke straddles it, so the badge's outer edge
  // lands exactly on WIDTH * ratio.
  const R = (WIDTH * CARD_ART_BADGE_RATIO[cardType]) / 2 - BORDER / 2

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = WIDTH
      canvas.height = HEIGHT
      const ctx = canvas.getContext('2d')!
      const cx = WIDTH / 2
      const cy = HEIGHT / 2

      const buildPath = () => {
        ctx.beginPath()
        if (cardType === 'occupation') {
          ctx.arc(cx, cy, R, 0, Math.PI * 2)
        } else {
          // Flat-top hexagon (matching the reference card sprites)
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

      // Cover-fit the badge's bounding box, not the whole canvas: scaling to
      // the canvas would push most of the picture outside the clip. A flat-top
      // hexagon is only sqrt(3)*R tall against its 2*R width.
      ctx.save()
      buildPath()
      ctx.clip()
      const badgeWidth = R * 2
      const badgeHeight = cardType === 'occupation' ? R * 2 : R * Math.sqrt(3)
      const scale = Math.max(badgeWidth / img.width, badgeHeight / img.height)
      const iw = img.width * scale
      const ih = img.height * scale
      ctx.drawImage(img, cx - iw / 2, cy - ih / 2, iw, ih)
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

function ArtPanel({
  cardType,
  cardName,
  artUrl,
  artSubject,
  candidates,
  selectedCandidateId,
  baseRevision,
  refCache,
  apiFetch,
  onSubjectChange,
  onCandidateCompleted,
  onCandidateSelected,
  onCandidateDiscarded,
  onCandidateAdopted,
}: {
  cardType: 'minor' | 'occupation'
  cardName: string
  artUrl: string | null
  artSubject: string
  candidates: ArtCandidate[]
  selectedCandidateId?: string
  baseRevision: number
  refCache?: Map<string, ReferenceImage>
  apiFetch: ApiFetch
  onSubjectChange: (subject: string) => void
  onCandidateCompleted: (candidate: ArtCandidate) => Promise<void>
  onCandidateSelected: (candidateId: string) => void
  onCandidateDiscarded: (candidateId: string) => Promise<void>
  onCandidateAdopted: (candidate: ArtCandidate) => Promise<void>
}) {
  const { locale, t } = useLocale()
  const config = getLlmConfig(KEY_LLM_CONFIG_ART)
  const [selectedRefs, setSelectedRefs] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [artError, setArtError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (artError) errorRef.current?.focus()
  }, [artError])

  const selectedCandidate = candidates.find(candidate => candidate.id === selectedCandidateId)
    ?? candidates.at(-1)
  const canGenerateArt = config ? supportsImageGeneration(config) : false
  const borderLabel = cardType === 'occupation'
    ? (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.circular_gold_trim_a6bbf7"))
    : (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.hexagonal_gold_trim_0e3a43"))

  const completeCandidate = async (
    resultUrl: string,
    prompt: string,
    provider?: string,
    model?: string,
    referenceImages?: string[],
  ) => {
    await onCandidateCompleted({
      id: globalThis.crypto?.randomUUID?.() ?? `art-${Date.now()}`,
      kind: 'art',
      prompt,
      promptFormat: 'subject',
      resultUrl,
      createdAt: Date.now(),
      baseRevision,
      stale: false,
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
      ...(referenceImages?.length ? { referenceImages } : {}),
    })
  }

  const handleToggleRef = (url: string) => {
    setSelectedRefs(previous =>
      previous.includes(url)
        ? previous.filter(entry => entry !== url)
        : [...previous, url],
    )
  }

  const handleGenerate = async () => {
    const subject = artSubject.trim()
    if (!subject || generating || !canGenerateArt || !config) return
    setGenerating(true)
    setArtError('')
    try {
      const prompt = buildCardArtPrompt(subject, cardType, locale)
      const referenceImages = selectedRefs.length > 0
        ? (await Promise.all(
            selectedRefs.map(url =>
              refCache?.get(url)
                ? Promise.resolve(refCache.get(url)!)
                : fetchRefImage(url),
            ),
          )).filter((entry): entry is ReferenceImage => entry !== null)
        : undefined
      const rawDataUrl = await generateCardArt(prompt, config, referenceImages)
      if (!rawDataUrl) {
        setArtError(translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.the_image_service_returned_no_result_check_b638cc"))
        return
      }
      const processed = await processCardArt(rawDataUrl, cardType)
      const uploaded = await uploadArt(processed, apiFetch)
      if (!uploaded) {
        setArtError(translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.the_image_was_not_uploaded_this_candidate_a005af"))
      }
      await completeCandidate(
        uploaded ?? processed,
        subject,
        config.provider,
        config.model,
        selectedRefs,
      )
    } catch (reason) {
      setArtError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setGenerating(false)
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
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
      await completeCandidate(
        uploaded ?? processed,
        artSubject.trim() || (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.manually_uploaded_image_145547")),
        'upload',
        file.type,
      )
    } catch (reason) {
      setArtError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="ai-art-panel">
      <div className="ai-art-panel-header">
        <h3>{translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.card_art_9c7f56")}</h3>
        <span className="ai-art-border-tag">{borderLabel}</span>
      </div>

      {artUrl && (
        <section className="aicw-current-asset">
          <div>
            <strong>{translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.currently_adopted_f56305")}</strong>
            <small>{translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.new_candidates_do_not_overwrite_this_c28a77")}</small>
          </div>
          <img src={resolveCardArtUrl(artUrl, API_BASE)} alt={cardName || (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.current_card_art_c68647"))} />
        </section>
      )}

      {!config && (
        <div className="ai-panel-needs-config">
          {translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.configure_an_image_generation_model_in_first_a4cd84", { value0: t('platform.aiConfig') })}
        </div>
      )}

      {config && (
        <div className="aicw-generator-fields">
          <label>
            <span>{translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.image_subject_a01428")}</span>
            <input
              type="text"
              value={artSubject}
              onChange={event => onSubjectChange(event.target.value)}
              placeholder={cardType === 'occupation'
                ? (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.a_farmer_picking_fruit_518b90"))
                : (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.a_rustic_medieval_wooden_mallet_053718"))}
            />
          </label>
          {canGenerateArt && (
            <RefImagePicker
              cardType={cardType}
              selected={selectedRefs}
              onToggle={handleToggleRef}
            />
          )}
          <button
            type="button"
            className="aicw-button aicw-button-primary"
            onClick={() => { void handleGenerate() }}
            disabled={generating || !artSubject.trim() || !canGenerateArt}
          >
            {generating
              ? (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.generating_candidate_6b659a"))
              : (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.generate_art_candidate_de93cf"))}
          </button>
        </div>
      )}

      {artError && (
        <div
          ref={errorRef}
          className="form-error aicw-panel-error"
          role="alert"
          tabIndex={-1}
        >
          {artError}
        </div>
      )}

      {candidates.length > 0 && (
        <section className="aicw-candidate-section">
          <div className="aicw-candidate-heading">
            <div>
              <strong>{translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.recent_candidates_676db4")}</strong>
              <span>{translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.up_to_3_only_adoption_changes_the_6af5b5")}</span>
            </div>
            <span>{candidates.length} / 3</span>
          </div>
          <div className="aicw-art-candidates">
            {candidates.map(candidate => {
              const candidateLabel = candidate.model ?? candidate.provider
                ?? translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.unknown_model_9ea4ae")
              return (
                <button
                  type="button"
                  key={candidate.id}
                  className={selectedCandidate?.id === candidate.id ? 'is-selected' : ''}
                  onClick={() => onCandidateSelected(candidate.id)}
                  aria-label={`${translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.view_art_candidate_d94c79")} ${candidate.id}: ${candidateLabel}`}
                >
                  <img src={resolveCardArtUrl(candidate.resultUrl, API_BASE)} alt="" />
                  <span>{candidateLabel}</span>
                </button>
              )
            })}
          </div>
          {selectedCandidate && (
            <div className="aicw-art-review">
              <img src={resolveCardArtUrl(selectedCandidate.resultUrl, API_BASE)} alt={translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.art_candidate_awaiting_adoption_f176bc")} />
              <div>
                <span className={`aicw-candidate-state${selectedCandidate.stale ? ' is-stale' : ''}`}>
                  {selectedCandidate.stale
                    ? (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.generated_from_an_older_draft_7f8037"))
                    : (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.awaiting_adoption_5f4d56"))}
                </span>
                <details>
                  <summary>{translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.view_generation_record_eacccb")}</summary>
                  <p>{selectedCandidate.prompt}</p>
                  <small>
                    {[selectedCandidate.provider, selectedCandidate.model].filter(Boolean).join(' · ')
                      || (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.model_not_recorded_f4b243"))}
                  </small>
                  {selectedCandidate.referenceImages?.length ? (
                    <small className="aicw-reference-record">
                      {translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.references_eacd6a")}：
                      {selectedCandidate.referenceImages.join(', ')}
                    </small>
                  ) : null}
                </details>
                <div className="aicw-candidate-actions">
                  <button type="button" className="aicw-button" onClick={() => { void onCandidateDiscarded(selectedCandidate.id) }}>
                    {translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.discard_2ec117")}
                  </button>
                  <button type="button" className="aicw-button aicw-button-primary" onClick={() => { void onCandidateAdopted(selectedCandidate) }}>
                    {translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.adopt_as_current_art_4596c9")}
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      <div className="ai-art-upload-section">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={event => { void handleFileUpload(event) }}
          hidden
        />
        <button
          type="button"
          className="aicw-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading
            ? (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.processing_upload_74d5dc"))
            : (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.upload_as_candidate_e597d5"))}
        </button>
      </div>
    </div>
  )
}

// ── Ability Chat Panel ────────────────────────────────────────────────────────

function sampleN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, n)
}

// ── Main AiCardDesigner ───────────────────────────────────────────────────────

type CardLocaleEntry = {
  name: string
  desc: string[]
  rules?: string[]
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
      rules: Array.isArray(cardJson.rules)
        ? cardJson.rules.filter((value): value is string => typeof value === 'string')
        : undefined,
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
  initialCardId?: string
  onClose: () => void
  onAddToSandboxAndRestart?: (cardDbId: string, versionId: string, source: PlaytestSource) => Promise<boolean>
  sandboxErrors?: string[] | null
  sandboxPlaytest?: SandboxPlaytest | null
  onCardLoaded?: (cardDbId: string) => void
  apiFetch?: ApiFetch
}

export function AiCardDesigner({
  initialCard,
  initialCardId,
  onClose,
  onAddToSandboxAndRestart,
  sandboxErrors,
  sandboxPlaytest,
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
  const [cardIdCopied, setCardIdCopied] = useState(false)
  const [refCache, setRefCache] = useState<Map<string, ReferenceImage>>(new Map())
  const [myCards, setMyCards] = useState<ApiCard[]>([])
  const [currentCardDbId, setCurrentCardDbId] = useState<string | null>(
    initialCard?.id ?? initialCardId ?? null,
  )
  const [showLocalizationModal, setShowLocalizationModal] = useState(false)
  const [cardLocales, setCardLocales] = useState<Record<string, CardLocaleEntry>>({})
  const [pendingStage, setPendingStage] = useState<WorkshopStage | null>(null)
  const [sandboxConfirmation, setSandboxConfirmation] = useState(false)
  const [runtimeSandboxErrors, setRuntimeSandboxErrors] = useState<string[] | null>(null)
  const [runtimeSandboxFailure, setRuntimeSandboxFailure] = useState<PlaytestFailure | null>(null)
  const testedSource = sandboxPlaytest?.source
  const sandboxFailure = sandboxFailureFor(sandboxPlaytest, sandboxErrors ?? [])
  const sandboxGateErrors = sandboxErrors?.length ? sandboxErrors : runtimeSandboxErrors
  const [versions, setVersions] = useState<WorkshopDraftVersion[]>([])
  const [versionsLoading, setVersionsLoading] = useState(false)
  const [versionsError, setVersionsError] = useState('')
  const [metadataValidationAttempted, setMetadataValidationAttempted] = useState(false)
  const hydratedWorkspaceRef = useRef('')
  const errorRef = useRef<HTMLDivElement>(null)
  const recoveryRef = useRef<HTMLElement>(null)
  const workspaceHeadingRef = useRef<HTMLDivElement>(null)
  const cardNameRef = useRef<HTMLInputElement>(null)
  const cardIdRef = useRef<HTMLInputElement>(null)
  const [abilityConfig, setAbilityConfig] = useState<LlmConfig | null>(() => getLlmConfig())
  const [artConfig, setArtConfig] = useState<LlmConfig | null>(() => getLlmConfig(KEY_LLM_CONFIG_ART))
  const {
    state: controllerState,
    loading: controllerLoading,
    error: controllerError,
    dispatch,
    updateDraft,
    updateSession,
    checkpoint,
    retryCheckpoint,
    changeStage,
    resolveConflict,
    adoptCandidate: adoptDraftCandidate,
    publishDraft,
    unpublishDraft,
    pinDraftVersion,
    confirmSandboxPass,
    restoreVersion,
    undoRestore,
  } = useWorkshopDraft({
    cardId: currentCardDbId ?? '',
    apiFetch: workshopApiFetch,
  })
  const workspaceState = controllerState?.workspaceId === currentCardDbId
    ? controllerState
    : null

  const sandboxOwner = { workspaceId: currentCardDbId, playtest: sandboxPlaytest, versionId: workspaceState?.session.sandboxTestVersionId }
  const sandboxOwnerRef = useRef(sandboxOwner)
  sandboxOwnerRef.current = sandboxOwner
  const confirmingPlaytestRef = useRef(false)
  const sandboxLifetimeRef = useRef(0)

  useEffect(() => () => { sandboxLifetimeRef.current += 1 }, [])

  useEffect(() => {
    setRuntimeSandboxErrors(null)
    setRuntimeSandboxFailure(null)
    if (confirmingPlaytestRef.current) setSaving(false)
    confirmingPlaytestRef.current = false
  }, [sandboxPlaytest, currentCardDbId])

  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])

  useEffect(() => {
    if (!saveSuccess) return
    const timer = setTimeout(() => setSaveSuccess(false), 3000)
    return () => clearTimeout(timer)
  }, [saveSuccess])

  useEffect(() => {
    if (
      controllerError
      || controllerState?.save.status === 'offline'
      || controllerState?.save.status === 'error'
    ) recoveryRef.current?.focus()
  }, [controllerError, controllerState?.save.status])

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
        rules: Array.isArray(cardJson.rules)
          ? cardJson.rules.filter((value): value is string => typeof value === 'string')
          : undefined,
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
    if (!initialCard && initialCardId) setCurrentCardDbId(initialCardId)
  }, [initialCard, initialCardId])

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
    ...(extracted?.card.rules ? { rules: extracted.card.rules } : {}),
    cost: parseWorkshopCostInput(costInput),
    vp: extracted?.card.vp ?? 0,
    prerequisite: prerequisite || undefined,
    modifiers: extracted?.card.modifiers ?? [],
    implemented: true,
    _draft: {
      prerequisite: prerequisite || undefined,
      costInput: costInput || undefined,
    },
    ...(Object.keys(cardLocales).length > 0 ? { locales: cardLocales } : {}),
  })

  const createDraft = async (): Promise<string | null> => {
    const name = cardName.trim()
    setMetadataValidationAttempted(true)
    if (!name) {
      cardNameRef.current?.focus()
      return null
    }
    const nextCardId = cardIdInput.trim() || autoCardId(name)
    const idCheck = isValidCardId(nextCardId, locale)
    if (!idCheck.valid) {
      cardIdRef.current?.focus()
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
          card_type: cardType,
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
          data.error ?? (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.save_failed_5b5ea2")),
          details,
        ].filter(Boolean).join(':\n'))
        return null
      }
      setCardIdInput(nextCardId)
      setSaveSuccess(true)
      return data.id
    } catch {
      setError(translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.network_error_32ea15"))
      return null
    } finally {
      setSaving(false)
    }
  }

  const handleSaveCard = async (): Promise<string | null> => {
    setMetadataValidationAttempted(true)
    if (!cardName.trim()) {
      cardNameRef.current?.focus()
      return null
    }
    const idCheck = isValidCardId(cardIdInput.trim(), locale)
    if (!idCheck.valid) {
      cardIdRef.current?.focus()
      return null
    }
    if (workspaceState) {
      setSaving(true)
      setError('')
      const saved = await checkpoint()
      setSaving(false)
      if (!saved) return null
      setSaveSuccess(true)
      refreshMyCards()
      return workspaceState.workspaceId
    }
    if (currentCardDbId) {
      setError(translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.draft_is_still_loading_try_again_shortly_0d27a1"))
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
          cost: parseWorkshopCostInput(next),
          _draft: {
            ...rawDraft,
            prerequisite: prerequisite || undefined,
            costInput: next || undefined,
          },
        },
      }
    })
  }

  const updateLocales = (next: Record<string, CardLocaleEntry>) => {
    setCardLocales(next)
    patchDraft(current => ({
      ...current,
      cardJson: { ...current.cardJson, locales: next },
    }))
  }

  const completeArtCandidate = async (candidate: ArtCandidate) => {
    dispatch({ type: 'candidateCompleted', candidate })
    await checkpoint()
  }

  const discardCandidate = async (
    kind: 'art' | 'ability',
    candidateId: string,
  ) => {
    dispatch({ type: 'candidateDiscarded', kind, candidateId })
    await checkpoint()
  }

  const adoptCandidate = async (candidate: ArtCandidate | AbilityCandidate) => {
    if (
      candidate.stale
      && !window.confirm(translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.this_candidate_was_generated_from_an_older_5c3f1b"))
    ) return
    if (await adoptDraftCandidate(candidate)) {
      requestAnimationFrame(() => workspaceHeadingRef.current?.focus())
    }
  }

  const handleStageChange = async (stage: WorkshopStage) => {
    if (workspaceState) {
      await changeStage(stage)
      return
    }
    setPendingStage(stage)
    if (!currentCardDbId) await handleSaveCard()
  }

  const handleClose = async () => {
    if (workspaceState) await checkpoint()
    onClose()
  }

  const handleSwitchDraft = async (card: ApiCard) => {
    if (workspaceState) await checkpoint()
    handleLoadCard(card)
  }

  const handleResolveConflict = async (choice: 'server' | 'local') => {
    if (await resolveConflict(choice)) {
      requestAnimationFrame(() => workspaceHeadingRef.current?.focus())
    }
  }

  const handlePublishAndStartSandbox = async () => {
    if (!onAddToSandboxAndRestart || !currentCardDbId || !workspaceState) return
    setSaving(true)
    setError('')
    try {
      const pinned = await pinDraftVersion()
      if (!pinned) return
      const { versionId, cardJson: pinnedCard } = pinned
      const source = pinnedCard?._code
      if (typeof source !== 'string' || !source.trim()
        || typeof pinnedCard?.id !== 'string' || !pinnedCard.id.trim()
        || typeof pinnedCard.name !== 'string' || !pinnedCard.name.trim()
        || (pinnedCard.card_type !== 'minor' && pinnedCard.card_type !== 'occupation')) {
        throw new Error(translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.cannot_read_the_pinned_source_pin_the_dbdffd"))
      }
      const binding: PlaytestSource = {
        workspaceId: currentCardDbId, versionId, source, sourceFingerprint: sourceFingerprint(source),
        identity: { id: pinnedCard.id, type: pinnedCard.card_type, name: pinnedCard.name },
      }
      updateSession({ sandboxTestVersionId: undefined })
      setSandboxConfirmation(false)
      setRuntimeSandboxErrors(null)
      setRuntimeSandboxFailure(null)
      if (await onAddToSandboxAndRestart(currentCardDbId, versionId, binding)) {
        updateSession({ sandboxTestVersionId: versionId })
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmSandboxPass = async () => {
    const versionId = workspaceState?.session.sandboxTestVersionId
    if (!versionId || !sandboxConfirmation) return
    const owner = sandboxOwnerRef.current
    const lifetime = sandboxLifetimeRef.current
    const stillCurrent = () => sandboxLifetimeRef.current === lifetime
      && sandboxOwnerRef.current.workspaceId === owner.workspaceId
      && sandboxOwnerRef.current.playtest === owner.playtest
      && sandboxOwnerRef.current.versionId === owner.versionId
    confirmingPlaytestRef.current = true
    setSaving(true)
    setError('')
    try {
      const response = await workshopApiFetch('/api/game/state')
      const payload = await response.json() as {
        cardWarnings?: unknown
        error?: string
        gameInstanceId?: string
      }
      if (!stillCurrent()) return
      if (!response.ok) {
        throw new Error(payload.error ?? `Request failed (${response.status})`)
      }
      const errors = Array.isArray(payload.cardWarnings)
        ? payload.cardWarnings.filter((value): value is string => typeof value === 'string')
        : []
      setRuntimeSandboxErrors(errors.length > 0 ? errors : null)
      const samePlaytest = testedSource?.workspaceId === currentCardDbId && testedSource?.versionId === versionId
        && sandboxPlaytest?.instanceId === payload.gameInstanceId
      setRuntimeSandboxFailure(samePlaytest ? sandboxFailureFor(sandboxPlaytest, errors) : null)
      if (!samePlaytest) throw new Error(translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.the_playtest_version_changed_pin_and_start_e267da"))
      if (errors.length > 0) return
      await confirmSandboxPass(versionId, errors)
    } catch (reason) {
      if (stillCurrent()) setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      if (stillCurrent()) {
        confirmingPlaytestRef.current = false
        setSaving(false)
        setSandboxConfirmation(false)
      }
    }
  }

  const loadVersionHistory = useCallback(async () => {
    if (!currentCardDbId) return
    setVersionsLoading(true)
    setVersionsError('')
    try {
      const response = await workshopApiFetch(
        `/api/workshop/cards/${encodeURIComponent(currentCardDbId)}/versions`,
      )
      const payload = await response.json() as {
        ok?: boolean
        versions?: WorkshopDraftVersion[]
        error?: string
      }
      if (!response.ok || !payload.ok || !Array.isArray(payload.versions)) {
        setVersions([])
        setVersionsError(payload.error ?? (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.could_not_load_version_history_231f16")))
        return
      }
      setVersions(payload.versions)
    } catch (reason) {
      setVersions([])
      setVersionsError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setVersionsLoading(false)
    }
  }, [currentCardDbId, locale, workshopApiFetch])

  const handleRestoreVersion = async (versionId: string) => {
    setSaving(true)
    setError('')
    const restored = await restoreVersion(versionId)
    setSaving(false)
    if (restored) await loadVersionHistory()
  }

  const handleUndoRestore = async () => {
    setSaving(true)
    setError('')
    await undoRestore()
    setSaving(false)
  }

  const localizationReady = isLocaleEntryComplete(cardLocales.zh)
  const metadataReady = Boolean(cardName.trim() && isValidCardId(cardIdInput.trim(), locale).valid)
  const handoffInputsReady = Boolean(
    metadataReady
    && artUrl
    && extracted?.sourceCode
    && localizationReady
  )
  const handoffReady = Boolean(
    handoffInputsReady
    && workspaceState?.sandboxPassVersionId
  )
  const readiness: Record<WorkshopStage, boolean> = {
    metadata: metadataReady,
    art: Boolean(artUrl),
    ability: Boolean(extracted?.sourceCode),
    localization: localizationReady,
    validation: handoffReady,
  }
  const activeStage = workspaceState?.stage ?? 'metadata'
  const activeStageIndex = WORKSHOP_STAGES.indexOf(activeStage)

  useEffect(() => {
    if (activeStage === 'validation' && currentCardDbId && !controllerLoading) {
      void loadVersionHistory()
    }
  }, [
    activeStage,
    controllerLoading,
    currentCardDbId,
    loadVersionHistory,
    workspaceState?.baseRevision,
  ])

  const stageCopy: Record<WorkshopStage, { label: string; helper: string }> = { "metadata": { "label": translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.card_details_66714e"), "helper": translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.name_type_and_card_id_b4963d") }, "art": { "label": translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.card_art_ab8d78"), "helper": translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.subject_references_and_candidates_13459a") }, "ability": { "label": translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.card_ability_e73e6d"), "helper": translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.conversation_source_and_validation_0cee4c") }, "localization": { "label": translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.localization_6ab594"), "helper": translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.complete_chinese_and_english_copy_39d7dd") }, "validation": { "label": translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.validate_hand_off_64b87f"), "helper": translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.sandbox_test_and_publish_checks_27e8de") } }
  const syncedTime = controllerState?.save.savedAt
    ? new Intl.DateTimeFormat(locale, {
        hour: '2-digit',
        minute: '2-digit',
      }).format(controllerState.save.savedAt)
    : null
  const liveEditBlocked = controllerState?.save.errorCode === 'live_edit_blocked'
  const saveStatus = saving || controllerState?.save.status === 'saving'
    ? (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.saving_f9c505"))
    : !currentCardDbId
      ? (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.not_created_c5fdc6"))
    : controllerState?.save.status === 'dirty'
      ? (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.unsaved_changes_1c6123"))
      : controllerState?.save.status === 'offline'
        ? (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.offline_saved_locally_9bff39"))
        : controllerState?.save.status === 'error'
          ? liveEditBlocked
            ? (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.unpublish_to_edit_fe2350"))
            : (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.sync_failed_58879d"))
        : controllerState?.save.status === 'conflict'
          ? (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.draft_choice_required_0e3f58"))
          : syncedTime
            ? (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.synced_93e9b2", { value0: syncedTime }))
            : (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.synced_c007ad"))
  const descriptionLines = extracted?.card.desc ?? []
  const liveCardId = cardIdInput || 'CUSTOM_'
  const handleCopyLiveCardId = async () => {
    let copied = false
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(liveCardId)
      copied = true
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = liveCardId
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      textarea.select()
      try {
        copied = document.execCommand('copy')
      } catch {
        copied = false
      } finally {
        textarea.remove()
      }
    }
    if (!copied) return
    setCardIdCopied(true)
    setTimeout(() => setCardIdCopied(false), 1500)
  }
  const liveCardMeta: CardMeta = {
    id: liveCardId,
    name: cardLocales[locale]?.name || cardName || (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.untitled_card_3f956b")),
    deck: 'CUSTOM',
    number: 0,
    type: cardType,
    locales: cardLocales,
    rules: extracted?.card.rules,
    desc: descriptionLines.length > 0
      ? descriptionLines
      : [translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.ability_text_appears_after_code_is_adopted_e767d7")],
    cost: parseWorkshopCostInput(costInput),
    prerequisite: prerequisite || undefined,
    vp: extracted?.card.vp ?? 0,
  }

  return (
    <div className="ai-designer aicw-shell">
      <header className="aicw-header">
        <div ref={workspaceHeadingRef} className="aicw-heading" tabIndex={-1}>
          <span>{translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.card_workshop_ai_card_designer_9bddcf")}</span>
          <div>
            <h2>{cardName || (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.new_card_draft_67191a"))}</h2>
            <span className="aicw-draft-badge">
              {workspaceState?.reviewStatus === 'merged'
                ? (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.merged_read_only_adc2fb"))
                : workspaceState?.live
                  ? (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.live_6e7d71"))
                  : workspaceState?.reviewStatus === 'approved'
                    ? (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.approved_8810b3"))
                    : (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.draft_ce8952"))}
            </span>
            {workspaceState?.reviewStatus === 'approved' && !workspaceState.live && (
              <button
                type="button"
                className="aicw-button aicw-button-primary"
                onClick={() => { void publishDraft() }}
                disabled={saving}
              >
                {translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.publish_live_bf65ed")}
              </button>
            )}
            {workspaceState?.live && workspaceState.reviewStatus !== 'merged' && (
              <button
                type="button"
                className="aicw-button"
                onClick={() => { void unpublishDraft() }}
                disabled={saving}
              >
                {translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.unpublish_2e8668")}
              </button>
            )}
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
            disabled={saving || workspaceState?.reviewStatus === 'merged' || Boolean(currentCardDbId && controllerLoading)}
          >
            {saveSuccess
              ? (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.saved_b3f57b"))
              : (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.save_draft_3ee697"))}
          </button>
          <button type="button" className="aicw-button" onClick={() => { void handleClose() }}>
            {translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.close_6cf4a7")}
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
                }}
                onClear={() => {
                  setArtConfig(null)
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
                }}
                onClear={() => {
                  setAbilityConfig(null)
                }}
              />
            </div>
          </div>
        </Section>
      </div>

      {myCards.length > 0 && (
        <div className="aicw-design-picker">
          <label htmlFor="aicw-card-picker">{translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.switch_draft_e92f6b")}</label>
          <select
            id="aicw-card-picker"
            value={currentCardDbId ?? ''}
            onChange={event => {
              const card = myCards.find(item => item.id === event.target.value)
              if (card) void handleSwitchDraft(card)
            }}
          >
            <option value="">{translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.select_a_saved_card_7bc91e")}</option>
            {myCards.map(card => (
              <option key={card.id} value={card.id}>
                {card.name} · {card.card_type === 'minor'
                  ? (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.minor_d2a20b"))
                  : (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.occupation_962e8e"))}
              </option>
            ))}
          </select>
        </div>
      )}

      {controllerState?.conflict && (
        <section className="aicw-conflict" role="alert">
          <div>
            <strong>{translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.the_server_draft_changed_c8ddae")}</strong>
            <span>
              {translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.keep_the_complete_server_draft_or_retry_db9731")}
            </span>
          </div>
          <div>
            <button type="button" className="aicw-button" onClick={() => { void handleResolveConflict('server') }}>
              {translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.use_server_draft_770408")}
            </button>
            <button
              type="button"
              className="aicw-button aicw-button-primary"
              onClick={() => {
                if (window.confirm(translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.replace_the_complete_server_draft_with_this_d4a49d"))) {
                  void handleResolveConflict('local')
                }
              }}
            >
              {translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.keep_local_draft_d25e9e")}
            </button>
          </div>
        </section>
      )}

      {(controllerError || controllerState?.save.status === 'offline' || controllerState?.save.status === 'error') && (
        <section
          ref={recoveryRef}
          className="aicw-recovery"
          role="alert"
          tabIndex={-1}
        >
          <span>
            {controllerError
              ?? (liveEditBlocked
                ? (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.this_card_is_live_unpublish_it_to_9e0705"))
                : controllerState?.save.error
                  ?? (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.changes_are_saved_on_this_device_3e16d3")))}
          </span>
          {controllerState && (
            <button
              type="button"
              className="aicw-button"
              onClick={() => { void (liveEditBlocked ? unpublishDraft() : retryCheckpoint()) }}
              disabled={saving}
            >
              {liveEditBlocked
                ? (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.unpublish_to_continue_editing_ca8736"))
                : (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.retry_save_357e8c"))}
            </button>
          )}
        </section>
      )}

      <main className="aicw-layout">
        <aside className="aicw-preview-pane">
          <div className="aicw-section-heading">
            <span>{translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.live_card_332b09")}</span>
            <small>{translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.current_adopted_draft_da92d6")}</small>
          </div>
          <PlayerCard
            locale={locale}
            cardId={liveCardId}
            cardType={cardType}
            cardMeta={liveCardMeta}
            artUrl={artUrl}
            className="aicw-live-card"
          />
          <div className="aicw-live-card-id">
            <span>
              <small>{translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.card_id_ac01ec")}</small>
              <code>{liveCardId}</code>
            </span>
            <button
              type="button"
              className="aicw-button"
              onClick={() => { void handleCopyLiveCardId() }}
              disabled={!isValidCardId(liveCardId, locale).valid}
              aria-live="polite"
            >
              {cardIdCopied ? t('ui.cardCopied') : t('ui.cardCopy')}
            </button>
          </div>
          <div className="aicw-readiness" aria-label={translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.draft_completeness_69bafc")}>
            {WORKSHOP_STAGES.slice(0, 4).map(stage => (
              <div key={stage}>
                <span className={readiness[stage] ? 'is-ready' : ''} aria-hidden="true" />
                <strong>{stageCopy[stage].label}</strong>
                <small>{readiness[stage]
                  ? (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.ready_795b5b"))
                  : (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.incomplete_cec683"))}</small>
              </div>
            ))}
          </div>
        </aside>

        <section className="aicw-workspace">
          <nav className="aicw-stage-rail" aria-label={translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.design_stages_158be1")}>
            <span className="aicw-stage-title">{translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.design_stages_158be1")}</span>
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
              <span>{translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.current_step_0ddc3f")}</span>
              <strong>{activeStageIndex + 1} / {WORKSHOP_STAGES.length}</strong>
            </div>
          </nav>

          <div className="aicw-stage-content" key={activeStage}>
            <div className="aicw-stage-heading">
              <div>
                <span>{translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.current_task_4ea6fa")}</span>
                <h2>{stageCopy[activeStage].label}</h2>
                <p>{stageCopy[activeStage].helper}</p>
              </div>
              <span className={`aicw-status-tag${readiness[activeStage] ? ' is-ready' : ''}`}>
                {readiness[activeStage]
                  ? (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.ready_795b5b"))
                  : (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.in_progress_6906b6"))}
              </span>
            </div>

            {currentCardDbId && controllerLoading && (
              <div className="aicw-loading" role="status">
                {translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.restoring_draft_1f27dd")}
              </div>
            )}

            {!controllerLoading && activeStage === 'metadata' && (
              <div className="aicw-metadata">
                <fieldset>
                  <legend>{translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.card_type_76e396")}</legend>
                  <div className="ai-card-type-toggle">
                    <button type="button" className={`ai-type-btn${cardType === 'minor' ? ' active' : ''}`} onClick={() => updateCardType('minor')}>
                      {translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.minor_improvement_3a4f4f")}
                    </button>
                    <button type="button" className={`ai-type-btn${cardType === 'occupation' ? ' active' : ''}`} onClick={() => updateCardType('occupation')}>
                      {translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.occupation_962e8e")}
                    </button>
                  </div>
                </fieldset>
                <label>
                  <span>{translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.card_name_979d24")}</span>
                  <input
                    ref={cardNameRef}
                    type="text"
                    value={cardName}
                    onChange={event => updateCardName(event.target.value)}
                    placeholder={translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.e_g_medieval_mallet_35048a")}
                    aria-invalid={metadataValidationAttempted && !cardName.trim()}
                    aria-describedby={metadataValidationAttempted && !cardName.trim()
                      ? 'aicw-card-name-error'
                      : undefined}
                  />
                  {metadataValidationAttempted && !cardName.trim() && (
                    <small id="aicw-card-name-error" className="form-error" role="alert">
                      {translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.enter_a_card_name_54b949")}
                    </small>
                  )}
                </label>
                <label>
                  <span>{translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.card_id_ac01ec")}</span>
                  <input
                    ref={cardIdRef}
                    type="text"
                    className="aicw-code-input"
                    value={cardIdInput}
                    onChange={event => updateCardId(event.target.value)}
                    placeholder="CUSTOM_MedievalMallet"
                    aria-invalid={cardIdInput ? !isValidCardId(cardIdInput, locale).valid : undefined}
                    aria-describedby={cardIdInput && !isValidCardId(cardIdInput, locale).valid
                      ? 'aicw-card-id-error'
                      : undefined}
                  />
                  {cardIdInput && !isValidCardId(cardIdInput, locale).valid && (
                    <small id="aicw-card-id-error" className="form-error" role="alert">
                      {isValidCardId(cardIdInput, locale).reason}
                    </small>
                  )}
                </label>
                {cardType === 'minor' && (
                  <div className="aicw-field-row">
                    <label>
                      <span>{t('platform.prerequisite')}</span>
                      <input id="ai-prerequisite-input" type="text" value={prerequisite} onChange={event => updatePrerequisite(event.target.value)} placeholder={translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.optional_e_g_2_occupations_280988")} />
                    </label>
                    <label>
                      <span>{t('platform.cost')}</span>
                      <input id="ai-cost-input" type="text" value={costInput} onChange={event => updateCost(event.target.value)} placeholder={translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.optional_e_g_1_wood_2_clay_a1a865")} />
                    </label>
                  </div>
                )}
                <div className="aicw-inline-actions">
                  <span>{translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.save_once_to_unlock_the_remaining_design_e5bf7d")}</span>
                  <button type="button" className="aicw-button aicw-button-primary" disabled={!metadataReady || saving} onClick={() => { void handleStageChange('art') }}>
                    {translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.save_and_continue_to_art_408d70")}
                  </button>
                </div>
              </div>
            )}

            {!controllerLoading && activeStage === 'art' && (
              <ArtPanel
                cardType={cardType}
                cardName={cardName}
                artUrl={artUrl}
                artSubject={workspaceState?.session.artSubject ?? ''}
                candidates={workspaceState?.session.artCandidates ?? []}
                selectedCandidateId={workspaceState?.session.selectedArtCandidateId}
                baseRevision={workspaceState?.baseRevision ?? 0}
                refCache={refCache}
                apiFetch={workshopApiFetch}
                onSubjectChange={artSubject => updateSession({ artSubject })}
                onCandidateCompleted={completeArtCandidate}
                onCandidateSelected={candidateId => updateSession({
                  selectedArtCandidateId: candidateId,
                })}
                onCandidateDiscarded={candidateId => discardCandidate('art', candidateId)}
                onCandidateAdopted={adoptCandidate}
              />
            )}

            {!controllerLoading && workspaceState && <div style={{ display: activeStage === 'ability' ? undefined : 'none' }}>
              {sandboxGateErrors?.length && !sandboxFailure && !runtimeSandboxFailure && <section className="ai-validation-error-bar" role="status">
                <div><strong>{translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.playtest_failed_33437a")}</strong>
                  <p>{sandboxGateErrors.join('\n')}</p>
                  <p>{translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.these_errors_cannot_be_attributed_to_the_7c45dc")}</p>
                </div>
              </section>}
              <WorkshopAbilityPanel key={workspaceState.workspaceId}
                state={workspaceState}
                config={abilityConfig}
                apiFetch={workshopApiFetch}
                dispatch={dispatch}
                checkpoint={checkpoint}
                onAdopt={adoptCandidate}
                sandboxFailure={sandboxFailure?.workspaceId === workspaceState.workspaceId ? sandboxFailure : runtimeSandboxFailure?.workspaceId === workspaceState.workspaceId ? runtimeSandboxFailure : null}
                validationErrors={validationErrors}
                onValidationErrorsConsumed={() => setValidationErrors(null)}
              />
            </div>}

            {!controllerLoading && activeStage === 'localization' && (
              <div className="aicw-localization">
                <div>
                  <strong>{localizationReady
                    ? (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.chinese_localization_is_complete_79d700"))
                    : (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.chinese_localization_is_incomplete_20e8dc"))}</strong>
                  <p>{translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.english_stays_in_the_card_definition_chinese_4d6114")}</p>
                </div>
                <button type="button" className="aicw-button aicw-button-primary" onClick={() => setShowLocalizationModal(true)} disabled={!cardName.trim()}>
                  {localizationReady
                    ? (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.review_localization_4a3228"))
                    : (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.start_localization_1a3c1c"))}
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
                          ? (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.complete_e855f3"))
                          : stageCopy[stage].helper}</small>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="aicw-version-gate">
                  <div>
                    <span>{translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.approved_version_a59013")}</span>
                    <strong>{workspaceState?.approvedVersionId
                      ? workspaceState.approvedVersionId.slice(0, 12)
                      : (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.not_approved_yet_ab7035"))}</strong>
                  </div>
                  <div>
                    <span>{translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.same_version_sandbox_pass_3148ae")}</span>
                    <strong>{handoffReady
                      ? (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.community_pr_gate_satisfied_338925"))
                      : (translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.not_confirmed_8208c8"))}</strong>
                  </div>
                </div>
                <section className="aicw-version-history" aria-labelledby="aicw-version-history-title">
                  <div className="aicw-version-history-heading">
                    <div>
                      <span>{translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.immutable_snapshots_215ea0")}</span>
                      <h3 id="aicw-version-history-title">
                        {translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.version_history_8a6bf1")}
                      </h3>
                    </div>
                    {workspaceState?.session.restoreUndoDraft && (
                      <button
                        type="button"
                        className="aicw-button"
                        onClick={() => { void handleUndoRestore() }}
                        disabled={saving}
                      >
                        {translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.undo_restore_1af8cc")}
                      </button>
                    )}
                  </div>
                  {versionsLoading ? (
                    <div className="aicw-version-message" role="status">
                      {translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.loading_versions_b6fa69")}
                    </div>
                  ) : versionsError ? (
                    <div className="aicw-version-message is-error" role="alert">
                      <span>{versionsError}</span>
                      <button type="button" className="aicw-button" onClick={() => { void loadVersionHistory() }}>
                        {translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.retry_563171")}
                      </button>
                    </div>
                  ) : versions.length === 0 ? (
                    <div className="aicw-version-message">
                      {translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.versions_appear_here_after_adopting_a_candidate_1b2e97")}
                    </div>
                  ) : (
                    <ol>
                      {versions.map(version => (
                        <li key={version.id}>
                          <div>
                            <strong>
                              {translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.version_1a416b", { value0: version.version_number })}
                            </strong>
                            <span>
                              {typeof version.card_json.name === 'string'
                                ? version.card_json.name
                                : version.id.slice(0, 12)}
                            </span>
                          </div>
                          <button
                            type="button"
                            className="aicw-button"
                            onClick={() => { void handleRestoreVersion(version.id) }}
                            disabled={saving}
                            aria-label={translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.restore_version_6bd1f1", { value0: version.version_number })}
                          >
                            {translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.restore_b04c49")}
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
                <div className="aicw-handoff">
                  <div>
                    <strong>{translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.next_sandbox_test_a_fixed_version_f63b62")}</strong>
                    <span>{translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.pinning_locks_the_current_content_the_sandbox_17baa6")}</span>
                  </div>
                  <div>
                    <button type="button" className="aicw-button" onClick={() => { void handleSaveCard() }} disabled={saving || !metadataReady}>
                      {translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.save_checkpoint_707082")}
                    </button>
                    {onAddToSandboxAndRestart && (
                      <button type="button" className="aicw-button aicw-button-primary" onClick={() => { void handlePublishAndStartSandbox() }} disabled={saving || !workspaceState || !handoffInputsReady}>
                        {translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.pin_current_version_and_start_sandbox_dd896d")}
                      </button>
                    )}
                  </div>
                </div>
                {workspaceState?.session.sandboxTestVersionId && !handoffReady && (
                  <div className="aicw-sandbox-confirm">
                    <label>
                      <input
                        type="checkbox"
                        checked={sandboxConfirmation}
                        onChange={event => setSandboxConfirmation(event.target.checked)}
                        disabled={Boolean(sandboxGateErrors?.length)}
                      />
                      <span>{translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.i_confirm_this_pinned_version_has_no_f2be8e")}</span>
                    </label>
                    {sandboxGateErrors?.length
                      ? <small>{translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.fix_known_sandbox_errors_and_publish_again_f889d3")}</small>
                      : null}
                    <button
                      type="button"
                      className="aicw-button aicw-button-primary"
                      onClick={() => { void handleConfirmSandboxPass() }}
                      disabled={!sandboxConfirmation || saving}
                    >
                      {translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.confirm_sandbox_pass_ad9ed7")}
                    </button>
                  </div>
                )}
              </div>
            )}

            <footer className="aicw-stage-footer">
              <span>{activeStageIndex + 1} / {WORKSHOP_STAGES.length} · {stageCopy[activeStage].label}</span>
              {activeStageIndex < WORKSHOP_STAGES.length - 1 && (
                <button type="button" className="aicw-button" onClick={() => { void handleStageChange(WORKSHOP_STAGES[activeStageIndex + 1]!) }}>
                  {translateMessage(locale, "ui.copy.app_workshop_AiCardDesigner.next_stage_1dcf3e")}
                </button>
              )}
            </footer>
          </div>
        </section>
      </main>

      {showLocalizationModal && (
        <LocalizationModal
          currentContent={pickLocalizationCurrentContent({
            cardLocales,
            cardName,
            prerequisite,
            extractedName: extracted?.card.name,
            extractedDesc: extracted?.card.desc,
            extractedPrerequisite: extracted?.card.prerequisite,
          })}
          currentLang="en"
          locales={cardLocales}
          onSave={(updatedLocales) => {
            updateLocales(updatedLocales)
            setShowLocalizationModal(false)
          }}
          onClose={() => setShowLocalizationModal(false)}
        />
      )}
      {error && (
        <div
          ref={errorRef}
          className="form-error ai-error"
          role="alert"
          tabIndex={-1}
          style={{ whiteSpace: 'pre-wrap' }}
        >
          {error}
        </div>
      )}
    </div>
  )
}
