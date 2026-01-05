import knex from "../../knex.js";
import cacheService from "../../services/cache.js";
import logger from "../logger.js";

// Cache key for cities list
const CITIES_CACHE_KEY = "interpreter:cities";
const CITIES_CACHE_TTL = 3600; // 1 hour

/**
 * Get list of available city slugs from the database.
 * Results are cached for performance.
 *
 * @returns {Promise<string[]>} Array of city slugs
 */
export async function getAvailableCities() {
    try {
        // Try cache first
        const cached = await cacheService.get(CITIES_CACHE_KEY);
        if (cached && Array.isArray(cached)) {
            return cached;
        }

        // Query database
        const result = await knex("city").select("city_slug").orderBy("city_slug");
        const cities = result.map((row) => row.city_slug);

        // Cache the result
        await cacheService.set(CITIES_CACHE_KEY, cities, CITIES_CACHE_TTL);

        return cities;
    } catch (err) {
        logger.warn("Failed to fetch cities for interpreter:", err.message);
        return [];
    }
}

/**
 * Normalize city name to slug format.
 * Handles umlauts and special characters.
 *
 * @param {string} cityName - The city name to normalize
 * @returns {string} Normalized city slug
 */
export function normalizeCityName(cityName) {
    if (!cityName) return "";

    return (
        cityName
            .toLowerCase()
            .trim()
            // German umlauts
            .replace(/ä/g, "ae")
            .replace(/ö/g, "oe")
            .replace(/ü/g, "ue")
            .replace(/ß/g, "ss")
            // French accents
            .replace(/é/g, "e")
            .replace(/è/g, "e")
            .replace(/ê/g, "e")
            .replace(/à/g, "a")
            .replace(/â/g, "a")
            .replace(/ô/g, "o")
            .replace(/î/g, "i")
            .replace(/û/g, "u")
            .replace(/ç/g, "c")
            // Other common accents
            .replace(/ñ/g, "n")
            .replace(/[^\w\s-]/g, "") // Remove remaining special chars
            .replace(/\s+/g, "-") // Replace spaces with dashes
            .replace(/-+/g, "-")
    ); // Collapse multiple dashes
}

/**
 * Find best matching city from the available cities list.
 * Uses fuzzy matching for typo tolerance.
 *
 * @param {string} searchTerm - The term to match
 * @param {string[]} availableCities - List of available city slugs
 * @returns {string|null} Best matching city slug or null
 */
export function findBestCityMatch(searchTerm, availableCities) {
    if (!searchTerm || !availableCities.length) return null;

    const normalized = normalizeCityName(searchTerm);

    // Exact match
    if (availableCities.includes(normalized)) {
        return normalized;
    }

    // Try without normalization (some cities might be stored with special chars)
    const lowerTerm = searchTerm.toLowerCase().trim();
    if (availableCities.includes(lowerTerm)) {
        return lowerTerm;
    }

    // Partial match (city name is part of a longer slug or vice versa)
    for (const city of availableCities) {
        if (city.includes(normalized) || normalized.includes(city)) {
            return city;
        }
    }

    return null;
}

export default { getAvailableCities, normalizeCityName, findBestCityMatch };
