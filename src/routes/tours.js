import express from 'express';
let router = express.Router();
import knex from "../knex";
import {mergeGpxFilesToOne, last_two_characters, hashedUrlsFromPoi} from "../utils/gpx/gpxUtils";
import moment from "moment";
import {getHost, replaceFilePath, get_domain_country, isNumber } from "../utils/utils";
import {minutesFromMoment} from "../utils/helper";
import { convertDifficulty } from '../utils/dataConversion';
// import logger from '../utils/logger';

const fs = require('fs');
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
    const total = await knex.raw(`SELECT 
                                tours.value as tours,
                                COALESCE(tours_city.value, 0) AS tours_city,
                                conn.value as connections,
                                ranges.value AS ranges,
                                cities.value AS cities,
                                provider.value AS provider 
                                FROM kpi AS tours 
                                LEFT OUTER JOIN kpi AS tours_city 
                                ON tours_city.name='total_tours_${city}' 
                                LEFT OUTER JOIN kpi AS conn 
                                ON conn.name='total_connections' 
                                LEFT OUTER JOIN kpi AS ranges 
                                ON ranges.name='total_ranges' 
                                LEFT OUTER JOIN kpi AS cities 
                                ON cities.name='total_cities' 
                                LEFT OUTER JOIN kpi AS provider ON provider.name='total_provider' 
                                WHERE tours.name='total_tours';`);
    
    res.status(200).json({success: true, total_tours: total.rows[0]['tours'],tours_city: total.rows[0]['tours_city'] ,total_connections: total.rows[0]['connections'], total_ranges: total.rows[0]['ranges'], total_cities: total.rows[0]['cities'], total_provider: total.rows[0]['provider']});
}

const getWrapper = async (req, res) => {
    
    const city = !!req.query.city ? req.query.city : !!req.params.city ? req.params.city : null;
    const id = parseInt(req.params.id, 10);
    // console.log("===================") 
    // console.log(" city from getWrapper : ", city )
    // console.log(" req.params from getWrapper : ", req.params )
    // console.log("===================") 
    // console.log(" req.query from getWrapper : ", (req.query) )
    // console.log("===================") 
    const domain = req.query.domain;
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
    if(!!city && city.length > 0 && city!='no-city'){
        new_search_where_city = `AND c2t.city_slug='${city}' `
    }

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
                WHERE c2t.reachable_from_country='${tld}' 
                ${new_search_where_city}
                AND t.id=${id}
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
                FROM tour_inactive as t WHERE t.id=${id}
                ORDER BY valid_tour DESC LIMIT 1) as a`

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
                WHERE c2t.reachable_from_country='${tld}' 
                AND t.id=${id}
                ORDER BY valid_tour DESC LIMIT 1) as a`
                

    try {
        let entry2 = await knex.raw(sql)
        let entry = entry2.rows[0]

        if (!entry) {
            // If above sql is empty, it might be, that the selected city has no working connection to the tour 
            // So the query checks the active tours without city and returns 2 as valid_tour
            entry2 = await knex.raw(sql3)
            entry = entry2.rows[0]

            if (!entry) {
                res.status(404).json({ success: false, message: "Tour not found" });
                return;
            }
        }

        // The function prepareTourEntry will remove the column hashed_url, so it is not send to frontend
        entry = await prepareTourEntry(entry, city, domain, true);
        res.status(200).json({ success: true, tour: entry });
    } catch (error) {
        res.status(500).json({ success: false, message: "Internal server error" });
    }
}

