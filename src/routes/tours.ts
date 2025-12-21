import express from "express";
import knex from "../knex";
import { mergeGpxFilesToOne, last_two_characters } from "../utils/gpxUtils";
import moment from "moment";
import { getHost, replaceFilePath, get_domain_country } from "../utils/utils";
import { minutesFromMoment } from "../utils/utils";
import { convertDifficulty } from "../utils/utils";

import fs from "fs";
import path from "path";
import momenttz from "moment-timezone";
import {
  connectionsExtendedParamsSchema,
  connectionsExtendedQuerySchema,
  filterQuerySchema,
  providerQuerySchema,
  totalQuerySchema,
  tourDetailsParamsSchema,
  tourDetailsQuerySchema,
  toursQuerySchema,
} from "../schemas/toursQueries.schema";
import { getProvidersByProvider } from "../repositories/provider.repository";
import { getKpiByNames } from "../repositories/kpi.repository";
import z from "zod";
import {
  queryToursByFilter,
  getTourWithFallback,
  orderBySearchTerm,
} from "../repositories/tour.repository";
import { insertLogsearchphrase } from "../repositories/logsearchphrase.repository";
import { ConnectionsResult } from "../repositories/fahrplan.repository";

const router = express.Router();

router.get("/:id/gpx", (req, res) => tourGpxWrapper(req, res));

router.get("/provider/:provider", async (req, res) => {
  const parsed = providerQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.message });
  }

  const provider = parsed.data.provider;
  const providers = await getProvidersByProvider(provider);

  if (providers.length > 0) {
    res.status(200).json({
      success: true,
      allow_gpx_download: providers[0].allow_gpx_download,
    });
  } else {
    res.status(404).json({ success: false, message: "Provider not found" });
  }
});

router.get("/total", async (req, res) => {
  const parsed = totalQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.message });
  }
  const city = parsed.data.city;
  const keys = [
    "total_tours",
    "total_connections",
    "total_ranges",
    "total_cities",
    "total_provider",
  ];
  if (city) {
    keys.push(`total_tours_${city}`);
  }
  const resultMap = await getKpiByNames(keys);

  res.status(200).json({
    success: true,
    total_tours: resultMap.total_tours || 0,
    tours_city: resultMap[`total_tours_${city}`] || 0,
    total_connections: resultMap.total_connections || 0,
    total_ranges: resultMap.total_ranges || 0,
    total_cities: resultMap.total_cities || 0,
    total_provider: resultMap.total_provider || 0,
  });
});

router.get("/:id/:city", async (req, res) => {
  try {
    const params = tourDetailsParamsSchema.parse(req.params);
    const query = tourDetailsQuerySchema.parse(req.query);
    const city = query.city ?? params.city;
    const tld = get_domain_country(query.domain);
    const tour = await getTourWithFallback(params.id, tld, city);
    if (!tour) {
      return res.status(404).json({
        success: false,
        message: "Tour not found",
      });
    }

    // The function prepareTourEntry will remove the column hashed_url, so it is not send to frontend
    const result = await prepareTourEntry(tour, city, query.domain, true);

    res.json({ success: true, tour: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        errors: z.prettifyError(error),
      });
    }
  }
});

