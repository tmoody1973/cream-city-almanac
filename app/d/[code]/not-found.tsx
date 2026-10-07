import Link from "next/link";
import { Masthead } from "@/ui/components/Masthead";
import styles from "@/ui/components/sheet.module.css";

export default function NotFound() {
  return (
    <div className={styles.page}>
      <Masthead side="RUNDOWN" showDate={false} />
      <main className={styles.section}>
        <p>No dataset with that code. It may have left DYCU&apos;s Hub.</p>
        <Link href="/">← Back to the rundown</Link>
      </main>
    </div>
  );
}
