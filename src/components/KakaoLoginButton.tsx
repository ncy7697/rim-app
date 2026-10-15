import { useState } from 'react'
import { kakaoRestKey, startKakaoLogin } from '../kakaoAuth'

export default function KakaoLoginButton({
  label = '카카오로 시작하기',
}: {
  label?: string
}) {
  const [loading, setLoading] = useState(false)

  const handleClick = () => {
    setLoading(true)
    try {
      startKakaoLogin()
    } catch (err: any) {
      setLoading(false)
      alert(err.message || '카카오 로그인을 시작하지 못했습니다.')
    }
  }

  if (!kakaoRestKey()) {
    return (
      <p className="text-[11px] text-center text-muted leading-relaxed">
        카카오 가입을 쓰려면 카카오 개발자에서 앱 REST API 키를 `.env`의 `VITE_KAKAO_REST_API_KEY`에 넣어 주세요.
      </p>
    )
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={handleClick}
      className="w-full rounded-xl py-3 text-sm font-bold cursor-pointer"
      style={{ background: '#FEE500', color: '#191919' }}
    >
      {loading ? '카카오 연결 중...' : label}
    </button>
  )
}
