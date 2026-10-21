"use client";

import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useNavSections, type NavItem } from "@/hooks/useNavSections";
import { cn } from "@/lib/utils";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import NProgress from "nprogress";
import { useEffect, useState } from "react";

export function AppSidebar() {
  const pathname = usePathname();
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const sections = useNavSections({ withCounts: true });

  // Reset loading state when pathname changes
  useEffect(() => {
    setLoadingPath(null);
  }, [pathname]);

  const handleLinkClick = (url: string) => {
    // Don't trigger if already on this page
    if (pathname === url) return;

    // Start progress bar and set loading state
    NProgress.start();
    setLoadingPath(url);
  };

  // Returns true only if `url` is the most specific match for the current pathname
  // among the provided sibling URLs, preventing a parent from being active when a
  // more-specific sibling already matches.
  const getIsActive = (url: string, siblingUrls: string[]) => {
    if (pathname !== url && !pathname.startsWith(url + "/")) return false;
    return !siblingUrls.some(
      (sibling) =>
        sibling !== url &&
        sibling.length > url.length &&
        (pathname === sibling || pathname.startsWith(sibling + "/")),
    );
  };

  return (
    <Sidebar collapsible="icon" className="print:hidden">
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border px-3">
        <Link
          href="/home"
          className="flex items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:justify-center"
        >
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white p-1 group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8">
            <Image src="/deped-logo.svg" alt="DepEd" fill className="object-contain p-1" priority />
          </div>
          <div className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-bold tracking-tight text-white">
              School Management
            </span>
            <span className="truncate text-[10px] font-medium uppercase tracking-widest text-sidebar-foreground/50">
              SDO Bayugan City
            </span>
          </div>
        </Link>
      </SidebarHeader>

      {/* Scrollable in icon mode too: a long nav would otherwise leave its
          lower items unreachable once the rail collapses. */}
      <SidebarContent className="gap-0 px-1 py-2 group-data-[collapsible=icon]:overflow-y-auto">
        {sections.map((section, i) => (
          <NavSection
            key={section.label ?? i}
            label={section.label}
            items={section.items}
            isActive={(url) =>
              section.exact
                ? pathname === url
                : getIsActive(url, section.items.map((item) => item.url))
            }
            loadingPath={loadingPath}
            onNavigate={handleLinkClick}
          />
        ))}
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

function NavSection({
  label,
  items,
  isActive,
  loadingPath,
  onNavigate,
}: {
  label?: string;
  items: NavItem[];
  isActive: (url: string) => boolean;
  loadingPath: string | null;
  onNavigate: (url: string) => void;
}) {
  return (
    <SidebarGroup className="py-1.5">
      {label && (
        <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
          {label}
        </SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const active = isActive(item.url);
            const loading = loadingPath === item.url;
            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton
                  asChild
                  isActive={active}
                  tooltip={item.title}
                  className={cn(
                    "h-9 text-sidebar-foreground transition-colors hover:text-white data-[active=true]:text-white",
                    loading && "cursor-wait opacity-60",
                  )}
                >
                  <Link
                    href={item.url}
                    onClick={() => onNavigate(item.url)}
                    aria-current={active ? "page" : undefined}
                  >
                    {loading ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <item.icon className={active ? "text-emerald-400" : undefined} />
                    )}
                    <span>{item.title}</span>
                    {!!item.badge && (
                      <Badge
                        variant="destructive"
                        className="ml-auto h-5 min-w-5 justify-center px-1.5 text-[10px] group-data-[collapsible=icon]:hidden"
                      >
                        {item.badge > 99 ? "99+" : item.badge}
                      </Badge>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

}
