# 림 (RIM)

농구 동호회 운영 앱입니다. 동아리 개설·가입, 멤버 관리, 경기 일정, 스코어보드, 출석, 회비 장부를 한곳에서 다룹니다.

패키지명: `com.ncy.rim`

## 기술 스택

- React 19, TypeScript, Vite, Tailwind CSS
- Capacitor 8 (Android)
- Supabase (DB, RPC, Edge Functions)
- FCM 푸시, 네이버·카카오 소셜 로그인

## 실행 방법

1. 의존성 설치

```bash
npm install
```

2. `.env.example`을 복사해 `.env`를 만들고 필요한 값을 채웁니다. 실제 키는 저장소에 올리지 마세요.

```bash
copy .env.example .env
```

3. 웹 개발 서버

```bash
npm run dev
```

4. Android 앱 (웹 빌드 후 동기화)

```bash
npm run build
npx cap sync android
```

Android Studio에서 `android` 폴더를 열거나 Gradle로 디버그 APK를 만듭니다.

## 주요 기능

- 동호회 개설(감독 1인 제한)과 정회원 다중 가입
- 권한: 감독(`owner`) · 코치(`admin`) · 정회원(`member`) · 게스트(`guest`)
- 가입 신청 승인, 멤버 검색, 프로필(나이·가입일)
- 경기 일정 등록, 장소 즐겨찾기(최대 3곳), 교류전·이벤트
- 스코어보드, 팀 구성, 출석 QR
- 초대 링크·초대 코드로 동아리 화면 열기
- 회비 장부, 공지, 푸시 알림

## 환경 변수

프론트에는 anon/publishable 키만 넣습니다. `service_role`, 카카오 Client Secret, Firebase Admin JSON은 서버 시크릿으로만 사용합니다.
