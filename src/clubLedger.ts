import { supabase } from './supabaseClient'
import { newId } from './clubRoster'

function isMissingSchema(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  const message = error.message || ''
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    error.code === '42703' ||
    error.code === 'PGRST204' ||
    /does not exist|schema cache|Could not find/i.test(message)
  )
}

export type LedgerSide = 'in' | 'out'
export type LedgerCategory = 'dues' | 'venue' | 'drinks' | 'other'

export type LedgerEntry = {
  id: string
  clubId: string
  entryDate: string
  side: LedgerSide
  category: LedgerCategory
  title: string
  amount: number
  memo: string
  receiptUrl: string
  receiptPublic: boolean
  createdBy?: string
}

export const LEDGER_CATEGORIES: { id: LedgerCategory; label: string }[] = [
  { id: 'dues', label: '월 회비' },
  { id: 'venue', label: '체육관 대관료' },
  { id: 'drinks', label: '음료수비' },
  { id: 'other', label: '기타' },
]

function storageKey(clubId: string) {
  return `bb_ledger_${clubId}`
}

export function ledgerCategoryLabel(category: LedgerCategory) {
  return LEDGER_CATEGORIES.find((item) => item.id === category)?.label || '기타'
}

export function ledgerSideLabel(side: LedgerSide) {
  return side === 'in' ? '수입' : '지출'
}

function rowToEntry(row: any): LedgerEntry {
  return {
    id: row.id,
    clubId: row.club_id,
    entryDate: String(row.entry_date).slice(0, 10),
    side: row.side === 'in' ? 'in' : 'out',
    category: (['dues', 'venue', 'drinks', 'other'].includes(row.category) ? row.category : 'other') as LedgerCategory,
    title: row.title,
    amount: Number(row.amount) || 0,
    memo: row.memo || '',
    receiptUrl: row.receipt_url || '',
    receiptPublic: row.receipt_public !== false,
    createdBy: row.created_by || undefined,
  }
}

function readLocal(clubId: string): LedgerEntry[] {
  if (typeof window === 'undefined') return []
  const raw = window.localStorage.getItem(storageKey(clubId))
  return raw ? (JSON.parse(raw) as LedgerEntry[]) : []
}

function writeLocal(clubId: string, entries: LedgerEntry[]) {
  window.localStorage.setItem(storageKey(clubId), JSON.stringify(entries))
}

export function monthKeyFromDate(date: string) {
  return date.slice(0, 7)
}

export function filterLedgerMonth(entries: LedgerEntry[], monthKey: string) {
  return entries.filter((item) => monthKeyFromDate(item.entryDate) === monthKey)
}

export function ledgerTotals(entries: LedgerEntry[]) {
  const income = entries.filter((item) => item.side === 'in').reduce((sum, item) => sum + item.amount, 0)
  const expense = entries.filter((item) => item.side === 'out').reduce((sum, item) => sum + item.amount, 0)
  return { income, expense, net: income - expense }
}

export async function listLedgerEntries(clubId: string): Promise<LedgerEntry[]> {
  const { data, error } = await supabase
    .from('club_ledger_entries')
    .select('*')
    .eq('club_id', clubId)
    .order('entry_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error && !isMissingSchema(error)) throw error
  if (isMissingSchema(error) || !data) return readLocal(clubId)
  return data.map(rowToEntry)
}

export async function listPublicReceipts(clubId: string): Promise<LedgerEntry[]> {
  const all = await listLedgerEntries(clubId)
  return all.filter((item) => item.receiptUrl && item.receiptPublic)
}

async function compressReceipt(file: File): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('영수증을 읽지 못했습니다.'))
    reader.readAsDataURL(file)
  })
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const max = 1280
      const scale = Math.min(1, max / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * scale))
      canvas.height = Math.max(1, Math.round(img.height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('영수증을 처리하지 못했습니다.'))
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => {
          if (!blob) reject(new Error('영수증을 변환하지 못했습니다.'))
          else resolve(blob)
        },
        'image/jpeg',
        0.72
      )
    }
    img.onerror = () => reject(new Error('영수증 이미지를 열지 못했습니다.'))
    img.src = dataUrl
  })
}

async function uploadReceipt(clubId: string, entryId: string, file: File): Promise<string> {
  const blob = await compressReceipt(file)
  const path = `${clubId}/${entryId}.jpg`
  const uploaded = await supabase.storage.from('club-receipts').upload(path, blob, {
    upsert: true,
    contentType: 'image/jpeg',
  })
  if (!uploaded.error) {
    const { data } = supabase.storage.from('club-receipts').getPublicUrl(path)
    if (data.publicUrl) return `${data.publicUrl}?t=${Date.now()}`
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('영수증을 저장하지 못했습니다.'))
    reader.readAsDataURL(blob)
  })
  if (dataUrl.length > 700_000) {
    throw new Error('영수증 사진이 너무 큽니다. 더 작은 사진으로 다시 첨부해 주세요.')
  }
  return dataUrl
}

export async function saveLedgerEntry(entry: LedgerEntry, receiptFile?: File | null): Promise<LedgerEntry> {
  const next = { ...entry, id: entry.id || newId() }
  if (receiptFile) {
    next.receiptUrl = await uploadReceipt(next.clubId, next.id, receiptFile)
  }
  const payload = {
    id: next.id,
    club_id: next.clubId,
    entry_date: next.entryDate,
    side: next.side,
    category: next.category,
    title: next.title,
    amount: next.amount,
    memo: next.memo,
    receipt_url: next.receiptUrl || null,
    receipt_public: next.receiptPublic,
    created_by: next.createdBy || null,
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('club_ledger_entries').upsert(payload)
  if (error && !isMissingSchema(error)) throw error
  if (isMissingSchema(error)) {
    writeLocal(next.clubId, [next, ...readLocal(next.clubId).filter((item) => item.id !== next.id)])
  }
  return next
}

export async function deleteLedgerEntry(clubId: string, entryId: string): Promise<void> {
  const { error } = await supabase.from('club_ledger_entries').delete().eq('id', entryId)
  if (error && !isMissingSchema(error)) throw error
  writeLocal(
    clubId,
    readLocal(clubId).filter((item) => item.id !== entryId)
  )
  await supabase.storage.from('club-receipts').remove([`${clubId}/${entryId}.jpg`])
}

export function emptyLedgerEntry(clubId: string, userId?: string): LedgerEntry {
  const today = new Date().toISOString().slice(0, 10)
  return {
    id: '',
    clubId,
    entryDate: today,
    side: 'in',
    category: 'dues',
    title: '월 회비',
    amount: 0,
    memo: '',
    receiptUrl: '',
    receiptPublic: true,
    createdBy: userId,
  }
}
