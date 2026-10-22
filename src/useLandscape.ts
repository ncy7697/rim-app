import { useEffect, useState } from 'react'

function readLandscape() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(orientation: landscape)').matches && window.innerWidth > window.innerHeight
}

export function useLandscape() {
  const [landscape, setLandscape] = useState(readLandscape)

  useEffect(() => {
    const media = window.matchMedia('(orientation: landscape)')
    const update = () => setLandscape(media.matches && window.innerWidth > window.innerHeight)
    media.addEventListener('change', update)
    window.addEventListener('resize', update)
    update()
    return () => {
      media.removeEventListener('change', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  return landscape
}
