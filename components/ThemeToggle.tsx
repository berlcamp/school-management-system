'use client'

import { useEffect, useState } from 'react'

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
    if (savedTheme) {
      setTheme(savedTheme)
      document.documentElement.classList.toggle('dark', savedTheme === 'dark')
    }
  }, [])

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)
    document.documentElement.classList.toggle('dark', newTheme === 'dark')
  }

  return (
    <button
      onClick={toggleTheme}
      aria-label="Toggle Theme"
      className="font-medium text-sm cursor-pointer"
    >
      {theme === 'light' ? (
        <div className="space-x-2">
          <span>🌙</span>
          <span>Dark Mode</span>
        </div>
      ) : (
        <div className="space-x-2">
          <span>☀️</span>
          <span>Light Mode</span>
        </div>
      )}
    </button>
  )
}
