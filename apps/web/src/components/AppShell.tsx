'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { getStoredUser, logout, type AuthUser } from '@/lib/api';
import { PoweredByCowdlly } from '@/components/PoweredByCowdlly';
import { NavGlyph, type NavIconKey, type NavTone } from '@/components/nav-icons';

type NavItem = {
  href: string;
  label: string;
  icon: NavIconKey;
  tone: NavTone;
  perms?: string[];
  roles?: string[];
};

const adminNav: NavItem[] = [
  { href: '/dashboard', label: 'لوحة التحكم', icon: 'dashboard', tone: 'gold', perms: ['dashboard'] },
  { href: '/students', label: 'الطلاب', icon: 'students', tone: 'sky', perms: ['students'] },
  { href: '/teachers', label: 'المدرسون', icon: 'teachers', tone: 'indigo', perms: ['teachers'] },
  { href: '/groups', label: 'المجموعات', icon: 'groups', tone: 'teal', perms: ['groups', 'groups.own'] },
  { href: '/calendar', label: 'الجدول', icon: 'calendar', tone: 'cyan', perms: ['groups', 'groups.own'] },
  { href: '/attendance', label: 'الحضور', icon: 'attendance', tone: 'emerald', perms: ['attendance'] },
  { href: '/finance', label: 'الحسابات', icon: 'finance', tone: 'amber', perms: ['finance', 'finance.payments'] },
  { href: '/bookings', label: 'الحجز', icon: 'bookings', tone: 'orange', perms: ['bookings'] },
  { href: '/ops', label: 'تشغيل الحصص', icon: 'ops', tone: 'rose', perms: ['ops'] },
  { href: '/revenue', label: 'إيرادات', icon: 'revenue', tone: 'emerald', perms: ['revenue'] },
  { href: '/reports', label: 'التقارير', icon: 'reports', tone: 'sky', perms: ['reports'] },
  { href: '/exams', label: 'الامتحانات', icon: 'exams', tone: 'indigo', perms: ['exams'] },
  { href: '/messaging', label: 'التواصل', icon: 'messaging', tone: 'cyan', perms: ['messaging'] },
  { href: '/users', label: 'الحسابات', icon: 'users', tone: 'rose', perms: ['users'], roles: ['SUPER_ADMIN'] },
  { href: '/settings', label: 'الإعدادات', icon: 'settings', tone: 'gold', perms: ['settings'] },
];

const studentNav: NavItem[] = [
  { href: '/portal', label: 'بوابتي', icon: 'portal', tone: 'sky' },
  { href: '/calendar', label: 'الجدول', icon: 'calendar', tone: 'cyan' },
];

const parentNav: NavItem[] = [
  { href: '/portal', label: 'أبنائي', icon: 'portal', tone: 'sky' },
  { href: '/calendar', label: 'الجدول', icon: 'calendar', tone: 'cyan' },
];

const teacherNav: NavItem[] = [
  { href: '/attendance', label: 'الحضور', icon: 'attendance', tone: 'emerald' },
  { href: '/exams', label: 'الامتحانات', icon: 'exams', tone: 'indigo' },
  { href: '/groups', label: 'المجموعات', icon: 'groups', tone: 'teal' },
  { href: '/calendar', label: 'الجدول', icon: 'calendar', tone: 'cyan' },
];

function canSee(user: AuthUser, item: NavItem) {
  if (item.roles?.length && !item.roles.includes(user.role)) return false;
  const perms = user.permissions || [];
  if (perms.includes('*')) return true;
  if (!item.perms?.length) return true;
  return item.perms.some((p) => perms.includes(p));
}

function navForUser(user: AuthUser) {
  if (user.role === 'PARENT') return parentNav;
  if (user.role === 'STUDENT') return studentNav;
  if (user.role === 'TEACHER') return teacherNav;
  return adminNav.filter((item) => canSee(user, item));
}

