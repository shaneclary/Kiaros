# KIAROS 2.0 — MASTER IMPLEMENTATION PROMPT FOR CLAUDE CODE

**Version:** 2.0.0  
**Classification:** Greenfield build, security-first architecture  
**Primary Directive:** Build ToS-compliant, self-hosted AI orchestration system  
**Architecture:** Node.js/Express server + React web UI at localhost:3333

---

## MISSION STATEMENT

You are building Kiaros 2.0: a self-hosted, Claude-native personal AI executive engine that solves the core problem that **MCP is insecure, third-party harnesses violate Anthropic's Terms of Service, and existing tools treat safety as an afterthought.**

Kiaros treats safety as the architecture. This is the orchestration layer Anthropic would have built if security and compliance came first.

**Your north star:** Every design decision must answer "Does this help or hurt Anthropic ToS compliance?"

---

## CRITICAL ANTHROPIC ToS COMPLIANCE REQUIREMENTS

### What Makes This ToS-Compliant

1. **Self-hosted, user-controlled**: No third-party hosting the user's API key
2. **Explicit tool approval**: User approves every tool scope before any invocation
3. **Human-in-the-loop gates**: User can review/block actions before execution
4. **Transparent audit trail**: Every action logged, no hidden operations
5. **No credential sharing**: User's API key stays on their machine, encrypted at rest
6. **Secure subprocess isolation**: MCP servers never receive the API key
7. **User consent at every layer**: Scopes → Tools → Actions all require approval

### What Would Violate ToS (NEVER BUILD THESE)

❌ Storing user API keys on remote servers  
❌ Executing destructive actions without user approval  
❌ Sharing credentials between users  
❌ Running tools without declared, approved scopes  
❌ Hiding what actions are being performed  
❌ Automatically escalating permissions  
❌ Bypassing safety checks for convenience  

**If you are ever uncertain whether something violates ToS, err on the side of MORE user control and MORE transparency.**

---

## ARCHITECTURE OVERVIEW

```
User's Machine:
┌─────────────────────────────────────────────┐
│  Browser → localhost:3333                   │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  Kiaros Server (Node.js/Express)    │    │
│  │  - Serves web UI (React)            │    │
│  │  - Orchestration engine             │    │
│  │  - Tool sandbox                     │    │
│  │  - Audit logger                     │    │
│  │  - Memory system                    │    │
│  └──────────────┬──────────────────────┘    │
│                 │                           │
│    ┌────────────┼────────────┐              │
│    │            │            │              │
│  Anthropic    SQLite      MCP Servers       │
│  API (HTTPS)  (local DB)  (subprocess)      │
└─────────────────────────────────────────────┘
```

**Key principle:** Everything runs locally. The ONLY external call is to `api.anthropic.com`.

---

## TECH STACK (NON-NEGOTIABLE)

| Layer | Technology | Justification |
|-------|-----------|---------------|
| Server | Node.js + Express | Standard, auditable, subprocess management |
| Frontend | React + Vite | Fast, component-based, easy to audit |
| Database | SQLite (better-sqlite3) | Zero-config, portable, file-based |
| Vector search | sqlite-vec extension | Semantic memory without external dependencies |
| Auth | Local passphrase + bcrypt | Single-user, no OAuth complexity |
| Encryption | AES-256-GCM for API keys | Industry standard, NIST approved |
| API calls | @anthropic-ai/sdk | Official, maintained, supports streaming |
| MCP runtime | Child process (stdio) | Standard MCP transport, isolated |
| Styling | Tailwind CSS | Utility-first, no complex build |

**Security principle:** Minimal dependencies. Every added package is attack surface. Audit package.json carefully.

---

## PROJECT STRUCTURE

