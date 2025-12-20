## 2025-12-15 - SQL Injection in Tours API

**Vulnerability:** SQL Injection in `src/routes/tours.js` (`getWrapper` and `totalWrapper`) due to string interpolation in `knex.raw`.
**Learning:** `knex.raw` does not automatically sanitize template literals. Dynamic query construction for `UNION` and `WHERE` clauses requires careful binding management.
**Prevention:** Always use parameterized queries (`?`) and pass bindings array to `knex.raw`. Validate input where possible.

## 2025-12-17 - Additional SQL Injection in Tours Connections

**Vulnerability:** SQL Injection in `src/routes/tours.js` (`connectionsExtendedWrapper`) due to string interpolation of `id` and `city` in `knex.raw`.
**Learning:** The pattern of using template literals in `knex.raw` was pervasive. Input validation for `req.params` was also missing.
**Prevention:** Audit all `knex.raw` usages. Enforce parameterization and type checking (e.g., `parseInt`).

## 2025-02-18 - Vulnerable Dynamic WHERE Clause Construction

**Vulnerability:** Massive SQL Injection vulnerability in `listWrapper` (`src/routes/tours.js`) where multiple filters (`city`, `search`, `map`, `poi`) were directly interpolated into SQL strings.
**Learning:** Complex dynamic query builders often resort to string concatenation, which is dangerous. The complexity of constructing the SQL string matched with bindings array order makes refactoring risky but necessary.
**Prevention:** Use query builder methods (`knex('table').where(...)`) whenever possible instead of raw SQL. If raw SQL is needed, use a structured approach to collect SQL fragments and bindings simultaneously to ensure they stay in sync.
