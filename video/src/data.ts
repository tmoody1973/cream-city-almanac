import raw from "./data.json";

export type Est = { estimate: number; moe: number | null };
export type VideoData = {
  asOf: string;
  riverwest: { name: string; label: string; period: string; rate: Est; city: Est; verdict: string };
  robbery: { count: number; caption: string };
};
export const DATA = raw as VideoData;
