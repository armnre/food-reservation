import Image from 'next/image';
export default function Logo({
  size = 44,
  inverse = false,
  compact = false,
}: {
  size?: number;
  inverse?: boolean;
  compact?: boolean;
}) {
  return (
    <span className={`brand-lockup ${inverse ? 'brand-inverse' : ''}`}>
      <Image src="/brand/hamsofre.svg" alt="نشان هم‌سفره" width={size} height={size} priority />
      {!compact && (
        <span>
          <strong>
            هم‌سفره<span className="brand-dot">.</span>
          </strong>
          <small>یک سفره، به وسعت دانشگاه</small>
        </span>
      )}
    </span>
  );
}
