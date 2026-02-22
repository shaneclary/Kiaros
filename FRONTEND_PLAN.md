# Kiaros — Frontend & Mobile Build Plan

**Last updated:** 2026-02-22
**Backend status:** Phases 1–15 complete, pushed to `claude/build-kiaros-genesis-qVFd8`
**Frontend status:** Core pages exist and built (Chat/Tools/Memory/Audit/Settings). Three new feature areas (Scheduler, Documents, Search) have no UI yet.

---

## 1. Current State

### Backend (complete)

| Phase | Feature | Key endpoints |
|-------|---------|--------------|
| 1–8 | Auth, credentials, chat/SSE, tools, memory, audit, token budgeting | `/api/auth`, `/api/credentials`, `/api/chat`, `/api/tools`, `/api/memory`, `/api/audit`, `/api/settings` |
| 9 | Local embeddings (Ollama nomic-embed-text) | archive.js internal |
| 10 | Post-session reflection (Haiku) | `POST /api/memory/reflect/:sessionId` |
| 11 | Dynamic skill generation | `POST /api/tools/generate`, `POST /api/tools/install-generated` |
| 12 | Proactive scheduler + cron | `GET/POST/PUT/DELETE /api/scheduler/jobs` |
| 13 | Shell exec, clipboard, AI context compression | tools: `shell-exec`, `clipboard-read/write` |
| 14 | Webhooks + unified search | `GET /api/search`, webhook routes |
| 15 | Document ingestion + RAG | `GET/POST/DELETE /api/documents` |

### Frontend — what exists

```
client/src/
├── App.jsx               ✅ Auth flow (loading/firstRun/login/authenticated)
├── main.jsx              ✅
├── index.css             ✅ Tailwind dark theme, monospace font
├── components/
│   ├── Layout.jsx        ✅ Sidebar nav (5 items), lock button
│   ├── MessageBubble.jsx ✅ User/assistant bubbles with timestamps
│   ├── InterruptPrompt.jsx ✅ Tool approval modal (Allow/Block)
│   ├── ScopeApprovalCard.jsx ✅ Checkbox scope selector
│   └── ToolCall.jsx      ✅ Expandable tool call + result
├── pages/
│   ├── Chat.jsx          ✅ Streaming chat, sessions, inline tool calls
│   ├── Tools.jsx         ✅ Registry, scope approval, MCP install, enable/disable
│   ├── Memory.jsx        ✅ Working memory CRUD
│   ├── Audit.jsx         ✅ Paginated audit log, undo, expandable
│   ├── Settings.jsx      ✅ API keys, interrupt mode, model config
│   ├── Setup.jsx         ✅ First-run passphrase
│   └── Login.jsx         ✅ Passphrase login
└── utils/
    ├── api.js            ✅ Fetch wrapper with Bearer token
    └── sse.js            ✅ SSE streaming parser
```

### Frontend — what is missing

| Area | Status | Notes |
|------|--------|-------|
| **Scheduler page** | ❌ Missing | Phase 12 — cron jobs, enable/disable, webhook token management, last run status |
| **Documents page** | ❌ Missing | Phase 15 — docsDir status, indexed files list, manual ingest, delete |
| **Search page** | ❌ Missing | Phase 14 — query bar, source filter chips, ranked results across all sources |
| **Layout nav items** | ❌ Missing | Scheduler, Documents, Search not in sidebar |
| **Skill generator UI** | ❌ Missing | Phase 11 — generate tool from description, review + install |
| **Reflect button** | ❌ Missing | Phase 10 — trigger reflection from Chat or Memory page |
| **PWA manifest** | ❌ Missing | Needed before Android |
| **Service worker** | ❌ Missing | Needed before Android |

---

## 2. Frontend Phase Plan

### Phase 16 — Scheduler Page

**File:** `client/src/pages/Scheduler.jsx`

**Features:**
- Job list table: name, schedule, enabled toggle, last run (relative time), last result summary (truncated), next run
- Create job modal: name, prompt (textarea), schedule (text + shorthand hint), credential dropdown, model override
- Edit job modal (same fields)
- Delete job (confirm dialog)
- Expand row → show `last_result_summary` in full, `last_error` if any
- Webhook panel per job:
  - "Generate webhook token" button → shows token once in a copy-to-clipboard input with warning "store securely, shown once"
  - "Revoke token" button (if token active)
- "Run now" button → calls existing schedule tick (or a new `POST /api/scheduler/jobs/:id/run` endpoint to add)

**API calls:**
```
GET    /api/scheduler/jobs
POST   /api/scheduler/jobs
PUT    /api/scheduler/jobs/:id
DELETE /api/scheduler/jobs/:id
POST   /api/scheduler/jobs/:id/webhook    (generate)
DELETE /api/scheduler/jobs/:id/webhook    (revoke)
```

