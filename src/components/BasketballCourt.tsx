import type { CourtFormat, LineupPlayer } from '../teamDraft'

const SLOT_POS_5: Record<string, { x: number; y: number }> = {
  PG: { x: 100, y: 168 },
  SG: { x: 36, y: 132 },
  SF: { x: 164, y: 132 },
  PF: { x: 48, y: 78 },
  C: { x: 100, y: 52 },
}

const SLOT_POS_3: Record<string, { x: number; y: number }> = {
  '1': { x: 100, y: 150 },
  '2': { x: 42, y: 78 },
  '3': { x: 158, y: 78 },
}

export default function BasketballCourt({
  format,
  players,
  accent = '#c2410c',
}: {
  format: CourtFormat
  players: LineupPlayer[]
  accent?: string
}) {
  const slots = format === '3v3' ? SLOT_POS_3 : SLOT_POS_5
  const starters = players.filter((item) => item.isStarter)

  return (
    <svg viewBox="0 0 200 210" className="w-full h-auto rounded-2xl border border-line bg-[#c9783a]">
      <rect x="8" y="8" width="184" height="194" rx="8" fill="#b8612c" stroke="#f5e6d3" strokeWidth="2" />
      <rect x="62" y="8" width="76" height="58" fill="none" stroke="#f5e6d3" strokeWidth="1.6" />
      <circle cx="100" cy="66" r="22" fill="none" stroke="#f5e6d3" strokeWidth="1.6" />
      <path d="M28 202 A72 72 0 0 1 172 202" fill="none" stroke="#f5e6d3" strokeWidth="1.6" />
      <line x1="8" y1="202" x2="192" y2="202" stroke="#f5e6d3" strokeWidth="2" />
      <circle cx="100" cy="18" r="5" fill="#f8fafc" />
      {Object.entries(slots).map(([slot, pos]) => {
        const player = starters.find((item) => item.courtSlot === slot)
        return (
          <g key={slot}>
            <circle cx={pos.x} cy={pos.y} r="18" fill={player ? accent : 'rgba(15,23,42,0.25)'} stroke="#fff" strokeWidth="2" />
            <text x={pos.x} y={pos.y - 2} textAnchor="middle" fill="#fff" fontSize="7" fontWeight="700">
              {player ? (player.jersey != null ? `#${player.jersey}` : slot) : slot}
            </text>
            <text x={pos.x} y={pos.y + 9} textAnchor="middle" fill="#fff" fontSize="6.5" fontWeight="600">
              {player ? player.name.slice(0, 6) : '빈자리'}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
