"use client";

import Link from "next/link";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AdminAlertStripProps {
  alerts: Array<{ message: string; href: string; label: string }>;
}

export function AdminAlertStrip({ alerts }: AdminAlertStripProps) {
  if (alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {alerts.map((alert) => (
        <div
          key={alert.message}
          className="flex items-center justify-between gap-3 rounded-lg border border-amber-200/80 bg-amber-50/90 px-4 py-2.5"
        >
          <div className="flex items-center gap-2 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>{alert.message}</span>
          </div>
          <Link href={alert.href}>
            <Button variant="outline" size="sm" className="h-7 gap-1 border-amber-200 bg-white text-xs">
              {alert.label}
              <ChevronRight className="h-3 w-3" />
            </Button>
          </Link>
        </div>
      ))}
    </div>
  );
}