router.get("/", async (req, res) => {
  const parsed = toursQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.message });
  }

  const defaultFilter = {
    singleDayTour: true,
    multipleDayTour: true,
    summerSeason: true,
    winterSeason: true,
    traverse: false,
  };

  // merge with filterJSON
  const filterJSON = {
    ...defaultFilter,
    ...parsed.data.filter,
  };

  if (parsed.data.range && parsed.data.range.length > 0) {
    filterJSON.ranges = [parsed.data.range];
  }

  if (parsed.data.provider && parsed.data.provider.length > 0) {
    filterJSON.providers = [parsed.data.provider];
  }

  const tld = get_domain_country(parsed.data.domain);

  const languagesMap = {
    sl: "simple",
    fr: "french",
    it: "italian",
    en: "english",
  };

  const postgresql_language_code =
    languagesMap[parsed.data.currLanguage as keyof typeof languagesMap] ||
    "german";

  const tempTableColumns = [
    "id",
    "provider",
    "hashed_url",
    "url",
    "title",
    "image_url",
    "type",
    "country",
    "state",
    "range_slug",
    "range",
    "text_lang",
    "difficulty_orig",
    "season",
    "max_ele",
    "c2t.connection_arrival_stop_lon",
    "c2t.connection_arrival_stop_lat",
    "c2t.min_connection_duration",
    "c2t.min_connection_no_of_transfers",
    "c2t.avg_total_tour_duration",
    "ascent",
    "descent",
    "difficulty",
    "duration",
    "distance",
    "number_of_days",
    "traverse",
    "quality_rating",
    "month_order",
    "search_column",
    "ai_search_column",
  ];

  const tourQuery = knex("tour")
    .select(tempTableColumns)
    .innerJoin("city2tour as c2t", "c2t.tour_id", "id");

  queryToursByFilter(
    tourQuery,
    filterJSON,
    tld,
    parsed.data.city,
    parsed.data.search,
    postgresql_language_code,
    parsed.data.country,
    parsed.data.poi,
    parsed.data.bounds,
  );

  let tempTable = "";
  if (parsed.data.city) {
    tempTable =
      `temp_` + tld + parsed.data.city.replace(/-/g, "_") + `_` + Date.now();
  } else {
    tempTable = `temp_` + tld + `_` + Date.now();
  }

  await knex.raw(`CREATE TEMP TABLE ?? AS ${tourQuery.toString()}`, [
    tempTable,
  ]);

  try {
    await knex.raw(`CREATE INDEX idx_id ON ${tempTable} (id);`);
  } catch (error) {
    console.log("Error creating index idx_id:", error);
  }

  const tempOrderQuery = knex.select("*").from(knex.raw("??", [tempTable]));
  // Prefer current language
  tempOrderQuery.orderByRaw(`CASE WHEN text_lang = ? THEN 1 ELSE 0 END DESC`, [
    parsed.data.currLanguage,
  ]);

  orderBySearchTerm(
    tempOrderQuery,
    parsed.data.search,
    postgresql_language_code,
  );
  tempOrderQuery.orderBy("month_order", "asc").orderBy("number_of_days", "asc");
  tempOrderQuery.orderByRaw(
    `CASE WHEN ascent BETWEEN 600 AND 1200 THEN 0 ELSE 1 END ASC`,
  );
  // Connection penalties
  tempOrderQuery
    .orderByRaw(
      `TRUNC(min_connection_no_of_transfers * min_connection_no_of_transfers / 2) ASC`,
    )
    .orderByRaw(`TRUNC(min_connection_duration / 30, 0) ASC`);
  tempOrderQuery
    .orderBy("traverse", "desc")
    .orderBy("quality_rating", "desc")
    .orderByRaw(`FLOOR(duration) ASC`)
    .orderByRaw(`MOD(id, CAST(EXTRACT(DAY FROM CURRENT_DATE) AS INTEGER)) ASC`);

  const PAGE_SIZE = 9;
  const offset = PAGE_SIZE * (parsed.data.page - 1);
  const result = await tempOrderQuery.limit(PAGE_SIZE).offset(offset);
  // TODO: rounding for avg_total_tour_duration

  // ****************************************************************
  // GET THE COUNT
  // ****************************************************************
  const count = await knex.raw<{ rows: { row_count: string }[] }>(
    `SELECT COUNT(*) AS row_count FROM ??`,
    [tempTable],
  );

  const sql_count = Number(count.rows[0].row_count);

  // ****************************************************************
  // CALLING DATABASE FOR MARKERS
  // ****************************************************************
  type MarkerRow = {
    id: number;
    lat: number;
    lon: number;
  };
  let markers_array: MarkerRow[] = []; // markers-related : to be filled by either cases(with or without "search included")

  if (parsed.data.map) {
    markers_array = await knex
      .from({ t: tempTable })
      .select<
        MarkerRow[]
      >(["t.id", "t.connection_arrival_stop_lat as lat", "t.connection_arrival_stop_lon as lon"])
      .whereNotNull("t.connection_arrival_stop_lat")
      .whereNotNull("t.connection_arrival_stop_lon");
  }

  try {
    await knex.raw(`DROP TABLE ${tempTable};`);
  } catch (err) {
    console.log("Drop temp table failed: ", err);
  }

  //logsearchphrase
  //This code first logs the search phrase and the number of results in a database table called
  //logsearchphrase if a search was performed. It replaces any single quotes in the search parameter
  //with double quotes, which is necessary to insert the search parameter into the SQL statement.
  try {
    const search = parsed.data.search;

    if (search && search.length > 0 && parsed.data.city) {
      // Entfernt führende und nachfolgende Leerzeichen
      const searchparam = search.toLowerCase().trim();

      if (sql_count > 1) {
        insertLogsearchphrase({
          phrase: searchparam,
          num_results: sql_count,
          city_slug: parsed.data.city,
          menu_lang: parsed.data.currLanguage,
          country_code: get_domain_country(parsed.data.domain),
          search_time: new Date(),
        });
      }
    }
  } catch (error) {
    console.error("error inserting into logsearchphrase: ", error);
  }

  // preparing tour entries
  // this code maps over the query result and applies the function prepareTourEntry to each entry. The prepareTourEntry
  // function returns a modified version of the entry that includes additional data and formatting.
  // The function also sets the 'is_map_entry' property of the entry to true if map is truthy.
  // The function uses Promise.all to wait for all promises returned by 'prepareTourEntry' to resolve before
  // returning the final result array.
  if (result && Array.isArray(result)) {
    await Promise.all(
      result.map(
        (entry) =>
          new Promise((resolve) => {
            // The function prepareTourEntry will remove the column hashed_url, so it is not send to frontend
            prepareTourEntry(
              entry,
              parsed.data.city,
              parsed.data.domain,
              true,
            ).then((updatedEntry) => resolve(updatedEntry));
          }),
      ),
    );
  }

  /** add ranges to result */
  // This code prepares the response to a HTTP request.
  // The ranges array is populated with data about the tours ranges. The showRanges variable is a
  // boolean that is passed in the request to determine whether to return the ranges or not.
  // If showRanges is true, then the code queries the database to get a list of the distinct ranges
  // and their image urls. It then loops through the results to create an array of range objects
  // containing the range name and the corresponding image URL. The code then queries the database
  // to get all states of each range and adds them to the states array of each range object.
  type RangeResult = {
    range_slug: string;
    range: string;
    image_url: string;
    attract: number;
  };

  let ranges: RangeResult[] = [];
  if (parsed.data.showRanges) {
    const months = [
      "jan",
      "feb",
      "mar",
      "apr",
      "may",
      "jun",
      "jul",
      "aug",
      "sep",
      "oct",
      "nov",
      "dec",
    ];
    const shortMonth = months[new Date().getMonth()];
    const query = knex("city2tour as c2t")
      .innerJoin("tour as t", "c2t.tour_id", "t.id ")
      .select(
        "t.range_slug",
        "t.range",
        knex.raw(
          "CONCAT('https://cdn.zuugle.at/range-image/', t.range_slug, '.webp') AS image_url",
        ),
        knex.raw(
          "SUM(1.0 / (c2t.min_connection_no_of_transfers + 1)) AS attract",
        ),
      )
      .where("c2t.reachable_from_country", tld)
      .whereNotNull("t.range_slug")
      .whereNotNull("t.range")
      .andWhere(`t.${shortMonth}`, true)
      .groupBy("t.range_slug", "t.range")
      .orderByRaw("SUM(1.0/(c2t.min_connection_no_of_transfers+1)) DESC")
      .orderBy("t.range_slug", "asc")
      .limit(10);

    // city filter
    if (parsed.data.city && parsed.data.city !== "no-city") {
      query.andWhere("c2t.city_slug", parsed.data.city);
    } else {
      query.andWhere("c2t.stop_selector", "y");
    }

    ranges = await query;
  }

  //describe:
  // The result array contains the list of tours returned from the database after executing the main query.
  // This array is already looped through to transform each tour entry with additional data and metadata
  // using the prepareTourEntry function. Finally, a JSON response is returned with success set to true,
  // the tours array, the total count of tours returned by the main query, the current page, and the
  // ranges array (if showRanges is true).

  res.status(200).json({
    success: true,
    tours: result,
    total: sql_count,
    page: parsed.data.page,
    ranges: ranges,
    markers: markers_array,
  });
});

