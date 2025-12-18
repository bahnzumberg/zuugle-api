import express from 'express';
let router = express.Router();
import knex from "../knex";
import cacheService from "../services/cache.js";
import crypto from 'crypto';
import {mergeGpxFilesToOne, last_two_characters, hashedUrlsFromPoi} from "../utils/gpx/gpxUtils";
import moment from "moment";
import {getHost, replaceFilePath, get_domain_country, isNumber } from "../utils/utils";
import {minutesFromMoment} from "../utils/helper";
import { convertDifficulty } from '../utils/dataConversion';
// import logger from '../utils/logger';

const fs = require('fs');

const generateKey = (prefix, obj) => {
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    const hash = crypto.createHash('sha256').update(str).digest('hex');
    return `${prefix}:${hash}`;
};
const path = require('path');
const momenttz = require('moment-timezone');

router.get('/', (req, res) => listWrapper(req, res));
router.get('/filter', (req, res) => filterWrapper(req, res));
router.get('/map', (req, res) => mapWrapper(req, res));
router.get('/provider/:provider', (req, res) => providerWrapper(req, res));


router.get('/total', (req, res) => totalWrapper(req, res));
router.get('/:id/connections-extended', (req, res) => connectionsExtendedWrapper(req, res));
router.get('/:id/gpx', (req, res) => tourGpxWrapper(req, res));
router.get('/:id/:city', (req, res) => getWrapper(req, res));

// Helper for SQL construction
const createPart = (sql = '', bindings = []) => ({ sql, bindings });
const appendPart = (part, sql, bindings = []) => {
    part.sql += sql;
    if (bindings && bindings.length > 0) {
        part.bindings.push(...bindings);
    }
};

const providerWrapper = async (req, res) => {
    const provider = req.params.provider; 
    const approved = await knex('provider').select('allow_gpx_download').where({ provider: provider }).first();
    if (approved) {
        res.status(200).json({ success: true, allow_gpx_download: approved.allow_gpx_download });
    } else {
        res.status(404).json({ success: false, message: "Provider not found" });
    }
}
 
const totalWrapper = async (req, res) => {
    const city = req.query.city;

    const cacheKey = `tours:total:${city || 'all'}`;
    const cached = await cacheService.get(cacheKey);
    if (cached) {
        return res.status(200).json(cached);
    }

    const total = await knex.raw(`SELECT 
                                tours.value as tours,
                                COALESCE(tours_city.value, 0) AS tours_city,
                                conn.value as connections,
                                ranges.value AS ranges,
                                cities.value AS cities,
                                provider.value AS provider 
                                FROM kpi AS tours 
                                LEFT OUTER JOIN kpi AS tours_city 
                                ON tours_city.name= ?
                                LEFT OUTER JOIN kpi AS conn 
                                ON conn.name='total_connections' 
                                LEFT OUTER JOIN kpi AS ranges 
                                ON ranges.name='total_ranges' 
                                LEFT OUTER JOIN kpi AS cities 
                                ON cities.name='total_cities' 
                                LEFT OUTER JOIN kpi AS provider ON provider.name='total_provider' 
                                WHERE tours.name='total_tours';`, [`total_tours_${city}`]);
    
    const responseData = {success: true, total_tours: total.rows[0]['tours'],tours_city: total.rows[0]['tours_city'] ,total_connections: total.rows[0]['connections'], total_ranges: total.rows[0]['ranges'], total_cities: total.rows[0]['cities'], total_provider: total.rows[0]['provider']};
    await cacheService.set(cacheKey, responseData);
    res.status(200).json(responseData);
}

