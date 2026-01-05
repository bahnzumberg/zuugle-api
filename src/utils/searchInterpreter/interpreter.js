import rules from "./rules.json" with { type: "json" };

/**
 * Interprets a natural language search query and extracts structured filters.
 *
 * @param {string} query - The user's search query
 * @param {string} currentCity - Already selected city (optional)
 * @param {string} language - Menu language (de, en, it, fr, sl)
 * @param {string[]} availableCities - List of city slugs from DB (optional, for city detection)
 * @returns {Promise<InterpretationResult>}
 */
export async function interpretSearch(
    query,
    currentCity = null,
    language = "de",
    availableCities = [],
) {
    if (!query || query.trim().length === 0) {
        return {
            cleanedQuery: "",
            filters: {},
            entities: [],
            confidence: 0,
        };
    }

    const normalizedQuery = query.toLowerCase().trim();
    const filters = {};
    const entities = [];
    let cleanedQuery = normalizedQuery;

    // 1. Extract patterns (numeric values)
    const patternResult = extractPatterns(normalizedQuery);
    Object.assign(filters, patternResult.filters);
    entities.push(...patternResult.entities);
    cleanedQuery = patternResult.cleanedQuery;

    // 2. Match keywords
    const keywordResult = matchKeywords(cleanedQuery, language);
    Object.assign(filters, keywordResult.filters);
    entities.push(...keywordResult.entities);
    cleanedQuery = keywordResult.cleanedQuery;

    // 3. Detect city (only if not already set)
    if (!currentCity && availableCities.length > 0) {
        const cityResult = detectCity(cleanedQuery, availableCities);
        if (cityResult.city) {
            filters.city_slug = cityResult.city;
            entities.push({ type: "city", value: cityResult.city, source: cityResult.match });
            cleanedQuery = cityResult.cleanedQuery;
        }
    }

    // 4. Calculate confidence
    const confidence = calculateConfidence(entities, normalizedQuery);

    return {
        cleanedQuery: cleanedQuery.trim().replace(/\s+/g, " "),
        filters,
        entities,
        confidence,
    };
}

/**
 * Extracts numeric patterns from query (ascent, duration, travel time)
 */
function extractPatterns(query) {
    const filters = {};
    const entities = [];
    let cleanedQuery = query;

    for (const [category, patterns] of Object.entries(rules.patterns)) {
        for (const pattern of patterns) {
            const regex = new RegExp(pattern.regex, "i");
            const match = query.match(regex);

            if (match) {
                if (pattern.type === "number" && pattern.captureGroup) {
                    const value = parseInt(match[pattern.captureGroup], 10);
                    if (!isNaN(value)) {
                        filters[pattern.extract] = value;
                        entities.push({ type: category, value, source: match[0] });
                        cleanedQuery = cleanedQuery.replace(match[0], " ");

                        // Apply side effects if any
                        if (pattern.sideEffect) {
                            Object.assign(filters, pattern.sideEffect);
                        }
                    }
                } else if (pattern.type === "range" && pattern.captureGroups) {
                    const minVal = parseInt(match[pattern.captureGroups[0]], 10);
                    const maxVal = parseInt(match[pattern.captureGroups[1]], 10);
                    if (!isNaN(minVal) && !isNaN(maxVal)) {
                        filters[pattern.extract[0]] = minVal;
                        filters[pattern.extract[1]] = maxVal;
                        entities.push({
                            type: category,
                            value: `${minVal}-${maxVal}`,
                            source: match[0],
                        });
                        cleanedQuery = cleanedQuery.replace(match[0], " ");
                    }
                } else if (pattern.type === "literal") {
                    filters[pattern.extract] = pattern.value;
                    entities.push({ type: category, value: pattern.value, source: match[0] });
                    cleanedQuery = cleanedQuery.replace(match[0], " ");
                }
            }
        }
    }

    return { filters, entities, cleanedQuery };
}

/**
 * Matches keywords from lookup tables
 */
