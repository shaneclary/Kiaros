const Database = require('better-sqlite3')
const fs = require('fs')
const path = require('path')

const DB_PATH = path.join(__dirname, '..', '..', 'kiaros.db')
const SCHEMA_PATH = path.join(__dirname, 'schema.sql')

let db = null

function getDb() {
  if (db) return db

  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Run schema migrations
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8')
  db.exec(schema)

  return db
}

function close() {
  if (db) {
    db.close()
    db = null
  }
}

module.exports = { getDb, close }