const getWrapper = async (req, res) => {
    
    const city = !!req.query.city ? req.query.city : !!req.params.city ? req.params.city : null;
    const id = parseInt(req.params.id, 10);
    const domain = req.query.domain;

    const cacheKey = generateKey('tours:get', { id, city, domain });
    const cached = await cacheService.get(cacheKey);
    if (cached) {
        return res.status(200).json(cached);
    }

    const tld = get_domain_country(domain);

    if (isNaN(id)) {
        res.status(400).json({ success: false, message: "Invalid tour ID" });
        return;
    }

    if(!!!id){     
        res.status(404).json({success: false});
        return
    }
    
    let new_search_where_city = `AND c2t.stop_selector='y' `;
    let bindings = [tld];

    if(!!city && city.length > 0 && city!='no-city'){
        new_search_where_city = `AND c2t.city_slug=? `;
        bindings.push(city);
    }

    // Add id bindings for the first part of UNION
    bindings.push(id);
    // Add id binding for the second part of UNION
    bindings.push(id);

    const sql = `SELECT 
                id, 
                url, 
                provider, 
                hashed_url, 
                description, 
                image_url, 
                ascent, 
                descent, 
                difficulty, 
                difficulty_orig, 
                duration, 
                distance, 
                title, 
                type, 
                number_of_days, 
                traverse, 
                country, 
                state, 
                range_slug, 
                range, 
                season, 
                month_order, 
                quality_rating, 
                max_ele,
                min_connection_duration,
                min_connection_no_of_transfers,
                ROUND(avg_total_tour_duration*100/25)*25/100 as avg_total_tour_duration,
                valid_tour
                FROM ( 
                SELECT t.id, t.url, t.provider, t.hashed_url, t.description, t.image_url, t.ascent,
                t.descent, t.difficulty, t.difficulty_orig , t.duration, t.distance, t.title, t.type,
                t.number_of_days, t.traverse, t.country, t.state, t.range_slug, t.range, t.season,
                t.month_order, t.quality_rating, t.max_ele,
                1 AS valid_tour,
                c2t.min_connection_duration,
                c2t.min_connection_no_of_transfers,
                c2t.avg_total_tour_duration
                FROM tour as t 
                INNER JOIN city2tour AS c2t 
                ON c2t.tour_id=t.id 
                WHERE c2t.reachable_from_country=?
                ${new_search_where_city}
                AND t.id=?
                UNION 
                SELECT t.id, t.url, t.provider, t.hashed_url, t.description, t.image_url, t.ascent, 
                t.descent, t.difficulty, t.difficulty_orig , t.duration, t.distance, t.title, t.type, 
                t.number_of_days, t.traverse, t.country, t.state, t.range_slug, t.range, 
                'g' as season, 0 as month_order, 0 as quality_rating, 
                0 as max_ele, 
                0 AS valid_tour,
                0 as min_connection_duration,
                0 as min_connection_no_of_transfers,
                0 as avg_total_tour_duration
                FROM tour_inactive as t WHERE t.id=?
                ORDER BY valid_tour DESC LIMIT 1) as a`

    const sql3_bindings = [tld, id];
    const sql3= `SELECT 
                id, 
                url, 
                provider, 
                hashed_url, 
                description, 
                image_url, 
                ascent, 
                descent, 
                difficulty, 
                difficulty_orig, 
                duration, 
                distance, 
                title, 
                type, 
                number_of_days, 
                traverse, 
                country, 
                state, 
                range_slug, 
                range, 
                season, 
                month_order, 
                quality_rating, 
                max_ele,
                min_connection_duration,
                min_connection_no_of_transfers,
                ROUND(avg_total_tour_duration*100/25)*25/100 as avg_total_tour_duration,
                valid_tour
                FROM ( 
                SELECT t.id, t.url, t.provider, t.hashed_url, t.description, t.image_url, t.ascent,
                t.descent, t.difficulty, t.difficulty_orig , t.duration, t.distance, t.title, t.type,
                t.number_of_days, t.traverse, t.country, t.state, t.range_slug, t.range, t.season,
                t.month_order, t.quality_rating, t.max_ele,
                2 AS valid_tour,
                c2t.min_connection_duration,
                c2t.min_connection_no_of_transfers,
                c2t.avg_total_tour_duration
                FROM tour as t 
                INNER JOIN city2tour AS c2t 
                ON c2t.tour_id=t.id 
                WHERE c2t.reachable_from_country=?
                AND t.id=?
                ORDER BY valid_tour DESC LIMIT 1) as a`
                

    try {
        let entry2 = await knex.raw(sql, bindings)
        let entry = entry2.rows[0]

        if (!entry) {
            entry2 = await knex.raw(sql3, sql3_bindings)
            entry = entry2.rows[0]

            if (!entry) {
                res.status(404).json({ success: false, message: "Tour not found" });
                return;
            }
        }

        entry = await prepareTourEntry(entry, city, domain, true);
        const responseData = { success: true, tour: entry };
        await cacheService.set(cacheKey, responseData);
        res.status(200).json(responseData);
    } catch (error) {
        res.status(500).json({ success: false, message: "Internal server error" });
    }
}