const listWrapper = async (req, res) => {
    const showRanges = !!req.query.ranges;
    const page = req.query.page || 1;
    const map = req.query.map;
    const bounds = req.query.bounds;

    const search = req.query.search; 
    const currLanguage = req.query.currLanguage ? req.query.currLanguage : 'de'; // this is the menue language the user selected
    const city = req.query.city;    
    const range = req.query.range;
    const state = req.query.state;
    const country = req.query.country;
    const type = req.query.type;
    const domain = req.query.domain; 
    const provider = req.query.provider;
    const language = req.query.language; // this referres to the column in table tour: The tour description is in which language
    const filter = req.query.filter;


    let parsedBounds;

    if (bounds) {
        parsedBounds = JSON.parse(bounds);
    }    
 
    const coordinatesNorthEast = !!parsedBounds ? parsedBounds._northEast : null;
    const coordinatesSouthWest = !!parsedBounds ? parsedBounds._southWest : null;

    // variables initialized depending on availability of 'map' in the request
    //const map = req && req.query && req.query.map === "true"; // add optional chaining
    //let useLimit = !!!map;  // initialise with true
    //let addDetails = !!!map; // initialise with true
    let addDetails = true; 

    let new_search_where_searchterm = ``
    let new_search_order_searchterm = ``
    let new_search_where_city = ``
    let new_search_where_country = ``
    let new_search_where_state = ``
    let new_search_where_range = ``
    let new_search_where_type = ``
    let new_search_where_provider = ``
    let new_search_where_map = ``
    let new_search_where_language = `` 
    let new_filter_where_singleDayTour = ``
    let new_filter_where_multipleDayTour = ``
    let new_filter_where_summerSeason = ``
    let new_filter_where_winterSeason = ``
    let new_filter_where_traverse = ``
    let new_filter_where_Ascent = ``
    let new_filter_where_Descent = ``
    let new_filter_where_TransportDuration = ``
    let new_filter_where_Distance = ``
    let new_filter_where_ranges = ``
    let new_filter_where_types = ``
    let new_filter_where_languages = ``
    let new_filter_where_difficulties = ``
    let new_filter_where_providers = ``
    let new_filter_where_poi = ``

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

    // merge with filterJSON
    filterJSON = {
        ...defaultFilter,
        ...filterJSON,
    };

    if (typeof filterJSON !== 'undefined' && filter_string != `{ ignore_filter: 'true' }`) {

        if(filterJSON['singleDayTour'] && !filterJSON['multipleDayTour']){
            new_filter_where_singleDayTour = `AND t.number_of_days=1 `
        }

        if(!filterJSON['singleDayTour'] && filterJSON['multipleDayTour']){
            new_filter_where_multipleDayTour = `AND t.number_of_days>=2 `
        }

        if(filterJSON['summerSeason'] && !filterJSON['winterSeason']){
            new_filter_where_summerSeason = `AND (t.season='s' OR t.season='g') `
        }

        if(!filterJSON['summerSeason'] && filterJSON['winterSeason']){
            new_filter_where_winterSeason = `AND (t.season='w' OR t.season='g') `
        }

        if(filterJSON['traverse']){
            new_filter_where_traverse = `AND t.traverse=1 `
        }

        if (isNumber(filterJSON['minAscent']) && filterJSON['minAscent'] >= 0) {
            new_filter_where_Ascent += `AND t.ascent >= ${filterJSON['minAscent']} `;
        }

        if (isNumber(filterJSON['maxAscent']) && filterJSON['maxAscent'] >= 0) {
            new_filter_where_Ascent += `AND t.ascent <= ${filterJSON['maxAscent']} `;
        }

        if (isNumber(filterJSON['minDescent']) && filterJSON['minDescent'] >= 0) {
            new_filter_where_Descent += `AND t.descent >= ${filterJSON['minDescent']} `;
        }

        if (isNumber(filterJSON['maxDescent']) && filterJSON['maxDescent'] >= 0) {
            new_filter_where_Descent += `AND t.descent <= ${filterJSON['maxDescent']} `;
        }

        if (isNumber(filterJSON['minTransportDuration']) && filterJSON['minTransportDuration'] >= 0) {
            new_filter_where_TransportDuration += `AND c2t.min_connection_duration >= ${filterJSON['minTransportDuration'] * 60} `;
        }

        if (isNumber(filterJSON['maxTransportDuration']) && filterJSON['maxTransportDuration'] >= 0) {
            new_filter_where_TransportDuration += `AND c2t.min_connection_duration <= ${filterJSON['maxTransportDuration'] * 60} `;
        }

        if (isNumber(filterJSON['minDistance']) && filterJSON['minDistance'] > 0) {
            new_filter_where_Distance += `AND t.distance >= ${filterJSON['minDistance']} `;
        }

        if (isNumber(filterJSON['maxDistance']) && filterJSON['maxDistance'] > 0) {
            new_filter_where_Distance += `AND t.distance <= ${filterJSON['maxDistance']} `;
        }

        if(filterJSON['ranges']){
            new_filter_where_ranges = `AND t.range IN ${JSON.stringify(filterJSON['ranges']).replace("[", '(').replace("]", ')').replaceAll('"', "'")} `

            if(new_filter_where_ranges === 'AND t.range IN () ;') {
                new_filter_where_ranges = ``
            }
        }

        if(filterJSON['types']){
            new_filter_where_types = `AND t.type IN ${JSON.stringify(filterJSON['types']).replace("[", '(').replace("]", ')').replaceAll('"', "'")} `

            if(new_filter_where_types === 'AND t.type IN () ;') {
                new_filter_where_types = ``
            }
        }

        if(filterJSON['languages']){
            new_filter_where_languages = `AND t.text_lang IN ${JSON.stringify(filterJSON['languages']).replace("[", '(').replace("]", ')').replaceAll('"', "'")} `
            
            if(new_filter_where_languages === 'AND t.text_lang IN () ;') {
                new_filter_where_languages = ``
            }
        }

        if(filterJSON['difficulties']){
            new_filter_where_difficulties = `AND t.difficulty IN ${JSON.stringify(filterJSON['difficulties']).replace("[", '(').replace("]", ')').replaceAll('"', "'")} `
            
            if(new_filter_where_difficulties === 'AND t.difficulty IN () ;') {
                new_filter_where_difficulties = ``
            }
        }

        if(filterJSON['providers']){
            new_filter_where_providers = `AND t.provider IN ${JSON.stringify(filterJSON['providers']).replace("[", '(').replace("]", ')').replaceAll('"', "'")} `
            
            if(new_filter_where_providers === 'AND t.provider IN () ;') {
                new_filter_where_providers = ``
            }
        }

        if(filterJSON['poi']){
            const lat = filterJSON['poi']['lat']
            const lon = filterJSON['poi']['lon']
            const hashed_urls = await hashedUrlsFromPoi(lat, lon, 100)
            if(hashed_urls === null) {
                new_filter_where_poi = ``
            } else if (hashed_urls.length !== 0) {
                new_filter_where_poi = `AND t.hashed_url IN ${JSON.stringify(hashed_urls).replace("[", '(').replace("]", ')').replaceAll('"', "'")} `
            } else {
                new_filter_where_poi = `AND t.hashed_url IN ('null') ;`
            }
        }
    }

    const tld = get_domain_country(domain).toUpperCase();

    if(!!city && city.length > 0){
        new_search_where_city = `AND c2t.city_slug='${city}' `
    }
    else {
        new_search_where_city = `AND c2t.stop_selector='y' `
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

        // If there is more than one search term, the AI is superior,
        // is there only a single word, the standard websearch of PostgreSQL ist better.
        
        if (search.trim().split(/\s+/).length === 1) {
            // search consists of a single word
            new_search_where_searchterm = `AND t.search_column @@ websearch_to_tsquery('${postgresql_language_code}', '${search}') `
            new_search_order_searchterm = `COALESCE(ts_rank(COALESCE(t.search_column, ''), COALESCE(websearch_to_tsquery('${postgresql_language_code}', '${search}'), '')), 0) DESC, `
            // console.log("Websearch")
        } 
        else {
            new_search_where_searchterm = `AND ai_search_column <-> (SELECT get_embedding('query: ${search.toLowerCase()}')) < 0.6 `;
            new_search_order_searchterm = `ai_search_column <-> (SELECT get_embedding('query: ${search}')) ASC, `
            // console.log("AI search")
        }
    }

    if(!!range && range.length > 0){
        new_search_where_range = `AND range='${range}' `
    }

    if(!!state && state.length > 0){
        new_search_where_state = `AND state='${state}' `
    }

    if(!!country && country.length > 0){
        new_search_where_country = `AND country='${country}' `
    }

    if(!!type && type.length > 0){
        new_search_where_type = `AND type='${type}' `
    }
    
    if(!!provider && provider.length > 0){
        new_search_where_provider = `AND t.provider='${provider}' `
    }

    if(!!language && language.length > 0){
        new_search_where_language = `AND text_lang='${language}'  `
    }

    //filters the tours by coordinates
    //FE sends coordinate bounds which the user sees on the map --> tours that are within these coordinates are returned
    if(!!coordinatesNorthEast && !!coordinatesSouthWest){  
        const latNE = coordinatesNorthEast.lat.toString();
        const lngNE = coordinatesNorthEast.lng.toString();
        const latSW = coordinatesSouthWest.lat.toString();
        const lngSW = coordinatesSouthWest.lng.toString();

        new_search_where_map = `AND c2t.connection_arrival_stop_lon between (${lngSW})::numeric and (${lngNE})::numeric AND c2t.connection_arrival_stop_lat between (${latSW})::numeric AND (${latNE})::numeric `;
    }

    const global_where_condition = `${new_search_where_city}
                                    ${new_search_where_searchterm}
                                    ${new_search_where_range}
                                    ${new_search_where_state}
                                    ${new_search_where_country}
                                    ${new_search_where_type}
                                    ${new_search_where_provider}
                                    ${new_search_where_language}
                                    ${new_search_where_map}
                                    ${new_filter_where_singleDayTour}
                                    ${new_filter_where_multipleDayTour}
                                    ${new_filter_where_summerSeason}
                                    ${new_filter_where_winterSeason}
                                    ${new_filter_where_traverse}
                                    ${new_filter_where_Ascent}
                                    ${new_filter_where_Descent}
                                    ${new_filter_where_TransportDuration}
                                    ${new_filter_where_Distance}
                                    ${new_filter_where_ranges}
                                    ${new_filter_where_types}
                                    ${new_filter_where_languages}
                                    ${new_filter_where_difficulties}
                                    ${new_filter_where_providers}
                                    ${new_filter_where_poi}`;

    
    let temp_table = '';
    if (!!city) {
        temp_table = `temp_`+tld+city.replace(/-/g, '_')+`_`+Date.now();
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
                        WHERE c2t.reachable_from_country='${tld}' 
                        ${global_where_condition};`;
    await knex.raw(temporary_sql);
    // console.log("temporary_sql = ", temporary_sql);

    try {
        await knex.raw(`CREATE INDEX idx_id ON ${temp_table} (id);`)
    }
    catch(error) {
        console.log("Error creating index idx_id:", error);
    }

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
                        CASE WHEN t.text_lang='${currLanguage}' THEN 1 ELSE 0 END DESC,  
                        ${new_search_order_searchterm}
                        t.month_order ASC, 
                        t.number_of_days ASC,
                        CASE WHEN t.ascent BETWEEN 600 AND 1200 THEN 0 ELSE 1 END ASC, 
                        TRUNC(t.min_connection_no_of_transfers*t.min_connection_no_of_transfers/2) ASC,
                        TRUNC(t.min_connection_duration / 30, 0) ASC, 
                        t.traverse DESC, 
                        t.quality_rating DESC,
                        FLOOR(t.duration) ASC,
                        MOD(t.id, CAST(EXTRACT(DAY FROM CURRENT_DATE) AS INTEGER)) ASC
                        LIMIT 9 OFFSET ${9 * (page - 1)};`;

    // console.log("new_search_sql: ", new_search_sql)

    let result_sql = null;
    let result = [];
    try {
        result_sql = await knex.raw(new_search_sql); // fire the DB call here
        if (result_sql && result_sql.rows) {
            result = result_sql.rows;
        } else {
            console.log('knex.raw(new_search_sql): result or result.rows is null or undefined.');
        }
    }
    catch(error) {
        console.log("Error firing new_search_sql:", error);
    }

    
    // ****************************************************************
    // GET THE COUNT 
    // ****************************************************************
    let sql_count = 0;
    try {
        let count_query = knex.raw(`SELECT COUNT(*) AS row_count FROM ${temp_table};`); 
        let sql_count_call = await count_query;
        sql_count = parseInt(sql_count_call.rows[0].row_count, 10);
        // console.log("count_sql: ", count_sql)
    } catch (error) {
        console.log("Error retrieving count:", error);
    }


    // ****************************************************************
    // CALLING DATABASE FOR MARKERS
    // ****************************************************************
    let markers_result = ''; //markers-related : to return map markers positions from database
    let markers_array = []; // markers-related : to be filled by either cases(with or without "search included")
    
    if (!!map) {
        try {
            // markers-related / searchIncluded
            const markers_sql = `SELECT 
                            t.id, 
                            t.connection_arrival_stop_lat as lat,
                            t.connection_arrival_stop_lon as lon
                            FROM ${temp_table} AS t 
                            WHERE t.connection_arrival_stop_lat IS NOT NULL 
                            AND t.connection_arrival_stop_lon IS NOT NULL;`;
            markers_result = await knex.raw(markers_sql); // fire the DB call here
            
            // markers-related
            if (!!markers_result && !!markers_result.rows) {
                markers_array = markers_result.rows; // This is to be passed to the response below
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
    
    //logsearchphrase
    //This code first logs the search phrase and the number of results in a database table called logsearchphrase if a search was performed. It replaces any single quotes in the search parameter with double quotes, which is necessary to insert the search parameter into the SQL statement.
    try {
        let searchparam = '';

        if (search !== undefined && search !== null && search.length > 0 && req.query.city !== undefined) {
            searchparam = search.replace(/'/g, "''").toLowerCase();

            if (!!sql_count && sql_count > 1) {
                await knex.raw(`INSERT INTO logsearchphrase(phrase, num_results, city_slug, menu_lang, country_code) VALUES('${searchparam}', ${sql_count}, '${req.query.city}', '${currLanguage}', '${get_domain_country(domain)}');`)
            }
        }
    } catch (e) {
        console.error('error inserting into logsearchphrase: ', e);
    }
    

    // preparing tour entries
    // this code maps over the query result and applies the function prepareTourEntry to each entry. The prepareTourEntry 
    // function returns a modified version of the entry that includes additional data and formatting. 
    // The function also sets the 'is_map_entry' property of the entry to true if map is truthy. 
    // The function uses Promise.all to wait for all promises returned by 'prepareTourEntry' to resolve before 
    // returning the final result array.
    if(result && Array.isArray(result)){
        await Promise.all(result.map(entry => new Promise(async resolve => {
            // The function prepareTourEntry will remove the column hashed_url, so it is not send to frontend
            entry = await prepareTourEntry(entry, city, domain, addDetails);
            resolve(entry);
        })));
    }

    /** add ranges to result */
    // This code prepares the response to a HTTP request.
    // The ranges array is populated with data about the tours ranges. The showRanges variable is a 
    // boolean that is passed in the request to determine whether to return the ranges or not. 
    // If showRanges is true, then the code queries the database to get a list of the distinct ranges
    // and their image urls. It then loops through the results to create an array of range objects
    // containing the range name and the corresponding image URL. The code then queries the database
    // to get all states of each range and adds them to the states array of each range object.
    let ranges = [];
    let range_result = undefined

    if(!!showRanges){    
        const months = [
            "jan", "feb", "mar", "apr", "may", "jun",
            "jul", "aug", "sep", "oct", "nov", "dec"
          ];  
        const shortMonth = months[new Date().getMonth()];
        const range_sql  = `SELECT
                            t.range_slug,
                            t.range,
                            CONCAT('${getHost(domain)}/public/range-image/', t.range_slug, '.webp') as image_url,
                            SUM(1.0/(c2t.min_connection_no_of_transfers+1)) AS attract
                            FROM city2tour AS c2t 
                            INNER JOIN tour AS t 
                            ON c2t.tour_id=t.id 
                            WHERE c2t.reachable_from_country='${tld}'
                            ${new_search_where_city}
                            AND ${shortMonth}='true'
                            AND t.range_slug IS NOT NULL
                            AND t.range IS NOT NULL
                            GROUP BY 1, 2, 3
                            ORDER BY SUM(1.0/(c2t.min_connection_no_of_transfers+1)) DESC, t.range_slug ASC
                            LIMIT 10`
        
        range_result = await knex.raw(range_sql)
        // console.log("range_sql: ", range_sql)
        
        if (!!range_result && !!range_result.rows) {
            ranges = range_result.rows;
        }
    }


    //describe:
    // The result array contains the list of tours returned from the database after executing the main query. 
    // This array is already looped through to transform each tour entry with additional data and metadata 
    // using the prepareTourEntry function. Finally, a JSON response is returned with success set to true, 
    // the tours array, the total count of tours returned by the main query, the current page, and the 
    // ranges array (if showRanges is true).

    res
      .status(200)
      .json({
        success: true,
        tours: result,
        total: sql_count,
        page: page,
        ranges: ranges,
        markers: markers_array,
      });
} // end of listWrapper


const filterWrapper = async (req, res) => {
    const search = req.query.search;
    const city = req.query.city;
    const domain = req.query.domain;
    const currLanguage = req.query.currLanguage; // gets the menu language (selected by visitor)

    // Where Condition is only depending on country, city and search term(s)

    let kpis = [];
    let types = [];
    let text = [];
    let ranges = [];
    let providers = [];
    let tld = get_domain_country(domain).toUpperCase();
    let where_city = ` AND c2t.stop_selector='y' `;
    let new_search_where_searchterm = '';

    if(!!city && city.length > 0){
        where_city = ` AND c2t.city_slug='${city}' `;
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

        new_search_where_searchterm = `AND t.search_column @@ websearch_to_tsquery('${postgresql_language_code}', '${search}') `
    }

    let temp_table = '';
    if (!!city) {
        temp_table = `temp_`+tld+city.replace(/-/g, '_')+`_`+Date.now();
    }
    else {
        temp_table = `temp_`+tld+`_`+Date.now();
    }
    // console.log("temp_table: ", temp_table)
    
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
                    WHERE c2t.reachable_from_country='${tld}'  
                    ${where_city}
                    ${new_search_where_searchterm}
                    GROUP BY
                    t.type,
                    t.text_lang,
                    t.range,
                    t.range_slug,
                    t.provider,
                    t.number_of_days,
                    t.season,
                    t.traverse;`;
    await knex.raw(temporary_sql);

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
    //console.log("kpi_sql: ", kpi_sql)            

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
    // console.log("types / Sportarten: ", types)


    let text_sql = `SELECT 
                    t.text_lang
                    FROM ${temp_table} as t
                    GROUP BY t.text_lang
                    ORDER BY t.text_lang;`

    let text_result = await knex.raw(text_sql)
    if (!!text_result && !!text_result.rows) {
        text = text_result.rows;
    }
    // console.log("text_lang: ", text)


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
    // console.log("ranges: ", ranges)

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
    // console.log("filterresult: ", filterresult)

    try {
        await knex.raw(`DROP TABLE ${temp_table};`);
    }
    catch (err) {
        console.log("Drop temp table failed: ", err)
    }

    res.status(200).json({success: true, filter: filterresult, providers: providers});
} // end of filterWrapper



const connectionsExtendedWrapper = async (req, res) => {
    const id = req.params.id;
    const city = !!req.query.city ? req.query.city : !!req.params.city ? req.params.city : null;
    const domain = req.query.domain;

    if(!!!id || !!!city){
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
                          WHERE t.id='${id}' 
                          AND f.city_slug='${city}' 
                          ORDER BY return_row ASC;`;
    const fahrplan_result = await knex.raw(fahrplan_sql)    
    
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
