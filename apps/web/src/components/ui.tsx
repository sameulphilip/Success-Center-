import type { ReactNode } from 'react';
import {
  CircleDollarSign,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  Waves,
} from 'lucide-react';

export function PageHero({
  eyebrow = 'SUCCESS',
  title,
  subtitle,
  metrics,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  metrics?: { label: string; value: string | number; highlight?: boolean }[];
  actions?: ReactNode;
}) {
  return (
    <section className="relative mb-5 overflow-hidden rounded-2xl bg-navy text-white p-5 sm:p-6 shadow-panel">
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            'radial-gradient(500px 220px at 100% 0%, rgba(201,150,18,0.28), transparent 55%), radial-gradient(420px 200px at 0% 100%, rgba(2,132,199,0.22), transparent 50%)',
        }}
      />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0 w-full sm:w-auto sm:flex-1">
          <p className="text-xs tracking-[0.22em] text-gold font-bold">
            {eyebrow}
          </p>
          <h2 className="mt-1 text-xl sm:text-2xl font-extrabold break-words">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 text-sm text-white/65 max-w-2xl">{subtitle}</p>
          ) : null}
          {actions ? (
            <div className="mt-4 flex flex-col xs:flex-row flex-wrap gap-2 page-actions sm:flex-row">
              {actions}
            </div>
          ) : null}
        </div>
        {metrics?.length ? (
          <div
            className={`w-full grid gap-2 sm:gap-3 text-center ${
              metrics.length >= 4
                ? 'grid-cols-2 sm:grid-cols-4'
                : metrics.length === 3
                  ? 'grid-cols-3'
                  : 'grid-cols-2'
            }`}
          >
            {metrics.map((m, i) => {
              const tones = [
                'from-gold/25 to-gold/5',
                'from-sky-400/25 to-sky-400/5',
                'from-teal-400/25 to-teal-400/5',
                'from-emerald-400/25 to-emerald-400/5',
              ];
              return (
                <div
                  key={m.label}
                  className={`rounded-xl bg-gradient-to-b ${tones[i % tones.length]} border border-white/10 px-2 py-2 sm:px-3 backdrop-blur-[2px] min-w-0`}
                >
                  <p className="text-[10px] sm:text-[11px] text-white/60 truncate">
                    {m.label}
                  </p>
                  <p
                    className={`text-base sm:text-xl font-extrabold tabular-nums break-all ${
                      m.highlight ? 'text-gold' : 'text-white'
                    }`}
                  >
                    {m.value}
                  </p>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function SectionCard({
  title,
  subtitle,
  badge,
  action,
  children,
  className = '',
}: {
  title?: string;
  subtitle?: string;
  badge?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel p-4 sm:p-5 ${className}`}>
      {(title || action || badge) && (
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {title ? <h3 className="section-title">{title}</h3> : null}
              {badge}
            </div>
            {subtitle ? (
              <p className="text-xs text-navy/45 mt-1">{subtitle}</p>
            ) : null}
          </div>
          {action ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto min-w-0">
              {action}
            </div>
          ) : null}
        </div>
      )}
      {children}
    </section>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  accent = 'navy',
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: 'navy' | 'gold' | 'green' | 'red' | 'sky' | 'teal';
}) {
  const theme = {
    navy: {
      icon: 'bg-navy/10 text-navy',
      value: 'text-navy',
      Glyph: Users,
    },
    gold: {
      icon: 'bg-gold/20 text-gold-deep',
      value: 'text-navy',
      Glyph: Sparkles,
    },
    green: {
      icon: 'bg-emerald-100 text-emerald-700',
      value: 'text-emerald-800',
      Glyph: TrendingUp,
    },
    red: {
      icon: 'bg-rose-100 text-rose-700',
      value: 'text-rose-800',
      Glyph: TrendingDown,
    },
    sky: {
      icon: 'bg-sky-100 text-sky-700',
      value: 'text-sky-900',
      Glyph: CircleDollarSign,
    },
    teal: {
      icon: 'bg-teal-100 text-teal-700',
      value: 'text-teal-900',
      Glyph: Waves,
    },
  }[accent];
  const Glyph = theme.Glyph;

  return (
    <div className="panel relative overflow-hidden p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-navy/50">{label}</p>
          <p
            className={`mt-2 text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight ${theme.value}`}
          >
            {value}
          </p>
          {hint ? <p className="mt-2 text-xs text-navy/45">{hint}</p> : null}
        </div>
        <span
          className={`h-9 w-9 shrink-0 rounded-xl grid place-items-center ${theme.icon}`}
          aria-hidden
        >
          <Glyph size={18} strokeWidth={2} />
        </span>
      </div>
    </div>
  );
}

export function AlertBanner({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'success' | 'info';
  children: ReactNode;
}) {
  const styles = {
    error: 'border-rose-200 bg-rose-50 text-rose-700',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    info: 'border-sky-200 bg-sky-50 text-sky-900',
  }[tone];

  return (
    <p className={`mb-4 rounded-xl border px-4 py-3 text-sm ${styles}`}>
      {children}
    </p>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="text-sm text-navy/45 py-8 text-center">{children}</p>
  );
}

export function ListRow({
  title,
  subtitle,
  meta,
  trailing,
  onClick,
  href,
  active,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  href?: string;
  active?: boolean;
}) {
  const className = `w-full text-right rounded-xl px-3 py-2.5 transition border ${
    active
      ? 'border-sky/30 bg-sky/5'
      : 'border-transparent bg-sand/70 hover:bg-sand hover:border-mist'
  }`;

  const body = (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="font-semibold text-navy text-sm truncate">{title}</div>
        {subtitle ? (
          <div className="text-xs text-navy/55 mt-0.5">{subtitle}</div>
        ) : null}
        {meta ? <div className="text-[11px] text-navy/40 mt-1">{meta}</div> : null}
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );

  if (href) {
    return (
      <a href={href} className={`block ${className}`}>
        {body}
      </a>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {body}
      </button>
    );
  }

  return <div className={className}>{body}</div>;
}

export function FormGrid({ children }: { children: ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}

export function FieldLabel({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-sm font-medium text-navy/80">
      {label}
      {children}
    </label>
  );
}