router.get("/filter", async (req, res) => {
  const parsed = filterQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.message });
  }
  const search = parsed.data.search;
  const city = parsed.data.city;
  const domain = parsed.data.domain;
  const currLanguage = parsed.data.currLanguage; // gets the menu language (selected by visitor)
  const tld = get_domain_country(domain);
  // Where Condition is only depending on country, city and search term(s)

  const tempTableColumns = [
    "t.type",
    "t.text_lang",
    "t.range",
    "t.range_slug",
    "t.provider",
    "t.number_of_days",
    "t.season",
    "t.traverse",
    "min(t.ascent) AS min_ascent",
    "max(t.ascent) AS max_ascent",
    "min(t.descent) AS min_descent",
    "max(t.descent) AS max_descent",
    "min(t.distance) AS min_distance",
    "max(t.distance) AS max_distance",
    "min(c2t.min_connection_duration) AS min_connection_duration",
    "max(c2t.max_connection_duration) AS max_connection_duration",
  ];

  const tempQuery = knex("tour")
    .select(tempTableColumns)
    .innerJoin("city2tour as c2t", "c2t.tour_id", "id")
    .where("c2t.reachable_from_country", tld);

  if (city && city !== "no-city") {
    tempQuery.andWhere("c2t.city_slug", city);
  } else {
    tempQuery.andWhere("c2t.stop_selector", "y");
  }

  if (search && search.length > 0) {
    let postgresql_language_code = "german";

    // TODO refactor postgresql language code mapping
    if (currLanguage == "sl") {
      postgresql_language_code = "simple";
    } else if (currLanguage == "fr") {
      postgresql_language_code = "french";
    } else if (currLanguage == "it") {
      postgresql_language_code = "italian";
    } else if (currLanguage == "en") {
      postgresql_language_code = "english";
    }

    tempQuery.whereRaw(`t.search_column @@ websearch_to_tsquery(?, ?)`, [
      postgresql_language_code,
      search,
    ]);
  }

  let tempTable = "";
  if (parsed.data.city) {
    tempTable =
      `temp_` + tld + parsed.data.city.replace(/-/g, "_") + `_` + Date.now();
  } else {
    tempTable = `temp_` + tld + `_` + Date.now();
  }

  await knex.raw(`CREATE TEMP TABLE ?? AS ${tempQuery.toString()}`, [
    tempTable,
  ]);

  await knex.raw(`CREATE INDEX idx_type ON ${tempTable} (type);`);
  await knex.raw(`CREATE INDEX idx_lang ON ${tempTable} (text_lang);`);
  await knex.raw(`CREATE INDEX idx_range ON ${tempTable} (range, range_slug);`);
  await knex.raw(`CREATE INDEX idx_provider ON ${tempTable} (provider);`);

  let kpis = [];
  const kpi_sql = `SELECT 
                CASE WHEN SUM(CASE WHEN t.number_of_days=1 THEN 1 ELSE 0 END) > 0 THEN TRUE ELSE FALSE END AS isSingleDayTourPossible,
                CASE WHEN SUM(CASE WHEN t.number_of_days=2 THEN 1 ELSE 0 END) > 0 THEN TRUE ELSE FALSE END AS isMultipleDayTourPossible,
                CASE WHEN SUM(CASE WHEN t.season='s' OR t.season='n' THEN 1 ELSE 0 END) > 0 THEN TRUE ELSE FALSE END AS isSummerTourPossible,
                CASE WHEN SUM(CASE WHEN t.season='w' OR t.season='n' THEN 1 ELSE 0 END) > 0 THEN TRUE ELSE FALSE END AS isWinterTourPossible,
                CASE WHEN MAX(t.max_ascent) > 3000 THEN 3000 ELSE MAX(t.max_ascent) END AS maxAscent,
                MIN(t.min_ascent) AS minAscent,
                CASE WHEN MAX(t.max_descent) > 3000 THEN 3000 ELSE MAX(t.max_descent) END AS maxDescent,
                MIN(t.min_descent) AS minDescent,
                CASE WHEN MAX(t.max_distance) > 80 THEN 80.0 ELSE MAX(t.max_distance) END AS maxDistance,
                MIN(t.min_distance) AS minDistance,
                CASE WHEN SUM(t.traverse) > 0 THEN TRUE ELSE FALSE END AS isTraversePossible,
                MIN(t.min_connection_duration/60) AS minTransportDuration,
                MAX(t.max_connection_duration/60) AS maxTransportDuration
                FROM ${tempTable} t;`;

  const kpi_result = await knex.raw(kpi_sql);
  if (kpi_result && kpi_result.rows) {
    kpis = kpi_result.rows;
  }

  let _isSingleDayTourPossible;
  let _isMultipleDayTourPossible;
  let _isSummerTourPossible;
  let _isWinterTourPossible;
  let _maxAscent;
  let _minAscent;
  let _maxDescent;
  let _minDescent;
  let _maxDistance;
  let _minDistance;
  let _isTraversePossible;
  let _minTransportDuration;
  let _maxTransportDuration;

  if (kpis && kpis.length > 0) {
    const element = kpis[0];
    _isSingleDayTourPossible = element.issingledaytourpossible;
    _isMultipleDayTourPossible = element.ismultipledaytourpossible;
    _isSummerTourPossible = element.issummertourpossible;
    _isWinterTourPossible = element.iswintertourpossible;
    _maxAscent = element.maxascent;
    _minAscent = element.minascent;
    _maxDescent = element.maxdescent;
    _minDescent = element.mindescent;
    _maxDistance = parseFloat(element.maxdistance);
    _minDistance = parseFloat(element.mindistance);
    _isTraversePossible = element.istraversepossible;
    _minTransportDuration = parseFloat(element.mintransportduration);
    _maxTransportDuration = parseFloat(element.maxtransportduration);
  }

  const types = await knex
    .from({ t: tempTable })
    .select<{ type: string }[]>("t.type")
    .groupBy("t.type")
    .orderBy("t.type", "asc");

  const text = await knex
    .from({ t: tempTable })
    .select<{ text_lang: string }[]>("t.text_lang")
    .groupBy("t.text_lang")
    .orderBy("t.text_lang", "asc");

  const ranges = await knex
    .from({ t: tempTable })
    .select<{ range: string }[]>("t.range")
    .whereNotNull("t.range_slug")
    .groupBy("t.range")
    .orderBy("t.range", "asc");

  const providers = await knex
    .from({ t: tempTable })
    .select<{ provider: string }[]>("t.provider")
    .innerJoin("provider as p", "t.provider", "p.provider")
    .groupBy("t.provider", "p.provider_name")
    .orderBy("t.provider", "asc");

  const filterresult = {
    types: types.map((typeObj) => typeObj.type),
    ranges: ranges.map((rangesObj) => rangesObj.range),
    providers: providers.map((providerObj) => providerObj.provider),
    isSingleDayTourPossible: _isSingleDayTourPossible,
    isMultipleDayTourPossible: _isMultipleDayTourPossible,
    isSummerTourPossible: _isSummerTourPossible,
    isWinterTourPossible: _isWinterTourPossible,
    maxAscent: _maxAscent,
    minAscent: _minAscent,
    maxDescent: _maxDescent,
    minDescent: _minDescent,
    maxDistance: _maxDistance,
    minDistance: _minDistance,
    isTraversePossible: _isTraversePossible,
    minTransportDuration: _minTransportDuration,
    maxTransportDuration: _maxTransportDuration,
    languages: text.map((textObj) => textObj.text_lang),
  };

  try {
    await knex.raw(`DROP TABLE ${tempTable};`);
  } catch (err) {
    console.log("Drop temp table failed: ", err);
  }

  res.status(200).json({
    success: true,
    filter: filterresult,
    providers: providers,
  });
});

