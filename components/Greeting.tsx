'use client'

import { useEffect, useState } from 'react'

export function Greeting({ name }: { name: string }) {
  const [greeting, setGreeting] = useState('')
  const [dateStr, setDateStr] = useState('')

  useEffect(() => {
    const now = new Date()

    // Format date: Friday, May 16
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    }
    const formattedDate = now.toLocaleDateString('en-US', options)
    setDateStr(formattedDate)

    // Determine greeting
    const hour = now.getHours()
    let greet = 'Hello'
    if (hour < 12) greet = 'Good morning'
    else if (hour < 18) greet = 'Good afternoon'
    else greet = 'Good evening'

    setGreeting(`${greet}, ${name}`)
  }, [name])

  return (
    <div className="space-y-1">
      <div className="text-lg text-gray-700 dark:text-gray-400">{dateStr}</div>
      <div className="text-2xl font-semibold">{greeting}</div>
    </div>
  )
}
