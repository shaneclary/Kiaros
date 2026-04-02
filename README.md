# KIAROS

**Self-hosted, security-first AI orchestration engine with proactive agent capabilities.**

Kiaros is the AI harness Anthropic would have built if security and compliance came first. It combines a reactive chat interface with a Kairos-inspired proactive evaluation loop — giving you an AI assistant that can both respond to requests and autonomously manage tasks within your approved constraints.

## What Makes Kiaros Different

| Feature | Traditional AI Chat | Kiaros |
|---------|-------------------|--------|
| Control model | You prompt, it responds | You set boundaries, it operates within them |
| Tool access | Implicit/hidden | Explicit scope approval with risk levels |
| Memory | Per-session only | Persistent working memory across sessions |
| Autonomy | None | Configurable tick engine for background processing |
| Security | Trust the platform | AES-256-GCM encrypted keys, audit everything |
| Task tracking | Manual | Multi-step tasks with pause/resume |

## Architecture

```
Your Machine:
+---------------------------------------------+
|  Browser -> localhost:3333                   |
|                                              |
|  +--------------------------------------+   |
|  |  Kiaros Server (Node.js/Express)     |   |
|  |  - Chat with Claude (streaming SSE)  |   |
|  |  - Tool sandbox with scope approval  |   |
|  |  - Tick engine (proactive agent)     |   |
|  |  - Task continuation system          |   |
|  |  - Audit logger (append-only)        |   |
|  |  - Working memory (persistent KV)    |   |
|  +------------------+-------------------+   |
|                     |                        |
|     +---------------+---------------+        |
|     |               |               |        |
|   Anthropic       SQLite          MCP        |
|   API (HTTPS)    (local DB)     Servers      |
+---------------------------------------------+
```

Everything runs locally. The only external call is to `api.anthropic.com`.

## Quick Start

```bash
# Clone
git clone https://github.com/shaneclary/kiaros.git
cd kiaros

# Install
npm install

# Build frontend
npm run build

# Start
npm start

# Open http://localhost:3333
```

**First run:** Set a passphrase (8+ chars). This encrypts your API keys.

**Next:** Add your Anthropic API key in Settings, approve tool scopes in Tools, and start chatting.

## Core Features

### Security-First Design
- **AES-256-GCM** encryption for API keys at rest
- **bcrypt** (cost 12) passphrase hashing
- **Scope-based permissions** — every tool declares required scopes, user must approve
- **Human-in-the-loop gates** — three modes: confirm (every action), smart (high-risk only), auto (trust)
- **Append-only audit log** — every action logged before execution
- **MCP subprocess isolation** — MCP servers never see your API keys

### Tick Engine (Proactive Agent)
Inspired by Kairos-style autonomous agent patterns. A configurable evaluation loop that:

1. Runs on a timer (default: 60s intervals)
2. Observes current state (pending tasks, memory, idle time)
3. Decides: **act**, **skip**, or **defer**
4. Executes within user-approved constraints
5. Logs every decision for transparency

```
Tick Engine Settings:
- Interval: 10s - 3600s
- Idle threshold: How long before background processing kicks in
- Max autonomous risk: low / medium / high
```

The tick engine respects the same interrupt gate and scope permissions as user-initiated actions. It cannot exceed your approved autonomy level.

### Task Continuation
Multi-step tasks that persist and resume across sessions:

- Create tasks with ordered steps
- Pause/resume tasks manually or let the tick engine handle them
- Track progress (step 3/7)
- Tasks survive server restarts

### Working Memory
Persistent key-value memory injected into every conversation:

```
name = Shane
project = Kiaros v2
preference = concise responses
```

Claude sees this context in every message. Add, edit, delete from the Memory page.

### Built-in Tools
| Tool | Scopes | Risk |
|------|--------|------|
| File Reader | `fs:read` | Low |
| File Writer | `fs:write` | Medium |
| Web Fetch | `net:fetch` | Low |
| Shell Command | `shell:exec` | High |
| Memory Store | `memory:write` | Low |

All tools are disabled by default. Approve scopes in the Tools page before use.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Server | Node.js + Express |
| Frontend | React + Vite + Tailwind CSS |
| Database | SQLite (better-sqlite3) |
| AI | @anthropic-ai/sdk |
| Auth | bcrypt + AES-256-GCM |
| Streaming | Server-Sent Events (SSE) |

## API Reference

### Auth
```
POST /api/auth/setup    — Set initial passphrase
POST /api/auth/login    — Login -> session token
POST /api/auth/logout   — Invalidate session
GET  /api/auth/status   — Check first-run status
```

### Chat
```
POST /api/chat              — Send message (SSE stream)
GET  /api/chat/sessions     — List sessions
GET  /api/chat/sessions/:id — Get session messages
DELETE /api/chat/sessions/:id — Delete session
```

### Tools & Memory
```
GET  /api/tools              — List tool registry
POST /api/tools/:id/approve  — Approve scopes
GET  /api/memory/working     — List working memory
PUT  /api/memory/working/:key — Set memory
```

### Tick Engine & Tasks
```
GET  /api/tick/status     — Engine status
POST /api/tick/start      — Start engine
POST /api/tick/stop       — Stop engine
POST /api/tick/trigger    — Manual tick
GET  /api/tick/tasks      — List tasks
POST /api/tick/tasks      — Create task
```

### Audit
```
GET  /api/audit         — Paginated audit log
POST /api/audit/:id/undo — Undo reversible action
```

## Configuration

Runtime config is stored in `kiaros.config.json` (auto-created, gitignored):

```json
{
  "interruptMode": "confirm",
  "defaultModel": "claude-sonnet-4-20250514",
  "tick": {
    "enabled": false,
    "intervalMs": 60000,
    "maxAutonomousRisk": "low",
    "idleThresholdMs": 300000
  }
}
```

## Philosophy

Kiaros operates on three principles:

1. **Security is the architecture.** Not an afterthought. API keys encrypted at rest, all actions audited, all tools scope-gated.

2. **User control is paramount.** You approve every scope. You choose the autonomy level. You can audit and undo. Nothing is hidden.

3. **Proactive within constraints.** The tick engine brings autonomous capabilities, but only within the boundaries you set. The system can never exceed your approved risk level.

## License

MIT

## Requirements

- Node.js 18+
- An Anthropic API key
