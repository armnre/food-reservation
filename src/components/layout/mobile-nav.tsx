'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, UtensilsCrossed, Ticket, Wallet, UserRound } from 'lucide-react';

/** Icons are created inside the client boundary, never serialized as functions. */
export function MobileNav({ role }: { role: string }) {
  const pathname = usePathname();
  const base = role === 'STAFF' ? '/staff' : '/student';
  const links = [
    { href: base, label: 'خانه', Icon: House },
    { href: `${base}/menu`, label: 'منوی غذا', Icon: UtensilsCrossed },
    { href: `${base}/reservations`, label: 'بلیط‌های من', Icon: Ticket },
    { href: `${base}/wallet`, label: 'کیف پول', Icon: Wallet },
    { href: '/profile', label: 'پروفایل', Icon: UserRound },
  ];
  return <nav aria-label="ناوبری پایین صفحه" className="mobile-bottom-nav">
    {links.map(({ href, label, Icon }) => <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined} className={pathname === href ? 'active' : ''}>
      <span><Icon size={21} strokeWidth={pathname === href ? 2.3 : 1.7} /></span><small>{label}</small>
    </Link>)}
  </nav>;
}
