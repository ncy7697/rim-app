import { useEffect, useMemo, useState } from 'react'
import { saveClubGame, type ClubGame, type GameClubMember, type RsvpStatus } from '../clubGames'
import { newId } from '../clubRoster'
import {
  RELAY_MAX_ROSTER,
  RELAY_MAX_TEAMS,
  RELAY_MIN_ROSTER,
  RELAY_SPOTS,
  applyRelayShot,
  currentRelayShooter,
  formatRelayClock,
  gameEventBoard,
  isRegularClubRole,
  relayRemainingMs,
  relayStanding,
  relayTeamScore,
  type EventBoard,
  type RelayState,
  type RelayTeam,
} from '../clubEvents'

export default function ShootingRelayBoard({
  game,
  members,
  rsvps,
  canEdit,
  ended,
  onChange,
}: {
  game: ClubGame
  members: GameClubMember[]
  rsvps: Record<string, RsvpStatus>
  canEdit: boolean
  ended?: boolean
  onChange: (game: ClubGame) => void
}) {
  const regulars = members.filter((item) => isRegularClubRole(item.role))
  const going = regulars.filter((item) => rsvps[item.id] === 'going')
  const people = useMemo(() => {
    const extra = regulars.map((item) => ({ userId: item.id, name: item.name }))
    const fromGoing = going.map((item) => ({ userId: item.id, name: item.name }))
    const merged = [...fromGoing]
    for (const item of extra) {
      if (!merged.some((row) => row.userId === item.userId)) merged.push(item)
    }
    return merged
  }, [regulars, going])

  const board = gameEventBoard(game)
  const relay = board.relay || {
    timeLimitSec: clampMinutes(game.eventSetCount) * 60,
    activeTeamId: null,
    teams: [],
  }
  const [saving, setSaving] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [addUserId, setAddUserId] = useState('')
  const active = relay.teams.find((item) => item.id === relay.activeTeamId) || relay.teams[0] || null

  useEffect(() => {
    const anyRunning = relay.teams.some((item) => item.running && !item.finished)
    if (!anyRunning) return
    const timer = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [relay.teams])

  useEffect(() => {
    if (!canEdit || ended) return
    const expired = relay.teams.filter((item) => item.running && !item.finished && relayRemainingMs(item, now) <= 0)
    if (!expired.length) return
    void persistRelay({
      ...relay,
      teams: relay.teams.map((item) =>
        expired.some((row) => row.id === item.id)
          ? { ...item, running: false, startedAt: null, remainingMs: 0, finished: true }
          : item
      ),
    })
  }, [now])

  const persistRelay = async (nextRelay: RelayState) => {
    if (!canEdit) return
    setSaving(true)
    try {
      const nextBoard: EventBoard = { ...board, type: 'shooting_relay', relay: nextRelay }
      const next = await saveClubGame(
        {
          ...game,
          eventType: 'shooting_relay',
          eventSetCount: Math.round(nextRelay.timeLimitSec / 60) || 3,
          eventBoard: nextBoard,
          isLive: true,
        },
        null
      )
      onChange(next)
    } finally {
      setSaving(false)
    }
  }

  const updateTeam = (teamId: string, patch: Partial<RelayTeam> | ((team: RelayTeam) => RelayTeam)) => {
    void persistRelay({
      ...relay,
      teams: relay.teams.map((item) => {
        if (item.id !== teamId) return item
        return typeof patch === 'function' ? patch(item) : { ...item, ...patch }
      }),
    })
  }

  const addTeam = () => {
    if (relay.teams.length >= RELAY_MAX_TEAMS) return
    const team: RelayTeam = {
      id: newId(),
      name: `${relay.teams.length + 1}팀`,
      playerIds: [],
      currentOrder: 0,
      currentSpot: 0,
      remainingMs: relay.timeLimitSec * 1000,
      running: false,
      startedAt: null,
      finished: false,
      logs: [],
    }
    void persistRelay({
      ...relay,
      activeTeamId: relay.activeTeamId || team.id,
      teams: [...relay.teams, team],
    })
  }

  const assigned = new Set(relay.teams.flatMap((item) => item.playerIds))
  const pool = people.filter((item) => !assigned.has(item.userId))
  const shooter = active ? currentRelayShooter(active, people) : null
  const remaining = active ? relayRemainingMs(active, now) : relay.timeLimitSec * 1000
  const standings = relayStanding(relay)
  const canStart = Boolean(active && !ended && canEdit && active.playerIds.length >= RELAY_MIN_ROSTER && active.playerIds.length <= RELAY_MAX_ROSTER && !active.finished)

  return (
    <div className="space-y-3">
      <section className="bb-card p-4 space-y-2">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">슈팅 릴레이</p>
        <h3 className="text-sm font-semibold text-ink">팀당 {Math.round(relay.timeLimitSec / 60)}분 · 최대 {RELAY_MAX_TEAMS}팀 · 팀당 {RELAY_MIN_ROSTER}~{RELAY_MAX_ROSTER}명</h3>
        <p className="text-[11px] text-muted leading-relaxed">
          한 번에 한 명만 슛합니다. 골밑 1점, 자유투 2점, 3점 3점을 순서대로 각 1회 시도하고 다음 선수로 넘깁니다. 제한 시간이 끝나면 합산 점수가 높은 팀이 우승합니다.
        </p>
      </section>

      <section className="bb-card p-4 space-y-2">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">순위</p>
        {standings.length === 0 ? (
          <p className="text-xs text-muted">팀을 구성해 주세요.</p>
        ) : (
          standings.map((team, index) => (
            <div key={team.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted w-6">{index + 1}</span>
              <span className="flex-1 font-semibold truncate">{team.name}</span>
              <span className="text-[11px] text-muted">
                {relayTeamScore(team)}점 · {team.finished ? '종료' : team.running ? '진행' : '대기'}
              </span>
            </div>
          ))
        )}
      </section>

      <div className="flex flex-wrap gap-1.5">
        {relay.teams.map((team) => (
          <button
            key={team.id}
            type="button"
            className={`px-3 py-2 rounded-xl text-xs font-semibold border ${
              active?.id === team.id ? 'bg-navy text-white border-navy' : 'bg-white border-line text-muted'
            }`}
            onClick={() => void persistRelay({ ...relay, activeTeamId: team.id })}
          >
            {team.name} · {relayTeamScore(team)}
          </button>
        ))}
        {canEdit && !ended && relay.teams.length < RELAY_MAX_TEAMS && (
          <button type="button" className="bb-btn-ghost text-xs py-2 px-3" disabled={saving} onClick={addTeam}>
            팀 추가
          </button>
        )}
      </div>

      {active && (
        <section className="bb-card p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            {canEdit && !ended ? (
              <input
                className="bb-input"
                value={active.name}
                onChange={(e) => updateTeam(active.id, { name: e.target.value })}
              />
            ) : (
              <h3 className="text-sm font-semibold">{active.name}</h3>
            )}
            {canEdit && !ended && (
              <button
                type="button"
                className="bb-btn-danger"
                disabled={saving || active.running}
                onClick={() =>
                  void persistRelay({
                    ...relay,
                    activeTeamId: relay.teams.find((item) => item.id !== active.id)?.id || null,
                    teams: relay.teams.filter((item) => item.id !== active.id),
                  })
                }
              >
                팀 삭제
              </button>
            )}
          </div>

          <div className="rounded-2xl bg-navy text-white px-4 py-5 text-center">
            <p className="text-[11px] tracking-wide text-white/50 uppercase">타임워치</p>
            <p className={`text-4xl font-semibold mt-1 tabular-nums ${remaining <= 10000 ? 'text-amber-300' : ''}`}>
              {formatRelayClock(remaining)}
            </p>
            <p className="text-xs text-white/65 mt-2">
              {active.finished ? '이 팀 시간 종료' : shooter ? `현재 슈터 · ${shooter.name} · ${RELAY_SPOTS[active.currentSpot].label} ${RELAY_SPOTS[active.currentSpot].points}점` : '선수를 먼저 넣으세요'}
            </p>
          </div>

          {canEdit && !ended && (
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                className="bb-btn-primary"
                disabled={saving || !canStart || active.running}
                onClick={() =>
                  void persistRelay({
                    ...relay,
                    activeTeamId: active.id,
                    teams: relay.teams.map((item) => {
                      if (item.id === active.id) {
                        return {
                          ...item,
                          running: true,
                          startedAt: Date.now(),
                          remainingMs: item.running ? relayRemainingMs(item) : item.remainingMs || relay.timeLimitSec * 1000,
                          finished: false,
                        }
                      }
                      if (item.running) {
                        return { ...item, running: false, startedAt: null, remainingMs: relayRemainingMs(item) }
                      }
                      return item
                    }),
                  })
                }
              >
                시작
              </button>
              <button
                type="button"
                className="bb-btn-ghost"
                disabled={saving || !active.running}
                onClick={() =>
                  updateTeam(active.id, {
                    running: false,
                    startedAt: null,
                    remainingMs: relayRemainingMs(active),
                  })
                }
              >
                일시정지
              </button>
              <button
                type="button"
                className="bb-btn-ghost"
                disabled={saving}
                onClick={() =>
                  updateTeam(active.id, {
                    running: false,
                    startedAt: null,
                    remainingMs: relay.timeLimitSec * 1000,
                    finished: false,
                    currentOrder: 0,
                    currentSpot: 0,
                    logs: [],
                  })
                }
              >
                리셋
              </button>
            </div>
          )}

          {!canStart && canEdit && !ended && active.playerIds.length < RELAY_MIN_ROSTER && (
            <p className="text-[11px] text-brand">시작하려면 이 팀에 {RELAY_MIN_ROSTER}명 이상 넣으세요.</p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className="bb-btn-primary"
              disabled={!canEdit || ended || saving || !active.running || !shooter || remaining <= 0}
              onClick={() => updateTeam(active.id, (team) => applyRelayShot(team, true, people))}
            >
              성공 +{RELAY_SPOTS[active.currentSpot].points}
            </button>
            <button
              type="button"
              className="bb-btn-ghost"
              disabled={!canEdit || ended || saving || !active.running || !shooter || remaining <= 0}
              onClick={() => updateTeam(active.id, (team) => applyRelayShot(team, false, people))}
            >
              실패
            </button>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted">슈팅 순서</p>
            {active.playerIds.length === 0 && <p className="text-xs text-muted">참석한 정회원을 팀에 넣으세요.</p>}
            {active.playerIds.map((userId, index) => {
              const name = people.find((item) => item.userId === userId)?.name || '회원'
              const current = shooter?.userId === userId
              return (
                <div key={userId} className={`flex items-center gap-2 rounded-xl px-3 py-2 ${current ? 'bg-navy/10' : 'bg-canvas'}`}>
                  <span className="text-[11px] text-muted w-5">{index + 1}</span>
                  <span className="flex-1 text-sm font-semibold truncate">{name}</span>
                  {canEdit && !ended && !active.running && (
                    <div className="flex gap-1">
                      <button type="button" className="bb-btn-ghost text-[11px] py-1 px-2" disabled={index === 0} onClick={() => updateTeam(active.id, { playerIds: moveItem(active.playerIds, index, -1) })}>
                        위
                      </button>
                      <button type="button" className="bb-btn-ghost text-[11px] py-1 px-2" disabled={index === active.playerIds.length - 1} onClick={() => updateTeam(active.id, { playerIds: moveItem(active.playerIds, index, 1) })}>
                        아래
                      </button>
                      <button type="button" className="bb-btn-danger" onClick={() => updateTeam(active.id, { playerIds: active.playerIds.filter((id) => id !== userId) })}>
                        빼기
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
            {canEdit && !ended && !active.running && active.playerIds.length < RELAY_MAX_ROSTER && pool.length > 0 && (
              <div className="flex gap-2">
                <select className="bb-input" value={addUserId} onChange={(e) => setAddUserId(e.target.value)}>
                  <option value="">정회원 선택</option>
                  {pool.map((item) => (
                    <option key={item.userId} value={item.userId}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="bb-btn-ghost shrink-0"
                  disabled={!addUserId}
                  onClick={() => {
                    updateTeam(active.id, { playerIds: [...active.playerIds, addUserId] })
                    setAddUserId('')
                  }}
                >
                  추가
                </button>
              </div>
            )}
          </div>

          {active.logs.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted">성공·실패 기록</p>
              {active.logs.slice(-12).reverse().map((log, index) => (
                <p key={`${log.at}-${index}`} className="text-[11px] text-muted">
                  {log.name} · {RELAY_SPOTS.find((item) => item.id === log.spot)?.label} · {log.made ? `성공 +${log.points}` : '실패'}
                </p>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function clampMinutes(value?: number | null) {
  const n = Number(value || 3)
  return Math.min(10, Math.max(1, Number.isFinite(n) ? Math.round(n) : 3))
}

function moveItem(list: string[], index: number, delta: number) {
  const next = [...list]
  const target = index + delta
  if (target < 0 || target >= next.length) return list
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  return next
}
