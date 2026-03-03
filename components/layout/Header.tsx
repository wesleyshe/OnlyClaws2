'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MdCode, MdSportsEsports, MdDashboard } from 'react-icons/md';
import ThemeToggle from '@/components/ui/ThemeToggle';

const navLinks = [
  { href: '/sessions', label: 'Sessions', icon: MdCode },
  { href: '/games', label: 'Games', icon: MdSportsEsports },
  { href: '/dashboard', label: 'Dashboard', icon: MdDashboard },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-950/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <span className="text-2xl">🐾</span>
          <span className="hidden sm:inline bg-gradient-to-r from-primary-600 to-accent-500 bg-clip-text text-transparent">
            OnlyClaws
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {navLinks.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/');
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