router.get("/:id/connections-extended", async (req, res) => {
  const params = connectionsExtendedParamsSchema.parse(req.params);
  const query = connectionsExtendedQuerySchema.parse(req.query);
  const city = query.city ?? params.city;
  const id = params.id;
  const domain = query.domain;

  if (!id || !city) {
    res.status(404).json({ success: false });
    return;
  }

  const selectedColumns = [
    "f.calendar_date",
    "f.connection_departure_datetime",
    "f.connection_arrival_datetime",
    "f.connection_duration",
    "f.connection_no_of_transfers",
    "f.connection_returns_trips_back",
    "f.return_departure_datetime",
    "f.return_duration",
    "f.return_no_of_transfers",
    "f.return_arrival_datetime",
    "f.totour_track_duration",
    "f.fromtour_track_duration",
    "f.connection_description_json",
    "f.return_description_json",
    "f.totour_track_key",
    "f.fromtour_track_key",
  ];

  const connections_query: ConnectionsResult[] = await knex("tour as t")
    .innerJoin("fahrplan as f", "f.hashed_url", "t.hashed_url")
    .select(selectedColumns)
    .where("t.id", id)
    .andWhere("f.city_slug", city)
    .orderBy("f.return_row", "ASC");

  const connections = connections_query.map((connection) => {
    connection.connection_departure_datetime = momenttz(
      connection.connection_departure_datetime,
    )
      .tz("Europe/Berlin")
      .format();
    connection.connection_arrival_datetime = momenttz(
      connection.connection_arrival_datetime,
    )
      .tz("Europe/Berlin")
      .format();
    connection.return_departure_datetime = momenttz(
      connection.return_departure_datetime,
    )
      .tz("Europe/Berlin")
      .format();
    return connection;
  });

  const today = moment().set("hour", 0).set("minute", 0).set("second", 0);
  const end = moment().add(7, "day");

  let result = [];

  while (today.isBefore(end)) {
    const byWeekday = connections.filter(
      (conn) =>
        moment(conn.calendar_date).format("DD.MM.YYYY") ==
        today.format("DD.MM.YYYY"),
    );
    const duplicatesRemoved: ConnectionsResult[] = [];

    byWeekday.forEach((t) => {
      const e: ConnectionsResult & {} = { ...t };
      e.connection_duration_minutes = minutesFromMoment(e.connection_duration);
      e.return_duration_minutes = minutesFromMoment(e.return_duration);

      if (!duplicatesRemoved.find((tt) => compareConnections(e, tt))) {
        e.gpx_file = `${getHost(domain)}/public/gpx-track/totour/${last_two_characters(e.totour_track_key)}/${e.totour_track_key}.gpx`;
        duplicatesRemoved.push(e);
      }
    });

    result.push({
      date: today.format(),
      connections: duplicatesRemoved,
      returns: getReturnConnectionsByConnection(connections, domain, today),
    });
    today.add(1, "day");
  }

  //handle last value
  if (result && result.length > 0) {
    if (
      !!result[result.length - 1] &&
      (!result[result.length - 1].connections ||
        result[result.length - 1].connections.length == 0)
    ) {
      result = result.slice(0, -1);
    }
  }

  res.status(200).json({ success: true, result: result });
});

