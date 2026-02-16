import type { Metadata } from "next";
import "./globals.css";
import "./nprogress.css";

export const metadata: Metadata = {
  title: "School Management System - Schools Division of Bayugan City",
  description: "School Management System - Schools Division of Bayugan City",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-200 dark:bg-[#191919]" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
