/**
 * Search Interpreter Module
 *
 * Translates natural language search queries into structured filters.
 * Runs in SHADOW MODE - logs what it WOULD do without affecting results.
 */

import { interpretSearch, generateSearchUrl } from "./interpreter.js";
import { getAvailableCities, normalizeCityName, findBestCityMatch } from "./cityMatcher.js";
import logger from "../logger.js";

/**
 * Main entry point for search interpretation.
 * Wraps the core interpreter with city loading.
 *
 * @param {string} query - The user's search query
 * @param {string} currentCity - Already selected city (optional)
 * @param {string} language - Menu language (de, en, it, fr, sl)
 * @returns {Promise<InterpretationResult>}
 */
export async function interpret(query, currentCity = null, language = "de") {
    try {
        // Load available cities for detection
        const availableCities = await getAvailableCities();

        // Run the interpreter
        return await interpretSearch(query, currentCity, language, availableCities);
    } catch (err) {
        logger.warn("Search interpretation failed:", err.message);
        return {
            cleanedQuery: query,
            filters: {},
            entities: [],
            confidence: 0,
        };
    }
}

/**
 * Interpret search in background and log results.
 * This is the shadow mode entry point.
 *
 * @param {string} query - The user's search query
 * @param {string} currentCity - Already selected city
 * @param {string} language - Menu language
 * @param {string} domain - Domain for URL generation
 * @returns {Promise<InterpretationResult>}
 */
export async function interpretInBackground(query, currentCity, language, domain) {
    const result = await interpret(query, currentCity, language);

    // Only log if we actually interpreted something
    if (result.entities.length > 0) {
        const url = generateSearchUrl(domain, result);
        logger.info(
            `[SHADOW] "${query}" → filters=${JSON.stringify(result.filters)} confidence=${result.confidence.toFixed(2)} url=${url}`,
        );
    }

    return result;
}

export { generateSearchUrl, getAvailableCities, normalizeCityName, findBestCityMatch };

export default {
    interpret,
    interpretInBackground,
    generateSearchUrl,
    getAvailableCities,
    normalizeCityName,
    findBestCityMatch,
};
