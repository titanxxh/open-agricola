# AI Card Designer Improvements Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three improvements to the AI Card Designer: (1) save button stays on editor instead of navigating away, (2) strip prerequisite text from card descriptions, (3) add a localization modal for translating card content to other languages.

**Architecture:** All changes are frontend-only. Task 1 modifies `AiCardDesigner.tsx` save handler. Task 2 adds an LLM prompt instruction in `llmPrompts.ts` and a parse-time filter in `llmService.ts`. Task 3 adds a new `LocalizationModal` component in `src/app/workshop/`, integrates it into `AiCardDesigner.tsx`, adds a `locales` field to the card JSON blob, and updates `PlayerCard.tsx` to read localized content.

**Tech Stack:** React, TypeScript, browser-side LLM calls via `llmService.ts`

---

### Task 1: Save Button Stays on Editor

**Files:**
- Modify: `src/app/workshop/AiCardDesigner.tsx:1114-1117`

- [ ] **Step 1: Modify `handleSaveCard` to remove navigation**

In `src/app/workshop/AiCardDesigner.tsx`, change `handleSaveCard` (line 1114-1117) from:

```typescript
const handleSaveCard = async () => {
  const dbId = await saveCardToWorkshop()
  if (dbId) { setCurrentCardDbId(dbId); refreshMyCards(); onSaved?.() }
}
```

to:

```typescript
const handleSaveCard = async () => {
  const dbId = await saveCardToWorkshop()
  if (dbId) { setCurrentCardDbId(dbId); refreshMyCards() }
}
```

This removes the `onSaved?.()` call which navigates back to the workshop home view. The existing `saveSuccess` state flash ("已保存" / "Saved") already provides visual feedback.

- [ ] **Step 2: Verify the change manually**

Start frontend + backend (`./restart-intranet.sh`), open `?page=workshop`, create or load a card in the AI designer, click "Save". Verify:
- The editor stays visible (no navigation to workshop home)
- "已保存" / "Saved" flash appears on the button
- "Add to Sandbox & Test" button remains clickable
- Auto-save still works normally

- [ ] **Step 3: Commit**

```bash
git add src/app/workshop/AiCardDesigner.tsx
git commit -m "fix: save button stays on editor instead of navigating away"
```

---

### Task 2: Strip Prerequisite from Card Description

**Files:**
- Modify: `src/services/llmPrompts.ts:46` (add instruction after 关键规则 section)
- Modify: `src/services/llmService.ts:345-346` (filter desc in `parseCardFromTs`)

- [ ] **Step 1: Add LLM prompt instruction**

In `src/services/llmPrompts.ts`, find the 关键规则 section (around line 46). Add a new bullet after the existing rules:

```typescript
- ❌ 禁止在 desc 数组中包含前置条件信息（如"前置条件：2 张职业卡"）——前置条件已在卡牌左上角单独显示
```

The full 关键规则 section should become:

```
**关键规则：**
- ❌ 禁止使用 import / export / require（沙盒会报错）
- 职业卡用 \`new Occupation({...})\`，小发展卡用 \`new MinorImprovement({...})\`
- CARD_ID 必须以 "CUSTOM_" 开头，英文驼峰
- deck 固定 'CUSTOM'，number 固定 0，implemented 固定 true
- 即使只做小修改，也要重新输出完整代码
- ❌ 禁止在 desc 数组中包含前置条件信息（如"前置条件：2 张职业卡"）——前置条件已在卡牌左上角单独显示
```

- [ ] **Step 2: Add parse-time filter in `parseCardFromTs`**

In `src/services/llmService.ts`, in the `parseCardFromTs` function, after extracting `desc` (line 345):

```typescript
const desc = extractArrayField(objStr, 'desc') ?? []
```

Add a filter to strip prerequisite lines:

```typescript
const descRaw = extractArrayField(objStr, 'desc') ?? []
const desc = descRaw.filter(line => {
  const trimmed = line.trim()
  // Filter out Chinese prerequisite patterns
  if (/^前置条件[：:]/.test(trimmed)) return false
  // Filter out English prerequisite patterns
  if (/^[Pp]rerequisite[s]?\s*[：:]/i.test(trimmed)) return false
  return true
})
```

- [ ] **Step 3: Verify the change**

