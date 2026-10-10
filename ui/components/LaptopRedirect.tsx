"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { portraitParams } from "@/ui/lib/portrait";
import { LAPTOP_QUERY, selectionSearch, whereParams } from "@/ui/lib/selection";

// On a laptop, a sheet address opens the two-pane view with that dataset selected.
export function LaptopRedirect({ code }: { code: string }) {
  const router = useRouter();
  useEffect(() => {
    if (!window.matchMedia(LAPTOP_QUERY).matches) return;
    // Keep a neighborhood table choice (place, year, topic) and any WHERE filters from a phone link.
    const choice = [portraitParams(window.location.search), whereParams(window.location.search)].filter(Boolean).join("&");
    router.replace(`/${selectionSearch({ q: "", open: code })}${choice ? `&${choice}` : ""}`);
  }, [code, router]);
  return null;
}
