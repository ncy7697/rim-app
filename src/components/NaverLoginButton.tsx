import { useState } from 'react'
import { naverClientId, startNaverLogin } from '../naverAuth'

export default function NaverLoginButton({
  label = '네이버로 시작하기',
}: {
  label?: string
}) {
  const [loading, setLoading] = useState(false)

  const handleClick = () => {
    setLoading(true)
    try {
      startNaverLogin()
    } catch (err: any) {
      setLoading(false)
      alert(err.message || '네이버 로그인을 시작하지 못했습니다.')
    }
  }

  if (!naverClientId()) {
    return (
      <p className="text-[11px] text-center text-muted leading-relaxed">
        네이버 가입을 쓰려면 네이버 개발자센터 애플리케이션 Client ID를 `.env`의 `VITE_NAVER_CLIENT_ID`에 넣어 주세요.
      </p>
    )
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={handleClick}
      className="w-full rounded-xl py-3 text-sm font-bold text-white cursor-pointer"
      style={{ background: '#03C75A' }}
    >
      {loading ? '네이버 연결 중...' : label}
    </button>
  )
}