Start the app, open AI Card Designer, design a card with a prerequisite (e.g., "2 个职业"). Verify:
- The LLM does not include prerequisite text in the `desc[]` array
- If the LLM still includes it, the parse-time filter strips it out
- The prerequisite is still displayed in the card's top-left corner via the `prerequisite` field

- [ ] **Step 4: Commit**

```bash
git add src/services/llmPrompts.ts src/services/llmService.ts
git commit -m "fix: strip prerequisite text from card descriptions"
```

---

### Task 3: Localization Modal

This task adds a "Localization" button to the AI Card Designer that opens a modal for translating card content (name, desc, prerequisite) to other languages using the player's configured LLM.

**Files:**
- Create: `src/app/workshop/LocalizationModal.tsx`
- Create: `src/app/workshop/LocalizationModal.css`
- Modify: `src/app/workshop/AiCardDesigner.tsx:1243-1267` (add localization button, state, pass locales to save)
- Modify: `src/services/llmService.ts` (add `translateCardContent` function)
- Modify: `src/components/common/PlayerCard.tsx:133-165` (read localized content)

#### Step 3a: Add `translateCardContent` to llmService

- [ ] **Step 3a-1: Add the translation function**

In `src/services/llmService.ts`, add after the `extractCardFromResponse` function (around line 315):

```typescript
/**
 * Translate card content (name, desc, prerequisite) to a target language.
 * Uses the player's existing LLM config — calls the LLM directly from the browser.
 */
export async function translateCardContent(
  content: { name: string; desc: string[]; prerequisite?: string },
  targetLang: string,
  config: LlmConfig,
): Promise<{ name: string; desc: string[]; prerequisite?: string }> {
  const langLabel = targetLang === 'en' ? 'English' : targetLang === 'zh' ? '中文' : targetLang
  const prompt = `Translate the following Agricola board game card content to ${langLabel}. Return ONLY a JSON object with the translated fields, no explanation or markdown.

Input:
${JSON.stringify(content, null, 2)}

Output format:
{"name": "translated name", "desc": ["translated line 1", "translated line 2"], "prerequisite": "translated prerequisite or omit if empty"}

Important:
- Keep resource tags like <WOOD>, <FOOD>, <GRAIN> etc. unchanged
- Keep game terminology accurate for board games
- Return valid JSON only, no markdown code fences`

  const messages: ChatMessage[] = [{ role: 'user', content: prompt }]
  let full = ''
  for await (const chunk of streamChat(messages, 'You are a professional translator for board game content.', config)) {
    full += chunk
  }

  // Strip markdown code fences if present
  const cleaned = full.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  const parsed = JSON.parse(cleaned) as { name: string; desc: string[]; prerequisite?: string }
  return {
    name: parsed.name ?? content.name,
    desc: Array.isArray(parsed.desc) ? parsed.desc : content.desc,
    prerequisite: parsed.prerequisite ?? undefined,
  }
}
```

- [ ] **Step 3a-2: Export the new function**

The function is already exported via the `export` keyword. Verify it's accessible by checking the import in the next step.

- [ ] **Step 3a-3: Commit**

```bash
git add src/services/llmService.ts
git commit -m "feat: add translateCardContent function for card localization"
```

#### Step 3b: Create LocalizationModal component

- [ ] **Step 3b-1: Create the CSS file**

Create `src/app/workshop/LocalizationModal.css`:

```css
.localization-modal-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.localization-modal {
  background: #fff;
  border-radius: 12px;
  width: 600px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.localization-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e8d5b7;
}

.localization-modal-header h3 {
  margin: 0;
  font-size: 16px;
  color: #3a2a10;
}

.localization-modal-body {
  overflow-y: auto;
  padding: 20px;
  flex: 1;
}

.localization-section {
  margin-bottom: 20px;
}

.localization-section-label {
  font-size: 13px;
  font-weight: 600;
  color: #5a3a20;
  margin-bottom: 8px;
}

.localization-field {
  margin-bottom: 12px;
}

.localization-field label {
  display: block;
  font-size: 12px;
  color: #888;
  margin-bottom: 4px;
}

.localization-field input,
.localization-field textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #cdb996;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
}

.localization-field input:focus,
.localization-field textarea:focus {
  border-color: #3a5a2c;
}

.localization-field textarea {
  min-height: 60px;
  resize: vertical;
  font-family: inherit;
}

.localization-field .readonly-text {
  padding: 8px 10px;
  background: #f5f0e8;
  border: 1px solid #e8d5b7;
  border-radius: 6px;
  font-size: 13px;
  color: #3a2a10;
  white-space: pre-wrap;
  min-height: 20px;
}

.localization-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid #e8d5b7;
  border-bottom: 1px solid #e8d5b7;
  margin-bottom: 20px;
}

.localization-lang-select {
  padding: 6px 10px;
  border: 1px solid #cdb996;
  border-radius: 6px;
  font-size: 13px;
  outline: none;
}

.localization-translate-btn {
  padding: 6px 16px;
  background: #3a5a2c;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
}

.localization-translate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.localization-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid #e8d5b7;
}

.localization-error {
  color: #c00;
  font-size: 12px;
  margin-top: 8px;
}
```

- [ ] **Step 3b-2: Create the LocalizationModal component**

Create `src/app/workshop/LocalizationModal.tsx`:

```tsx
import { useState } from 'react'
import { getLlmConfig, translateCardContent, type LlmConfig } from '../../services/llmService'
import { useLocale } from '../../contexts/LocaleContext'
import './LocalizationModal.css'

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
```

- [ ] **Step 3b-3: Commit**

```bash
git add src/app/workshop/LocalizationModal.tsx src/app/workshop/LocalizationModal.css
git commit -m "feat: add LocalizationModal component for card translation"
```

#### Step 3c: Integrate LocalizationModal into AiCardDesigner

- [ ] **Step 3c-1: Add imports and state**

In `src/app/workshop/AiCardDesigner.tsx`, add the import at the top (after existing imports around line 10):

```typescript
import { LocalizationModal } from './LocalizationModal'
```

Also add `translateCardContent` to the import from `llmService` (line 3):

```typescript
import {
  getLlmConfig, saveLlmConfig, clearLlmConfig, defaultModel,
  streamChat, extractCardFromResponse, generateCardArt, buildCardArtPrompt,
  supportsImageGeneration, KEY_LLM_CONFIG_ART, translateCardContent,
  PROVIDER_LABELS, PROVIDER_KEY_HINTS, PROVIDER_MODELS,
  type LlmConfig, type LlmProvider, type ChatMessage, type ReferenceImage,
} from '../../services/llmService'
```

Add state variables after the existing state declarations (after line 946):

```typescript
const [showLocalizationModal, setShowLocalizationModal] = useState(false)
const [cardLocales, setCardLocales] = useState<Record<string, { name: string; desc: string[]; prerequisite?: string }>>({})
```

- [ ] **Step 3c-2: Add the Localization button in the info bar**

In `src/app/workshop/AiCardDesigner.tsx`, after the "Add to Sandbox & Test" button (after line 1267), add the localization button:

```tsx
<button
  type="button"
  className="btn-primary ai-save-card-btn"
  onClick={() => setShowLocalizationModal(true)}
  disabled={!cardName.trim()}
>
  {locale === 'zh' ? '本地化' : 'Localize'}
</button>
```

- [ ] **Step 3c-3: Add the modal render**

At the end of the component's return JSX, just before the closing `</div>` of `ai-designer` (before line 1330), add:

```tsx
{showLocalizationModal && (
  <LocalizationModal
    currentContent={{
      name: extracted?.card?.name ?? cardName,
      desc: extracted?.card?.desc ?? [],
      prerequisite: extracted?.card?.prerequisite ?? prerequisite || undefined,
    }}
    currentLang={locale}
    locales={cardLocales}
    onSave={(updatedLocales) => {
      setCardLocales(updatedLocales)
      setShowLocalizationModal(false)
    }}
    onClose={() => setShowLocalizationModal(false)}
  />
)}
```

- [ ] **Step 3c-4: Include `locales` in the saved card JSON**

In `src/app/workshop/AiCardDesigner.tsx`, in the `saveCardToWorkshop` function, add the `locales` field to `cardJson` (after the `_draft` field, around line 1061):