const getReturnConnectionsByConnection = (
  connections: ConnectionsResult[],
  domain: string,
  today: moment.Moment,
) => {
  let _connections: ConnectionsResult[] = [];
  const _duplicatesRemoved: ConnectionsResult[] = [];

  _connections = connections.filter(
    (conn) =>
      moment(conn.calendar_date).format("DD.MM.YYYY") ==
      today.format("DD.MM.YYYY"),
  );

  //filter and map
  _connections.forEach((t) => {
    let e = { ...t };
    e.connection_duration_minutes = minutesFromMoment(e.connection_duration);
    e.return_duration_minutes = minutesFromMoment(e.return_duration);

    if (!_duplicatesRemoved.find((tt) => compareConnectionReturns(e, tt))) {
      e.gpx_file = `${getHost(domain)}/public/gpx-track/fromtour/${last_two_characters(e.fromtour_track_key)}/${e.fromtour_track_key}.gpx`;
      _duplicatesRemoved.push(e);
    }
  });
  return _duplicatesRemoved;
};

const compareConnections = (trans1, trans2) => {
  return (
    trans1 != null &&
    trans2 != null &&
    moment(trans1.connection_departure_datetime).isSame(
      moment(trans2.connection_departure_datetime),
    ) &&
    moment(trans1.connection_arrival_datetime).isSame(
      moment(trans2.connection_arrival_datetime),
    )
  );
};

