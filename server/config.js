const fs = require('fs')
const path = require('path')

const CONFIG_PATH = path.join(__dirname, '../kiaros.config.json')

let config = null

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    config = { firstRun: true }
    saveConfig()
  } else {
    try {
      config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
    } catch (err) {
      config = { firstRun: true }
      saveConfig()
    }
  }
  return config
}

function saveConfig() {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
}

function get(key) {
  if (!config) loadConfig()
  return config[key]
}

function set(key, value) {
  if (!config) loadConfig()
  config[key] = value
  saveConfig()
}

function getAll() {
  if (!config) loadConfig()
  return { ...config }
}

// Initialize on load
loadConfig()

module.exports = { get, set, getAll, loadConfig }
