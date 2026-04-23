# UI Overhaul — Batch 2: Non-Game Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply Level-3 tableau styling (wood backdrop + parchment cards + embossed buttons) to login, lobby, workshop home, AI card designer, and settings pages. Replace all native `<select>` with `SelectButton`, all empty states with `EmptyState`, all sections with `Section` (from Batch 1). Add `MobileTabBar` for mobile global navigation. Fix all per-page issues from `docs/UI_REVIEW.md` §1-5 and cross-cutting issues #1, #2, #6, #7, #9, #10.

**Architecture:** Each page is rewritten in its own session within `pages/<page>.css`, using the Batch 1 tokens and components. The TSX changes import the new components and adjust JSX structure where needed. Backwards-compat: old class selectors not consumed by the new design get removed only after visual verification.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest. Uses Batch 1 outputs.

**Spec:** `docs/superpowers/specs/2026-04-23-ui-overhaul-design.md` — Section 6

**Depends on:** Batch 1 merged.

---

## Pre-flight

- [ ] **Step 1: Verify Batch 1 is merged into base branch**

Run: `git log --oneline -5 | grep -i 'batch.1\|infra'`
Expected: a recent commit referencing Batch 1.

- [ ] **Step 2: Take Batch 1-merged baseline screenshots (= Batch 2 starting state)**

```bash
mkdir -p output/tmp/batch-1-merged-baseline
LOGIN_USER=xxh LOGIN_PASS=brasil OUT_DIR=output/tmp/batch-1-merged-baseline node .tmp-shoot.mjs
```

---

## Task 1: Apply Wood Backdrop to All Non-Game Pages

**Files:**
- Modify: `client/styles/base.css`

This is one switch for the entire shell. The game page will override in Batch 3.

- [ ] **Step 1: Update `.app` background**

Find the `.app { ... }` rule in `base.css` (originally App.css line 60-67) and change its background:

```css
.app {
  min-height: 100vh;
  color: var(--color-text);
  background: var(--bg-wood-dark);   /* was: url('/bga-img/background.jpg'); */
  padding: var(--app-edge-padding);
  box-sizing: border-box;
  overflow-x: hidden;
}
```

- [ ] **Step 2: Verify build + visual change**

```bash
pnpm run build
LOGIN_USER=xxh LOGIN_PASS=brasil OUT_DIR=output/tmp/batch-2-step-1 node .tmp-shoot.mjs
```

Expected: lobby/workshop/settings now show dark-wood background instead of green-grass tile. Login page card still floats on its own gradient (it has its own `.login-page` background — handled in Task 2).

- [ ] **Step 3: Commit**

```bash
git add client/styles/base.css
git commit -m "feat(client/style): switch app shell background to wood-dark token"
```

---

## Task 2: Login Page Redesign

**Files:**
- Modify: `client/styles/pages/login.css`
- Modify: `client/app/LoginPage.tsx`

- [ ] **Step 1: Update login.css**

Find each rule in `pages/login.css` and update per spec §6.1:

```css
/* .login-page — wood backdrop + center card */
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--bg-wood-dark);
  padding: 20px;
}

/* .login-card — parchment + paper shadow */
.login-card {
  background: var(--bg-parchment);
  border-radius: 16px;
  padding: 48px 56px;
  box-shadow: var(--shadow-paper);
  width: 100%;
  max-width: 480px;
  border-top: 4px solid var(--color-accent-strong);  /* was --color-primary; gold strip */
  position: relative;
}

.login-top-bar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}

/* Brand area centered (review §1 problem #1) */
.login-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.login-brand .brand-mark-image {
  width: 64px;
  height: 64px;
}
.login-title {
  font-size: var(--fs-display);
  color: var(--color-primary);
  margin: 0;
  text-align: center;   /* was left */
  font-family: var(--agricola-font);
  letter-spacing: 1px;
}
.login-subtitle {
  text-align: center;
  color: var(--color-text-muted);
  margin-top: 0;
}

/* Mode segmented control (replaces bottom register link) */
.login-mode-tabs {
  display: flex;
  background: rgba(0,0,0,0.04);
  border-radius: var(--radius-pill);
  padding: 4px;
  margin: 16px 0;
}
.login-mode-tabs__tab {
  flex: 1;
  padding: 8px 12px;
  border: none;
  background: transparent;
  border-radius: var(--radius-pill);
  cursor: pointer;
  font-weight: 600;
  color: var(--color-text-muted);
  transition: all 0.2s;
}
.login-mode-tabs__tab.is-active {
  background: var(--color-primary);
  color: #fff;
  box-shadow: var(--btn-emboss-primary);
}

.login-form { display: flex; flex-direction: column; gap: 20px; }

.form-field { display: flex; flex-direction: column; gap: 4px; }
.form-field label {
  display: flex; align-items: baseline; gap: 8px;
  font-weight: 600; font-size: var(--fs-small);
  color: var(--color-text-secondary);
}
.form-field .form-hint {
  font-weight: 400;
  font-size: 11px;
  color: var(--color-text-muted);
}
```

