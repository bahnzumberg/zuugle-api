/**
 * Validation utilities for input sanitization and security
 */

/**
 * Validates and sanitizes a tour ID
 * @param {string|number} id - Tour ID to validate
 * @returns {number|null} - Validated numeric ID or null if invalid
 */
export const validateTourId = (id) => {
    const parsed = parseInt(id, 10);
    if (isNaN(parsed) || parsed < 0) {
        return null;
    }
    return parsed;
};

/**
 * Validates a slug (city, range, etc.)
 * Only allows alphanumeric characters and hyphens
 * @param {string} slug - Slug to validate
 * @returns {string|null} - Validated slug or null if invalid
 */
export const validateSlug = (slug) => {
    if (typeof slug !== 'string') {
        return null;
    }
    // Only allow alphanumeric characters, hyphens, and underscores
    const slugPattern = /^[a-zA-Z0-9_-]+$/;
    if (!slugPattern.test(slug)) {
        return null;
    }
    return slug;
};

/**
 * Validates a search term
 * @param {string} search - Search term to validate
 * @param {number} maxLength - Maximum allowed length (default: 200)
 * @returns {string|null} - Validated search term or null if invalid
 */
export const validateSearchTerm = (search, maxLength = 200) => {
    if (typeof search !== 'string') {
        return null;
    }
    
    // Trim whitespace
    const trimmed = search.trim();
    
    // Check length
    if (trimmed.length === 0 || trimmed.length > maxLength) {
        return null;
    }
    
    return trimmed;
};

/**
 * Validates a GPX key for file access
 * Only allows alphanumeric characters to prevent path traversal
 * @param {string} key - GPX key to validate
 * @returns {string|null} - Validated key or null if invalid
 */
export const validateGpxKey = (key) => {
    if (typeof key !== 'string') {
        return null;
    }
    
    // Only allow alphanumeric characters (no slashes, dots, etc.)
    const keyPattern = /^[a-zA-Z0-9]+$/;
    if (!keyPattern.test(key)) {
        return null;
    }
    
    return key;
};

/**
 * Validates a language code
 * @param {string} lang - Language code to validate
 * @returns {string|null} - Validated language code or null if invalid
 */
export const validateLanguageCode = (lang) => {
    const validLanguages = ['de', 'en', 'it', 'fr', 'sl'];
    if (typeof lang !== 'string' || !validLanguages.includes(lang)) {
        return null;
    }
    return lang;
};

/**
 * Validates a tour type
 * @param {string} type - Tour type to validate
 * @returns {string|null} - Validated type or null if invalid
 */
export const validateTourType = (type) => {
    if (typeof type !== 'string') {
        return null;
    }
    // Allow alphanumeric, underscores, spaces and ampersands (e.g. "Bike & Hike")
    const typePattern = /^[a-zA-Z0-9_ &]+$/;
    if (!typePattern.test(type)) {
        return null;
    }
    return type;
};

/**
 * Validates a provider name
 * @param {string} provider - Provider name to validate
 * @returns {string|null} - Validated provider or null if invalid
 */
export const validateProvider = (provider) => {
    if (typeof provider !== 'string') {
        return null;
    }
    // Allow alphanumeric, hyphens, and underscores
    const providerPattern = /^[a-zA-Z0-9_-]+$/;
    if (!providerPattern.test(provider)) {
        return null;
    }
    return provider;
};

/**
 * Validates a page number
 * @param {string|number} page - Page number to validate
 * @returns {number} - Validated page number (minimum 1)
 */
export const validatePage = (page) => {
    const parsed = parseInt(page, 10);
    if (isNaN(parsed) || parsed < 1) {
        return 1;
    }
    // Limit maximum page to prevent excessive OFFSET
    return Math.min(parsed, 10000);
};

/**
 * Sanitizes a PostgreSQL language code
 * @param {string} lang - Language code
 * @returns {string} - Safe PostgreSQL language code
 */
export const sanitizePostgresLanguage = (lang) => {
    const languageMap = {
        'de': 'german',
        'en': 'english',
        'it': 'italian',
        'fr': 'french',
        'sl': 'simple'
    };
    return languageMap[lang] || 'german';
};
