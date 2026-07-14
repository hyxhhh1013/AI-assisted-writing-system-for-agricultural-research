"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { buildAppHref, popNavBack, pushNavPath } from "@/lib/navigation";

export interface GoBackOptions {
  /** 始终跳转兜底页，不走历史栈（登录页等） */
  forceFallback?: boolean;
}

interface NavigationHistoryContextValue {
  goBack: (fallback: string, options?: GoBackOptions) => void;
}

const NavigationHistoryContext = createContext<NavigationHistoryContextValue | null>(null);

export function NavigationHistoryProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const stackRef = useRef<string[]>([]);

  useEffect(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    const href = buildAppHref(pathname, search);
    stackRef.current = pushNavPath(stackRef.current, href);
  }, [pathname]);

  const goBack = useCallback(
    (fallback: string, options?: GoBackOptions) => {
      if (options?.forceFallback) {
        router.push(fallback);
        return;
      }

      const { stack, target } = popNavBack(stackRef.current);
      stackRef.current = stack;

      if (target) {
        router.back();
        return;
      }

      router.push(fallback);
    },
    [router],
  );

  return (
    <NavigationHistoryContext.Provider value={{ goBack }}>
      {children}
    </NavigationHistoryContext.Provider>
  );
}

export function useGoBack(): NavigationHistoryContextValue["goBack"] {
  const ctx = useContext(NavigationHistoryContext);
  if (!ctx) {
    throw new Error("useGoBack 必须在 NavigationHistoryProvider 内使用");
  }
  return ctx.goBack;
}
