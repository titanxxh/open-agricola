# UI Overhaul — Batch 1: Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the styling/component foundation for the tableau-style UI overhaul: split `client/App.css` (5666 lines) into per-page files, add new design tokens (additive, no removal), build 4 reusable common components (SelectButton, EmptyState, Section, DangerButton), and wire `LocaleSwitcher` to use `SelectButton`. Visual output should be **virtually unchanged** at end of this batch.

**Architecture:** Pure additive: new files under `client/styles/`, new components under `client/components/common/`. Old App.css selectors are migrated 1:1 (cut + paste, no rewrites) into per-page files. Cascade order is preserved by `@import` ordering in the slimmed-down `App.css`.

**Tech Stack:** React 19 + TypeScript (strict), Vite, Vitest. Adds `@testing-library/react` + `@testing-library/user-event` + `jsdom` as devDependencies for interactive component tests (existing tests use `renderToStaticMarkup`; that pattern stays for static-render components).

**Spec:** `docs/superpowers/specs/2026-04-23-ui-overhaul-design.md` — Sections 2, 3, 4, 5

---

## File Structure (Batch 1 produces)

```
client/
├── components/common/
│   ├── SelectButton.tsx              (new)
│   ├── EmptyState.tsx                (new)
│   ├── Section.tsx                   (new)
│   ├── DangerButton.tsx              (new)
│   ├── LocaleSwitcher.tsx            (modified — internal: use SelectButton)
│   └── __tests__/
│       ├── SelectButton.test.tsx     (new)
│       ├── EmptyState.test.tsx       (new)
│       ├── Section.test.tsx          (new)
│       └── DangerButton.test.tsx     (new)
│
├── styles/
│   ├── tokens.css                    (new — :root + new tableau tokens)
│   ├── base.css                      (new — @font-face, reset, focus, .app)
│   ├── components.css                (new — buttons + 4 new component classes)
│   └── pages/
│       ├── login.css                 (new — moved from App.css)
│       ├── lobby.css                 (new — moved from App.css)
│       ├── workshop.css              (new — moved from App.css + LocalizationModal.css absorbed)
│       ├── settings.css              (new — moved from App.css)
│       └── game.css                  (new — moved from App.css, the bulk of selectors)
│
├── App.css                           (modified — slimmed to ~12 @import lines)
└── app/workshop/
    └── LocalizationModal.css         (deleted — content moved to pages/workshop.css)
```

Total: 11 new files, 2 modified, 1 deleted.

---

## Task 0: Pre-flight — Take Batch 0 Baseline Screenshots

**Files:**
- Create: `output/tmp/batch-0-baseline/` (folder)

- [ ] **Step 1: Confirm baseline screenshots exist**

The brainstorming session already produced baseline screenshots in `output/tmp/01..23-*.png`. Verify they're present:

Run: `ls output/tmp/*.png | wc -l`
Expected: `>= 13` (10+ baseline + a few mockups)

If missing, regenerate by running the script that produced them. Otherwise, copy the relevant ones to a versioned baseline folder:

```bash
mkdir -p output/tmp/batch-0-baseline
cp output/tmp/01-landing-login.png \
   output/tmp/04-lobby.png \
   output/tmp/05-workshop.png \
   output/tmp/06-settings.png \
   output/tmp/11-workshop-designer.png \
   output/tmp/20-game-1920.png \
   output/tmp/21-game-1920-full.png \
   output/tmp/09-mobile-lobby.png \
   output/tmp/10-mobile-workshop.png \
   output/tmp/15-mobile-single-game.png \
   output/tmp/batch-0-baseline/
```

- [ ] **Step 2: Verify baseline files**

Run: `ls output/tmp/batch-0-baseline/ | wc -l`
Expected: `10`

---

## Task 1: Add Testing-Library Dependencies

**Files:**
- Modify: `package.json` (add devDependencies)

- [ ] **Step 1: Install dev dependencies**

```bash
pnpm add -D @testing-library/react@^16.0.0 @testing-library/user-event@^14.5.0 @testing-library/jest-dom@^6.4.0 jsdom@^25.0.0
```

- [ ] **Step 2: Update vitest config to use jsdom for React component tests**

Modify `vitest.config.ts`:

```ts
import { defineConfig, defaultExclude, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      exclude: [...defaultExclude, '**/.worktree/**'],
      setupFiles: ['./shared/cards/__tests__/setup-register-all.ts'],
      environmentMatchGlobs: [
        ['client/**/*.test.tsx', 'jsdom'],
      ],
    },
  }),
)
```

- [ ] **Step 3: Verify existing tests still pass**

Run: `pnpm test`
Expected: All previous tests pass (the `environmentMatchGlobs` rule only activates for `.test.tsx` under `client/`, so no behavior change for existing `.test.ts` shared tests).

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts
git commit -m "chore(client): add @testing-library/react + jsdom for component tests"
```

---

## Task 2: Create `client/styles/tokens.css` (additive)

**Files:**
- Create: `client/styles/tokens.css`

- [ ] **Step 1: Write tokens.css**

```css
/* ══════════ DESIGN TOKENS ══════════
 * Existing tokens preserved (back-compat). New tableau-* tokens added at bottom.
 * Old tokens may be cleaned up after Batch 3 verifies no regressions.
 */
