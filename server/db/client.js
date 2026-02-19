const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

const DB_PATH = path.join(__dirname, '../../kiaros.db')
const SCHEMA_PATH = path.join(__dirname, 'schema.sql')

let db = null

function getDb() {
  if (!db) {
    db = new Database(DB_PATH)
    // Performance settings
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    runMigrations()
  }
  return db
}

function runMigrations() {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8')
  // Split on semicolons but handle edge cases
  const statements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))

  const migrate = db.transaction(() => {
    for (const stmt of statements) {
      try {
        db.exec(stmt + ';')
      } catch (err) {
        // Skip errors on index creation for existing tables
        if (!err.message.includes('already exists')) {
          throw err
        }
      }
    }
  })

  migrate()
}

module.exports = { getDb }
