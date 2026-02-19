# Kiaros 2.0

Self-hosted, Claude-native personal AI executive engine. Security-first by design.

## What It Is

Kiaros is a local orchestration layer that lets you chat with Claude, approve tools, manage memory, and maintain a full audit log — all without sending your API key to third parties.

Everything runs on your machine. The only external network call is to `api.anthropic.com`.

## Requirements

- Node.js 18+
- An Anthropic API key

## Setup

```bash
# 1. Install all dependencies
npm run setup

# 2. Build the React frontend
npm run build

# 3. Start the server
npm start
```

Then open: **http://localhost:3333**

On first run you'll set a passphrase. This protects your session and encrypts stored API keys.

## Architecture

```
Browser → localhost:3333
    ↓
Express server (Node.js)
    ├── Auth: bcrypt passphrase + 24hr session tokens
    ├── Credentials: AES-256-GCM encrypted API keys
    ├── Chat: Anthropic SDK with SSE streaming
    ├── Tools: Scope approval + interrupt gate + sandbox
    ├── Memory: SQLite working memory (key-value)
    └── Audit: Append-only action log with undo
         ↓
    Anthropic API (HTTPS)
    SQLite (local file: kiaros.db)
    MCP servers (child processes, no API key access)
```

## Security Features

| Feature | Implementation |
|---------|---------------|
| API key encryption | AES-256-GCM, key derived via PBKDF2 (100k iterations) |
| Session auth | 32-byte random tokens, in-memory only, 24hr expiry |
| Tool scopes | User approves scopes before any tool can be used |
| Interrupt gate | User approves each action (confirm/smart/auto mode) |
| MCP isolation | Subprocesses run without API keys in environment |
| Audit log | Every action logged before execution, append-only |
| No external calls | Only `api.anthropic.com`, everything else is local |

## Pages

- **Chat** — Converse with Claude, see tool calls in real-time, get interrupted for approvals
- **Tools** — Manage tool registry, approve scopes, install MCP servers
- **Memory** — View/edit/delete working memory facts used in every conversation
- **Audit** — Full action log with input/output, undo reversible actions
- **Settings** — Manage API keys (encrypted), interrupt mode, model provider

## Interrupt Modes

- **Confirm** (default): Ask before every tool action
- **Smart**: Ask before high-risk or irreversible actions only
- **Auto**: Trust mode — execute all approved tools without asking

## Tool Scopes

Built-in tools and their required scopes:

| Tool | Scopes | Risk |
|------|--------|------|
| File Reader | `fs:read` | Low |
| File Writer | `fs:write` | Medium |
| Web Fetch | `net:fetch` | Low |
| Note Taker | `fs:write` | Medium |

Additional scopes available: `fs:delete`, `net:post`, `shell:read`, `shell:exec`, `email:read`, `email:send`, `calendar:read`, `calendar:write`, `browser:navigate`, `browser:fill`

## MCP Tool Installation

In the Tools page, click "Install MCP Tool" and enter a command:

```
npx @anthropic/mcp-server-filesystem
```

MCP servers run as isolated child processes with no access to your API key.

## Files (gitignored — stay local)

- `kiaros.db` — SQLite database
- `kiaros.config.json` — Runtime config (contains passphrase hash, server secret)
- `notes/` — Notes written by the note-taker tool

## ToS Compliance

Kiaros is designed to be fully compliant with Anthropic's Terms of Service:

- ✅ Self-hosted, user-controlled (no third-party hosting)
- ✅ Explicit tool approval before any invocation
- ✅ Human-in-the-loop gates for all actions
- ✅ Transparent audit trail — no hidden operations
- ✅ API key stays on your machine, encrypted at rest
- ✅ MCP servers never receive the API key
- ✅ User consent at every layer: scopes → tools → actions

## Development

```bash
# Server only (serves pre-built frontend)
npm start

# Client dev server with hot reload (proxies API to :3333)
cd client && npm run dev
```
