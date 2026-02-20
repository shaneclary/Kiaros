/**
 * XDG Base Directory Specification helpers
 * https://specifications.freedesktop.org/basedir-spec/latest/
 *
 * Config  → $XDG_CONFIG_HOME/kiaros   (default: ~/.config/kiaros)
 * Data    → $XDG_DATA_HOME/kiaros     (default: ~/.local/share/kiaros)
 * Cache   → $XDG_CACHE_HOME/kiaros    (default: ~/.cache/kiaros)
 * Runtime → $XDG_RUNTIME_DIR/kiaros   (default: ~/.local/run/kiaros)
 *
 * All directories are created on first require.
 *
 * MIGRATION NOTE: if the legacy kiaros.db / kiaros.config.json next to the
 * source tree are detected, a one-time console warning is printed. Run
 * install.sh --migrate to move them automatically.
 */

const os   = require('os')
const path = require('path')
const fs   = require('fs')

const HOME = os.homedir()
const APP  = 'kiaros'

const configHome  = process.env.XDG_CONFIG_HOME  || path.join(HOME, '.config')
const dataHome    = process.env.XDG_DATA_HOME    || path.join(HOME, '.local', 'share')
const cacheHome   = process.env.XDG_CACHE_HOME   || path.join(HOME, '.cache')
const runtimeHome = process.env.XDG_RUNTIME_DIR  || path.join(HOME, '.local', 'run')

const xdg = {
  configDir:    path.join(configHome,  APP),
  dataDir:      path.join(dataHome,    APP),
  cacheDir:     path.join(cacheHome,   APP),
  runtimeDir:   path.join(runtimeHome, APP),

  // Well-known file paths
  configFile:   path.join(configHome,  APP, 'config.json'),
  dbFile:       path.join(dataHome,    APP, 'kiaros.db'),
  generatedDir: path.join(dataHome,    APP, 'generated'),
  notesDir:     path.join(dataHome,    APP, 'notes'),
}

// Ensure all directories exist (mkdirSync with recursive is idempotent)
for (const dir of [xdg.configDir, xdg.dataDir, xdg.cacheDir, xdg.runtimeDir, xdg.generatedDir, xdg.notesDir]) {
  fs.mkdirSync(dir, { recursive: true })
}

// ── Legacy path detection ─────────────────────────────────────────────────
// Warn once if old data files exist beside the source tree.
const LEGACY_DB     = path.join(__dirname, '..', 'kiaros.db')
const LEGACY_CONFIG = path.join(__dirname, '..', 'kiaros.config.json')

if (fs.existsSync(LEGACY_DB) || fs.existsSync(LEGACY_CONFIG)) {
  console.warn(
    '[xdg] Legacy data files detected next to source tree.\n' +
    `  DB:     ${LEGACY_DB}\n` +
    `  Config: ${LEGACY_CONFIG}\n` +
    '  Run install.sh to migrate them to XDG directories.\n' +
    `  New locations: ${xdg.dbFile} / ${xdg.configFile}`
  )
}

module.exports = xdg
