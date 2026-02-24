"use client";

import {
  BookMarked,
  BookOpen,
  Building2,
  Calendar,
  ClipboardCheck,
  ClipboardList,
  FileBarChart,
  FileText,
  GraduationCap,
  Heart,
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
      title: "Books",
      url: "/books",
      icon: BookMarked,
      moduleName: "books",
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
    {
      title: "Attendance",
      url: "/attendance",
      icon: ClipboardCheck,
      moduleName: "attendance",
    },
    {
      title: "Learner Health",
      url: "/health",
      icon: Heart,
      moduleName: "health",
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
    {
      title: "Attendance",
      url: "/attendance",
      icon: ClipboardCheck,
      moduleName: "attendance",
    },
  ];

  // Filter modules based on user access and role
  const userType = user?.type;
  const isSchoolHead = userType === "school_head" || userType === "super admin";
  const isDivisionAdmin = userType === "division_admin";

  // School management access: school_head, admin, registrar have similar functions
  const hasSchoolManagementAccess =
    isSchoolHead || userType === "admin" || userType === "registrar";

  // Staff page: only admin and school_head can access (registrar cannot)
  const hasStaffAccess = isSchoolHead || userType === "admin";

  // Determine which modules to show based on role (Modules section)
  let visibleModuleItems: ModuleItem[] = [];

  if (hasSchoolManagementAccess) {
    // School Head, Admin, and Registrar see all modules
    visibleModuleItems = allModuleItems;
  }
  // Teachers see Students in Teacher Menu (teacherItems), not in Modules

  const moduleItems = visibleModuleItems;

  // Teacher Menu: show teacherItems for all users EXCEPT division_admin
  const showTeacherMenu = !isDivisionAdmin && teacherItems.length > 0;

  // Settings items - built based on access
  const settingItems: { title: string; url: string; icon: typeof User }[] = [];
  if (hasStaffAccess) {
    settingItems.push({ title: "Staff", url: "/staff", icon: User });
  }
  if (hasSchoolManagementAccess) {
    settingItems.push({ title: "Rooms", url: "/rooms", icon: Building2 });
  }

  // Form 137 and DepEd School Forms (for school_head, admin, registrar)
  const form137Items: ModuleItem[] = [
    {
      title: "Requests",
      url: "/formrequests/requests",
      icon: FileText,
      moduleName: "form137",
    },
    {
      title: "DepEd School Forms",
      url: "/reports",
      icon: FileBarChart,
      moduleName: "deped_forms",
    },
  ];
  const form137MenuItems = hasSchoolManagementAccess ? form137Items : [];

  // Division admin items (only for division_admin)
  const divisionItems: ModuleItem[] = [
    {
      title: "Schools",
      url: "/division/schools",
      icon: Building2,
      moduleName: "division_schools",
    },
    {
      title: "Users",
      url: "/division/users",
      icon: Users,
      moduleName: "division_users",
    },
    {
      title: "Division Reports",
      url: "/division/reports",
      icon: FileBarChart,
      moduleName: "division_reports",
    },
    {
      title: "DepEd School Forms",
      url: "/reports",
      icon: FileBarChart,
      moduleName: "deped_forms",
    },
  ];

  return (
    <Sidebar className="pt-13 border-r border-border/40">
      <SidebarContent className="bg-linear-to-b from-background via-background to-muted/20 backdrop-blur-sm">
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
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {/* Active indicator bar */}
                        {isActive && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
                        )}

                        <div
                          className={cn(
                            "flex items-center justify-center transition-transform duration-200",
                            isActive && "scale-110",
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
                                  : "text-muted-foreground group-hover:text-foreground",
                              )}
                            />
                          )}
                        </div>
                        <span
                          className={cn(
                            "text-sm transition-colors duration-200",
                            isActive && "font-semibold",
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
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {/* Active indicator bar */}
                          {isActive && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
                          )}

                          <div
                            className={cn(
                              "flex items-center justify-center transition-transform duration-200",
                              isActive && "scale-110",
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
                                    : "text-muted-foreground group-hover:text-foreground",
                                )}
                              />
                            )}
                          </div>
                          <span
                            className={cn(
                              "text-sm transition-colors duration-200",
                              isActive && "font-semibold",
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

        {/* Teacher Menu Section - For all users except division_admin */}
        {showTeacherMenu && (
          <SidebarGroup className="px-2 py-4">
            <SidebarGroupLabel className="px-3 mb-2 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
              Teacher Menu
            </SidebarGroupLabel>
            <SidebarGroupContent className="pb-0">
              <SidebarMenu className="space-y-1">
                {teacherItems.map((item) => {
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
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {/* Active indicator bar */}
                          {isActive && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
                          )}

                          <div
                            className={cn(
                              "flex items-center justify-center transition-transform duration-200",
                              isActive && "scale-110",
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
                                    : "text-muted-foreground group-hover:text-foreground",
                                )}
                              />
                            )}
                          </div>
                          <span
                            className={cn(
                              "text-sm transition-colors duration-200",
                              isActive && "font-semibold",
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

        {/* Division Office Section - For Division Admin */}
        {isDivisionAdmin && (
          <SidebarGroup className="px-2 py-4">
            <SidebarGroupLabel className="px-3 mb-2 text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
              Division Office
            </SidebarGroupLabel>
            <SidebarGroupContent className="pb-0">
              <SidebarMenu className="space-y-1">
                {divisionItems.map((item) => {
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
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {isActive && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
                          )}
                          <div
                            className={cn(
                              "flex items-center justify-center transition-transform duration-200",
                              isActive && "scale-110",
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
                                    : "text-muted-foreground group-hover:text-foreground",
                                )}
                              />
                            )}
                          </div>
                          <span
                            className={cn(
                              "text-sm transition-colors duration-200",
                              isActive && "font-semibold",
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
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {isActive && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
                          )}
                          <div
                            className={cn(
                              "flex items-center justify-center transition-transform duration-200",
                              isActive && "scale-110",
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
                                    : "text-muted-foreground group-hover:text-foreground",
                                )}
                              />
                            )}
                          </div>
                          <span
                            className={cn(
                              "text-sm transition-colors duration-200",
                              isActive && "font-semibold",
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

        {/* Settings Section - Staff for admin/school_head; Rooms for admin/registrar/school_head */}
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
                              : "text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {/* Active indicator bar */}
                          {isActive && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full" />
                          )}

                          <div
                            className={cn(
                              "flex items-center justify-center transition-transform duration-200",
                              isActive && "scale-110",
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
                                    : "text-muted-foreground group-hover:text-foreground",
                                )}
                              />
                            )}
                          </div>
                          <span
                            className={cn(
                              "text-sm transition-colors duration-200",
                              isActive && "font-semibold",
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
