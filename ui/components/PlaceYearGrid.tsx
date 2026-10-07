import { cellKey, type PlaceYearGrid as Grid } from "@/convex/lib/grid";
import styles from "./rundown.module.css";

const COMPACT_MAX_PLACES = 6;

export function PlaceYearGrid({ grid, compact = false }: { grid: Grid; compact?: boolean }) {
  if (grid.years.length === 0) return null;
  if (compact && grid.places.length > COMPACT_MAX_PLACES) {
    return <p className={styles.gridSummary}>{`${grid.places.length} neighborhoods × ${grid.years.length} years — full grid on the sheet`}</p>;
  }
  const filled = new Set(grid.cells);
  // Years grow with every weekly rebuild; the grid scrolls inside its own box instead of pushing the page sideways.
  return (
    <div className={styles.gridScroll} role="region" aria-label="Places and years, scroll sideways for more" tabIndex={0}>
      <table className={styles.grid} aria-label="Places and years available">
        <thead>
          <tr>
            <td />
            {grid.years.map((y) => (
              <th key={y} scope="col">{y}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.places.map((place) => (
            <tr key={place}>
              <th scope="row">{place}</th>
              {grid.years.map((y) =>
                filled.has(cellKey(place, y)) ? (
                  <td key={y}><span className={styles.cellOn} /><span className="visually-hidden">available</span></td>
                ) : (
                  <td key={y} className={styles.cellOff}><span aria-hidden="true">—</span><span className="visually-hidden">not available</span></td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
