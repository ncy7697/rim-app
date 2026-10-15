import { appPageUrl, parseAppLink, peekPendingInviteCode } from './appLinks'

export type SkillTier = 'C' | 'B' | 'A'

export interface ClubSettings {
  v: 1
  inviteCode: string
  emblemDataUrl?: string | null
  regionSido: string
  regionSigungu: string
  homeCourt: string
  practiceDays: string[]
  practiceTimeStart: string
  practiceTimeEnd: string
  purpose: string
  ageGroup: string
  gender: string
  skillTier: SkillTier
  duesAmount: number
  duesDay: number
  penaltyRules: string
}

export const SETTINGS_MARK = '@@BB@@'
export const ROSTER_MARK = '@@BB_ROSTER@@'

export function extractJsonObject(text: string, fromIndex = 0): string | null {
  const start = text.indexOf('{', fromIndex)
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      if (escape) escape = false
      else if (ch === '\\') escape = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
}

export const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const

export const PURPOSE_OPTIONS = [
  { value: '실전/대회 준비', hint: '리그·대회 참가 중심' },
  { value: '친목/즐농', hint: '운동과 친목을 함께' },
  { value: '연습/실력 향상', hint: '스킬·팀플레이 향상' },
] as const

export const AGE_OPTIONS = ['20대 위주', '3040', '연령 무관'] as const
export const GENDER_OPTIONS = ['남성', '여성', '혼성'] as const

export const TIER_OPTIONS: { value: SkillTier; label: string; hint: string }[] = [
  { value: 'C', label: '입문/초급 (C)', hint: '처음 배우거나 캐주얼하게 즐기는 수준' },
  { value: 'B', label: '중급 (B)', hint: '기본기가 있고 경기 운영이 가능한 수준' },
  { value: 'A', label: '상급/선출 (A)', hint: '고교 이상 선출 또는 그에 준하는 수준' },
]

export const PENALTY_TEMPLATES = [
  {
    id: 'basic',
    name: '기본',
    text: '무단 결석 시 해당 월 회비 외에 참가비 5,000원을 추가로 납부합니다.\n지각 15분 이상 시 경고, 월 3회 누적 시 다음 모임 참가 제한을 둘 수 있습니다.',
  },
  {
    id: 'strict',
    name: '엄격',
    text: '무단 결석 1회당 10,000원 패널티를 부과합니다.\n지각 10분당 2,000원이며, 월 무단결석 2회 시 정회원 자격이 정지될 수 있습니다.',
  },
  {
    id: 'flexible',
    name: '유연',
    text: '사전 투표로 불참을 알린 경우 패널티가 없습니다.\n무단 결석만 다음 모임 게스트 우선순위에서 후순위로 조정합니다.\n지각은 별도 금액 없이 경고만 기록합니다.',
  },
] as const

export const REGION_MAP: Record<string, string[]> = {
  서울특별시: [
    '강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구', '금천구',
    '노원구', '도봉구', '동대문구', '동작구', '마포구', '서대문구', '서초구', '성동구',
    '성북구', '송파구', '양천구', '영등포구', '용산구', '은평구', '종로구', '중구', '중랑구',
  ],
  부산광역시: ['강서구', '금정구', '기장군', '남구', '동구', '동래구', '부산진구', '북구', '사상구', '사하구', '서구', '수영구', '연제구', '영도구', '중구', '해운대구'],
  대구광역시: ['남구', '달서구', '달성군', '동구', '북구', '서구', '수성구', '중구', '군위군'],
  인천광역시: ['계양구', '남동구', '동구', '미추홀구', '부평구', '서구', '연수구', '중구', '강화군', '옹진군'],
  광주광역시: ['광산구', '남구', '동구', '북구', '서구'],
  대전광역시: ['대덕구', '동구', '서구', '유성구', '중구'],
  울산광역시: ['남구', '동구', '북구', '중구', '울주군'],
  세종특별자치시: ['세종시'],
  경기도: [
    '수원시', '성남시', '의정부시', '안양시', '부천시', '광명시', '평택시', '동두천시',
    '안산시', '고양시', '과천시', '구리시', '남양주시', '오산시', '시흥시', '군포시',
    '의왕시', '하남시', '용인시', '파주시', '이천시', '안성시', '김포시', '화성시',
    '광주시', '양주시', '포천시', '여주시', '연천군', '가평군', '양평군',
  ],
  강원특별자치도: ['춘천시', '원주시', '강릉시', '동해시', '태백시', '속초시', '삼척시', '홍천군', '횡성군', '영월군', '평창군', '정선군', '철원군', '화천군', '양구군', '인제군', '고성군', '양양군'],
  충청북도: ['청주시', '충주시', '제천시', '보은군', '옥천군', '영동군', '증평군', '진천군', '괴산군', '음성군', '단양군'],
  충청남도: ['천안시', '공주시', '보령시', '아산시', '서산시', '논산시', '계룡시', '당진시', '금산군', '부여군', '서천군', '청양군', '홍성군', '예산군', '태안군'],
  전북특별자치도: ['전주시', '군산시', '익산시', '정읍시', '남원시', '김제시', '완주군', '진안군', '무주군', '장수군', '임실군', '순창군', '고창군', '부안군'],
  전라남도: ['목포시', '여수시', '순천시', '나주시', '광양시', '담양군', '곡성군', '구례군', '고흥군', '보성군', '화순군', '장흥군', '강진군', '해남군', '영암군', '무안군', '함평군', '영광군', '장성군', '완도군', '진도군', '신안군'],
  경상북도: ['포항시', '경주시', '김천시', '안동시', '구미시', '영주시', '영천시', '상주시', '문경시', '경산시', '의성군', '청송군', '영양군', '영덕군', '청도군', '고령군', '성주군', '칠곡군', '예천군', '봉화군', '울진군', '울릉군'],
  경상남도: ['창원시', '진주시', '통영시', '사천시', '김해시', '밀양시', '거제시', '양산시', '의령군', '함안군', '창녕군', '고성군', '남해군', '하동군', '산청군', '함양군', '거창군', '합천군'],
  제주특별자치도: ['제주시', '서귀포시'],
}

