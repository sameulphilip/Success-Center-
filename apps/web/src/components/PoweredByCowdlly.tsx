import Image from 'next/image';

const COWDLLY_URL = 'https://cowdlly.com/';

export function PoweredByCowdlly({
  variant = 'light',
  className = '',
}: {
  variant?: 'light' | 'dark' | 'onNavy';
  className?: string;
}) {
  const muted =
    variant === 'onNavy'
      ? 'text-white/55 hover:text-white/90'
      : 'text-navy/50 hover:text-navy';
  const brand =
    variant === 'onNavy' ? 'text-white/85' : 'text-navy/80';

  return (
    <a
      href={COWDLLY_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`group inline-flex items-center gap-2 rounded-lg px-1.5 py-1 transition ${muted} ${className}`}
      aria-label="Powered by Cowdlly — cowdlly.com"
      title="cowdlly.com"
    >
      <span className="text-[11px] tracking-wide">Powered by</span>
      <span className="inline-flex items-center gap-1.5">
        <Image
          src="/cowdlly-mark.png"
          alt=""
          width={22}
          height={22}
          className="h-[22px] w-[22px] rounded-md object-cover shadow-sm ring-1 ring-black/5"
        />
        <span className={`text-sm font-semibold tracking-tight ${brand}`}>
          Cowdlly
        </span>
      </span>
    </a>
  );
}
