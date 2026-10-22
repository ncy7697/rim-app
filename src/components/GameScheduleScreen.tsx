import { useEffect, useMemo, useState } from 'react'
import { useLandscape } from '../useLandscape'
import { supabase } from '../supabaseClient'
import { BackButton, EmptyCard, SmoothFold, Spinner } from './ui'
import TeamComposeScreen from './TeamComposeScreen'
import GameScoreboard from './GameScoreboard'
import EventContestBoard from './EventContestBoard'
import ShootingRelayBoard from './ShootingRelayBoard'
import BasketballCourt from './BasketballCourt'
import {
  EMPTY_QUARTERS,
  approvedMemberIds,
  gameSessionId,
  isPastGame,
  listClubGames,
  listPlayerStats,
  listRsvps,
  listVideos,
  otQuarter,
  saveClubGame,
  saveVideos,
  setRsvp,
  visibleQuarters,
  youtubeEmbed,
  matchKindLabel,
  normalizeMatchKind,
  type ClubGame,
  type GameClubMember,
  type GameMatchKind,
  type GameVideo,
  type PlayerStat,
  type QuarterCount,
  type RsvpStatus,
} from '../clubGames'
import { loadSessionLineup } from '../clubTeams'
import {
  TEAM_LABELS,
  TEAM_TONES,
  THREE_TEAM_ROUNDS,
  groupLabel,
  lineupRotationOrder,
  modeLabel,
  onCourtForQuarter,
  starterCount,
  teamRating,
  toRotationEntries,
  type LineupBoard,
  type LineupPlayer,
  type RotationEntry,
} from '../teamDraft'
import { newId } from '../clubRoster'
import ExchangeMatchPanel from './ExchangeMatchPanel'
import { clubRowToSettings } from '../clubSettings'
import {
  MAX_FAVORITE_VENUES,
  canAddFavoriteVenue,
  favoriteVenuesFromClubRow,
  normalizeVenueName,
  saveFavoriteVenues,
} from '../clubFavoriteVenues'
import { isWaitingOn, listClubProposals } from '../clubExchange'
import {
  EVENT_MAX_ATTEMPTS,
  EVENT_MAX_SETS,
  EVENT_TYPES,
  RELAY_MAX_MINUTES,
  clampEventAttempts,
  clampEventSets,
  clampRelayMinutes,
  emptyEventBoard,
  eventTypeLabel,
  isRegularClubRole,
  isShootingRelay,
  type EventTypeId,
} from '../clubEvents'
import { difficultyLabel, findTactic, pickRecommendedTactic, type GameTactic } from '../gameTactics'

type View = 'list' | 'form' | 'detail' | 'teams'
type ListTab = 'upcoming' | 'past' | 'exchange'

