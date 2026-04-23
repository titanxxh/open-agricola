# Card Desc Placeholder Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `<WOOD>`, `<STABLE>`, `<PIG>`, `<SCORE>`, etc. placeholders in card descriptions render as inline icons everywhere they appear (PlayerCard main face + log tooltip), and remove the broken `dangerouslySetInnerHTML` path.

**Architecture:** Extend the existing `ResourceText` component (already used by Workshop) with three additions: missing PIG/STABLE/BEGGING mappings, default `\n` → `<br/>` support, and SCORE upgraded from ★ text to the existing `bonusVp` sprite via a new `.res-icon-score` CSS alias. Then wire `ResourceText` into the two broken consumption points (PlayerCard, log tooltip).

**Tech Stack:** React 19, Vitest 4 (jsdom for component tests via per-file pragma), `@testing-library/react`, existing CSS sprite (`/bga-img/meeples.png` + `/bga-img/stables.png`).

**Spec:** `docs/superpowers/specs/2026-04-23-card-desc-icons-design.md`

---

## File Structure

| File | Operation | Responsibility |
|---|---|---|
| `client/components/common/ResourceText.tsx` | Modify | Single placeholder renderer; expanded tag map + multiline; SCORE goes through generic sprite path |
| `client/styles/pages/game.css` | Modify | Add `.res-icon-score` alias (same coords as `.res-icon-bonusVp`); remove now-dead `.res-inline-score` |
| `client/components/common/__tests__/ResourceText.test.tsx` | Create | Unit tests for all new mappings + multiline + unknown-tag fallback |
| `client/components/common/PlayerCard.tsx` | Modify | Replace `dangerouslySetInnerHTML` block with `<ResourceText>` |
| `client/components/common/__tests__/PlayerCard.test.tsx` | Modify | Add a case asserting desc placeholders render as `.res-icon-*` |
| `client/components/board/log-rendering.tsx` | Modify | Wrap tooltip desc in `<ResourceText>` (one line replacement) |

---

## Task 1: ResourceText test file (TDD red)

**Files:**
- Create: `client/components/common/__tests__/ResourceText.test.tsx`

**Background:** Write the test file first; some cases will pass against the current `ResourceText` (e.g. WOOD), others will fail (PIG, STABLE, BEGGING, SCORE-as-sprite, multiline). This is the red phase of TDD — Task 2 turns it green.

- [ ] **Step 1.1: Create the test file**

Path: `client/components/common/__tests__/ResourceText.test.tsx`

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { ResourceText } from '../ResourceText'

describe('ResourceText', () => {
  it('renders <WOOD> as res-icon-wood (sanity)', () => {
    const { container } = render(<ResourceText text="get 1 <WOOD>" />)
    expect(container.querySelector('.res-icon-wood')).toBeTruthy()
  })

  it('renders <PIG> as res-icon-boar (PIG → boar mapping)', () => {
    const { container } = render(<ResourceText text="get 2 <PIG>" />)
    expect(container.querySelector('.res-icon-boar')).toBeTruthy()
  })

  it('renders <STABLE> as res-icon-barn', () => {
    const { container } = render(<ResourceText text="<STABLE>" />)
    expect(container.querySelector('.res-icon-barn')).toBeTruthy()
  })

  it('renders <BEGGING> as res-icon-begging', () => {
    const { container } = render(<ResourceText text="take 1 <BEGGING>" />)
    expect(container.querySelector('.res-icon-begging')).toBeTruthy()
  })

  it('renders <SCORE> as res-icon-score sprite (not ★)', () => {
    const { container } = render(<ResourceText text="gain 3 <SCORE>" />)
    expect(container.querySelector('.res-icon-score')).toBeTruthy()
    expect(container.textContent).not.toContain('★')
  })

  it('splits on \\n with <br/>', () => {
    const { container } = render(<ResourceText text={'line1\nline2'} />)
    expect(container.querySelectorAll('br')).toHaveLength(1)
  })

  it('keeps unknown <FOO> placeholders as literal text', () => {
    const { container } = render(<ResourceText text="<FOO>" />)
    expect(container.textContent).toBe('<FOO>')
  })
})
```

- [ ] **Step 1.2: Run the test file — confirm the expected failures**

Run from worktree root:

```bash
pnpm exec vitest run client/components/common/__tests__/ResourceText.test.tsx 2>&1 | tail -30
```

Expected: at least 4 failures — `<PIG>`, `<STABLE>`, `<BEGGING>`, `<SCORE>` querySelector returns null because the current `RESOURCE_TAGS` doesn't include those keys (PIG/STABLE/BEGGING) and the SCORE branch renders ★ text. The multiline test may also fail (current ResourceText doesn't split on `\n`).

The WOOD sanity case + the unknown `<FOO>` fallback case should pass.

If the test file itself fails to compile (e.g. `Cannot find module ../ResourceText`), the path is wrong — fix before continuing.

- [ ] **Step 1.3: Commit (red phase)**

```bash
git add client/components/common/__tests__/ResourceText.test.tsx
git commit -m "test(client/ResourceText): add tests for missing placeholder mappings + multiline

