// Fixed decorative backdrop for the landing page: two slow-drifting blurred
// blobs plus a faint fading grid. Pure CSS animation, no state; sits behind
// everything (-z-10) and never intercepts clicks.
export function AuroraBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      <div className="aurora-grid absolute inset-0" />
      <div
        className="aurora-blob-a absolute -left-24 top-0 h-[36rem] w-[36rem] rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(99,102,241,0.35), transparent 65%)" }}
      />
      <div
        className="aurora-blob-b absolute right-0 top-1/3 h-[30rem] w-[30rem] rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(139,92,246,0.3), transparent 65%)" }}
      />
    </div>
  );
}
