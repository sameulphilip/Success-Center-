import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  FileText,
  GraduationCap,
  Home,
  Layers,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  PlayCircle,
  Settings,
  Shield,
  TrendingUp,
  Users,
  Wallet,
  X,
} from 'lucide-react';

export type NavTone =
  | 'gold'
  | 'sky'
  | 'teal'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'indigo'
  | 'cyan'
  | 'orange';

export const NavIcons = {
  dashboard: LayoutDashboard,
  students: GraduationCap,
  teachers: Users,
  groups: Layers,
  calendar: CalendarDays,
  attendance: ClipboardCheck,
  finance: Wallet,
  bookings: BookOpen,
  ops: PlayCircle,
  revenue: TrendingUp,
  reports: BarChart3,
  exams: FileText,
  messaging: MessageSquare,
  users: Shield,
  settings: Settings,
  portal: Home,
  logout: LogOut,
  menu: Menu,
  close: X,
} as const;

export type NavIconKey = keyof typeof NavIcons;

export function NavGlyph({
  name,
  className = '',
  size = 18,
}: {
  name: NavIconKey;
  className?: string;
  size?: number;
}) {
  const Icon: LucideIcon = NavIcons[name];
  return <Icon size={size} strokeWidth={2} className={className} aria-hidden />;
}