**Backend addition needed:** `POST /api/scheduler/jobs/:id/run` — manually trigger a job immediately.

---

### Phase 17 — Documents Page

**File:** `client/src/pages/Documents.jsx`

**Features:**
- Status bar: watcher running/stopped, queue depth, docsDir path (copyable)
- Document list table: filename, MIME type, size, chunk count, indexed at (relative), error badge if parse failed
- "Open docsDir" button — opens `xdg-open <docsDir>` via shell-exec tool (requires shell:exec scope) or just displays path
- "Ingest file by path" form — text input for absolute path, submit → POST /api/documents/ingest
- "Rescan" button → POST /api/documents/scan
- Delete document button (confirm) → removes from index + archive
- Error state: show parse error for failed documents in red, with retry button

**API calls:**
```
GET    /api/documents
GET    /api/documents/status
POST   /api/documents/ingest   { path }
POST   /api/documents/scan
DELETE /api/documents/:id
```

---

### Phase 18 — Search Page

**File:** `client/src/pages/Search.jsx`

**Features:**
- Full-width search bar with live-search (300ms debounce) or enter-to-search
- Source filter chips: `archive` `memory` `sessions` `notes` `jobs` `documents` (all selected by default, toggleable)
- Limit selector: 10 / 25 / 50
- Results list:
  - Each result: source badge (colour-coded), score bar, content snippet, metadata line (session title / filename / job name / memory key)
  - Click session result → navigate to `/chat` with that session loaded
  - Click document result → shows full document metadata panel
- Empty state with example queries
- Loading skeleton while fetching

**API calls:**
```
GET /api/search?q=&sources=&limit=
```

---

### Phase 19 — Skill Generator UI (Tools page extension)

**Location:** Add tab to existing `client/src/pages/Tools.jsx`

**Features (new "Generate" tab alongside existing "Registry" tab):**
- Description textarea: "Describe what the tool should do..."
- Generate button → calls `POST /api/tools/generate`, shows streaming or spinner
- Generated proposal card:
  - Tool name, description, required scopes, reversible badge
  - Code preview (syntax-highlighted `<pre>`)
  - Detected violations list (if any, in red — block install)
  - "Install tool" button → calls `POST /api/tools/install-generated`
  - "Discard" button

**API calls:**
```
POST /api/tools/generate         { description }
POST /api/tools/install-generated { proposal }
```

---

### Phase 20 — Layout + Navigation Update

**File:** `client/src/components/Layout.jsx`

Add to sidebar:
```
⚡ Kiaros v2.0
──────────────
💬 Chat
🔧 Tools
🧠 Memory
📅 Scheduler     ← new
📄 Documents     ← new
🔍 Search        ← new
📋 Audit
⚙️  Settings
```

Update `App.jsx` routes:
```jsx
<Route path="/scheduler" element={<Scheduler token={token} />} />
<Route path="/documents" element={<Documents token={token} />} />
<Route path="/search"    element={<Search    token={token} />} />
```

---

### Phase 21 — Reflect Button

**Location:** `client/src/pages/Chat.jsx` and/or `client/src/pages/Memory.jsx`

Add to Chat page — in the session header bar next to session title:
- "Reflect" button (visible when session has ≥ 2 turns, not currently streaming)
- Calls `POST /api/memory/reflect/:sessionId`
- Shows spinner then success toast: "Reflection complete — lessons archived"

---

### Phase 22 — PWA Layer

**Files to create/modify:**

```
client/public/manifest.json          ← new
client/public/sw.js                  ← new (service worker)
client/index.html                    ← add <link rel="manifest">
client/src/main.jsx                  ← register service worker
```