```
kiaros/
├── server/
│   ├── index.js              # Entry point, Express setup
│   ├── config.js             # Load/save kiaros.config.json
│   ├── auth/
│   │   └── passphrase.js     # bcrypt passphrase, session tokens
│   ├── credentials/
│   │   └── manager.js        # AES-256-GCM encrypted API key storage
│   ├── orchestration/
│   │   ├── planner.js        # Task decomposition
│   │   ├── interrupt-gate.js # Human-in-the-loop checkpoints
│   │   └── executor.js       # Run plans, collect results
│   ├── tools/
│   │   ├── registry.js       # Tool definitions + scope declarations
│   │   ├── sandbox.js        # Validate inputs, enforce timeouts
│   │   └── mcp-runner.js     # Spawn/manage MCP subprocesses
│   ├── memory/
│   │   ├── session.js        # In-memory conversation context
│   │   ├── working.js        # SQLite key-value persistent memory
│   │   └── archive.js        # sqlite-vec semantic search
│   ├── audit/
│   │   └── logger.js         # Write every action to audit_log table
│   ├── models/
│   │   ├── provider.js       # Abstract model interface
│   │   ├── anthropic.js      # Anthropic SDK wrapper (primary)
│   │   └── ollama.js         # Ollama local fallback (Phase 7)
│   └── db/
│       ├── schema.sql        # SQLite schema
│       └── client.js         # DB singleton with migrations
├── client/
│   ├── index.html
│   ├── src/
│   │   ├── App.jsx
│   │   ├── pages/
│   │   │   ├── Chat.jsx      # Main assistant interface
│   │   │   ├── Tools.jsx     # Tool registry + scope approval UI
│   │   │   ├── Memory.jsx    # View/edit/delete memory
│   │   │   ├── Audit.jsx     # Full action log with undo
│   │   │   └── Settings.jsx  # API keys, model config, interrupt mode
│   │   ├── components/
│   │   │   ├── InterruptPrompt.jsx  # Approve/block action modal
│   │   │   ├── ToolCall.jsx         # Show tool being invoked
│   │   │   ├── MessageBubble.jsx    # Chat message display
│   │   │   └── ScopeApprovalCard.jsx # Tool scope approval UI
│   │   └── utils/
│   │       ├── api.js        # Fetch wrapper for backend API
│   │       └── sse.js        # Server-sent events for streaming
│   └── vite.config.js
├── kiaros.config.json        # Runtime config (gitignored)
├── kiaros.db                 # SQLite database (gitignored)
├── .env.example              # Template for optional env vars
├── package.json
└── README.md                 # User-facing setup instructions
```

---

## SECURITY REQUIREMENTS (MUST FOLLOW)

### 1. API Key Protection

**CRITICAL:** API keys are the crown jewels. Treat them accordingly.

- ✅ Encrypt at rest with AES-256-GCM
- ✅ Derive encryption key from user passphrase (PBKDF2, 100k iterations)
- ✅ Never log API keys (not in console, audit log, or error messages)
- ✅ Mask in UI: `sk-ant-...` → `sk-ant-api...` (first 12 chars only)
- ✅ Never pass to MCP subprocesses
- ✅ Use in-memory only during active requests

**Implementation:**
```javascript
// server/credentials/manager.js
const crypto = require('crypto')

function encryptKey(apiKey, passphrase) {
  const salt = crypto.randomBytes(16)
  const key = crypto.pbkdf2Sync(passphrase, salt, 100000, 32, 'sha256')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(apiKey, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  
  // Store as JSON blob in SQLite
  return JSON.stringify({
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex'),
    data: encrypted.toString('hex')
  })
}

function decryptKey(encryptedBlob, passphrase) {
  const { salt, iv, tag, data } = JSON.parse(encryptedBlob)
  const key = crypto.pbkdf2Sync(passphrase, Buffer.from(salt, 'hex'), 100000, 32, 'sha256')
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'))
  decipher.setAuthTag(Buffer.from(tag, 'hex'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'hex')), decipher.final()]).toString('utf8')
}

// Never expose these functions via API — internal use only
```

### 2. Authentication & Session Management

**Requirement:** Single-user passphrase auth, no accounts, no OAuth.

- ✅ Hash passphrase with bcrypt (cost factor 12)
- ✅ Session tokens are 32-byte random hex, stored in-memory Map
- ✅ Tokens expire after 24 hours
- ✅ Server restart = re-login required (intentional)
- ✅ All API routes except `/api/auth/*` require valid session token

**Implementation:**
```javascript
// server/auth/passphrase.js
const bcrypt = require('bcrypt')
const crypto = require('crypto')

const sessions = new Map() // sessionToken -> { userId: 'local', expiresAt: timestamp }

async function setPassphrase(plaintext) {
  const hash = await bcrypt.hash(plaintext, 12)
  const config = require('./config')
  config.set('passphraseHash', hash)
  config.set('firstRun', false)
}

async function login(plaintext) {
  const config = require('./config')
  const hash = config.get('passphraseHash')
  if (!hash) throw new Error('No passphrase set. Run setup first.')
  
  const valid = await bcrypt.compare(plaintext, hash)
  if (!valid) throw new Error('Invalid passphrase')
  
  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = Date.now() + (24 * 60 * 60 * 1000) // 24 hours
  sessions.set(token, { userId: 'local', expiresAt })
  
  return token
}

function validateSession(token) {
  const session = sessions.get(token)
  if (!session) throw new Error('Invalid session')
  if (Date.now() > session.expiresAt) {
    sessions.delete(token)
    throw new Error('Session expired')
  }
  return session
}

// Middleware
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  try {
    req.session = validateSession(token)
    next()
  } catch (err) {
    res.status(401).json({ error: err.message })
  }
}
```

