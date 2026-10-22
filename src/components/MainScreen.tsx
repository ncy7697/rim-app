import { useState, useEffect, type ReactNode } from 'react';
import { supabase } from '../supabaseClient';
import ProfileScreen from './ProfileScreen';
import RegisterScreen from './RegisterScreen';
import LoginScreen from './LoginScreen';
import CreateClubScreen from './CreateClubScreen';
import ClubDetailScreen from './ClubDetailScreen';
import ClubManageScreen from './ClubManageScreen';
import TeamComposeScreen from './TeamComposeScreen';
import GameScheduleScreen from './GameScheduleScreen';
import ClubOpsScreen from './ClubOpsScreen';
import PlatformAdminScreen from './PlatformAdminScreen';
import NotificationBell from './NotificationBell';
import { BrandMark, EmptyCard, IconClub, IconHome, IconUser, Spinner } from './ui';
import { clubRowToSettings } from '../clubSettings';
import {
  parseAppLink,
  peekPendingInviteCode,
  readLaunchAppUrl,
  rememberInviteCode,
  subscribeAppUrlOpen,
  takePendingInviteCode,
} from '../appLinks';
import { isOwnerRole, isStaffRole } from '../clubMembership';
import { getClubAccess } from '../clubBilling';
import {
  findClubIdByInviteCode,
  recordSessionAttendance,
} from '../clubRoster';
import { getGame, requestBrowserNotifications } from '../clubGames';
import { isPushEnabled, registerPushForUser, unregisterPushForUser } from '../pushNotifications';
import { clearCurrentUser, readSavedUser, saveCurrentUser } from '../authSession';
import { consumeNaverCallback } from '../naverAuth';
import { consumeKakaoCallback } from '../kakaoAuth';

interface UserProfile {
  id: string;
  name: string;
  is_platform_admin?: boolean;
}

interface Club {
  id: string;
  name: string;
  region: string;
  category: string;
  emoji: string;
  description: string;
  emblem_url?: string | null;
}

interface PendingApplication {
  id: string;
  club_id: string;
  club_name: string;
  club_emoji: string;
  club_region: string;
  created_at: string;
}

interface MyClubSummary {
  id: string;
  name: string;
  emoji: string;
  region: string;
  role: string;
}

