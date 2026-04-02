const fs = require('fs')
const path = require('path')

const CONFIG_PATH = path.join(__dirname, '..', 'kiaros.config.json')

const DEFAULTS = {
  firstRun: true,
  passphraseHash: null,
  interruptMode: 'confirm', // 'confirm' | 'smart' | 'auto'
  defaultModel: 'claude-sonnet-4-20250514',
  port: 3333,
  tick: {
    enabled: false,
    intervalMs: 60000,        // 1 minute default
    maxAutonomousRisk: 'low', // max risk level for autonomous actions
    idleThresholdMs: 300000,  // 5 min idle before background processing
  }
}

let config = null

function load() {
  if (config) return config
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
    config = { ...DEFAULTS, ...JSON.parse(raw) }
  } catch {
    config = { ...DEFAULTS }
  }
  return config
}

function save() {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2))
}

function get(key) {
  load()
  return config[key]
}

function set(key, value) {
  load()
  config[key] = value
  save()
}

function getAll() {
  return load()
}

module.exports = { load, save, get, set, getAll }
