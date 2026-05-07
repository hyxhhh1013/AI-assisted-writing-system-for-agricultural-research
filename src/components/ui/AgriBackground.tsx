"use client";

export function AgriBackground() {
  return (
    <div className="fixed inset-0 -z-10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/20 via-transparent to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-[40vh] bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-blue-900/10 via-transparent to-transparent" />
    </div>
  );
}
