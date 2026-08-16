import Image from 'next/image';
import { CENTER_NAME, CENTER_TAGLINE, FOUNDER_NAME } from '@/lib/brand';

export function BrandMark({
  size = 'md',
  layout = 'row',
  showTagline = false,
  invert = false,
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  layout?: 'row' | 'stack';
  showTagline?: boolean;
  invert?: boolean;
  className?: string;
}) {
  const dims = { sm: 40, md: 56, lg: 88, xl: 160 }[size];
  const stack = layout === 'stack';
  const nameCls = invert ? 'text-white' : 'text-navy';
  const founderCls = invert ? 'text-gold-soft' : 'text-gold-deep';
  const tagCls = invert ? 'text-white/55' : 'text-navy/40';

  const wordmark = (
    <div className={stack ? 'text-center' : 'min-w-0'}>
      <p
        className={`font-extrabold leading-none tracking-tight ${
          size === 'xl' ? 'text-3xl' : size === 'lg' ? 'text-2xl' : 'text-lg'
        } ${nameCls}`}
      >
        {CENTER_NAME}
      </p>
      <p
        className={`mt-1 font-semibold leading-none ${
          size === 'xl' || size === 'lg' ? 'text-sm' : 'text-[11px]'
        } ${founderCls}`}
      >
        {FOUNDER_NAME}
      </p>
      {showTagline ? (
        <p
          className={`mt-1.5 uppercase tracking-[0.22em] text-[10px] ${tagCls}`}
        >
          {CENTER_TAGLINE}
        </p>
      ) : null}
    </div>
  );

  return (
    <div
      className={`flex ${stack ? 'flex-col items-center' : 'items-center'} gap-3 ${className}`}
    >
      <div className={stack ? 'text-center' : ''}>
        <Image
          src="/success-logo.png"
          alt={`${CENTER_NAME} · ${FOUNDER_NAME}`}
          width={dims}
          height={dims}
          className="object-contain rounded-full shadow-md ring-2 ring-gold/35"
          priority
        />
        {stack ? (
          <p className={`mt-1.5 text-[10px] font-semibold ${founderCls}`}>
            {FOUNDER_NAME}
          </p>
        ) : null}
      </div>
      {wordmark}
    </div>
  );
}

/** Logo + names for print posters (plain img, no next/image) */
export function PrintBrand({
  invert = true,
}: {
  invert?: boolean;
}) {
  return (
    <div className="text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/success-logo.png"
        alt={`${CENTER_NAME} · ${FOUNDER_NAME}`}
        className="mx-auto h-24 w-24 rounded-full bg-white p-1 object-contain shadow"
      />
      <p
        className={`mt-1.5 text-[11px] font-semibold ${
          invert ? 'text-amber-300' : 'text-amber-800'
        }`}
      >
        {FOUNDER_NAME}
      </p>
      <p
        className={`mt-2 text-3xl font-extrabold tracking-tight ${
          invert ? 'text-white' : 'text-[#0B2545]'
        }`}
      >
        {CENTER_NAME}
      </p>
      <p
        className={`mt-1 text-sm font-semibold ${
          invert ? 'text-amber-200' : 'text-amber-800'
        }`}
      >
        {FOUNDER_NAME}
      </p>
      <p
        className={`mt-1 text-[11px] tracking-[0.28em] uppercase ${
          invert ? 'text-amber-300/80' : 'text-amber-700'
        }`}
      >
        {CENTER_TAGLINE}
      </p>
    </div>
  );
}
