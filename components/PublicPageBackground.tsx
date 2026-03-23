export function PublicPageBackground() {
  return (
    <div className="fixed inset-0 -z-10" aria-hidden>
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-105"
        style={{ backgroundImage: "url(/home.jpg)" }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900/85 via-slate-900/75 to-slate-900/90" />

      {/* Subtle gradient orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-slate-500/5 blur-3xl animate-[float_20s_ease-in-out_infinite]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-slate-600/5 blur-3xl animate-[float_25s_ease-in-out_infinite_reverse]" />
      <div className="absolute top-[40%] right-[20%] w-[300px] h-[300px] rounded-full bg-slate-500/4 blur-3xl animate-[float_18s_ease-in-out_infinite_2s]" />
    </div>
  );
}
