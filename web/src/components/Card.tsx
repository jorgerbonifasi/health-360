import type { ReactNode } from "react";

export function Card({
  title,
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-slate-800/60 p-4 shadow-lg ring-1 ring-white/5">
      {title && (
        <header className="mb-3">
          <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
          {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
        </header>
      )}
      {children}
    </section>
  );
}
