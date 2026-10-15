import { useEffect, useState } from 'react';
import MainScreen from './components/MainScreen';
import { BrandMark } from './components/ui';
import { parseAppLink, peekPendingInviteCode, readLaunchAppUrl } from './appLinks';
import { hasNaverCallback } from './naverAuth';
import { hasKakaoCallback } from './kakaoAuth';

export default function App() {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const hasDeepLink = Boolean(
    params?.get('invite') ||
    params?.get('attend') ||
    params?.get('game') ||
    peekPendingInviteCode() ||
    hasNaverCallback() ||
    hasKakaoCallback()
  );
  const [currentScreen, setCurrentScreen] = useState<'welcome' | 'main'>(hasDeepLink ? 'main' : 'welcome');

  useEffect(() => {
    if (currentScreen === 'main') return;
    void readLaunchAppUrl().then((url) => {
      if (parseAppLink(url) || parseAppLink(typeof window !== 'undefined' ? window.location.href : '')) {
        setCurrentScreen('main');
      }
    });
  }, [currentScreen]);

  return (
    <div className="mx-auto flex h-[100dvh] max-w-md flex-col overflow-hidden bg-canvas shadow-[0_0_80px_rgba(0,0,0,0.25)]">
      {currentScreen === 'welcome' ? (
        <div className="flex min-h-0 flex-1 flex-col bg-navy text-white">
          <div className="bb-hero-grid flex-1 flex flex-col px-7 pt-14 pb-8">
            <header>
              <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-white/50 mb-4">
                RIM
              </p>
              <div className="flex items-center gap-3 mb-3">
                <BrandMark size={40} tone="light" />
                <div>
                  <h1 className="text-[28px] font-semibold tracking-tight leading-none">
                    림
                  </h1>
                  <p className="text-[11px] font-medium tracking-wide text-white/45 mt-1">RIM</p>
                </div>
              </div>
              <p className="text-sm text-white/65 leading-relaxed max-w-[16rem]">
                동호회 운영과 멤버 관리를 한곳에서.
              </p>
            </header>

            <main className="flex-1 flex flex-col justify-center py-10">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm">
                <p className="text-[11px] font-semibold tracking-wider uppercase text-brand mb-4">
                  What you can do
                </p>
                <ul className="space-y-3.5 text-sm text-white/80">
                  <li className="flex gap-3">
                    <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-brand shrink-0" />
                    동호회 개설 및 가입 승인
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-brand shrink-0" />
                    멤버 현황과 신청 내역 관리
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-brand shrink-0" />
                    선수 프로필과 포지션 기록
                  </li>
                </ul>
              </div>
            </main>

            <footer>
              <button
                type="button"
                onClick={() => setCurrentScreen('main')}
                className="bb-btn-accent"
              >
                시작하기
              </button>
            </footer>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <MainScreen />
        </div>
      )}
    </div>
  );
}
