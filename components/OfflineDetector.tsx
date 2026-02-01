'use client'

import { useEffect, useState } from 'react'

export function OfflineDetector() {
  const [isOffline, setIsOffline] = useState(false)

  useEffect(() => {
    // Make sure this only runs in the browser
    if (typeof window !== 'undefined') {
      setIsOffline(!navigator.onLine)

      const goOnline = () => setIsOffline(false)
      const goOffline = () => setIsOffline(true)

      window.addEventListener('online', goOnline)
      window.addEventListener('offline', goOffline)

      return () => {
        window.removeEventListener('online', goOnline)
        window.removeEventListener('offline', goOffline)
      }
    }
  }, [])

  if (!isOffline) return null

  return (
    <div className="fixed top-0 left-0 right-0 bg-red-600 text-white text-center py-2 z-50 shadow">
      ⚠️ No internet connection. Some features may not work.
    </div>
  )
}