export const SIDO_LIST = Object.keys(REGION_MAP)

export function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i += 1) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

export function encodeClubDescription(settings: ClubSettings): string {
  const days = settings.practiceDays.join(', ')
  const intro = [
    `${settings.purpose} · ${settings.skillTier}티어 · ${settings.gender} · ${settings.ageGroup}`,
    `홈 코트: ${settings.homeCourt}`,
    `운동: ${days} ${settings.practiceTimeStart}–${settings.practiceTimeEnd}`,
    `회비: 매월 ${settings.duesDay}일 ${settings.duesAmount.toLocaleString('ko-KR')}원`,
  ].join('\n')
  return `${intro}\n\n${SETTINGS_MARK}\n${JSON.stringify(settings)}`
}

export function descriptionPreview(description?: string | null): string {
  if (!description) return ''
  const index = description.indexOf(SETTINGS_MARK)
  const text = (index < 0 ? description : description.slice(0, index)).trim()
  return text
}

export function parseClubSettings(description?: string | null): ClubSettings | null {
  if (!description) return null
  const index = description.indexOf(SETTINGS_MARK)
  if (index < 0) return null
  const raw = extractJsonObject(description, index + SETTINGS_MARK.length)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ClubSettings
    if (!parsed || parsed.v !== 1) return null
    return parsed
  } catch {
    return null
  }
}

export type ClubSettingsRow = {
  description?: string | null
  invite_code?: string | null
  emblem_url?: string | null
  region_sido?: string | null
  region_sigungu?: string | null
  home_court?: string | null
  practice_days?: string[] | null
  practice_time_start?: string | null
  practice_time_end?: string | null
  purpose?: string | null
  age_group?: string | null
  gender?: string | null
  skill_tier?: string | null
  dues_amount?: number | string | null
  dues_day?: number | null
  penalty_rules?: string | null
}

export function clubRowToSettings(row?: ClubSettingsRow | null): ClubSettings | null {
  if (!row) return null
  const fromJson = parseClubSettings(row.description)
  const hasColumns = Boolean(
    row.invite_code || row.home_court || row.purpose || row.emblem_url || row.skill_tier
  )
  if (!hasColumns) return fromJson
  return {
    v: 1,
    inviteCode: row.invite_code || fromJson?.inviteCode || '',
    emblemDataUrl: row.emblem_url ?? fromJson?.emblemDataUrl ?? null,
    regionSido: row.region_sido || fromJson?.regionSido || '',
    regionSigungu: row.region_sigungu || fromJson?.regionSigungu || '',
    homeCourt: row.home_court || fromJson?.homeCourt || '',
    practiceDays: row.practice_days?.length ? row.practice_days : fromJson?.practiceDays || [],
    practiceTimeStart: row.practice_time_start || fromJson?.practiceTimeStart || '',
    practiceTimeEnd: row.practice_time_end || fromJson?.practiceTimeEnd || '',
    purpose: row.purpose || fromJson?.purpose || '',
    ageGroup: row.age_group || fromJson?.ageGroup || '',
    gender: row.gender || fromJson?.gender || '',
    skillTier: ((row.skill_tier || fromJson?.skillTier || 'B') as SkillTier),
    duesAmount: Number(row.dues_amount ?? fromJson?.duesAmount ?? 0),
    duesDay: Number(row.dues_day ?? fromJson?.duesDay ?? 1),
    penaltyRules: row.penalty_rules || fromJson?.penaltyRules || '',
  }
}

export function clubSettingsPayload(settings: ClubSettings) {
  return {
    v: settings.v,
    inviteCode: settings.inviteCode,
    emblemDataUrl: settings.emblemDataUrl,
    regionSido: settings.regionSido,
    regionSigungu: settings.regionSigungu,
    homeCourt: settings.homeCourt,
    practiceDays: settings.practiceDays,
    practiceTimeStart: settings.practiceTimeStart,
    practiceTimeEnd: settings.practiceTimeEnd,
    purpose: settings.purpose,
    ageGroup: settings.ageGroup,
    gender: settings.gender,
    skillTier: settings.skillTier,
    duesAmount: settings.duesAmount,
    duesDay: settings.duesDay,
    penaltyRules: settings.penaltyRules,
  }
}

export function formatRegion(sido: string, sigungu: string): string {
  return `${sido} ${sigungu}`.trim()
}

export function inviteUrl(code: string): string {
  return appPageUrl({ invite: code.trim().toUpperCase() })
}

export function qrImageUrl(url: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`
}

export function readInviteCodeFromLocation(): string | null {
  if (typeof window === 'undefined') return null
  const fromPage = parseAppLink(window.location.href)
  if (fromPage?.kind === 'invite') return fromPage.code
  return peekPendingInviteCode()
}

export async function compressEmblem(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'))
    reader.readAsDataURL(file)
  })

  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const size = 256
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('이미지를 처리하지 못했습니다.'))
        return
      }
      ctx.fillStyle = '#F4F5F7'
      ctx.fillRect(0, 0, size, size)
      const scale = Math.max(size / img.width, size / img.height)
      const w = img.width * scale
      const h = img.height * scale
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)
      resolve(canvas.toDataURL('image/jpeg', 0.7))
    }
    img.onerror = () => reject(new Error('이미지를 불러오지 못했습니다.'))
    img.src = dataUrl
  })
}
