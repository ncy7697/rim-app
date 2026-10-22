import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { supabase } from '../supabaseClient'
import { BackButton, EmptyCard, Spinner } from './ui'
import { isStaffRole } from '../clubMembership'
import {
  defaultMemberRecord,
  ensurePracticeSession,
  loadClubRoster,
  newId,
  type ClubRoster,
} from '../clubRoster'
import { loadSessionLineup, saveSessionLineup } from '../clubTeams'
import {
  TEAM_LABELS,
  TEAM_TONES,
  applyDraftPick,
  generateBalancedTeams,
  generatePositionTeams,
  groupLabel,
  lineupRotationOrder,
  modeLabel,
  reorderTeam,
  placeOnCourt,
  positionGroup,
  ratingFromRecord,
  sequentialDraftTeam,
  startDraftBoard,
  teamDraftQuota,
  starterCount,
  teamRating,
  type CourtFormat,
  type DraftMode,
  type LineupBoard,
  type LineupPlayer,
  type PoolPlayer,
} from '../teamDraft'
import BasketballCourt from './BasketballCourt'

type ClubUser = {
  userId: string
  name: string
  role: string
  status: string
  position?: string | null
  back_number?: number | null
  height?: number | null
}

interface TeamComposeScreenProps {
  clubId: string
  userId?: string
  canEdit: boolean
  embedded?: boolean
  onBack?: () => void
  sessionId?: string
  sessionDate?: string
  sessionTitle?: string
  preselectKeys?: string[]
  lockedTeamCount?: number
  homeTeamLabel?: string
}

