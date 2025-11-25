/**
 * Helper function to build parameter array for SQL queries
 * Collects all non-null parameters in the correct order
 */
export const buildQueryParams = (params) => {
    const result = [];
    for (const param of params) {
        if (param !== null && param !== undefined) {
            result.push(param);
        }
    }
    return result;
};

/**
 * Replaces placeholders in SQL with actual parameter markers
 * and returns both the SQL and parameters array
 */
export const prepareParameterizedQuery = (sql, paramMap) => {
    let parameterizedSql = sql;
    const params = [];

    for (const [placeholder, value] of Object.entries(paramMap)) {
        if (value !== null && value !== undefined) {
            parameterizedSql = parameterizedSql.replace(placeholder, '?');
            params.push(value);
        }
    }

    return { sql: parameterizedSql, params };
};
