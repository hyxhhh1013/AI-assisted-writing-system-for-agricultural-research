"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

const AdminDashboardClient = dynamic(() => import("./admin-dashboard-client"), {
  loading: () => (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-[#6b7c72]" />
    </div>
  ),
});

export default function AdminDashboardPage() {
  return <AdminDashboardClient />;
}
