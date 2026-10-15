import { useMemo, useState } from 'react'
import { saveClubGame, type ClubGame, type GameClubMember, type RsvpStatus } from '../clubGames'
import {
  activeEventPlayers,
  cycleEventShot,
  eventStanding,
  eventTypeMeta,
  gameEventBoard,
  isRegularClubRole,
  playerEventTotals,
  setMakes,
  setTaken,
  syncEventPlayers,
  type EventBoard,
  type EventPlayer,
} from '../clubEvents'

export default function EventContestBoard({
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
  const meta = eventTypeMeta(game.eventType)
  const regulars = members.filter((item) => isRegularClubRole(item.role))
  const going = regulars.filter((item) => rsvps[item.id] === 'going')
  const [saving, setSaving] = useState(false)
  const [addId, setAddId] = useState('')

  const board = useMemo(() => {
    const base = gameEventBoard(game)
    return syncEventPlayers(
      base,
      going.map((item) => ({ userId: item.id, name: item.name }))
    )
  }, [game, going])

  const persist = async (nextBoard: EventBoard) => {
    if (!canEdit) return
    setSaving(true)
    try {
      const next = await saveClubGame(
        {
          ...game,
          eventType: nextBoard.type,
          eventSetCount: nextBoard.setCount,
          eventAttemptCount: nextBoard.attemptCount,
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

  const setCurrentSet = (setNo: number) => {
    void persist({ ...board, currentSet: setNo })
  }

  const tapShot = (player: EventPlayer, attempt: number) => {
    if (!canEdit || player.eliminated) return
    const setIndex = board.currentSet - 1
    const nextPlayers = board.players.map((item) => {
      if (item.userId !== player.userId) return item
      const sets = item.sets.map((shots, index) =>
        index === setIndex ? shots.map((shot, shotIndex) => (shotIndex === attempt ? cycleEventShot(shot) : shot)) : shots
      )
      return { ...item, sets }
    })
    void persist({ ...board, players: nextPlayers })
  }

  const toggleOut = (player: EventPlayer) => {
    if (!canEdit) return
    void persist({
      ...board,
      players: board.players.map((item) => (item.userId === player.userId ? { ...item, eliminated: !item.eliminated } : item)),
    })
  }

  const addPlayer = () => {
    const person = regulars.find((item) => item.id === addId)
    if (!person) return
    if (board.players.some((item) => item.userId === person.id)) return
    void persist(
      syncEventPlayers(board, [
        ...board.players.map((item) => ({ userId: item.userId, name: item.name })),
        { userId: person.id, name: person.name },
      ])
    )
    setAddId('')
  }

  const standings = eventStanding(board)
  const eliminated = board.players.filter((item) => item.eliminated)
  const extras = regulars.filter((item) => !board.players.some((player) => player.userId === item.id))
  const setIndex = board.currentSet - 1

  return (
    <div className="space-y-3">
      <section className="bb-card p-4 space-y-2">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">이벤트 경기</p>
        <h3 className="text-sm font-semibold text-ink">
          {meta.label} · {board.setCount}셋트 · 셋트당 {board.attemptCount}회
        </h3>
        <p className="text-[11px] text-muted leading-relaxed">
          {meta.spot}에서 시도합니다. 정회원만 참가할 수 있으며, 탈락한 회원은 기록에서 제외됩니다.
        </p>
      </section>

      <section className="bb-card p-4 space-y-2">
        <p className="text-xs font-semibold tracking-wide text-muted uppercase">순위 · 진행 중</p>
        {standings.length === 0 ? (
          <p className="text-xs text-muted">참석한 정회원이 없습니다. 참여 여부에서 참석을 선택해 주세요.</p>
        ) : (
          standings.map((player, index) => {
            const total = playerEventTotals(player)
            return (
              <div key={player.userId} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted w-6">{index + 1}</span>
                <span className="flex-1 font-semibold text-ink truncate">{player.name}</span>
                <span className="text-[11px] text-muted">
                  {total.makes} / {total.taken} · {total.pct}%
                </span>
              </div>
            )
          })
        )}
      </section>

      <div className="grid grid-cols-5 gap-1.5">
        {Array.from({ length: board.setCount }, (_, index) => (
          <button
            key={index}
            type="button"
            className={`py-2 rounded-xl text-[11px] font-semibold border ${
              board.currentSet === index + 1 ? 'bg-navy text-white border-navy' : 'bg-white border-line text-muted'
            }`}
            onClick={() => setCurrentSet(index + 1)}
          >
            {index + 1}셋트
          </button>
        ))}
      </div>

      {activeEventPlayers(board).map((player) => {
        const shots = player.sets[setIndex] || []
        const total = playerEventTotals(player)
        return (
          <section key={player.userId} className="bb-card p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">{player.name}</p>
                <p className="text-[11px] text-muted">
                  이 셋트 {setMakes(shots)}/{setTaken(shots) || board.attemptCount} · 합계 {total.makes}/{total.taken}
                </p>
              </div>
              {canEdit && !ended && (
                <button type="button" className="bb-btn-danger" disabled={saving} onClick={() => toggleOut(player)}>
                  탈락 제외
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {shots.map((shot, attempt) => (
                <button
                  key={attempt}
                  type="button"
                  disabled={!canEdit || ended || saving}
                  onClick={() => tapShot(player, attempt)}
                  className={`w-9 h-9 rounded-lg text-xs font-semibold border ${
                    shot === true
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : shot === false
                        ? 'bg-rose-50 text-rose-700 border-rose-200'
                        : 'bg-white text-muted border-line'
                  }`}
                >
                  {shot === true ? 'O' : shot === false ? 'X' : attempt + 1}
                </button>
              ))}
            </div>
          </section>
        )
      })}

      {eliminated.length > 0 && (
        <section className="bb-card p-4 space-y-2">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">탈락 · 제외</p>
          {eliminated.map((player) => (
            <div key={player.userId} className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted line-through">{player.name}</p>
              {canEdit && !ended && (
                <button type="button" className="bb-btn-ghost text-xs py-2 px-3" disabled={saving} onClick={() => toggleOut(player)}>
                  복귀
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      {canEdit && !ended && extras.length > 0 && (
        <section className="bb-card p-4 space-y-2">
          <p className="text-xs font-semibold text-muted">정회원 참가자 추가</p>
          <div className="flex gap-2">
            <select className="bb-input" value={addId} onChange={(e) => setAddId(e.target.value)}>
              <option value="">회원 선택</option>
              {extras.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <button type="button" className="bb-btn-ghost shrink-0" disabled={!addId || saving} onClick={addPlayer}>
              추가
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
