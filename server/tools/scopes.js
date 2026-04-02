const SCOPES = {
  'fs:read':          { label: 'Read files', risk: 'low', description: 'Read file contents' },
  'fs:write':         { label: 'Write/edit files', risk: 'medium', description: 'Create or modify files' },
  'fs:delete':        { label: 'Delete files', risk: 'high', description: 'Permanently delete files' },
  'net:fetch':        { label: 'Fetch URLs', risk: 'low', description: 'Read-only HTTP GET requests' },
  'net:post':         { label: 'Send HTTP requests', risk: 'medium', description: 'POST/PUT/DELETE HTTP requests' },
  'shell:read':       { label: 'Run read-only commands', risk: 'medium', description: 'ls, cat, grep, etc.' },
  'shell:exec':       { label: 'Execute shell commands', risk: 'high', description: 'Any shell command' },
  'email:read':       { label: 'Read emails', risk: 'medium', description: 'Access email content' },
  'email:send':       { label: 'Send emails', risk: 'high', description: 'Send emails on your behalf' },
  'calendar:read':    { label: 'Read calendar', risk: 'low', description: 'View calendar events' },
  'calendar:write':   { label: 'Modify calendar', risk: 'medium', description: 'Create/edit/delete events' },
  'browser:navigate': { label: 'Open URLs', risk: 'low', description: 'Open web pages' },
  'browser:fill':     { label: 'Fill web forms', risk: 'high', description: 'Enter data into websites' },
  'memory:read':      { label: 'Read memory', risk: 'low', description: 'Access working memory' },
  'memory:write':     { label: 'Write memory', risk: 'low', description: 'Store to working memory' },
}

function getRiskLevel(scopes) {
  const risks = scopes.map(s => SCOPES[s]?.risk || 'unknown')
  if (risks.includes('high')) return 'high'
  if (risks.includes('medium')) return 'medium'
  if (risks.includes('low')) return 'low'
  return 'unknown'
}

function validateScopes(scopes) {
  return scopes.every(s => s in SCOPES)
}

module.exports = { SCOPES, getRiskLevel, validateScopes }
