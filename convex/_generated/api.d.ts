/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as ask from "../ask.js";
import type * as build from "../build.js";
import type * as buildStore from "../buildStore.js";
import type * as catalog from "../catalog.js";
import type * as crons from "../crons.js";
import type * as evals from "../evals.js";
import type * as lib_arcgis from "../lib/arcgis.js";
import type * as lib_ask from "../lib/ask.js";
import type * as lib_card from "../lib/card.js";
import type * as lib_chunk from "../lib/chunk.js";
import type * as lib_codes from "../lib/codes.js";
import type * as lib_dcat from "../lib/dcat.js";
import type * as lib_dictionary from "../lib/dictionary.js";
import type * as lib_evalQuestions from "../lib/evalQuestions.js";
import type * as lib_families from "../lib/families.js";
import type * as lib_firecrawl from "../lib/firecrawl.js";
import type * as lib_gateway from "../lib/gateway.js";
import type * as lib_grid from "../lib/grid.js";
import type * as lib_hash from "../lib/hash.js";
import type * as lib_http from "../lib/http.js";
import type * as lib_portrait from "../lib/portrait.js";
import type * as lib_rank from "../lib/rank.js";
import type * as lib_report from "../lib/report.js";
import type * as lib_retry from "../lib/retry.js";
import type * as lib_sources from "../lib/sources.js";
import type * as lib_text from "../lib/text.js";
import type * as lib_titles from "../lib/titles.js";
import type * as lib_types from "../lib/types.js";
import type * as lib_xlsx from "../lib/xlsx.js";
import type * as limits from "../limits.js";
import type * as search from "../search.js";
import type * as settings from "../settings.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  ask: typeof ask;
  build: typeof build;
  buildStore: typeof buildStore;
  catalog: typeof catalog;
  crons: typeof crons;
  evals: typeof evals;
  "lib/arcgis": typeof lib_arcgis;
  "lib/ask": typeof lib_ask;
  "lib/card": typeof lib_card;
  "lib/chunk": typeof lib_chunk;
  "lib/codes": typeof lib_codes;
  "lib/dcat": typeof lib_dcat;
  "lib/dictionary": typeof lib_dictionary;
  "lib/evalQuestions": typeof lib_evalQuestions;
  "lib/families": typeof lib_families;
  "lib/firecrawl": typeof lib_firecrawl;
  "lib/gateway": typeof lib_gateway;
  "lib/grid": typeof lib_grid;
  "lib/hash": typeof lib_hash;
  "lib/http": typeof lib_http;
  "lib/portrait": typeof lib_portrait;
  "lib/rank": typeof lib_rank;
  "lib/report": typeof lib_report;
  "lib/retry": typeof lib_retry;
  "lib/sources": typeof lib_sources;
  "lib/text": typeof lib_text;
  "lib/titles": typeof lib_titles;
  "lib/types": typeof lib_types;
  "lib/xlsx": typeof lib_xlsx;
  limits: typeof limits;
  search: typeof search;
  settings: typeof settings;
  validators: typeof validators;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
