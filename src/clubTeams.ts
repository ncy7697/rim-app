import { supabase } from './supabaseClient'
import { newId } from './clubRoster'
import { positionGroup, type CourtFormat, type DraftMode, type LineupBoard, type LineupPlayer } from './teamDraft'

function isMissingSchema(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const message = error.message || ''
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    /does not exist|schema cache|Could not find/i.test(message)
  )
}

function storageKey(clubId: string, sessionId: string) {
  return `bb_lineup_${clubId}_${sessionId}`
}

function rowToPlayer(row: any): LineupPlayer {
  return {
    key: row.player_key,
    source: row.source,
    userId: row.user_id || undefined,
    guestId: row.guest_id || undefined,
    name: row.display_name,
    position: row.position,
    group: positionGroup(row.position),
    rating: row.rating,
    jersey: null,
    teamIndex: row.team_index,
    isCaptain: Boolean(row.is_captain),
    isStarter: Boolean(row.is_starter),
    courtSlot: row.court_slot || undefined,
    benchOrder: row.bench_order ?? undefined,
    pickOrder: row.pick_order ?? undefined,
  }
}

export async function loadSessionLineup(clubId: string, sessionId: string): Promise<LineupBoard | null> {
  const { data, error } = await supabase
    .from('practice_lineups')
    .select('*')
    .eq('club_id', clubId)
    .eq('session_id', sessionId)
    .maybeSingle()

  if (error && !isMissingSchema(error)) throw error
  if (isMissingSchema(error) || !data) {
    if (typeof window === 'undefined') return null
    const raw = window.localStorage.getItem(storageKey(clubId, sessionId))
    return raw ? (JSON.parse(raw) as LineupBoard) : null
  }

  const players = await supabase.from('practice_lineup_players').select('*').eq('lineup_id', data.id)
  if (players.error) throw players.error

  return {
    id: data.id,
    clubId: data.club_id,
    sessionId: data.session_id,
    mode: data.mode as DraftMode,
    format: data.format as CourtFormat,
    teamCount: data.team_count,
    draftTurn: data.draft_turn,
    draftComplete: data.draft_complete,
    players: (players.data || []).map(rowToPlayer),
  }
}

export async function saveSessionLineup(board: LineupBoard): Promise<LineupBoard> {
  const existing = await supabase
    .from('practice_lineups')
    .select('id')
    .eq('club_id', board.clubId)
    .eq('session_id', board.sessionId)
    .maybeSingle()

  const id =
    existing.error && isMissingSchema(existing.error)
      ? board.id || newId()
      : existing.data?.id || board.id || newId()
  const payload = {
    id,
    club_id: board.clubId,
    session_id: board.sessionId,
    mode: board.mode,
    format: board.format,
    team_count: board.teamCount,
    draft_turn: board.draftTurn,
    draft_complete: board.draftComplete,
    updated_at: new Date().toISOString(),
  }

  const upsert = await supabase.from('practice_lineups').upsert(payload)
  if (upsert.error && !isMissingSchema(upsert.error)) throw upsert.error

  if (isMissingSchema(upsert.error)) {
    const local = { ...board, id: payload.id }
    window.localStorage.setItem(storageKey(board.clubId, board.sessionId), JSON.stringify(local))
    return local
  }

  await supabase.from('practice_lineup_players').delete().eq('lineup_id', payload.id)
  if (board.players.length) {
    const { error } = await supabase.from('practice_lineup_players').insert(
      board.players.map((player) => ({
        id: newId(),
        lineup_id: payload.id,
        team_index: player.teamIndex,
        source: player.source,
        user_id: player.userId || null,
        guest_id: player.guestId || null,
        display_name: player.name,
        position: player.position,
        rating: player.rating,
        is_captain: player.isCaptain,
        is_starter: player.isStarter,
        court_slot: player.courtSlot || null,
        bench_order: player.benchOrder ?? null,
        pick_order: player.pickOrder ?? null,
        player_key: player.key,
      }))
    )
  if (error) throw error
  }

  const saved = { ...board, id: payload.id }
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(storageKey(board.clubId, board.sessionId), JSON.stringify(saved))
  }
  return saved
}
