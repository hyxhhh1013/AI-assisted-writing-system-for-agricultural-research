"use client";

import { usePathname } from "next/navigation";
import { HomeTopBar } from "@/components/home/home-top-bar";
import { LabBackground } from "@/components/layout/lab-background";
import { SiteFooter } from "@/components/layout/site-footer";
import { siteShellClass } from "@/lib/site-theme";

const PASS_THROUGH_PREFIXES = ["/presentation"];
const FULL_BLEED_PREFIXES = ["/workbench", "/plot", "/reader", "/plagiarism", "/xrd-lab"];

function shouldSkipShell(pathname: string): boolean {
  return pathname === "/" || PASS_THROUGH_PREFIXES.some((p) => pathname.startsWith(p));
}

function isFullBleed(pathname: string): boolean {
  return FULL_BLEED_PREFIXES.some((p) => pathname.startsWith(p));
}

export function SiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";

  if (shouldSkipShell(pathname)) {
    return <>{children}</>;
  }

  const fullBleed = isFullBleed(pathname);

  return (
    <div className={siteShellClass}>
      <LabBackground />
      {!fullBleed ? <HomeTopBar /> : null}
      {fullBleed ? (
        <div className="relative flex min-h-screen flex-col">{children}</div>
      ) : (
        <>
          <main className="relative mx-auto max-w-6xl px-4 pb-6 pt-6 sm:px-6 sm:pt-8">
            {children}
          </main>
          <SiteFooter />
        </>
      )}
    </div>
  );
}
