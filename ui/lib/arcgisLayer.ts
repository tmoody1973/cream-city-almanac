// Stub: filled in by Task 8.
export async function fetchLayer(url: string, view: [[number, number], [number, number]]): Promise<{ status: "ok"; data: GeoJSON.FeatureCollection } | { status: "too-many" } | { status: "down" }> {
  void url; void view;
  return { status: "down" };
}
