/**
 * Escapes a list of values for use in a SQL IN clause.
 * Prevents SQL injection by escaping single quotes.
 *
 * @param {Array} list - Array of values (strings or numbers)
 * @returns {string} - Comma-separated list of quoted values, e.g., "('a', 'b')" or "()"
 */
export const escapeListForSql = (list) => {
    if (!Array.isArray(list) || list.length === 0) {
        return "()";
    }

    const escaped = list.map(item => {
        if (item === null || item === undefined) return '';
        return String(item).replace(/'/g, "''");
    });

    return `('${escaped.join("', '")}')`;
};
