import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { BackButton, BrandMark } from './ui';
import { normalizeLoginId } from '../loginId';
import { saveCurrentUser } from '../authSession';
import NaverLoginButton from './NaverLoginButton';
import KakaoLoginButton from './KakaoLoginButton';

interface UserProfile {
  id: string;
  name: string;
  birthdate?: string;
  height?: number | null;
  weight?: number | null;
  position?: string;
  login_id?: string;
  is_platform_admin?: boolean;
}

interface LoginScreenProps {
  onBack: () => void;
  onLoginSuccess: (user: UserProfile) => void;
  onGoToRegister: () => void;
}

export default function LoginScreen({ onBack, onLoginSuccess, onGoToRegister }: LoginScreenProps) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!loginId || !password) {
      alert('아이디와 비밀번호를 모두 입력해 주세요.');
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.rpc('login_user', {
        p_login_id: normalizeLoginId(loginId),
        p_password: password,
      });

      if (error) throw error;

      if (!data || data.length === 0) {
        alert('아이디 또는 비밀번호가 일치하지 않습니다.');
        return;
      }

      const loggedInUser: UserProfile = data[0];
      saveCurrentUser(loggedInUser);
      onLoginSuccess(loggedInUser);
    } catch (err: any) {
      console.error('로그인 에러:', err);
      alert('로그인 처리 중 오류가 발생했습니다: ' + (err.message || '다시 시도해 주세요.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bb-screen px-6 justify-center relative">
      <div className="absolute top-5 left-5">
        <BackButton onClick={onBack} />
      </div>

      <div className="text-center mb-8">
        <div className="flex justify-center mb-4">
          <BrandMark size={48} />
        </div>
        <h1 className="text-xl font-semibold text-ink">림</h1>
        <p className="text-[11px] tracking-wide text-muted mt-0.5">RIM</p>
        <p className="text-sm text-muted mt-2">아이디와 비밀번호를 입력해 주세요</p>
      </div>

      <form onSubmit={handleLogin} className="space-y-4 max-w-sm mx-auto w-full">
        <div>
          <label className="bb-label">아이디</label>
          <input
            type="text"
            autoComplete="username"
            placeholder="로그인 아이디"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value.replace(/\s/g, ''))}
            className="bb-input"
            required
          />
        </div>
        <div>
          <label className="bb-label">비밀번호</label>
          <input
            type="password"
            autoComplete="current-password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bb-input"
            required
          />
        </div>
        <button type="submit" disabled={loading} className="bb-btn-primary mt-2">
          {loading ? '로그인 중...' : '로그인'}
        </button>
        <div className="flex items-center gap-3 pt-1">
          <span className="h-px flex-1 bg-line" />
          <span className="text-[11px] text-muted">또는</span>
          <span className="h-px flex-1 bg-line" />
        </div>
        <NaverLoginButton label="네이버 계정으로 로그인" />
        <KakaoLoginButton label="카카오 계정으로 로그인" />
        <p className="text-center text-xs text-muted pt-2">
          아직 회원이 아니신가요?{' '}
          <button type="button" onClick={onGoToRegister} className="text-navy font-semibold cursor-pointer">
            회원가입
          </button>
        </p>
      </form>
    </div>
  );
}