### 3. Tool Scope Permission System

**Requirement:** User must explicitly approve scopes before ANY tool can be used.

**Scope Taxonomy** (hardcoded, not user-extensible):

```javascript
const SCOPES = {
  // Filesystem
  'fs:read':      { label: 'Read files', risk: 'low', description: 'Read file contents' },
  'fs:write':     { label: 'Write/edit files', risk: 'medium', description: 'Create or modify files' },
  'fs:delete':    { label: 'Delete files', risk: 'high', description: 'Permanently delete files' },
  
  // Network
  'net:fetch':    { label: 'Fetch URLs', risk: 'low', description: 'Read-only HTTP GET requests' },
  'net:post':     { label: 'Send HTTP requests', risk: 'medium', description: 'POST/PUT/DELETE HTTP requests' },
  
  // Shell
  'shell:read':   { label: 'Run read-only commands', risk: 'medium', description: 'ls, cat, grep, etc.' },
  'shell:exec':   { label: 'Execute shell commands', risk: 'high', description: 'Any shell command' },
  
  // Email
  'email:read':   { label: 'Read emails', risk: 'medium', description: 'Access email content' },
  'email:send':   { label: 'Send emails', risk: 'high', description: 'Send emails on your behalf' },
  
  // Calendar
  'calendar:read':  { label: 'Read calendar', risk: 'low', description: 'View calendar events' },
  'calendar:write': { label: 'Modify calendar', risk: 'medium', description: 'Create/edit/delete events' },
  
  // Browser
  'browser:navigate': { label: 'Open URLs', risk: 'low', description: 'Open web pages' },
  'browser:fill':     { label: 'Fill web forms', risk: 'high', description: 'Enter data into websites' },
}
```

**Tool Registration Flow:**

1. Tool declares required scopes in `tool_registry` table
2. User sees tool in Tools UI with requested scopes
3. User reviews scope descriptions and risk levels
4. User clicks "Approve" → scopes saved to `approved_scopes` table
5. ONLY THEN can the tool be invoked

**Implementation:**
```javascript
// server/tools/registry.js

async function canInvokeTool(toolId, requestedScopes) {
  const db = require('../db/client')
  
  // 1. Get tool's required scopes
  const tool = db.prepare('SELECT required_scopes FROM tool_registry WHERE id = ? AND enabled = 1').get(toolId)
  if (!tool) throw new Error('Tool not found or disabled')
  
  const requiredScopes = JSON.parse(tool.required_scopes)
  
  // 2. Check if scopes are approved
  const approval = db.prepare('SELECT scopes FROM approved_scopes WHERE tool_id = ?').get(toolId)
  if (!approval) throw new Error('Tool scopes not approved')
  
  const approvedScopes = JSON.parse(approval.scopes)
  
  // 3. Verify all required scopes are approved
  for (const scope of requiredScopes) {
    if (!approvedScopes.includes(scope)) {
      throw new Error(`Missing required scope: ${scope}`)
    }
  }
  
  return true
}

function getRiskLevel(scopes) {
  const risks = scopes.map(s => SCOPES[s]?.risk || 'unknown')
  if (risks.includes('high')) return 'high'
  if (risks.includes('medium')) return 'medium'
  if (risks.includes('low')) return 'low'
  return 'unknown'
}
```

### 4. Interrupt Gate (Human-in-the-Loop)

**Three modes (user-configurable):**

1. **`confirm`** (default): Ask before EVERY action
2. **`smart`**: Ask before high-risk actions only
3. **`auto`**: Never ask (trust mode, for experienced users)