const listWrapper = async (req, res) => {
    const cacheKey = generateKey('tours:list', req.query);
    const cached = await cacheService.get(cacheKey);
    if (cached) {
        return res.status(200).json(cached);
    }

    const showRanges = !!req.query.ranges;
    const page = req.query.page || 1;
    const map = req.query.map;
    const bounds = req.query.bounds;

    const search = req.query.search; 
    const currLanguage = req.query.currLanguage ? req.query.currLanguage : 'de';
    const city = req.query.city;    
    const range = req.query.range;
    const state = req.query.state;
    const country = req.query.country;
    const type = req.query.type;
    const domain = req.query.domain; 
    const provider = req.query.provider;
    const language = req.query.language;
    const filter = req.query.filter;
    const poi = req.query.poi;

    const parsedBounds = bounds ? JSON.parse(bounds) : null;
    const coordinatesNorthEast = !!parsedBounds ? parsedBounds._northEast : null;
    const coordinatesSouthWest = !!parsedBounds ? parsedBounds._southWest : null;

    const parsedPoi = poi ? JSON.parse(poi) : null;  

    let addDetails = true; 

    // Parts initialization
    let p_search_term = createPart();
    let p_search_order = createPart();
    let p_search_city = createPart();
    let p_search_country = createPart();
    let p_search_state = createPart();
    let p_search_range = createPart();
    let p_search_type = createPart();
    let p_search_provider = createPart();
    let p_search_map = createPart();
    let p_search_language = createPart();
    let p_filter_single = createPart();
    let p_filter_multi = createPart();
    let p_filter_summer = createPart();
    let p_filter_winter = createPart();
    let p_filter_traverse = createPart();
    let p_filter_ascent = createPart();
    let p_filter_descent = createPart();
    let p_filter_transport = createPart();
    let p_filter_distance = createPart();
    let p_filter_ranges = createPart();
    let p_filter_types = createPart();
    let p_filter_languages = createPart();
    let p_filter_difficulties = createPart();
    let p_filter_providers = createPart();
    let p_filter_poi = createPart();

    let filter_string = filter;
    let filterJSON = undefined;
    try {
        filterJSON = JSON.parse(filter_string);
    }
    catch(e) {
        filterJSON = undefined
    }

    const defaultFilter = {
        singleDayTour: true,
        multipleDayTour: true,
        summerSeason: true,
        winterSeason: true,
        traverse: false,
    };

    filterJSON = {
        ...defaultFilter,
        ...filterJSON,
    };

    if (typeof filterJSON !== 'undefined' && filter_string != `{ ignore_filter: 'true' }`) {

        if(filterJSON['singleDayTour'] && !filterJSON['multipleDayTour']){
            p_filter_single = createPart(`AND t.number_of_days=1 `);
        }

        if(!filterJSON['singleDayTour'] && filterJSON['multipleDayTour']){
            p_filter_multi = createPart(`AND t.number_of_days>=2 `);
        }

        if(filterJSON['summerSeason'] && !filterJSON['winterSeason']){
            p_filter_summer = createPart(`AND (t.season='s' OR t.season='g') `);
        }

        if(!filterJSON['summerSeason'] && filterJSON['winterSeason']){
            p_filter_winter = createPart(`AND (t.season='w' OR t.season='g') `);
        }

        if(filterJSON['traverse']){
            p_filter_traverse = createPart(`AND t.traverse=1 `);
        }

        if (isNumber(filterJSON['minAscent']) && filterJSON['minAscent'] >= 0) {
            appendPart(p_filter_ascent, `AND t.ascent >= ? `, [filterJSON['minAscent']]);
        }

        if (isNumber(filterJSON['maxAscent']) && filterJSON['maxAscent'] >= 0) {
            appendPart(p_filter_ascent, `AND t.ascent <= ? `, [filterJSON['maxAscent']]);
        }

        if (isNumber(filterJSON['minDescent']) && filterJSON['minDescent'] >= 0) {
            appendPart(p_filter_descent, `AND t.descent >= ? `, [filterJSON['minDescent']]);
        }

        if (isNumber(filterJSON['maxDescent']) && filterJSON['maxDescent'] >= 0) {
            appendPart(p_filter_descent, `AND t.descent <= ? `, [filterJSON['maxDescent']]);
        }

        if (isNumber(filterJSON['minTransportDuration']) && filterJSON['minTransportDuration'] >= 0) {
            appendPart(p_filter_transport, `AND c2t.min_connection_duration >= ? `, [filterJSON['minTransportDuration'] * 60]);
        }

        if (isNumber(filterJSON['maxTransportDuration']) && filterJSON['maxTransportDuration'] >= 0) {
            appendPart(p_filter_transport, `AND c2t.min_connection_duration <= ? `, [filterJSON['maxTransportDuration'] * 60]);
        }

        if (isNumber(filterJSON['minDistance']) && filterJSON['minDistance'] > 0) {
            appendPart(p_filter_distance, `AND t.distance >= ? `, [filterJSON['minDistance']]);
        }

        if (isNumber(filterJSON['maxDistance']) && filterJSON['maxDistance'] > 0) {
            appendPart(p_filter_distance, `AND t.distance <= ? `, [filterJSON['maxDistance']]);
        }

        if(filterJSON['ranges'] && filterJSON['ranges'].length > 0){
             const placeholders = filterJSON['ranges'].map(() => '?').join(',');
             p_filter_ranges = createPart(`AND t.range IN (${placeholders}) `, filterJSON['ranges']);
        }

        if(filterJSON['types'] && filterJSON['types'].length > 0){
             const placeholders = filterJSON['types'].map(() => '?').join(',');
             p_filter_types = createPart(`AND t.type IN (${placeholders}) `, filterJSON['types']);
        }

        if(filterJSON['languages'] && filterJSON['languages'].length > 0){
             const placeholders = filterJSON['languages'].map(() => '?').join(',');
             p_filter_languages = createPart(`AND t.text_lang IN (${placeholders}) `, filterJSON['languages']);
        }

        if(filterJSON['difficulties'] && filterJSON['difficulties'].length > 0){
             const placeholders = filterJSON['difficulties'].map(() => '?').join(',');
             p_filter_difficulties = createPart(`AND t.difficulty IN (${placeholders}) `, filterJSON['difficulties']);
        }

        if(filterJSON['providers'] && filterJSON['providers'].length > 0){
             const placeholders = filterJSON['providers'].map(() => '?').join(',');
             p_filter_providers = createPart(`AND t.provider IN (${placeholders}) `, filterJSON['providers']);
        }
    }

    const tld = get_domain_country(domain).toUpperCase();

    if(!!city && city.length > 0){
        p_search_city = createPart(`AND c2t.city_slug=? `, [city]);
    }
    else {
        p_search_city = createPart(`AND c2t.stop_selector='y' `);
    }

    if (typeof search === 'string' && search.trim() !== '') {
        let postgresql_language_code = 'german'

        if (currLanguage == 'sl') {
            postgresql_language_code = 'simple'
        }
        else if (currLanguage == 'fr') {
            postgresql_language_code = 'french'
        }
        else if (currLanguage == 'it') {
            postgresql_language_code = 'italian'
        }
        else if (currLanguage == 'en') {
            postgresql_language_code = 'english'
        }

        if (search.trim().split(/\s+/).length === 1) {
            p_search_term = createPart(`AND t.search_column @@ websearch_to_tsquery(?, ?) `, [postgresql_language_code, search]);
            p_search_order = createPart(`COALESCE(ts_rank(COALESCE(t.search_column, ''), COALESCE(websearch_to_tsquery(?, ?), '')), 0) DESC, `, [postgresql_language_code, search]);
        } 
        else {
            p_search_term = createPart(`AND ai_search_column <-> (SELECT get_embedding(?)) < 0.6 `, [`query: ${search.toLowerCase()}`]);
            p_search_order = createPart(`ai_search_column <-> (SELECT get_embedding(?)) ASC, `, [`query: ${search}`]);
        }
    }

    if(!!range && range.length > 0){
        p_search_range = createPart(`AND range=? `, [range]);
    }

    if(!!state && state.length > 0){
        p_search_state = createPart(`AND state=? `, [state]);
    }

    if(!!country && country.length > 0){
        p_search_country = createPart(`AND country=? `, [country]);
    }

    if(!!type && type.length > 0){
        p_search_type = createPart(`AND type=? `, [type]);
    }
    
    if(!!provider && provider.length > 0){
        p_search_provider = createPart(`AND t.provider=? `, [provider]);
    }

    if(!!language && language.length > 0){
        p_search_language = createPart(`AND text_lang=? `, [language]);
    }

    if(parsedPoi && parsedPoi.lat && parsedPoi.lng){
        const radius = parsedPoi.radius ? parsedPoi.radius : 5000
        const hashed_urls = await hashedUrlsFromPoi(parsedPoi.lat, parsedPoi.lng, radius)
        if(hashed_urls === null) {
            p_filter_poi = createPart(``);
        } else if (hashed_urls.length !== 0) {
             const placeholders = hashed_urls.map(() => '?').join(',');
             p_filter_poi = createPart(`AND t.hashed_url IN (${placeholders}) `, hashed_urls);
        } else {
            p_filter_poi = createPart(`AND t.hashed_url IN ('null') `);
        }
    }

    if(!!coordinatesNorthEast && !!coordinatesSouthWest){  
        const latNE = coordinatesNorthEast.lat.toString();
        const lngNE = coordinatesNorthEast.lng.toString();
        const latSW = coordinatesSouthWest.lat.toString();
        const lngSW = coordinatesSouthWest.lng.toString();

        p_search_map = createPart(
            `AND c2t.connection_arrival_stop_lon between (?)::numeric and (?)::numeric AND c2t.connection_arrival_stop_lat between (?)::numeric AND (?)::numeric `,
            [lngSW, lngNE, latSW, latNE]
        );
    }

    const allParts = [
        p_search_city,
        p_search_term,
        p_search_range,
        p_search_state,
        p_search_country,
        p_search_type,
        p_search_provider,
        p_search_language,
        p_search_map,
        p_filter_single,
        p_filter_multi,
        p_filter_summer,
        p_filter_winter,
        p_filter_traverse,
        p_filter_ascent,
        p_filter_descent,
        p_filter_transport,
        p_filter_distance,
        p_filter_ranges,
        p_filter_types,
        p_filter_languages,
        p_filter_difficulties,
        p_filter_providers,
        p_filter_poi
    ];

    const global_where_condition = allParts.map(p => p.sql).join('\n');
    const global_bindings = allParts.flatMap(p => p.bindings);

    let temp_table = '';
    const city_sanitized = (city || '').replace(/[^a-zA-Z0-9_]/g, '');
    if (!!city) {
        temp_table = `temp_`+tld+city_sanitized+`_`+Date.now();
    }
    else {
        temp_table = `temp_`+tld+`_`+Date.now();
    }

    const temporary_sql = `CREATE TEMP TABLE ${temp_table} AS
                        SELECT 
                        t.id, 
                        t.provider, 
                        t.hashed_url, 
                        t.url, 
                        t.title, 
                        t.image_url,
                        t.type, 
                        t.country, 
                        t.state, 
                        t.range_slug, 
                        t.range, 
                        t.text_lang, 
                        t.difficulty_orig,
                        t.season,
                        t.max_ele,
                        c2t.connection_arrival_stop_lon,
                        c2t.connection_arrival_stop_lat,
                        c2t.min_connection_duration,
                        c2t.min_connection_no_of_transfers, 
                        c2t.avg_total_tour_duration,
                        t.ascent, 
                        t.descent, 
                        t.difficulty, 
                        t.duration, 
                        t.distance, 
                        t.number_of_days, 
                        t.traverse, 
                        t.quality_rating,
                        t.month_order,
                        t.search_column,
                        t.ai_search_column
                        FROM city2tour AS c2t 
                        INNER JOIN tour AS t 
                        ON c2t.tour_id=t.id 
                        WHERE c2t.reachable_from_country=?
                        ${global_where_condition};`;
    await knex.raw(temporary_sql, [tld, ...global_bindings]);

    try {
        await knex.raw(`CREATE INDEX idx_id ON ${temp_table} (id);`)
    }
    catch(error) {
        console.log("Error creating index idx_id:", error);
    }

    // Bindings for new_search_sql
    const searchOrderBindings = p_search_order.bindings;
    const searchSqlBindings = [currLanguage, ...searchOrderBindings, 9 * (page - 1)];

    const new_search_sql = `SELECT 
                        t.id, 
                        t.provider, 
                        t.hashed_url, 
                        t.url, 
                        t.title, 
                        t.image_url,
                        t.type, 
                        t.country, 
                        t.state, 
                        t.range_slug, 
                        t.range, 
                        t.text_lang, 
                        t.difficulty_orig,
                        t.season,
                        t.max_ele,
                        t.connection_arrival_stop_lon,
                        t.connection_arrival_stop_lat,
                        t.min_connection_duration,
                        t.min_connection_no_of_transfers, 
                        ROUND(t.avg_total_tour_duration*100/25)*25/100 as avg_total_tour_duration,
                        t.ascent, 
                        t.descent, 
                        t.difficulty, 
                        t.duration, 
                        t.distance, 
                        t.number_of_days, 
                        t.traverse, 
                        t.quality_rating,
                        t.month_order
                        FROM ${temp_table} AS t 
                        ORDER BY 
                        CASE WHEN t.text_lang=? THEN 1 ELSE 0 END DESC,
                        ${p_search_order.sql}
                        t.month_order ASC, 
                        t.number_of_days ASC,
                        CASE WHEN t.ascent BETWEEN 600 AND 1200 THEN 0 ELSE 1 END ASC, 
                        TRUNC(t.min_connection_no_of_transfers*t.min_connection_no_of_transfers/2) ASC,
                        TRUNC(t.min_connection_duration / 30, 0) ASC, 
                        t.traverse DESC, 
                        t.quality_rating DESC,
                        FLOOR(t.duration) ASC,
                        MOD(t.id, CAST(EXTRACT(DAY FROM CURRENT_DATE) AS INTEGER)) ASC
                        LIMIT 9 OFFSET ?;`;

    let result_sql = null;
    let result = [];
    try {
        result_sql = await knex.raw(new_search_sql, searchSqlBindings);
        if (result_sql && result_sql.rows) {
            result = result_sql.rows;
        } else {
            console.log('knex.raw(new_search_sql): result or result.rows is null or undefined.');
        }
    }
    catch(error) {
        console.log("Error firing new_search_sql:", error);
    }

    
    // Count query
    let sql_count = 0;
    try {
        let count_query = knex.raw(`SELECT COUNT(*) AS row_count FROM ${temp_table};`); 
        let sql_count_call = await count_query;
        sql_count = parseInt(sql_count_call.rows[0].row_count, 10);
    } catch (error) {
        console.log("Error retrieving count:", error);
    }


    // Markers query
    let markers_result = '';
    let markers_array = [];
    
    if (!!map) {
        try {
            const markers_sql = `SELECT 
                            t.id, 
                            t.connection_arrival_stop_lat as lat,
                            t.connection_arrival_stop_lon as lon
                            FROM ${temp_table} AS t 
                            WHERE t.connection_arrival_stop_lat IS NOT NULL 
                            AND t.connection_arrival_stop_lon IS NOT NULL;`;
            markers_result = await knex.raw(markers_sql);
            
            if (!!markers_result && !!markers_result.rows) {
                markers_array = markers_result.rows;
            } else {
                console.log("markers_result is null or undefined");
            }    
        } 
        catch (error) {
            console.log("tours.js: error retrieving markers_result:" + error);
        }
    }

    try {
        await knex.raw(`DROP TABLE ${temp_table};`);
    }
    catch (err) {
        console.log("Drop temp table failed: ", err)
    }
    
    // Log search phrase
    try {
        let searchparam = '';

        if (search !== undefined && search !== null && search.length > 0 && req.query.city !== undefined) {
            searchparam = search.toLowerCase().trim();

            if (!!sql_count && sql_count > 1) {
                await knex('logsearchphrase').insert({
                    phrase: searchparam,
                    num_results: sql_count,
                    city_slug: req.query.city,
                    menu_lang: currLanguage,
                    country_code: get_domain_country(domain)
                });
            }
        }
    } catch (e) {
        console.error('error inserting into logsearchphrase: ', e);
    }
    

    if(result && Array.isArray(result)){
        await Promise.all(result.map(entry => new Promise(async resolve => {
            entry = await prepareTourEntry(entry, city, domain, addDetails);
            resolve(entry);
        })));
    }

    let ranges = [];
    let range_result = undefined

    if(!!showRanges){    
        const months = [
            "jan", "feb", "mar", "apr", "may", "jun",
            "jul", "aug", "sep", "oct", "nov", "dec"
          ];  
        const shortMonth = months[new Date().getMonth()];
        // Uses p_search_city from earlier
        const range_sql  = `SELECT
                            t.range_slug,
                            t.range,
                            CONCAT('https://cdn.zuugle.at/range-image/', t.range_slug, '.webp') as image_url,
                            SUM(1.0/(c2t.min_connection_no_of_transfers+1)) AS attract
                            FROM city2tour AS c2t 
                            INNER JOIN tour AS t 
                            ON c2t.tour_id=t.id 
                            WHERE c2t.reachable_from_country=?
                            ${p_search_city.sql}
                            AND ${shortMonth}='true'
                            AND t.range_slug IS NOT NULL
                            AND t.range IS NOT NULL
                            GROUP BY 1, 2, 3
                            ORDER BY SUM(1.0/(c2t.min_connection_no_of_transfers+1)) DESC, t.range_slug ASC
                            LIMIT 10`
        
        // bindings: tld + p_search_city.bindings
        range_result = await knex.raw(range_sql, [tld, ...p_search_city.bindings])
        
        if (!!range_result && !!range_result.rows) {
            ranges = range_result.rows;
        }
    }

    const responseData = {
        success: true,
        tours: result,
        total: sql_count,
        page: page,
        ranges: ranges,
        markers: markers_array,
      };

    await cacheService.set(cacheKey, responseData);

    res
      .status(200)
      .json(responseData);
}


