"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { supabase } from "@/lib/supabase/client";
import {
  ArrowRight,
  Building2,
  FileBarChart,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

interface SchoolUserCount {
  school_id: string;
  school_name: string;
  count: number;
}

export default function Page() {
  const [schoolsCount, setSchoolsCount] = useState(0);
  const [usersCount, setUsersCount] = useState(0);
  const [usersBySchool, setUsersBySchool] = useState<SchoolUserCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const { count: schoolsCnt } = await supabase
        .from("sms_schools")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);

      setSchoolsCount(schoolsCnt || 0);

      const { count: usersCnt } = await supabase
        .from("sms_users")
        .select("*", { count: "exact", head: true })
        .neq("type", "division_admin");

      setUsersCount(usersCnt || 0);

      const { data: schools } = await supabase
        .from("sms_schools")
        .select("id, name")
        .eq("is_active", true);

      const { data: users } = await supabase
        .from("sms_users")
        .select("school_id")
        .neq("type", "division_admin");

      const schoolMap = new Map<string, string>();
      schools?.forEach((s) => schoolMap.set(String(s.id), s.name));

      const countsBySchool = new Map<string, number>();
      users?.forEach((u) => {
        if (u.school_id) {
          const c = countsBySchool.get(u.school_id) || 0;
          countsBySchool.set(u.school_id, c + 1);
        }
      });

      const bySchool: SchoolUserCount[] = Array.from(countsBySchool.entries())
        .map(([schoolId, count]) => ({
          school_id: schoolId,
          school_name: schoolMap.get(schoolId) || schoolId,
          count,
        }))
        .sort((a, b) => b.count - a.count);

      setUsersBySchool(bySchool);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="app__title">
        <h1 className="app__title_text">Division Dashboard</h1>
      </div>
      <div className="app__content">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Schools
              </CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? "..." : schoolsCount}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Schools in this division
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Users
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? "..." : usersCount}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Staff across all schools
              </p>
            </CardContent>
          </Card>
        </div>

        {usersBySchool.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Users by School
              </CardTitle>
              <CardDescription>
                Staff count per school in this division
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {usersBySchool.map((s) => (
                  <div
                    key={s.school_id}
                    className="flex items-center justify-between py-2 border-b border-border last:border-0"
                  >
                    <span className="text-sm">{s.school_name}</span>
                    <span className="text-sm font-medium">{s.count} users</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Schools
              </CardTitle>
              <CardDescription>
                Manage schools in this division
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/division/schools">
                <Button variant="outline" className="w-full">
                  View Schools
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Users
              </CardTitle>
              <CardDescription>
                Manage users and assign to schools
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/division/users">
                <Button variant="outline" className="w-full">
                  View Users
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileBarChart className="h-5 w-5" />
                Reports
              </CardTitle>
              <CardDescription>
                View common DepEd division reports
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/division/reports">
                <Button variant="outline" className="w-full">
                  View Reports
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