export default function GameScheduleScreen({
  clubId,
  clubName,
  userId,
  canEdit,
  initialGameId,
  initialProposalId,
  onBack,
}: {
  clubId: string
  clubName?: string
  userId?: string
  canEdit: boolean
  initialGameId?: string | null
  initialProposalId?: string | null
  onBack?: () => void
}) {
  const [view, setView] = useState<View>('list')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [games, setGames] = useState<ClubGame[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(initialGameId || null)
  const [tab, setTab] = useState<ListTab>(initialProposalId ? 'exchange' : 'upcoming')
  const [homeCourt, setHomeCourt] = useState('')
  const [favoriteVenues, setFavoriteVenues] = useState<string[]>([])
  const [favoriteBusy, setFavoriteBusy] = useState(false)
  const [exchangeIncoming, setExchangeIncoming] = useState(0)
  const [pastKindFilter, setPastKindFilter] = useState<'all' | GameMatchKind>('all')
  const [rsvps, setRsvps] = useState<Record<string, RsvpStatus>>({})
  const [members, setMembers] = useState<GameClubMember[]>([])
  const [videos, setVideos] = useState<GameVideo[]>([])
  const [stats, setStats] = useState<PlayerStat[]>([])
  const [lineup, setLineup] = useState<LineupBoard | null>(null)
  const [lineupTeam, setLineupTeam] = useState(0)
  const [lineupOpen, setLineupOpen] = useState(false)
  const landscape = useLandscape()
  const [videoUrl, setVideoUrl] = useState('')
  const [form, setForm] = useState({
    title: '',
    gameDate: new Date().toISOString().slice(0, 10),
    startTime: '20:00',
    endTime: '22:00',
    venue: '',
    notes: '',
    opponent: '',
    opponentContact: '',
    opponentPhone: '',
    opponentRegion: '',
    matchKind: 'internal' as GameMatchKind,
    quarterCount: 4 as QuarterCount,
    eventType: 'free_throw' as EventTypeId,
    eventSetCount: 3,
    eventAttemptCount: 5,
    eventTimeLimitMin: 3,
    recommendedTacticId: '',
  })

  const selected = games.find((item) => item.id === selectedId) || null
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = games.filter((item) => !isPastGame(item))
  const past = games.filter((item) => isPastGame(item))
  const pastInternal = past.filter((item) => normalizeMatchKind(item.matchKind) === 'internal')
  const pastExchange = past.filter((item) => normalizeMatchKind(item.matchKind) === 'exchange')
  const pastEvent = past.filter((item) => normalizeMatchKind(item.matchKind) === 'event')
  const pastShown =
    pastKindFilter === 'all'
      ? past
      : past.filter((item) => normalizeMatchKind(item.matchKind) === pastKindFilter)
  const regularMembers = members.filter((item) => isRegularClubRole(item.role))
  const rsvpMembers = selected?.matchKind === 'event' ? regularMembers : members
  const myRole = members.find((item) => item.id === userId)?.role
  const canJoinEvent = Boolean(myRole) && isRegularClubRole(myRole)
  const shown = tab === 'upcoming' ? upcoming : pastShown
  const rotationTeams = useMemo(() => {
    const baseQuarters = selected ? visibleQuarters(selected.quarterCount || 4) : []
    const quarters = lineup?.teamCount === 3 ? [...new Set([...THREE_TEAM_ROUNDS, ...baseQuarters])] : baseQuarters
    if (lineup?.players.length) {
      return Array.from({ length: lineup.teamCount }, (_, index) => {
        const ordered = toRotationEntries(
          lineupRotationOrder(
            lineup.players.filter((item) => item.teamIndex === index),
            lineup.format
          )
        )
        const courtSize = starterCount(lineup.format)
        const byQuarter: Record<number, RotationEntry[]> = {}
        for (const quarter of quarters) {
          byQuarter[quarter] = onCourtForQuarter(ordered, courtSize, quarter)
        }
        return {
          label:
            selected?.matchKind === 'exchange' && lineup.teamCount === 1
              ? clubName || '우리 팀'
              : TEAM_LABELS[index] || `${index + 1}팀`,
          teamIndex: index,
          team: (index === 1 ? 'a' : index % 2 === 0 ? 'h' : 'a') as 'h' | 'a',
          ordered,
          byQuarter,
        }
      })
    }
    const going = members.filter((item) => rsvps[item.id] === 'going')
    const ordered: RotationEntry[] = going.map((item, index) => ({
      key: `member:${item.id}`,
      userId: item.id,
      name: item.name,
      order: index + 1,
    }))
    const byQuarter: Record<number, RotationEntry[]> = {}
    for (const quarter of quarters) {
      byQuarter[quarter] = onCourtForQuarter(ordered, 5, quarter)
    }
    return ordered.length ? [{ label: '참석', teamIndex: 0, team: 'h' as const, ordered, byQuarter }] : []
  }, [lineup, members, rsvps, selected])

  const loadGames = async () => {
    setLoading(true)
    try {
      const [list, people, clubRes] = await Promise.all([
        listClubGames(clubId),
        approvedMemberIds(clubId),
        supabase.from('clubs').select('*').eq('id', clubId).maybeSingle(),
      ])
      setGames(list)
      setMembers(people)
      setHomeCourt(clubRowToSettings(clubRes.data)?.homeCourt || '')
      setFavoriteVenues(favoriteVenuesFromClubRow(clubRes.data, clubId))
      const openId = initialGameId || selectedId
      if (openId && list.some((item) => item.id === openId)) {
        setSelectedId(openId)
        setView('detail')
      }
    } catch (err: any) {
      setMessage(err.message || '경기 일정을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadGames()
  }, [clubId])

  useEffect(() => {
    if (!canEdit) return
    const tick = async () => {
      try {
        const list = await listClubProposals(clubId)
        setExchangeIncoming(list.filter((item) => isWaitingOn(item, clubId)).length)
      } catch {
        /* ignore */
      }
    }
    void tick()
    const timer = window.setInterval(() => void tick(), 8000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick()
    }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [clubId, canEdit])

  const refreshLineup = async (gameId: string) => {
    const saved = await loadSessionLineup(clubId, gameSessionId(gameId))
    setLineup(saved && saved.players.length ? saved : null)
    setLineupTeam(0)
  }

  useEffect(() => {
    setLineupOpen(false)
    setLineupTeam(0)
    if (!selectedId) {
      setLineup(null)
      return
    }
    void Promise.all([listRsvps(selectedId), listVideos(selectedId), listPlayerStats(selectedId)]).then(
      ([nextRsvp, nextVideos, nextStats]) => {
        setRsvps(nextRsvp)
        setVideos(nextVideos)
        setStats(nextStats)
      }
    )
    if (view !== 'teams') void refreshLineup(selectedId)
  }, [selectedId, view, clubId])

  const openCreate = () => {
    setForm({
      title: '',
      gameDate: today,
      startTime: '20:00',
      endTime: '22:00',
      venue: '',
      notes: '',
      opponent: '',
      opponentContact: '',
      opponentPhone: '',
      opponentRegion: '',
      matchKind: 'internal',
      quarterCount: 4,
      eventType: 'free_throw',
      eventSetCount: 3,
      eventAttemptCount: 5,
      eventTimeLimitMin: 3,
      recommendedTacticId: pickRecommendedTactic(games.map((item) => item.recommendedTacticId || '').filter(Boolean)).id,
    })
    setSelectedId(null)
    setView('form')
  }

  const openEdit = (game: ClubGame) => {
    if (isPastGame(game)) {
      setMessage('종료된 경기는 일정을 수정할 수 없습니다. 유튜브 영상만 추가·삭제할 수 있습니다.')
      return
    }
    setForm({
      title: game.title,
      gameDate: game.gameDate,
      startTime: game.startTime,
      endTime: game.endTime,
      venue: game.venue,
      notes: game.notes,
      opponent: game.opponent,
      opponentContact: game.opponentContact || '',
      opponentPhone: game.opponentPhone || '',
      opponentRegion: game.opponentRegion || '',
      matchKind: game.matchKind || 'internal',
      quarterCount: game.quarterCount || 4,
      eventType: game.eventType || 'free_throw',
      eventSetCount: clampEventSets(game.eventSetCount || 3),
      eventAttemptCount: clampEventAttempts(game.eventAttemptCount || 5),
      eventTimeLimitMin: clampRelayMinutes(game.eventSetCount || 3),
      recommendedTacticId: game.recommendedTacticId || '',
    })
    setSelectedId(game.id)
    setView('form')
  }

  const persistFavorites = async (next: string[]) => {
    setFavoriteBusy(true)
    try {
      const saved = await saveFavoriteVenues(clubId, next)
      setFavoriteVenues(saved)
    } catch (err: any) {
      setMessage(err.message || '즐겨찾기를 저장하지 못했습니다.')
    } finally {
      setFavoriteBusy(false)
    }
  }

  const addFavoriteVenue = async () => {
    const check = canAddFavoriteVenue(favoriteVenues, form.venue)
    if (!check.ok) {
      setMessage(check.reason)
      return
    }
    setMessage('')
    await persistFavorites([...favoriteVenues, check.name])
  }

  const removeFavoriteVenue = async (name: string) => {
    setMessage('')
    await persistFavorites(favoriteVenues.filter((item) => item.toLowerCase() !== name.toLowerCase()))
  }

  const submit = async () => {
    if (selected && isPastGame(selected)) {
      setMessage('종료된 경기는 일정을 수정할 수 없습니다. 유튜브 영상만 추가·삭제할 수 있습니다.')
      return
    }
    if (form.matchKind === 'exchange' && !form.opponent.trim()) {
      setMessage('교류전은 상대 팀명을 입력해 주세요.')
      return
    }
    if (form.matchKind === 'event' && !form.eventType) {
      setMessage('이벤트 종목을 선택해 주세요.')
      return
    }
    if (!form.title.trim() || !form.venue.trim()) {
      setMessage('경기명과 장소를 입력해 주세요.')
      return
    }
    setSaving(true)
    setMessage('')
    try {
      const existing = selected
      const game: ClubGame = {
        id: existing?.id || newId(),
        clubId,
        title: form.title.trim(),
        gameDate: form.gameDate,
        startTime: form.startTime,
        endTime: form.endTime,
        venue: form.venue.trim(),
        notes: form.notes.trim(),
        opponent: form.matchKind === 'exchange' ? form.opponent.trim() : '',
        opponentContact: form.matchKind === 'exchange' ? form.opponentContact.trim() : '',
        opponentPhone: form.matchKind === 'exchange' ? form.opponentPhone.trim() : '',
        opponentRegion: form.matchKind === 'exchange' ? form.opponentRegion.trim() : '',
        matchKind: form.matchKind,
        homeName: existing?.homeName || clubName || '우리 팀',
        awayName: form.matchKind === 'exchange' ? form.opponent.trim() : existing?.awayName || '상대 팀',
        quarterCount: form.matchKind === 'event' ? 4 : form.quarterCount,
        eventType: form.matchKind === 'event' ? form.eventType : undefined,
        eventSetCount: form.matchKind === 'event'
          ? (isShootingRelay(form.eventType) ? clampRelayMinutes(form.eventTimeLimitMin) : clampEventSets(form.eventSetCount))
          : undefined,
        eventAttemptCount: form.matchKind === 'event' ? clampEventAttempts(form.eventAttemptCount) : undefined,
        eventBoard:
          form.matchKind === 'event'
            ? existing?.matchKind === 'event' && existing.eventType === form.eventType
              ? existing.eventBoard
              : isShootingRelay(form.eventType)
                ? emptyEventBoard({
                    type: 'shooting_relay',
                    setCount: clampRelayMinutes(form.eventTimeLimitMin),
                    attemptCount: 5,
                  })
                : undefined
            : undefined,
        currentQuarter: Math.min(existing?.currentQuarter || 1, otQuarter(form.quarterCount)),
        scores: existing?.scores || EMPTY_QUARTERS(),
        fouls: existing?.fouls || EMPTY_QUARTERS(),
        isLive: existing?.isLive || false,
        createdBy: existing?.createdBy || userId,
        updatedAt: new Date().toISOString(),
        recommendedTacticId:
          form.matchKind === 'event'
            ? undefined
            : form.recommendedTacticId ||
              existing?.recommendedTacticId ||
              pickRecommendedTactic(games.map((item) => item.recommendedTacticId || '').filter(Boolean)).id,
      }
      const isNew = !existing
      const saved = await saveClubGame(
        game,
        isNew
          ? {
              clubName: clubName || '동아리',
              memberIds: (form.matchKind === 'event' ? regularMembers : members)
                .map((item) => item.id)
                .filter((id) => id !== userId),
            }
          : null
      )
      setGames((prev) => [saved, ...prev.filter((item) => item.id !== saved.id)])
      setSelectedId(saved.id)
      setView('detail')
      setMessage(isNew ? '일정을 등록하고 회원에게 알림을 보냈습니다.' : '일정을 수정했습니다. 지난 기록도 유지됩니다.')
    } catch (err: any) {
      setMessage(err.message || '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const chooseRsvp = async (status: RsvpStatus) => {
    if (!userId || !selectedId || (selected && isPastGame(selected))) return
    if (selected?.matchKind === 'event' && !canJoinEvent) {
      setMessage('이벤트 경기는 동호회 정회원만 참가할 수 있습니다.')
      return
    }
    await setRsvp(selectedId, userId, status)
    setRsvps((prev) => ({ ...prev, [userId]: status }))
  }

  const addVideo = async () => {
    if (!selected || videos.length >= 10) return
    if (!youtubeEmbed(videoUrl)) {
      setMessage('유튜브 URL을 확인해 주세요. 최대 10개까지 등록할 수 있습니다.')
      return
    }
    const next = [...videos, { id: newId(), url: videoUrl.trim(), title: `영상 ${videos.length + 1}` }]
    setVideos(next)
    setVideoUrl('')
    try {
      await saveVideos(selected.id, next)
    } catch (err: any) {
      setVideos(videos)
      setMessage(err.message || '영상을 저장하지 못했습니다.')
    }
  }

  const removeVideo = async (id: string) => {
    if (!selected) return
    const next = videos.filter((item) => item.id !== id)
    await saveVideos(selected.id, next)
    setVideos(next)
  }

  const goingKeys = useMemo(
    () =>
      members.filter((item) => rsvps[item.id] === 'going').map((item) => `member:${item.id}`),
    [members, rsvps]
  )

  const scoreboardLandscape =
    landscape && view === 'detail' && Boolean(selected) && selected?.matchKind !== 'event'

  useEffect(() => {
    const root = document.documentElement
    if (scoreboardLandscape) root.dataset.scoreboardLandscape = '1'
    else delete root.dataset.scoreboardLandscape
    return () => {
      delete root.dataset.scoreboardLandscape
    }
  }, [scoreboardLandscape])

  if (loading) {
    return (
      <div className="bb-screen">
        <Spinner label="경기 일정을 불러오는 중..." />
      </div>
    )
  }

  if (view === 'teams' && selected) {
    return (
      <TeamComposeScreen
        clubId={clubId}
        userId={userId}
        canEdit={canEdit && !isPastGame(selected)}
        sessionId={gameSessionId(selected.id)}
        sessionDate={selected.gameDate}
        sessionTitle={selected.title}
        preselectKeys={goingKeys}
        lockedTeamCount={selected.matchKind === 'exchange' ? 1 : undefined}
        homeTeamLabel={clubName || '우리 팀'}
        onBack={() => {
          setView('detail')
          void refreshLineup(selected.id)
        }}
      />
    )
  }

  if (scoreboardLandscape && selected) {
    return (
      <div className="h-full min-h-0 bg-navy">
        <GameScoreboard
          game={selected}
          stats={stats}
          canEdit={canEdit && !isPastGame(selected)}
          ended={isPastGame(selected)}
          rotation={rotationTeams}
          layout="fill"
          onChange={(nextGame, nextStats) => {
            setGames((prev) => prev.map((item) => (item.id === nextGame.id ? nextGame : item)))
            setStats(nextStats)
          }}
        />
      </div>
    )
  }

  return (
    <div className="bb-screen pb-10">
      <header className="bb-header">
        <BackButton
          onClick={() => {
            if (view === 'list') onBack?.()
            else if (view === 'detail') setView('list')
            else setView(selectedId ? 'detail' : 'list')
          }}
        />
        <div>
          <h1 className="text-base font-semibold text-ink">
            {view === 'form' ? (selected ? '일정 수정' : '일정 등록') : view === 'detail' ? selected?.title : '경기 일정'}
          </h1>
          <p className="text-[11px] text-muted">{clubName || '동아리 경기 관리'}</p>
        </div>
      </header>

      <main className="p-5 space-y-3">
        {message && <p className="text-xs text-navy bg-white border border-line rounded-xl px-3 py-2">{message}</p>}

        {view === 'list' && (
          <>
            <div className={`grid gap-2 ${canEdit ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <button type="button" className={`py-2 rounded-xl text-xs font-semibold border ${tab === 'upcoming' ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`} onClick={() => setTab('upcoming')}>
                예정 {upcoming.length}
              </button>
              <button type="button" className={`py-2 rounded-xl text-xs font-semibold border ${tab === 'past' ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`} onClick={() => setTab('past')}>
                지난 경기 {past.length}
              </button>
              {canEdit && (
                <button type="button" className={`py-2 rounded-xl text-xs font-semibold border ${tab === 'exchange' ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`} onClick={() => setTab('exchange')}>
                  교류 요청{exchangeIncoming ? ` ${exchangeIncoming}` : ''}
                </button>
              )}
            </div>
            {tab === 'past' && (
              <div className="grid grid-cols-4 gap-2">
                {(
                  [
                    ['all', '전체', past.length],
                    ['internal', '자체전', pastInternal.length],
                    ['exchange', '교류전', pastExchange.length],
                    ['event', '이벤트', pastEvent.length],
                  ] as const
                ).map(([id, label, count]) => (
                  <button
                    key={id}
                    type="button"
                    className={`py-2 rounded-xl text-xs font-semibold border ${
                      pastKindFilter === id ? 'bg-navy text-white border-navy' : 'bg-white border-line'
                    }`}
                    onClick={() => setPastKindFilter(id)}
                  >
                    {label} {count}
                  </button>
                ))}
              </div>
            )}
            {canEdit && tab !== 'exchange' && (
              <button type="button" className="bb-btn-primary" onClick={openCreate}>
                경기 일정 등록
              </button>
            )}
            {tab === 'exchange' ? (
              <ExchangeMatchPanel
                clubId={clubId}
                clubName={clubName || '우리 팀'}
                homeCourt={homeCourt}
                userId={userId}
                canEdit={canEdit}
                initialProposalId={initialProposalId}
                onOpenGame={(gameId) => {
                  setSelectedId(gameId)
                  setView('detail')
                  setTab('upcoming')
                }}
              />
            ) : shown.length === 0 ? (
              <EmptyCard
                title={
                  tab === 'upcoming'
                    ? '예정된 경기가 없습니다'
                    : pastKindFilter === 'all'
                      ? '지난 경기가 없습니다'
                      : `${matchKindLabel(pastKindFilter)} 지난 경기가 없습니다`
                }
                description={
                  tab === 'past' && pastKindFilter !== 'all'
                    ? '전체 또는 다른 유형을 선택해 보세요.'
                    : '지난 일정도 삭제하지 않고 그대로 보관됩니다.'
                }
              />
            ) : (
              shown.map((game) => (
                <button
                  key={game.id}
                  type="button"
                  className="bb-card w-full p-4 text-left"
                  onClick={() => {
                    setSelectedId(game.id)
                    setView('detail')
                  }}
                >
                  <p className="text-[11px] text-muted">{game.gameDate} {game.startTime}{game.endTime ? `–${game.endTime}` : ''}</p>
                  <h3 className="text-sm font-semibold mt-1">{game.title}</h3>
                  <p className="text-[11px] text-muted mt-0.5">
                    {matchKindLabel(game.matchKind)}
                    {game.matchKind === 'event' ? ` · ${eventTypeLabel(game.eventType)}` : ''}
                    {game.matchKind === 'event' && isShootingRelay(game.eventType) ? ` · 팀당 ${clampRelayMinutes(game.eventSetCount)}분` : ''}
                    {' · '}{game.venue}
                    {game.matchKind === 'exchange' && game.opponent ? ` · vs ${game.opponent}` : ''}
                    {game.matchKind !== 'event' ? ` · ${game.quarterCount || 4}쿼터` : ''}
                  </p>
                </button>
              ))
            )}
          </>
        )}

        {view === 'form' && (
          <section className="bb-card p-4 space-y-3">
            <div>
              <label className="bb-label">경기명</label>
              <input className="bb-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="교류전 / 정기 경기" />
            </div>
            <div>
              <label className="bb-label">경기 유형</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  ['internal', '자체전'],
                  ['exchange', '교류전'],
                  ['event', '이벤트'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`py-2 rounded-xl text-xs font-semibold border ${form.matchKind === id ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`}
                    onClick={() => setForm({ ...form, matchKind: id })}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted mt-2 leading-relaxed">
                {form.matchKind === 'event'
                  ? '이벤트는 정회원만 참가할 수 있습니다. 종목에 맞는 규칙을 지정하세요.'
                  : '기본은 자체전입니다. 앱에 있는 동호회와 교류하려면 목록의 교류 요청에서 검색해 제안하세요. 아래 수동 등록은 외부 팀용입니다.'}
              </p>
            </div>
            {form.matchKind === 'event' && (
              <div className="rounded-xl border border-line bg-canvas p-3 space-y-3">
                <div>
                  <label className="bb-label">이벤트 종목</label>
                  <div className="grid grid-cols-3 gap-2">
                    {EVENT_TYPES.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={`py-2 rounded-xl text-xs font-semibold border ${form.eventType === item.id ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`}
                        onClick={() => setForm({ ...form, eventType: item.id, title: form.title || item.label })}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted mt-2 leading-relaxed">{EVENT_TYPES.find((item) => item.id === form.eventType)?.description}</p>
                </div>
                {isShootingRelay(form.eventType) ? (
                <div>
                  <label className="bb-label">팀당 제한 시간 (분, 최대 {RELAY_MAX_MINUTES})</label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {Array.from({ length: RELAY_MAX_MINUTES }, (_, index) => (
                      <button
                        key={index}
                        type="button"
                        className={`py-2 rounded-xl text-xs font-semibold border ${form.eventTimeLimitMin === index + 1 ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`}
                        onClick={() => setForm({ ...form, eventTimeLimitMin: index + 1 })}
                      >
                        {index + 1}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted mt-2">팀은 최대 5개, 팀당 3~5명입니다. 팀 구성과 슈팅 순서는 일정 상세에서 관리합니다.</p>
                </div>
                ) : (
                <>
                <div>
                  <label className="bb-label">셋트 (최대 {EVENT_MAX_SETS})</label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {Array.from({ length: EVENT_MAX_SETS }, (_, index) => (
                      <button
                        key={index}
                        type="button"
                        className={`py-2 rounded-xl text-xs font-semibold border ${form.eventSetCount === index + 1 ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`}
                        onClick={() => setForm({ ...form, eventSetCount: index + 1 })}
                      >
                        {index + 1}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="bb-label">셋트당 횟수 (최대 {EVENT_MAX_ATTEMPTS})</label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {Array.from({ length: EVENT_MAX_ATTEMPTS }, (_, index) => (
                      <button
                        key={index}
                        type="button"
                        className={`py-2 rounded-xl text-xs font-semibold border ${form.eventAttemptCount === index + 1 ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`}
                        onClick={() => setForm({ ...form, eventAttemptCount: index + 1 })}
                      >
                        {index + 1}
                      </button>
                    ))}
                  </div>
                </div>
                </>
                )}
              </div>
            )}
            {form.matchKind === 'exchange' && (
              <div className="rounded-xl border border-line bg-canvas p-3 space-y-3">
                <button
                  type="button"
                  className="bb-btn-primary w-full"
                  onClick={() => {
                    setView('list')
                    setTab('exchange')
                  }}
                >
                  등록된 동호회 검색해서 제안
                </button>
                <div>
                  <p className="text-xs font-semibold text-ink">또는 상대 팀 수동 등록</p>
                  <p className="text-[11px] text-muted mt-0.5">외부 팀 정보만 저장합니다. 상대 선수는 등록하지 않습니다.</p>
                </div>
                <div>
                  <label className="bb-label">팀명</label>
                  <input className="bb-input" value={form.opponent} onChange={(e) => setForm({ ...form, opponent: e.target.value })} placeholder="상대 동호회명" />
                </div>
                <div>
                  <label className="bb-label">대표자명</label>
                  <input className="bb-input" value={form.opponentContact} onChange={(e) => setForm({ ...form, opponentContact: e.target.value })} placeholder="상대 대표자 이름" />
                </div>
                <div>
                  <label className="bb-label">연락처</label>
                  <input className="bb-input" value={form.opponentPhone} onChange={(e) => setForm({ ...form, opponentPhone: e.target.value })} placeholder="010-0000-0000" />
                </div>
                <div>
                  <label className="bb-label">지역</label>
                  <input className="bb-input" value={form.opponentRegion} onChange={(e) => setForm({ ...form, opponentRegion: e.target.value })} placeholder="시/구" />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="bb-label">날짜</label>
                <input type="date" className="bb-input" value={form.gameDate} onChange={(e) => setForm({ ...form, gameDate: e.target.value })} />
              </div>
              <div>
                <label className="bb-label">시작</label>
                <input type="time" className="bb-input" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
              </div>
              <div>
                <label className="bb-label">종료</label>
                <input type="time" className="bb-input" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
              </div>
            </div>
            {form.matchKind !== 'event' && (
            <div>
              <label className="bb-label">쿼터</label>
              <div className="grid grid-cols-2 gap-2">
                {([2, 4] as QuarterCount[]).map((count) => (
                  <button
                    key={count}
                    type="button"
                    className={`py-2 rounded-xl text-xs font-semibold border ${form.quarterCount === count ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`}
                    onClick={() => setForm({ ...form, quarterCount: count })}
                  >
                    {count}쿼터
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted mt-2 leading-relaxed">
                2팀 경기는 선택한 쿼터 수만큼 진행합니다. 3팀 롤테이션이면 각 라운드(A vs B, B vs C, C vs A)마다 같은 쿼터 수로 경기합니다.
              </p>
            </div>
            )}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label className="bb-label mb-0">장소</label>
                <span className="text-[11px] text-muted">즐겨찾기 {favoriteVenues.length}/{MAX_FAVORITE_VENUES}</span>
              </div>
              <div className="flex gap-2">
                <input
                  className="bb-input"
                  value={form.venue}
                  onChange={(e) => setForm({ ...form, venue: e.target.value })}
                  placeholder="체육관 이름"
                />
                <button
                  type="button"
                  className="bb-btn-ghost shrink-0 px-3"
                  disabled={favoriteBusy || !form.venue.trim()}
                  onClick={() => void addFavoriteVenue()}
                >
                  ☆ 추가
                </button>
              </div>
              {favoriteVenues.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {favoriteVenues.map((name) => {
                    const selectedVenue = normalizeVenueName(form.venue) === normalizeVenueName(name)
                    return (
                      <span
                        key={name}
                        className={`inline-flex items-center gap-1 rounded-full border pl-2.5 pr-1 py-1 text-xs ${
                          selectedVenue ? 'bg-navy text-white border-navy' : 'bg-white border-line text-ink'
                        }`}
                      >
                        <button type="button" onClick={() => setForm({ ...form, venue: name })}>
                          {name}
                        </button>
                        <button
                          type="button"
                          className={`w-5 h-5 rounded-full text-sm leading-none ${selectedVenue ? 'text-white/80' : 'text-muted'}`}
                          aria-label={`${name} 즐겨찾기 삭제`}
                          disabled={favoriteBusy}
                          onClick={() => void removeFavoriteVenue(name)}
                        >
                          ×
                        </button>
                      </span>
                    )
                  })}
                </div>
              )}
              <p className="text-[11px] text-muted mt-2 leading-relaxed">
                자주 가는 체육관은 별표로 저장해 두고 바로 고를 수 있습니다. 최대 {MAX_FAVORITE_VENUES}곳입니다.
              </p>
            </div>
            {form.matchKind !== 'event' && (
              <TacticRecommendCard
                tactic={findTactic(form.recommendedTacticId)}
                canRefresh={!selected}
                onRefresh={() =>
                  setForm({
                    ...form,
                    recommendedTacticId: pickRecommendedTactic([form.recommendedTacticId]).id,
                  })
                }
              />
            )}
            <div>
              <label className="bb-label">주의사항</label>
              <textarea className="bb-input min-h-24" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="준비물, 지각 규정, 주차 등" />
            </div>
            <button type="button" className="bb-btn-primary" disabled={saving} onClick={() => void submit()}>
              {saving ? '저장 중...' : selected ? '수정 저장' : '등록하고 알림 보내기'}
            </button>
          </section>
        )}

        {view === 'detail' && selected && (
          <>
            <section className="bb-card p-4 space-y-2">
              <p className="text-[11px] text-muted">{selected.gameDate} {selected.startTime}{selected.endTime ? `–${selected.endTime}` : ''} {isPastGame(selected) ? '· 지난 경기' : ''}</p>
              <h2 className="text-base font-semibold">{selected.title}</h2>
              <p className="text-sm">{selected.venue}</p>
              <p className="text-xs text-muted">
                {matchKindLabel(selected.matchKind)}
                {selected.matchKind === 'event'
                  ? isShootingRelay(selected.eventType)
                    ? ` · ${eventTypeLabel(selected.eventType)} · 팀당 ${clampRelayMinutes(selected.eventSetCount)}분`
                    : ` · ${eventTypeLabel(selected.eventType)} · ${selected.eventSetCount || 3}셋트 · ${selected.eventAttemptCount || 5}회`
                  : ` · ${selected.quarterCount || 4}쿼터`}
                {selected.matchKind === 'exchange' && selected.opponent ? ` · vs ${selected.opponent}` : ''}
              </p>
              {selected.matchKind === 'exchange' && (
                <div className="rounded-xl bg-canvas border border-line px-3 py-2.5 space-y-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                    {selected.opponentClubId ? '상대 동호회 (앱 연결)' : '상대 팀 (수동 등록)'}
                  </p>
                  <p className="text-sm font-semibold">{selected.opponent || '팀명 미입력'}</p>
                  {selected.opponentContact ? <p className="text-xs text-ink">대표 {selected.opponentContact}</p> : null}
                  {selected.opponentPhone ? <p className="text-xs text-ink">연락처 {selected.opponentPhone}</p> : null}
                  {selected.opponentRegion ? <p className="text-xs text-ink">지역 {selected.opponentRegion}</p> : null}
                </div>
              )}
              {selected.matchKind !== 'event' && findTactic(selected.recommendedTacticId) && (
                <div className="pt-1">
                  <TacticRecommendCard tactic={findTactic(selected.recommendedTacticId)} />
                </div>
              )}
              {selected.notes && (
                <div className="pt-2">
                  <p className="bb-label">주의사항</p>
                  <p className="text-sm whitespace-pre-line">{selected.notes}</p>
                </div>
              )}
              {canEdit && !isPastGame(selected) && (
                <button type="button" className="bb-btn-ghost w-full" onClick={() => openEdit(selected)}>
                  일정 수정
                </button>
              )}
              {canEdit && isPastGame(selected) && (
                <p className="text-[11px] text-muted">종료된 경기는 유튜브 영상만 수정할 수 있습니다.</p>
              )}
            </section>

            <section className="bb-card p-4 space-y-2">
              <p className="text-xs font-semibold text-muted uppercase tracking-wide">참여 여부</p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  ['going', '참석'],
                  ['maybe', '미정'],
                  ['no', '불참'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`py-2 rounded-xl text-xs font-semibold border ${userId && rsvps[userId] === id ? 'bg-navy text-white border-navy' : 'bg-white border-line'}`}
                    disabled={isPastGame(selected) || (selected.matchKind === 'event' && !canJoinEvent)}
                    onClick={() => void chooseRsvp(id)}
                  >
                    {label} {rsvpMembers.filter((item) => rsvps[item.id] === id).length}
                  </button>
                ))}
              </div>
              {selected.matchKind === 'event' && !canJoinEvent && (
                <p className="text-[11px] text-brand">이벤트 경기는 동호회 정회원만 참가할 수 있습니다.</p>
              )}
              <p className="text-[11px] text-muted">
                참석 {rsvpMembers.filter((item) => rsvps[item.id] === 'going').map((item) => item.name).join(', ') || '없음'}
              </p>
            </section>

            {selected.matchKind !== 'event' && (
            <div className={canEdit && !isPastGame(selected) ? 'grid grid-cols-2 gap-2' : ''}>
              <button type="button" className="bb-btn-ghost w-full" onClick={() => setView('teams')}>
                {isPastGame(selected) ? '팀 구성 보기' : lineup ? '팀 구성 수정' : '팀 구성'}
              </button>
              {canEdit && !isPastGame(selected) && (
                <button
                  type="button"
                  className="bb-btn-primary"
                  onClick={() => {
                    void saveClubGame({ ...selected, isLive: true }, null).then((next) =>
                      setGames((prev) => prev.map((item) => (item.id === next.id ? next : item)))
                    )
                  }}
                >
                  라이브 시작
                </button>
              )}
            </div>
            )}

            {selected.matchKind === 'event' ? (
              isShootingRelay(selected.eventType) ? (
              <ShootingRelayBoard
                game={selected}
                members={members}
                rsvps={rsvps}
                canEdit={canEdit && !isPastGame(selected)}
                ended={isPastGame(selected)}
                onChange={(nextGame) => setGames((prev) => prev.map((item) => (item.id === nextGame.id ? nextGame : item)))}
              />
              ) : (
              <EventContestBoard
                game={selected}
                members={members}
                rsvps={rsvps}
                canEdit={canEdit && !isPastGame(selected)}
                ended={isPastGame(selected)}
                onChange={(nextGame) => setGames((prev) => prev.map((item) => (item.id === nextGame.id ? nextGame : item)))}
              />
              )
            ) : lineup ? (
              <section className="bb-card p-4">
                <button
                  type="button"
                  className="w-full flex items-center justify-between gap-2 text-left cursor-pointer"
                  aria-expanded={lineupOpen}
                  onClick={() => setLineupOpen((value) => !value)}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-muted uppercase tracking-wide">적용된 팀 구성</p>
                    <p className="text-sm font-semibold mt-1">
                      {modeLabel(lineup.mode)} · {lineup.format} · {lineup.teamCount}팀
                      {lineup.draftComplete ? '' : ' · 드래프트 진행 중'}
                    </p>
                  </div>
                  <span className="text-[11px] font-semibold text-navy shrink-0">
                    {lineupOpen ? '접기' : `펼치기 · ${lineup.players.length}명`}
                  </span>
                </button>
                <SmoothFold open={lineupOpen}>
                  <div className="space-y-3 pt-3">
                    {lineup.teamCount === 3 && (
                      <p className="text-[11px] text-muted">
                        3팀 롤테이션 · 한 라운드에 2팀 경기, 1팀 휴식 (A–B / B–C / C–A) · 각 라운드 {selected.quarterCount || 4}쿼터
                      </p>
                    )}
                    <div className="flex gap-1.5">
                      {Array.from({ length: lineup.teamCount }, (_, index) => (
                        <button
                          key={index}
                          type="button"
                          className={`flex-1 py-2 rounded-xl text-[11px] font-semibold border ${
                            lineupTeam === index ? 'text-white border-transparent' : 'bg-white border-line'
                          }`}
                          style={lineupTeam === index ? { background: TEAM_TONES[index] } : undefined}
                          onClick={() => setLineupTeam(index)}
                        >
                          {selected.matchKind === 'exchange' && lineup.teamCount === 1
                            ? clubName || '우리 팀'
                            : TEAM_LABELS[index]}
                        </button>
                      ))}
                    </div>
                    {(() => {
                      const teamPlayers = lineup.players.filter((item) => item.teamIndex === lineupTeam)
                      return (
                        <>
                          <p className="text-[11px] text-muted">
                            베스트 {starterCount(lineup.format)} · 평균 평점 {teamRating(teamPlayers)} · {teamPlayers.length}명
                          </p>
                          <BasketballCourt format={lineup.format} players={teamPlayers} accent={TEAM_TONES[lineupTeam]} />
                          <LineupRosterTable
                            ordered={rotationTeams[lineupTeam]?.ordered || []}
                            players={teamPlayers}
                            accent={TEAM_TONES[lineupTeam]}
                          />
                        </>
                      )
                    })()}
                  </div>
                </SmoothFold>
              </section>
            ) : (
              <EmptyCard title="아직 팀 구성이 없습니다" description="팀 구성을 완료하면 이 경기 일정에 라인업이 표시됩니다." />
            )}

            {selected.matchKind !== 'event' && (
            <GameScoreboard
              game={selected}
              stats={stats}
              canEdit={canEdit && !isPastGame(selected)}
              ended={isPastGame(selected)}
              rotation={rotationTeams}
              onChange={(nextGame, nextStats) => {
                setGames((prev) => prev.map((item) => (item.id === nextGame.id ? nextGame : item)))
                setStats(nextStats)
              }}
            />
            )}

            <section className="bb-card p-4 space-y-2">
              <p className="text-xs font-semibold text-muted uppercase tracking-wide">경기 영상 · {videos.length}/10</p>
              {canEdit && videos.length < 10 && (
                <div className="flex gap-2">
                  <input className="bb-input" placeholder="유튜브 URL" value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
                  <button type="button" className="bb-btn-ghost shrink-0" onClick={() => void addVideo()}>추가</button>
                </div>
              )}
              {videos.length === 0 && <p className="text-xs text-muted">등록된 영상이 없습니다.</p>}
              {videos.map((video) => {
                const embed = youtubeEmbed(video.url)
                return (
                  <div key={video.id} className="space-y-2">
                    <div className="flex justify-between gap-2 items-center">
                      <p className="text-sm font-semibold">{video.title}</p>
                      {canEdit && (
                        <button type="button" className="bb-btn-danger" onClick={() => void removeVideo(video.id)}>삭제</button>
                      )}
                    </div>
                    {embed ? (
                      <div className="aspect-video rounded-xl overflow-hidden border border-line bg-black">
                        <iframe title={video.title} src={embed} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                      </div>
                    ) : (
                      <p className="text-xs text-muted">이 주소는 미리보기를 열 수 없습니다.</p>
                    )}
                  </div>
                )
              })}
            </section>
          </>
        )}
      </main>
    </div>
  )
}

function LineupRosterTable({
  ordered,
  players,
  accent,
}: {
  ordered: RotationEntry[]
  players: LineupPlayer[]
  accent: string
}) {
  const byKey = Object.fromEntries(players.map((player) => [player.key, player]))
  if (!ordered.length) {
    return <p className="text-xs text-muted">등록된 선수가 없습니다.</p>
  }

  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <table className="w-full text-left border-collapse">
        <caption className="sr-only">팀 선수 명단</caption>
        <thead>
          <tr className="bg-canvas text-[10px] font-semibold uppercase tracking-wide text-muted">
            <th className="px-2.5 py-2 w-10 text-center">순번</th>
            <th className="px-2.5 py-2">선수</th>
            <th className="px-2.5 py-2 w-14">포지션</th>
            <th className="px-2.5 py-2 w-16">역할</th>
            <th className="px-2.5 py-2 w-10 text-right">평점</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((entry, index) => {
            const player = byKey[entry.key]
            const role = player?.isStarter ? player.courtSlot || '선발' : '교체'
            return (
              <tr
                key={entry.key}
                className={`border-t border-line ${index % 2 === 1 ? 'bg-canvas/60' : 'bg-white'}`}
              >
                <td className="px-2.5 py-2.5 text-center align-middle">
                  <span
                    className="inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1 text-[11px] font-black text-white"
                    style={{ background: accent }}
                  >
                    {entry.order}
                  </span>
                </td>
                <td className="px-2.5 py-2.5 align-middle">
                  <p className="text-[13px] font-semibold text-ink leading-tight">
                    {player?.jersey != null ? `#${player.jersey} ` : ''}
                    {entry.name}
                  </p>
                  <p className="text-[10px] text-muted mt-0.5">
                    {player?.isCaptain ? '캡틴' : player?.source === 'guest' ? '게스트' : '멤버'}
                    {player ? ` · ${groupLabel(player.group)}` : ''}
                  </p>
                </td>
                <td className="px-2.5 py-2.5 align-middle text-[11px] font-semibold text-ink">
                  {player?.position || '—'}
                </td>
                <td className="px-2.5 py-2.5 align-middle">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      player?.isStarter ? 'bg-navy text-white' : 'bg-canvas text-muted border border-line'
                    }`}
                  >
                    {role}
                  </span>
                </td>
                <td className="px-2.5 py-2.5 align-middle text-right text-[12px] font-black tabular-nums text-navy">
                  {player?.rating ?? '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TacticRecommendCard({
  tactic,
  canRefresh,
  onRefresh,
}: {
  tactic: GameTactic | null
  canRefresh?: boolean
  onRefresh?: () => void
}) {
  if (!tactic) return null
  return (
    <div className="rounded-xl border border-navy/15 bg-navy/[0.04] px-3.5 py-3 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-navy">추천 전술</p>
        {canRefresh && onRefresh && (
          <button type="button" className="text-[11px] font-semibold text-navy" onClick={onRefresh}>
            다시 추천
          </button>
        )}
      </div>
      <p className="text-sm font-semibold text-ink">{tactic.name}</p>
      <p className="text-[11px] text-muted">
        {tactic.categoryLabel} · {difficultyLabel(tactic.difficulty)}
      </p>
      <p className="text-xs leading-relaxed text-ink/80">{tactic.summary}</p>
    </div>
  )
}
