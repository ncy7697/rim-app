import { useMemo, useState, type ReactNode } from 'react'
import {
  MAX_EXCHANGE_SERIES,
  addExchangeSeriesGame,
  packThreeTeamClock,
  parseThreeTeamClock,
  quarterLabel,
  readScoreSeries,
  readScoreSlot,
  recordGameStat,
  roundTotal,
  saveClubGame,
  selectExchangeSeriesGame,
  seriesWins,
  totalScore,
  visibleQuarters,
  type ClubGame,
  type PlayerStat,
  type ScoreSide,
  type ScoreSeries,
  type StatKind,
} from '../clubGames'
import { THREE_TEAM_ROUNDS, threeTeamMatchup, type RotationEntry, type RotationTeam } from '../teamDraft'

function RosterFold({
  title,
  count,
  children,
}: {
  title: string
  count?: number
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="bb-card p-4 space-y-2">
      <button type="button" className="w-full flex items-center justify-between gap-2 text-left cursor-pointer" onClick={() => setOpen((value) => !value)}>
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">{title}</p>
        <span className="text-[11px] font-semibold text-navy shrink-0">
          {open ? '접기' : count != null ? `펼치기 · ${count}명` : '펼치기'}
        </span>
      </button>
      {open && children}
    </div>
  )
}

const ACTIONS: { kind: StatKind; label: string }[] = [
  { kind: 'pt1', label: '+1' },
  { kind: 'pt2', label: '+2' },
  { kind: 'pt3', label: '+3' },
  { kind: 'ptm1', label: '-1' },
  { kind: 'foul', label: '파울' },
  { kind: 'reb', label: '리바' },
  { kind: 'ast', label: '어시' },
  { kind: 'stl', label: '스틸' },
  { kind: 'blk', label: '블록' },
]

export default function GameScoreboard({
  game,
  stats,
  canEdit,
  ended,
  rotation,
  onChange,
}: {
  game: ClubGame
  stats: PlayerStat[]
  canEdit: boolean
  ended?: boolean
  rotation: RotationTeam[]
  onChange: (game: ClubGame, stats: PlayerStat[]) => void
}) {
  if (ended) {
    return (
      <div className="space-y-3">
        <FinishedScoreSheet game={game} rotation={rotation} />
        <RosterFold title="선수 기록" count={stats.length || rotation.reduce((sum, team) => sum + team.ordered.length, 0)}>
          <FinishedPlayerList rotation={rotation} stats={stats} />
        </RosterFold>
      </div>
    )
  }

  const tap = async (kind: StatKind, team: ScoreSide, player?: { playerKey: string; userId?: string; name: string }) => {
    if (!canEdit) return
    const next = await recordGameStat(game, { kind, team, player })
    onChange(next.game, next.stats)
  }

  const setPeriod = async (period: number) => {
    if (!canEdit) return
    const next = await saveClubGame({ ...game, currentQuarter: period, isLive: true }, null)
    onChange(next, stats)
  }

  const setSeriesGame = async (next: ClubGame) => {
    if (!canEdit) return
    const saved = await saveClubGame(next, null)
    onChange(saved, stats)
  }

  if (rotation.length === 3) {
    return (
      <ThreeTeamBoard
        game={game}
        stats={stats}
        canEdit={canEdit}
        rotation={rotation}
        onTap={tap}
        onRound={setPeriod}
      />
    )
  }

  return (
    <TwoTeamBoard
      game={game}
      stats={stats}
      canEdit={canEdit}
      rotation={rotation}
      onTap={tap}
      onQuarter={setPeriod}
      onSeries={setSeriesGame}
    />
  )
}

