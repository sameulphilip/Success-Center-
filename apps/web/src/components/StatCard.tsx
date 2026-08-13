import { KpiCard } from '@/components/ui';

/** @deprecated Prefer KpiCard — kept for compatibility */
export function StatCard({
  label,
  value,
  tone = 'sea',
  hint,
}: {
  label: string;
  value: string | number;
  tone?: 'sea' | 'coral' | 'ink';
  hint?: string;
}) {
  const accent =
    tone === 'coral' ? 'gold' : tone === 'ink' ? 'navy' : 'navy';
  return <KpiCard label={label} value={value} hint={hint} accent={accent} />;
}
