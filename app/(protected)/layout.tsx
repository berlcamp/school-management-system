'use client'

import { AppSidebar } from '@/components/AppSidebar'
import { AuthGuard } from '@/components/AuthGuard'
import { DivisionHeader } from '@/components/DivisionHeader'
import LoadingSkeleton from '@/components/LoadingSkeleton'
import { NavigationProgress } from '@/components/NavigationProgress'
import { OfflineDetector } from '@/components/OfflineDetector'
import { RegionAccountGuard } from '@/components/RegionAccountGuard'
import { SbfpViewerGuard } from '@/components/SbfpViewerGuard'
import { SbfpViewerHeader } from '@/components/SbfpViewerHeader'
import { SchoolIdGuard } from '@/components/SchoolIdGuard'
import StickyHeader from '@/components/StickyHeader'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { useAppSelector } from '@/lib/redux/hook'
import { Providers } from '@/lib/redux/providers'
import { Suspense } from 'react'
import { Toaster } from 'react-hot-toast'

function LayoutContent({ children }: { children: React.ReactNode }) {
  const user = useAppSelector((state) => state.user.user)
  const isAgent = user?.type === 'agent'
  // A Region Account (214) reads the division dashboard and reports, so it
  // gets the division layout — narrowed by RegionAccountGuard.
  const isDivisionAdmin =
    user?.type === 'division_admin' ||
    user?.type === 'division_type' ||
    user?.type === 'region_account'

  if (user?.type === 'sbfp_viewer') {
    // An SBFP Viewer (222) has two pages and no sidebar: the header is the
    // whole navigation, and SbfpViewerGuard keeps them on those pages.
    return (
      <div className="min-h-screen bg-slate-50">
        <SbfpViewerHeader />
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <SchoolIdGuard>
            <SbfpViewerGuard>{children}</SbfpViewerGuard>
          </SchoolIdGuard>
        </main>
      </div>
    )
  }

  if (isAgent) {
    // Agent layout: no sidebar, just header
    return (
      <>
        <StickyHeader />
        <main className="w-full">
          <div className="p-4">
            <SchoolIdGuard>{children}</SchoolIdGuard>
          </div>
        </main>
      </>
    )
  }

  if (isDivisionAdmin) {
    // Division admin layout: light top header, sidebar collapsed by default
    return (
      <SidebarProvider defaultOpen={false}>
        <AppSidebar />
        <SidebarInset className="min-w-0 bg-slate-50/60">
          <DivisionHeader />
          <div className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <SchoolIdGuard>
              <RegionAccountGuard>{children}</RegionAccountGuard>
            </SchoolIdGuard>
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  // Regular layout: with sidebar
  return (
    <SidebarProvider>
      <AppSidebar />
      {/* min-w-0: a wide table scrolls inside its own box instead of
          dragging the header and the whole page sideways with it. */}
      <SidebarInset className="min-w-0">
        <StickyHeader />
        <div className="p-4 min-w-0">
          <SchoolIdGuard>{children}</SchoolIdGuard>
        </div>
      </SidebarInset>
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
