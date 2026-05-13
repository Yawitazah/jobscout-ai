import {
  LayoutDashboard,
  Inbox,
  FileText,
  Calendar,
  User,
  Settings,
  ClipboardList,
  Mail,
  Bell,
  Crosshair,
  Bookmark,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  { label: "Dashboard",    href: "/dashboard",                    icon: LayoutDashboard },
  { label: "Scout",        href: "/scout",                        icon: Crosshair       },
  { label: "Job Queue",    href: "/queue",                        icon: Inbox           },
  { label: "Saved",        href: "/saved",                        icon: Bookmark        },
  { label: "Applications", href: "/applications",                 icon: FileText        },
  { label: "Interviews",   href: "/interviews",                   icon: Calendar        },
  { label: "Profile",      href: "/profile",                      icon: User            },
  { label: "Preferences",  href: "/preferences",                  icon: Settings        },
  { label: "App Answers",  href: "/settings/application-answers", icon: ClipboardList   },
  { label: "Email",        href: "/settings/email",               icon: Mail            },
  { label: "Notifications",href: "/settings/notifications",       icon: Bell            },
];

export interface TabItem {
  label: string;
  href: string | null;
  icon: LucideIcon;
}

export const tabItems: TabItem[] = [
  { label: "Queue",  href: "/queue",        icon: Inbox     },
  { label: "Saved",  href: "/saved",        icon: Bookmark  },
  { label: "Applied",href: "/applications", icon: FileText  },
  { label: "More",   href: null,            icon: LayoutDashboard },
];
