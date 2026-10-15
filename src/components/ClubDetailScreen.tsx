import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { BackButton, EmptyCard, Spinner } from './ui';
import {
  clubRowToSettings,
  descriptionPreview,
  generateInviteCode,
  inviteUrl,
  parseClubSettings,
  qrImageUrl,
  TIER_OPTIONS,
} from '../clubSettings';
import { inviteShareText } from '../appLinks';
import { isOwnerRole, isStaffRole, listStaffUserIds } from '../clubMembership';
import { loadClubRoster } from '../clubRoster';
import { notifyUsers } from '../clubGames';
import ClubBillingPanel from './ClubBillingPanel';
import CloseClubPanel from './CloseClubPanel';
import ClubNoticePanel from './ClubNoticePanel';
import { getClubAccess } from '../clubBilling';

export type MembershipStatus = 'none' | 'pending' | 'member' | 'leader';

interface ClubDetailScreenProps {
  clubId: string;
  userId?: string;
  onBack: () => void;
  onGoToLogin?: () => void;
  onOpenManageScreen: (clubId: string) => void;
  onOpenTeams?: (clubId: string, canEdit: boolean) => void;
  onOpenGames?: (clubId: string, options?: { gameId?: string; canEdit?: boolean }) => void;
  onOpenOps?: (clubId: string, options?: { canEdit?: boolean }) => void;
  onClubClosed?: () => void;
}

interface ClubInfo {
  id: string;
  name: string;
  region: string;
  category: string;
  description: string;
  emoji: string;
  created_at: string;
  invite_code?: string | null;
  emblem_url?: string | null;
  region_sido?: string | null;
  region_sigungu?: string | null;
  home_court?: string | null;
  practice_days?: string[] | null;
  practice_time_start?: string | null;
  practice_time_end?: string | null;
  purpose?: string | null;
  age_group?: string | null;
  gender?: string | null;
  skill_tier?: string | null;
  dues_amount?: number | string | null;
  dues_day?: number | null;
  penalty_rules?: string | null;
}