function SideNav({
  user,
  pathname,
  onNavigate,
  onLogout,
}: {
  user: AuthUser;
  pathname: string;
  onNavigate?: () => void;
  onLogout: () => void;
}) {
  const nav = navForUser(user);
  const portalLabel =
    user.role === 'STUDENT'
      ? 'Student'
      : user.role === 'PARENT'
        ? 'Parent'
        : user.role === 'TEACHER'
          ? 'Teacher'
          : 'Admin';

  return (
    <>
      <div className="px-2 pb-5 mb-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Image
              src="/success-logo.png"
              alt="Success"
              width={48}
              height={48}
              className="object-contain rounded-full shadow-md ring-2 ring-gold/40"
              priority
            />
            <span className="absolute -bottom-0.5 -left-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-navy-deep" />
          </div>
          <div>
            <p className="font-extrabold text-white text-lg leading-none">Success</p>
            <p className="text-[10px] tracking-[0.2em] text-gold mt-1.5 uppercase">
              {portalLabel}
            </p>
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-gradient-to-l from-white/[0.08] to-gold/10 px-3 py-2.5 border border-white/10">
          <p className="text-sm font-medium text-white truncate">{user.fullName}</p>
          <p className="text-[11px] text-gold/90 mt-0.5">{user.role}</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto space-y-1 px-1">
        {nav.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`group flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm transition min-h-[44px] ${
                active
                  ? 'bg-gold text-navy-deep font-bold shadow-md shadow-gold/20'
                  : 'text-white/78 hover:bg-white/[0.07] hover:text-white'
              }`}
            >
              <span
                className={`nav-icon nav-tone-${item.tone} ${
                  active ? 'nav-icon-active' : ''
                }`}
              >
                <NavGlyph name={item.icon} size={17} />
              </span>
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <button
        onClick={onLogout}
        className="mt-4 mx-1 flex items-center gap-3 rounded-xl border border-white/10 px-2.5 py-2.5 text-sm text-white/70 hover:bg-rose-500/15 hover:text-rose-100 hover:border-rose-400/30 transition text-right min-h-[44px]"
      >
        <span className="nav-icon nav-tone-rose">
          <NavGlyph name="logout" size={17} />
        </span>
        تسجيل الخروج
      </button>
      <div className="mt-3 px-1 pb-1 border-t border-white/10 pt-3">
        <PoweredByCowdlly variant="onNavy" className="w-full justify-center" />
      </div>
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const u = getStoredUser();
    if (!u) {
      router.replace('/login');
      return;
    }
    setUser(u);
  }, [router]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  const allowedHrefs = useMemo(() => {
    if (!user) return [] as string[];
    return navForUser(user).map((n) => n.href);
  }, [user]);

  useEffect(() => {
    if (!user || !allowedHrefs.length) return;
    const publicish = ['/login', '/check-in', '/booking'];
    if (publicish.some((p) => pathname.startsWith(p))) return;
    const ok = allowedHrefs.some(
      (h) => pathname === h || pathname.startsWith(`${h}/`),
    );
    if (!ok) {
      router.replace(allowedHrefs[0]);
    }
  }, [user, pathname, allowedHrefs, router]);

  if (!user) {
    return (
      <div className="min-h-screen grid place-items-center bg-surface">
        <div className="animate-rise text-center">
          <Image
            src="/success-logo.png"
            alt="Success"
            width={88}
            height={88}
            className="rounded-full shadow-soft ring-2 ring-gold/30"
            priority
          />
          <p className="mt-3 text-sm text-navy/50">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  const current =
    navForUser(user).find((n) => pathname.startsWith(n.href))?.label ??
    'Success';

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[272px_1fr]">
      <aside className="brand-rail text-white p-4 hidden lg:flex lg:flex-col sticky top-0 h-screen">
        <SideNav user={user} pathname={pathname} onLogout={handleLogout} />
      </aside>

      <div className="min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 border-b border-mist/80 bg-white/85 backdrop-blur-md">
          <div className="flex items-center justify-between gap-3 px-3 sm:px-6 lg:px-8 h-14">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                className="lg:hidden inline-flex items-center gap-2 rounded-xl border border-mist bg-white px-3 py-2 text-sm font-medium text-navy min-h-[40px] shadow-soft"
                onClick={() => setMenuOpen(true)}
              >
                <NavGlyph name="menu" size={18} />
                القائمة
              </button>
              <div className="min-w-0">
                <p className="text-sm font-bold text-navy truncate">{current}</p>
                <p className="text-[11px] text-navy/40 hidden sm:block">
                  Success Center · Future Begins Here
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden sm:inline badge-gold">{user.role}</span>
              <div className="h-9 w-9 rounded-full bg-gradient-to-br from-navy to-navy-soft text-white grid place-items-center text-sm font-bold shadow-soft ring-2 ring-gold/25">
                {user.fullName?.charAt(0) || 'S'}
              </div>
            </div>
          </div>
        </header>

        {menuOpen ? (
          <div className="lg:hidden fixed inset-0 z-50">
            <button
              type="button"
              aria-label="إغلاق"
              className="absolute inset-0 bg-navy-deep/50"
              onClick={() => setMenuOpen(false)}
            />
            <aside className="absolute inset-y-0 right-0 w-[min(90vw,320px)] brand-rail text-white p-4 flex flex-col animate-rise safe-area-pad">
              <div className="mb-3 flex justify-between items-center px-1">
                <p className="text-sm text-gold font-semibold">القائمة</p>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-sm min-h-[40px]"
                >
                  <NavGlyph name="close" size={16} />
                  إغلاق
                </button>
              </div>
              <SideNav
                user={user}
                pathname={pathname}
                onNavigate={() => setMenuOpen(false)}
                onLogout={handleLogout}
              />
            </aside>
          </div>
        ) : null}

        <main className="p-3 sm:p-6 lg:p-8 animate-rise flex-1 overflow-x-hidden">
          {children}
        </main>
        <footer className="border-t border-mist px-3 sm:px-6 lg:px-8 py-3 flex justify-center bg-white/40">
          <PoweredByCowdlly variant="dark" />
        </footer>
      </div>
    </div>
  );
}
