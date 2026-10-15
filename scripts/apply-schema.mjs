import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envPath = path.join(root, '.env')
const sqlDir = path.join(root, 'supabase', 'migrations')
const sqlFiles = fs.readdirSync(sqlDir).filter((name) => name.endsWith('.sql')).sort()

function readEnv(file) {
  if (!fs.existsSync(file)) return {}
  const out = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx < 0) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

const env = readEnv(envPath)
const connectionString = env.DATABASE_URL || env.SUPABASE_DB_URL || env.POSTGRES_URL

if (!connectionString) {
  console.error('DATABASE_URL 이 .env 에 없습니다. 프론트엔드 키가 아닌 Postgres 연결 문자열을 넣어 주세요.')
  process.exit(1)
}

const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false },
})

try {
  await client.connect()
  for (const name of sqlFiles) {
    const sql = fs.readFileSync(path.join(sqlDir, name), 'utf8')
    await client.query(sql)
    console.log('applied', name)
  }
  const check = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('club_member_stats','practice_sessions','attendance_records','club_dues','club_guests','practice_lineups','practice_lineup_players','club_venues','club_venue_bookings','club_ledger_entries')
    ORDER BY table_name
  `)
  console.log('schema applied:', check.rows.map((row) => row.table_name).join(', ') || '(no new tables listed)')
} catch (err) {
  console.error('schema apply failed:', err instanceof Error ? err.message : err)
  process.exit(1)
} finally {
  await client.end()
}
