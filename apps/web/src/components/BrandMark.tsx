import Image from 'next/image';

export function BrandMark({
  size = 'md',
  showTagline = false,
  invert = false,
}: {
  size?: 'sm' | 'md' | 'lg';
  showTagline?: boolean;
  invert?: boolean;
}) {
  const dims = { sm: 52, md: 72, lg: 140 }[size];

  return (
    <div className={`flex items-center gap-3 ${invert ? 'text-white' : 'text-navy'}`}>
      <Image
        src="/success-logo.png"
        alt="Success Center"
        width={dims}
        height={dims}
        className="object-contain rounded-full"
        priority
      />
      {showTagline ? (
        <div className="min-w-0">
          <p className="font-bold leading-none tracking-tight text-lg">Success</p>
          <p
            className={`mt-1 text-[10px] uppercase tracking-[0.22em] ${
              invert ? 'text-gold-soft' : 'text-gold-deep'
            }`}
          >
            Future Begins Here
          </p>
        </div>
      ) : null}
    </div>
  );
}