export default function TeamComposeScreen({
  clubId,
  canEdit,
  embedded,
  onBack,
  sessionId,
  sessionDate,
  sessionTitle,
  preselectKeys,
  lockedTeamCount,
  homeTeamLabel,
}: TeamComposeScreenProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyLabel, setBusyLabel] = useState<string | null>(null)
  const [people, setPeople] = useState<ClubUser[]>([])
  const [roster, setRoster] = useState<ClubRoster | null>(null)
  const [message, setMessage] = useState('')
  const [format, setFormat] = useState<CourtFormat>('5v5')
  const [teamCount, setTeamCount] = useState(lockedTeamCount === 1 ? 1 : 2)
  const [mode, setMode] = useState<DraftMode>('balance')
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [walkInName, setWalkInName] = useState('')
  const [walkInPosition, setWalkInPosition] = useState('SG')
  const [walkInRating, setWalkInRating] = useState('55')
  const [walkIns, setWalkIns] = useState<PoolPlayer[]>([])
  const [captainKeys, setCaptainKeys] = useState<string[]>([])
  const [board, setBoard] = useState<LineupBoard | null>(null)
  const [activeTeam, setActiveTeam] = useState(0)

  const today = new Date().toISOString().slice(0, 10)
  const targetDate = sessionDate || today
  const members = people.filter((item) => item.status === 'approved' || item.status == null || isStaffRole(item.role))
  const targetSession =
    roster?.sessions.find((item) => (sessionId ? item.id === sessionId : item.date === targetDate)) || null

  const pool = useMemo(() => {
    if (!roster) return [] as PoolPlayer[]
    const memberPlayers: PoolPlayer[] = members.map((member) => {
      const record = roster.members[member.userId] || defaultMemberRecord({
        position: member.position,
        back_number: member.back_number,
        height: member.height,
      })
      return {
        key: `member:${member.userId}`,
        source: 'member',
        userId: member.userId,
        name: member.name,
        position: record.position || member.position || 'ALL',
        group: positionGroup(record.position || member.position, record.height ?? member.height),
        rating: ratingFromRecord(record),
        jersey: record.jerseyNumber ?? member.back_number,
      }
    })
    const guestPlayers: PoolPlayer[] = roster.guests
      .filter((guest) => guest.list !== 'black')
      .map((guest) => ({
        key: `guest:${guest.id}`,
        source: 'guest' as const,
        guestId: guest.id,
        name: guest.name,
        position: 'ALL',
        group: 'F' as const,
        rating: 50,
      }))
    return [...memberPlayers, ...guestPlayers, ...walkIns]
  }, [members, roster, walkIns])

  const selectedPool = pool.filter((item) => selectedKeys.includes(item.key))
  const teamCountOptions = lockedTeamCount === 1 ? [1] : [2, 3, 4]
  const composeTeamLabel = (index: number) => {
    const count = board?.teamCount ?? teamCount
    if (count === 1) return homeTeamLabel || '우리 팀'
    return TEAM_LABELS[index] || `${index + 1}팀`
  }
  const remainingDraft = board
    ? selectedPool.filter((item) => !board.players.some((player) => player.key === item.key))
    : selectedPool

  const loadAll = async () => {
    setLoading(true)
    setMessage('')
    try {
      const [{ data, error }, nextRoster] = await Promise.all([
        supabase
          .from('club_members')
          .select(`
            user_id,
            role,
            status,
            users:user_id ( name, position, back_number, height )
          `)
          .eq('club_id', clubId),
        loadClubRoster(clubId),
      ])
      if (error) throw error
      const nextPeople: ClubUser[] = (data || []).map((item: any) => ({
        userId: item.user_id,
        name: item.users?.name || '이름 없음',
        role: item.role,
        status: item.status,
        position: item.users?.position,
        back_number: item.users?.back_number,
        height: item.users?.height,
      }))
      setPeople(nextPeople)
      setRoster(nextRoster)
      const session =
        nextRoster.sessions.find((item) => (sessionId ? item.id === sessionId : item.date === targetDate))
      const attended = nextPeople
        .filter((member) => nextRoster.members[member.userId]?.attendedSessionIds.includes(session?.id || ''))
        .map((member) => `member:${member.userId}`)
      const initialKeys = preselectKeys?.length ? preselectKeys : attended
      setSelectedKeys((prev) => (prev.length ? prev : initialKeys))
      const lineupKey = sessionId || session?.id
      if (lineupKey) {
        const saved = await loadSessionLineup(clubId, lineupKey)
        if (saved && saved.players.length) {
          setBoard(saved)
          setFormat(saved.format)
          setTeamCount(lockedTeamCount === 1 ? 1 : saved.teamCount)
          setMode(saved.mode)
          setSelectedKeys(saved.players.map((item) => item.key))
          setCaptainKeys(saved.players.filter((item) => item.isCaptain).map((item) => item.key))
        }
      }
    } catch (err: any) {
      setMessage(err.message || '팀 구성 정보를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAll()
  }, [clubId, sessionId, sessionDate, lockedTeamCount])

  useEffect(() => {
    if (lockedTeamCount === 1) setTeamCount(1)
  }, [lockedTeamCount])

  const runBusy = async (label: string, work: () => Promise<void>) => {
    setBusyLabel(label)
    await new Promise((resolve) => window.setTimeout(resolve, 50))
    try {
      await work()
    } finally {
      setBusyLabel(null)
    }
  }

  const persistBoard = async (next: LineupBoard) => {
    setSaving(true)
    try {
      const saved = await saveSessionLineup(next)
      setBoard(saved)
      return saved
    } catch (err: any) {
      setBoard(next)
      throw err
    } finally {
      setSaving(false)
    }
  }

  const ensureSession = async () => {
    if (!roster) return null
    const session = targetSession || {
      id: sessionId || newId(),
      date: targetDate,
      title: sessionTitle || (sessionId ? `경기 ${targetDate}` : `정기 운동 ${targetDate}`),
    }
    if (!targetSession) {
      setRoster({ ...roster, sessions: [session, ...roster.sessions] })
    }
    try {
      await ensurePracticeSession({
        clubId,
        id: session.id,
        date: session.date,
        title: session.title,
      })
    } catch {
      /* 세션 테이블이 없어도 라인업은 저장 */
    }
    return session
  }

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]))
  }

  const addWalkIn = () => {
    const name = walkInName.trim()
    if (!name) return
    const player: PoolPlayer = {
      key: `walkin:${newId()}`,
      source: 'guest',
      guestId: newId(),
      name,
      position: walkInPosition,
      group: positionGroup(walkInPosition),
      rating: Math.max(20, Math.min(99, Number(walkInRating) || 50)),
    }
    setWalkIns((prev) => [player, ...prev])
    setSelectedKeys((prev) => [...prev, player.key])
    setWalkInName('')
  }

  const buildBoard = (players: LineupPlayer[], complete: boolean, turn = 0, sessionId: string): LineupBoard => ({
    id: board?.id || newId(),
    clubId,
    sessionId,
    mode,
    format,
    teamCount,
    draftTurn: turn,
    draftComplete: complete,
    players,
  })

  const resolveCaptains = (): PoolPlayer[] | string => {
    if (selectedPool.length < teamCount) {
      return `드래프트는 팀 수만큼 참석자가 필요합니다. 현재 ${selectedPool.length}명, 필요 ${teamCount}명.`
    }
    const chosen = captainKeys
      .map((key) => selectedPool.find((item) => item.key === key))
      .filter(Boolean) as PoolPlayer[]
    if (chosen.length === teamCount) return chosen
    const rest = selectedPool
      .filter((item) => !chosen.some((captain) => captain.key === item.key))
      .sort((a, b) => b.rating - a.rating)
    const filled = [...chosen, ...rest].slice(0, teamCount)
    setCaptainKeys(filled.map((item) => item.key))
    return filled
  }

  const runAuto = async () => {
    setMessage('')
    const min = teamCount * starterCount(format)
    if (selectedPool.length < min) {
      setMessage(`${format} ${teamCount}개 팀은 최소 ${min}명이 필요합니다.`)
      return
    }
    try {
      await runBusy(`${modeLabel(mode)}으로 팀을 나누는 중...`, async () => {
        const session = await ensureSession()
        if (!session) {
          setMessage('세션을 열지 못했습니다.')
          return
        }
        const players =
          mode === 'position'
            ? generatePositionTeams(selectedPool, teamCount, format)
            : generateBalancedTeams(selectedPool, teamCount, format)
        const next = buildBoard(players, true, 0, session.id)
        setBoard(next)
        setActiveTeam(0)
        await persistBoard(next)
        setMessage('팀이 분배되었습니다.')
      })
    } catch (err: any) {
      setMessage(err.message || '팀 분배에 실패했습니다.')
    }
  }

  const startDraft = async () => {
    setMessage('')
    const captainsOrError = resolveCaptains()
    if (typeof captainsOrError === 'string') {
      setMessage(captainsOrError)
      return
    }
    try {
      await runBusy('드래프트를 시작하는 중...', async () => {
        const session = await ensureSession()
        if (!session) {
          setMessage('세션을 열지 못했습니다. 위에서 세션 열기를 눌러 주세요.')
          return
        }
        const players = startDraftBoard(captainsOrError, teamCount, format)
        const next = buildBoard(players, false, 0, session.id)
        setBoard(next)
        setActiveTeam(0)
        await persistBoard(next)
        setMessage(
          `${captainsOrError.map((item) => item.name).join(', ')} 캡틴으로 드래프트를 시작했습니다. 한 팀 인원을 모두 고른 뒤 다음 팀으로 넘어갑니다.`
        )
      })
    } catch (err: any) {
      setMessage(err.message || '드래프트를 시작하지 못했습니다.')
    }
  }

  const pickPlayer = async (player: PoolPlayer) => {
    if (!board || board.draftComplete || busyLabel) return
    try {
      await runBusy(`${player.name} 지명 중...`, async () => {
        const teamIndex = sequentialDraftTeam(board.players, board.teamCount, selectedPool.length)
        const players = applyDraftPick(board.players, player, teamIndex, board.format, board.draftTurn + board.teamCount + 1)
        const nextTurn = board.draftTurn + 1
        const complete = players.length >= selectedPool.length
        const next = { ...board, players, draftTurn: nextTurn, draftComplete: complete }
        setBoard(next)
        setActiveTeam(complete ? teamIndex : sequentialDraftTeam(players, board.teamCount, selectedPool.length))
        await persistBoard(next)
      })
    } catch (err: any) {
      setMessage(err.message || '지명 저장에 실패했습니다.')
    }
  }

  const changeOrder = async (fromIndex: number, toIndex: number) => {
    if (!board || !canEdit || fromIndex === toIndex) return
    const players = reorderTeam(board.players, activeTeam, fromIndex, toIndex, board.format)
    const next = { ...board, players }
    setBoard(next)
    await persistBoard(next)
  }

  const reshuffleCourt = async () => {
    if (!board || !canEdit || busyLabel) return
    await runBusy('라인업을 다시 배치하는 중...', async () => {
    const captains = new Set(board.players.filter((item) => item.isCaptain).map((item) => item.key))
    const players = Array.from({ length: board.teamCount }, (_, index) =>
      placeOnCourt(
        board.players.filter((item) => item.teamIndex === index),
        index,
        board.format,
        captains
      )
    ).flat()
    const next = { ...board, players }
    setBoard(next)
    await persistBoard(next)
    })
  }

  if (loading || !roster) {
    return (
      <div className={embedded ? '' : 'bb-screen'}>
        <Spinner label="팀 구성 정보를 불러오는 중..." />
      </div>
    )
  }

  const currentTeamPlayers = board?.players.filter((item) => item.teamIndex === activeTeam) || []
  const pickTeam =
    board && !board.draftComplete ? sequentialDraftTeam(board.players, board.teamCount, selectedPool.length) : activeTeam
  const pickTeamNeed = board ? teamDraftQuota(selectedPool.length, board.teamCount, pickTeam) : 0
  const pickTeamHave = board?.players.filter((item) => item.teamIndex === pickTeam).length || 0
  const pickTeamLeft = Math.max(0, pickTeamNeed - pickTeamHave)

  const busy = Boolean(busyLabel) || saving

  return (
    <div className={embedded ? 'space-y-3' : 'bb-screen pb-10'}>
      {busyLabel && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/35 px-6" role="status" aria-live="polite">
          <div className="w-full max-w-xs rounded-2xl bg-white border border-line px-5 py-6 text-center shadow-[0_12px_40px_rgba(15,23,42,0.2)]">
            <span className="mx-auto mb-3 block h-8 w-8 rounded-full border-2 border-line border-t-navy animate-spin" />
            <p className="text-sm font-semibold text-ink">{busyLabel}</p>
            <p className="text-[11px] text-muted mt-1">화면이 잠시 멈춘 것처럼 보여도 분배가 진행 중입니다.</p>
          </div>
        </div>
      )}
      {!embedded && (
        <header className="bb-header">
          <BackButton onClick={() => onBack?.()} />
          <div>
            <h1 className="text-base font-semibold text-ink">팀 구성</h1>
            <p className="text-[11px] text-muted">스마트 드래프트 · 라인업</p>
          </div>
        </header>
      )}

      <div className={embedded ? 'space-y-3' : 'p-5 space-y-3'}>
        {message && (
          <p className="text-xs text-navy bg-white border border-line rounded-xl px-3 py-2">{message}</p>
        )}

        <section className="bb-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{sessionTitle || '팀 구성'} · {targetDate}</h3>
            {!targetSession && canEdit && (
              <button type="button" className="bb-btn-ghost text-xs py-2" onClick={() => void ensureSession()}>
                세션 열기
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(['5v5', '3v3'] as CourtFormat[]).map((item) => (
              <button
                key={item}
                type="button"
                disabled={!canEdit || busy}
                className={`py-2 rounded-xl text-xs font-semibold border ${format === item ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`}
                onClick={() => setFormat(item)}
              >
                {item}
              </button>
            ))}
          </div>
          <div className={`grid gap-2 ${teamCountOptions.length === 1 ? 'grid-cols-1' : 'grid-cols-3'}`}>
            {teamCountOptions.map((count) => (
              <button
                key={count}
                type="button"
                disabled={!canEdit || busy || lockedTeamCount === 1}
                className={`py-2 rounded-xl text-xs font-semibold border ${teamCount === count ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`}
                onClick={() => setTeamCount(count)}
              >
                {count}팀
              </button>
            ))}
          </div>
          {lockedTeamCount === 1 && (
            <p className="text-[11px] text-muted leading-relaxed">
              교류전은 우리 팀 1팀만 구성합니다. 상대 선수는 등록하지 않습니다.
            </p>
          )}
          {teamCount === 3 && (
            <p className="text-[11px] text-muted leading-relaxed">
              3팀은 한 라운드에 2팀만 경기하고 1팀이 쉽니다. 1라운드 A vs B(C 휴식), 2라운드 B vs C(A 휴식), 3라운드 C vs A(B 휴식). 각 라운드는 경기 개설 때 고른 2쿼터 또는 4쿼터로 진행합니다.
            </p>
          )}
          <div className="grid grid-cols-3 gap-2">
            {([
              ['balance', '밸런스'],
              ['position', '포지션'],
              ['draft', '드래프트'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                disabled={!canEdit || busy}
                className={`py-2 rounded-xl text-[11px] font-semibold border ${mode === id ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`}
                onClick={() => setMode(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </section>

        {canEdit && (
          <section className="bb-card p-4 space-y-2">
            <h3 className="text-sm font-semibold">당일 참석자 · {selectedPool.length}명</h3>
            <p className="text-[11px] text-muted">출석한 멤버는 기본 선택됩니다. 화이트리스트·일반 게스트와 현장 게스트를 추가할 수 있습니다.</p>
            <div className="max-h-56 overflow-y-auto space-y-1">
              {pool.map((player) => (
                <label key={player.key} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium">{player.name}</span>
                    <span className="text-[11px] text-muted ml-1">
                      {player.position} · {groupLabel(player.group)} · {player.rating}
                      {player.source === 'guest' ? ' · 게스트' : ''}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="accent-navy"
                    checked={selectedKeys.includes(player.key)}
                    onChange={() => toggleKey(player.key)}
                  />
                </label>
              ))}
            </div>
            <div className="grid grid-cols-6 gap-2">
              <input className="bb-input col-span-2" placeholder="현장 게스트 이름" value={walkInName} onChange={(e) => setWalkInName(e.target.value)} />
              <select className="bb-input col-span-2" value={walkInPosition} onChange={(e) => setWalkInPosition(e.target.value)}>
                {['PG', 'SG', 'SF', 'PF', 'C'].map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
              <input className="bb-input col-span-1" type="number" min={20} max={99} value={walkInRating} onChange={(e) => setWalkInRating(e.target.value)} />
              <button type="button" className="bb-btn-ghost py-2 text-xs col-span-1" onClick={addWalkIn}>추가</button>
            </div>
            {mode === 'draft' && (
              <div className="space-y-1 pt-2">
                <p className="text-[11px] font-semibold text-muted">캡틴 {teamCount}명 (선택하지 않으면 평점 순으로 자동 지정)</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedPool.map((player) => (
                    <button
                      key={player.key}
                      type="button"
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                        captainKeys.includes(player.key) ? 'bg-navy text-white border-navy' : 'bg-white border-line'
                      }`}
                      onClick={() =>
                        setCaptainKeys((prev) =>
                          prev.includes(player.key)
                            ? prev.filter((item) => item !== player.key)
                            : prev.length >= teamCount
                              ? [...prev.slice(1), player.key]
                              : [...prev, player.key]
                        )
                      }
                    >
                      {player.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {mode === 'draft' ? (
              <>
                {selectedPool.length < teamCount && (
                  <p className="text-[11px] text-rose-700">{teamCount}명 이상 참석자를 선택한 뒤 시작해 주세요.</p>
                )}
                <button type="button" className="bb-btn-primary" disabled={busy || selectedPool.length < teamCount} onClick={() => void startDraft()}>
                  {busyLabel ? '시작 중...' : '드래프트 시작'}
                </button>
              </>
            ) : (
              <button type="button" className="bb-btn-primary" disabled={busy} onClick={() => void runAuto()}>
                {busyLabel ? '분배 중...' : `${modeLabel(mode)}으로 팀 분배`}
              </button>
            )}
          </section>
        )}

        {board && canEdit && !board.draftComplete && (
          <section className="bb-card p-4 space-y-2 border-navy/30">
            <p className="text-sm font-semibold text-ink">
              {composeTeamLabel(pickTeam)} 지명 차례
            </p>
            <p className="text-[11px] text-muted">
              남은 선수 {remainingDraft.length}명 · {composeTeamLabel(pickTeam)} {pickTeamLeft}명
              {board && pickTeam >= board.teamCount - 1 ? '을 고르면 드래프트가 끝납니다.' : '을 고른 뒤 다음 팀으로 넘어갑니다.'}
            </p>
            {remainingDraft.length === 0 ? (
              <p className="text-xs text-muted">지명할 선수가 없습니다.</p>
            ) : (
              remainingDraft.map((player) => (
                <button
                  key={player.key}
                  type="button"
                  className="w-full rounded-xl border border-line bg-white p-3 text-left"
                  disabled={busy}
                  onClick={() => void pickPlayer(player)}
                >
                  <span className="text-sm font-semibold">{player.name}</span>
                  <span className="text-[11px] text-muted ml-2">{player.position} · {player.rating}</span>
                </button>
              ))
            )}
          </section>
        )}

        {!board ? (
          <EmptyCard title="아직 라인업이 없습니다" description={canEdit ? '참석자를 고른 뒤 팀을 분배해 주세요.' : '감독·코치가 오늘 팀을 구성하면 여기에서 볼 수 있습니다.'} />
        ) : (
          <>
            <div className="flex gap-1.5">
              {Array.from({ length: board.teamCount }, (_, index) => (
                <button
                  key={index}
                  type="button"
                  className={`flex-1 py-2 rounded-xl text-[11px] font-semibold border ${
                    activeTeam === index ? 'text-white border-transparent' : 'bg-white border-line'
                  }`}
                  style={activeTeam === index ? { background: TEAM_TONES[index] } : undefined}
                  onClick={() => setActiveTeam(index)}
                >
                  {composeTeamLabel(index)}
                </button>
              ))}
            </div>

            <section className="bb-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">{composeTeamLabel(activeTeam)} 베스트 {starterCount(board.format)}</h3>
                  <p className="text-[11px] text-muted">
                    {modeLabel(board.mode)} · 평균 평점 {teamRating(currentTeamPlayers)} · {currentTeamPlayers.length}명
                  </p>
                </div>
                {canEdit && (
                  <button type="button" className="bb-btn-ghost text-[11px] py-2" disabled={busy} onClick={() => void reshuffleCourt()}>
                    라인업 재배치
                  </button>
                )}
              </div>
              <BasketballCourt format={board.format} players={currentTeamPlayers} accent={TEAM_TONES[activeTeam]} />
              <RosterDragList
                players={currentTeamPlayers}
                format={board.format}
                canEdit={canEdit && !busy}
                onReorder={(from, to) => void changeOrder(from, to)}
              />
            </section>
          </>
        )}
      </div>
    </div>
  )
}

function RosterDragList({
  players,
  format,
  canEdit,
  onReorder,
}: {
  players: LineupPlayer[]
  format: CourtFormat
  canEdit: boolean
  onReorder: (fromIndex: number, toIndex: number) => void
}) {
  const ordered = useMemo(() => lineupRotationOrder(players, format), [players, format])
  const [drag, setDrag] = useState<{
    from: number
    over: number
    originY: number
    y: number
    height: number
  } | null>(null)
  const dragRef = useRef(drag)
  dragRef.current = drag
  const gap = 6

  const startDrag = (index: number, event: PointerEvent<HTMLButtonElement>) => {
    if (!canEdit || ordered.length < 2) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const row = event.currentTarget.closest('[data-roster-row]') as HTMLElement | null
    const next = {
      from: index,
      over: index,
      originY: event.clientY,
      y: event.clientY,
      height: row?.offsetHeight || 56,
    }
    dragRef.current = next
    setDrag(next)
  }

  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current
    if (!current) return
    const over = Math.max(
      0,
      Math.min(
        ordered.length - 1,
        Math.round(current.from + (event.clientY - current.originY) / (current.height + gap))
      )
    )
    if (over === current.over && event.clientY === current.y) return
    const next = { ...current, over, y: event.clientY }
    dragRef.current = next
    setDrag(next)
  }

  const endDrag = () => {
    const current = dragRef.current
    if (!current) return
    dragRef.current = null
    setDrag(null)
    if (current.from !== current.over) onReorder(current.from, current.over)
  }

  const shiftFor = (index: number) => {
    if (!drag || index === drag.from) return 0
    if (drag.from < drag.over && index > drag.from && index <= drag.over) return -(drag.height + gap)
    if (drag.from > drag.over && index >= drag.over && index < drag.from) return drag.height + gap
    return 0
  }

  return (
    <div className={`space-y-1.5 ${drag ? 'select-none' : ''}`}>
      <p className="text-[11px] font-semibold text-muted uppercase tracking-wide">출전 순번</p>
      {canEdit && (
        <p className="text-[11px] text-muted">
          왼쪽 손잡이를 드래그해 원하는 위치에 놓습니다. 앞쪽 {starterCount(format)}명이 선발입니다.
        </p>
      )}
      {ordered.map((player, index) => {
        const isDragging = drag?.from === index
        const shift = isDragging ? drag.y - drag.originY : shiftFor(index)
        return (
          <div
            key={player.key}
            data-roster-row
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
              isDragging ? 'border-navy bg-white shadow-lg' : 'border-line bg-white'
            }`}
            style={{
              transform: shift ? `translateY(${shift}px)` : undefined,
              zIndex: isDragging ? 20 : undefined,
              position: 'relative',
              transition: isDragging ? 'none' : 'transform 120ms ease',
            }}
          >
            {canEdit && (
              <button
                type="button"
                aria-label={`${player.name} 순서 이동`}
                className="flex h-10 w-8 shrink-0 cursor-grab touch-none flex-col items-center justify-center gap-0.5 text-muted active:cursor-grabbing"
                disabled={ordered.length < 2}
                onPointerDown={(event) => startDrag(index, event)}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              >
                <span className="block h-0.5 w-3.5 rounded-full bg-current" />
                <span className="block h-0.5 w-3.5 rounded-full bg-current" />
                <span className="block h-0.5 w-3.5 rounded-full bg-current" />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold truncate">
                {(isDragging && drag ? drag.over : index) + 1}번 {player.name}
                {player.isCaptain ? ' · 캡틴' : ''}
              </p>
              <p className="text-[11px] text-muted">
                {player.isStarter ? `선발 ${player.courtSlot}` : '교체'} · {player.position} · {groupLabel(player.group)} · 평점 {player.rating}
                {player.source === 'guest' ? ' · 게스트' : ''}
              </p>
            </div>
          </div>
        )
      })}
      {players.length === 0 && <p className="text-xs text-muted">이 팀 선수가 없습니다.</p>}
    </div>
  )
}
