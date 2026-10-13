"use client";

import type { PlaceResult } from "@/convex/places";
import { BOUNDARIES_NOT_COVERED, BOUNDARIES_NOT_LOADED, asOfDate, boundariesShown, POLLING_CONFIRM } from "@/ui/lib/placeText";

const list = (names: string[]) => (names.length ? names.join(", ") : "None");

// The City's boundaries at an address: district and alder, ward and polling place, investment and development areas.
// Shared by Ask's place card and the /n panel so the two can't drift apart.
export function PlaceBoundaries({ r, meta }: { r: Extract<PlaceResult, { status: "ok" }>; meta?: string }) {
  const b = r.boundaries;
  const shown = boundariesShown(r);
  if (shown === "not-loaded" || b.asOf === null) return <p data-boundaries className={meta}>{BOUNDARIES_NOT_LOADED}</p>;
  if (shown === "not-covered") return <p data-boundaries className={meta}>{BOUNDARIES_NOT_COVERED}</p>;
  return (
    <div data-boundaries>
      <ul>
        {b.district && <li>Aldermanic {b.district.name}{b.district.alder && <> · Alder: {b.district.alder}</>}</li>}
        {b.ward && (
          <li>
            {b.ward.name} · Votes at {b.ward.pollingPlace}{b.ward.pollingAddress && <>, {b.ward.pollingAddress}</>}
            {b.ward.accessibleEntrance && <><br />{b.ward.accessibleEntrance}</>}
            {b.ward.accessibleParking && <><br />{b.ward.accessibleParking}</>}
          </li>
        )}
        <li>Investment areas: {list(b.investment)}</li>
        <li>Development districts: {list(b.development)}</li>
      </ul>
      {b.ward && (
        <p className={meta} data-polling-note>
          From the City&apos;s polling place list as of {asOfDate(b.asOf)}. {POLLING_CONFIRM} <a href="https://myvote.wi.gov">myvote.wi.gov</a>.
        </p>
      )}
    </div>
  );
}