const compareConnectionReturns = (conn1, conn2) => {
  return (
    conn1 != null &&
    conn2 != null &&
    moment(conn1.return_departure_datetime).format("HH:mm:ss") ==
      moment(conn2.return_departure_datetime).format("HH:mm:ss") &&
    moment(conn1.return_arrival_datetime).format("HH:mm:ss") ==
      moment(conn2.return_arrival_datetime).format("HH:mm:ss") &&
    conn1.return_arrival_stop == conn2.return_arrival_stop
  );
};

const tourGpxWrapper = async (req, res) => {
  const id = req.params.id;
  const type = req.query.type ? req.query.type : "gpx";
  const key = req.query.key;
  const keyAnreise = req.query.key_anreise;
  const keyAbreise = req.query.key_abreise;

  res.setHeader("content-type", "application/gpx+xml");
  res.setHeader("Cache-Control", "public, max-age=31557600");

  try {
    let BASE_PATH = process.env.NODE_ENV === "production" ? "../" : "../../";
    if (type == "all") {
      let filePathMain = replaceFilePath(
        path.join(
          __dirname,
          BASE_PATH,
          `/public/gpx/${last_two_characters(id)}/${id}.gpx`,
        ),
      );
      let filePathAbreise = replaceFilePath(
        path.join(
          __dirname,
          BASE_PATH,
          `/public/gpx-track/fromtour/${last_two_characters(keyAbreise)}/${keyAbreise}.gpx`,
        ),
      );
      let filePathAnreise = replaceFilePath(
        path.join(
          __dirname,
          BASE_PATH,
          `/public/gpx-track/totour/${last_two_characters(keyAnreise)}/${keyAnreise}.gpx`,
        ),
      );

      const xml = await mergeGpxFilesToOne(
        filePathMain,
        filePathAnreise,
        filePathAbreise,
      );
      if (xml) {
        res.status(200).send(xml);
      } else {
        res.status(400).json({ success: false });
      }
    } else {
      let filePath = path.join(
        __dirname,
        BASE_PATH,
        `/public/gpx/${last_two_characters(id)}/${id}.gpx`,
      );
      if (type == "abreise" && !!key) {
        filePath = path.join(
          __dirname,
          BASE_PATH,
          `/public/gpx-track/fromtour/${last_two_characters(key)}/${key}.gpx`,
        );
      } else if (type == "anreise" && !!key) {
        filePath = path.join(
          __dirname,
          BASE_PATH,
          `/public/gpx-track/totour/${last_two_characters(key)}/${key}.gpx`,
        );
      }
      filePath = replaceFilePath(filePath);

      let stream = fs.createReadStream(filePath);
      stream.on("error", (error) => {
        console.log("error: ", error);
        res.status(500).json({ success: false });
      });
      stream.on("open", () => stream.pipe(res));
    }
  } catch (e) {
    console.error(e);
  }
};

