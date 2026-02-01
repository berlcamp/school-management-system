'use client'

import { AppSidebar } from '@/components/AppSidebar'
import { AuthGuard } from '@/components/AuthGuard'
import LoadingSkeleton from '@/components/LoadingSkeleton'
import { NavigationProgress } from '@/components/NavigationProgress'
import { OfflineDetector } from '@/components/OfflineDetector'
import StickyHeader from '@/components/StickyHeader'
import { SidebarProvider } from '@/components/ui/sidebar'
import { useAppSelector } from '@/lib/redux/hook'
import { Providers } from '@/lib/redux/providers'
import { Suspense } from 'react'
import { Toaster } from 'react-hot-toast'

function LayoutContent({ children }: { children: React.ReactNode }) {
  const user = useAppSelector((state) => state.user.user)
  const isAgent = user?.type === 'agent'

  if (isAgent) {
    // Agent layout: no sidebar, just header
    return (
      <>
        <StickyHeader />
        <main className="w-full">
          <div className="p-4 mt-14">{children}</div>
        </main>
      </>
    )
  }

  // Regular layout: with sidebar
  return (
    <SidebarProvider>
      <AppSidebar />
      <StickyHeader />
      <main className="w-full">
        <div className="p-4 mt-14">{children}</div>
      </main>
    </SidebarProvider>
  )
}

export default function AuthLayout({
  children
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <Toaster />
      <Suspense fallback={null}>
        <NavigationProgress />
      </Suspense>
      <OfflineDetector />
      <Providers>
        <Suspense fallback={<LoadingSkeleton />}>
          <AuthGuard>
            <LayoutContent>{children}</LayoutContent>
          </AuthGuard>
        </Suspense>
      </Providers>
    </>
  )
}
