export type TacticCategory = 'motion' | 'action' | 'set' | 'special'

export type GameTactic = {
  id: string
  name: string
  category: TacticCategory
  categoryLabel: string
  summary: string
  difficulty: 1 | 2 | 3 | 4 | 5
}

export const GAME_TACTICS: GameTactic[] = [
  {
    id: '5-out-motion',
    name: '5-Out Motion',
    category: 'motion',
    categoryLabel: '동적 공격',
    summary: '5명 전원이 3점선 밖에 배치해 페인트를 비우고, 패스-컷-필과 돌파-킥 규칙으로 계속 움직이는 기본 공격입니다.',
    difficulty: 2,
  },
  {
    id: '4-out-1-in-motion',
    name: '4-Out 1-In Motion',
    category: 'motion',
    categoryLabel: '동적 공격',
    summary: '1명은 내부, 4명은 외곽에서 움직여 안팎 연계 공간을 만드는 공격입니다.',
    difficulty: 3,
  },
  {
    id: 'flex-offense',
    name: 'Flex Offense',
    category: 'motion',
    categoryLabel: '동적 공격',
    summary: '베이스라인 플렉스 스크린 뒤에 다운 스크린이 이어지는, 스크린하는 사람을 다시 스크린하는 연속 공격입니다.',
    difficulty: 4,
  },
  {
    id: 'shuffle-offense',
    name: 'Shuffle Offense',
    category: 'motion',
    categoryLabel: '동적 공격',
    summary: '엘보 지역 백스크린으로 외곽 선수를 골밑으로 보내고, 스크린 설정자는 다운 스크린으로 올라오는 연속 공격입니다.',
    difficulty: 4,
  },
  {
    id: 'swing-offense',
    name: 'Swing Offense',
    category: 'motion',
    categoryLabel: '동적 공격',
    summary: '공을 반대편으로 옮기며 UCLA 컷, 플레어 스크린, 포스트 미스매치를 활용해 2~3차 공격 기회를 만드는 방식입니다.',
    difficulty: 5,
  },
  {
    id: 'pick-and-roll',
    name: 'Pick & Roll',
    category: 'action',
    categoryLabel: '기본 배합',
    summary: '핸들러가 볼스크린을 받아 돌파하고, 스크린 설정자는 롤하며 나머지 3명은 헬프 수비를 붙잡는 기본 조합입니다.',
    difficulty: 2,
  },
  {
    id: 'pick-and-pop',
    name: 'Pick & Pop',
    category: 'action',
    categoryLabel: '기본 배합',
    summary: '스크린 설정자가 골밑으로 들어가지 않고 외곽으로 빠져 슛 기회를 만들어, 수비의 수축을 응징합니다.',
    difficulty: 3,
  },
  {
    id: 'give-and-go',
    name: 'Give & Go',
    category: 'action',
    categoryLabel: '기본 배합',
    summary: '패스 후 즉시 수비 뒤로 컷해 리턴 패스를 받아 골밑에서 마무리합니다.',
    difficulty: 1,
  },
  {
    id: 'dribble-handoff',
    name: 'Dribble Handoff (DHO)',
    category: 'action',
    categoryLabel: '기본 배합',
    summary: '드리블 중인 선수가 이동하는 동료에게 공을 넘기며, 자신의 몸이 자연스러운 스크린 역할을 합니다.',
    difficulty: 2,
  },
  {
    id: 'backdoor-cut',
    name: 'Backdoor Cut',
    category: 'action',
    categoryLabel: '기본 배합',
    summary: '수비가 패스 라인을 과도하게 막을 때, 공격자가 수비 뒤쪽으로 파고들어 골밑 기회를 만듭니다.',
    difficulty: 2,
  },
  {
    id: 'pass-and-screen-away',
    name: 'Pass & Screen Away',
    category: 'action',
    categoryLabel: '기본 배합',
    summary: '패스한 선수가 공 반대편 동료를 위해 스크린을 설정하는 무볼 움직임입니다.',
    difficulty: 2,
  },
  {
    id: 'flare-screen',
    name: 'Flare Screen',
    category: 'action',
    categoryLabel: '기본 배합',
    summary: '무볼 선수가 공에서 멀어지는 방향으로 스크린을 받아 외곽 슛 공간을 만드는 스크린입니다.',
    difficulty: 3,
  },
  {
    id: 'pin-down',
    name: 'Pin Down',
    category: 'action',
    categoryLabel: '기본 배합',
    summary: '스크린 설정자가 하이에서 로우로 내려가, 바닥라인 쪽 동료가 위로 올라와 공을 받도록 돕는 스크린입니다.',
    difficulty: 3,
  },
  {
    id: 'ucla-cut',
    name: 'UCLA Cut',
    category: 'action',
    categoryLabel: '기본 배합',
    summary: '가드가 윙으로 패스한 뒤, 엘보 지역 동료의 백스크린을 받아 골밑으로 직진하는 컷입니다.',
    difficulty: 3,
  },
  {
    id: 'horns',
    name: 'Horns',
    category: 'set',
    categoryLabel: '고정 전술',
    summary: '엘보 2명, 코너 2명의 대칭 배치에서 좌우 어느 쪽이든 스크린 또는 엘보 진입을 선택할 수 있는 기본 셋입니다.',
    difficulty: 3,
  },
  {
    id: 'spain-pick-and-roll',
    name: 'Spain Pick & Roll',
    category: 'set',
    categoryLabel: '고정 전술',
    summary: '일반 픽앤롤 중 세 번째 선수가 롤하는 선수의 수비자에게 백스크린을 하고 외곽으로 빠지는 고난도 변형입니다.',
    difficulty: 5,
  },
  {
    id: 'elevator-screen',
    name: 'Elevator Screen',
    category: 'set',
    categoryLabel: '고정 전술',
    summary: '슈터가 두 스크린 사이를 통과한 뒤 두 사람이 함께 닫혀 추격 수비의 경로를 막는 전술입니다.',
    difficulty: 4,
  },
  {
    id: 'stagger-screen',
    name: 'Stagger Screen',
    category: 'set',
    categoryLabel: '고정 전술',
    summary: '두 스크린 설정자가 같은 진행 경로에 연속 스크린을 세워 슈터를 개방하는 전술입니다.',
    difficulty: 4,
  },
  {
    id: 'high-low',
    name: 'High-Low',
    category: 'set',
    categoryLabel: '고정 전술',
    summary: '하이 포스트 선수가 공을 받아, 골밑에서 포지션을 잡은 로우 포스트 동료에게 패스하는 내부 연계입니다.',
    difficulty: 3,
  },
  {
    id: 'triangle-side',
    name: 'Triangle Side',
    category: 'set',
    categoryLabel: '고정 전술',
    summary: '코너-윙-포스트가 강측 삼각형을 이루고, 진입·컷·핸드오프 판단으로 공격하는 트라이앵글 오펜스의 기본 형태입니다.',
    difficulty: 5,
  },
  {
    id: 'three-lane-fast-break',
    name: 'Three-Lane Fast Break',
    category: 'special',
    categoryLabel: '전환·특수 상황',
    summary: '볼은 중앙, 두 윙은 넓게 전진하고 나머지는 트레일러로 2차 공격에 참여하는 빠른 역습입니다.',
    difficulty: 2,
  },
  {
    id: 'secondary-break',
    name: 'Secondary Break',
    category: 'special',
    categoryLabel: '전환·특수 상황',
    summary: '1차 빠른 역습이 막히면 멈추지 않고 즉시 픽앤롤, 핸드오프, 하이-로우로 이어지는 초기 반코트 공격입니다.',
    difficulty: 4,
  },
  {
    id: 'blob-box',
    name: 'BLOB Box',
    category: 'special',
    categoryLabel: '전환·특수 상황',
    summary: '엔드라인 인바운드 상황에서 4명이 박스 형태로 배치해 교차 스크린으로 골밑 또는 코너 기회를 만듭니다.',
    difficulty: 3,
  },
  {
    id: 'slob-stack',
    name: 'SLOB Stack',
    category: 'special',
    categoryLabel: '전환·특수 상황',
    summary: '사이드라인 인바운드에서 세로로 겹쳐 선 뒤, 각기 다른 방향으로 흩어져 짧은 패스와 긴 패스 선택지를 만듭니다.',
    difficulty: 2,
  },
  {
    id: 'press-break',
    name: 'Press Break',
    category: 'special',
    categoryLabel: '전환·특수 상황',
    summary: '중앙 플래시, 역방향 패스, 대각선 진격으로 사이드라인·코너 트랩을 피하는 풀코트 프레스 해제입니다.',
    difficulty: 4,
  },
  {
    id: 'zone-overload',
    name: 'Zone Overload',
    category: 'special',
    categoryLabel: '전환·특수 상황',
    summary: '코너, 숏코너, 하이 포스트 위협을 한쪽에 집중시켜 2-3 존 디펜스에 국소 과잉을 만드는 공격입니다.',
    difficulty: 3,
  },
  {
    id: 'four-corners-delay',
    name: 'Four Corners Delay',
    category: 'special',
    categoryLabel: '전환·특수 상황',
    summary: '코트를 최대한 넓게 벌리고 가장 안정적인 핸들러가 공을 유지하며, 상대가 압박할수록 돌파 공간을 노리는 시간 관리 전술입니다.',
    difficulty: 2,
  },
]

export function findTactic(id?: string | null): GameTactic | null {
  if (!id) return null
  return GAME_TACTICS.find((item) => item.id === id) || null
}

export function pickRecommendedTactic(excludeIds: string[] = []): GameTactic {
  const pool = GAME_TACTICS.filter((item) => !excludeIds.includes(item.id))
  const list = pool.length ? pool : GAME_TACTICS
  return list[Math.floor(Math.random() * list.length)]
}

export function difficultyLabel(value: number) {
  return `난이도 ${value}/5`
}