Six cases covering: WOOD sanity, PIG→boar, STABLE→barn, BEGGING,
SCORE as sprite (not ★), \\n → <br/>, and unknown <FOO> fallback.
Four cases currently fail; Task 2 wires up the implementation."
```

---

## Task 2: Extend ResourceText (TDD green)

**Files:**
- Modify: `client/components/common/ResourceText.tsx` (entire file — currently 63 lines)

**Background:** Add three keys to `RESOURCE_TAGS`, support `\n` by splitting and inserting `<br/>`, and remove the SCORE-as-★ special branch so it goes through the generic `.res-icon-score` path. The `.res-icon-score` CSS class doesn't exist yet — Task 3 adds it. The vitest tests don't depend on CSS resolution (`querySelector('.res-icon-score')` matches the React-applied className regardless of whether CSS rules resolve), so this task can land before Task 3.

- [ ] **Step 2.1: Replace `client/components/common/ResourceText.tsx` with the new version**

Overwrite the entire file:

```tsx
import { Fragment } from 'react'

/**
 * Renders card description text with inline resource icons.
 * Converts <WOOD>, <CLAY>, <FOOD>, <SCORE>, <STABLE> etc. to icon spans.
 * Splits on \n into separate lines (<br/>).
 */

const RESOURCE_TAGS: Record<string, string> = {
  WOOD: 'wood',
  CLAY: 'clay',
  REED: 'reed',
  STONE: 'stone',
  FOOD: 'food',
  GRAIN: 'grain',
  VEGETABLE: 'vegetable',
  SHEEP: 'sheep',
  BOAR: 'boar',
  PIG: 'boar', // desc text uses PIG; CSS class is .res-icon-boar
  CATTLE: 'cattle',
  STABLE: 'barn', // desc text uses STABLE; reuses .res-icon-barn (stables.png gray column)
  BEGGING: 'begging',
  SCORE: 'score', // CSS class .res-icon-score is an alias for .res-icon-bonusVp (game.css)
}

const TAG_RE = /<([A-Z_]+)>/g

type Part = { type: 'text'; text: string } | { type: 'icon'; resource: string; tag: string }

function parseDescription(text: string): Part[] {
  const parts: Part[] = []
  let last = 0
  let match: RegExpExecArray | null
  TAG_RE.lastIndex = 0
  while ((match = TAG_RE.exec(text)) !== null) {
    if (match.index > last) {
      parts.push({ type: 'text', text: text.slice(last, match.index) })
    }
    const tag = match[1]!
    const resource = RESOURCE_TAGS[tag]
    if (resource) {
      parts.push({ type: 'icon', resource, tag })
    } else {
      parts.push({ type: 'text', text: match[0] })
    }
    last = TAG_RE.lastIndex
  }
  if (last < text.length) {
    parts.push({ type: 'text', text: text.slice(last) })
  }
  return parts
}

