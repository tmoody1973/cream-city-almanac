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
import type * as city from "../city.js";
import type * as cityFigures from "../cityFigures.js";
import type * as crons from "../crons.js";
import type * as elections from "../elections.js";
import type * as evals from "../evals.js";
import type * as factSheet from "../factSheet.js";
import type * as fire from "../fire.js";
import type * as health from "../health.js";
import type * as lib_arcgis from "../lib/arcgis.js";
import type * as lib_ask from "../lib/ask.js";
import type * as lib_boundaries from "../lib/boundaries.js";
import type * as lib_card from "../lib/card.js";
import type * as lib_census from "../lib/census.js";
import type * as lib_censusBatch from "../lib/censusBatch.js";
import type * as lib_chunk from "../lib/chunk.js";
import type * as lib_cityFactSheet from "../lib/cityFactSheet.js";
import type * as lib_cityFamilies from "../lib/cityFamilies.js";
import type * as lib_cityMap from "../lib/cityMap.js";
import type * as lib_cityMeasures from "../lib/cityMeasures.js";
import type * as lib_cityPoints from "../lib/cityPoints.js";
import type * as lib_cityProfile from "../lib/cityProfile.js";
import type * as lib_citySql from "../lib/citySql.js";
import type * as lib_ckan from "../lib/ckan.js";
import type * as lib_codes from "../lib/codes.js";
import type * as lib_dcat from "../lib/dcat.js";
import type * as lib_dictionary from "../lib/dictionary.js";
import type * as lib_evalQuestions from "../lib/evalQuestions.js";
import type * as lib_factMath from "../lib/factMath.js";
import type * as lib_factSheet from "../lib/factSheet.js";
import type * as lib_families from "../lib/families.js";
import type * as lib_fireHistory from "../lib/fireHistory.js";
import type * as lib_fireYears from "../lib/fireYears.js";
import type * as lib_firecrawl from "../lib/firecrawl.js";
import type * as lib_gateway from "../lib/gateway.js";
import type * as lib_geo from "../lib/geo.js";
import type * as lib_geocode from "../lib/geocode.js";
import type * as lib_grid from "../lib/grid.js";
import type * as lib_hash from "../lib/hash.js";
import type * as lib_healthAnswer from "../lib/healthAnswer.js";
import type * as lib_healthCompass from "../lib/healthCompass.js";
import type * as lib_healthMath from "../lib/healthMath.js";
import type * as lib_http from "../lib/http.js";
import type * as lib_measureShape from "../lib/measureShape.js";
import type * as lib_measureSql from "../lib/measureSql.js";
import type * as lib_neighborhoodFigures from "../lib/neighborhoodFigures.js";
import type * as lib_neighborhoodNames from "../lib/neighborhoodNames.js";
import type * as lib_neighborhoodSources from "../lib/neighborhoodSources.js";
import type * as lib_nibrs from "../lib/nibrs.js";
import type * as lib_portrait from "../lib/portrait.js";
import type * as lib_propertyMeasures from "../lib/propertyMeasures.js";
import type * as lib_propertyYears from "../lib/propertyYears.js";
import type * as lib_rank from "../lib/rank.js";
import type * as lib_report from "../lib/report.js";
import type * as lib_requests311 from "../lib/requests311.js";
import type * as lib_retry from "../lib/retry.js";
import type * as lib_sources from "../lib/sources.js";
import type * as lib_spanPairs from "../lib/spanPairs.js";
import type * as lib_spanShape from "../lib/spanShape.js";
import type * as lib_spanSql from "../lib/spanSql.js";
import type * as lib_stopMath from "../lib/stopMath.js";
import type * as lib_stops from "../lib/stops.js";
import type * as lib_testAccounts from "../lib/testAccounts.js";
import type * as lib_text from "../lib/text.js";
import type * as lib_titles from "../lib/titles.js";
import type * as lib_tractData from "../lib/tractData.js";
import type * as lib_tractNames from "../lib/tractNames.js";
import type * as lib_tractPlaces from "../lib/tractPlaces.js";
import type * as lib_tractStats from "../lib/tractStats.js";
import type * as lib_tractsIn from "../lib/tractsIn.js";
import type * as lib_turnout from "../lib/turnout.js";
import type * as lib_turnoutMath from "../lib/turnoutMath.js";
import type * as lib_types from "../lib/types.js";
import type * as lib_xlsx from "../lib/xlsx.js";
import type * as lib_zipFigures from "../lib/zipFigures.js";
import type * as lib_zipPlaces from "../lib/zipPlaces.js";
import type * as lib_zips from "../lib/zips.js";
import type * as limits from "../limits.js";
import type * as map from "../map.js";
import type * as places from "../places.js";
import type * as property from "../property.js";
import type * as requests311 from "../requests311.js";
import type * as search from "../search.js";
import type * as settings from "../settings.js";
import type * as shares from "../shares.js";
import type * as spans from "../spans.js";
import type * as stops from "../stops.js";
import type * as tracts from "../tracts.js";
import type * as validators from "../validators.js";
import type * as zips from "../zips.js";

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
  city: typeof city;
  cityFigures: typeof cityFigures;
  crons: typeof crons;
  elections: typeof elections;
  evals: typeof evals;
  factSheet: typeof factSheet;
  fire: typeof fire;
  health: typeof health;
  "lib/arcgis": typeof lib_arcgis;
  "lib/ask": typeof lib_ask;
  "lib/boundaries": typeof lib_boundaries;
  "lib/card": typeof lib_card;
  "lib/census": typeof lib_census;
  "lib/censusBatch": typeof lib_censusBatch;
  "lib/chunk": typeof lib_chunk;
  "lib/cityFactSheet": typeof lib_cityFactSheet;
  "lib/cityFamilies": typeof lib_cityFamilies;
  "lib/cityMap": typeof lib_cityMap;
  "lib/cityMeasures": typeof lib_cityMeasures;
  "lib/cityPoints": typeof lib_cityPoints;
  "lib/cityProfile": typeof lib_cityProfile;
  "lib/citySql": typeof lib_citySql;
  "lib/ckan": typeof lib_ckan;
  "lib/codes": typeof lib_codes;
  "lib/dcat": typeof lib_dcat;
  "lib/dictionary": typeof lib_dictionary;
  "lib/evalQuestions": typeof lib_evalQuestions;
  "lib/factMath": typeof lib_factMath;
  "lib/factSheet": typeof lib_factSheet;
  "lib/families": typeof lib_families;
  "lib/fireHistory": typeof lib_fireHistory;
  "lib/fireYears": typeof lib_fireYears;
  "lib/firecrawl": typeof lib_firecrawl;
  "lib/gateway": typeof lib_gateway;
  "lib/geo": typeof lib_geo;
  "lib/geocode": typeof lib_geocode;
  "lib/grid": typeof lib_grid;
  "lib/hash": typeof lib_hash;
  "lib/healthAnswer": typeof lib_healthAnswer;
  "lib/healthCompass": typeof lib_healthCompass;
  "lib/healthMath": typeof lib_healthMath;
  "lib/http": typeof lib_http;
  "lib/measureShape": typeof lib_measureShape;
  "lib/measureSql": typeof lib_measureSql;
  "lib/neighborhoodFigures": typeof lib_neighborhoodFigures;
  "lib/neighborhoodNames": typeof lib_neighborhoodNames;
  "lib/neighborhoodSources": typeof lib_neighborhoodSources;
  "lib/nibrs": typeof lib_nibrs;
  "lib/portrait": typeof lib_portrait;
  "lib/propertyMeasures": typeof lib_propertyMeasures;
  "lib/propertyYears": typeof lib_propertyYears;
  "lib/rank": typeof lib_rank;
  "lib/report": typeof lib_report;
  "lib/requests311": typeof lib_requests311;
  "lib/retry": typeof lib_retry;
  "lib/sources": typeof lib_sources;
  "lib/spanPairs": typeof lib_spanPairs;
  "lib/spanShape": typeof lib_spanShape;
  "lib/spanSql": typeof lib_spanSql;
  "lib/stopMath": typeof lib_stopMath;
  "lib/stops": typeof lib_stops;
  "lib/testAccounts": typeof lib_testAccounts;
  "lib/text": typeof lib_text;
  "lib/titles": typeof lib_titles;
  "lib/tractData": typeof lib_tractData;
  "lib/tractNames": typeof lib_tractNames;
  "lib/tractPlaces": typeof lib_tractPlaces;
  "lib/tractStats": typeof lib_tractStats;
  "lib/tractsIn": typeof lib_tractsIn;
  "lib/turnout": typeof lib_turnout;
  "lib/turnoutMath": typeof lib_turnoutMath;
  "lib/types": typeof lib_types;
  "lib/xlsx": typeof lib_xlsx;
  "lib/zipFigures": typeof lib_zipFigures;
  "lib/zipPlaces": typeof lib_zipPlaces;
  "lib/zips": typeof lib_zips;
  limits: typeof limits;
  map: typeof map;
  places: typeof places;
  property: typeof property;
  requests311: typeof requests311;
  search: typeof search;
  settings: typeof settings;
  shares: typeof shares;
  spans: typeof spans;
  stops: typeof stops;
  tracts: typeof tracts;
  validators: typeof validators;
  zips: typeof zips;
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
