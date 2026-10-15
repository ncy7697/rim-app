import { supabase } from './supabaseClient'
import { newId } from './clubRoster'
import { WEEKDAYS } from './clubSettings'
import { listClubGames, matchKindLabel, type ClubGame } from './clubGames'

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

export type BookingStatus = 'planned' | 'confirmed' | 'cancelled'
export type OpsEventKind = 'practice' | 'game' | 'booking'

export type ClubVenue = {
  id: string
  clubId: string
  name: string
  address: string
  mapUrl: string
  notes: string
  isHome: boolean
}

export type ClubBooking = {
  id: string
  clubId: string
  venueId: string
  date: string
  startTime: string
  endTime: string
  title: string
  fee: number | null
  confirmCode: string
  notes: string
  status: BookingStatus
}

export type OpsEvent = {
  id: string
  date: string
  startTime: string
  endTime: string
  title: string
  kind: OpsEventKind
  venueName?: string
  subtitle?: string
  gameId?: string
  bookingId?: string
}

const DAY_INDEX: Record<string, number> = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 }

function venuesKey(clubId: string) {
  return `bb_venues_${clubId}`
}

function bookingsKey(clubId: string) {
  return `bb_bookings_${clubId}`
}

export function ymdLocal(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseYmd(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

export function startOfWeekMonday(date: Date): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const day = next.getDay()
  const diff = day === 0 ? -6 : 1 - day
  next.setDate(next.getDate() + diff)
  return next
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  next.setDate(next.getDate() + amount)
  return next
}

export function weekdayLabel(date: Date): string {
  return WEEKDAYS[(date.getDay() + 6) % 7]
}

export function monthTitle(cursor: string): string {
  const date = parseYmd(cursor)
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`
}

export function weekRangeLabel(cursor: string): string {
  const start = startOfWeekMonday(parseYmd(cursor))
  const end = addDays(start, 6)
  return `${ymdLocal(start).slice(5)} – ${ymdLocal(end).slice(5)}`
}

export function kakaoMapUrl(address: string, mapUrl?: string) {
  if (mapUrl?.trim()) return mapUrl.trim()
  const q = address.trim()
  return q ? `https://map.kakao.com/link/search/${encodeURIComponent(q)}` : ''
}

export function naverMapUrl(address: string) {
  const q = address.trim()
  return q ? `https://map.naver.com/p/search/${encodeURIComponent(q)}` : ''
}

export function bookingStatusLabel(status: BookingStatus) {
  if (status === 'confirmed') return '확정'
  if (status === 'cancelled') return '취소'
  return '예정'
}

export function eventKindLabel(kind: OpsEventKind) {
  if (kind === 'practice') return '정기 운동'
  if (kind === 'game') return '경기'
  return '대관'
}

function rowToVenue(row: any): ClubVenue {
  return {
    id: row.id,
    clubId: row.club_id,
    name: row.name,
    address: row.address || '',
    mapUrl: row.map_url || '',
    notes: row.notes || '',
    isHome: Boolean(row.is_home),
  }
}

function rowToBooking(row: any): ClubBooking {
  return {
    id: row.id,
    clubId: row.club_id,
    venueId: row.venue_id,
    date: String(row.booking_date).slice(0, 10),
    startTime: (row.start_time || '').slice(0, 5),
    endTime: (row.end_time || '').slice(0, 5),
    title: row.title,
    fee: row.fee == null ? null : Number(row.fee),
    confirmCode: row.confirm_code || '',
    notes: row.notes || '',
    status: (row.status === 'confirmed' || row.status === 'cancelled' ? row.status : 'planned') as BookingStatus,
  }
}

function readLocalVenues(clubId: string): ClubVenue[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(venuesKey(clubId))
  return raw ? (JSON.parse(raw) as ClubVenue[]) : []
}

function writeLocalVenues(clubId: string, venues: ClubVenue[]) {
  window.localStorage.setItem(venuesKey(clubId), JSON.stringify(venues))
}

function readLocalBookings(clubId: string): ClubBooking[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(bookingsKey(clubId))
  return raw ? (JSON.parse(raw) as ClubBooking[]) : []
}

function writeLocalBookings(clubId: string, bookings: ClubBooking[]) {
  window.localStorage.setItem(bookingsKey(clubId), JSON.stringify(bookings))
}

export async function listClubVenues(clubId: string): Promise<ClubVenue[]> {
  const { data, error } = await supabase
    .from('club_venues')
    .select('*')
    .eq('club_id', clubId)
    .order('is_home', { ascending: false })
    .order('name')
  if (error && !isMissingSchema(error)) throw error
  if (isMissingSchema(error) || !data) return readLocalVenues(clubId)
  return data.map(rowToVenue)
}

export async function saveClubVenue(venue: ClubVenue): Promise<ClubVenue> {
  const next = { ...venue, id: venue.id || newId() }
  const payload = {
    id: next.id,
    club_id: next.clubId,
    name: next.name,
    address: next.address,
    map_url: next.mapUrl,
    notes: next.notes,
    is_home: next.isHome,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('club_venues').upsert(payload)
  if (error && !isMissingSchema(error)) throw error
  if (isMissingSchema(error)) {
    const list = readLocalVenues(next.clubId).filter((item) => item.id !== next.id)
    writeLocalVenues(next.clubId, [next, ...list])
    return next
  }
  return next
}

export async function deleteClubVenue(clubId: string, venueId: string): Promise<void> {
  const { error } = await supabase.from('club_venues').delete().eq('id', venueId)
  if (error && !isMissingSchema(error)) throw error
  writeLocalVenues(
    clubId,
    readLocalVenues(clubId).filter((item) => item.id !== venueId)
  )
  writeLocalBookings(
    clubId,
    readLocalBookings(clubId).filter((item) => item.venueId !== venueId)
  )
}

export async function listClubBookings(clubId: string): Promise<ClubBooking[]> {
  const { data, error } = await supabase
    .from('club_venue_bookings')
    .select('*')
    .eq('club_id', clubId)
    .order('booking_date', { ascending: false })
    .order('start_time', { ascending: false })
  if (error && !isMissingSchema(error)) throw error
  if (isMissingSchema(error) || !data) return readLocalBookings(clubId)
  return data.map(rowToBooking)
}

export async function saveClubBooking(booking: ClubBooking): Promise<ClubBooking> {
  const next = { ...booking, id: booking.id || newId() }
  const payload = {
    id: next.id,
    club_id: next.clubId,
    venue_id: next.venueId,
    booking_date: next.date,
    start_time: next.startTime,
    end_time: next.endTime,
    title: next.title,
    fee: next.fee,
    confirm_code: next.confirmCode,
    notes: next.notes,
    status: next.status,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('club_venue_bookings').upsert(payload)
  if (error && !isMissingSchema(error)) throw error
  if (isMissingSchema(error)) {
    const list = readLocalBookings(next.clubId).filter((item) => item.id !== next.id)
    writeLocalBookings(next.clubId, [next, ...list])
    return next
  }
  return next
}

export async function deleteClubBooking(clubId: string, bookingId: string): Promise<void> {
  const { error } = await supabase.from('club_venue_bookings').delete().eq('id', bookingId)
  if (error && !isMissingSchema(error)) throw error
  writeLocalBookings(
    clubId,
    readLocalBookings(clubId).filter((item) => item.id !== bookingId)
  )
}

export async function savePracticeSchedule(
  clubId: string,
  practiceDays: string[],
  practiceTimeStart: string,
  practiceTimeEnd: string
) {
  const { error } = await supabase
    .from('clubs')
    .update({
      practice_days: practiceDays,
      practice_time_start: practiceTimeStart,
      practice_time_end: practiceTimeEnd,
    })
    .eq('id', clubId)
  if (error) throw error
}

export function practiceDatesInRange(
  from: string,
  to: string,
  practiceDays: string[],
  startTime: string,
  endTime: string
): OpsEvent[] {
  if (!practiceDays.length || !startTime || !endTime) return []
  const wanted = new Set(practiceDays.map((day) => DAY_INDEX[day]).filter((n) => n != null))
  const events: OpsEvent[] = []
  let cursor = parseYmd(from)
  const last = parseYmd(to)
  while (cursor <= last) {
    if (wanted.has(cursor.getDay())) {
      const date = ymdLocal(cursor)
      events.push({
        id: `practice:${date}`,
        date,
        startTime,
        endTime,
        title: '정기 운동',
        kind: 'practice',
      })
    }
    cursor = addDays(cursor, 1)
  }
  return events
}

export function gamesToEvents(games: ClubGame[]): OpsEvent[] {
  return games.map((game) => ({
    id: `game:${game.id}`,
    date: game.gameDate,
    startTime: game.startTime,
    endTime: game.endTime,
    title: game.title,
    kind: 'game',
    venueName: game.venue,
    subtitle: matchKindLabel(game.matchKind),
    gameId: game.id,
  }))
}

export function bookingsToEvents(bookings: ClubBooking[], venues: ClubVenue[]): OpsEvent[] {
  const names = Object.fromEntries(venues.map((item) => [item.id, item.name]))
  return bookings
    .filter((item) => item.status !== 'cancelled')
    .map((item) => ({
      id: `booking:${item.id}`,
      date: item.date,
      startTime: item.startTime,
      endTime: item.endTime,
      title: item.title,
      kind: 'booking',
      venueName: names[item.venueId],
      subtitle: bookingStatusLabel(item.status),
      bookingId: item.id,
    }))
}

export async function loadOpsCalendar(params: {
  clubId: string
  from: string
  to: string
  practiceDays: string[]
  practiceTimeStart: string
  practiceTimeEnd: string
}): Promise<{ venues: ClubVenue[]; bookings: ClubBooking[]; events: OpsEvent[] }> {
  const [venues, bookings, games] = await Promise.all([
    listClubVenues(params.clubId),
    listClubBookings(params.clubId),
    listClubGames(params.clubId),
  ])
  const events = [
    ...practiceDatesInRange(params.from, params.to, params.practiceDays, params.practiceTimeStart, params.practiceTimeEnd),
    ...gamesToEvents(games).filter((item) => item.date >= params.from && item.date <= params.to),
    ...bookingsToEvents(bookings, venues).filter((item) => item.date >= params.from && item.date <= params.to),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
  return { venues, bookings, events }
}
