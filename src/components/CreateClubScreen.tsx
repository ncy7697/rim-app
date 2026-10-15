import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { BackButton, EmptyCard, Spinner } from './ui';
import {
  AGE_OPTIONS,
  GENDER_OPTIONS,
  PENALTY_TEMPLATES,
  PURPOSE_OPTIONS,
  REGION_MAP,
  SIDO_LIST,
  TIER_OPTIONS,
  WEEKDAYS,
  compressEmblem,
  encodeClubDescription,
  formatRegion,
  generateInviteCode,
  inviteUrl,
  qrImageUrl,
  clubSettingsPayload,
  type ClubSettings,
  type SkillTier,
} from '../clubSettings';
import { fetchOwnedClub, type OwnedClub } from '../clubMembership';

interface CreateClubScreenProps {
  userId?: string;
  onBack: () => void;
  onSuccess: () => void;
  onGoToLogin?: () => void;
}

type Step = 1 | 2 | 3 | 4

export default function CreateClubScreen({
  userId,
  onBack,
  onSuccess,
  onGoToLogin,
}: CreateClubScreenProps) {
  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [copyState, setCopyState] = useState('')
  const [ownedClub, setOwnedClub] = useState<OwnedClub | null>(null)
  const [checkingOwner, setCheckingOwner] = useState(true)

  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('🏀')
  const [emblemDataUrl, setEmblemDataUrl] = useState<string | null>(null)
  const [regionSido, setRegionSido] = useState('경기도')
  const [regionSigungu, setRegionSigungu] = useState('성남시')
  const [homeCourt, setHomeCourt] = useState('')
  const [practiceDays, setPracticeDays] = useState<string[]>(['토'])
  const [practiceTimeStart, setPracticeTimeStart] = useState('09:00')
  const [practiceTimeEnd, setPracticeTimeEnd] = useState('12:00')

  const [purpose, setPurpose] = useState<string>(PURPOSE_OPTIONS[1].value)
  const [ageGroup, setAgeGroup] = useState<string>('연령 무관')
  const [gender, setGender] = useState<string>('혼성')
  const [skillTier, setSkillTier] = useState<SkillTier>('B')

  const [duesAmount, setDuesAmount] = useState('30000')
  const [duesDay, setDuesDay] = useState('1')
  const [penaltyTemplateId, setPenaltyTemplateId] = useState<string>(PENALTY_TEMPLATES[0].id)
  const [penaltyRules, setPenaltyRules] = useState<string>(PENALTY_TEMPLATES[0].text)

  const sigunguList = REGION_MAP[regionSido] || []
  const shareUrl = useMemo(() => (inviteCode ? inviteUrl(inviteCode) : ''), [inviteCode])

  useEffect(() => {
    if (!userId) {
      setCheckingOwner(false)
      setOwnedClub(null)
      return
    }

    let cancelled = false
    setCheckingOwner(true)
    fetchOwnedClub(userId)
      .then((club) => {
        if (!cancelled) setOwnedClub(club)
      })
      .catch((err) => {
        console.error('감독 여부 확인 실패:', err)
      })
      .finally(() => {
        if (!cancelled) setCheckingOwner(false)
      })

    return () => {
      cancelled = true
    }
  }, [userId])

  const toggleDay = (day: string) => {
    setPracticeDays((prev) =>
      prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day]
    )
  }

  const validateStep = (current: Step): string => {
    if (current === 1) {
      if (!name.trim()) return '동아리명을 입력해 주세요.'
      if (!regionSido || !regionSigungu) return '주 활동 지역을 선택해 주세요.'
      if (!homeCourt.trim()) return '홈 코트(체육관)를 입력해 주세요.'
      if (practiceDays.length === 0) return '주요 운동 요일을 하나 이상 선택해 주세요.'
      if (!practiceTimeStart || !practiceTimeEnd) return '운동 시간대를 입력해 주세요.'
      if (practiceTimeStart >= practiceTimeEnd) return '종료 시간은 시작 시간보다 늦어야 합니다.'
    }
    if (current === 2) {
      if (!purpose || !ageGroup || !gender || !skillTier) return '동아리 성향을 모두 선택해 주세요.'
    }
    if (current === 3) {
      const amount = Number(duesAmount)
      const day = Number(duesDay)
      if (!Number.isFinite(amount) || amount < 0) return '회비 금액을 확인해 주세요.'
      if (!Number.isInteger(day) || day < 1 || day > 31) return '납부일은 1–31 사이여야 합니다.'
      if (!penaltyRules.trim()) return '출석/지각 규정을 입력해 주세요.'
    }
    return ''
  }

  const goNext = () => {
    const message = validateStep(step)
    if (message) {
      setErrorMessage(message)
      return
    }
    setErrorMessage('')
    if (step < 3) setStep((step + 1) as Step)
    else void handleCreate()
  }

  const handleEmblemFile = async (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setErrorMessage('이미지 파일만 업로드할 수 있습니다.')
      return
    }
    try {
      const compressed = await compressEmblem(file)
      setEmblemDataUrl(compressed)
      setErrorMessage('')
    } catch (err: any) {
      setErrorMessage(err.message || '엠블럼 이미지를 처리하지 못했습니다.')
    }
  }

  const handleCreate = async () => {
    if (!userId) {
      onGoToLogin?.()
      return
    }

    const message = validateStep(3)
    if (message) {
      setErrorMessage(message)
      return
    }

    setLoading(true)
    setErrorMessage('')

    try {
      const alreadyOwned = await fetchOwnedClub(userId)
      if (alreadyOwned) {
        setOwnedClub(alreadyOwned)
        setErrorMessage(`이미 감독으로 운영 중인 동아리(${alreadyOwned.name})가 있습니다. 감독은 동아리를 1개만 개설할 수 있습니다.`)
        setLoading(false)
        return
      }
      const code = generateInviteCode()
      const settings: ClubSettings = {
        v: 1,
        inviteCode: code,
        emblemDataUrl,
        regionSido,
        regionSigungu,
        homeCourt: homeCourt.trim(),
        practiceDays,
        practiceTimeStart,
        practiceTimeEnd,
        purpose,
        ageGroup,
        gender,
        skillTier,
        duesAmount: Number(duesAmount),
        duesDay: Number(duesDay),
        penaltyRules: penaltyRules.trim(),
      }

      const payload = clubSettingsPayload(settings)
      let { error } = await supabase.rpc('create_club', {
        p_name: name.trim(),
        p_region: formatRegion(regionSido, regionSigungu),
        p_category: purpose,
        p_description: encodeClubDescription(settings),
        p_emoji: emoji,
        p_leader_id: userId,
        p_settings: payload,
      })

      if (error && /p_settings|Could not find the function/i.test(error.message || '')) {
        const retry = await supabase.rpc('create_club', {
          p_name: name.trim(),
          p_region: formatRegion(regionSido, regionSigungu),
          p_category: purpose,
          p_description: encodeClubDescription(settings),
          p_emoji: emoji,
          p_leader_id: userId,
        })
        error = retry.error
      }

      if (error) {
        if (emblemDataUrl && (error.message?.includes('too long') || error.code === '54000' || error.message?.includes('value too long'))) {
          const fallback = { ...settings, emblemDataUrl: null }
          const retry = await supabase.rpc('create_club', {
            p_name: name.trim(),
            p_region: formatRegion(regionSido, regionSigungu),
            p_category: purpose,
            p_description: encodeClubDescription(fallback),
            p_emoji: emoji,
            p_leader_id: userId,
            p_settings: clubSettingsPayload(fallback),
          })
          if (retry.error) throw retry.error
        } else {
          throw error
        }
      }

      const owned = await fetchOwnedClub(userId)
      if (owned) {
        await supabase.from('clubs').update({
          invite_code: code,
          emblem_url: emblemDataUrl,
          region_sido: regionSido,
          region_sigungu: regionSigungu,
          home_court: homeCourt.trim(),
          practice_days: practiceDays,
          practice_time_start: practiceTimeStart,
          practice_time_end: practiceTimeEnd,
          purpose,
          age_group: ageGroup,
          gender,
          skill_tier: skillTier,
          dues_amount: Number(duesAmount),
          dues_day: Number(duesDay),
          penalty_rules: penaltyRules.trim(),
          description: `${purpose} · ${skillTier}티어 · ${gender} · ${ageGroup}\n홈 코트: ${homeCourt.trim()}\n운동: ${practiceDays.join(', ')} ${practiceTimeStart}–${practiceTimeEnd}\n회비: 매월 ${duesDay}일 ${Number(duesAmount).toLocaleString('ko-KR')}원`,
          access_until: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString(),
        }).eq('id', owned.id)
      }

      setInviteCode(code)
      setStep(4)
    } catch (err: any) {
      console.error('동호회 개설 에러:', err)
      setErrorMessage(err.message || '동호회 개설에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setLoading(false)
    }
  }

  const copyText = async (text: string, okMessage: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyState(okMessage)
    } catch {
      setCopyState('복사에 실패했습니다. 링크를 직접 선택해 복사해 주세요.')
    }
  }

  const shareKakao = async () => {
    const message = `[림] ${name} 동아리에 초대합니다.\n${shareUrl}`
    if (navigator.share) {
      try {
        await navigator.share({ title: `${name} 초대`, text: message, url: shareUrl })
        return
      } catch {
        // 사용자가 취소한 경우 문구 복사로 이어갑니다.
      }
    }
    await copyText(message, '카카오톡에 붙여넣을 초대 문구를 복사했습니다.')
  }

  if (!userId) {
    return (
      <div className="bb-screen px-6 justify-center">
        <EmptyCard title="로그인이 필요합니다" description="동아리를 개설하려면 먼저 로그인해 주세요.">
          <div className="flex gap-2 pt-3">
            <button type="button" onClick={onBack} className="bb-btn-ghost flex-1">뒤로</button>
            <button type="button" onClick={onGoToLogin} className="bb-btn-primary flex-1">로그인</button>
          </div>
        </EmptyCard>
      </div>
    )
  }

  if (checkingOwner) {
    return (
      <div className="bb-screen">
        <header className="bb-header">
          <BackButton onClick={onBack} />
          <h1 className="text-base font-semibold text-ink">동아리 개설</h1>
        </header>
        <Spinner label="개설 가능 여부를 확인하는 중..." />
      </div>
    )
  }

  if (ownedClub && step !== 4) {
    return (
      <div className="bb-screen px-6 justify-center">
        <EmptyCard
          title="이미 운영 중인 동아리가 있습니다"
          description={`감독은 동아리를 1개만 개설할 수 있습니다. 현재 감독: ${ownedClub.name}`}
        >
          <button type="button" onClick={onBack} className="bb-btn-primary mt-4">
            돌아가기
          </button>
        </EmptyCard>
      </div>
    )
  }

  return (
    <div className="bb-screen px-5 pb-8">
      <header className="bb-header -mx-5 mb-4">
        <BackButton onClick={step === 1 ? onBack : step === 4 ? onSuccess : () => { setErrorMessage(''); setStep((step - 1) as Step) }} />
        <div>
          <h1 className="text-base font-semibold text-ink">{step === 4 ? '개설 완료' : '동아리 개설'}</h1>
          <p className="text-[11px] text-muted">{step === 4 ? '초대 링크와 QR을 공유하세요' : `${step} / 3 단계`}</p>
        </div>
      </header>

      {step < 4 && (
        <div className="flex gap-1.5 mb-5">
          {[1, 2, 3].map((item) => (
            <div key={item} className={`h-1 flex-1 rounded-full ${item <= step ? 'bg-navy' : 'bg-line'}`} />
          ))}
        </div>
      )}

      {errorMessage && (
        <p className="mb-4 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
          {errorMessage}
        </p>
      )}

      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="bb-label">동아리명 *</label>
            <input className="bb-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 분당 슬램덩크" maxLength={40} />
          </div>

          <div>
            <label className="bb-label">엠블럼 / 로고</label>
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-xl border border-line bg-white overflow-hidden flex items-center justify-center">
                {emblemDataUrl ? (
                  <img src={emblemDataUrl} alt="엠블럼 미리보기" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl">{emoji}</span>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <input
                  type="file"
                  accept="image/*"
                  className="block w-full text-xs text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-navy file:text-white file:px-3 file:py-1.5 file:text-xs file:font-semibold"
                  onChange={(e) => void handleEmblemFile(e.target.files?.[0])}
                />
                <div className="flex gap-1.5">
                  {['🏀', '⚡', '🎯', '🔥', '🏆', '👑'].map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setEmoji(item)}
                      className={`w-8 h-8 rounded-lg border text-sm cursor-pointer ${emoji === item ? 'border-navy bg-canvas' : 'border-line bg-white'}`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-[11px] text-muted mt-1.5 leading-relaxed">
              JPG, PNG 이미지를 올릴 수 있습니다. 정사각형(1:1) 권장이며, 권장 크기는 256×256px 이상입니다.
              큰 사진도 정사각형 256px로 잘려 압축 저장됩니다. 가로·세로가 다르면 가운데를 기준으로 잘립니다.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="bb-label">시/도 *</label>
              <select
                className="bb-input"
                value={regionSido}
                onChange={(e) => {
                  const next = e.target.value
                  setRegionSido(next)
                  setRegionSigungu(REGION_MAP[next]?.[0] || '')
                }}
              >
                {SIDO_LIST.map((sido) => (
                  <option key={sido} value={sido}>{sido}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="bb-label">시/군/구 *</label>
              <select className="bb-input" value={regionSigungu} onChange={(e) => setRegionSigungu(e.target.value)}>
                {sigunguList.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="bb-label">홈 코트 (체육관) *</label>
            <input className="bb-input" value={homeCourt} onChange={(e) => setHomeCourt(e.target.value)} placeholder="예: 분당구민체육관 3층" />
          </div>

          <div>
            <label className="bb-label">주요 운동 요일 *</label>
            <div className="flex gap-1.5">
              {WEEKDAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border cursor-pointer ${
                    practiceDays.includes(day) ? 'bg-navy text-white border-navy' : 'bg-white text-muted border-line'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="bb-label">시작 *</label>
              <input type="time" className="bb-input" value={practiceTimeStart} onChange={(e) => setPracticeTimeStart(e.target.value)} />
            </div>
            <div>
              <label className="bb-label">종료 *</label>
              <input type="time" className="bb-input" value={practiceTimeEnd} onChange={(e) => setPracticeTimeEnd(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <fieldset className="border-0 p-0 m-0">
            <legend className="bb-label">활동 목적 *</legend>
            <div className="space-y-2">
              {PURPOSE_OPTIONS.map((item) => {
                const selected = purpose === item.value
                return (
                  <label
                    key={item.value}
                    className={`flex items-start gap-3 w-full text-left rounded-2xl border p-3.5 cursor-pointer ${
                      selected ? 'border-navy bg-white ring-2 ring-navy/15' : 'border-line bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="club-purpose"
                      className="mt-1 accent-navy"
                      checked={selected}
                      onChange={() => setPurpose(item.value)}
                    />
                    <span>
                      <span className="block text-sm font-semibold text-ink">{item.value}</span>
                      <span className="block text-[11px] text-muted mt-0.5">{item.hint}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>
          <div>
            <p className="bb-label">주요 연령대 *</p>
            <div className="grid grid-cols-3 gap-2">
              {AGE_OPTIONS.map((item) => (
                <button key={item} type="button" onClick={() => setAgeGroup(item)} className={`py-2.5 rounded-xl text-xs font-semibold border cursor-pointer ${ageGroup === item ? 'bg-navy text-white border-navy' : 'bg-white border-line text-ink'}`}>
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="bb-label">성별 구성 *</p>
            <div className="grid grid-cols-3 gap-2">
              {GENDER_OPTIONS.map((item) => (
                <button key={item} type="button" onClick={() => setGender(item)} className={`py-2.5 rounded-xl text-xs font-semibold border cursor-pointer ${gender === item ? 'bg-navy text-white border-navy' : 'bg-white border-line text-ink'}`}>
                  {item}
                </button>
              ))}
            </div>
          </div>
          <fieldset className="border-0 p-0 m-0">
            <legend className="bb-label">주요 실력대 *</legend>
            <div className="space-y-2">
              {TIER_OPTIONS.map((item) => {
                const selected = skillTier === item.value
                return (
                  <label
                    key={item.value}
                    className={`flex items-start gap-3 w-full text-left rounded-2xl border p-3.5 cursor-pointer ${
                      selected ? 'border-navy bg-white ring-2 ring-navy/15' : 'border-line bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="club-skill-tier"
                      className="mt-1 accent-navy"
                      checked={selected}
                      onChange={() => setSkillTier(item.value)}
                    />
                    <span>
                      <span className="block text-sm font-semibold text-ink">{item.label}</span>
                      <span className="block text-[11px] text-muted mt-0.5">{item.hint}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="bb-label">정기 회비 (원) *</label>
              <input type="number" min={0} className="bb-input" value={duesAmount} onChange={(e) => setDuesAmount(e.target.value)} />
            </div>
            <div>
              <label className="bb-label">납부일 (매월) *</label>
              <input type="number" min={1} max={31} className="bb-input" value={duesDay} onChange={(e) => setDuesDay(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="bb-label">출석/지각 규정 템플릿</label>
            <div className="flex gap-2 mb-2">
              {PENALTY_TEMPLATES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setPenaltyTemplateId(item.id)
                    setPenaltyRules(item.text)
                  }}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold border cursor-pointer ${
                    penaltyTemplateId === item.id ? 'bg-navy text-white border-navy' : 'bg-white border-line'
                  }`}
                >
                  {item.name}
                </button>
              ))}
            </div>
            <textarea
              rows={6}
              className="bb-input resize-none"
              value={penaltyRules}
              onChange={(e) => setPenaltyRules(e.target.value)}
            />
            <p className="text-[11px] text-muted mt-1.5">템플릿을 고른 뒤 동아리 실정에 맞게 수정할 수 있습니다. 림 앱 이용은 개설 후 1개월 무료, 이후 월 단위 계좌이체입니다.</p>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-4">
          <div className="bb-card p-5 text-center">
            <p className="text-sm font-semibold text-ink">{name} 개설이 완료되었습니다.</p>
            <p className="text-xs text-muted mt-1">아래 링크와 QR로 멤버를 초대하세요. 개설 후 1개월은 무료이며, 이후 월 이용료를 계좌이체하면 운영자가 기간을 연장합니다.</p>
            <img src={qrImageUrl(shareUrl)} alt="초대 QR 코드" className="mx-auto mt-4 w-40 h-40 rounded-xl border border-line bg-white" />
            <p className="mt-3 text-[11px] break-all text-muted">{shareUrl}</p>
          </div>
          <button type="button" className="bb-btn-primary" onClick={() => void copyText(shareUrl, '초대 링크를 복사했습니다.')}>
            초대 URL 복사
          </button>
          <button type="button" className="bb-btn-ghost w-full" onClick={() => void shareKakao()}>
            카카오톡/공유 문구 보내기
          </button>
          {copyState && <p className="text-xs text-center text-navy">{copyState}</p>}
          <button type="button" className="bb-btn-accent" onClick={onSuccess}>
            내 동아리로 이동
          </button>
        </div>
      )}

      {step < 4 && (
        <div className="flex gap-2 mt-6">
          {step > 1 && (
            <button type="button" className="bb-btn-ghost flex-1" onClick={() => { setErrorMessage(''); setStep((step - 1) as Step) }}>
              이전
            </button>
          )}
          <button type="button" className="bb-btn-primary flex-1" disabled={loading} onClick={goNext}>
            {loading ? '개설 중...' : step === 3 ? '개설 완료' : '다음'}
          </button>
        </div>
      )}
    </div>
  )
}