// TODO do the avg duration conversion here
const prepareTourEntry = async (entry, city, domain, addDetails = true) => {
  if (!(!!entry && !!entry.provider)) return entry;

  const host = getHost(domain);
  entry.gpx_file = `${host}/public/gpx/${last_two_characters(entry.id)}/${entry.id}.gpx`;

  if (addDetails) {
    if (city) {
      const toTour = await knex("fahrplan")
        .select("totour_track_key")
        .where({ hashed_url: entry.hashed_url, city_slug: city })
        .whereNotNull("totour_track_key")
        .first();
      const fromTour = await knex("fahrplan")
        .select("fromtour_track_key")
        .where({ hashed_url: entry.hashed_url, city_slug: city })
        .whereNotNull("fromtour_track_key")
        .first();

      if (!!toTour && !!toTour.totour_track_key) {
        entry.totour_gpx_file = `${host}/public/gpx-track/totour/${last_two_characters(toTour.totour_track_key)}/${toTour.totour_track_key}.gpx`;
      }
      if (!!fromTour && !!fromTour.fromtour_track_key) {
        entry.fromtour_gpx_file = `${host}/public/gpx-track/fromtour/${last_two_characters(fromTour.fromtour_track_key)}/${fromTour.fromtour_track_key}.gpx`;
      }
    }

    /** add provider_name to result */
    let provider_result = await knex("provider")
      .select("provider_name")
      .where({ provider: entry.provider })
      .first();
    entry.provider_name = provider_result.provider_name;

    // convert the "difficulty" value into a text value
    entry.difficulty = convertDifficulty(entry.difficulty);

    // add info about canonical and alternate links of this tour with entry.id
    const canon_sql = `SELECT
                          city_slug,
                          canonical_yn,
                          zuugle_url,
                          href_lang
                          FROM canonical_alternate
                          WHERE id=${entry.id};`;
    const canonical = await knex.raw(canon_sql);
    if (canonical) {
      entry.canonical = canonical.rows;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { ["hashed_url"]: remove, ...rest } = entry;
  return rest;
};

export default router;