(Keep any existing `.login-card animation`, `.form-error`, etc. that don't conflict.)

- [ ] **Step 2: Update LoginPage.tsx**

```tsx
import { useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { LocaleSwitcher } from '../components/common/LocaleSwitcher'
import { BrandMark } from '../components/common/BrandMark'

type Mode = 'login' | 'register'

export function LoginPage() {
  const { login, register } = useAuth()
  const { t } = useLocale()
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const result = mode === 'login'
        ? await login(username, password)
        : await register(username, password, displayName || undefined)
      if (!result.ok) setError(result.error || t('platform.unknownError'))
    } catch {
      setError(t('platform.networkError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-top-bar"><LocaleSwitcher /></div>
        <BrandMark
          title={t('platform.loginTitle')}
          titleAs="h1"
          className="login-brand"
          titleClassName="login-title"
        />
        <p className="login-subtitle">{t('platform.subtitle')}</p>

        <div className="login-mode-tabs">
          <button
            type="button"
            className={`login-mode-tabs__tab${mode === 'login' ? ' is-active' : ''}`}
            onClick={() => setMode('login')}
          >
            {t('platform.loginBtn')}
          </button>
          <button
            type="button"
            className={`login-mode-tabs__tab${mode === 'register' ? ' is-active' : ''}`}
            onClick={() => setMode('register')}
          >
            {t('platform.registerBtn')}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-field">
            <label htmlFor="username">
              {t('platform.username')}
              <span className="form-hint">2-30 字符</span>
            </label>
            <input
              id="username" type="text" value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username" required
            />
          </div>
          {mode === 'register' && (
            <div className="form-field">
              <label htmlFor="displayName">{t('platform.displayName')}</label>
              <input
                id="displayName" type="text" value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
          )}
          <div className="form-field">
            <label htmlFor="password">
              {t('platform.password')}
              <span className="form-hint">至少 4 个字符</span>
            </label>
            <input
              id="password" type="password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button type="submit" className="btn-primary" disabled={loading} aria-busy={loading}>
            {loading ? t('platform.loading') : mode === 'login' ? t('platform.loginBtn') : t('platform.registerBtn')}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Update components.css `.btn-primary` to use emboss**

```css
.btn-primary {
  background: var(--color-primary);
  color: #fff;
  border: none;
  padding: 12px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
  box-shadow: var(--btn-emboss-primary);
}
```

(Same for `.btn-secondary` with `--btn-emboss-secondary`.)

- [ ] **Step 4: Verify**

```bash
pnpm test
pnpm exec tsc --noEmit
LOGIN_USER=xxh LOGIN_PASS=brasil OUT_DIR=output/tmp/batch-2-after-login node .tmp-shoot.mjs
```

Compare `01-landing-login.png` before/after.

- [ ] **Step 5: Commit**

```bash
git add client/styles/pages/login.css client/styles/components.css client/app/LoginPage.tsx
git commit -m "feat(client/login): tableau styling + segmented mode control + form-hint"
```

---

## Task 3: Lobby Page Redesign

**Files:**
- Modify: `client/styles/pages/lobby.css`
- Modify: `client/app/LobbyPage.tsx`

- [ ] **Step 1: Read current LobbyPage.tsx**

Run: `cat client/app/LobbyPage.tsx | head -120`

Identify the JSX structure (3 grid cards + active rooms section).

- [ ] **Step 2: Refactor LobbyPage.tsx to use Section + EmptyState + grid hero layout**

Replace the JSX so that:
- Header area: brand + LocaleSwitcher + user/logout
- Hero: `<Section variant="parchment" icon="🎮" title="开始游戏">` spanning 2 columns with primary "创建多人游戏" button + secondary "单人模式"
- Below hero: 2 sections side-by-side ("加入游戏" with input + button; "工坊" with single CTA)
- Bottom: `<Section icon="🏠" title="当前活跃房间">` containing `<EmptyState icon="🎲" title="还没有人开局" description="创建房间邀请朋友加入，或者复制邀请链接分享" action={<button onClick={copyInviteLink}>复制邀请链接</button>} />` when no rooms

Implementation:

```tsx
import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useLocale } from '../contexts/LocaleContext'
import { setPage } from './PageRouter'
import { LocaleSwitcher } from '../components/common/LocaleSwitcher'
import { BrandMark } from '../components/common/BrandMark'
import { Section } from '../components/common/Section'
import { EmptyState } from '../components/common/EmptyState'
import { API_BASE } from '../config'

