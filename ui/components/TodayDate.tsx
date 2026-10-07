"use client";
import { useEffect, useState } from "react";
import { todayLabel } from "@/ui/lib/format";

// Client-side so the date is the reader's today (and so captures can fix the clock).
export function TodayDate({ className }: { className?: string }) {
  const [label, setLabel] = useState("");
  useEffect(() => setLabel(todayLabel(new Date())), []);
  return <span className={className} suppressHydrationWarning>{label}</span>;
}
