"use client";
import { useEffect } from "react";
import { OPENED_KEY, safeStorage, withOpened } from "@/ui/lib/marks";

export function OpenedMark({ code }: { code: string }) {
  useEffect(() => {
    const store = safeStorage();
    store.set(OPENED_KEY, withOpened(store.get(OPENED_KEY), code));
  }, [code]);
  return null;
}