```typescript
const cardJson = {
  id: cardId,
  name,
  card_type: card?.card_type ?? cardType,
  deck: 'CUSTOM',
  number: 0,
  desc: card?.desc ?? [],
  cost: card?.cost ?? {},
  vp: card?.vp ?? 0,
  prerequisite: card?.prerequisite ?? (prerequisite || undefined),
  modifiers: card?.modifiers ?? [],
  implemented: true,
  _draft: {
    prerequisite: prerequisite || undefined,
    costInput: costInput || undefined,
  },
  ...(Object.keys(cardLocales).length > 0 ? { locales: cardLocales } : {}),
}
```

- [ ] **Step 3c-5: Restore `locales` when loading a card**

In `src/app/workshop/AiCardDesigner.tsx`, in the `handleLoadCard` function (around line 1130), after `setExtracted(...)`, add:

```typescript
// Restore locales from card_json
const savedLocales = (cj.locales ?? {}) as Record<string, { name: string; desc: string[]; prerequisite?: string }>
setCardLocales(savedLocales)
```

- [ ] **Step 3c-6: Commit**

```bash
git add src/app/workshop/AiCardDesigner.tsx
git commit -m "feat: integrate localization modal into AI Card Designer"
```

#### Step 3d: Use localized content in PlayerCard

- [ ] **Step 3d-1: Update PlayerCard to read localized content**

In `src/components/common/PlayerCard.tsx`, in the `useMemo` block for minor improvements (lines 133-149), update to check for localized content:

Find the `else if (cardType === 'minor')` block:

```typescript
} else if (cardType === 'minor') {
  const minor = getMinorImprovement(cardId)
  if (!minor) return null
  return {
    name: minor.name,
    description: minor.desc.join('\n'),
```

Replace with:

```typescript
} else if (cardType === 'minor') {
  const minor = getMinorImprovement(cardId)
  if (!minor) return null
  const loc = (minor as Record<string, unknown>).locales as Record<string, { name: string; desc: string[]; prerequisite?: string }> | undefined
  const locContent = loc?.[locale]
  return {
    name: locContent?.name ?? minor.name,
    description: (locContent?.desc ?? minor.desc).join('\n'),
```

Do the same for the occupation block (lines 150-163). Find:

```typescript
} else {
  const occupation = getOccupation(cardId)
  if (!occupation) return null
  return {
    name: occupation.name,
    description: occupation.desc.join('\n'),
```

Replace with:

```typescript
} else {
  const occupation = getOccupation(cardId)
  if (!occupation) return null
  const loc = (occupation as Record<string, unknown>).locales as Record<string, { name: string; desc: string[]; prerequisite?: string }> | undefined
  const locContent = loc?.[locale]
  return {
    name: locContent?.name ?? occupation.name,
    description: (locContent?.desc ?? occupation.desc).join('\n'),
```

Also update the prerequisite field for both blocks. In the minor block, change:

```typescript
prerequisite: minor.prerequisite,
```

to:

```typescript
prerequisite: locContent?.prerequisite ?? minor.prerequisite,
```

And in the occupation block, change:

```typescript
prerequisite: occupation.prerequisite,
```

to:

```typescript
prerequisite: locContent?.prerequisite ?? occupation.prerequisite,
```

- [ ] **Step 3d-2: Commit**

```bash
git add src/components/common/PlayerCard.tsx
git commit -m "feat: display localized card content based on current locale"
```

#### Step 3e: Manual Verification

- [ ] **Step 3e-1: End-to-end test**

Start the app (`./restart-intranet.sh`), open `?page=workshop&devMode=1`:

1. Open AI Card Designer, design a card in Chinese
2. Click "Save" — verify editor stays open
3. Click "Localize" — verify modal opens with Chinese content on top
4. Select "English" in the language dropdown, click "Translate"
5. Verify translated content appears in the bottom fields
6. Edit if needed, click "Save" in the modal
7. Click "Save" on the main editor to persist
8. Switch the app locale to English (via locale switcher)
9. Verify the card now shows English name/description/prerequisite
10. Switch back to Chinese — verify original Chinese content still shows

- [ ] **Step 3e-2: Verify prerequisite filtering**

1. Design a new card with prerequisite "2 个职业"
2. Verify the description does NOT contain "前置条件：2 张职业卡" or similar text
3. Verify the prerequisite appears in the card's top-left corner

- [ ] **Step 3e-3: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address issues from manual verification"
```
