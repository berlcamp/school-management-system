import { LifeBuoy } from "lucide-react";

/** The public Help Desk pages' hero and card, matching /requests. */
export function PublicShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="relative pb-28 pt-28 sm:pb-36 sm:pt-32">
        <div className="absolute inset-0" aria-hidden>
          <div
            className="absolute inset-0 scale-105 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: "url(/home.jpg)" }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-900/80 via-slate-900/70 to-slate-900/90" />
        </div>
        <div className="absolute bottom-0 left-0 right-0 z-[1] h-24 bg-gradient-to-t from-slate-50 to-transparent" />
        <div className="relative z-10 mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 backdrop-blur-sm">
            <LifeBuoy className="h-3.5 w-3.5 text-white/80" aria-hidden="true" />
            <span className="text-xs font-medium text-white/80">Schools Division of Bayugan City</span>
          </div>
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">{title}</h1>
          <p className="mt-2 text-white/70">{subtitle}</p>
        </div>
      </div>
      <div className="relative z-10 -mt-24 bg-slate-50">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="relative rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-8">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** Shown on the public pages while a super admin has the Help Desk off. */
export function PublicClosed() {
  return (
    <div className="text-center">
      <h2 className="text-lg font-semibold text-gray-900">The Help Desk is not open right now</h2>
      <p className="mt-2 text-sm text-gray-700">
        Please contact the Schools Division Office of Bayugan City directly.
      </p>
    </div>
  );
}
