'use client'

import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import NProgress from 'nprogress'

export function NavigationProgress() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    NProgress.configure({ 
      showSpinner: false,
      trickleSpeed: 200,
      minimum: 0.3,
      easing: 'ease',
      speed: 500,
    })
  }, [])

  useEffect(() => {
    // Complete the progress bar when navigation is done
    NProgress.done()
  }, [pathname, searchParams])

  return null
}
