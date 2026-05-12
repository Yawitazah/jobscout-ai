"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { UserProvider } from "./UserContext";
import { UserAvatar } from "./UserAvatar";
import { BellMenu } from "./BellMenu";
import { navItems, tabItems } from "./NavConfig";
import { cn } from "@/lib/utils";

function NavLink({
  href,
  icon: Icon,
  label,
  onClick,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(href + "/");

  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
        active
          ? "text-[#1A2B4C] bg-[#1A2B4C]/10"
          : "text-[#5A6478] hover:text-[#1A1A1A] hover:bg-[#F7F9FC]"
      )}
    >
      <Icon size={18} strokeWidth={active ? 2.5 : 2} />
      {label}
    </Link>
  );
}

function TopBar({ onMenuClick, userId }: { onMenuClick: () => void; userId: string }) {
  return (
    <header className="h-14 shrink-0 bg-white border-b border-[#E1E6EE] flex items-center px-4 gap-4 z-30">
      {/* Hamburger — mobile only */}
      <button
        onClick={onMenuClick}
        aria-label="Open menu"
        className="lg:hidden p-1.5 -ml-1 rounded-lg text-[#5A6478] hover:text-[#1A1A1A] hover:bg-[#F7F9FC] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A2B4C]/30 cursor-pointer"
      >
        <Menu size={22} />
      </button>

      {/* Wordmark */}
      <Link
        href="/dashboard"
        className="text-[#1A2B4C] font-bold text-lg tracking-tight flex-1 text-center lg:text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A2B4C]/30 rounded"
      >
        JobScout AI
      </Link>

      {/* Bell + Avatar */}
      <BellMenu userId={userId} />
      <UserAvatar />
    </header>
  );
}

function Sidebar() {
  return (
    <nav
      aria-label="Main navigation"
      className="hidden lg:flex flex-col w-60 shrink-0 bg-white border-r border-[#E1E6EE] py-4 px-3 gap-1"
    >
      {navItems.map((item) => (
        <NavLink key={item.href} {...item} />
      ))}
    </nav>
  );
}

function MobileDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "lg:hidden fixed inset-0 bg-black/40 z-40 transition-opacity duration-200",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-label="Navigation menu"
        aria-modal="true"
        className={cn(
          "lg:hidden fixed inset-y-0 left-0 w-64 bg-white border-r border-[#E1E6EE] z-50 flex flex-col transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Drawer header */}
        <div className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-[#E1E6EE]">
          <span className="text-[#1A2B4C] font-bold text-lg tracking-tight">
            JobScout AI
          </span>
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="p-1.5 rounded-lg text-[#5A6478] hover:text-[#1A1A1A] hover:bg-[#F7F9FC] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A2B4C]/30 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Nav items */}
        <nav aria-label="Mobile navigation" className="flex-1 py-4 px-3 gap-1 flex flex-col overflow-y-auto">
          {navItems.map((item) => (
            <NavLink key={item.href} {...item} onClick={onClose} />
          ))}
        </nav>
      </div>
    </>
  );
}

function BottomTabBar({ onMoreClick }: { onMoreClick: () => void }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Bottom navigation"
      className="lg:hidden shrink-0 h-16 bg-white border-t border-[#E1E6EE] flex items-stretch"
    >
      {tabItems.map((tab) => {
        const Icon = tab.icon;
        const active =
          tab.href !== null &&
          (pathname === tab.href || pathname.startsWith(tab.href + "/"));

        if (tab.href === null) {
          return (
            <button
              key={tab.label}
              onClick={onMoreClick}
              aria-label={tab.label}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors cursor-pointer",
                "text-[#5A6478]"
              )}
            >
              <Menu size={22} strokeWidth={2} />
              {tab.label}
            </button>
          );
        }

        return (
          <Link
            key={tab.label}
            href={tab.href}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
              active ? "text-[#1A2B4C]" : "text-[#5A6478]"
            )}
          >
            <Icon size={22} strokeWidth={active ? 2.5 : 2} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({
  user,
  children,
}: {
  user: User;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <UserProvider user={user}>
      <div className="flex flex-col h-screen overflow-hidden">
        <TopBar onMenuClick={() => setDrawerOpen(true)} userId={user.id} />

        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-y-auto p-8">{children}</main>
        </div>

        <BottomTabBar onMoreClick={() => setDrawerOpen(true)} />
      </div>

      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </UserProvider>
  );
}