export function ResourceText({ text, className }: { text: string; className?: string }) {
  const lines = text.split('\n')
  return (
    <span className={className}>
      {lines.map((line, lineIdx) => (
        <Fragment key={lineIdx}>
          {lineIdx > 0 && <br />}
          {parseDescription(line).map((p, i) =>
            p.type === 'text' ? (
              <span key={i}>{p.text}</span>
            ) : (
              <span key={i} className={`res-icon res-icon-${p.resource}`} title={p.resource} />
            ),
          )}
        </Fragment>
      ))}
    </span>
  )
}
```

Notes:
- `Fragment` import is required for the per-line key.
- The SCORE special-case (★ text + `res-inline-score`) is gone — SCORE now renders the same as any other tag, just with a different CSS class name.

- [ ] **Step 2.2: Run the test file — confirm it goes green**

```bash
pnpm exec vitest run client/components/common/__tests__/ResourceText.test.tsx 2>&1 | tail -10
```

Expected: `Test Files  1 passed (1)` and `Tests  7 passed (7)`.

If a test still fails:
- For PIG/STABLE/BEGGING failures: re-check `RESOURCE_TAGS` keys are spelled exactly as written
- For SCORE failure: re-check the JSX no longer has the `p.resource === 'score' ? ... : ...` ternary
- For multiline failure: re-check `text.split('\n')` and the `<br />` between lines

- [ ] **Step 2.3: Commit (green phase)**

```bash
git add client/components/common/ResourceText.tsx
git commit -m "feat(client/ResourceText): support PIG/STABLE/BEGGING + multiline; SCORE → sprite

