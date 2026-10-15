import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { BackButton } from './ui';
import { loginIdError, normalizeLoginId } from '../loginId';
import NaverLoginButton from './NaverLoginButton';
import KakaoLoginButton from './KakaoLoginButton';

interface RegisterScreenProps {
  onBack: () => void;
  onSuccess: () => void;
}

export default function RegisterScreen({ onBack, onSuccess }: RegisterScreenProps) {
  const [formData, setFormData] = useState({
    loginId: '',
    name: '',
    birthdate: '',
    height: '',
    weight: '',
    position: 'PG',
    password: '',
    passwordConfirm: '',
  });
  const [loading, setLoading] = useState(false);
  const [checkingId, setCheckingId] = useState(false);
  const [idStatus, setIdStatus] = useState<'idle' | 'available' | 'taken'>('idle');
  const [idMessage, setIdMessage] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: name === 'loginId' ? value.replace(/\s/g, '') : value });
    if (name === 'loginId') {
      setIdStatus('idle');
      setIdMessage('');
    }
  };

  const checkLoginId = async () => {
    const errorText = loginIdError(formData.loginId);
    if (errorText) {
      setIdStatus('idle');
      setIdMessage(errorText);
      return false;
    }
    setCheckingId(true);
    try {
      const { data, error } = await supabase.rpc('check_login_id_available', {
        p_login_id: normalizeLoginId(formData.loginId),
      });
      if (error) throw error;
      if (data === true) {
        setIdStatus('available');
        setIdMessage('사용할 수 있는 아이디입니다.');
        return true;
      }
      setIdStatus('taken');
      setIdMessage('이미 사용 중인 아이디입니다.');
      return false;
    } catch (err: any) {
      setIdStatus('idle');
      setIdMessage(err.message || '아이디 중복 확인에 실패했습니다.');
      return false;
    } finally {
      setCheckingId(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const idIssue = loginIdError(formData.loginId);
    if (idIssue) {
      alert(idIssue);
      return;
    }
    if (!formData.name || !formData.birthdate || !formData.password) {
      alert('필수 정보를 모두 입력해 주세요.');
      return;
    }
    if (formData.password !== formData.passwordConfirm) {
      alert('비밀번호가 일치하지 않습니다.');
      return;
    }

    const available = idStatus === 'available' ? true : await checkLoginId();
    if (!available) {
      alert(idMessage || '아이디 중복을 확인해 주세요.');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.rpc('register_user', {
        p_login_id: normalizeLoginId(formData.loginId),
        p_name: formData.name,
        p_password: formData.password,
        p_birthdate: formData.birthdate,
        p_height: formData.height ? parseFloat(formData.height) : null,
        p_weight: formData.weight ? parseFloat(formData.weight) : null,
        p_position: formData.position,
      });

      if (error) throw error;
      alert('회원가입이 완료되었습니다. 아이디로 로그인해 주세요.');
      onSuccess();
    } catch (err: any) {
      console.error('회원가입 에러:', err);
      alert('회원가입에 실패했습니다: ' + (err.message || '다시 시도해 주세요.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bb-screen px-5 pb-8">
      <header className="bb-header -mx-5 mb-6">
        <BackButton onClick={onBack} />
        <h1 className="text-base font-semibold text-ink">회원가입</h1>
      </header>

      <div className="space-y-3 mb-6">
        <NaverLoginButton label="네이버 계정으로 가입" />
        <KakaoLoginButton label="카카오 계정으로 가입" />
        {(Boolean(import.meta.env.VITE_NAVER_CLIENT_ID) || Boolean(import.meta.env.VITE_KAKAO_REST_API_KEY) || Boolean(import.meta.env.VITE_KAKAO_CLIENT_ID)) && (
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-line" />
            <span className="text-[11px] text-muted">또는 아이디로 가입</span>
            <span className="h-px flex-1 bg-line" />
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 flex-1">
        <div>
          <label className="bb-label">아이디 *</label>
          <div className="flex gap-2">
            <input
              type="text"
              name="loginId"
              autoComplete="username"
              placeholder="영문 소문자, 숫자, _"
              value={formData.loginId}
              onChange={handleChange}
              className="bb-input flex-1"
              minLength={4}
              maxLength={20}
              required
            />
            <button
              type="button"
              className="bb-btn-ghost shrink-0 text-xs px-3"
              disabled={checkingId}
              onClick={() => void checkLoginId()}
            >
              {checkingId ? '확인 중' : '중복 확인'}
            </button>
          </div>
          <p className={`text-[11px] mt-1.5 ${idStatus === 'available' ? 'text-emerald-700' : idStatus === 'taken' ? 'text-rose-700' : 'text-muted'}`}>
            {idMessage || '4~20자, 영문 소문자·숫자·밑줄(_)만 사용할 수 있습니다. 로그인에 쓰이므로 중복될 수 없습니다.'}
          </p>
        </div>
        <div>
          <label className="bb-label">이름 *</label>
          <input type="text" name="name" placeholder="홍길동" value={formData.name} onChange={handleChange} className="bb-input" required />
        </div>
        <div>
          <label className="bb-label">생년월일 *</label>
          <input type="date" name="birthdate" value={formData.birthdate} onChange={handleChange} className="bb-input" required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="bb-label">키 (cm)</label>
            <input type="number" name="height" step="0.1" placeholder="178.5" value={formData.height} onChange={handleChange} className="bb-input" />
          </div>
          <div>
            <label className="bb-label">체중 (kg)</label>
            <input type="number" name="weight" step="0.1" placeholder="75.0" value={formData.weight} onChange={handleChange} className="bb-input" />
          </div>
        </div>
        <div>
          <label className="bb-label">선호 포지션</label>
          <select name="position" value={formData.position} onChange={handleChange} className="bb-input">
            <option value="PG">포인트가드 (PG)</option>
            <option value="SG">슈팅가드 (SG)</option>
            <option value="SF">스몰포워드 (SF)</option>
            <option value="PF">파워포워드 (PF)</option>
            <option value="C">센터 (C)</option>
            <option value="ALL">올라운더 (ALL)</option>
          </select>
        </div>
        <div>
          <label className="bb-label">비밀번호 *</label>
          <input type="password" name="password" placeholder="비밀번호" value={formData.password} onChange={handleChange} className="bb-input" required />
        </div>
        <div>
          <label className="bb-label">비밀번호 확인 *</label>
          <input type="password" name="passwordConfirm" placeholder="비밀번호 재입력" value={formData.passwordConfirm} onChange={handleChange} className="bb-input" required />
        </div>
        <button type="submit" disabled={loading} className="bb-btn-primary mt-2">
          {loading ? '가입 진행 중...' : '가입하기'}
        </button>
      </form>
    </div>
  );
}
