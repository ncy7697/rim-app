import { useEffect, useState } from 'react'
import {
  accessLabel,
  formatAccessDate,
  getBillingSettings,
  getClubAccess,
  listClubPayments,
  paymentStatusLabel,
  requestClubPayment,
  type BillingSettings,
  type ClubAccess,
  type ClubPayment,
} from '../clubBilling'

export default function ClubBillingPanel({
  clubId,
  userId,
  canManage,
}: {
  clubId: string
  userId?: string
  canManage: boolean
}) {
  const [access, setAccess] = useState<ClubAccess | null>(null)
  const [settings, setSettings] = useState<BillingSettings | null>(null)
  const [payments, setPayments] = useState<ClubPayment[]>([])
  const [depositor, setDepositor] = useState('')
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const load = async () => {
    const [nextAccess, nextSettings] = await Promise.all([getClubAccess(clubId), getBillingSettings()])
    setAccess(nextAccess)
    setSettings(nextSettings)
    setAmount(String(nextSettings.monthlyFee))
    if (canManage && userId) {
      try {
        setPayments(await listClubPayments(userId, clubId))
      } catch {
        setPayments([])
      }
    }
  }

  useEffect(() => {
    void load()
  }, [clubId, userId, canManage])

  const submit = async () => {
    if (!userId) return
    setSaving(true)
    setMessage('')
    try {
      await requestClubPayment({
        userId,
        clubId,
        depositorName: depositor,
        amount: Number(amount),
        memo,
      })
      setDepositor('')
      setMemo('')
      setMessage('입금 확인 요청을 보냈습니다. 운영자가 확인하면 이용 기간이 연장됩니다.')
      await load()
    } catch (err: any) {
      setMessage(err.message || '요청에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (!canManage || !access || !settings) return null

  const accountReady = Boolean(settings.bankName && settings.accountNumber && settings.accountHolder)

  return (
    <section className="bb-card p-5 space-y-3">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 text-left cursor-pointer"
        onClick={() => setOpen((value) => !value)}
      >
        <div className="min-w-0">
          <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">이용 기간</h3>
          <p className={`text-sm font-semibold mt-1 truncate ${access.active || access.unknown ? 'text-ink' : 'text-brand'}`}>
            {accessLabel(access)}
          </p>
        </div>
        <span className="text-[11px] font-semibold text-navy shrink-0">{open ? '접기' : '열기'}</span>
      </button>

      {open && (
        <div className="space-y-3 pt-1">
          {settings.notice && <p className="text-xs text-muted leading-relaxed whitespace-pre-line">{settings.notice}</p>}
          <div className="rounded-xl bg-canvas p-3 space-y-1 text-xs">
            <p className="font-semibold text-ink">월 이용료 계좌이체</p>
            {accountReady ? (
              <>
                <p>{settings.bankName} {settings.accountNumber}</p>
                <p>예금주 {settings.accountHolder}</p>
                <p>금액 {settings.monthlyFee.toLocaleString('ko-KR')}원 / 월</p>
              </>
            ) : (
              <p className="text-muted">
                입금 계좌는 운영자가 관리자 화면의 결제 탭에서 등록합니다. 계좌를 안내받은 뒤 이체했으면 아래 입금자명과 금액을 넣고 확인을 요청할 수 있습니다.
              </p>
            )}
          </div>
          <label className="block">
            <span className="bb-label">입금자명</span>
            <input className="bb-input" value={depositor} onChange={(e) => setDepositor(e.target.value)} placeholder="통장에 표시된 이름" />
          </label>
          <label className="block">
            <span className="bb-label">입금 금액</span>
            <input className="bb-input" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="block">
            <span className="bb-label">메모 (선택)</span>
            <input className="bb-input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="이체 일시 등" />
          </label>
          {message && <p className="text-xs text-navy">{message}</p>}
          <button
            type="button"
            className="bb-btn-primary"
            disabled={saving || !depositor.trim() || !Number(amount)}
            onClick={() => void submit()}
          >
            {saving ? '요청 중...' : '이체 후 입금 확인 요청'}
          </button>
          {(!depositor.trim() || !Number(amount)) && (
            <p className="text-[11px] text-muted">입금자명과 금액을 입력하면 버튼이 활성화됩니다.</p>
          )}
          {payments.length > 0 && (
            <ul className="space-y-1.5 pt-1">
              {payments.map((item) => (
                <li key={item.id} className="text-[11px] text-muted flex justify-between gap-2">
                  <span>{item.depositorName} · {item.amount.toLocaleString('ko-KR')}원</span>
                  <span>
                    {paymentStatusLabel(item.status)}
                    {item.accessUntilSet ? ` · ${formatAccessDate(item.accessUntilSet)}까지` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
