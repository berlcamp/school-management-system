'use client'

import { AppSidebar } from '@/components/AppSidebar'
import { AuthGuard } from '@/components/AuthGuard'
import { DivisionHeader } from '@/components/DivisionHeader'
import LoadingSkeleton from '@/components/LoadingSkeleton'
import { NavigationProgress } from '@/components/NavigationProgress'
import { OfflineDetector } from '@/components/OfflineDetector'
import { SchoolIdGuard } from '@/components/SchoolIdGuard'
import StickyHeader from '@/components/StickyHeader'
import { SidebarProvider } from '@/components/ui/sidebar'
import { useAppSelector } from '@/lib/redux/hook'
import { Providers } from '@/lib/redux/providers'
import { Suspense } from 'react'
import { Toaster } from 'react-hot-toast'

function LayoutContent({ children }: { children: React.ReactNode }) {
  const user = useAppSelector((state) => state.user.user)
  const isAgent = user?.type === 'agent'
  const isDivisionAdmin =
    user?.type === 'division_admin' || user?.type === 'division_type'

  if (isAgent) {
    // Agent layout: no sidebar, just header
    return (
      <>
        <StickyHeader />
        <main className="w-full">
          <div className="p-4 mt-14">
            <SchoolIdGuard>{children}</SchoolIdGuard>
          </div>
        </main>
      </>
    )
  }

  if (isDivisionAdmin) {
    // Division admin layout: light top header, sidebar hidden by default
    return (
      <SidebarProvider defaultOpen={false}>
        <AppSidebar />
        <DivisionHeader />
        <main className="w-full bg-slate-50/60 min-h-screen">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 mt-16">
            <SchoolIdGuard>{children}</SchoolIdGuard>
          </div>
        </main>
      </SidebarProvider>
    )
  }

  // Regular layout: with sidebar
  return (
    <SidebarProvider>
      <AppSidebar />
      <StickyHeader />
      <main className="w-full">
        <div className="p-4 mt-14">
          <SchoolIdGuard>{children}</SchoolIdGuard>
        </div>
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
