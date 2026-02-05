"use client";

import {
  BookOpen,
  Building2,
  Calendar,
  ClipboardList,
  FileText,
  GraduationCap,
  Home,
  Loader2,
  User,
  Users,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAppSelector } from "@/lib/redux/hook";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import NProgress from "nprogress";
import { useEffect, useState } from "react";

interface ModuleItem {
  title: string;
  url: string;
  icon: typeof Home;
  moduleName: string;
}

export function AppSidebar() {
  const pathname = usePathname();
  const [loadingPath, setLoadingPath] = useState<string | null>(null);
  const user = useAppSelector((state) => state.user.user);

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

  // Menu items.
  const allItems = [
    {
      title: "Home",
      url: "/home",
      icon: Home,
    },
  ];

  // Show all menu items to all authenticated users
  const items = allItems;

  // Module items configuration
  const allModuleItems: ModuleItem[] = [
    {
      title: "Enrollment",
      url: "/enrollment",
      icon: ClipboardList,
      moduleName: "enrollment",
    },
    {
      title: "Subjects",
      url: "/subjects",
      icon: BookOpen,
      moduleName: "subjects",
    },
    {
      title: "Sections",
      url: "/sections",
      icon: Users,
      moduleName: "sections",
    },
    {
      title: "Students",
      url: "/students",
      icon: GraduationCap,
      moduleName: "students",
    },
    {
      title: "Schedules",
      url: "/schedules",
      icon: Calendar,
      moduleName: "schedules",
    },
  ];

  // Teacher-specific items
  const teacherItems: ModuleItem[] = [
    {
      title: "Dashboard",
      url: "/teacher/dashboard",
      icon: User,
      moduleName: "teacher_dashboard",
    },
    {
      title: "My Sections",
      url: "/teacher/sections",
      icon: Users,
      moduleName: "teacher_sections",
    },
    {
      title: "My Subjects",
      url: "/teacher/subjects",
      icon: BookOpen,
      moduleName: "teacher_subjects",
    },
    {
      title: "Grade Entry",
      url: "/teacher/grades",
      icon: ClipboardList,
      moduleName: "teacher_grades",
    },
  ];

  // Filter modules based on user access and role
  const userType = user?.type;
  const isSchoolHead = userType === "school_head" || userType === "super admin";
  const isRegistrar = userType === "registrar" || isSchoolHead;
  const isTeacher = userType === "teacher";
  const isAdmin = userType === "admin" || isSchoolHead;

  // Determine which modules to show based on role
  let visibleModuleItems: ModuleItem[] = [];

  if (isSchoolHead || isAdmin) {
    // School Head and Admin see all modules
    visibleModuleItems = allModuleItems;
  } else if (isRegistrar) {
    // Registrar sees enrollment, students, sections, and schedules
    visibleModuleItems = allModuleItems.filter(
      (item) =>
        item.moduleName === "enrollment" ||
        item.moduleName === "students" ||
        item.moduleName === "sections" ||
        item.moduleName === "schedules"
    );
  } else if (isTeacher) {
    // Teachers only see their portal items, no admin modules
    visibleModuleItems = teacherItems;
  }

  const moduleItems = visibleModuleItems;

  // Settings items (only for super admin and school head)
  const allSettingItems = [
    {
      title: "Staff",
      url: "/staff",
      icon: User,
    },
    {
      title: "Rooms",
      url: "/rooms",
      icon: Building2,
    },
  ];

  // Form 137 items (for school head)
  const form137Items: ModuleItem[] = [
    {
      title: "Form 137 Requests",
      url: "/form137/requests",
      icon: FileText,
      moduleName: "form137",
    },
  ];

  // Show settings to super admin and school head
  const settingItems = isSchoolHead ? allSettingItems : [];

  // Show Form 137 to school head
  const form137MenuItems = isSchoolHead ? form137Items : [];

  return (
    <Sidebar className="pt-13 border-r border-border/40">
      <SidebarContent className="bg-gradient-to-b from-background via-background to-muted/20 backdrop-blur-sm">
        <SidebarGroup className="px-2 py-4">
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {items.map((item) => {
                const isActive = pathname === item.url;
                const isLoading = loadingPath === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <Link
                        href={item.url}
                        onClick={() => handleLinkClick(item.url)}
                        className={cn(
                          "group relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ease-out",
                          "hover:bg-accent/50 hover:shadow-sm",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                          isLoading && "opacity-60 cursor-wait",
                          isActive
                            ? "bg-accent text-accent-foreground shadow-sm font-medium"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {/* Active indicator bar */}
                        {isActive && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
                        )}

                        <div
                          className={cn(
                            "flex items-center justify-center transition-transform duration-200",
                            isActive && "scale-110"
                          )}
                        >
                          {isLoading ? (
                            <Loader2 className="h-4 w-4 text-primary animate-spin" />
                          ) : (
                            <item.icon
                              className={cn(
                                "h-4 w-4 transition-colors duration-200",
                                isActive
                                  ? "text-primary"
                                  : "text-muted-foreground group-hover:text-foreground"
                              )}
                            />
                          )}
                        </div>
                        <span
                          className={cn(
                            "text-sm transition-colors duration-200",
                            isActive && "font-semibold"
                          )}
                        >
                          {item.title}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Modules Section */}
        {moduleItems.length > 0 && (
          <SidebarGroup className="px-2 py-4">
            <SidebarGroupLabel className="px-3 mb-2 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
              Modules
            </SidebarGroupLabel>
            <SidebarGroupContent className="pb-0">
              <SidebarMenu className="space-y-1">
                {moduleItems.map((item) => {
                  const isActive =
                    pathname === item.url ||
                    pathname.startsWith(item.url + "/");
                  const isLoading = loadingPath === item.url;

                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild>
                        <Link
                          href={item.url}
                          onClick={() => handleLinkClick(item.url)}
                          className={cn(
                            "group relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ease-out",
                            "hover:bg-accent/50 hover:shadow-sm",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                            isLoading && "opacity-60 cursor-wait",
                            isActive
                              ? "bg-accent text-accent-foreground shadow-sm font-medium"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {/* Active indicator bar */}
                          {isActive && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
                          )}

                          <div
                            className={cn(
                              "flex items-center justify-center transition-transform duration-200",
                              isActive && "scale-110"
                            )}
                          >
                            {isLoading ? (
                              <Loader2 className="h-4 w-4 text-primary animate-spin" />
                            ) : (
                              <item.icon
                                className={cn(
                                  "h-4 w-4 transition-colors duration-200",
                                  isActive
                                    ? "text-primary"
                                    : "text-muted-foreground group-hover:text-foreground"
                                )}
                              />
                            )}
                          </div>
                          <span
                            className={cn(
                              "text-sm transition-colors duration-200",
                              isActive && "font-semibold"
                            )}
                          >
                            {item.title}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Form 137 Section - For School Head */}
        {form137MenuItems.length > 0 && (
          <SidebarGroup className="px-2 py-4">
            <SidebarGroupLabel className="px-3 mb-2 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
              Records
            </SidebarGroupLabel>
            <SidebarGroupContent className="pb-0">
              <SidebarMenu className="space-y-1">
                {form137MenuItems.map((item) => {
                  const isActive =
                    pathname === item.url ||
                    pathname.startsWith(item.url + "/");
                  const isLoading = loadingPath === item.url;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild>
                        <Link
                          href={item.url}
                          onClick={() => handleLinkClick(item.url)}
                          className={cn(
                            "group relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ease-out",
                            "hover:bg-accent/50 hover:shadow-sm",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                            isLoading && "opacity-60 cursor-wait",
                            isActive
                              ? "bg-accent text-accent-foreground shadow-sm font-medium"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {isActive && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
                          )}
                          <div
                            className={cn(
                              "flex items-center justify-center transition-transform duration-200",
                              isActive && "scale-110"
                            )}
                          >
                            {isLoading ? (
                              <Loader2 className="h-4 w-4 text-primary animate-spin" />
                            ) : (
                              <item.icon
                                className={cn(
                                  "h-4 w-4 transition-colors duration-200",
                                  isActive
                                    ? "text-primary"
                                    : "text-muted-foreground group-hover:text-foreground"
                                )}
                              />
                            )}
                          </div>
                          <span
                            className={cn(
                              "text-sm transition-colors duration-200",
                              isActive && "font-semibold"
                            )}
                          >
                            {item.title}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Settings Section - Only for Super Admin and School Head */}
        {settingItems.length > 0 && (
          <SidebarGroup className="px-2 py-4">
            <SidebarGroupLabel className="px-3 mb-2 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
              Settings
            </SidebarGroupLabel>
            <SidebarGroupContent className="pb-0">
              <SidebarMenu className="space-y-1">
                {settingItems.map((item) => {
                  const isActive = pathname === item.url;
                  const isLoading = loadingPath === item.url;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild>
                        <Link
                          href={item.url}
                          onClick={() => handleLinkClick(item.url)}
                          className={cn(
                            "group relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ease-out",
                            "hover:bg-accent/50 hover:shadow-sm",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                            isLoading && "opacity-60 cursor-wait",
                            isActive
                              ? "bg-accent text-accent-foreground shadow-sm font-medium"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {/* Active indicator bar */}
                          {isActive && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
                          )}

                          <div
                            className={cn(
                              "flex items-center justify-center transition-transform duration-200",
                              isActive && "scale-110"
                            )}
                          >
                            {isLoading ? (
                              <Loader2 className="h-4 w-4 text-primary animate-spin" />
                            ) : (
                              <item.icon
                                className={cn(
                                  "h-4 w-4 transition-colors duration-200",
                                  isActive
                                    ? "text-primary"
                                    : "text-muted-foreground group-hover:text-foreground"
                                )}
                              />
                            )}
                          </div>
                          <span
                            className={cn(
                              "text-sm transition-colors duration-200",
                              isActive && "font-semibold"
                            )}
                          >
                            {item.title}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