function matchKeywords(query, language) {
    const filters = {};
    const entities = [];
    let cleanedQuery = query;

    const keywordCategories = ["difficulty", "type", "season", "multiDay", "qualitative"];

    for (const category of keywordCategories) {
        const categoryRules = rules.keywords[category];
        if (!categoryRules) continue;

        // Get language-specific keywords, fallback to German
        const keywords = categoryRules[language] || categoryRules["de"] || {};

        for (const [keyword, mapping] of Object.entries(keywords)) {
            // Check if keyword exists in query (as whole word or phrase)
            const keywordRegex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, "i");
            if (keywordRegex.test(query)) {
                // Apply the mapping
                if (typeof mapping === "object") {
                    Object.assign(filters, mapping);
                } else {
                    // Simple value (e.g., difficulty: 0)
                    filters[category] = mapping;
                }
                entities.push({ type: category, value: keyword, source: keyword });
                cleanedQuery = cleanedQuery.replace(keywordRegex, " ");
            }
        }
    }

    return { filters, entities, cleanedQuery };
}

/**
 * Detects city mentions in query using configured patterns
 */
function detectCity(query, availableCities) {
    for (const city of availableCities) {
        // Try each city pattern
        for (const patternTemplate of rules.cityPatterns) {
            const pattern = patternTemplate.replace("{city}", escapeRegex(city));
            const regex = new RegExp(pattern, "i");
            const match = query.match(regex);

            if (match) {
                return {
                    city,
                    match: match[0],
                    cleanedQuery: query.replace(match[0], " "),
                };
            }
        }

        // Also check for exact city name match (standalone)
        const exactRegex = new RegExp(`\\b${escapeRegex(city)}\\b`, "i");
        if (exactRegex.test(query)) {
            return {
                city,
                match: city,
                cleanedQuery: query.replace(exactRegex, " "),
            };
        }
    }

    return { city: null, match: null, cleanedQuery: query };
}

/**
 * Calculate confidence score based on entities found
 */
function calculateConfidence(entities, originalQuery) {
    if (entities.length === 0) return 0;

    // Calculate how much of the query was "understood"
    const totalSourceLength = entities.reduce((sum, e) => sum + (e.source?.length || 0), 0);
    const queryLength = originalQuery.length;

    // Base confidence on coverage
    let coverage = Math.min(totalSourceLength / queryLength, 1);

    // Boost for having multiple entities
    const entityBonus = Math.min(entities.length * 0.1, 0.3);

    return Math.min(coverage + entityBonus, 1);
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Generate a search URL from interpretation results
 */
export function generateSearchUrl(domain, interpretation) {
    const tld = domain?.split(".")?.pop() || "at";
    const baseUrl = `https://www.zuugle.${tld}/search`;
    const params = new URLSearchParams();

    const filters = interpretation.filters;

    if (filters.city_slug) {
        params.set("city", filters.city_slug);
    }

    // Build filter object for URL
    const urlFilter = {};
    if (filters.maxAscent !== undefined) urlFilter.maxAscent = filters.maxAscent;
    if (filters.minAscent !== undefined) urlFilter.minAscent = filters.minAscent;
    if (filters.maxDuration !== undefined) urlFilter.maxDuration = filters.maxDuration;
    if (filters.minDuration !== undefined) urlFilter.minDuration = filters.minDuration;
    if (filters.maxTransportDuration !== undefined)
        urlFilter.maxTransportDuration = filters.maxTransportDuration;
    if (filters.difficulty !== undefined) urlFilter.difficulties = [filters.difficulty];
    if (filters.type !== undefined) urlFilter.types = [filters.type];
    if (filters.winterSeason !== undefined) urlFilter.winterSeason = filters.winterSeason;
    if (filters.summerSeason !== undefined) urlFilter.summerSeason = filters.summerSeason;
    if (filters.singleDayTour !== undefined) urlFilter.singleDayTour = filters.singleDayTour;
    if (filters.multipleDayTour !== undefined) urlFilter.multipleDayTour = filters.multipleDayTour;
    if (filters.traverse !== undefined) urlFilter.traverse = filters.traverse;

    if (Object.keys(urlFilter).length > 0) {
        params.set("filter", JSON.stringify(urlFilter));
    }

    // Add the cleaned search term
    if (interpretation.cleanedQuery && interpretation.cleanedQuery.trim().length > 0) {
        params.set("search", interpretation.cleanedQuery.trim());
    }

    const queryString = params.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

export default { interpretSearch, generateSearchUrl };
