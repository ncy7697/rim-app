/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_NAVER_CLIENT_ID: string
  readonly VITE_KAKAO_REST_API_KEY: string
  readonly VITE_KAKAO_CLIENT_ID: string
  readonly VITE_PUBLIC_APP_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
