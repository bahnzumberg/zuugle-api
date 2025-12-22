## 2025-12-15 - SQL Injection in Tours API

**Vulnerability:** SQL Injection in `src/routes/tours.js` (`getWrapper` and `totalWrapper`) due to string interpolation in `knex.raw`.
**Learning:** `knex.raw` does not automatically sanitize template literals. Dynamic query construction for `UNION` and `WHERE` clauses requires careful binding management.
**Prevention:** Always use parameterized queries (`?`) and pass bindings array to `knex.raw`. Validate input where possible.

## 2025-12-17 - Additional SQL Injection in Tours Connections

**Vulnerability:** SQL Injection in `src/routes/tours.js` (`connectionsExtendedWrapper`) due to string interpolation of `id` and `city` in `knex.raw`.
**Learning:** The pattern of using template literals in `knex.raw` was pervasive. Input validation for `req.params` was also missing.
**Prevention:** Audit all `knex.raw` usages. Enforce parameterization and type checking (e.g., `parseInt`).

## 2025-02-20 - SQL Injection via JSON Filters

**Vulnerability:** Critical SQL injection in `listWrapper` (`src/routes/tours.js`) where `req.query.filter` values were processed via `JSON.stringify().replace()` and injected directly into SQL `IN` clauses.
**Learning:** The attempt to manually convert JSON arrays to SQL lists using string manipulation was insecure and allowed escaping the query context.
**Prevention:** Use `knex.whereIn` where possible, or if raw SQL is required, ensure rigorous escaping of values (e.g. escaping single quotes) or use bindings.
