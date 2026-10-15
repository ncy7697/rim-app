export function normalizeLoginId(value: string) {
  return value.trim().toLowerCase()
}

export function loginIdError(value: string): string | null {
  const id = normalizeLoginId(value)
  if (!id) return '아이디를 입력해 주세요.'
  if (!/^[a-z0-9_]{4,20}$/.test(id)) {
    return '아이디는 영문 소문자, 숫자, 밑줄(_)만 사용해 4~20자로 입력해 주세요.'
  }
  return null
}
