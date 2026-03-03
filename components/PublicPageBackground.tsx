export function PublicPageBackground() {
  return (
    <div className="fixed inset-0 -z-10" aria-hidden>
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url(/home.jpg)" }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/70 to-black/80" aria-hidden />
    </div>
  );
}
