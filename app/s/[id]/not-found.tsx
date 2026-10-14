import Link from "next/link";
import { CreditFooter } from "@/ui/components/CreditFooter";
import { Masthead } from "@/ui/components/Masthead";
import { SiteNav } from "@/ui/components/SiteNav";
import fs from "@/ui/components/factSheet.module.css";

export const metadata = { title: "Shared answer · Cream City Almanac", robots: { index: false, follow: false } };

export default function NotFound() {
  return (
    <div className={fs.page}>
      <Masthead side={null} showDate={false} nav={<SiteNav placement="masthead" current={null} />} />
      <main className={fs.main}>
        <p>This shared answer isn&apos;t available.</p>
        <p><Link href="/ask">Ask your own question →</Link></p>
      </main>
      <div className={fs.chrome}><CreditFooter /></div>
    </div>
  );
}