function ExchangeSeriesBar({
  game,
  series,
  canEdit,
  onSelect,
  onAdd,
}: {
  game: ClubGame
  series: ScoreSeries
  canEdit: boolean
  onSelect: (index: number) => void
  onAdd?: () => void
}) {
  const quarterCount = game.quarterCount || 4
  const wins = seriesWins(series, quarterCount)
  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-white/55">
          {series.boards.length}경기
          {series.boards.length > 1 ? ` · 시리즈 ${wins.home}-${wins.away}` : ''}
        </p>
        {canEdit && onAdd && series.boards.length < MAX_EXCHANGE_SERIES && (
          <button
            type="button"
            className="rounded-full bg-brand px-2.5 py-1 text-[11px] font-bold text-white"
            onClick={onAdd}
          >
            게임 추가
          </button>
        )}
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {series.boards.map((board, index) => {
          const home = totalScore(board.scores, 'h', quarterCount)
          const away = totalScore(board.scores, 'a', quarterCount)
          const active = index === series.active
          return (
            <button
              key={index}
              type="button"
              onClick={() => onSelect(index)}
              className={`shrink-0 rounded-xl px-3 py-2 text-left ${
                active ? 'bg-white text-navy' : 'bg-slate-800 text-slate-100'
              }`}
            >
              <span className="block text-[10px] font-bold">{index + 1}경기</span>
              <span className="block text-sm font-black tabular-nums">
                {home}-{away}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function PlayerCard({
  player,
  team,
  stats,
  maxPts,
  canEdit,
  onTap,
}: {
  player: RotationEntry
  team: ScoreSide
  stats: PlayerStat[]
  maxPts: number
  canEdit: boolean
  onTap: (kind: StatKind, team: ScoreSide, player?: { playerKey: string; userId?: string; name: string }) => Promise<void>
}) {
  const row = stats.find((item) => item.playerKey === player.key)
  return (
    <div className="border border-line rounded-xl p-3 space-y-2">
      <div className="flex justify-between gap-2">
        <p className="text-sm font-semibold">
          {player.order}번 {player.name}
        </p>
        <p className="text-sm font-black tabular-nums text-navy">{row?.pts || 0}점</p>
      </div>
      <div className="h-1.5 bg-canvas rounded-full overflow-hidden">
        <div className="h-full bg-navy" style={{ width: `${((row?.pts || 0) / maxPts) * 100}%` }} />
      </div>
      <p className="text-[11px] text-muted">
        파울 {row?.foul || 0} · 리바 {row?.reb || 0} · 어시 {row?.ast || 0} · 스틸 {row?.stl || 0} · 블록 {row?.blk || 0}
      </p>
      {canEdit && (
        <div className="grid grid-cols-4 gap-1">
          {ACTIONS.map((item) => (
            <button
              key={item.kind}
              type="button"
              className={`py-1.5 rounded-lg bg-canvas text-[10px] font-semibold ${item.kind === 'ptm1' ? 'text-brand' : ''}`}
              onClick={() =>
                void onTap(item.kind, team, {
                  playerKey: player.key,
                  userId: player.userId,
                  name: player.name,
                })
              }
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function TwoTeamBoard({
  game,
  stats,
  canEdit,
  rotation,
  onTap,
  onQuarter,
  onSeries,
}: {
  game: ClubGame
  stats: PlayerStat[]
  canEdit: boolean
  rotation: RotationTeam[]
  onTap: (kind: StatKind, team: ScoreSide, player?: { playerKey: string; userId?: string; name: string }) => Promise<void>
  onQuarter: (quarter: number) => Promise<void>
  onSeries: (game: ClubGame) => Promise<void>
}) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null)
  const series = readScoreSeries(game)
  const shown = useMemo(() => {
    if (canEdit || previewIndex == null || previewIndex === series.active) return game
    return selectExchangeSeriesGame(game, previewIndex)
  }, [canEdit, game, previewIndex, series.active])
  const home = totalScore(shown.scores, 'h', shown.quarterCount || 4)
  const away = totalScore(shown.scores, 'a', shown.quarterCount || 4)
  const maxPts = Math.max(1, ...stats.map((item) => item.pts))
  const quarters = visibleQuarters(shown.quarterCount || 4)
  const allowSeries = game.matchKind === 'exchange'
  const displaySeries =
    !canEdit && previewIndex != null ? { ...series, active: previewIndex } : series
  const currentOnCourt = rotation.flatMap((team) =>
    (team.byQuarter[shown.currentQuarter] || []).map((player) => ({ ...player, team: team.team as ScoreSide }))
  )

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-navy p-5 text-white shadow-[0_8px_24px_rgba(15,23,42,0.28)]">
        <div className="flex items-center justify-between mb-4">
          <span
            className={`text-[11px] font-bold tracking-[0.14em] uppercase ${
              game.isLive ? 'text-amber-300' : 'text-slate-300'
            }`}
          >
            {game.isLive ? '● LIVE' : '스코어보드'}
          </span>
          <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-bold text-navy">
            {allowSeries && displaySeries.boards.length > 1 ? `${displaySeries.active + 1}경기 · ` : ''}
            {quarterLabel(shown.currentQuarter, shown.quarterCount || 4)}
          </span>
        </div>
        {allowSeries && (
          <ExchangeSeriesBar
            game={shown}
            series={displaySeries}
            canEdit={canEdit}
            onSelect={(index) => {
              if (canEdit) void onSeries(selectExchangeSeriesGame(game, index))
              else setPreviewIndex(index)
            }}
            onAdd={() => void onSeries(addExchangeSeriesGame(game))}
          />
        )}
        <div className="grid grid-cols-3 items-end text-center gap-2">
          <div>
            <p className="text-5xl font-black tabular-nums leading-none tracking-tight text-white drop-shadow-sm">{home}</p>
            <p className="mt-2 text-xs font-bold text-amber-200">{game.homeName}</p>
          </div>
          <p className="pb-2 text-sm font-black text-slate-400">VS</p>
          <div>
            <p className="text-5xl font-black tabular-nums leading-none tracking-tight text-white drop-shadow-sm">{away}</p>
            <p className="mt-2 text-xs font-bold text-sky-200">{game.awayName}</p>
          </div>
        </div>
        <div className={`grid gap-1.5 mt-5 ${quarters.length === 3 ? 'grid-cols-3' : 'grid-cols-5'}`}>
          {quarters.map((quarter) => (
            <button
              key={quarter}
              type="button"
              disabled={!canEdit}
              onClick={() => void onQuarter(quarter)}
              className={`rounded-xl py-2.5 text-[11px] font-bold ${
                shown.currentQuarter === quarter ? 'bg-brand text-white shadow-sm' : 'bg-slate-800 text-slate-100'
              }`}
            >
              {quarterLabel(quarter, shown.quarterCount || 4)}
              <span className="block text-sm font-black tabular-nums mt-0.5 text-white">
                {shown.scores[String(quarter)]?.h || 0}-{shown.scores[String(quarter)]?.a || 0}
              </span>
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3 text-xs font-bold">
          <p className="rounded-xl bg-slate-800 py-2.5 text-center text-amber-100">
            {shown.homeName} 파울 {shown.fouls[String(shown.currentQuarter)]?.h || 0}
          </p>
          <p className="rounded-xl bg-slate-800 py-2.5 text-center text-sky-100">
            {shown.awayName} 파울 {shown.fouls[String(shown.currentQuarter)]?.a || 0}
          </p>
        </div>
      </div>

      {canEdit && (
        <div className="bb-card p-4 space-y-3">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide">
            터치 기록 · {quarterLabel(game.currentQuarter, game.quarterCount || 4)}
          </p>
          {(['h', 'a'] as ScoreSide[]).map((side) => (
            <div key={side} className="space-y-2">
              <p className="text-sm font-semibold">{side === 'h' ? game.homeName : game.awayName}</p>
              <div className="grid grid-cols-4 gap-1.5">
                {ACTIONS.map((item) => (
                  <button
                    key={item.kind}
                    type="button"
                    className={`bb-btn-ghost py-2 text-[11px] ${item.kind === 'ptm1' ? 'text-brand' : ''}`}
                    onClick={() => void onTap(item.kind, side)}
                  >
                    {item.label}
                  </button>
                ))}
                <button type="button" className="bb-btn-ghost py-2 text-[11px]" onClick={() => void onTap('tfoul', side)}>
                  팀파울
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <RosterFold title="쿼터별 출전 · 순번" count={rotation.reduce((sum, team) => sum + team.ordered.length, 0)}>
        {rotation.length === 0 && <p className="text-xs text-muted">참석자가 없습니다. 참여 여부를 먼저 선택해 주세요.</p>}
        {rotation.map((team) => (
          <div key={team.label} className="space-y-2">
            {rotation.length > 1 && <p className="text-sm font-semibold">{team.label}</p>}
            {quarters.map((quarter) => {
              const onCourt = team.byQuarter[quarter] || []
              const active = quarter === shown.currentQuarter
              return (
                <div
                  key={`${team.label}-${quarter}`}
                  className={`rounded-xl px-3 py-2 ${active ? 'bg-navy text-white' : 'bg-canvas'}`}
                >
                  <p className={`text-[11px] font-semibold mb-1 ${active ? 'text-white/70' : 'text-muted'}`}>
                    {quarterLabel(quarter, shown.quarterCount || 4)}
                    {active ? ' · 현재' : ''}
                  </p>
                  <p className={`text-xs font-medium leading-relaxed ${active ? 'text-white' : 'text-ink'}`}>
                    {onCourt.length
                      ? onCourt.map((player) => `${player.order}번 ${player.name}`).join(' · ')
                      : '출전 인원이 없습니다.'}
                  </p>
                </div>
              )
            })}
          </div>
        ))}
      </RosterFold>

      <RosterFold
        title={`선수 기록 · ${quarterLabel(shown.currentQuarter, shown.quarterCount || 4)} 순번`}
        count={currentOnCourt.length}
      >
        {allowSeries && series.boards.length > 1 && (
          <p className="text-[11px] text-muted">선수 기록은 전 경기 합산입니다. 팀 스코어는 경기별로 유지됩니다.</p>
        )}
        {currentOnCourt.length === 0 && <p className="text-xs text-muted">이 쿼터 출전 선수가 없습니다.</p>}
        {currentOnCourt.map((player) => (
          <PlayerCard
            key={player.key}
            player={player}
            team={player.team}
            stats={stats}
            maxPts={maxPts}
            canEdit={canEdit}
            onTap={onTap}
          />
        ))}
      </RosterFold>
    </div>
  )
}

function ThreeTeamBoard({
  game,
  stats,
  canEdit,
  rotation,
  onTap,
  onRound,
}: {
  game: ClubGame
  stats: PlayerStat[]
  canEdit: boolean
  rotation: RotationTeam[]
  onTap: (kind: StatKind, team: ScoreSide, player?: { playerKey: string; userId?: string; name: string }) => Promise<void>
  onRound: (round: number) => Promise<void>
}) {
  const quarterCount = game.quarterCount || 4
  const clock = parseThreeTeamClock(game.currentQuarter, quarterCount)
  const quarters = visibleQuarters(quarterCount)
  const match = threeTeamMatchup(clock.round)
  const homeTeam = rotation[match.home]
  const awayTeam = rotation[match.away]
  const restTeam = rotation[match.rest]
  const homeScore = roundTotal(game.scores, clock.round, 'h', quarterCount)
  const awayScore = roundTotal(game.scores, clock.round, 'a', quarterCount)
  const maxPts = Math.max(1, ...stats.map((item) => item.pts))
  const playingPlayers = [
    ...(homeTeam.byQuarter[clock.quarter] || homeTeam.ordered).map((player) => ({ ...player, team: 'h' as ScoreSide })),
    ...(awayTeam.byQuarter[clock.quarter] || awayTeam.ordered).map((player) => ({ ...player, team: 'a' as ScoreSide })),
  ]
  const goRound = (nextRound: number) => onRound(packThreeTeamClock(nextRound, clock.quarter))
  const goQuarter = (nextQuarter: number) => onRound(packThreeTeamClock(clock.round, nextQuarter))

  return (
    <div className="space-y-3">
      <section className="rounded-2xl bg-navy p-5 text-white shadow-[0_8px_24px_rgba(15,23,42,0.28)] space-y-4">
        <div className="flex items-center justify-between">
          <span
            className={`text-[11px] font-bold tracking-[0.14em] uppercase ${
              game.isLive ? 'text-amber-300' : 'text-slate-300'
            }`}
          >
            {game.isLive ? '● LIVE' : '3팀 롤테이션'}
          </span>
          <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-navy">
            {clock.round}라운드 · {quarterLabel(clock.quarter, quarterCount)}
          </span>
        </div>

        <p className="text-center text-[11px] font-semibold tracking-wide text-white/50 uppercase">현재 경기</p>
        <div className="grid grid-cols-3 items-center text-center gap-1">
          <div>
            <p className="text-[13px] font-black text-amber-200 leading-tight">{homeTeam.label}</p>
            <p className="mt-2 text-5xl font-black tabular-nums leading-none">{homeScore}</p>
            <p className="mt-2 text-[11px] font-bold text-amber-100/80">
              파울 {readScoreSlot(game.fouls, clock.round, clock.quarter).h}
            </p>
          </div>
          <p className="text-lg font-black text-slate-400">VS</p>
          <div>
            <p className="text-[13px] font-black text-sky-200 leading-tight">{awayTeam.label}</p>
            <p className="mt-2 text-5xl font-black tabular-nums leading-none">{awayScore}</p>
            <p className="mt-2 text-[11px] font-bold text-sky-100/80">
              파울 {readScoreSlot(game.fouls, clock.round, clock.quarter).a}
            </p>
          </div>
        </div>
        <div className={`grid gap-1.5 ${quarters.length === 3 ? 'grid-cols-3' : 'grid-cols-5'}`}>
          {quarters.map((quarter) => {
            const slot = readScoreSlot(game.scores, clock.round, quarter)
            return (
              <button
                key={quarter}
                type="button"
                disabled={!canEdit}
                onClick={() => void goQuarter(quarter)}
                className={`rounded-xl py-2.5 text-[11px] font-bold ${
                  clock.quarter === quarter ? 'bg-brand text-white shadow-sm' : 'bg-slate-800 text-slate-100'
                }`}
              >
                {quarterLabel(quarter, quarterCount)}
                <span className="block text-sm font-black tabular-nums mt-0.5 text-white">
                  {slot.h}-{slot.a}
                </span>
              </button>
            )
          })}
        </div>
        <p className="text-center text-[11px] text-white/50">
          이 라운드는 {quarterCount}쿼터제로 진행합니다. 점수는 라운드 합계입니다.
        </p>
      </section>

      <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 px-5 py-4 space-y-2">
        <p className="text-[11px] font-bold tracking-[0.16em] uppercase text-amber-800">휴식</p>
        <p className="text-2xl font-black text-ink">{restTeam.label}</p>
        <p className="text-sm text-amber-900/80">이번 라운드는 경기에 나가지 않습니다.</p>
        <p className="text-xs font-medium text-ink/80 leading-relaxed">
          {restTeam.ordered.length
            ? restTeam.ordered.map((player) => `${player.order}번 ${player.name}`).join(' · ')
            : '등록된 선수가 없습니다.'}
        </p>
      </section>

      <div className="grid grid-cols-3 gap-1.5">
        {THREE_TEAM_ROUNDS.map((item) => {
          const slot = threeTeamMatchup(item)
          const active = item === clock.round
          return (
            <button
              key={item}
              type="button"
              disabled={!canEdit}
              onClick={() => void goRound(item)}
              className={`rounded-xl py-2.5 px-1 text-[11px] font-bold ${
                active ? 'bg-navy text-white' : 'bg-white border border-line text-ink'
              }`}
            >
              {item}라운드
              <span className={`block text-[10px] font-medium mt-0.5 ${active ? 'text-white/70' : 'text-muted'}`}>
                {rotation[slot.home].label.replace('팀', '')} vs {rotation[slot.away].label.replace('팀', '')}
              </span>
            </button>
          )
        })}
      </div>

      <section className="bb-card p-4 space-y-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">라운드 일정</p>
        {THREE_TEAM_ROUNDS.map((item) => {
          const slot = threeTeamMatchup(item)
          const active = item === clock.round
          return (
            <button
              key={`schedule-${item}`}
              type="button"
              disabled={!canEdit}
              onClick={() => void goRound(item)}
              className={`w-full text-left rounded-xl px-3 py-2.5 ${active ? 'bg-navy text-white' : 'bg-canvas'}`}
            >
              <p className={`text-[11px] font-semibold ${active ? 'text-white/70' : 'text-muted'}`}>{item}라운드</p>
              <p className="text-sm font-bold mt-0.5">
                경기 {rotation[slot.home].label} vs {rotation[slot.away].label}
              </p>
              <p className={`text-xs mt-0.5 ${active ? 'text-amber-200' : 'text-amber-800'}`}>
                휴식 {rotation[slot.rest].label} · {quarterCount}쿼터
              </p>
            </button>
          )
        })}
      </section>

      {canEdit && (
        <div className="bb-card p-4 space-y-3">
          <p className="text-xs font-semibold text-muted uppercase tracking-wide">
            터치 기록 · {clock.round}라운드 {quarterLabel(clock.quarter, quarterCount)}
          </p>
          {([
            ['h', homeTeam.label],
            ['a', awayTeam.label],
          ] as const).map(([side, label]) => (
            <div key={side} className="space-y-2">
              <p className="text-sm font-semibold">{label}</p>
              <div className="grid grid-cols-4 gap-1.5">
                {ACTIONS.map((item) => (
                  <button
                    key={item.kind}
                    type="button"
                    className={`bb-btn-ghost py-2 text-[11px] ${item.kind === 'ptm1' ? 'text-brand' : ''}`}
                    onClick={() => void onTap(item.kind, side)}
                  >
                    {item.label}
                  </button>
                ))}
                <button type="button" className="bb-btn-ghost py-2 text-[11px]" onClick={() => void onTap('tfoul', side)}>
                  팀파울
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <RosterFold
        title={`출전 선수 · ${homeTeam.label} vs ${awayTeam.label} · ${quarterLabel(clock.quarter, quarterCount)}`}
        count={playingPlayers.length}
      >
        {playingPlayers.length === 0 && <p className="text-xs text-muted">출전 선수가 없습니다.</p>}
        {playingPlayers.map((player) => (
          <PlayerCard
            key={`${player.team}-${player.key}`}
            player={player}
            team={player.team}
            stats={stats}
            maxPts={maxPts}
            canEdit={canEdit}
            onTap={onTap}
          />
        ))}
      </RosterFold>
    </div>
  )
}

function scoreOutcome(home: number, away: number) {
  if (home > away) return 'home'
  if (away > home) return 'away'
  return 'draw'
}

function FinishedScoreSheet({ game, rotation }: { game: ClubGame; rotation: RotationTeam[] }) {
  const quarterCount = game.quarterCount || 4
  const quarters = visibleQuarters(quarterCount)
  const threeTeam = rotation.length === 3

  if (threeTeam) {
    return (
      <section className="space-y-3">
        <div className="rounded-2xl bg-navy px-5 py-4 text-white">
          <p className="text-[11px] font-bold tracking-[0.16em] uppercase text-white/50">경기 결과</p>
          <p className="text-lg font-black mt-1">3팀 롤테이션 · {quarterCount}쿼터</p>
          <p className="text-[11px] text-white/55 mt-1">라운드마다 2팀이 경기하고 1팀이 쉽니다.</p>
        </div>
        {THREE_TEAM_ROUNDS.map((round) => {
          const match = threeTeamMatchup(round)
          const homeTeam = rotation[match.home]
          const awayTeam = rotation[match.away]
          const restTeam = rotation[match.rest]
          const home = roundTotal(game.scores, round, 'h', quarterCount)
          const away = roundTotal(game.scores, round, 'a', quarterCount)
          const win = scoreOutcome(home, away)
          return (
            <article key={round} className="bb-card overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-line bg-canvas">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{round}라운드</p>
                  <p className="text-sm font-bold text-ink mt-0.5">
                    {homeTeam.label} vs {awayTeam.label}
                  </p>
                </div>
                <p className="text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
                  휴식 {restTeam.label}
                </p>
              </div>
              <div className="px-4 py-3 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <p className={`text-xs font-semibold ${win === 'home' ? 'text-navy' : 'text-muted'}`}>{homeTeam.label}</p>
                  <p className="text-3xl font-black tabular-nums text-ink leading-none mt-1">{home}</p>
                </div>
                <p className="pb-1 text-xs font-black text-muted">VS</p>
                <div className="min-w-0 text-right">
                  <p className={`text-xs font-semibold ${win === 'away' ? 'text-navy' : 'text-muted'}`}>{awayTeam.label}</p>
                  <p className="text-3xl font-black tabular-nums text-ink leading-none mt-1">{away}</p>
                </div>
              </div>
              <QuarterBoxTable
                quarters={quarters}
                quarterCount={quarterCount}
                homeName={homeTeam.label}
                awayName={awayTeam.label}
                homeTotal={home}
                awayTotal={away}
                value={(quarter, side) => readScoreSlot(game.scores, round, quarter)[side]}
              />
            </article>
          )
        })}
      </section>
    )
  }

  const series = readScoreSeries(game)
  const boards = game.matchKind === 'exchange' ? series.boards : [series.boards[series.active] || series.boards[0]]

  if (game.matchKind === 'exchange') {
    return <ExchangeFinishedSeriesSheet game={game} boards={boards} quarterCount={quarterCount} quarters={quarters} />
  }

  const home = totalScore(boards[0].scores, 'h', quarterCount)
  const away = totalScore(boards[0].scores, 'a', quarterCount)
  const win = scoreOutcome(home, away)

  return (
    <article className="bb-card overflow-hidden">
      <div className="bg-navy px-5 py-4 text-white">
        <p className="text-[11px] font-bold tracking-[0.16em] uppercase text-white/50">경기 결과</p>
        <p className="text-lg font-black mt-1">{quarterCount}쿼터 최종</p>
        <div className="grid grid-cols-3 items-end text-center gap-2 mt-4">
          <div>
            <p className={`text-[11px] font-bold ${win === 'home' ? 'text-amber-200' : 'text-white/50'}`}>{game.homeName}</p>
            <p className="text-4xl font-black tabular-nums leading-none mt-1">{home}</p>
          </div>
          <p className="pb-1 text-sm font-black text-slate-400">VS</p>
          <div>
            <p className={`text-[11px] font-bold ${win === 'away' ? 'text-sky-200' : 'text-white/50'}`}>{game.awayName}</p>
            <p className="text-4xl font-black tabular-nums leading-none mt-1">{away}</p>
          </div>
        </div>
      </div>
      <QuarterBoxTable
        quarters={quarters}
        quarterCount={quarterCount}
        homeName={game.homeName}
        awayName={game.awayName}
        homeTotal={home}
        awayTotal={away}
        value={(quarter, side) => readScoreSlot(boards[0].scores, null, quarter)[side]}
      />
    </article>
  )
}

function ExchangeFinishedSeriesSheet({
  game,
  boards,
  quarterCount,
  quarters,
}: {
  game: ClubGame
  boards: ScoreSeries['boards']
  quarterCount: 2 | 4
  quarters: number[]
}) {
  const wins = seriesWins({ active: 0, boards }, quarterCount)
  const seriesWin = scoreOutcome(wins.home, wins.away)
  return (
    <section className="space-y-3">
      <div className="rounded-2xl bg-navy px-5 py-4 text-white">
        <p className="text-[11px] font-bold tracking-[0.16em] uppercase text-white/50">교류전 결과</p>
        <p className="text-lg font-black mt-1">
          {boards.length}경기 · {quarterCount}쿼터
        </p>
        <div className="grid grid-cols-3 items-end text-center gap-2 mt-4">
          <div>
            <p className={`text-[11px] font-bold ${seriesWin === 'home' ? 'text-amber-200' : 'text-white/50'}`}>{game.homeName}</p>
            <p className="text-4xl font-black tabular-nums leading-none mt-1">{wins.home}</p>
            <p className="mt-1 text-[11px] font-semibold text-white/60">승</p>
          </div>
          <p className="pb-4 text-sm font-black text-slate-400">시리즈</p>
          <div>
            <p className={`text-[11px] font-bold ${seriesWin === 'away' ? 'text-sky-200' : 'text-white/50'}`}>{game.awayName}</p>
            <p className="text-4xl font-black tabular-nums leading-none mt-1">{wins.away}</p>
            <p className="mt-1 text-[11px] font-semibold text-white/60">승</p>
          </div>
        </div>
        <div className="mt-4 flex gap-1.5 overflow-x-auto">
          {boards.map((board, index) => {
            const home = totalScore(board.scores, 'h', quarterCount)
            const away = totalScore(board.scores, 'a', quarterCount)
            const win = scoreOutcome(home, away)
            return (
              <p key={index} className="shrink-0 rounded-xl bg-slate-800 px-3 py-2 text-[11px] font-bold">
                {index + 1}경기{' '}
                <span className="tabular-nums text-white">
                  <span className={win === 'home' ? 'text-amber-200' : ''}>{home}</span>
                  -
                  <span className={win === 'away' ? 'text-sky-200' : ''}>{away}</span>
                </span>
              </p>
            )
          })}
        </div>
      </div>

      <article className="bb-card overflow-hidden">
        <div className="px-4 py-3 border-b border-line bg-canvas">
          <p className="text-sm font-bold">전 경기 쿼터 점수</p>
          <p className="text-[11px] text-muted mt-0.5">모든 게임의 쿼터별 득점을 한 표에서 확인합니다. 가로로 밀어 보세요.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-max min-w-full text-center border-collapse">
            <thead>
              <tr className="bg-canvas text-[10px] font-semibold uppercase tracking-wide text-muted">
                <th className="sticky left-0 z-10 bg-canvas px-2.5 py-2 text-left font-semibold min-w-[4.5rem]">팀</th>
                {boards.map((_, index) => (
                  <th
                    key={`g-${index}`}
                    colSpan={quarters.length + 1}
                    className={`px-1 py-2 ${index % 2 ? 'bg-canvas' : ''}`}
                  >
                    {index + 1}경기
                  </th>
                ))}
              </tr>
              <tr className="bg-white text-[10px] font-semibold text-muted">
                <th className="sticky left-0 z-10 bg-white px-2.5 py-2" />
                {boards.map((_, index) =>
                  quarters.map((quarter) => (
                    <th key={`${index}-${quarter}`} className={`px-1.5 py-2 min-w-[2.25rem] ${index % 2 ? 'bg-canvas/70' : ''}`}>
                      {quarterLabel(quarter, quarterCount)}
                    </th>
                  )).concat(
                    <th key={`${index}-sum`} className={`px-2 py-2 text-navy min-w-[2.5rem] ${index % 2 ? 'bg-canvas/70' : ''}`}>
                      합
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['h', game.homeName, seriesWin === 'home'] as const,
                  ['a', game.awayName, seriesWin === 'away'] as const,
                ]
              ).map(([side, name, seriesWinner]) => (
                <tr key={side} className="border-t border-line">
                  <td className={`sticky left-0 z-10 bg-white px-2.5 py-2.5 text-left text-[12px] font-bold ${seriesWinner ? 'text-navy' : 'text-ink'}`}>
                    {name}
                    {seriesWinner ? <span className="ml-1 text-[10px] font-semibold text-brand">승</span> : null}
                  </td>
                  {boards.map((board, index) => {
                    const total = totalScore(board.scores, side, quarterCount)
                    const other = totalScore(board.scores, side === 'h' ? 'a' : 'h', quarterCount)
                    const gameWin = side === 'h' ? scoreOutcome(total, other) === 'home' : scoreOutcome(other, total) === 'away'
                    return quarters.map((quarter) => (
                      <td
                        key={`${side}-${index}-${quarter}`}
                        className={`px-1.5 py-2.5 text-sm font-black tabular-nums text-ink ${index % 2 ? 'bg-canvas/50' : ''}`}
                      >
                        {readScoreSlot(board.scores, null, quarter)[side]}
                      </td>
                    )).concat(
                      <td
                        key={`${side}-${index}-sum`}
                        className={`px-2 py-2.5 text-sm font-black tabular-nums ${gameWin ? 'text-navy' : 'text-ink'} ${index % 2 ? 'bg-canvas/80' : 'bg-canvas/40'}`}
                      >
                        {total}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  )
}

function QuarterBoxTable({
  quarters,
  quarterCount,
  homeName,
  awayName,
  homeTotal,
  awayTotal,
  value,
}: {
  quarters: number[]
  quarterCount: 2 | 4
  homeName: string
  awayName: string
  homeTotal: number
  awayTotal: number
  value: (quarter: number, side: ScoreSide) => number
}) {
  const win = scoreOutcome(homeTotal, awayTotal)
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[280px] text-center border-collapse">
        <thead>
          <tr className="bg-canvas text-[10px] font-semibold uppercase tracking-wide text-muted">
            <th className="px-2 py-2 text-left font-semibold">팀</th>
            {quarters.map((quarter) => (
              <th key={quarter} className="px-1.5 py-2">
                {quarterLabel(quarter, quarterCount)}
              </th>
            ))}
            <th className="px-2 py-2 text-navy">합계</th>
          </tr>
        </thead>
        <tbody>
          {(
            [
              ['h', homeName, homeTotal, win === 'home'] as const,
              ['a', awayName, awayTotal, win === 'away'] as const,
            ]
          ).map(([side, name, total, winner]) => (
            <tr key={side} className="border-t border-line">
              <td className={`px-2 py-2.5 text-left text-[12px] font-bold ${winner ? 'text-navy' : 'text-ink'}`}>
                {name}
                {winner ? <span className="ml-1 text-[10px] font-semibold text-brand">승</span> : null}
              </td>
              {quarters.map((quarter) => (
                <td key={quarter} className="px-1.5 py-2.5 text-sm font-black tabular-nums text-ink">
                  {value(quarter, side)}
                </td>
              ))}
              <td className="px-2 py-2.5 text-sm font-black tabular-nums text-navy bg-canvas/80">{total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function FinishedPlayerList({ rotation, stats }: { rotation: RotationTeam[]; stats: PlayerStat[] }) {
  const rows = rotation.flatMap((team) =>
    team.ordered.map((player) => {
      const row = stats.find((item) => item.playerKey === player.key)
      return { ...player, label: team.label, pts: row?.pts || 0, foul: row?.foul || 0, reb: row?.reb || 0, ast: row?.ast || 0 }
    })
  )
  if (!rows.length && !stats.length) {
    return <p className="text-xs text-muted">기록된 선수가 없습니다.</p>
  }
  const list = rows.length
    ? rows.sort((a, b) => b.pts - a.pts || a.order - b.order)
    : stats.map((item) => ({
        key: item.playerKey,
        name: item.name,
        order: 0,
        label: item.team === 'a' ? '상대' : '홈',
        pts: item.pts,
        foul: item.foul,
        reb: item.reb,
        ast: item.ast,
      }))
  return (
    <div className="overflow-hidden rounded-xl border border-line">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-canvas text-[10px] font-semibold uppercase tracking-wide text-muted">
            <th className="px-2.5 py-2">선수</th>
            <th className="px-2 py-2 text-right">득점</th>
            <th className="px-2 py-2 text-right">파울</th>
            <th className="px-2 py-2 text-right">리바</th>
            <th className="px-2 py-2 text-right">어시</th>
          </tr>
        </thead>
        <tbody>
          {list.map((player) => (
            <tr key={player.key} className="border-t border-line">
              <td className="px-2.5 py-2">
                <p className="text-[13px] font-semibold">
                  {player.order ? `${player.order}번 ` : ''}
                  {player.name}
                </p>
                <p className="text-[10px] text-muted">{player.label}</p>
              </td>
              <td className="px-2 py-2 text-right text-sm font-black tabular-nums text-navy">{player.pts}</td>
              <td className="px-2 py-2 text-right text-xs tabular-nums">{player.foul}</td>
              <td className="px-2 py-2 text-right text-xs tabular-nums">{player.reb}</td>
              <td className="px-2 py-2 text-right text-xs tabular-nums">{player.ast}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