**Implementation:**
```javascript
// server/orchestration/interrupt-gate.js

async function shouldInterrupt(action, mode = 'confirm') {
  if (mode === 'auto') return false
  if (mode === 'confirm') return true
  if (mode === 'smart') {
    // Interrupt if:
    // - Action uses high-risk scope
    // - Action is irreversible
    // - Action sends data externally
    const tool = await getToolById(action.toolId)
    const riskLevel = getRiskLevel(JSON.parse(tool.required_scopes))
    return riskLevel === 'high' || !tool.reversible
  }
  return true
}

// In executor.js
async function executeStep(step, sessionToken) {
  const config = require('../config')
  const mode = config.get('interruptMode') || 'confirm'
  
  if (await shouldInterrupt(step, mode)) {
    // Send interrupt request to client via SSE or WebSocket
    // Wait for user approval or timeout (30 seconds)
    const approved = await waitForUserApproval(step, sessionToken)
    if (!approved) {
      throw new Error('Action blocked by user')
    }
  }
  
  // Proceed with execution...
  return await invokeTool(step.toolId, step.input)
}
```

### 5. Audit Logging (Append-Only)

**Every action MUST be logged before execution.**

- ✅ Log BEFORE the tool is invoked (with status: 'pending')
- ✅ Update log after completion (status: 'success' or 'failed')
- ✅ Store inputs, outputs, duration, token cost
- ✅ Store undo data if action is reversible
- ✅ Never allow deletion of individual log entries

**Implementation:**
```javascript
// server/audit/logger.js

async function logAction(data) {
  const db = require('../db/client')
  const id = crypto.randomUUID()
  
  db.prepare(`
    INSERT INTO audit_log (
      id, session_id, tool_id, tool_name, input, 
      approved_by, reversible, undo_data, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    id,
    data.sessionId,
    data.toolId,
    data.toolName,
    JSON.stringify(data.input),
    data.approvedBy || 'auto',
    data.reversible ? 1 : 0,
    data.undoData ? JSON.stringify(data.undoData) : null
  )
  
  return id
}

async function updateAction(id, result) {
  const db = require('../db/client')
  
  db.prepare(`
    UPDATE audit_log 
    SET output = ?, duration_ms = ?, token_cost = ?, error = ?
    WHERE id = ?
  `).run(
    result.output ? JSON.stringify(result.output) : null,
    result.durationMs || null,
    result.tokenCost || null,
    result.error || null,
    id
  )
}
```

### 6. MCP Subprocess Isolation

**Critical:** MCP servers run as isolated child processes with no access to sensitive data.

- ✅ Spawn with `child_process.spawn()`, stdio transport
- ✅ **Never** pass API keys in environment variables
- ✅ Set minimal environment (only PATH, HOME)
- ✅ Enforce timeouts (10 seconds default, configurable per tool)
- ✅ Kill process if unresponsive
- ✅ Sanitize and validate all inputs before passing to MCP
- ✅ Validate all outputs before returning to Claude

**Implementation:**
```javascript
// server/tools/mcp-runner.js
const { spawn } = require('child_process')

class MCPServer {
  constructor(config) {
    this.command = config.command
    this.args = config.args || []
    this.process = null
    this.timeout = config.timeoutMs || 10000
  }
  
  async start() {
    // Sanitized environment — NO API KEYS
    const env = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
    }
    
    this.process = spawn(this.command, this.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env,
      shell: false // Security: prevent shell injection
    })
    
    // Set up communication channels...
  }
  
  async invoke(method, params) {
    if (!this.process) throw new Error('MCP server not started')
    
    // Validate inputs (size limits, type checks)
    if (JSON.stringify(params).length > 10000) {
      throw new Error('Input too large (max 10KB)')
    }
    
    const request = { jsonrpc: '2.0', method, params, id: Date.now() }
    
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.process.kill()
        reject(new Error(`MCP call timeout (${this.timeout}ms)`))
      }, this.timeout)
      
      // Write request, wait for response...
      // Clear timeout on response
      // Validate response structure before returning
    })
  }
}
```

---

## DATABASE SCHEMA (schema.sql)

```sql
-- Run once on first start

