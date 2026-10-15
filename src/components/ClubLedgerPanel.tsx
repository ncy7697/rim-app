import { useEffect, useMemo, useState } from 'react'
import { EmptyCard } from './ui'
import {
  LEDGER_CATEGORIES,
  deleteLedgerEntry,
  emptyLedgerEntry,
  filterLedgerMonth,
  ledgerCategoryLabel,
  ledgerSideLabel,
  ledgerTotals,
  listLedgerEntries,
  listPublicReceipts,
  saveLedgerEntry,
  type LedgerEntry,
  type LedgerSide,
} from '../clubLedger'

function monthInputValue(monthKey: string) {
  return monthKey
}

export default function ClubLedgerPanel({
  clubId,
  userId,
  canManage,
}: {
  clubId: string
  userId?: string
  canManage: boolean
}) {
  const thisMonth = new Date().toISOString().slice(0, 7)
  const [monthKey, setMonthKey] = useState(thisMonth)
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [form, setForm] = useState<LedgerEntry | null>(null)
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const monthEntries = useMemo(() => filterLedgerMonth(entries, monthKey), [entries, monthKey])
  const totals = ledgerTotals(canManage ? monthEntries : monthEntries.filter((item) => item.receiptUrl && item.receiptPublic))
  const shown = canManage ? monthEntries : monthEntries.filter((item) => item.receiptUrl && item.receiptPublic)

  const load = async () => {
    setLoading(true)
    setMessage('')
    try {
      const next = canManage ? await listLedgerEntries(clubId) : await listPublicReceipts(clubId)
      setEntries(next)
    } catch (err: any) {
      setMessage(err.message || '장부를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [clubId, canManage])

  const openCreate = () => {
    const draft = emptyLedgerEntry(clubId, userId)
    draft.entryDate = `${monthKey}-01`
    setForm(draft)
    setReceiptFile(null)
  }

  const submit = async () => {
    if (!form || !canManage) return
    if (!form.title.trim()) {
      setMessage('항목 이름을 입력해 주세요.')
      return
    }
    if (!form.amount || form.amount < 0) {
      setMessage('금액을 입력해 주세요.')
      return
    }
    setSaving(true)
    try {
      await saveLedgerEntry(
        {
          ...form,
          title: form.title.trim(),
          memo: form.memo.trim(),
          amount: Math.round(form.amount),
        },
        receiptFile
      )
      setForm(null)
      setReceiptFile(null)
      setMessage('장부에 기록했습니다.')
      await load()
    } catch (err: any) {
      setMessage(err.message || '장부를 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {message && <p className="text-xs text-navy bg-white border border-line rounded-xl px-3 py-2">{message}</p>}

      <section className="bb-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wide">{canManage ? '장부 / 회비' : '공개 영수증'}</p>
            <p className="text-[11px] text-muted mt-1">
              {canManage
                ? '회비·대관료·음료수비 등 수입과 지출을 남기고 영수증을 첨부합니다.'
                : '운영진이 공개한 영수증을 확인할 수 있습니다. 장부 입력은 감독·코치만 합니다.'}
            </p>
          </div>
          <input
            type="month"
            className="bb-input w-[9.5rem]"
            value={monthInputValue(monthKey)}
            onChange={(e) => setMonthKey(e.target.value || thisMonth)}
          />
        </div>
        {canManage && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-canvas py-2">
              <p className="text-[10px] text-muted">수입</p>
              <p className="text-sm font-bold text-emerald-700">{totals.income.toLocaleString('ko-KR')}</p>
            </div>
            <div className="rounded-xl bg-canvas py-2">
              <p className="text-[10px] text-muted">지출</p>
              <p className="text-sm font-bold text-rose-700">{totals.expense.toLocaleString('ko-KR')}</p>
            </div>
            <div className="rounded-xl bg-canvas py-2">
              <p className="text-[10px] text-muted">잔액</p>
              <p className="text-sm font-bold text-navy">{totals.net.toLocaleString('ko-KR')}</p>
            </div>
          </div>
        )}
        {canManage && (
          <button type="button" className="bb-btn-primary" onClick={openCreate}>
            내역 추가
          </button>
        )}
      </section>

      {form && canManage && (
        <section className="bb-card p-4 space-y-2">
          <p className="text-sm font-semibold">{form.id ? '내역 수정' : '내역 추가'}</p>
          <div className="grid grid-cols-2 gap-2">
            {(['in', 'out'] as LedgerSide[]).map((side) => (
              <button
                key={side}
                type="button"
                className={`py-2 rounded-xl text-xs font-semibold border ${
                  form.side === side ? 'bg-navy text-white border-navy' : 'bg-white border-line'
                }`}
                onClick={() => setForm({ ...form, side })}
              >
                {ledgerSideLabel(side)}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {LEDGER_CATEGORIES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`py-2 rounded-xl text-[11px] font-semibold border ${
                  form.category === item.id ? 'bg-navy text-white border-navy' : 'bg-white border-line'
                }`}
                onClick={() => setForm({ ...form, category: item.id, title: form.title === ledgerCategoryLabel(form.category) ? item.label : form.title })}
              >
                {item.label}
              </button>
            ))}
          </div>
          <input className="bb-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="항목 이름" />
          <input
            className="bb-input"
            type="number"
            min={0}
            value={form.amount || ''}
            onChange={(e) => setForm({ ...form, amount: Number(e.target.value) || 0 })}
            placeholder="금액 (원)"
          />
          <input type="date" className="bb-input" value={form.entryDate} onChange={(e) => setForm({ ...form, entryDate: e.target.value })} />
          <textarea className="bb-input min-h-16" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} placeholder="메모" />
          <label className="block text-[11px] font-semibold text-muted">영수증 사진</label>
          <input
            type="file"
            accept="image/*"
            className="text-xs"
            onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
          />
          {(receiptFile || form.receiptUrl) && (
            <img
              src={receiptFile ? URL.createObjectURL(receiptFile) : form.receiptUrl}
              alt="영수증 미리보기"
              className="w-full max-h-48 object-contain rounded-xl border border-line bg-canvas"
            />
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-navy"
              checked={form.receiptPublic}
              onChange={(e) => setForm({ ...form, receiptPublic: e.target.checked })}
            />
            동아리원 전체 열람
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="bb-btn-ghost" onClick={() => { setForm(null); setReceiptFile(null) }}>
              취소
            </button>
            <button type="button" className="bb-btn-primary" disabled={saving} onClick={() => void submit()}>
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </section>
      )}

      {loading ? (
        <p className="text-xs text-muted text-center py-6">불러오는 중...</p>
      ) : shown.length === 0 ? (
        <EmptyCard
          title={canManage ? '이번 달 장부 내역이 없습니다' : '공개된 영수증이 없습니다'}
          description={canManage ? '내역을 추가하고 영수증을 첨부해 주세요.' : '운영진이 영수증을 공개하면 여기에 나타납니다.'}
        />
      ) : (
        shown.map((item) => (
          <section key={item.id} className="bb-card p-4 space-y-2">
            <div className="flex justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold text-muted">
                  {item.entryDate} · {ledgerSideLabel(item.side)} · {ledgerCategoryLabel(item.category)}
                </p>
                <p className="text-sm font-semibold mt-0.5">{item.title}</p>
              </div>
              {canManage && (
                <p className={`text-sm font-bold tabular-nums ${item.side === 'in' ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {item.side === 'in' ? '+' : '-'}
                  {item.amount.toLocaleString('ko-KR')}
                </p>
              )}
            </div>
            {item.memo && <p className="text-xs text-ink whitespace-pre-line">{item.memo}</p>}
            {item.receiptUrl && (
              <button type="button" className="block w-full" onClick={() => setPreview(item.receiptUrl)}>
                <img src={item.receiptUrl} alt={`${item.title} 영수증`} className="w-full max-h-56 object-contain rounded-xl border border-line bg-canvas" />
                <p className="text-[11px] text-navy font-semibold mt-1">영수증 크게 보기</p>
              </button>
            )}
            {!canManage && (
              <p className="text-[11px] text-muted">{ledgerCategoryLabel(item.category)}</p>
            )}
            {canManage && (
              <div className="flex gap-3">
                <button type="button" className="text-[11px] font-semibold text-navy" onClick={() => { setForm(item); setReceiptFile(null) }}>
                  수정
                </button>
                <button
                  type="button"
                  className="text-[11px] text-rose-700"
                  onClick={() => {
                    if (!confirm('이 내역을 삭제할까요?')) return
                    void deleteLedgerEntry(clubId, item.id).then(() => load())
                  }}
                >
                  삭제
                </button>
                <span className="text-[11px] text-muted ml-auto">{item.receiptPublic ? '전체 열람' : '운영진만'}</span>
              </div>
            )}
          </section>
        ))
      )}

      {preview && (
        <div className="fixed inset-0 z-50 bg-navy/70 p-4 flex items-center justify-center" onClick={() => setPreview(null)}>
          <img src={preview} alt="영수증" className="max-h-full max-w-full rounded-xl object-contain" />
        </div>
      )}
    </div>
  )
}
