export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div>
        <h2 className="text-2xl sm:text-[1.75rem] font-extrabold text-navy tracking-tight">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-1 text-sm text-navy/50">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}
