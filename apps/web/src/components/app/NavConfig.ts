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
  Link2,
  type LucideIcon,
} from "lucide-react";
import { pluginNavItems, pluginTabItems } from "@/plugins/registry";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const coreNavItems: NavItem[] = [
  { label: "Dashboard",    href: "/dashboard",                    icon: LayoutDashboard },
  { label: "Scout",        href: "/scout",                        icon: Crosshair       },
  { label: "Import URL",   href: "/import",                       icon: Link2           },
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

export const navItems: NavItem[] = [...coreNavItems, ...pluginNavItems];

export interface TabItem {
  label: string;
  href: string | null;
  icon: LucideIcon;
}

const coreTabItems: TabItem[] = [
  { label: "Queue",  href: "/queue",        icon: Inbox     },
  { label: "Saved",  href: "/saved",        icon: Bookmark  },
  { label: "Applied",href: "/applications", icon: FileText  },
  { label: "More",   href: null,            icon: LayoutDashboard },
];

export const tabItems: TabItem[] = [...coreTabItems, ...pluginTabItems];