const filterWrapper = async (req, res) => {
    const cacheKey = generateKey('tours:filter', req.query);
    const cached = await cacheService.get(cacheKey);
    if (cached) {
        return res.status(200).json(cached);
    }

    const search = req.query.search;
    const city = req.query.city;
    const domain = req.query.domain;
    const currLanguage = req.query.currLanguage;

    let kpis = [];
    let types = [];
    let text = [];
    let ranges = [];
    let providers = [];
    let tld = get_domain_country(domain).toUpperCase();

    // Parts
    let p_where_city = createPart();
    let p_search_term = createPart();

    if(!!city && city.length > 0){
        p_where_city = createPart(` AND c2t.city_slug=? `, [city]);
    } else {
        p_where_city = createPart(` AND c2t.stop_selector='y' `);
    }

    if (!!search && !!search.length > 0) {
        let postgresql_language_code = 'german'

        if (currLanguage == 'sl') {
            postgresql_language_code = 'simple'
        }
        else if (currLanguage == 'fr') {
            postgresql_language_code = 'french'
        }
        else if (currLanguage == 'it') {
            postgresql_language_code = 'italian'
        }
        else if (currLanguage == 'en') {
            postgresql_language_code = 'english'
        }

        p_search_term = createPart(`AND t.search_column @@ websearch_to_tsquery(?, ?) `, [postgresql_language_code, search]);
    }

    let temp_table = '';
    const city_sanitized = (city || '').replace(/[^a-zA-Z0-9_]/g, '');
    if (!!city) {
        temp_table = `temp_`+tld+city_sanitized+`_`+Date.now();
    }
    else {
        temp_table = `temp_`+tld+`_`+Date.now();
    }
    
    // Bindings: tld, where_city bindings, search_term bindings
    const filter_bindings = [tld, ...p_where_city.bindings, ...p_search_term.bindings];

    let temporary_sql = `CREATE TEMP TABLE ${temp_table} AS
                    SELECT 
                    t.type,
                    t.text_lang,
                    t.range,
                    t.range_slug,
                    t.provider,
                    t.number_of_days,
                    t.season,
                    t.traverse,
                    min(t.ascent) AS min_ascent,
                    max(t.ascent) AS max_ascent,
                    min(t.descent) AS min_descent,
                    max(t.descent) AS max_descent,
                    min(t.distance) AS min_distance,
                    max(t.distance) AS max_distance,
                    min(c2t.min_connection_duration) AS min_connection_duration,
                    max(c2t.max_connection_duration) AS max_connection_duration
                    FROM city2tour AS c2t 
                    INNER JOIN tour AS t 
                    ON c2t.tour_id=t.id                          
                    WHERE c2t.reachable_from_country=?
                    ${p_where_city.sql}
                    ${p_search_term.sql}
                    GROUP BY
                    t.type,
                    t.text_lang,
                    t.range,
                    t.range_slug,
                    t.provider,
                    t.number_of_days,
                    t.season,
                    t.traverse;`;
    await knex.raw(temporary_sql, filter_bindings);

    await knex.raw(`CREATE INDEX idx_type ON ${temp_table} (type);`)
    await knex.raw(`CREATE INDEX idx_lang ON ${temp_table} (text_lang);`)
    await knex.raw(`CREATE INDEX idx_range ON ${temp_table} (range, range_slug);`)
    await knex.raw(`CREATE INDEX idx_provider ON ${temp_table} (provider);`)

    

    let kpi_sql=`SELECT 
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
                FROM ${temp_table} t;`

    let kpi_result = await knex.raw(kpi_sql)
    if (!!kpi_result && !!kpi_result.rows) {
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

    for (const element of kpis) {
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


    let types_sql = `SELECT 
                    t.type
                    FROM ${temp_table} as t
                    GROUP BY t.type
                    ORDER BY t.type;`

    let types_result = await knex.raw(types_sql)
    if (!!types_result && !!types_result.rows) {
        types = types_result.rows;
    }

    let text_sql = `SELECT 
                    t.text_lang
                    FROM ${temp_table} as t
                    GROUP BY t.text_lang
                    ORDER BY t.text_lang;`

    let text_result = await knex.raw(text_sql)
    if (!!text_result && !!text_result.rows) {
        text = text_result.rows;
    }

    let range_sql = `SELECT 
                    t.range
                    FROM ${temp_table} as t                       
                    WHERE t.range_slug IS NOT NULL 
                    GROUP BY t.range
                    ORDER BY t.range;`

    let range_result = await knex.raw(range_sql)
    if (!!range_result && !!range_result.rows) {
        ranges = range_result.rows;
    }

    let provider_sql = `SELECT 
                    t.provider,
                    p.provider_name
                    FROM ${temp_table} as t                       
                    INNER JOIN provider as p 
                    ON t.provider=p.provider
                    GROUP BY t.provider, p.provider_name
                    ORDER BY t.provider;`;

    let provider_result = await knex.raw(provider_sql)
    if (!!provider_result && !!provider_result.rows) {
        providers = provider_result.rows;
    }
    

    let filterresult = {
        types: types.map(typeObj => typeObj.type),
        ranges: ranges.map(rangesObj => rangesObj.range),
        providers: providers.map(providerObj => providerObj.provider),
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
        languages: text.map(textObj => textObj.text_lang),
    };

    try {
        await knex.raw(`DROP TABLE ${temp_table};`);
    }
    catch (err) {
        console.log("Drop temp table failed: ", err)
    }

    const responseData = {success: true, filter: filterresult, providers: providers};
    await cacheService.set(cacheKey, responseData);
    res.status(200).json(responseData);
}



const connectionsExtendedWrapper = async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const city = !!req.query.city ? req.query.city : !!req.params.city ? req.params.city : null;
    const domain = req.query.domain;

    if(isNaN(id) || !!!city){
        res.status(404).json({success: false});
        return;
    }

    let connections = [];
    const fahrplan_sql = `SELECT 
                          f.calendar_date,
                          f.connection_departure_datetime,
                          f.connection_arrival_datetime,
                          f.connection_duration,
                          f.connection_no_of_transfers,
                          f.connection_returns_trips_back,
                          f.return_departure_datetime,
                          f.return_duration,
                          f.return_no_of_transfers,
                          f.return_arrival_datetime,
                          f.totour_track_duration,
                          f.fromtour_track_duration,
                          f.connection_description_json,
                          f.return_description_json,
                          f.totour_track_key,
                          f.fromtour_track_key
                          FROM tour as t
                          INNER JOIN fahrplan as f
                          ON f.hashed_url=t.hashed_url
                          WHERE t.id=?
                          AND f.city_slug=?
                          ORDER BY return_row ASC;`;
    const fahrplan_result = await knex.raw(fahrplan_sql, [id, city])
    
    if (!!fahrplan_result && !!fahrplan_result.rows) {
        connections = fahrplan_result.rows.map(connection => {
            connection.connection_departure_datetime = momenttz(connection.connection_departure_datetime).tz('Europe/Berlin').format();
            connection.connection_arrival_datetime = momenttz(connection.connection_arrival_datetime).tz('Europe/Berlin').format();
            connection.return_departure_datetime = momenttz(connection.return_departure_datetime).tz('Europe/Berlin').format();
            return connection;
        });
    }

    const today = moment().set('hour', 0).set('minute', 0).set('second', 0);
    let end = moment().add(7, 'day');

    let result = [];

    while(today.isBefore(end)){
        const byWeekday  = connections.filter(conn => moment(conn.calendar_date).format('DD.MM.YYYY') == today.format('DD.MM.YYYY'))
        const duplicatesRemoved = [];
        
        byWeekday.forEach(t => {
            let e = {...t}
            e.connection_duration_minutes = minutesFromMoment(moment(e.connection_duration, 'HH:mm:ss'));
            e.return_duration_minutes = minutesFromMoment(moment(e.return_duration, 'HH:mm:ss'));

            if(!!!duplicatesRemoved.find(tt => compareConnections(e, tt))){
                e.gpx_file = `${getHost(domain)}/public/gpx-track/totour/${last_two_characters(e.totour_track_key)}/${e.totour_track_key}.gpx`;
                duplicatesRemoved.push(e);
            }
        })

        result.push({
            date: today.format(),
            connections: duplicatesRemoved,
            returns: getReturnConnectionsByConnection(connections, domain, today),
        })
        today.add(1, "day");
    }

    //handle last value
    if(result && result.length > 0){
        if(!!result[result.length - 1] && (!!!result[result.length - 1].connections || result[result.length - 1].connections.length == 0)){
            result = result.slice(0, -1);
        }
    }

    res.status(200).json({success: true, result: result});
}


const getReturnConnectionsByConnection = (connections, domain, today) => {
    let _connections = [];
    let _duplicatesRemoved = [];

    _connections = connections.filter(conn => moment(conn.calendar_date).format('DD.MM.YYYY') == today.format('DD.MM.YYYY'))


    //filter and map
    _connections.forEach(t => {
        let e = {...t}
        e.connection_duration_minutes = minutesFromMoment(moment(e.connection_duration, 'HH:mm:ss'));
        e.return_duration_minutes = minutesFromMoment(moment(e.return_duration, 'HH:mm:ss'));

        if(!!!_duplicatesRemoved.find(tt => compareConnectionReturns(e, tt))){
            e.gpx_file = `${getHost(domain)}/public/gpx-track/fromtour/${last_two_characters(e.fromtour_track_key)}/${e.fromtour_track_key}.gpx`;
            _duplicatesRemoved.push(e);
        }
    });
    return _duplicatesRemoved;
}



const compareConnections = (trans1, trans2) => {
    return trans1 != null
        && trans2 != null
        && moment(trans1.connection_departure_datetime).isSame(moment(trans2.connection_departure_datetime))
        && moment(trans1.connection_arrival_datetime).isSame(moment(trans2.connection_arrival_datetime))
}

const compareConnectionReturns = (conn1, conn2) => {
    return conn1 != null
        && conn2 != null
        && moment(conn1.return_departure_datetime).format('HH:mm:ss') == moment(conn2.return_departure_datetime).format('HH:mm:ss')
        && moment(conn1.return_arrival_datetime).format("HH:mm:ss") == moment(conn2.return_arrival_datetime).format("HH:mm:ss")
        && conn1.return_arrival_stop == conn2.return_arrival_stop;
}


const getWeekday = (date) => {
    const day = moment(date).day();
    switch(day){
        case 0: return "sun";
        case 1: return "mon";
        case 2: return "tue";
        case 3: return "wed";
        case 4: return "thu";
        case 5: return "fri";
        case 6: return "sat";
        default: return "mon";
    }
}


const tourGpxWrapper = async (req, res) => {
    const id = req.params.id;
    const type = !!req.query.type ? req.query.type : "gpx";
    const key = req.query.key;
    const keyAnreise = req.query.key_anreise;
    const keyAbreise = req.query.key_abreise;

    res.setHeader('content-type', 'application/gpx+xml');
    res.setHeader('Cache-Control', 'public, max-age=31557600');

    try {
        let BASE_PATH = process.env.NODE_ENV === "production" ? "../" : "../../";
        if(type == "all"){
            let filePathMain = replaceFilePath(path.join(__dirname, BASE_PATH, `/public/gpx/${last_two_characters(id)}/${id}.gpx`));
            let filePathAbreise = replaceFilePath(path.join(__dirname, BASE_PATH, `/public/gpx-track/fromtour/${last_two_characters(keyAbreise)}/${keyAbreise}.gpx`));
            let filePathAnreise = replaceFilePath(path.join(__dirname, BASE_PATH, `/public/gpx-track/totour/${last_two_characters(keyAnreise)}/${keyAnreise}.gpx`));

            const xml = await mergeGpxFilesToOne(filePathMain, filePathAnreise, filePathAbreise);
            if(!!xml){
                res.status(200).send(xml);
            } else {
                res.status(400).json({success: false});
            }

        } else {
            let filePath = path.join(__dirname, BASE_PATH, `/public/gpx/${last_two_characters(id)}/${id}.gpx`);
            if(type == "abreise" && !!key){
                filePath = path.join(__dirname, BASE_PATH, `/public/gpx-track/fromtour/${last_two_characters(key)}/${key}.gpx`);
            } else if(type == "anreise" && !!key){
                filePath = path.join(__dirname, BASE_PATH, `/public/gpx-track/totour/${last_two_characters(key)}/${key}.gpx`);
            }
            filePath = replaceFilePath(filePath);

            let stream = fs.createReadStream(filePath);
            stream.on('error', error => {
                console.log('error: ', error);
                res.status(500).json({ success: false });
            });
            stream.on('open', () => stream.pipe(res));
        }
    } catch(e){
        console.error(e);
    }
}

const getMissingConnectionDays = (connections) => {
    let toReturn = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    if(!!connections && connections.length > 0){
        if(!!connections.find(c => c.weekday === "sun")){
            toReturn = toReturn.filter(c => c !== "So");
        }
        if(!!connections.find(c => c.weekday === "mon")){
            toReturn = toReturn.filter(c => c !== "Mo");
        }
        if(!!connections.find(c => c.weekday === "tue")){
            toReturn = toReturn.filter(c => c !== "Di");
        }
        if(!!connections.find(c => c.weekday === "wed")){
            toReturn = toReturn.filter(c => c !== "Mi");
        }
        if(!!connections.find(c => c.weekday === "thu")){
            toReturn = toReturn.filter(c => c !== "Do");
        }
        if(!!connections.find(c => c.weekday === "fri")){
            toReturn = toReturn.filter(c => c !== "Fr");
        }
        if(!!connections.find(c => c.weekday === "sat")){
            toReturn = toReturn.filter(c => c !== "Sa");
        }
    }
    return toReturn;
}

const getConnectionsByWeekday = (connections, weekday) => {
    if(!!connections && connections.length > 0){
        const found = connections.filter(c => c.weekday === weekday);
        if(!!found && found.length > 0){
            return found;
        } else {
            return getConnectionsByWeekday(connections, connections[0].weekday);
        }
    }
    return [];
}

const prepareTourEntry = async (entry, city, domain, addDetails = true) => {
    if( !(!!entry && !!entry.provider) ) return entry ;    

    const host = getHost(domain);
    entry.gpx_file = `${host}/public/gpx/${last_two_characters(entry.id)}/${entry.id}.gpx`;

    if(!!addDetails){
        if(!!city){
            const toTour = await knex('fahrplan').select('totour_track_key').where({hashed_url: entry.hashed_url, city_slug: city}).whereNotNull('totour_track_key').first();
            const fromTour = await knex('fahrplan').select('fromtour_track_key').where({hashed_url: entry.hashed_url, city_slug: city}).whereNotNull('fromtour_track_key').first();

            if(!!toTour && !!toTour.totour_track_key){
                entry.totour_gpx_file = `${host}/public/gpx-track/totour/${last_two_characters(toTour.totour_track_key)}/${toTour.totour_track_key}.gpx`;
            }
            if(!!fromTour && !!fromTour.fromtour_track_key){
                entry.fromtour_gpx_file = `${host}/public/gpx-track/fromtour/${last_two_characters(fromTour.fromtour_track_key)}/${fromTour.fromtour_track_key}.gpx`;
            }
        }

        /** add provider_name to result */
        let provider_result = await knex('provider').select('provider_name').where({provider: entry.provider}).first();
        entry.provider_name = provider_result.provider_name;

        // convert the "difficulty" value into a text value 
        entry.difficulty = convertDifficulty(entry.difficulty)


        // add info about canonical and alternate links of this tour with entry.id
        const canon_sql = `SELECT
                          city_slug,
                          canonical_yn,
                          zuugle_url,
                          href_lang
                          FROM canonical_alternate
                          WHERE id=${entry.id};`;  
        const canonical = await knex.raw(canon_sql); 
        if (!!canonical) {
            entry.canonical = canonical.rows;
        }
    }

    const { ["hashed_url"]: remove, ...rest } = entry;
    return rest;
}

export default router;
