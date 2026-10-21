/** A person's initials in a circle; decorative, since the name is always shown beside it. */
export function Initials({
  name,
  className = "",
  tone = "gray",
}: {
  name: string;
  className?: string;
  tone?: "gray" | "blue" | "amber";
}) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .filter((_, i, all) => i === 0 || i === all.length - 1)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  const tones = {
    gray: "bg-gray-200 text-gray-700",
    blue: "bg-blue-100 text-blue-800",
    amber: "bg-amber-100 text-amber-800",
  };
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${tones[tone]} ${className}`}
    >
      {letters || "?"}
    </span>
  );
}
