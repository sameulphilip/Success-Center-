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
    <div className="mb-5 sm:mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-xl sm:text-[1.75rem] font-extrabold text-navy tracking-tight break-words">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-1 text-sm text-navy/50">{subtitle}</p>
        ) : null}
      </div>
      {action ? (
        <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full sm:w-auto page-actions">
          {action}
        </div>
      ) : null}
    </div>
  );
}
