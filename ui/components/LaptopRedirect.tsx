"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { LAPTOP_QUERY, selectionSearch } from "@/ui/lib/selection";

// On a laptop, a sheet address opens the two-pane view with that dataset selected.
export function LaptopRedirect({ code }: { code: string }) {
  const router = useRouter();
  useEffect(() => {
    if (window.matchMedia(LAPTOP_QUERY).matches) router.replace(`/${selectionSearch({ q: "", open: code })}`);
  }, [code, router]);
  return null;
}