CREATE TABLE IF NOT EXISTS credentials (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  key_encrypted TEXT NOT NULL,   -- AES-256-GCM encrypted blob
  model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  monthly_budget_cents INTEGER NOT NULL DEFAULT 0,
  current_spend_cents INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tool_registry (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  required_scopes TEXT NOT NULL,   -- JSON array
  risk_level TEXT NOT NULL,        -- derived from scopes
  reversible INTEGER NOT NULL DEFAULT 0,
  sandboxed INTEGER NOT NULL DEFAULT 1,
  timeout_ms INTEGER NOT NULL DEFAULT 10000,
  enabled INTEGER NOT NULL DEFAULT 1,
  mcp_config TEXT,                 -- JSON: {command, args, env}
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS approved_scopes (
  tool_id TEXT NOT NULL REFERENCES tool_registry(id) ON DELETE CASCADE,
  scopes TEXT NOT NULL,            -- JSON array of approved scopes
  confirm_each_use INTEGER DEFAULT 0,
  approved_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tool_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  tool_id TEXT,
  tool_name TEXT,
  input TEXT,                      -- JSON
  output TEXT,                     -- JSON
  approved_by TEXT,                -- 'auto' | 'user' | 'system'
  duration_ms INTEGER,
  token_cost INTEGER,              -- Cost in millicents
  reversible INTEGER DEFAULT 0,
  reversed INTEGER DEFAULT 0,
  undo_data TEXT,                  -- JSON: data needed to reverse action
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS audit_log_session ON audit_log(session_id);
CREATE INDEX IF NOT EXISTS audit_log_created ON audit_log(created_at DESC);

CREATE TABLE IF NOT EXISTS working_memory (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  source TEXT DEFAULT 'user_stated',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_active_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS messages_session ON messages(session_id, created_at);

-- memory_archive with sqlite-vec (Phase 6)
-- Deferred: requires sqlite-vec extension compilation
```

---

## API ROUTES (Express)

### Authentication
```
POST   /api/auth/setup           → Set initial passphrase (first run only)
POST   /api/auth/login           → Passphrase → session token
POST   /api/auth/logout          → Invalidate session token
```

### Credentials
```
GET    /api/credentials          → List credentials (masked keys)
POST   /api/credentials          → Add new credential
DELETE /api/credentials/:id      → Remove credential
POST   /api/credentials/:id/test → Validate API key with Anthropic
PUT    /api/credentials/:id      → Update settings (model, budget)
```

### Tools
```
GET    /api/tools                → List tool registry
POST   /api/tools/:id/approve    → Approve scopes for a tool
DELETE /api/tools/:id/approve    → Revoke scope approval
POST   /api/tools/install        → Install new MCP tool by command
PUT    /api/tools/:id            → Update tool settings (timeout, etc.)
DELETE /api/tools/:id            → Remove tool
```

### Chat
```
POST   /api/chat                 → Send message, stream response via SSE
GET    /api/chat/sessions        → List past sessions
GET    /api/chat/sessions/:id    → Get session messages
DELETE /api/chat/sessions/:id    → Delete session
```

### Memory
```
GET    /api/memory/working       → List all working memory
PUT    /api/memory/working/:key  → Set memory key-value
DELETE /api/memory/working/:key  → Delete memory key
POST   /api/memory/search        → Semantic search archive (Phase 6)
```

### Audit
```
GET    /api/audit                → Paginated audit log
GET    /api/audit/:id            → Single audit entry details
POST   /api/audit/:id/undo       → Undo reversible action
```

### Settings
```
GET    /api/settings             → Get current settings
PUT    /api/settings             → Update settings (interrupt mode, etc.)
```

---

## IMPLEMENTATION PHASES (BUILD ORDER)

Build and test each phase completely before moving to the next. Each phase should be independently deployable.

### **PHASE 1 — Foundation (Get the shell running)**

**Goal:** Server starts, serves static React app, basic auth works.

**Deliverables:**
- ✅ `package.json` with all dependencies
- ✅ Project folder structure as specified
- ✅ SQLite client (`server/db/client.js`) with schema migration
- ✅ Config file loader (`server/config.js`)
- ✅ Express server on port 3333
- ✅ Passphrase auth (setup + login endpoints)
- ✅ Static file serving for React client
- ✅ Auth middleware protecting routes

**Test criteria:**
```bash
npm start
# Opens browser to localhost:3333
# First run: setup wizard, set passphrase
# Subsequent runs: login screen
# After login: blank dashboard (no features yet)
```

**Files to create:**
- `server/index.js` — Express setup, route mounting
- `server/config.js` — Load/save kiaros.config.json
- `server/auth/passphrase.js` — bcrypt hash/verify, session management
- `server/db/client.js` — SQLite connection, run migrations
- `server/db/schema.sql` — Initial schema
- `client/index.html` — Entry point
- `client/src/App.jsx` — Basic routing (setup/login/dashboard)

**Security checklist:**
- [ ] Passphrase hashed with bcrypt cost 12
- [ ] Session tokens are 32-byte random hex
- [ ] Sessions stored in-memory only
- [ ] Auth middleware on all routes except `/api/auth/*`

---

### **PHASE 2 — Credential Manager**

**Goal:** User can add/manage API keys securely.

**Deliverables:**
- ✅ AES-256-GCM encryption/decryption in `server/credentials/manager.js`
- ✅ CRUD endpoints for credentials
- ✅ Test endpoint that validates key with Anthropic
- ✅ UI page for managing credentials
- ✅ Budget tracking (spend counter)

**Test criteria:**
```bash
# In UI:
1. Add credential with API key
2. Key is encrypted in kiaros.db (verify with SQLite browser)
3. Click "Test Connection" → makes real API call to Anthropic
4. See API key masked in UI (sk-ant-api...)
5. Delete credential → confirm removed from DB
```

**Files to create:**
- `server/credentials/manager.js` — Encrypt/decrypt, CRUD operations
- `server/routes/credentials.js` — Express routes
- `client/src/pages/Settings.jsx` — Credentials management UI

**Security checklist:**
- [ ] API keys encrypted with AES-256-GCM
- [ ] Encryption key derived from passphrase (PBKDF2, 100k iterations)
- [ ] Keys never logged or exposed in errors
- [ ] Keys displayed masked in UI
- [ ] Test connection uses minimal API call (no user data sent)

---

### **PHASE 3 — Basic Chat**

**Goal:** User can chat with Claude using their API key.

**Deliverables:**
- ✅ Anthropic SDK integration in `server/models/anthropic.js`
- ✅ Session memory system
- ✅ `/api/chat` endpoint with SSE streaming
- ✅ Chat UI with message history
- ✅ Token cost tracking

**Test criteria:**
```bash
# In UI:
1. Navigate to Chat page
2. Type message, press Enter
3. See Claude's response stream in real-time
4. Verify session stored in DB
5. Refresh page → session persists
6. Check audit log → API call logged with token cost
```

**Files to create:**
- `server/models/provider.js` — Abstract model interface
- `server/models/anthropic.js` — Anthropic SDK wrapper
- `server/memory/session.js` — Session context management
- `server/routes/chat.js` — Chat endpoint with SSE
- `client/src/pages/Chat.jsx` — Chat interface
- `client/src/components/MessageBubble.jsx` — Message display
- `client/src/utils/sse.js` — SSE client helper

**Security checklist:**
- [ ] API key retrieved from encrypted storage only
- [ ] No API key in logs or error messages
- [ ] Session data stored per-user (single-user = one session tree)
- [ ] Token cost tracked and logged
- [ ] SSE connection requires valid session token

---

### **PHASE 4 — Tool System (MOST CRITICAL FOR ToS)**

**Goal:** Tool scopes, approval flow, sandboxed execution, audit logging.

**Deliverables:**
- ✅ Tool registry with 4 starter tools (hardcoded):
  - `file-reader` (fs:read)
  - `file-writer` (fs:write)
  - `web-fetch` (net:fetch)
  - `note-taker` (fs:write to notes directory)
- ✅ Scope approval UI
- ✅ Interrupt gate (all three modes)
- ✅ Sandboxed execution wrapper
- ✅ Complete audit logging

**Test criteria:**
```bash
# In UI:
1. Navigate to Tools page
2. See 4 tools, each showing required scopes
3. Click "Approve" on file-reader → approve fs:read scope
4. Go to Chat, ask Claude to read a file
5. See interrupt prompt (if mode = confirm): "Allow / Block"
6. Click "Allow" → tool executes
7. See tool call in audit log with input/output
8. Try to use unapproved tool → blocked with clear error
```

**Files to create:**
- `server/tools/registry.js` — Tool definitions, scope checking
- `server/tools/sandbox.js` — Input validation, timeout enforcement
- `server/orchestration/interrupt-gate.js` — Human-in-the-loop
- `server/orchestration/executor.js` — Execute action plans
- `server/audit/logger.js` — Audit log writer
- `server/routes/tools.js` — Tool management endpoints
- `client/src/pages/Tools.jsx` — Tool registry UI
- `client/src/components/InterruptPrompt.jsx` — Approval modal
- `client/src/components/ScopeApprovalCard.jsx` — Scope approval UI

**Security checklist:**
- [ ] All tools require declared scopes
- [ ] Scopes must be approved before ANY use
- [ ] Risk level displayed prominently in UI
- [ ] Interrupt gate blocks execution until user approves
- [ ] All actions logged BEFORE execution
- [ ] Input validation (size limits, type checks)
- [ ] Timeouts enforced on all tool calls

**Starter tool implementations** (hardcoded, not MCP yet):

```javascript
// server/tools/builtin/file-reader.js
async function readFile(input) {
  const fs = require('fs').promises
  const path = require('path')
  
  // Validate input
  if (!input.path) throw new Error('Missing path')
  if (input.path.includes('..')) throw new Error('Path traversal not allowed')
  
  // Check file size
  const stats = await fs.stat(input.path)
  if (stats.size > 1024 * 1024) throw new Error('File too large (max 1MB)')
  
  const content = await fs.readFile(input.path, 'utf-8')
  
  return {
    path: input.path,
    content,
    size: stats.size
  }
}

// Register in registry.js
const BUILTIN_TOOLS = [
  {
    id: 'file-reader',
    name: 'File Reader',
    description: 'Read file contents',
    requiredScopes: ['fs:read'],
    reversible: false,
    sandboxed: true,
    timeoutMs: 5000,
    execute: readFile
  },
  // ... other builtin tools
]
```

---

### **PHASE 5 — MCP Integration**

**Goal:** Connect tool registry to real MCP servers.

**Deliverables:**
- ✅ MCPRunner class for subprocess lifecycle
- ✅ Tool installation via `POST /api/tools/install`
- ✅ Connect to `@anthropic/mcp-server-filesystem`
- ✅ Dynamic tool discovery from MCP servers
- ✅ Merge builtin tools + MCP tools in registry

**Test criteria:**
```bash
# In UI:
1. Navigate to Tools page
2. Click "Install MCP Tool"
3. Enter command: npx @anthropic/mcp-server-filesystem
4. Tool connects, discovers available methods
5. New tools appear in registry (list-files, read-file, etc.)
6. Approve scopes for one tool
7. Use tool in Chat → works via MCP subprocess
8. Check audit log → MCP tool calls logged
```

**Files to create:**
- `server/tools/mcp-runner.js` — Spawn/manage MCP subprocesses
- `server/tools/mcp-discovery.js` — Query MCP capabilities
- Update `server/tools/registry.js` — Merge builtin + MCP tools

**Security checklist:**
- [ ] MCP processes spawned with sanitized environment (no API keys)
- [ ] Inputs validated before passing to MCP
- [ ] Outputs validated before returning
- [ ] Timeouts enforced on MCP calls
- [ ] Subprocess killed if unresponsive
- [ ] MCP errors sanitized (no sensitive data leaked)

---

### **PHASE 6 — Memory System**

**Goal:** Persistent working memory + semantic search.

**Deliverables:**
- ✅ Working memory CRUD (`server/memory/working.js`)
- ✅ Memory management UI
- ✅ Integration with Claude context
- ✅ (Optional) sqlite-vec semantic archive

**Test criteria:**
```bash
# In UI:
1. Navigate to Memory page
2. Add memory: key="favorite_color", value="blue"
3. Go to Chat, ask "What's my favorite color?"
4. Claude responds using working memory
5. Edit memory → update reflected in chat
6. Delete memory → Claude no longer has context
```

**Files to create:**
- `server/memory/working.js` — CRUD for working_memory table
- `server/routes/memory.js` — Memory endpoints
- `client/src/pages/Memory.jsx` — Memory management UI

**Security checklist:**
- [ ] User can view/edit/delete all memory
- [ ] No hidden memory storage
- [ ] Memory keys sanitized (no SQL injection)

**Optional: Semantic Archive** (can defer to Phase 7)
- Requires compiling sqlite-vec extension
- Adds vector similarity search
- Useful for large knowledge bases

---

### **PHASE 7 — Polish & Completeness**

**Goal:** Production-ready features.

**Deliverables:**
- ✅ Audit log UI with pagination, filters, undo
- ✅ Comprehensive Settings page
- ✅ Ollama fallback provider (local model option)
- ✅ First-run setup wizard (improved UX)
- ✅ Error handling and user feedback
- ✅ README with setup instructions

**Test criteria:**
```bash
# End-to-end workflow:
1. Fresh install → setup wizard
2. Add API key → test connection
3. Install MCP tool → approve scopes
4. Chat with Claude → uses tool
5. View audit log → see all actions
6. Undo reversible action → verify reverted
7. Configure Ollama → switch model
8. All features work without errors
```

**Files to create:**
- `client/src/pages/Audit.jsx` — Audit log viewer
- `server/models/ollama.js` — Ollama provider
- Improve `client/src/pages/Settings.jsx` — Full settings
- `client/src/components/SetupWizard.jsx` — First-run flow

---

## IMPLEMENTATION GUIDELINES

### Code Quality Standards

1. **Type Safety**
   - Use JSDoc comments for function signatures
   - Validate all inputs at API boundaries
   - Throw descriptive errors with context

2. **Error Handling**
   - Try-catch all async operations
   - Return structured errors: `{ error: string, code: string, details?: any }`
   - Log errors but sanitize sensitive data

3. **Security First**
   - Validate ALL user input (size, type, format)
   - Sanitize before storing in DB (prepared statements)
   - Never trust data from MCP subprocesses

4. **Performance**
   - Use database indexes for common queries
   - Stream large responses (SSE for chat)
   - Debounce user input where appropriate

5. **Maintainability**
   - Keep modules small and focused
   - Document security-critical code
   - Use descriptive variable names
   - Comment WHY, not WHAT

### Testing Approach

After each phase:
1. ✅ Manual testing via UI
2. ✅ Verify database state with SQLite browser
3. ✅ Check logs for errors
4. ✅ Security checklist for that phase

**No automated tests initially** — focus on working software first. Tests can be added in Phase 7 or post-launch.

### Assumptions to Surface

Before implementing any feature, state your assumptions:

```
ASSUMPTIONS I'M MAKING:
1. User has Node.js 18+ installed
2. SQLite3 is available on the system
3. User's API key has access to Claude Sonnet 4
→ Correct me now or I'll proceed with these.
```

### Confusion Management

If you encounter unclear requirements:
1. STOP — don't guess
2. State the specific confusion
3. Present options or ask a clarifying question
4. Wait for resolution

Example:
```
CONFUSION: The spec mentions "reversible" actions but doesn't define 
what makes an action reversible. 

Should I consider:
A) Actions that store undo data (file writes with backup)
B) Actions that can be algorithmically reversed (create → delete)
C) User-defined reversibility flag per tool

Which interpretation should I use?
```

---

## SUCCESS CRITERIA

**Phase 4 MVP** is complete when:
- [ ] User can log in with passphrase
- [ ] User can add/test Anthropic API key
- [ ] User can chat with Claude
- [ ] User can approve tool scopes
- [ ] Claude can use approved tools
- [ ] Interrupt gate blocks unapproved actions
- [ ] All actions appear in audit log
- [ ] No API keys visible in logs or errors

**Phase 7 Complete** is when:
- [ ] All 7 phases implemented
- [ ] All security checklists passed
- [ ] No console errors or warnings
- [ ] README with setup instructions
- [ ] User can run end-to-end workflow successfully

---

## WHAT NOT TO BUILD (OUT OF SCOPE)

❌ Multi-user support (single-user only)  
❌ Cloud hosting (self-hosted only)  
❌ Plugin marketplace (manual tool installation)  
❌ Mobile app (web UI only)  
❌ Voice interface (text only)  
❌ Custom model providers beyond Anthropic + Ollama  
❌ Advanced scheduling (no cron, no task queues)  
❌ Team collaboration features  
❌ Social features (sharing, publishing)  

These are 3.0 problems. Stay laser-focused on the spec.

---

## FINAL REMINDERS

1. **Security is not negotiable.** If a feature would compromise security, don't build it.

2. **ToS compliance is the mission.** When in doubt, ask "Does this help or hurt compliance?"

3. **User control is paramount.** The user should understand and approve everything Kiaros does.

4. **Simplicity over features.** A small, secure system is better than a large, insecure one.

5. **Document security decisions.** Future maintainers need to understand WHY things are built this way.

---

## GETTING STARTED

Your first task:

```
Create Phase 1 foundation:
1. Initialize package.json with dependencies
2. Create project folder structure
3. Set up SQLite database with schema
4. Implement passphrase auth
5. Create basic Express server
6. Serve minimal React app

Test: User can set passphrase and log in.
```

After Phase 1 is complete and tested, proceed to Phase 2.

**Remember:** Build one phase at a time. Don't skip ahead. Security bugs compound.

---

*Document version: 2.0.0 | Generated: 2026-02-19*