export default function MainScreen() {
  const [activeTab, setActiveTab] = useState<'home' | 'myClub' | 'profile'>('home');
  const [viewState, setViewState] = useState<'main' | 'login' | 'register' | 'createClub' | 'clubDetail' | 'manage' | 'teams' | 'games' | 'ops' | 'platformAdmin'>('main');
  const [opsCanEdit, setOpsCanEdit] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loadingClubs, setLoadingClubs] = useState<boolean>(true);
  const [myClubs, setMyClubs] = useState<MyClubSummary[]>([]);
  const [pendingApplications, setPendingApplications] = useState<PendingApplication[]>([]);
  const [loadingMyClub, setLoadingMyClub] = useState<boolean>(false);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [teamsCanEdit, setTeamsCanEdit] = useState(false);
  const [gamesCanEdit, setGamesCanEdit] = useState(false);
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [inviteInput, setInviteInput] = useState('');
  const [inviteOpening, setInviteOpening] = useState(false);

  useEffect(() => {
    const applyUser = (user: UserProfile) => {
      setCurrentUser(user);
      if (user.is_platform_admin) {
        setViewState('platformAdmin');
      } else {
        fetchMyClub(user.id);
      }
      if (isPushEnabled(user.id)) {
        void requestBrowserNotifications();
        void registerPushForUser(user.id);
      }
    };

    void consumeKakaoCallback()
      .then(async (kakaoUser) => {
        if (kakaoUser) return kakaoUser
        return consumeNaverCallback()
      })
      .then((socialUser) => {
        if (socialUser) {
          applyUser(socialUser);
          setViewState('main');
          setActiveTab('home');
          return;
        }
        const savedUser = readSavedUser<UserProfile>();
        if (savedUser) applyUser(savedUser);
      })
      .catch((err: { message?: string }) => {
        alert(err.message || '소셜 로그인에 실패했습니다.');
        setViewState('login');
        const savedUser = readSavedUser<UserProfile>();
        if (savedUser) applyUser(savedUser);
      })
      .finally(() => {
        void (async () => {
          const launch = await readLaunchAppUrl();
          await applyDeepLink(launch);
          if (!launch) await applyDeepLink();
        })();
      });
    fetchClubs();
    let stopListen = () => {};
    void subscribeAppUrlOpen((url) => {
      void applyDeepLink(url);
    }).then((stop) => {
      stopListen = stop;
    });
    return () => stopListen();
  }, []);

  const applyDeepLink = async (rawUrl?: string | null) => {
    const fromUrl = parseAppLink(rawUrl || (typeof window !== 'undefined' ? window.location.href : ''));
    const pendingCode = peekPendingInviteCode();
    const link = fromUrl || (pendingCode ? { kind: 'invite' as const, code: pendingCode } : null);
    if (!link) return;
    if (link.kind === 'invite') {
      rememberInviteCode(link.code);
      await openInviteCode(link.code, true);
      return;
    }
    if (link.kind === 'attend') {
      await openAttendFromUrl(link.clubId, link.sessionId);
      return;
    }
    await openGameFromUrl(link.gameId);
  };

  const openInviteCode = async (rawCode: string, fromLink = false) => {
    const code = rawCode.trim().toUpperCase();
    if (!code) {
      if (!fromLink) alert('초대 코드를 입력해 주세요.');
      return;
    }
    setInviteOpening(true);
    try {
      const clubId = await findClubIdByInviteCode(code);
      if (!clubId) {
        alert('유효하지 않은 초대 코드입니다.');
        return;
      }
      takePendingInviteCode();
      setSelectedClubId(clubId);
      setViewState('clubDetail');
    } catch (err) {
      console.error('초대 링크 처리 실패:', err);
      alert('초대 링크를 열지 못했습니다.');
    } finally {
      setInviteOpening(false);
    }
  };

  const openAttendFromUrl = async (clubId: string, sessionId: string) => {
    const user = readSavedUser<UserProfile>();
    if (!user) {
      setViewState('login');
      return;
    }
    try {
      const { data: membership } = await supabase
        .from('club_members')
        .select('id, role, status')
        .eq('club_id', clubId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!membership || (membership.status === 'pending')) {
        alert('이 동아리 멤버만 출석할 수 있습니다.');
        setSelectedClubId(clubId);
        setViewState('clubDetail');
        return;
      }
      await recordSessionAttendance({
        clubId,
        sessionId,
        userId: user.id,
        method: 'qr',
      });
      alert('출석이 기록되었습니다.');
      setSelectedClubId(clubId);
      setViewState(isStaffRole(membership.role) ? 'manage' : 'clubDetail');
    } catch (err) {
      console.error('출석 처리 실패:', err);
      alert('출석을 기록하지 못했습니다.');
    }
  };

  const openGameFromUrl = async (gameId: string) => {
    const user = readSavedUser<UserProfile>();
    if (!user) {
      setViewState('login');
      return;
    }
    try {
      const game = await getGame(gameId);
      if (!game) return;
      const { data: membership } = await supabase
        .from('club_members')
        .select('role, status')
        .eq('club_id', game.clubId)
        .eq('user_id', user.id)
        .maybeSingle();
      setSelectedClubId(game.clubId);
      setSelectedGameId(game.id);
      setGamesCanEdit(isStaffRole(membership?.role));
      setViewState('games');
    } catch (err) {
      console.error('경기 링크 처리 실패:', err);
    }
  };

  const fetchClubs = async () => {
    setLoadingClubs(true);
    try {
      const { data, error } = await supabase
        .from('clubs')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setClubs(data);
    } catch (err: any) {
      console.error('동호회 목록 불러오기 실패:', err);
    } finally {
      setLoadingClubs(false);
    }
  };

  const fetchMyClub = async (userId: string) => {
    setLoadingMyClub(true);
    try {
      const { data, error } = await supabase
        .from('club_members')
        .select(`
          club_id,
          role,
          status,
          clubs:club_id (
            id,
            name,
            emoji,
            region
          )
        `)
        .eq('user_id', userId)
        .or('role.eq.leader,status.eq.approved,status.is.null')
        .order('id', { ascending: false });

      if (error) throw error;

      const formattedClubs: MyClubSummary[] = (data || []).map((item: any) => ({
        id: item.clubs?.id || item.club_id,
        name: item.clubs?.name || '동호회',
        emoji: item.clubs?.emoji || '🏀',
        region: item.clubs?.region || '',
        role: item.role || 'member',
      }));
      setMyClubs(formattedClubs);

      const { data: pendingData, error: pendingError } = await supabase
        .from('club_members')
        .select(`
          id,
          club_id,
          created_at,
          clubs:club_id (
            name,
            emoji,
            region
          )
        `)
        .eq('user_id', userId)
        .eq('status', 'pending')
        .order('id', { ascending: false });

      if (pendingError) throw pendingError;

      setPendingApplications(
        (pendingData || []).map((item: any) => ({
          id: item.id,
          club_id: item.club_id,
          club_name: item.clubs?.name || '동호회',
          club_emoji: item.clubs?.emoji || '🏀',
          club_region: item.clubs?.region || '',
          created_at: item.created_at,
        }))
      );
    } catch (err: any) {
      console.error('내 동호회 조회 에러:', err);
    } finally {
      setLoadingMyClub(false);
    }
  };

  const handleCancelApplication = async (applicationId: string, clubName: string) => {
    if (!confirm(`'${clubName}' 동호회 가입 신청을 취소하시겠습니까?`)) return;

    setCancelingId(applicationId);
    try {
      const { error } = await supabase.from('club_members').delete().eq('id', applicationId);
      if (error) throw error;
      alert('가입 신청이 취소되었습니다.');
      if (currentUser) fetchMyClub(currentUser.id);
    } catch (err: any) {
      console.error('신청 취소 실패:', err);
      alert('신청 취소 중 오류가 발생했습니다.');
    } finally {
      setCancelingId(null);
    }
  };

  const handleLogout = () => {
    void unregisterPushForUser(currentUser?.id);
    clearCurrentUser();
    setCurrentUser(null);
    setMyClubs([]);
    setPendingApplications([]);
    setActiveTab('home');
    setViewState('main');
  };

  const handleClubCardClick = (clubId: string) => {
    setSelectedClubId(clubId);
    setViewState('clubDetail');
  };

  const ensureClubActive = async (clubId: string) => {
    const access = await getClubAccess(clubId);
    if (access.unknown || access.active) return true;
    alert('이용 기간이 만료되었습니다. 감독이 월 이용료를 이체한 뒤 운영자 확인이 필요합니다.');
    handleClubCardClick(clubId);
    return false;
  };

  const handleOpenManageScreen = async (clubId: string) => {
    if (!(await ensureClubActive(clubId))) return;
    setSelectedClubId(clubId);
    setViewState('manage');
  };

  const handleOpenTeams = async (clubId: string, canEdit: boolean) => {
    if (!(await ensureClubActive(clubId))) return;
    setSelectedClubId(clubId);
    setTeamsCanEdit(canEdit);
    setViewState('teams');
  };

  const handleOpenOps = async (clubId: string, options?: { canEdit?: boolean }) => {
    if (!(await ensureClubActive(clubId))) return;
    setSelectedClubId(clubId);
    const role = myClubs.find((item) => item.id === clubId)?.role;
    setOpsCanEdit(options?.canEdit ?? isStaffRole(role));
    setViewState('ops');
  };

  const handleOpenGames = async (clubId: string, options?: { gameId?: string; proposalId?: string; canEdit?: boolean }) => {
    if (!(await ensureClubActive(clubId))) return;
    setSelectedClubId(clubId);
    setSelectedGameId(options?.gameId || null);
    setSelectedProposalId(options?.proposalId || null);
    const role = myClubs.find((item) => item.id === clubId)?.role;
    setGamesCanEdit(options?.canEdit ?? isStaffRole(role));
    setViewState('games');
  };

  const handleClubClosed = () => {
    setSelectedClubId(null);
    setViewState('main');
    setActiveTab('myClub');
    fetchClubs();
    if (currentUser) fetchMyClub(currentUser.id);
  };

  const ownedClub = myClubs.find((club) => isOwnerRole(club.role));

  const openCreateClub = () => {
    if (!currentUser) {
      setViewState('login');
      return;
    }
    if (ownedClub) {
      alert(`감독은 동아리를 1개만 개설할 수 있습니다.\n현재 감독: ${ownedClub.name}`);
      return;
    }
    setViewState('createClub');
  };

  const goTab = (tab: 'home' | 'myClub' | 'profile') => {
    setActiveTab(tab);
    setViewState('main');
    if (tab === 'myClub' && currentUser) fetchMyClub(currentUser.id);
  };

  const tabBar = (
    <nav className="bb-tabbar z-30 flex shrink-0 items-center justify-around border-t border-line bg-white/95 px-6 py-2 backdrop-blur-md">
      <button
        type="button"
        onClick={() => goTab('home')}
        className={`flex flex-col items-center gap-0.5 text-[10px] font-semibold cursor-pointer ${
          viewState === 'main' && activeTab === 'home' ? 'text-navy' : 'text-muted'
        }`}
      >
        <IconHome active={viewState === 'main' && activeTab === 'home'} />
        홈
      </button>
      <button
        type="button"
        onClick={() => goTab('myClub')}
        className={`flex flex-col items-center gap-0.5 text-[10px] font-semibold cursor-pointer ${
          viewState === 'main' && activeTab === 'myClub' ? 'text-navy' : 'text-muted'
        }`}
      >
        <IconClub active={viewState === 'main' && activeTab === 'myClub'} />
        내 동호회
      </button>
      <button
        type="button"
        onClick={() => goTab('profile')}
        className={`flex flex-col items-center gap-0.5 text-[10px] font-semibold cursor-pointer ${
          viewState === 'main' && activeTab === 'profile' ? 'text-navy' : 'text-muted'
        }`}
      >
        <IconUser active={viewState === 'main' && activeTab === 'profile'} />
        내 정보
      </button>
    </nav>
  );

  const bell = currentUser ? (
    <NotificationBell
      userId={currentUser.id}
      onOpenGame={(clubId, gameId) => handleOpenGames(clubId, { gameId })}
      onOpenJoin={(clubId) => handleOpenManageScreen(clubId)}
      onOpenClub={(clubId) => handleClubCardClick(clubId)}
      onOpenExchange={(clubId, proposalId) => handleOpenGames(clubId, { proposalId, canEdit: true })}
    />
  ) : null

  const withNav = (node: ReactNode) => (
    <div className="relative flex h-full min-h-0 flex-1 flex-col bg-canvas">
      {currentUser && viewState !== 'main' && viewState !== 'login' && viewState !== 'register' && (
        <div className="bb-nav-bell absolute right-5 top-3.5 z-50">{bell}</div>
      )}
      <div className="bb-nav-scroll min-h-0 flex-1 overflow-y-auto">{node}</div>
      {tabBar}
    </div>
  );

  if (viewState === 'platformAdmin' && currentUser?.is_platform_admin) {
    return (
      <PlatformAdminScreen
        actorId={currentUser.id}
        actorName={currentUser.name}
        onLogout={handleLogout}
        onOpenApp={() => {
          setViewState('main');
          setActiveTab('home');
          fetchClubs();
        }}
      />
    );
  }

  if (viewState === 'login') {
    return withNav(
      <LoginScreen
        onBack={() => setViewState('main')}
        onGoToRegister={() => setViewState('register')}
        onLoginSuccess={(user) => {
          setCurrentUser(user);
          if (user.is_platform_admin) {
            setViewState('platformAdmin');
            return;
          }
          setViewState('main');
          setActiveTab('home');
          fetchMyClub(user.id);
          void applyDeepLink();
          if (isPushEnabled(user.id)) {
            void requestBrowserNotifications();
            void registerPushForUser(user.id);
          }
        }}
      />
    );
  }

  if (viewState === 'register') {
    return withNav(
      <RegisterScreen
        onBack={() => setViewState('main')}
        onSuccess={() => setViewState('login')}
      />
    );
  }

  if (viewState === 'createClub') {
    return withNav(
      <CreateClubScreen
        userId={currentUser?.id}
        onBack={() => setViewState('main')}
        onGoToLogin={() => setViewState('login')}
        onSuccess={() => {
          setViewState('main');
          setActiveTab('myClub');
          fetchClubs();
          if (currentUser) fetchMyClub(currentUser.id);
        }}
      />
    );
  }

  if (viewState === 'clubDetail' && selectedClubId) {
    return withNav(
      <ClubDetailScreen
        clubId={selectedClubId}
        userId={currentUser?.id}
        onBack={() => {
          setViewState('main');
          setSelectedClubId(null);
        }}
        onGoToLogin={() => setViewState('login')}
        onOpenManageScreen={handleOpenManageScreen}
        onOpenTeams={handleOpenTeams}
        onOpenGames={handleOpenGames}
        onOpenOps={handleOpenOps}
        onClubClosed={handleClubClosed}
      />
    );
  }

  if (viewState === 'manage' && selectedClubId) {
    return withNav(
      <ClubManageScreen
        clubId={selectedClubId}
        userId={currentUser?.id}
        onBack={() => setViewState('clubDetail')}
      />
    );
  }

  if (viewState === 'teams' && selectedClubId) {
    return withNav(
      <TeamComposeScreen
        clubId={selectedClubId}
        userId={currentUser?.id}
        canEdit={teamsCanEdit}
        onBack={() => setViewState('clubDetail')}
      />
    );
  }

  if (viewState === 'ops' && selectedClubId) {
    const clubName = clubs.find((item) => item.id === selectedClubId)?.name || myClubs.find((item) => item.id === selectedClubId)?.name;
    return withNav(
      <ClubOpsScreen
        clubId={selectedClubId}
        clubName={clubName}
        userId={currentUser?.id}
        canEdit={opsCanEdit}
        onBack={() => setViewState('clubDetail')}
        onOpenGame={(gameId) => handleOpenGames(selectedClubId, { gameId, canEdit: opsCanEdit })}
      />
    );
  }

  if (viewState === 'games' && selectedClubId) {
    const clubName = clubs.find((item) => item.id === selectedClubId)?.name || myClubs.find((item) => item.id === selectedClubId)?.name;
    return withNav(
      <GameScheduleScreen
        clubId={selectedClubId}
        clubName={clubName}
        userId={currentUser?.id}
        canEdit={gamesCanEdit}
        initialGameId={selectedGameId}
        initialProposalId={selectedProposalId}
        onBack={() => setViewState('clubDetail')}
      />
    );
  }

  return withNav(
    <div className="bb-screen">
      <header className="sticky top-0 z-20 flex items-center justify-between px-5 py-3.5 bg-white/90 backdrop-blur-md border-b border-line">
        <div className="flex items-center gap-2.5">
          <BrandMark size={32} />
          <h1 className="text-[15px] font-semibold tracking-tight text-ink">림</h1>
        </div>

        {currentUser ? (
          <div className="flex items-center gap-2">
            {bell}
            {currentUser.is_platform_admin && (
              <button
                type="button"
                onClick={() => setViewState('platformAdmin')}
                className="px-2.5 py-1.5 text-xs font-semibold text-navy border border-line rounded-lg hover:bg-canvas cursor-pointer"
              >
                관리자
              </button>
            )}
            <span className="text-xs font-medium text-muted">{currentUser.name}</span>
            <button
              type="button"
              onClick={handleLogout}
              className="px-2.5 py-1.5 text-xs font-medium text-muted border border-line rounded-lg hover:bg-canvas cursor-pointer"
            >
              로그아웃
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setViewState('login')}
              className="px-3 py-1.5 text-xs font-semibold text-ink rounded-lg hover:bg-canvas cursor-pointer"
            >
              로그인
            </button>
            <button
              type="button"
              onClick={() => setViewState('register')}
              className="px-3 py-1.5 bg-navy text-white text-xs font-semibold rounded-lg hover:bg-navy-2 cursor-pointer"
            >
              회원가입
            </button>
          </div>
        )}
      </header>

      <div className="flex-1">
        {activeTab === 'home' && (
          <main className="p-5 space-y-6">
            <div className="bb-hero-grid rounded-2xl bg-navy p-6 text-white">
              <p className="text-[11px] font-semibold tracking-[0.16em] uppercase text-white/45 mb-2">
                Discover clubs
              </p>
              <h2 className="text-lg font-semibold leading-snug">
                활동 중인 농구 동호회를
                <br />
                찾아 가입하세요
              </h2>
            </div>

            <form
              className="bb-card p-4 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                void openInviteCode(inviteInput);
              }}
            >
              <p className="text-sm font-semibold text-ink">초대 코드로 참여</p>
              <p className="text-[11px] text-muted">링크가 열리지 않으면 초대 코드를 직접 입력하세요.</p>
              <div className="flex gap-2">
                <input
                  className="bb-input"
                  value={inviteInput}
                  onChange={(e) => setInviteInput(e.target.value.toUpperCase())}
                  placeholder="초대 코드"
                  autoCapitalize="characters"
                  autoCorrect="off"
                />
                <button type="submit" className="bb-btn-ghost shrink-0 px-3" disabled={inviteOpening}>
                  {inviteOpening ? '확인 중' : '열기'}
                </button>
              </div>
            </form>

            <div className="flex justify-between items-end">
              <div>
                <h3 className="font-semibold text-ink text-sm">동호회</h3>
                    <p className="text-xs text-muted mt-0.5">
                      {ownedClub ? '정회원은 여러 동아리에 가입할 수 있습니다' : '가입 신청 또는 신규 개설'}
                    </p>
              </div>
              <button
                type="button"
                onClick={openCreateClub}
                className="px-3 py-2 text-xs font-semibold text-navy border border-line rounded-lg hover:bg-white cursor-pointer"
              >
                {ownedClub ? '개설 완료' : '개설하기'}
              </button>
            </div>

            {loadingClubs ? (
              <Spinner label="동호회 목록을 불러오는 중..." />
            ) : clubs.length === 0 ? (
              <EmptyCard title="등록된 동호회가 없습니다" description="첫 번째 동호회를 개설해 보세요." />
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {clubs.map((club) => {
                  const emblem = clubRowToSettings(club)?.emblemDataUrl
                  return (
                  <button
                    key={club.id}
                    type="button"
                    onClick={() => handleClubCardClick(club.id)}
                    className="bb-card p-4 text-left cursor-pointer hover:border-navy/20 transition-colors"
                  >
                    <div className="w-10 h-10 bg-canvas rounded-lg overflow-hidden flex items-center justify-center text-lg mb-3">
                      {emblem ? (
                        <img src={emblem} alt="" className="w-full h-full object-cover" />
                      ) : (
                        club.emoji || '🏀'
                      )}
                    </div>
                    <span className="bb-chip bg-canvas text-muted mb-1.5">
                      {club.category || '일반'}
                    </span>
                    <h4 className="font-semibold text-ink text-sm truncate mt-1">{club.name}</h4>
                    <p className="text-[11px] text-muted mt-1">{club.region}</p>
                  </button>
                  )
                })}
              </div>
            )}
          </main>
        )}

        {activeTab === 'myClub' && (
          <div>
            {!currentUser ? (
              <div className="p-5 pt-16">
                <EmptyCard title="로그인이 필요합니다" description="내 동호회를 확인하려면 로그인해 주세요.">
                  <button type="button" onClick={() => setViewState('login')} className="bb-btn-primary mt-4 max-w-xs mx-auto">
                    로그인
                  </button>
                </EmptyCard>
              </div>
            ) : loadingMyClub ? (
              <Spinner label="내 동호회 정보를 불러오는 중..." />
            ) : myClubs.length === 1 && pendingApplications.length === 0 ? (
              <ClubDetailScreen
                clubId={myClubs[0].id}
                userId={currentUser.id}
                onBack={() => setActiveTab('home')}
                onGoToLogin={() => setViewState('login')}
                onOpenManageScreen={handleOpenManageScreen}
                onOpenTeams={handleOpenTeams}
                onOpenGames={handleOpenGames}
                onOpenOps={handleOpenOps}
                onClubClosed={handleClubClosed}
              />
            ) : (
              <div className="p-5 space-y-6">
                {myClubs.length > 0 && (
                  <section className="space-y-3">
                    <h3 className="text-sm font-semibold text-ink">내 동호회 · {myClubs.length}</h3>
                    <div className="space-y-2">
                      {myClubs.map((club) => (
                        <button
                          key={club.id}
                          type="button"
                          onClick={() => handleClubCardClick(club.id)}
                          className="bb-card w-full p-4 flex items-center gap-3 text-left cursor-pointer hover:border-navy/20"
                        >
                          <div className="w-11 h-11 bg-canvas rounded-lg flex items-center justify-center text-lg">
                            {club.emoji}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-sm text-ink truncate">{club.name}</h4>
                            <p className="text-[11px] text-muted mt-0.5">{club.region || '지역 미정'}</p>
                          </div>
                          <span className="text-xs text-muted">
                            {isOwnerRole(club.role) ? '감독' : '보기'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {pendingApplications.length > 0 && (
                  <section className="space-y-3">
                    <div className="flex justify-between items-center">
                      <h3 className="text-sm font-semibold text-ink">승인 대기 · {pendingApplications.length}</h3>
                      <span className="bb-chip bg-amber-50 text-brand">심사 중</span>
                    </div>
                    <div className="space-y-2">
                      {pendingApplications.map((app) => (
                        <div key={app.id} className="bb-card p-4 flex justify-between items-center">
                          <button
                            type="button"
                            onClick={() => handleClubCardClick(app.club_id)}
                            className="flex items-center gap-3 text-left flex-1 cursor-pointer min-w-0"
                          >
                            <div className="w-11 h-11 bg-canvas rounded-lg flex items-center justify-center text-lg">
                              {app.club_emoji}
                            </div>
                            <div className="min-w-0">
                              <h4 className="font-semibold text-sm text-ink truncate">{app.club_name}</h4>
                              <p className="text-[11px] text-muted mt-0.5">{app.club_region || '지역 미정'}</p>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCancelApplication(app.id, app.club_name)}
                            disabled={cancelingId === app.id}
                            className="bb-btn-danger ml-2"
                          >
                            {cancelingId === app.id ? '취소 중' : '신청 취소'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <EmptyCard
                  title={
                    myClubs.length > 0 || pendingApplications.length > 0
                      ? '다른 동호회 둘러보기'
                      : '가입된 동호회가 없습니다'
                  }
                  description={
                    ownedClub
                      ? '정회원으로 다른 동아리에도 가입할 수 있습니다. 감독 개설은 1개로 제한됩니다.'
                      : '새로운 동호회에 가입하거나 직접 개설할 수 있습니다.'
                  }
                >
                  <div className="flex gap-2 justify-center pt-3 max-w-xs mx-auto">
                    <button type="button" onClick={() => setActiveTab('home')} className="bb-btn-ghost flex-1">
                      둘러보기
                    </button>
                    {!ownedClub && (
                      <button type="button" onClick={openCreateClub} className="bb-btn-primary flex-1">
                        개설하기
                      </button>
                    )}
                  </div>
                </EmptyCard>
              </div>
            )}
          </div>
        )}

        {activeTab === 'profile' && (
          <ProfileScreen
            userId={currentUser?.id}
            onGoToClubList={() => {
              setActiveTab('home');
              setViewState('main');
            }}
            onCreateClub={openCreateClub}
            onGoToLogin={() => setViewState('login')}
            onProfileUpdated={(patch) => {
              if (!currentUser) return;
              const next = { ...currentUser, name: patch.name };
              setCurrentUser(next);
              saveCurrentUser({ ...(readSavedUser<Record<string, unknown>>() || {}), ...next });
            }}
          />
        )}
      </div>

    </div>
  );
}
