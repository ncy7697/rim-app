import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../supabaseClient';
import { EmptyCard, Spinner } from './ui';
import { fetchOwnedClub, isOwnerRole } from '../clubMembership';
import { readSavedUser, saveCurrentUser } from '../authSession';
import {
  disablePushForUser,
  enablePushForUser,
  getPushPermissionStatus,
  isNativePushAvailable,
  isPushEnabled,
} from '../pushNotifications';

interface UserProfile {
  id?: string;
  name: string;
  login_id?: string | null;
  birthdate?: string;
  height?: number | null;
  weight?: number | null;
  position?: string;
}

interface Club {
  id: string;
  name: string;
  emoji: string;
  category: string;
  role?: string;
}

interface ProfileScreenProps {
  userId?: string;
  onGoToClubList?: () => void;
  onCreateClub?: () => void;
  onGoToLogin?: () => void;
  onProfileUpdated?: (patch: { name: string }) => void;
}

export default function ProfileScreen({
  userId,
  onGoToClubList,
  onCreateClub,
  onGoToLogin,
  onProfileUpdated,
}: ProfileScreenProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [myClubs, setMyClubs] = useState<Club[]>([]);
  const [ownedClubName, setOwnedClubName] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [pushOn, setPushOn] = useState(true);
  const [pushPermission, setPushPermission] = useState<'granted' | 'denied' | 'prompt' | 'unavailable'>('prompt');
  const [pushSaving, setPushSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    birthdate: '',
    height: '',
    weight: '',
    position: 'ALL',
  });

  const positionMap: Record<string, string> = {
    PG: '포인트가드 · PG',
    SG: '슈팅가드 · SG',
    SF: '스몰포워드 · SF',
    PF: '파워포워드 · PF',
    C: '센터 · C',
    ALL: '올라운더 · ALL',
  };

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setMyClubs([]);
      setOwnedClubName(null);
      setLoading(false);
      return;
    }

    async function fetchProfileAndClubs(id: string) {
      setLoading(true);
      try {
        const { data: userData, error: userErr } = await supabase
          .from('users')
          .select('name, birthdate, height, weight, position, login_id')
          .eq('id', id)
          .single();
        if (userErr && /login_id/i.test(userErr.message || '')) {
          const retry = await supabase
            .from('users')
            .select('name, birthdate, height, weight, position')
            .eq('id', id)
            .single();
          if (retry.data) setProfile(retry.data);
        } else if (userData) setProfile(userData);

        const { data: clubData, error: clubErr } = await supabase
          .from('club_members')
          .select('role, status, clubs(id, name, emoji, category)')
          .eq('user_id', id);

        if (!clubErr && clubData) {
          setMyClubs(
            clubData
              .filter((item: any) => item.role === 'leader' || item.role === 'owner' || item.status === 'approved' || item.status == null)
              .map((item: any) => ({
                ...item.clubs,
                role: item.role,
              }))
              .filter((item: Club) => item?.id)
          );
        }

        const owned = await fetchOwnedClub(id);
        setOwnedClubName(owned?.name || null);
        setPushOn(isPushEnabled(id));
        setPushPermission(await getPushPermissionStatus());
      } catch (err) {
        console.error('내정보 및 동호회 조회 에러:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchProfileAndClubs(userId);
  }, [userId]);

  const startEdit = () => {
    if (!profile) return;
    setForm({
      name: profile.name || '',
      birthdate: String(profile.birthdate || '').slice(0, 10),
      height: profile.height != null ? String(profile.height) : '',
      weight: profile.weight != null ? String(profile.weight) : '',
      position: profile.position || 'ALL',
    });
    setEditing(true);
  };

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault();
    if (!userId || !profile) return;
    if (!form.name.trim()) {
      alert('이름을 입력해 주세요.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('update_my_profile', {
        p_user_id: userId,
        p_name: form.name.trim(),
        p_birthdate: form.birthdate || null,
        p_height: form.height ? Number(form.height) : null,
        p_weight: form.weight ? Number(form.weight) : null,
        p_position: form.position,
      });
      if (error) throw error;
      const next = {
        ...profile,
        name: form.name.trim(),
        birthdate: form.birthdate || undefined,
        height: form.height ? Number(form.height) : null,
        weight: form.weight ? Number(form.weight) : null,
        position: form.position,
      };
      setProfile(next);
      saveCurrentUser({ ...(readSavedUser<Record<string, unknown>>() || {}), name: next.name });
      onProfileUpdated?.({ name: next.name });
      setEditing(false);
    } catch (err: any) {
      alert(err.message || '프로필을 저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const togglePush = async () => {
    if (!userId) return
    setPushSaving(true)
    try {
      if (pushOn) {
        await disablePushForUser(userId)
        setPushOn(false)
      } else {
        await enablePushForUser(userId)
        setPushOn(true)
      }
      setPushPermission(await getPushPermissionStatus())
    } finally {
      setPushSaving(false)
    }
  }

  if (!userId) {
    return (
      <div className="p-5 pt-16">
        <EmptyCard title="로그인이 필요합니다" description="프로필과 활동 내역을 보려면 로그인해 주세요.">
          <button type="button" onClick={onGoToLogin} className="bb-btn-primary mt-4 max-w-xs mx-auto">
            로그인
          </button>
        </EmptyCard>
      </div>
    );
  }

  if (loading) {
    return <Spinner label="내 정보를 불러오는 중..." />;
  }

  if (!profile) {
    return (
      <div className="p-5 pt-10">
        <EmptyCard title="정보를 불러오지 못했습니다" />
      </div>
    );
  }

  const posLabel = positionMap[profile.position || 'ALL'] || positionMap.ALL;

  return (
    <div className="p-5 space-y-4">
      <section className="bb-card overflow-hidden">
        <div className="bg-navy px-5 py-6 text-white">
          <p className="text-[11px] font-semibold tracking-[0.16em] uppercase text-white/45 mb-2">Player</p>
          <h2 className="text-xl font-semibold">{profile.name}</h2>
          <p className="text-sm text-white/70 mt-1">{profile.login_id ? `@${profile.login_id}` : posLabel}</p>
          {profile.login_id && <p className="text-sm text-white/55 mt-0.5">{posLabel}</p>}
        </div>
        {profile.birthdate && (
          <div className="px-5 py-3 text-xs text-muted border-t border-line">생년월일 {String(profile.birthdate).slice(0, 10)}</div>
        )}
      </section>

      {editing ? (
        <form className="bb-card p-5 space-y-3" onSubmit={(e) => void saveProfile(e)}>
          <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">프로필 수정</h3>
          <div>
            <label className="bb-label">아이디</label>
            <input className="bb-input bg-canvas text-muted" value={profile.login_id ? `@${profile.login_id}` : '없음'} disabled />
            <p className="text-[11px] text-muted mt-1">아이디는 바꿀 수 없습니다.</p>
          </div>
          <div>
            <label className="bb-label">이름 *</label>
            <input className="bb-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <label className="bb-label">생년월일</label>
            <input type="date" className="bb-input" value={form.birthdate} onChange={(e) => setForm({ ...form, birthdate: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="bb-label">키 (cm)</label>
              <input type="number" step="0.1" className="bb-input" value={form.height} onChange={(e) => setForm({ ...form, height: e.target.value })} />
            </div>
            <div>
              <label className="bb-label">체중 (kg)</label>
              <input type="number" step="0.1" className="bb-input" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="bb-label">선호 포지션</label>
            <select className="bb-input" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })}>
              <option value="PG">포인트가드 (PG)</option>
              <option value="SG">슈팅가드 (SG)</option>
              <option value="SF">스몰포워드 (SF)</option>
              <option value="PF">파워포워드 (PF)</option>
              <option value="C">센터 (C)</option>
              <option value="ALL">올라운더 (ALL)</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button type="button" className="bb-btn-ghost" onClick={() => setEditing(false)} disabled={saving}>
              취소
            </button>
            <button type="submit" className="bb-btn-primary" disabled={saving}>
              {saving ? '저장 중...' : '저장'}
            </button>
          </div>
        </form>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3">
            <div className="bb-card p-4">
              <span className="text-[11px] font-semibold text-muted">신장</span>
              <p className="text-lg font-semibold text-ink mt-1">{profile.height ? `${profile.height} cm` : '—'}</p>
            </div>
            <div className="bb-card p-4">
              <span className="text-[11px] font-semibold text-muted">체중</span>
              <p className="text-lg font-semibold text-ink mt-1">{profile.weight ? `${profile.weight} kg` : '—'}</p>
            </div>
          </section>
          <button type="button" className="bb-btn-ghost w-full" onClick={startEdit}>
            프로필 수정
          </button>
        </>
      )}

      <section className="bb-card p-5 space-y-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">알림 설정</h3>
        <p className="text-[11px] text-muted leading-relaxed">
          앱 안의 종 아이콘 알림은 항상 볼 수 있습니다. 휴대폰 알림을 켜면 앱이 꺼져 있어도 가입·공지·일정 알림을 받습니다.
        </p>
        <div className="flex items-center justify-between gap-3 p-3 bg-canvas rounded-xl">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">{isNativePushAvailable() ? '휴대폰 알림' : '브라우저 알림'}</p>
            <p className="text-[11px] text-muted mt-0.5">
              {!pushOn
                ? '꺼짐 · 푸시를 보내지 않습니다'
                : pushPermission === 'granted'
                  ? '켜짐 · 시스템 알림 허용됨'
                  : pushPermission === 'denied'
                    ? '권한이 거부됨 · 폰 설정에서 허용해 주세요'
                    : pushPermission === 'unavailable'
                      ? '이 환경에서는 시스템 알림을 쓸 수 없습니다'
                      : '켜짐 · 허용을 요청합니다'}
            </p>
          </div>
          <button
            type="button"
            className={`shrink-0 px-3 py-2 rounded-xl text-xs font-semibold border ${
              pushOn ? 'bg-navy text-white border-navy' : 'bg-white text-muted border-line'
            }`}
            disabled={pushSaving || pushPermission === 'unavailable'}
            onClick={() => void togglePush()}
          >
            {pushSaving ? '처리 중...' : pushOn ? '켜짐' : '꺼짐'}
          </button>
        </div>
        {pushOn && pushPermission === 'denied' && (
          <p className="text-[11px] text-brand leading-relaxed">
            림 알림이 시스템에서 차단되어 있습니다. 휴대폰 설정 → 앱 → 림 → 알림에서 허용한 뒤 다시 켜 주세요.
          </p>
        )}
      </section>

      <section className="bb-card p-5 space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">소속 동호회</h3>
          <span className="text-xs font-semibold text-ink">{myClubs.length}</span>
        </div>

        {myClubs.length === 0 ? (
          <div className="space-y-3">
            <p className="text-xs text-muted leading-relaxed">아직 가입한 동호회가 없습니다. 정회원은 여러 동아리에 가입할 수 있습니다.</p>
            <div className="grid grid-cols-2 gap-2">
              {!ownedClubName && (
                <button type="button" onClick={onCreateClub} className="bb-btn-ghost text-xs py-3">
                  개설
                </button>
              )}
              <button type="button" onClick={onGoToClubList} className={`bb-btn-primary text-xs py-3 ${ownedClubName ? 'col-span-2' : ''}`}>
                가입
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {myClubs.map((club) => (
              <div key={club.id} className="flex items-center justify-between p-3 bg-canvas rounded-xl">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="text-base">{club.emoji || '🏀'}</span>
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-ink truncate">{club.name}</h4>
                    <span className="text-[10px] text-muted">{club.category}</span>
                  </div>
                </div>
                <span className="bb-chip bg-white text-navy border border-line">
                  {isOwnerRole(club.role) ? '감독' : '정회원'}
                </span>
              </div>
            ))}
            {ownedClubName ? (
              <p className="text-[11px] text-muted pt-1">감독 개설은 1개로 제한됩니다. 다른 동아리에는 정회원으로 가입할 수 있습니다.</p>
            ) : (
              <button type="button" onClick={onCreateClub} className="bb-btn-ghost w-full text-xs py-3 mt-1">
                동아리 개설
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