Adds the three missing RESOURCE_TAGS mappings (PIG→boar, STABLE→barn,
BEGGING→begging) and removes the SCORE-as-★ special branch so SCORE
renders through the generic sprite path with class .res-icon-score
(CSS alias added in the next commit). Splits on \\n with <br/> so
multi-line descriptions render naturally."
```

---

## Task 3: CSS — alias `.res-icon-score`, drop `.res-inline-score`

**Files:**
- Modify: `client/styles/pages/game.css:1960` (`.res-icon-bonusVp` line)
- Modify: `client/styles/pages/game.css:2862` (delete `.res-inline-score`)

**Background:** `.res-icon-score` doesn't exist yet — the JSX from Task 2 references it but no CSS rule resolves it (so the icon would be invisible until this task). `.res-icon-bonusVp` has the exact sprite coordinates we need (verified 1:1 against BGA's `.meeple-score`). Add `.res-icon-score` as a sibling selector sharing the same rule. Then delete the now-orphaned `.res-inline-score` rule (only ResourceText referenced it; that reference is gone).

- [ ] **Step 3.1: Add the `.res-icon-score` alias**

Find the line in `client/styles/pages/game.css`:

```css
.res-icon-bonusVp { width: 0.8em; height: 0.8em; background-position: 45.5793% 21.7988%; background-size: 2560%; }
```

Replace with:

```css
.res-icon-bonusVp,
.res-icon-score { width: 0.8em; height: 0.8em; background-position: 45.5793% 21.7988%; background-size: 2560%; }
```

(The line number was 1960 at spec time; if the file has shifted, locate via `grep -n 'res-icon-bonusVp' client/styles/pages/game.css`.)

- [ ] **Step 3.2: Delete the orphaned `.res-inline-score` rule**

Find the line:

```css
.res-inline-score { color: #c0a030; font-size: 0.9em; }
```

Delete it. (Spec verified via grep that no remaining JS/TS file references this class.)

- [ ] **Step 3.3: Verify nothing else references `.res-inline-score`**

```bash
grep -rn "res-inline-score" client/ shared/ server/
```

Expected: zero matches. If there's a hit, do NOT delete the CSS; investigate the reference first.

- [ ] **Step 3.4: Commit**

```bash
git add client/styles/pages/game.css
git commit -m "style(game): alias .res-icon-score to bonusVp coords; drop .res-inline-score

ResourceText now renders <SCORE> through the generic .res-icon-score
sprite path (Task 2). Add the CSS alias sharing .res-icon-bonusVp's
coordinates (1:1 with BGA's .meeple-score) and delete the now-orphan
.res-inline-score rule (the old ★ text style)."
```

---

## Task 4: Wire PlayerCard — drop `dangerouslySetInnerHTML`

**Files:**
- Modify: `client/components/common/PlayerCard.tsx:318-328` (the `<div className="card-desc">` block)
- Modify: `client/components/common/__tests__/PlayerCard.test.tsx` (add one case)

**Background:** Current code escapes `<` `>` to entities then injects raw HTML — that's why placeholders display literally. Replace the entire block with `<ResourceText text={cardData.description} />`. The new TDD test asserts a real card's `<WOOD>` placeholder renders as `.res-icon-wood`.

- [ ] **Step 4.1: Add an import for `ResourceText`**

In `client/components/common/PlayerCard.tsx`, add to the imports near the top of the file (group with sibling component imports):

```tsx
import { ResourceText } from './ResourceText'
```

If the import is already present (some other code path may have added it), skip this step.

- [ ] **Step 4.2: Replace the `dangerouslySetInnerHTML` block**

Find the block at approximately line 318-328:

```tsx
<div className="card-desc">
  <div className="card-desc-scroller">
    <div dangerouslySetInnerHTML={{ __html:
      cardData.description
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br />')
    }} />
  </div>
</div>
```

Replace with:

```tsx
<div className="card-desc">
  <div className="card-desc-scroller">
    <ResourceText text={cardData.description} />
  </div>
</div>
```

If the surrounding lines look slightly different (cosmetic indentation, template-literal formatting variants), adjust the match — the key signal is the `dangerouslySetInnerHTML` + `cardData.description` + the four `.replace` calls.

- [ ] **Step 4.3: Add a placeholder-rendering test case to `PlayerCard.test.tsx`**

Open `client/components/common/__tests__/PlayerCard.test.tsx`. Inside the existing `describe(...)` block, append a new `it()` case. (Don't move existing cases.)

```tsx
  it('renders desc placeholders as inline icons (no literal <WOOD> text)', () => {
    // E76_LumberPile description contains <WOOD> and <STABLE> placeholders.
    // The cards-manifest is preloaded by setup-register-all.ts so getCardMeta
    // returns a real card definition synchronously.
    const html = renderToStaticMarkup(
      <PlayerCard locale="zh" cardId="E76_LumberPile" cardType="minor" />,
    )
    expect(html).toContain('res-icon-wood')
    expect(html).toContain('res-icon-barn')
    expect(html).not.toContain('&lt;WOOD&gt;')
    expect(html).not.toContain('<WOOD>')
  })
```

If `renderToStaticMarkup` is not already imported in this test file (the existing file uses it for other tests per project convention — verify by reading the imports at the top), add:

```tsx
import { renderToStaticMarkup } from 'react-dom/server'
```

- [ ] **Step 4.4: Run PlayerCard tests + ResourceText tests**

```bash
pnpm exec vitest run client/components/common/__tests__/PlayerCard.test.tsx client/components/common/__tests__/ResourceText.test.tsx 2>&1 | tail -10
```

Expected: all tests pass. If the new PlayerCard case fails:
- If it claims `res-icon-wood` not found: check Task 2 actually mapped `WOOD: 'wood'` (it should — that mapping was already there pre-task).
- If it claims `<WOOD>` literal still appears: the dangerouslySetInnerHTML edit didn't apply — re-check Step 4.2.
- If E76_LumberPile is missing from the manifest: check `public/cards-manifest.json` exists in the worktree (run `pnpm run build:cards-manifest` to regenerate).

- [ ] **Step 4.5: Commit**

```bash
git add client/components/common/PlayerCard.tsx client/components/common/__tests__/PlayerCard.test.tsx
git commit -m "fix(client/PlayerCard): render desc placeholders as icons

Replace the dangerouslySetInnerHTML block (which escaped < and >,
literalising every <WOOD>/<STABLE>/etc. placeholder) with the
ResourceText component. Add a test asserting E76_LumberPile's <WOOD>
and <STABLE> render as .res-icon-wood / .res-icon-barn spans, with no
literal <WOOD> text remaining."
```

---

## Task 5: Wire log-rendering tooltip

**Files:**
- Modify: `client/components/board/log-rendering.tsx:162` (the tooltip-desc span)

**Background:** The action log's hover tooltip (`LogCardLink`) shows the card description as plain text — placeholders display literally. Replace the inner `<span>` with `<ResourceText>` using the same className so the existing CSS rule `.log-card-tooltip-desc` continues to apply.

- [ ] **Step 5.1: Add an import for `ResourceText`**

In `client/components/board/log-rendering.tsx`, add to the imports near the top:

```tsx
import { ResourceText } from '../common/ResourceText'
```

- [ ] **Step 5.2: Replace the tooltip desc span**

Find this line (currently around 162):

```tsx
            <span className="log-card-tooltip-desc">{resolveCardDesc(locale, cardRef)}</span>
```

Replace with:

```tsx
            <ResourceText className="log-card-tooltip-desc" text={resolveCardDesc(locale, cardRef)} />
```

If the line has shifted, locate via `grep -n 'log-card-tooltip-desc' client/components/board/log-rendering.tsx`.

- [ ] **Step 5.3: Run log-rendering's existing tests + the broader fast tier to confirm no regression**

```bash
pnpm exec vitest run client/components/board/__tests__/LogPanel.test.tsx 2>&1 | tail -10
```

Expected: all LogPanel tests still pass. (LogPanel uses static `renderToStaticMarkup` and doesn't touch the hover tooltip path, so the change is invisible to existing tests — no new test added; tooltip rendering relies on `ResourceText.test.tsx` for the placeholder-handling proof.)

```bash
pnpm test 2>&1 | tail -5
```

Expected: `Test Files  465 passed (465)` (the +1 from the new ResourceText.test.tsx — current main has 464). All passing.

(Note: a separate branch `design/ci-test-tiering` introduces `pnpm test:fast` / `pnpm test:slow`. If that branch has been merged to main by the time you run this, prefer `pnpm test:fast` for speed — it covers the same fast-tier tests this plan touches.)

- [ ] **Step 5.4: Commit**

```bash
git add client/components/board/log-rendering.tsx
git commit -m "fix(client/log): render desc placeholders as icons in card-hover tooltip

Tooltip's card description was showing <WOOD>/<STABLE>/etc. as literal
text. Wrap the desc in ResourceText (same className, same root element
type) so the placeholders become inline sprite icons, matching the
PlayerCard main-face behaviour."
```

---

## Task 6: Manual browser verification + summary commit

**Files:** none (verification only; no code changes)

**Background:** The unit tests cover the `ResourceText` component and PlayerCard's rendering output, but they don't visually verify that (a) the sprite images actually load (depends on BGA CDN URL rewriting at build time), (b) line wrapping inside `card-desc-scroller` looks reasonable with the new icons, (c) the tooltip layout doesn't break with inline icons. This task is the human eyeball check.

- [ ] **Step 6.1: Build the project to verify no type errors**

```bash
pnpm run build 2>&1 | tail -10
```

Expected: build succeeds. The `/bga-img/*` warnings are cosmetic (CDN URL rewrite handles them — see vite.config.ts).

- [ ] **Step 6.2: Start the dev servers**

```bash
./restart-intranet.sh
```

Wait for output saying both backend (5175) and frontend (5173) are ready.

- [ ] **Step 6.3: Open a single-player game, hand a card with placeholders into the player's hand**

Open `http://localhost:5173/?player=p1&devMode=1` (or the intranet URL printed by restart-intranet.sh).

Pick a minor improvement that uses several placeholder types — `E76_LumberPile` is good (uses `<WOOD>` and `<STABLE>`). Use the dev panel to give the player that card if needed, or open a workshop card preview.

**Verify**:
- Card desc shows wood-log icon and stable icon, not `<WOOD>` `<STABLE>` text
- Icons sit on the same baseline as surrounding text (no weird vertical jump)
- Multi-line descriptions wrap naturally; the `card-desc-scroller` shows scroll if overflow

- [ ] **Step 6.4: Verify the action log tooltip**

Trigger a log entry that names a played minor improvement (any "play minor improvement" line in the log). Hover the card name in the log entry. The tooltip preview appears with the card image and a description block under the card.

**Verify**:
- The tooltip's description text shows icons (not literal `<WOOD>` etc.)
- The tooltip layout doesn't visibly change shape or break

- [ ] **Step 6.5: Verify SCORE rendering**

Find a card with `<SCORE>` in its desc — `A89_StablePlanner` uses it (`+1 <SCORE>`). Look at it in the workshop or as a played card.

**Verify**:
- A small VP star/icon shows where `<SCORE>` was, NOT a `★` Unicode character

- [ ] **Step 6.6: Verify no regression in workshop**

Open `http://localhost:5173/?page=workshop` and browse a few cards. Workshop already used `ResourceText`, so existing `<WOOD>`/`<STONE>`/etc. should still display correctly, AND previously-broken `<PIG>`/`<STABLE>`/`<BEGGING>` should now display as icons too.

- [ ] **Step 6.7: Stop the dev servers**

```bash
lsof -ti :5173 :5175 2>/dev/null | xargs -r kill 2>/dev/null
```

- [ ] **Step 6.8: No final commit needed**

This task verifies but doesn't change code. Tasks 1-5 are the implementation commits.

---

## Task 7: Open PR + monitor CI

**Files:** none (operational)

- [ ] **Step 7.1: Push the branch**

From the worktree root:

```bash
git push -u origin design/card-desc-icons
```

- [ ] **Step 7.2: Open a PR via the GitHub API**

```bash
export $(grep '^GH_TOKEN=' /data00/home/xuxinhao.titan/raw/open-agricola/.env | xargs)
curl -s -X POST -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/titanxxh/open-agricola/pulls \
  -d "$(cat <<'JSON'
{
  "title": "fix(ui): render card desc placeholders (<WOOD> etc.) as inline icons",
  "head": "design/card-desc-icons",
  "base": "main",
  "body": "## Summary\n\nImplements docs/superpowers/specs/2026-04-23-card-desc-icons-design.md.\n\n- ResourceText: +PIG/STABLE/BEGGING mappings, default \\n → <br/>, SCORE upgraded to sprite\n- CSS: `.res-icon-score` alias for `.res-icon-bonusVp` (1:1 with BGA `.meeple-score`); dropped now-orphan `.res-inline-score`\n- PlayerCard: replaced `dangerouslySetInnerHTML` (which escaped < > and literalised every placeholder) with `<ResourceText>` — eliminates the bug + a small XSS surface\n- log-rendering tooltip: wrapped desc in `<ResourceText>`\n\n## Test plan\n\n- [ ] CI green on this PR\n- [ ] Manually verified PlayerCard, action-log tooltip, workshop, SCORE icon (Task 6)\n"
}
JSON
)" | jq '{number, html_url}'
```

- [ ] **Step 7.3: Wait for CI green**

```bash
export $(grep '^GH_TOKEN=' /data00/home/xuxinhao.titan/raw/open-agricola/.env | xargs)
SHA=$(git rev-parse HEAD)
until curl -s -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/titanxxh/open-agricola/actions/runs?per_page=10" \
  | jq -r ".workflow_runs[] | select(.head_sha==\"$SHA\") | select(.name==\"CI\") | .conclusion" \
  | grep -q '^success$\|^failure$'; do
  sleep 30
done
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/titanxxh/open-agricola/actions/runs?per_page=10" \
  | jq ".workflow_runs[] | select(.head_sha==\"$SHA\") | select(.name==\"CI\") | {conclusion, html_url}"
```

If failure: pull failure logs (CLAUDE.md `Push 后 CI 验证` section has the curl command for `actions/runs/<id>/logs`). Diagnose and fix; don't proceed to merge.

- [ ] **Step 7.4: Merge via rebase**

After CI is green, merge using the project's standard rebase-merge flow (squash is disabled per CLAUDE.md). No code commit in this step — just the merge.

---

## Risk Notes

1. **Sprite visibility depends on BGA CDN URL rewriting**: The CSS `url('/bga-img/...')` paths get rewritten at build time by the `replaceBgaBase` Vite plugin (see vite.config.ts). The `.res-icon-score` alias inherits this URL via the existing `.res-icon { background-image: ... }` parent rule (or wherever the URL is set — check before Step 6.1 if uncertain). Manual verification (Task 6) is the only check that the sprite actually paints.

2. **`E76_LumberPile` test dependency**: Task 4's PlayerCard test names a specific card. If that card is later renamed or removed, the test will fail with a misleading error (manifest lookup miss). To future-proof, the test could iterate over any card with `<WOOD>` in desc, but that adds complexity — keeping the explicit card ID is fine for now and the failure mode is loud (an obvious "card not in manifest" / empty render).

3. **PlayerCard `<div>` → `<span>` root structural change**: The original `dangerouslySetInnerHTML` rendered into a `<div>`; `ResourceText` renders a `<span>`. Inside `card-desc-scroller`, this changes the desc subtree from block-level to inline. The `<br/>` line breaks inside `<span>` should look identical (block-level CSS like `display: block` was on `card-desc-scroller`, not the inner div), but Step 6.3 explicitly checks visual layout for any regression.