**manifest.json:**
```json
{
  "name": "Kiaros",
  "short_name": "Kiaros",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#030712",
  "theme_color": "#030712",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

**Service worker strategy:**
- Cache-first for static assets (JS/CSS bundles)
- Network-first for `/api/*` (never cache API responses — auth-sensitive)
- Offline fallback: serve cached `index.html` with "Offline — reconnect to Kiaros" toast

**Backend addition needed:** `POST /api/scheduler/jobs/:id/run` (manual trigger, reuse runner.js).

---

## 3. Build Order and Dependencies

```
Phase 16  Scheduler page        — independent, start here
Phase 17  Documents page        — independent, parallel with 16
Phase 18  Search page           — independent, parallel with 16/17
Phase 19  Skill generator tab   — depends on Tools.jsx familiarity (do after 16-18)
Phase 20  Layout + nav update   — do alongside 16-19 (one edit per phase)
Phase 21  Reflect button        — small addition to Chat.jsx, any time
Phase 22  PWA layer             — do last, after all pages complete
```

Phases 16–18 can be built in parallel (separate files). Each phase includes its own nav update in Layout.jsx.

---

## 4. Component Conventions (match existing code)

- **Stack:** React 18, React Router v6, Tailwind CSS v3, Vite
- **No new dependencies** unless essential (no component libraries — keep zero extra deps)
- **Dark theme only:** `bg-gray-950` root, `bg-gray-900` panels, `bg-gray-800` cards
- **Accent colour:** blue-500 / blue-600 for primary actions
- **Typography:** monospace stack (`font-mono`) for code/data; system sans for prose
- **Modals:** fixed overlay `bg-black/50`, centered card `bg-gray-900 rounded-xl`
- **Buttons:** `px-3 py-1.5 rounded text-sm` baseline; primary = `bg-blue-600 hover:bg-blue-500`; danger = `bg-red-700 hover:bg-red-600`; secondary = `bg-gray-700 hover:bg-gray-600`
- **Tables:** `w-full text-sm`, `border-b border-gray-800`, `hover:bg-gray-900`
- **Badges:** inline `px-2 py-0.5 rounded text-xs font-mono`
- **Token prop pattern:** every page receives `token` from App.jsx, passes to `api.*` calls
- **Error handling:** local `error` state, rendered as `text-red-400 text-sm` below the relevant control
- **Loading state:** local `loading` boolean, disable buttons + show spinner character `⟳` rotating via `animate-spin`
- **Relative time:** implement a small `relativeTime(isoString)` utility in `utils/time.js` — "2 min ago", "3 hours ago", "yesterday"

---

## 5. New Backend Endpoints Needed (minor)

| Endpoint | Purpose | Phase |
|----------|---------|-------|
| `POST /api/scheduler/jobs/:id/run` | Manually trigger a job immediately | 16 |

All other API surface is already implemented.

---

## 6. Android Path (after Phase 22)

### Prerequisites (all met after Phase 22)
- [ ] All features have working, tested web UI
- [ ] PWA installed and verified on Android Chrome
- [ ] API design is stable (no breaking changes expected)

### Architecture Decision
**React Native + local Android services** — not a Node.js server port.

The Kiaros server stays on Linux. The Android app is a remote client that:
1. Connects to a Kiaros instance on the same LAN (or over Tailscale/VPN)
2. Uses the same REST API and SSE streaming
3. Adds Android-native push notifications (Firebase Cloud Messaging)
4. Adds Android-native share sheet (share docs to Kiaros)

### Work needed for Android access
1. **Server: optional LAN bind** — `--host 0.0.0.0` flag + HTTPS (self-signed cert or Let's Encrypt via Caddy)
2. **Server: FCM push bridge** — on scheduled job completion / interrupt gate, push to registered FCM tokens
3. **React Native app** (`client-mobile/`) — new Expo project
   - Screens mirror web pages 1:1 (Chat, Tools, Memory, Scheduler, Documents, Search, Audit, Settings)
   - `expo-secure-store` for token (replaces localStorage)
   - `@anthropic-ai/sdk` not needed — all API calls go to local Kiaros server
   - SSE streaming via `EventSource` polyfill or `react-native-sse`
   - Push notifications via `expo-notifications` + FCM
   - Document import via `expo-document-picker` → POST to `/api/documents/ingest`
   - Share extension: share any file to Kiaros

### Android phases (future, after web complete)
```
Android Phase A  Server LAN/TLS exposure + manual trigger endpoint
Android Phase B  React Native project scaffold + auth flow
Android Phase C  Chat screen + SSE streaming
Android Phase D  Scheduler, Documents, Search screens
Android Phase E  FCM push notifications
Android Phase F  Share extension + document picker
Android Phase G  Play Store submission (or F-Droid for open source)
```

---

## 7. File Checklist

### To create
- [ ] `client/src/pages/Scheduler.jsx`
- [ ] `client/src/pages/Documents.jsx`
- [ ] `client/src/pages/Search.jsx`
- [ ] `client/src/utils/time.js`
- [ ] `client/public/manifest.json`
- [ ] `client/public/sw.js`
- [ ] `client/public/icons/icon-192.png`
- [ ] `client/public/icons/icon-512.png`

### To modify
- [ ] `client/src/App.jsx` — add 3 new routes
- [ ] `client/src/components/Layout.jsx` — add 3 nav items
- [ ] `client/src/pages/Tools.jsx` — add Generate tab
- [ ] `client/src/pages/Chat.jsx` — add Reflect button
- [ ] `client/index.html` — add PWA meta tags + manifest link
- [ ] `client/src/main.jsx` — register service worker
- [ ] `server/routes/scheduler.js` — add manual run endpoint

### To build after all pages done
```bash
cd client && npm run build
```
Output goes to `server/public/` (per `client/vite.config.js`).

---

*Reference this file at the start of each frontend phase. Update checkboxes as work completes.*