:root {
  /* ─── existing (preserved verbatim from App.css:20-49) ─── */
  --agricola-font: 'Dominican', 'CalibriB', serif;
  --app-edge-padding: clamp(12px, 2vw, 24px);
  --game-header-gap: 8px;
  --color-primary: #3a5a2c;
  --color-primary-hover: #2d4a21;
  --color-accent: #d4a017;
  --color-bg-warm: #fdf6e3;
  --color-bg-card: #fff;
  --color-text: #1e1e1e;
  --color-text-secondary: #5a3a20;
  --color-text-muted: #8a7a60;
  --color-border: #cdb996;
  --color-border-light: #e8d5b7;
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-pill: 999px;
  --color-success: #2d7a1f;
  --color-success-bg: #e8f5e0;
  --color-error: #c0392b;
  --color-error-bg: #fde8e8;
  --color-danger: #d74a3a;
  --color-danger-border: #f5c6cb;
  --interaction-bar-max-height: 40vh;

  /* ─── new: tableau atmosphere ─── */
  --bg-wood-dark:
    radial-gradient(ellipse at top, rgba(0,0,0,.15), transparent 60%),
    repeating-linear-gradient(87deg, #4a2f18 0, #3a2410 6px, #4a2f18 12px, #5a3a20 18px),
    #2b1908;

  --bg-wood-light:
    repeating-linear-gradient(90deg, #8b6f47 0, #7a5f37 8px, #8b6f47 16px),
    #6b5337;

  --bg-parchment:
    radial-gradient(ellipse at top left, #fdf6e3, #e8d8a8 60%, #c8a878 130%);

  --bg-parchment-noisy:
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><filter id='n'><feTurbulence baseFrequency='0.9'/><feColorMatrix values='0 0 0 0 0.85  0 0 0 0 0.78  0 0 0 0 0.62  0 0 0 0.18 0'/></filter><rect width='80' height='80' filter='url(%23n)' opacity='0.4'/></svg>"),
    radial-gradient(ellipse at top left, #fdf6e3, #e8d8a8 60%, #c8a878);

  --shadow-paper:
    0 0 0 1px var(--color-border) inset,
    0 0 0 4px var(--color-bg-warm) inset,
    0 6px 16px rgba(0,0,0,0.4);

  --btn-emboss-primary:
    inset 0 1px 0 rgba(255,255,255,0.25),
    inset 0 -2px 4px rgba(0,0,0,0.25),
    0 2px 0 #1f3815,
    0 4px 6px rgba(0,0,0,0.3);

  --btn-emboss-secondary:
    inset 0 1px 0 rgba(255,255,255,0.4),
    inset 0 -2px 4px rgba(74,47,24,0.25),
    0 2px 0 var(--color-border),
    0 4px 6px rgba(0,0,0,0.2);

  --color-accent-strong: #c98a0c;
  --color-accent-bg: #fff3d6;
  --color-accent-border: #d4a017;

  --fs-display: clamp(28px, 3vw, 40px);
  --fs-h1: clamp(22px, 2.4vw, 28px);
  --fs-h2: clamp(18px, 2vw, 22px);
  --fs-h3: 16px;
  --fs-body: 14px;
  --fs-small: 12px;

  --action-board-scale: 1;
}
```

- [ ] **Step 2: Commit (file exists but not imported yet — no visual change)**

```bash
git add client/styles/tokens.css
git commit -m "feat(client): add tableau-style design tokens (additive)"
```

---

## Task 3: Mechanically Split App.css into Per-Page Files

**Files:**
- Create: `client/styles/base.css`
- Create: `client/styles/components.css`
- Create: `client/styles/pages/login.css`
- Create: `client/styles/pages/lobby.css`
- Create: `client/styles/pages/workshop.css`
- Create: `client/styles/pages/settings.css`
- Create: `client/styles/pages/game.css`
- Modify: `client/App.css` (replace contents with imports)
- Delete: `client/app/workshop/LocalizationModal.css`
- Modify: `client/app/workshop/LocalizationModal.tsx` (remove the import)

**Strategy:** This is a **pure mechanical move**. Do NOT change any property values. Do NOT rename any selectors. Do NOT consolidate duplicates. Cut and paste based on the rules in spec §5.2.

- [ ] **Step 1: Read all 5666 lines of `client/App.css` and classify each rule block**

Use Grep to enumerate all selectors:

Run: `grep -n '^[\.#@:]\|^[a-z]' client/App.css | head -200`

Then continue scanning in chunks of 200 lines. For each rule (or `@media` block), tag it with the destination per spec §5.2:

| Selector pattern | Destination |
|---|---|
| `:root { ... }` (line 19-49) | `tokens.css` (already extracted in Task 2 — DELETE from App.css now) |
| `@font-face` (lines 1-17) | `base.css` |
| `* { box-sizing }`, `body`, `#root` | `base.css` |
| `.app`, `.app-bootstrap-*` | `base.css` |
| `button:focus-visible`, etc. | `base.css` |
| `@keyframes fadeSlideIn`, etc. | `base.css` |
| `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-small`, `.btn-ghost` | `components.css` |
| `.form-field`, `.form-error`, `.form-hint` | `components.css` |
| `.locale-select` | `components.css` (LocaleSwitcher is shared) |
| `.login-*` | `pages/login.css` |
| `.lobby-*`, `.rooms-empty`, `.join-form`, `.player-select-*` | `pages/lobby.css` |
| `.ws-*`, `.workshop-*`, `.ai-designer-*`, `.localization-modal-*`, `.propose-modal-*` | `pages/workshop.css` |
| `.settings-*` | `pages/settings.css` |
| `.game-layout`, `.game-header*`, `.board`, `.action-board*`, `.action-card*`, `.action-area*`, `.farm-grid`, `.farm-tile*`, `.player-farm*`, `.major-improvements*`, `.collapse-toggle`, `.interaction-bar*`, `.anytime-bar*`, `.anytime-actions`, `.anytime-title`, `.harvest-*`, `.draft-*`, `.gain-*`, `.round-*`, `.center`, `.actions-side`, `.farm-side`, `.action-board-wrapper`, `.player-tag`, `.score-*`, `.log-*`, `.event-*`, `.pending-*`, `.choice-*`, `.dialog-*`, `.modal-*`, `.tooltip-*` | `pages/game.css` |
| Anything else not matching above | `pages/game.css` (per spec §5.2 fallback rule) |

- [ ] **Step 2: Create skeleton files with attribution headers**

```bash
for f in client/styles/base.css \
         client/styles/components.css \
         client/styles/pages/login.css \
         client/styles/pages/lobby.css \
         client/styles/pages/workshop.css \
         client/styles/pages/settings.css \
         client/styles/pages/game.css; do
  printf '/* Migrated from client/App.css during UI overhaul Batch 1 (mechanical split, no rewrites). */\n\n' > "$f"
done
```

- [ ] **Step 3: Move `@font-face` blocks (App.css lines 1-17) and globals to `base.css`**

Cut from App.css:
- `@font-face` blocks (lines 1-17)
- `* { box-sizing: border-box }` block
- `body { ... }` block
- `#root { ... }` block (note: this is in `client/index.css`, not App.css — confirm by reading index.css)
- `button:focus-visible, select:focus-visible, ...` block (line ~52-58)
- `.app { ... }` block (line 60-67)
- `.app-bootstrap-error`, `.app-bootstrap-loading` (search and find)
- All `@keyframes` blocks
- The `.lobby-page` `animation: fadeSlideIn ...` is page-specific so leave it for `pages/lobby.css`

Append to `base.css`. The `:root` block (lines 19-49) is **already in tokens.css** — DELETE it from App.css too.

- [ ] **Step 4: Move button + form classes to `components.css`**

Cut from App.css:
- `.btn-primary`, `.btn-primary:hover`, `.btn-primary:disabled`, `.btn-primary:active`
- `.btn-secondary`, hover/active states
- `.btn-danger`, `.btn-small.btn-danger-small`, hover states
- `.btn-small`, hover/active
- `.btn-ghost` (if present)
- `.form-field`, `.form-error`
- `.locale-select`

Append to `components.css`.

- [ ] **Step 5: Move per-page selectors**

For each page file (login/lobby/workshop/settings/game), grep App.css for all matching selectors and move them. Hint commands:

```bash
grep -n '^\.login-\|^\.brand-mark' client/App.css | head -30   # login
grep -n '^\.lobby-\|^\.rooms-\|^\.join-\|^\.player-select-' client/App.css | head -30
grep -n '^\.ws-\|^\.workshop-\|^\.ai-designer-\|^\.propose-modal-\|^\.localization-modal-' client/App.css | head -30
grep -n '^\.settings-' client/App.css | head -30
```

Game page is the bulk; everything left after the above moves goes to `pages/game.css`.

- [ ] **Step 6: Move LocalizationModal.css contents into pages/workshop.css**

```bash
cat client/app/workshop/LocalizationModal.css >> client/styles/pages/workshop.css
git rm client/app/workshop/LocalizationModal.css
```

Edit `client/app/workshop/LocalizationModal.tsx`:

```diff
-import './LocalizationModal.css'
```

(The class names will resolve via the global App.css → workshop.css import chain.)

- [ ] **Step 7: Handle `@media` blocks**

For each `@media` block in App.css (use `grep -n '^@media' client/App.css` to find all), split its body across destination files. Example:

```css
/* Original in App.css line ~3010 */
@media (max-width: 1100px) {
  :root { --app-edge-padding: 6px; }
  .game-layout { grid-template-columns: 1fr; }
  .lobby-actions { ... }
}
```

Becomes:
- In `tokens.css` end: `@media (max-width: 1100px) { :root { --app-edge-padding: 6px; } }`
- In `pages/game.css` end: `@media (max-width: 1100px) { .game-layout { ... } }`
- In `pages/lobby.css` end: `@media (max-width: 1100px) { .lobby-actions { ... } }`

- [ ] **Step 8: Replace App.css with imports**

Overwrite `client/App.css`:

```css
/* App.css — entry aggregator. All actual styles live in client/styles/. */
@import './styles/tokens.css';
@import './styles/base.css';
@import './styles/components.css';
@import './styles/pages/login.css';
@import './styles/pages/lobby.css';
@import './styles/pages/workshop.css';
@import './styles/pages/settings.css';
@import './styles/pages/game.css';
@import './styles/card-sprite.css';
```

(card-sprite.css is currently imported elsewhere — keep that import; this one is harmless dup since CSS `@import` is deduped by Vite.)

- [ ] **Step 9: Confirm card-sprite.css is still imported correctly**

Run: `grep -rn 'card-sprite.css' client/`
Expected: at least one file imports it. If only App.css now imports it, that's fine.

- [ ] **Step 10: Verify zero lines lost**

Count CSS rule blocks before and after:

```bash
# Sum of `{` characters in original App.css
git show HEAD:client/App.css | grep -c '^[^/].*{$'

# Sum of `{` in all new files
grep -hc '^[^/].*{$' client/App.css client/styles/tokens.css client/styles/base.css client/styles/components.css client/styles/pages/*.css | paste -sd+ | bc
```

Expected: counts match (or new sum is exactly 1 less because `App.css { ... }` itself is gone).

- [ ] **Step 11: Run typecheck + tests + build**

```bash
pnpm exec tsc --noEmit
pnpm test
pnpm run build
```

Expected: all pass. Build will produce a CSS bundle that should be **byte-equivalent** (or near-byte-equivalent) to the previous bundle.

- [ ] **Step 12: Visual diff vs baseline**

Run the screenshot script (the one used during the review session — it lives in `output/tmp/shoot.mjs` if preserved, otherwise re-create from this template):

```bash
mkdir -p output/tmp/batch-1-after
# Re-run the same shoot.mjs script that produced output/tmp/01..15-*.png
# but write to output/tmp/batch-1-after/ instead
LOGIN_USER=xxh LOGIN_PASS=brasil OUT_DIR=output/tmp/batch-1-after node .tmp-shoot.mjs
```

(If `.tmp-shoot.mjs` doesn't exist, recreate it from the brainstorming session — it's a small Playwright script, see `output/tmp/shoot.mjs` if archived.)

Compare each PNG against `output/tmp/batch-0-baseline/`. Expected: visually identical (pixel diff acceptable due to font subpixel rendering, but no layout/color shifts).

- [ ] **Step 13: Commit**

```bash
git add -A client/
git commit -m "$(cat <<'EOF'
refactor(client): split App.css into per-page files

Mechanical migration of 5666-line App.css into:
  - styles/tokens.css        :root design tokens
  - styles/base.css          @font-face, reset, focus, .app
  - styles/components.css    buttons, forms, locale-select
  - styles/pages/{login,lobby,workshop,settings,game}.css

App.css now only @imports the above. Visual output unchanged
(verified by screenshot diff vs Batch 0 baseline).

Also absorbs client/app/workshop/LocalizationModal.css into
pages/workshop.css and drops the now-empty CSS file.
EOF
)"
```

---

## Task 4: Build SelectButton Component

**Files:**
- Create: `client/components/common/SelectButton.tsx`
- Create: `client/components/common/__tests__/SelectButton.test.tsx`
- Modify: `client/styles/components.css` (add `.select-button-*` styles)

- [ ] **Step 1: Write the failing test**

Create `client/components/common/__tests__/SelectButton.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SelectButton } from '../SelectButton'

const OPTIONS = [
  { value: 'zh', label: '中文' },
  { value: 'en', label: 'English' },
] as const

describe('SelectButton', () => {
  it('renders the current value in the trigger', () => {
    render(<SelectButton value="zh" options={OPTIONS as any} onChange={() => {}} />)
    expect(screen.getByRole('button')).toHaveTextContent('中文')
  })

  it('opens the popover on click', async () => {
    const user = userEvent.setup()
    render(<SelectButton value="zh" options={OPTIONS as any} onChange={() => {}} />)
    await user.click(screen.getByRole('button'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(2)
  })

  it('calls onChange and closes when an option is selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SelectButton value="zh" options={OPTIONS as any} onChange={onChange} />)
    await user.click(screen.getByRole('button'))
    await user.click(screen.getByRole('option', { name: 'English' }))
    expect(onChange).toHaveBeenCalledWith('en')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('closes on Escape key', async () => {
    const user = userEvent.setup()
    render(<SelectButton value="zh" options={OPTIONS as any} onChange={() => {}} />)
    await user.click(screen.getByRole('button'))
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('navigates with arrow keys and selects with Enter', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SelectButton value="zh" options={OPTIONS as any} onChange={onChange} />)
    await user.click(screen.getByRole('button'))
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith('en')
  })

  it('respects disabled prop', () => {
    render(<SelectButton value="zh" options={OPTIONS as any} onChange={() => {}} disabled />)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
```

Need a setup file for `@testing-library/jest-dom`. Create `client/__tests__/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

Add it to `vitest.config.ts`:

```ts
setupFiles: [
  './shared/cards/__tests__/setup-register-all.ts',
  './client/__tests__/setup.ts',
],
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
pnpm exec vitest run client/components/common/__tests__/SelectButton.test.tsx
```

Expected: FAIL — `Cannot find module '../SelectButton'`.

- [ ] **Step 3: Implement SelectButton**

Create `client/components/common/SelectButton.tsx`:

```tsx
import { useEffect, useRef, useState, useCallback } from 'react'

export type SelectOption<T extends string> = {
  value: T
  label: string
  icon?: string
}

interface SelectButtonProps<T extends string> {
  value: T
  options: SelectOption<T>[]
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  placeholder?: string
  disabled?: boolean
  ariaLabel?: string
  className?: string
}

export function SelectButton<T extends string>({
  value, options, onChange, size = 'md',
  placeholder, disabled, ariaLabel, className,
}: SelectButtonProps<T>) {
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(() =>
    Math.max(0, options.findIndex((o) => o.value === value)),
  )
  const rootRef = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close()
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { close(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => (i + 1) % options.length); return }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => (i - 1 + options.length) % options.length); return }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onChange(options[activeIdx].value)
        close()
      }
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, options, activeIdx, onChange, close])

  const current = options.find((o) => o.value === value)
  const label = current?.label ?? placeholder ?? ''

  return (
    <div
      ref={rootRef}
      className={`select-button select-button--${size}${className ? ` ${className}` : ''}`}
    >
      <button
        type="button"
        className="select-button__trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        {current?.icon && <span className="select-button__icon">{current.icon}</span>}
        <span className="select-button__label">{label}</span>
        <span className="select-button__caret" aria-hidden>▾</span>
      </button>
      {open && (
        <ul role="listbox" className="select-button__popover">
          {options.map((opt, idx) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              className={`select-button__option${idx === activeIdx ? ' is-active' : ''}${opt.value === value ? ' is-selected' : ''}`}
              onMouseEnter={() => setActiveIdx(idx)}
              onClick={() => { onChange(opt.value); close() }}
            >
              {opt.icon && <span className="select-button__icon">{opt.icon}</span>}
              <span>{opt.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Add styles to `client/styles/components.css`**

Append:

```css
/* ══════════ SelectButton ══════════ */
.select-button { position: relative; display: inline-block; }
.select-button__trigger {
  display: inline-flex; align-items: center; gap: 6px;
  background: var(--bg-parchment, #fff);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 6px 12px;
  font: inherit;
  color: var(--color-text);
  cursor: pointer;
  box-shadow: var(--btn-emboss-secondary, none);
}
.select-button__trigger:disabled { opacity: 0.5; cursor: not-allowed; }
.select-button--sm .select-button__trigger { padding: 4px 10px; font-size: var(--fs-small); }
.select-button__caret { font-size: 10px; opacity: 0.6; }
.select-button__popover {
  position: absolute; top: calc(100% + 4px); left: 0;
  list-style: none; margin: 0; padding: 4px;
  min-width: 100%;
  background: var(--bg-parchment, #fff);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-paper, 0 4px 12px rgba(0,0,0,0.15));
  z-index: 100;
}
.select-button__option {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  white-space: nowrap;
  color: var(--color-text);
}
.select-button__option.is-active { background: var(--color-accent-bg, var(--color-bg-warm)); }
.select-button__option.is-selected {
  font-weight: 600;
  color: var(--color-accent-strong, var(--color-primary));
}
.select-button__icon { display: inline-flex; align-items: center; }
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
pnpm exec vitest run client/components/common/__tests__/SelectButton.test.tsx
```

Expected: all 6 tests pass.

- [ ] **Step 6: Run full test suite + typecheck**

```bash
pnpm test
pnpm exec tsc --noEmit
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add client/components/common/SelectButton.tsx \
        client/components/common/__tests__/SelectButton.test.tsx \
        client/__tests__/setup.ts \
        client/styles/components.css \
        vitest.config.ts
git commit -m "feat(client): add SelectButton common component"
```

---

## Task 5: Build EmptyState Component

**Files:**
- Create: `client/components/common/EmptyState.tsx`
- Create: `client/components/common/__tests__/EmptyState.test.tsx`
- Modify: `client/styles/components.css`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EmptyState } from '../EmptyState'

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState title="No rooms" description="Be the first to start one!" />)
    expect(screen.getByText('No rooms')).toBeInTheDocument()
    expect(screen.getByText('Be the first to start one!')).toBeInTheDocument()
  })

  it('renders custom icon', () => {
    render(<EmptyState icon="🎲" title="No rooms" />)
    expect(screen.getByText('🎲')).toBeInTheDocument()
  })

  it('renders default icon when none provided', () => {
    render(<EmptyState title="No rooms" />)
    expect(screen.getByLabelText(/empty state/i)).toBeInTheDocument()
  })

  it('renders action when provided', () => {
    render(
      <EmptyState
        title="No rooms"
        action={<button>Create one</button>}
      />,
    )
    expect(screen.getByRole('button', { name: 'Create one' })).toBeInTheDocument()
  })

  it('applies compact variant class', () => {
    const { container } = render(<EmptyState title="X" variant="compact" />)
    expect(container.querySelector('.empty-state--compact')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test, confirm fail**

```bash
pnpm exec vitest run client/components/common/__tests__/EmptyState.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement EmptyState**

```tsx
import type { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  variant?: 'default' | 'compact'
  className?: string
}

export function EmptyState({
  icon, title, description, action,
  variant = 'default', className,
}: EmptyStateProps) {
  return (
    <div
      className={`empty-state empty-state--${variant}${className ? ` ${className}` : ''}`}
      aria-label="empty state"
    >
      <div className="empty-state__icon" aria-hidden>
        {icon ?? '📦'}
      </div>
      <h3 className="empty-state__title">{title}</h3>
      {description && <p className="empty-state__desc">{description}</p>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  )
}
```

- [ ] **Step 4: Add styles**

Append to `components.css`:

```css
/* ══════════ EmptyState ══════════ */
.empty-state {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  text-align: center;
  padding: 32px 16px;
  color: var(--color-text-muted);
}
.empty-state__icon {
  font-size: 40px;
  margin-bottom: 12px;
  opacity: 0.7;
}
.empty-state__title {
  margin: 0 0 6px;
  font-size: var(--fs-h3);
  color: var(--color-text-secondary);
  font-weight: 600;
}
.empty-state__desc {
  margin: 0 0 16px;
  font-size: var(--fs-small);
  line-height: 1.5;
  max-width: 360px;
}
.empty-state__action { margin-top: 8px; }
.empty-state--compact { padding: 16px 12px; }
.empty-state--compact .empty-state__icon { font-size: 24px; margin-bottom: 6px; }
.empty-state--compact .empty-state__title { font-size: var(--fs-body); }
```

- [ ] **Step 5: Run tests**

```bash
pnpm exec vitest run client/components/common/__tests__/EmptyState.test.tsx
```

Expected: all 5 pass.

- [ ] **Step 6: Commit**

```bash
git add client/components/common/EmptyState.tsx \
        client/components/common/__tests__/EmptyState.test.tsx \
        client/styles/components.css
git commit -m "feat(client): add EmptyState common component"
```

---

## Task 6: Build Section Component

**Files:**
- Create: `client/components/common/Section.tsx`
- Create: `client/components/common/__tests__/Section.test.tsx`
- Modify: `client/styles/components.css`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Section } from '../Section'

describe('Section', () => {
  it('renders title and children', () => {
    render(<Section title="Hello"><p>Body</p></Section>)
    expect(screen.getByText('Hello')).toBeInTheDocument()
    expect(screen.getByText('Body')).toBeInTheDocument()
  })

  it('renders subtitle and icon', () => {
    render(
      <Section title="T" subtitle="S" icon="🎲">
        <p>x</p>
      </Section>,
    )
    expect(screen.getByText('S')).toBeInTheDocument()
    expect(screen.getByText('🎲')).toBeInTheDocument()
  })

  it('renders actions next to title', () => {
    render(
      <Section title="T" actions={<button>+ Add</button>}>
        <p>x</p>
      </Section>,
    )
    expect(screen.getByRole('button', { name: '+ Add' })).toBeInTheDocument()
  })

  it('applies parchment variant class', () => {
    const { container } = render(
      <Section title="T" variant="parchment">x</Section>,
    )
    expect(container.querySelector('.section--parchment')).toBeInTheDocument()
  })

  it('toggles collapse when collapsible', () => {
    render(
      <Section title="T" collapsible defaultCollapsed={false}>
        <p>Body</p>
      </Section>,
    )
    expect(screen.getByText('Body')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /collapse|fold|toggle/i }))
    expect(screen.queryByText('Body')).not.toBeInTheDocument()
  })

  it('renders collapsed by default when defaultCollapsed=true', () => {
    render(
      <Section title="T" collapsible defaultCollapsed>
        <p>Body</p>
      </Section>,
    )
    expect(screen.queryByText('Body')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test, confirm fail**

- [ ] **Step 3: Implement Section**

```tsx
import { useState, type ReactNode } from 'react'

interface SectionProps {
  title?: string
  subtitle?: string
  icon?: ReactNode
  actions?: ReactNode
  variant?: 'default' | 'parchment' | 'sandbox'
  collapsible?: boolean
  defaultCollapsed?: boolean
  className?: string
  children: ReactNode
}

export function Section({
  title, subtitle, icon, actions,
  variant = 'default', collapsible = false, defaultCollapsed = false,
  className, children,
}: SectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  return (
    <section className={`section section--${variant}${className ? ` ${className}` : ''}`}>
      {(title || actions) && (
        <header className="section__header">
          <div className="section__heading">
            {icon && <span className="section__icon" aria-hidden>{icon}</span>}
            {title && <h2 className="section__title">{title}</h2>}
            {subtitle && <p className="section__subtitle">{subtitle}</p>}
          </div>
          {(actions || collapsible) && (
            <div className="section__actions">
              {actions}
              {collapsible && (
                <button
                  type="button"
                  className="section__toggle"
                  aria-label={collapsed ? 'expand' : 'collapse'}
                  onClick={() => setCollapsed((v) => !v)}
                >
                  {collapsed ? '▸' : '▾'}
                </button>
              )}
            </div>
          )}
        </header>
      )}
      {!collapsed && <div className="section__body">{children}</div>}
    </section>
  )
}
```

- [ ] **Step 4: Add styles to `components.css`**

```css
/* ══════════ Section ══════════ */
.section {
  background: var(--color-bg-card);
  border-radius: var(--radius-md);
  padding: var(--spacing-md) var(--spacing-lg);
  box-shadow: 0 2px 12px rgba(90, 58, 32, 0.08);
}
.section--parchment {
  background: var(--bg-parchment, var(--color-bg-card));
  box-shadow: var(--shadow-paper, 0 2px 12px rgba(90, 58, 32, 0.08));
  border: 1px solid var(--color-border);
}
.section--sandbox {
  background: var(--bg-parchment-noisy, var(--color-bg-warm));
  box-shadow: var(--shadow-paper, 0 4px 16px rgba(90, 58, 32, 0.15));
  border: 2px solid var(--color-accent-border, var(--color-border));
}
.section__header {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 16px; margin-bottom: var(--spacing-md);
}
.section__heading { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.section__icon { font-size: var(--fs-h2); }
.section__title { margin: 0; font-size: var(--fs-h2); color: var(--color-primary); font-weight: 700; }
.section__subtitle { margin: 0; font-size: var(--fs-small); color: var(--color-text-muted); }
.section__actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.section__toggle {
  background: none; border: none; cursor: pointer;
  font-size: 14px; color: var(--color-text-muted);
  padding: 4px 8px;
}
.section__body { color: var(--color-text); }
```

- [ ] **Step 5: Run tests**

```bash
pnpm exec vitest run client/components/common/__tests__/Section.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add client/components/common/Section.tsx \
        client/components/common/__tests__/Section.test.tsx \
        client/styles/components.css
git commit -m "feat(client): add Section common component"
```

---

## Task 7: Build DangerButton Component

**Files:**
- Create: `client/components/common/DangerButton.tsx`
- Create: `client/components/common/__tests__/DangerButton.test.tsx`
- Modify: `client/styles/components.css`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DangerButton } from '../DangerButton'

describe('DangerButton', () => {
  it('calls onConfirm directly when no confirmText', async () => {
    const user = userEvent.setup()
    const fn = vi.fn()
    render(<DangerButton onConfirm={fn}>Delete</DangerButton>)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('shows confirm dialog when confirmText is set', async () => {
    const user = userEvent.setup()
    const fn = vi.fn()
    render(
      <DangerButton confirmText="Sure?" onConfirm={fn}>Delete</DangerButton>,
    )
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByText('Sure?')).toBeInTheDocument()
    expect(fn).not.toHaveBeenCalled()
  })

  it('confirms and calls onConfirm when user accepts', async () => {
    const user = userEvent.setup()
    const fn = vi.fn()
    render(
      <DangerButton confirmText="Sure?" onConfirm={fn}>Delete</DangerButton>,
    )
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: /confirm|确认|yes/i }))
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('cancels and skips onConfirm', async () => {
    const user = userEvent.setup()
    const fn = vi.fn()
    render(
      <DangerButton confirmText="Sure?" onConfirm={fn}>Delete</DangerButton>,
    )
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: /cancel|取消|no/i }))
    expect(fn).not.toHaveBeenCalled()
    expect(screen.queryByText('Sure?')).not.toBeInTheDocument()
  })

  it('shows loading state during async onConfirm', async () => {
    const user = userEvent.setup()
    let resolve!: () => void
    const fn = vi.fn().mockImplementation(() => new Promise<void>((r) => { resolve = r }))
    render(<DangerButton onConfirm={fn}>Delete</DangerButton>)
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('button')).toBeDisabled()
    resolve()
  })

  it('respects disabled prop', () => {
    render(<DangerButton onConfirm={() => {}} disabled>Delete</DangerButton>)
    expect(screen.getByRole('button')).toBeDisabled()
  })
})
```

- [ ] **Step 2: Run test, confirm fail**

- [ ] **Step 3: Implement DangerButton**

```tsx
import { useState, type ReactNode } from 'react'

interface DangerButtonProps {
  children: ReactNode
  confirmText?: string
  onConfirm: () => void | Promise<void>
  size?: 'sm' | 'md'
  disabled?: boolean
  className?: string
}

export function DangerButton({
  children, confirmText, onConfirm,
  size = 'md', disabled, className,
}: DangerButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    if (disabled || loading) return
    if (confirmText) {
      setShowConfirm(true)
      return
    }
    await runConfirm()
  }

  async function runConfirm() {
    setLoading(true)
    try { await onConfirm() } finally {
      setLoading(false)
      setShowConfirm(false)
    }
  }

  return (
    <span className={`danger-button danger-button--${size}${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="danger-button__trigger"
        disabled={disabled || loading}
        onClick={handleClick}
      >
        {loading ? '...' : children}
      </button>
      {showConfirm && (
        <div role="dialog" className="danger-button__confirm">
          <p className="danger-button__confirm-text">{confirmText}</p>
          <div className="danger-button__confirm-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setShowConfirm(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="danger-button__trigger"
              onClick={runConfirm}
              disabled={loading}
            >
              确认
            </button>
          </div>
        </div>
      )}
    </span>
  )
}
```

- [ ] **Step 4: Add styles**

```css
/* ══════════ DangerButton ══════════ */
.danger-button { display: inline-block; position: relative; }
.danger-button__trigger {
  background: var(--color-danger);
  color: #fff;
  border: 2px solid #b93a2c;
  border-radius: var(--radius-sm);
  padding: 8px 18px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--btn-emboss-primary, 0 2px 0 #8a2a1c, 0 4px 6px rgba(0,0,0,0.25));
}
.danger-button__trigger:hover:not(:disabled) {
  background: #b93a2c;
  animation: danger-shake 0.1s ease-in-out;
}
.danger-button__trigger:disabled { opacity: 0.6; cursor: not-allowed; }
.danger-button--sm .danger-button__trigger { padding: 4px 10px; font-size: var(--fs-small); }

@keyframes danger-shake {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(-1px); }
}

.danger-button__confirm {
  position: absolute; top: calc(100% + 6px); right: 0;
  background: var(--bg-parchment, var(--color-bg-card));
  border: 1px solid var(--color-danger-border);
  border-radius: var(--radius-md);
  padding: 12px;
  min-width: 240px;
  box-shadow: var(--shadow-paper, 0 6px 20px rgba(0,0,0,0.25));
  z-index: 100;
}
.danger-button__confirm-text {
  margin: 0 0 12px;
  font-size: var(--fs-body);
  color: var(--color-text);
}
.danger-button__confirm-actions {
  display: flex; justify-content: flex-end; gap: 8px;
}
```

- [ ] **Step 5: Run tests**

```bash
pnpm exec vitest run client/components/common/__tests__/DangerButton.test.tsx
```

- [ ] **Step 6: Commit**

```bash
git add client/components/common/DangerButton.tsx \
        client/components/common/__tests__/DangerButton.test.tsx \
        client/styles/components.css
git commit -m "feat(client): add DangerButton common component"
```

---

## Task 8: Migrate LocaleSwitcher to Use SelectButton

**Files:**
- Modify: `client/components/common/LocaleSwitcher.tsx`

- [ ] **Step 1: Rewrite LocaleSwitcher**

```tsx
import type { Locale } from '../../../shared/i18n'
import { t } from '../../../shared/i18n'
import { useLocale } from '../../contexts/LocaleContext'
import { SelectButton } from './SelectButton'

type LocaleSelectProps = {
  locale: Locale
  setLocale: (value: Locale) => void
  className?: string
}

export function LocaleSelect({ locale, setLocale, className }: LocaleSelectProps) {
  return (
    <SelectButton<Locale>
      value={locale}
      onChange={setLocale}
      options={[
        { value: 'zh', label: t(locale, 'ui.languageZh') },
        { value: 'en', label: t(locale, 'ui.languageEn') },
      ]}
      size="sm"
      ariaLabel={t(locale, 'ui.languageSelectLabel')}
      className={className}
    />
  )
}

export function LocaleSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale()
  return <LocaleSelect locale={locale} setLocale={setLocale} className={className} />
}
```

- [ ] **Step 2: Run typecheck + tests**

```bash
pnpm exec tsc --noEmit
pnpm test
```

- [ ] **Step 3: Manual visual check via screenshot**

```bash
LOGIN_USER=xxh LOGIN_PASS=brasil node .tmp-shoot.mjs
```

Compare `output/tmp/01-landing-login.png` (new) vs `output/tmp/batch-0-baseline/01-landing-login.png` — the locale dropdown in the top-right should now be the new `SelectButton` style (parchment + caret) instead of native `<select>`. Other elements unchanged.

- [ ] **Step 4: Commit**

```bash
git add client/components/common/LocaleSwitcher.tsx
git commit -m "feat(client): migrate LocaleSwitcher to use SelectButton"
```

---

## Task 9: Final Batch 1 Verification

- [ ] **Step 1: Full test suite**

```bash
pnpm test
```

Expected: all pass, including 4 new component test files (~25 new tests).

- [ ] **Step 2: TypeScript strict check**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Production build**

```bash
pnpm run build
```

Expected: succeeds.

- [ ] **Step 4: Lint (errors only)**

```bash
pnpm exec eslint . 2>&1 | grep -E '^\S' | grep -i 'error' | head -20
```

Expected: No new errors. (Existing ~1170 warnings unchanged.)

- [ ] **Step 5: Generate Batch 1 final screenshots**

```bash
mkdir -p output/tmp/batch-1-after
LOGIN_USER=xxh LOGIN_PASS=brasil OUT_DIR=output/tmp/batch-1-after node .tmp-shoot.mjs
```

- [ ] **Step 6: Visual diff vs baseline**

For each pair `output/tmp/batch-0-baseline/X.png` vs `output/tmp/batch-1-after/X.png`:
- Login page: only the language dropdown should differ (now SelectButton style)
- All other pages: pixel-identical or near-identical

If any other page shows layout/color shift → CSS migration error in Task 3 — investigate.

- [ ] **Step 7: Push and open PR**

```bash
git push origin main
```

(Or create a feature branch if working in worktree:
```bash
git push -u origin batch-1-infra
gh pr create --title "UI overhaul Batch 1: infra (CSS split + 4 common components)" \
  --body "$(cat docs/superpowers/plans/2026-04-23-ui-overhaul-batch-1-infra.md | head -20)"
```)

Attach 4 before/after screenshot pairs to PR description (login, lobby, workshop, settings).

- [ ] **Step 8: Wait for CI green**

After push, monitor GitHub Actions per CLAUDE.md "Push 后 CI 验证" rules:

```bash
export $(grep '^GH_TOKEN=' .env | xargs)
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  'https://api.github.com/repos/titanxxh/open-agricola/actions/runs?per_page=3' \
  | jq '.workflow_runs[] | {name, head_sha, status, conclusion, html_url}'
```

If any run fails: investigate, fix, push again. **Don't claim Batch 1 done until CI is green.**

---

## Spec Coverage Check (against design doc §2-5)

| Spec section | Covered by |
|---|---|
| §2.1 directory structure | Task 3 (CSS split) + Tasks 4-7 (component files) |
| §2.2 Batch 1 row | Tasks 1-9 |
| §3 design tokens (additive) | Task 2 |
| §4.1 SelectButton API | Task 4 |
| §4.2 EmptyState API | Task 5 |
| §4.3 Section API | Task 6 |
| §4.4 DangerButton API | Task 7 |
| §4.5 unit tests | Tasks 4-7 step 1 |
| §5.1-5.3 mechanical CSS migration | Task 3 |
| §5.4 import order | Task 3 step 8 |
| §5.5 Vite (no change) | (no task needed) |

All Batch 1 spec items covered.
