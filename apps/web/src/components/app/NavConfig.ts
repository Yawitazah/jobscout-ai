import {
  LayoutDashboard,
  Inbox,
  FileText,
  Calendar,
  User,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Job Queue", href: "/queue", icon: Inbox },
  { label: "Applications", href: "/applications", icon: FileText },
  { label: "Interviews", href: "/interviews", icon: Calendar },
  { label: "Profile", href: "/profile", icon: User },
  { label: "Preferences", href: "/preferences", icon: Settings },
];

export interface TabItem {
  label: string;
  href: string | null;
  icon: LucideIcon;
}

export const tabItems: TabItem[] = [
  { label: "Queue", href: "/queue", icon: Inbox },
  { label: "Pipeline", href: "/applications", icon: FileText },
  { label: "Interviews", href: "/interviews", icon: Calendar },
  { label: "More", href: null, icon: LayoutDashboard },
];