export default function ClubDetailScreen({
  clubId,
  userId,
  onBack,
  onGoToLogin,
  onOpenManageScreen,
  onOpenTeams,
  onOpenGames,
  onOpenOps,
  onClubClosed,
}: ClubDetailScreenProps) {
  const [club, setClub] = useState<ClubInfo | null>(null);
  const [memberCount, setMemberCount] = useState<number>(0);
  const [membershipStatus, setMembershipStatus] = useState<MembershipStatus>('none');
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [showApplyModal, setShowApplyModal] = useState<boolean>(false);
  const [applyReason, setApplyReason] = useState<string>('');
  const [loadingApply, setLoadingApply] = useState<boolean>(false);
  const [clubActive, setClubActive] = useState(true);
  const [isOwner, setIsOwner] = useState(false);
  const [copyState, setCopyState] = useState('');

  const resolveMembershipStatus = (
    memberData: { role?: string | null; status?: string | null } | null
  ): MembershipStatus => {
    if (!memberData) return 'none';
    if (isStaffRole(memberData.role)) return 'leader';
    if (memberData.status === 'pending') return 'pending';
    if (memberData.status === 'approved' || memberData.status == null) return 'member';
    return 'none';
  };

  useEffect(() => {
    fetchClubDetail();
  }, [clubId, userId]);

  const fetchClubDetail = async () => {
    setLoading(true);
    try {
      const { data: clubData, error: clubError } = await supabase
        .from('clubs')
        .select('*')
        .eq('id', clubId)
        .single();

      if (clubError) throw clubError;
      setClub(clubData);

      const access = await getClubAccess(clubId)
      setClubActive(access.unknown || access.active)

      const { count, error: countError } = await supabase
        .from('club_members')
        .select('*', { count: 'exact', head: true })
        .eq('club_id', clubId)
        .or('status.eq.approved,status.is.null');

      if (!countError && count !== null) setMemberCount(count);

      if (userId) {
        const { data: memberData } = await supabase
          .from('club_members')
          .select('role, status')
          .eq('club_id', clubId)
          .eq('user_id', userId)
          .maybeSingle();
        setMembershipStatus(resolveMembershipStatus(memberData));
        setIsOwner(isOwnerRole(memberData?.role));
        const settingsRow = clubRowToSettings(clubData);
        if (isStaffRole(memberData?.role) && !settingsRow?.inviteCode) {
          const code = generateInviteCode();
          await supabase.from('clubs').update({ invite_code: code }).eq('id', clubId);
          setClub({ ...clubData, invite_code: code });
        }
      } else {
        setMembershipStatus('none');
        setIsOwner(false);
      }
    } catch (err: any) {
      console.error('동호회 정보 불러오기 오류:', err);
      alert('동호회 정보를 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!userId) {
      alert('로그인이 필요합니다.');
      onGoToLogin?.();
      return;
    }

    if (!applyReason.trim()) {
      alert('가입 신청 한마디를 입력해 주세요.');
      return;
    }

    setLoadingApply(true);
    try {
      const roster = await loadClubRoster(clubId);
      const { data: userRow } = await supabase.from('users').select('name').eq('id', userId).maybeSingle();
      const userName = userRow?.name || '';
      const blocked = roster.guests.find(
        (guest) => guest.list === 'black' && guest.name.replace(/\s/g, '') === userName.replace(/\s/g, '')
      );
      if (blocked) {
        alert('블랙리스트에 등록되어 이 동아리에 가입할 수 없습니다.');
        return;
      }

      const insertRow: Record<string, unknown> = {
        club_id: clubId,
        user_id: userId,
        role: 'member',
        status: 'pending',
        apply_reason: applyReason.trim(),
      }
      let { error } = await supabase.from('club_members').insert([insertRow]);
      if (error && /apply_reason/i.test(error.message || '')) {
        delete insertRow.apply_reason
        const retry = await supabase.from('club_members').insert([insertRow]);
        error = retry.error
      }

      if (error) throw error;
      try {
        const staffIds = (await listStaffUserIds(clubId)).filter((id) => id !== userId)
        if (staffIds.length) {
          await notifyUsers({
            clubId,
            userIds: staffIds,
            kind: 'join_request',
            title: `[림] ${club?.name || '동아리'} 가입 신청`,
            body: `${userName || '회원'} 님이 가입을 신청했습니다.${applyReason.trim() ? ` · ${applyReason.trim()}` : ''}`,
          })
        }
      } catch (notifyErr) {
        console.error('가입 신청 알림 실패:', notifyErr)
      }
      alert('가입 신청이 완료되었습니다. 방장 승인을 기다려 주세요.');
      setMembershipStatus('pending');
      setShowApplyModal(false);
      setApplyReason('');
    } catch (err: any) {
      console.error('가입 신청 실패:', err);
      alert('가입 신청 중 오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      setLoadingApply(false);
    }
  };

  const handleCancelApplication = async () => {
    if (!userId) return;
    if (!confirm('가입 신청을 취소하시겠습니까?')) return;

    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('club_members')
        .delete()
        .eq('club_id', clubId)
        .eq('user_id', userId);

      if (error) throw error;
      alert('가입 신청이 취소되었습니다.');
      setMembershipStatus('none');
    } catch (err: any) {
      console.error('신청 취소 에러:', err);
      alert('신청 취소 실패: ' + (err.message || '다시 시도해 주세요.'));
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bb-screen">
        <Spinner label="동호회 정보를 불러오는 중..." />
      </div>
    );
  }

  if (!club) {
    return (
      <div className="bb-screen px-5 justify-center">
        <EmptyCard title="존재하지 않거나 삭제된 동호회입니다">
          <button type="button" onClick={onBack} className="bb-btn-ghost mt-4">
            돌아가기
          </button>
        </EmptyCard>
      </div>
    );
  }

  const settings = clubRowToSettings(club) || parseClubSettings(club.description);
  const intro = descriptionPreview(club.description);
  const shareUrl = settings?.inviteCode ? inviteUrl(settings.inviteCode) : '';
  const tierLabel = TIER_OPTIONS.find((item) => item.value === settings?.skillTier)?.label;
  const guardUse = (run: () => void) => {
    if (!clubActive) {
      alert('이용 기간이 만료되었습니다. 감독이 월 이용료를 이체한 뒤 운영자 확인이 필요합니다.');
      return;
    }
    run();
  };

  return (
    <div className="flex min-h-full flex-col bg-canvas text-ink">
      <header className="bb-header">
        <BackButton onClick={onBack} />
        <h1 className="text-base font-semibold text-ink truncate">동호회</h1>
      </header>

      <main className="flex-1 p-5 space-y-4">
        <div className="bb-card overflow-hidden">
          <div className="bg-navy px-5 py-6 text-white">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-white/50 mb-2">
                  {settings?.purpose || club.category || '일반 동호회'}
                </p>
                <h2 className="text-xl font-semibold leading-snug">{club.name}</h2>
                <p className="text-sm text-white/65 mt-1">{club.region}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-white/10 overflow-hidden flex items-center justify-center text-2xl">
                {settings?.emblemDataUrl ? (
                  <img src={settings.emblemDataUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  club.emoji || '🏀'
                )}
              </div>
            </div>
            <div className="flex gap-8 mt-6 pt-4 border-t border-white/10">
              <div>
                <p className="text-[11px] text-white/45">멤버</p>
                <p className="text-sm font-semibold mt-0.5">{memberCount}명</p>
              </div>
              <div>
                <p className="text-[11px] text-white/45">개설일</p>
                <p className="text-sm font-semibold mt-0.5">
                  {new Date(club.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>
        </div>

        <ClubNoticePanel clubId={clubId} userId={userId} canEdit={isOwner} />

        {membershipStatus === 'leader' && (
          <ClubBillingPanel clubId={clubId} userId={userId} canManage />
        )}

        {(membershipStatus === 'leader' || membershipStatus === 'member') && (
          <div className="space-y-3">
            <button
              type="button"
              className="bb-card w-full p-4 text-left"
              onClick={() => guardUse(() => onOpenOps?.(clubId, { canEdit: membershipStatus === 'leader' }))}
            >
              <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">운영</p>
              <p className="text-sm font-semibold mt-1">월간·주간 일정 · 체육관 대관</p>
              <p className="text-[11px] text-muted mt-0.5">정기 운동 달력과 대관처 약도를 한곳에서 봅니다</p>
            </button>
            <button
              type="button"
              className="bb-card w-full p-4 text-left"
              onClick={() => guardUse(() => onOpenGames?.(clubId, { canEdit: membershipStatus === 'leader' }))}
            >
              <p className="text-[11px] font-semibold tracking-wide text-muted uppercase">경기</p>
              <p className="text-sm font-semibold mt-1">경기 일정 · 스코어보드 · 영상</p>
              <p className="text-[11px] text-muted mt-0.5">참여 여부를 선택하고 기록을 확인하세요</p>
            </button>
          </div>
        )}

        <section className="bb-card p-5">
          <h3 className="text-xs font-semibold tracking-wide text-muted uppercase mb-3">모임 정보</h3>
          <ul className="text-sm space-y-3">
            <li className="flex justify-between gap-4">
              <span className="text-muted shrink-0">지역</span>
              <span className="font-medium text-ink text-right">{club.region}</span>
            </li>
            {settings?.homeCourt && (
              <li className="flex justify-between gap-4">
                <span className="text-muted shrink-0">홈 코트</span>
                <span className="font-medium text-ink text-right">{settings.homeCourt}</span>
              </li>
            )}
            {settings && (
              <li className="flex justify-between gap-4">
                <span className="text-muted shrink-0">운동 시간</span>
                <span className="font-medium text-ink text-right">
                  {settings.practiceDays.join(', ')} {settings.practiceTimeStart}–{settings.practiceTimeEnd}
                </span>
              </li>
            )}
            <li className="flex justify-between gap-4">
              <span className="text-muted shrink-0">목적</span>
              <span className="font-medium text-ink text-right">{settings?.purpose || club.category}</span>
            </li>
            {settings && (
              <>
                <li className="flex justify-between gap-4">
                  <span className="text-muted shrink-0">구성</span>
                  <span className="font-medium text-ink text-right">{settings.gender} · {settings.ageGroup}</span>
                </li>
                <li className="flex justify-between gap-4">
                  <span className="text-muted shrink-0">실력대</span>
                  <span className="font-medium text-ink text-right">{tierLabel}</span>
                </li>
                <li className="flex justify-between gap-4">
                  <span className="text-muted shrink-0">회비</span>
                  <span className="font-medium text-ink text-right">
                    매월 {settings.duesDay}일 {settings.duesAmount.toLocaleString('ko-KR')}원
                  </span>
                </li>
              </>
            )}
          </ul>
        </section>

        {settings?.penaltyRules && (
          <section className="bb-card p-5 space-y-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">출석 / 지각 규정</h3>
            <p className="text-sm text-ink leading-relaxed whitespace-pre-line">{settings.penaltyRules}</p>
          </section>
        )}

        {intro && !settings && (
          <section className="bb-card p-5 space-y-2">
            <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">소개</h3>
            <p className="text-sm text-ink leading-relaxed whitespace-pre-line">{intro}</p>
          </section>
        )}

        {membershipStatus === 'leader' && settings?.inviteCode && (
          <section className="bb-card p-5 space-y-3">
            <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">초대</h3>
            <img src={qrImageUrl(shareUrl)} alt="초대 QR" className="w-32 h-32 rounded-lg border border-line" />
            <p className="text-sm font-semibold text-ink">초대 코드 {settings.inviteCode}</p>
            <p className="text-[11px] break-all text-muted">{shareUrl}</p>
            {copyState && <p className="text-xs text-navy">{copyState}</p>}
            <button
              type="button"
              className="bb-btn-ghost w-full"
              onClick={() => {
                const text = inviteShareText(club.name, settings.inviteCode, shareUrl);
                void navigator.clipboard.writeText(text).then(
                  () => setCopyState('초대 문구를 복사했습니다. 카카오톡에 붙여 넣으세요.'),
                  () => setCopyState('복사에 실패했습니다. 링크를 직접 선택해 복사해 주세요.')
                );
              }}
            >
              초대 링크 복사
            </button>
            {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
              <button
                type="button"
                className="bb-btn-primary w-full"
                onClick={() => {
                  const text = inviteShareText(club.name, settings.inviteCode, shareUrl);
                  void navigator.share({ title: `${club.name} 초대`, text, url: shareUrl }).catch(() => {});
                }}
              >
                공유하기
              </button>
            )}
          </section>
        )}

        {membershipStatus === 'leader' && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => guardUse(() => onOpenManageScreen(clubId))}
              className="bb-btn-ghost flex-1"
            >
              멤버
            </button>
            <button
              type="button"
              onClick={() => guardUse(() => onOpenOps?.(clubId, { canEdit: true }))}
              className="bb-btn-ghost flex-1"
            >
              운영
            </button>
            <button
              type="button"
              onClick={() => guardUse(() => onOpenGames?.(clubId, { canEdit: true }))}
              className="bb-btn-primary flex-1"
            >
              경기
            </button>
          </div>
        )}

        {isOwner && userId && (
          <CloseClubPanel
            clubId={clubId}
            clubName={club.name}
            userId={userId}
            onClosed={() => onClubClosed?.()}
          />
        )}

        {membershipStatus === 'pending' && (
          <div className="flex gap-2">
            <div className="flex-1 py-3.5 bg-canvas text-muted text-center font-semibold text-sm rounded-xl border border-line">
              승인 대기 중
            </div>
            <button
              type="button"
              onClick={handleCancelApplication}
              disabled={actionLoading}
              className="bb-btn-ghost"
            >
              {actionLoading ? '취소 중...' : '신청 취소'}
            </button>
          </div>
        )}

        {membershipStatus === 'member' && (
          <div className="space-y-2">
            <button type="button" className="bb-btn-ghost w-full" onClick={() => guardUse(() => onOpenOps?.(clubId, { canEdit: false }))}>
              운영 · 대관
            </button>
            <button type="button" className="bb-btn-ghost w-full" onClick={() => guardUse(() => onOpenGames?.(clubId, { canEdit: false }))}>
              경기 일정
            </button>
            <button type="button" className="bb-btn-ghost w-full" onClick={() => guardUse(() => onOpenTeams?.(clubId, false))}>
              오늘 라인업
            </button>
            <div className="w-full py-3.5 bg-emerald-50 text-emerald-800 text-center font-semibold text-sm rounded-xl border border-emerald-100">
              가입된 회원입니다
            </div>
          </div>
        )}

        {(membershipStatus === 'none' || !membershipStatus) && (
          <button
            type="button"
            onClick={() => {
              if (!userId) {
                onGoToLogin?.();
                return;
              }
              setShowApplyModal(true);
            }}
            className="bb-btn-accent"
          >
            가입 신청
          </button>
        )}
      </main>


      {showApplyModal && (
        <div className="fixed inset-0 bg-navy/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-md rounded-2xl p-6 shadow-xl space-y-4">
            <h3 className="text-base font-semibold text-ink">가입 신청</h3>
            <p className="text-xs text-muted">방장에게 전달할 간단한 소개를 적어 주세요.</p>
            <form onSubmit={handleApplySubmit} className="space-y-4">
              <textarea
                value={applyReason}
                onChange={(e) => setApplyReason(e.target.value)}
                placeholder="주말 모임에 꾸준히 참여하고 싶습니다."
                rows={4}
                className="bb-input resize-none"
                required
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowApplyModal(false)} className="bb-btn-ghost flex-1">
                  취소
                </button>
                <button type="submit" disabled={loadingApply} className="bb-btn-primary flex-1">
                  {loadingApply ? '신청 중...' : '보내기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
