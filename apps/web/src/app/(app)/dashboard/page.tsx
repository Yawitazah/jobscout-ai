"use client";

import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { Card, CardBody } from "@/components/ui/Card";
import { useUser, getFirstName } from "@/components/app/UserContext";

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export default function DashboardPage() {
  const { user } = useUser();
  const fullName = user.user_metadata?.full_name as string | undefined;
  const firstName = getFirstName(fullName);
  const greeting = getTimeGreeting();

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-[#1A1A1A] mb-1">
        Good {greeting}{firstName ? `, ${firstName}` : ""}.
      </h1>
      <p className="text-[#5A6478] mb-8">Your job search starts here.</p>

      <Card>
        <CardBody className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-[#1A2B4C]/10 flex items-center justify-center shrink-0">
            <LayoutDashboard size={20} className="text-[#1A2B4C]" strokeWidth={1.5} />
          </div>
          <div className="flex-1">
            <p className="font-medium text-[#1A1A1A]">
              Complete your profile to start scouting.
            </p>
            <p className="text-sm text-[#5A6478] mt-0.5">
              Tell us what you are looking for so we can find the right opportunities.
            </p>
          </div>
          <Link
            href="/profile"
            className="inline-flex items-center justify-center h-8 px-3 text-xs font-medium text-white bg-[#1A2B4C] rounded-[8px] hover:opacity-90 transition-opacity shrink-0"
          >
            Set up profile
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}
