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
    <div className="space-y-0.5 pb-4 border-b border-border/50">
      <div className="text-sm text-muted-foreground">{dateStr}</div>
      <div className="text-xl font-semibold tracking-tight">{greeting}</div>
    </div>
  )
}
