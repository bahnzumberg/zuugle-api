import { Knex } from "knex";
import knex from "../knex";
import { Bounds, LatLngPOI, ToursFilter } from "../schemas/toursQueries.schema";
import { hashedUrlsFromPoi } from "../utils/gpxUtils";

export const getTourWithFallback = async (
  id: number,
  tld: string,
  city?: string,
): Promise<any> => {
  // Common columns for both active and inactive tours
  const baseColumns = [
    "id",
    "url",
    "provider",
    "hashed_url",
    "description",
    "image_url",
    "ascent",
    "descent",
    "difficulty",
    "difficulty_orig",
    "duration",
    "distance",
    "title",
    "type",
    "number_of_days",
    "traverse",
    "country",
    "state",
    "range_slug",
    "range",
  ];

  const activeTourQuery = knex("tour")
    .select([
      ...baseColumns,
      "season",
      "month_order",
      "quality_rating",
      "max_ele",
      "c2t.min_connection_duration",
      "c2t.min_connection_no_of_transfers",
      "c2t.avg_total_tour_duration",
    ])
    .innerJoin("city2tour as c2t", "c2t.tour_id", "id")
    .where("c2t.reachable_from_country", tld)
    .where("id", id);

  // Best case: active tour WITH city constraint
  if (city) {
    const tourWithCity = await activeTourQuery
      .andWhere("c2t.city_slug", city)
      .first();

    if (tourWithCity) {
      return {
        ...tourWithCity,
        valid_tour: 1,
        avg_total_tour_duration:
          (Math.round(
            ((tourWithCity.avg_total_tour_duration ?? 0) * 100) / 25,
          ) *
            25) /
          100,
      };
    }
  }

  // 2nd best case: Active tour WITHOUT city constraint
  const tourNoCity = await activeTourQuery
    .andWhere("c2t.stop_selector", "y")
    .first();

  if (tourNoCity) {
    return {
      ...tourNoCity,
      valid_tour: 2,
    };
  }

  // Last case: Inactive tour
  const inactiveTour = await knex("tour_inactive")
    .select(baseColumns)
    .where("id", id)
    .first();

  if (inactiveTour) {
    return {
      ...inactiveTour,
      valid_tour: 0,
    };
  }

  return null;
};

const isSingleWord = (value: string) => value.trim().split(/\s+/).length === 1;

function querySearchTerm(
  query: Knex.QueryBuilder,
  search?: string,
  pgLang?: string,
) {
  if (!search || !pgLang) return;

  // If there is more than one search term, the AI is superior,
  // is there only a single word, the standard websearch of PostgreSQL ist better.
  if (isSingleWord(search)) {
    query.whereRaw(`t.search_column @@ websearch_to_tsquery(?, ?)`, [
      pgLang,
      search,
    ]);
  } else {
    query.whereRaw(`ai_search_column <-> (SELECT get_embedding(?)) < ?`, [
      `query: ${search.toLowerCase()}`,
      0.6,
    ]);
  }
}

export function orderBySearchTerm(
  query: Knex.QueryBuilder,
  search?: string,
  pgLang?: string,
) {
  if (!search || !pgLang) return;
  if (isSingleWord(search)) {
    query.orderByRaw(
      `COALESCE(ts_rank(COALESCE(t.search_column, ''),websearch_to_tsquery(?, ?)),0) DESC`,
      [pgLang, search],
    );
  } else {
    query.orderByRaw(`ai_search_column <-> (SELECT get_embedding(?)) ASC`, [
      `query: ${search}`,
    ]);
  }
}

export const queryToursByFilter = async (
  filteredToursQuery: Knex.QueryBuilder,
  filter: ToursFilter,
  tld: string,
  city?: string,
  search?: string,
  pgLang?: string,
  country?: string,
  latLngPOI?: LatLngPOI,
  bounds?: Bounds,
) => {
  if (filter.singleDayTour && !filter.multipleDayTour) {
    filteredToursQuery.where("number_of_days", 1);
  }
  if (!filter.singleDayTour && filter.multipleDayTour) {
    filteredToursQuery.where("number_of_days", ">", 1);
  }
  if (filter.summerSeason && !filter.winterSeason) {
    filteredToursQuery.where("season", "in", ["s", "g"]);
  }
  if (!filter.summerSeason && filter.winterSeason) {
    filteredToursQuery.where("season", "in", ["w", "g"]);
  }
  if (filter.traverse) {
    filteredToursQuery.where("traverse", 1);
  }
  if (filter.minAscent && filter.minAscent >= 0) {
    filteredToursQuery.where("ascent", ">=", filter.minAscent);
  }
  if (filter.maxAscent && filter.maxAscent >= 0) {
    filteredToursQuery.where("ascent", "<=", filter.maxAscent);
  }
  if (filter.minDescent && filter.minDescent >= 0) {
    filteredToursQuery.where("descent", ">=", filter.minDescent);
  }
  if (filter.maxDescent && filter.maxDescent >= 0) {
    filteredToursQuery.where("descent", "<=", filter.maxDescent);
  }
  if (filter.minDistance && filter.minDistance >= 0) {
    filteredToursQuery.where("distance", ">=", filter.minDistance);
  }
  if (filter.maxDistance && filter.maxDistance >= 0) {
    filteredToursQuery.where("distance", "<=", filter.maxDistance);
  }
  if (filter.ranges && filter.ranges.length > 0) {
    filteredToursQuery.whereIn("range", filter.ranges);
  }
  if (filter.types && filter.types.length > 0) {
    filteredToursQuery.whereIn("type", filter.types);
  }
  if (filter.languages && filter.languages.length > 0) {
    filteredToursQuery.whereIn("language", filter.languages);
  }
  if (filter.difficulties && filter.difficulties.length > 0) {
    filteredToursQuery.whereIn("difficulty_orig", filter.difficulties);
  }
  if (filter.providers && filter.providers.length > 0) {
    filteredToursQuery.whereIn("provider", filter.providers);
  }

  // city2tour constraints
  if (city) {
    filteredToursQuery.where("c2t.city_slug", city);
  } else {
    filteredToursQuery.where("c2t.stop_selector", "y");
  }
  filteredToursQuery.where("c2t.reachable_from_country", tld);
  // transport duration constraints
  if (filter.minTransportDuration && filter.minTransportDuration >= 0) {
    filteredToursQuery.where(
      "c2t.min_connection_duration",
      ">=",
      filter.minTransportDuration,
    );
  }
  if (filter.maxTransportDuration && filter.maxTransportDuration >= 0) {
    filteredToursQuery.where(
      "c2t.min_connection_duration",
      "<=",
      filter.maxTransportDuration,
    );
  }

  // search constraint
  if (search && pgLang) {
    querySearchTerm(filteredToursQuery, search, pgLang);
  }

  if (country && country.length > 0) {
    filteredToursQuery.where("country", country);
  }

  // poi constraint
  if (latLngPOI) {
    latLngPOI.radius = latLngPOI.radius ? latLngPOI.radius : 5000;
    const hashed_urls = await hashedUrlsFromPoi(latLngPOI);
    if (hashed_urls.length !== 0) {
      filteredToursQuery.whereIn("hashed_url", hashed_urls);
    }
  }

  // bounds constraint
  // frontend sends coordinate bounds which the user sees on the map --> tours that are within these coordinates are returned
  if (bounds) {
    filteredToursQuery.whereBetween("c2t.connection_arrival_stop_lon", [
      bounds.east,
      bounds.west,
    ]);
    filteredToursQuery.whereBetween("c2t.connection_arrival_stop_lat", [
      bounds.north,
      bounds.south,
    ]);
  }
};
