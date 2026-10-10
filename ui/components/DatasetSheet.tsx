import Link from "next/link";
import { Arrow } from "./Arrow";
import { CreditFooter } from "./CreditFooter";
import { LaptopRedirect } from "./LaptopRedirect";
import { Masthead } from "./Masthead";
import { OpenedMark } from "./OpenedMark";
import { SheetBody, type SheetData } from "./SheetBody";
import { SheetDownloads } from "./SheetDownloads";
import { SiteNav } from "./SiteNav";
import styles from "./sheet.module.css";

export type { SheetData };

export function DatasetSheet({ sheet }: { sheet: SheetData }) {
  return (
    <div className={styles.page}>
      <OpenedMark code={sheet.family.code} />
      <LaptopRedirect code={sheet.family.code} />
      <Masthead side="RUNDOWN" showDate={false} nav={<SiteNav placement="masthead" current={null} />} />
      <main>
        <nav className={styles.back}>
          <Link href="/search">
            <Arrow direction="left" />
            Rundown
          </Link>
        </nav>
        <SheetBody sheet={sheet} />
      </main>
      <div className={styles.downloadBar}>
        <SheetDownloads sheet={sheet} />
      </div>
      <SiteNav placement="dock" current={null} />
      <CreditFooter />
    </div>
  );
}