interface Room { id: string; name?: string; players: number; max: number }

export function LobbyPage() {
  const { user, logout, token } = useAuth()
  const { t } = useLocale()
  const [joinId, setJoinId] = useState('')
  const [rooms, setRooms] = useState<Room[]>([])

  useEffect(() => {
    fetch(`${API_BASE}/api/rooms`).then((r) => r.json()).then((d) => setRooms(d.rooms ?? []))
  }, [])

  function createMulti() { /* existing logic */ }
  function single() { /* existing logic */ }
  function joinRoom() { /* existing logic, navigates with joinId */ }
  function copyInviteLink() {
    navigator.clipboard.writeText(window.location.href)
  }

  return (
    <div className="lobby-page">
      <header className="lobby-header">
        <BrandMark title="Open Agricola" />
        <div className="lobby-header__right">
          <LocaleSwitcher />
          <span className="lobby-user">{user?.displayName ?? user?.username}</span>
          <button className="btn-ghost" onClick={logout}>{t('platform.logout')}</button>
        </div>
      </header>

      <div className="lobby-grid">
        <Section variant="parchment" icon="🎮" title="开始游戏" className="lobby-hero">
          <button className="btn-primary lobby-cta-primary" onClick={createMulti}>
            {t('platform.createMulti')}
          </button>
          <button className="btn-secondary" onClick={single}>
            {t('platform.singlePlayer')}
          </button>
        </Section>

        <Section variant="parchment" icon="🚪" title="加入游戏">
          <div className="join-form">
            <input
              type="text"
              value={joinId}
              onChange={(e) => setJoinId(e.target.value)}
              placeholder={t('platform.roomIdPlaceholder')}
            />
            <button className="btn-secondary" onClick={joinRoom} disabled={!joinId.trim()}>
              {t('platform.join')}
            </button>
          </div>
        </Section>

        <Section variant="parchment" icon="🛠️" title="工坊">
          <button className="btn-secondary" onClick={() => setPage('workshop')}>
            {t('platform.enterWorkshop')}
          </button>
        </Section>
      </div>

      <Section icon="🏠" title="当前活跃房间" variant="default" className="lobby-rooms">
        {rooms.length === 0 ? (
          <EmptyState
            icon="🎲"
            title="还没有人开局"
            description="创建房间邀请朋友加入，或者复制邀请链接分享"
            action={<button className="btn-secondary" onClick={copyInviteLink}>复制邀请链接</button>}
          />
        ) : (
          <ul className="room-list">
            {rooms.map((r) => (
              <li key={r.id} className="room-item">
                <span>{r.name ?? r.id}</span>
                <span>{r.players}/{r.max}</span>
                <button className="btn-secondary" onClick={() => { setJoinId(r.id); joinRoom() }}>
                  {t('platform.join')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}
```

(Adjust to match the actual `LobbyPage.tsx` business logic — keep all existing event handlers; only restructure JSX and apply new components.)

- [ ] **Step 3: Update lobby.css**

```css
.lobby-page {
  min-height: 100vh;
  padding: 20px clamp(20px, 4vw, 48px);
  max-width: 1200px;
  margin: 0 auto;
  animation: fadeSlideIn 0.3s ease-out;
}

.lobby-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  margin-bottom: 32px;
  background: var(--bg-parchment);
  padding: 12px 20px;
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-paper);
}
.lobby-header__right {
  display: flex; align-items: center; gap: 12px;
}
.lobby-user { color: var(--color-text-secondary); font-weight: 600; }

.lobby-grid {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  gap: 20px;
  margin-bottom: 24px;
}
.lobby-hero { display: flex; flex-direction: column; gap: 12px; }
.lobby-hero .lobby-cta-primary { font-size: var(--fs-h3); padding: 14px; }

.join-form { display: flex; gap: 8px; }
.join-form input {
  flex: 1; padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  outline: none;
}
.join-form input:focus { border-color: var(--color-primary); }

.lobby-rooms .room-list { list-style: none; margin: 0; padding: 0; }
.lobby-rooms .room-item {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border-bottom: 1px solid var(--color-border-light);
}
.lobby-rooms .room-item:last-child { border-bottom: none; }

@media (max-width: 900px) {
  .lobby-grid { grid-template-columns: 1fr; }
}

@media (max-width: 640px) {
  .lobby-header { flex-direction: column; align-items: flex-start; gap: 12px; }
  .lobby-header__right { width: 100%; justify-content: space-between; }
}
```

- [ ] **Step 4: Verify**

```bash
pnpm test
pnpm exec tsc --noEmit
LOGIN_USER=xxh LOGIN_PASS=brasil OUT_DIR=output/tmp/batch-2-after-lobby node .tmp-shoot.mjs
```

- [ ] **Step 5: Commit**

```bash
git add client/styles/pages/lobby.css client/app/LobbyPage.tsx
git commit -m "feat(client/lobby): tableau styling + Section/EmptyState + 2:1:1 grid"
```

---

## Task 4: Workshop Home Redesign

**Files:**
- Modify: `client/styles/pages/workshop.css`
- Modify: `client/app/WorkshopPage.tsx`

This page is large (~1500 lines TSX). Touch only the **shell structure** + the 4 top-level sections; do NOT rewrite card tiles, sandbox handlers, or comment forms.

- [ ] **Step 1: Identify the 4 top-level sections in WorkshopPage.tsx**

Run: `grep -n 'className="ws-section\|className=\\\"ws-section' client/app/WorkshopPage.tsx | head -20`

Wrap each `<div className="ws-section">` with `<Section variant="parchment" icon="..." title="...">`. The 4 sections (per spec §6.3):

| Position | Icon | Title | variant |
|---|---|---|---|
| 1st | 🧪 | 沙盒 | sandbox |
| 2nd | 📒 | 我的卡牌 | parchment |
| 3rd | ⭐ | 精选 | parchment |
| 4th | 🔍 | 浏览 | parchment |

Wrap actions (e.g., "+ 创建/修改卡牌" button at top-right of "我的卡牌") into the `actions` prop:

```tsx
<Section
  variant="parchment"
  icon="📒"
  title={t('platform.myCards')}
  actions={
    <button className="btn-primary" onClick={() => setView('editor')}>
      + {t('platform.createOrEdit')}
    </button>
  }
>
  {myCards.length === 0 ? (
    <EmptyState
      icon="📦"
      title={t('platform.emptyMyCards')}
      action={<button className="btn-primary" onClick={() => setView('editor')}>+ 创建第一张卡</button>}
    />
  ) : (
    /* existing card grid */
  )}
</Section>
```

- [ ] **Step 2: Replace 4 empty-state placeholders with `<EmptyState>`**

Search for "暂无" / "你还没有" / "ws-empty" in WorkshopPage.tsx and replace each with `<EmptyState>`.

- [ ] **Step 3: Sandbox Section enhancement**

The sandbox section header should display chips for player count + decks. Update sandbox-header content:

```tsx
<Section
  variant="sandbox"
  icon="🧪"
  title={t('platform.sandbox')}
  actions={
    <>
      <button className="btn-secondary" onClick={openSandboxConfig}>调整配置</button>
      <button className="btn-primary" onClick={enterSandbox}>进入沙盒</button>
    </>
  }
>
  <div className="ws-sandbox-info">
    <span className="ws-chip">{sandboxSettings.player_count} 人局</span>
    {sandboxSettings.deck_ids.map((d) => (
      <span key={d} className="ws-chip">{d}</span>
    ))}
  </div>
  {sandboxCards.length === 0 ? (
    <EmptyState
      icon="🃏"
      title="还没加入测试卡牌"
      description="把你创建的卡牌加入沙盒后即可在游戏中测试"
      variant="compact"
    />
  ) : (
    /* existing list */
  )}
</Section>
```

- [ ] **Step 4: Replace "最新/最热" tab styling**

Find `.ws-tab` / `.ws-toolbar` rules in workshop.css. Convert to:

```css
.ws-toolbar {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.ws-toolbar input[type="search"] {
  flex: 1; min-width: 200px;
  padding: 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
}
.ws-sort-tabs {
  display: flex; background: rgba(0,0,0,0.04);
  border-radius: var(--radius-pill); padding: 3px;
}
.ws-sort-tab {
  padding: 6px 14px;
  border: none; background: transparent;
  border-radius: var(--radius-pill);
  font-weight: 600; cursor: pointer;
  color: var(--color-text-muted);
}
.ws-sort-tab.is-active {
  background: var(--color-accent-strong);
  color: #fff;
}
```

In TSX, replace the colored "最新 / 最热" buttons with:

```tsx
<div className="ws-sort-tabs">
  <button
    type="button"
    className={`ws-sort-tab${sort === 'new' ? ' is-active' : ''}`}
    onClick={() => setSort('new')}
  >{t('platform.newest')}</button>
  <button
    type="button"
    className={`ws-sort-tab${sort === 'hot' ? ' is-active' : ''}`}
    onClick={() => setSort('hot')}
  >{t('platform.hottest')}</button>
</div>
```

- [ ] **Step 5: Header padding alignment**

In workshop.css, ensure `.workshop-page > header` (or whatever the page header class is) uses `padding: var(--app-edge-padding)` — same as `.app`'s padding so they align.

- [ ] **Step 6: Verify**

```bash
pnpm test
pnpm exec tsc --noEmit
LOGIN_USER=xxh LOGIN_PASS=brasil OUT_DIR=output/tmp/batch-2-after-workshop node .tmp-shoot.mjs
```

- [ ] **Step 7: Commit**

```bash
git add client/styles/pages/workshop.css client/app/WorkshopPage.tsx
git commit -m "feat(client/workshop): tableau styling + Section/EmptyState + sandbox chips"
```

---

## Task 5: AI Card Designer Redesign

**Files:**
- Modify: `client/app/workshop/AiCardDesigner.tsx`
- Modify: `client/styles/pages/workshop.css`

- [ ] **Step 1: Consolidate AI provider config (spec §6.4)**

Find the two `<div className="ai-provider-config">` blocks. Lift them out to a single `<Section>` at top of the designer:

```tsx
<Section
  collapsible
  defaultCollapsed
  icon="🤖"
  title={t('platform.aiConfig')}
  variant="parchment"
>
  <div className="ai-config-grid">
    <div>
      <h4>{t('platform.provider')}</h4>
      <div className="provider-tabs">
        <button className={`provider-tab${provider === 'gemini' ? ' is-active' : ''}`} onClick={() => setProvider('gemini')}>Gemini</button>
        <button className={`provider-tab${provider === 'openrouter' ? ' is-active' : ''}`} onClick={() => setProvider('openrouter')}>OpenRouter</button>
      </div>
    </div>
    <div>
      <h4>{t('platform.model')}</h4>
      <SelectButton
        value={model}
        onChange={setModel}
        options={MODEL_OPTIONS}
      />
    </div>
    <div>
      <h4>{t('platform.apiKey')}</h4>
      <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
      <button className="btn-secondary btn-small" onClick={saveKey}>{t('platform.saveKey')}</button>
    </div>
  </div>
</Section>
```

Then in the left pane (image) and right pane (ability), just add an action button:

```tsx
<button className="btn-primary" onClick={generateImage}>{t('platform.generateImage')}</button>
{/* and */}
<button className="btn-primary" onClick={generateAbility}>{t('platform.generateAbility')}</button>
```

- [ ] **Step 2: Replace `✗ 图片 / ✗ 代码` tabs**

Find the `<button className="card-asset-tab">` blocks. Replace with chip-style:

```tsx
<div className="card-asset-tabs">
  <button
    className={`card-asset-tab${activeAsset === 'image' ? ' is-active' : ''}`}
    onClick={() => setActiveAsset('image')}
  >👁 {t('platform.image')}</button>
  <button
    className={`card-asset-tab${activeAsset === 'code' ? ' is-active' : ''}`}
    onClick={() => setActiveAsset('code')}
  >✏ {t('platform.code')}</button>
</div>
```

CSS in workshop.css:

```css
.card-asset-tabs { display: inline-flex; gap: 4px; padding: 3px; background: rgba(0,0,0,0.04); border-radius: var(--radius-pill); }
.card-asset-tab {
  padding: 4px 12px; border: none; background: transparent;
  border-radius: var(--radius-pill); cursor: pointer;
  color: var(--color-text-muted); font-weight: 600;
}
.card-asset-tab.is-active {
  background: var(--bg-parchment);
  color: var(--color-accent-strong);
  border: 1px solid var(--color-accent-border);
}
```

- [ ] **Step 3: Group top toolbar**

Find the AiDesigner top toolbar and apply visual grouping:

```css
.ai-designer-toolbar {
  display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
  padding: 12px 16px;
  background: var(--bg-parchment);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-paper);
}
.ai-designer-toolbar__group {
  display: flex; align-items: center; gap: 8px;
  padding-right: 16px;
  border-right: 1px solid var(--color-border-light);
}
.ai-designer-toolbar__group:last-child { border-right: none; }
```

In TSX, wrap toolbar children into 3 `<div className="ai-designer-toolbar__group">` groups: [card type tabs] / [name + ID] / [save / sandbox / localize / close].

- [ ] **Step 4: Collapse dev hint at bottom**

Find the bottom dev-mode hint banner. Replace with:

```tsx
<details className="ai-designer-dev-help">
  <summary>{t('platform.devHelp')}</summary>
  <p>使用 Save/Load State 保存恢复进度，Draw Card 输入卡牌 ID 摸牌测试打出流程，Play Card 直接打出卡牌测试效果</p>
</details>
```

CSS:

```css
.ai-designer-dev-help { margin-left: 12px; font-size: var(--fs-small); color: var(--color-text-muted); }
.ai-designer-dev-help summary { cursor: pointer; }
.ai-designer-dev-help p { margin: 8px 0 0; max-width: 600px; line-height: 1.5; }
```

- [ ] **Step 5: Add visible labels to "前置条件 / 消耗资源" inputs**

```tsx
<div className="form-field">
  <label>{t('platform.prerequisite')}</label>
  <input type="text" value={prerequisite} onChange={(e) => setPrerequisite(e.target.value)} placeholder="如：2 个职业、仍住木屋" />
</div>
<div className="form-field">
  <label>{t('platform.cost')}</label>
  <input type="text" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="如：1 木 2 黏土" />
</div>
```

- [ ] **Step 6: Verify**

```bash
pnpm test
pnpm exec tsc --noEmit
```

Open the AI designer manually (via screenshot) by clicking "+ 创建/修改卡牌" — capture page state.

- [ ] **Step 7: Commit**

```bash
git add client/app/workshop/AiCardDesigner.tsx client/styles/pages/workshop.css
git commit -m "feat(client/workshop): AI designer toolbar grouping + collapsed AI config + chip tabs"
```

---

## Task 6: Settings Page Redesign

**Files:**
- Modify: `client/styles/pages/settings.css`
- Modify: `client/app/SettingsPage.tsx`

- [ ] **Step 1: Wrap each settings group in `<Section>`**

```tsx
<Section icon="👤" title={t('platform.basicInfo')} variant="parchment">
  <p className="settings-readonly">
    🔒 <span className="settings-readonly-chip">{user?.username}</span>（{t('platform.notEditable')}）
  </p>
  <div className="form-field">
    <label htmlFor="displayName">{t('platform.displayName')}</label>
    <input id="displayName" value={displayName} onChange={...} />
  </div>
  <div className="settings-actions">
    <button className="btn-primary" onClick={saveDisplayName}>{t('platform.save')}</button>
  </div>
</Section>

<Section icon="🔑" title={t('platform.changePassword')} variant="parchment">
  {/* 3 password fields */}
  <div className="settings-actions">
    <button className="btn-primary" onClick={changePassword}>{t('platform.changePassword')}</button>
  </div>
</Section>

<Section icon="⚠️" title={t('platform.dangerZone')} variant="parchment" className="settings-danger">
  <DangerButton confirmText={t('platform.confirmLogoutAll')} onConfirm={logoutAll}>
    {t('platform.logoutAllDevices')}
  </DangerButton>
  <p className="settings-hint">注意：登出后需要重新登录。Token 仅存储在当前浏览器，这里的登出只清除本地 session。</p>
</Section>
```

- [ ] **Step 2: Update settings.css**

```css
.settings-page {
  max-width: 720px;
  margin: 0 auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.settings-page header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 8px;
  background: var(--bg-parchment); padding: 12px 20px;
  border-radius: var(--radius-md); box-shadow: var(--shadow-paper);
}

.settings-readonly {
  display: flex; align-items: center; gap: 8px;
  color: var(--color-text-muted);
  margin: 0 0 16px;
}
.settings-readonly-chip {
  background: var(--color-bg-warm);
  padding: 2px 10px;
  border-radius: var(--radius-pill);
  border: 1px solid var(--color-border-light);
  color: var(--color-text);
  font-weight: 600;
}

.settings-actions {
  display: flex; justify-content: flex-end; margin-top: 16px;
}
.settings-actions .btn-primary { width: auto; min-width: 200px; }

.settings-danger {
  border: 2px solid var(--color-danger-border);
}
.settings-hint {
  margin: 12px 0 0;
  font-size: var(--fs-small);
  color: var(--color-text-muted);
}
```

- [ ] **Step 3: Verify**

```bash
pnpm test
pnpm exec tsc --noEmit
LOGIN_USER=xxh LOGIN_PASS=brasil OUT_DIR=output/tmp/batch-2-after-settings node .tmp-shoot.mjs
```

- [ ] **Step 4: Commit**

```bash
git add client/styles/pages/settings.css client/app/SettingsPage.tsx
git commit -m "feat(client/settings): tableau styling + DangerButton + danger zone separation"
```

---

## Task 7: MobileTabBar Component + Mount

**Files:**
- Create: `client/components/common/MobileTabBar.tsx`
- Create: `client/components/common/__tests__/MobileTabBar.test.tsx`
- Modify: `client/app/PageRouter.tsx` (mount tabbar)
- Modify: `client/styles/components.css`

- [ ] **Step 1: Write failing test**

```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MobileTabBar } from '../MobileTabBar'

describe('MobileTabBar', () => {
  it('marks the current tab as active', () => {
    const { container } = render(
      <MobileTabBar current="lobby" onNavigate={() => {}} />,
    )
    expect(container.querySelector('[data-tab="lobby"].is-active')).toBeInTheDocument()
    expect(container.querySelector('[data-tab="workshop"].is-active')).not.toBeInTheDocument()
  })
  it('calls onNavigate when a tab is clicked', async () => {
    const user = userEvent.setup()
    const fn = vi.fn()
    render(<MobileTabBar current="lobby" onNavigate={fn} />)
    await user.click(screen.getByRole('button', { name: /workshop|工坊/i }))
    expect(fn).toHaveBeenCalledWith('workshop')
  })
})
```

- [ ] **Step 2: Implement**

```tsx
type Tab = 'lobby' | 'workshop' | 'settings'
interface Props {
  current: Tab
  onNavigate: (t: Tab) => void
}

const TABS: { key: Tab; icon: string; label: string }[] = [
  { key: 'lobby', icon: '🏠', label: '大厅' },
  { key: 'workshop', icon: '🛠️', label: '工坊' },
  { key: 'settings', icon: '⚙️', label: '设置' },
]

export function MobileTabBar({ current, onNavigate }: Props) {
  return (
    <nav className="mobile-tab-bar" aria-label="主导航">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          data-tab={t.key}
          className={`mobile-tab-bar__tab${current === t.key ? ' is-active' : ''}`}
          onClick={() => onNavigate(t.key)}
        >
          <span className="mobile-tab-bar__icon" aria-hidden>{t.icon}</span>
          <span className="mobile-tab-bar__label">{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
```

- [ ] **Step 3: Style**

```css
/* ══════════ MobileTabBar ══════════ */
.mobile-tab-bar {
  display: none;
  position: fixed; bottom: 0; left: 0; right: 0;
  height: 56px;
  background: var(--bg-parchment);
  border-top: 1px solid var(--color-border);
  z-index: 50;
  box-shadow: 0 -2px 8px rgba(0,0,0,0.15);
}
.mobile-tab-bar__tab {
  flex: 1;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: transparent; border: none;
  color: var(--color-text-muted);
  font-size: 11px; cursor: pointer;
  gap: 2px;
}
.mobile-tab-bar__tab.is-active { color: var(--color-accent-strong); font-weight: 600; }
.mobile-tab-bar__icon { font-size: 22px; }

@media (max-width: 640px) {
  .mobile-tab-bar { display: flex; }
  body { padding-bottom: 56px; }
}
```

- [ ] **Step 4: Mount in PageRouter**

In `client/app/PageRouter.tsx`, after the page render, add:

```tsx
{(currentPage === 'lobby' || currentPage === 'workshop' || currentPage === 'settings') && (
  <MobileTabBar
    current={currentPage as 'lobby'|'workshop'|'settings'}
    onNavigate={(t) => setPage(t)}
  />
)}
```

- [ ] **Step 5: Verify**

```bash
pnpm test
pnpm exec tsc --noEmit
LOGIN_USER=xxh LOGIN_PASS=brasil OUT_DIR=output/tmp/batch-2-mobile node .tmp-shoot.mjs
```

The mobile screenshots (390 wide) should now show a tab bar at the bottom.

- [ ] **Step 6: Commit**

```bash
git add client/components/common/MobileTabBar.tsx \
        client/components/common/__tests__/MobileTabBar.test.tsx \
        client/app/PageRouter.tsx \
        client/styles/components.css
git commit -m "feat(client): mobile bottom tab bar for lobby/workshop/settings"
```

---

## Task 8: Cross-Cutting Mobile Reflow Fixes

**Files:**
- Modify: `client/styles/pages/lobby.css`
- Modify: `client/styles/pages/workshop.css`
- Modify: `client/styles/pages/settings.css`

- [ ] **Step 1: Add `<640px` reflow rules per page**

In each page CSS, add (or merge into existing) the `@media (max-width: 640px)` block to:
- Header `flex-wrap: wrap` (lobby done above; do same for workshop, settings)
- Workshop search bar single line: `.ws-toolbar { flex-wrap: wrap; } .ws-toolbar input[type=search] { min-width: 100%; }`
- Settings page padding shrink: `.settings-page { padding: 12px; }`

- [ ] **Step 2: Verify on mobile viewport**

```bash
LOGIN_USER=xxh LOGIN_PASS=brasil OUT_DIR=output/tmp/batch-2-mobile-final node .tmp-shoot.mjs
```

- [ ] **Step 3: Commit**

```bash
git add client/styles/pages/lobby.css client/styles/pages/workshop.css client/styles/pages/settings.css
git commit -m "feat(client): mobile reflow for lobby/workshop/settings headers and toolbars"
```

---

## Task 9: Final Batch 2 Verification

- [ ] **Step 1: Full suite**

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm run build
```

- [ ] **Step 2: Generate Batch 2 final screenshots**

```bash
mkdir -p output/tmp/batch-2-after
LOGIN_USER=xxh LOGIN_PASS=brasil OUT_DIR=output/tmp/batch-2-after node .tmp-shoot.mjs
```

- [ ] **Step 3: Build before/after grid for PR**

For each of (login, lobby, workshop, workshop-designer, settings, mobile-lobby, mobile-workshop):
- Find the matching baseline in `output/tmp/batch-1-merged-baseline/`
- Find the new file in `output/tmp/batch-2-after/`
- Compose a side-by-side or stacked comparison (can use ImageMagick or just attach both)

- [ ] **Step 4: Push + open PR**

```bash
git push -u origin batch-2-non-game-pages   # if working on a branch
gh pr create --title "UI overhaul Batch 2: tableau styling for non-game pages" \
  --body "$(cat <<'EOF'
Implements spec §6 (non-game pages). Per-page changes per docs/UI_REVIEW.md.

Pages migrated: login, lobby, workshop home, AI card designer, settings.
New: MobileTabBar mounted on lobby/workshop/settings.
All `<select>` → SelectButton, all empty states → EmptyState, all sections → Section, danger button → DangerButton.

See output/tmp/batch-2-after/ vs output/tmp/batch-1-merged-baseline/ for visuals.
EOF
)"
```

- [ ] **Step 5: Wait for CI green**

Per CLAUDE.md "Push 后 CI 验证" rules.

---

## Spec Coverage Check (against design doc §6)

| Spec section | Covered by |
|---|---|
| §6.1 login | Task 2 |
| §6.2 lobby | Task 3 |
| §6.3 workshop home | Task 4 |
| §6.4 AI designer | Task 5 |
| §6.5 settings | Task 6 |
| §6.6 mobile (incl. MobileTabBar) | Task 7 + Task 8 |
| Cross-cutting #1 (select) | Tasks 2,4,5,6 (everywhere there's `<select>`) |
| Cross-cutting #2 (accent gold) | Tasks 2,4,5,6 (login top strip, sort tabs active, danger zone, mobile tabbar active) |
| Cross-cutting #4 (empty states) | Tasks 3,4 |
| Cross-cutting #6 (btn-danger) | Task 6 |
| Cross-cutting #7 (heading hierarchy) | All tasks (use --fs-* tokens) |
| Cross-cutting #9 (mobile header reflow) | Task 8 |
| Cross-cutting #10 (focus ring on accent) | Update in Task 2 step 3 — change `base.css` focus to `outline: 2px solid var(--color-accent-strong)` (subtle add to that step's commit) |

All Batch 2 spec items covered.
