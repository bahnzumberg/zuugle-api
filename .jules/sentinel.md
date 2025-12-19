# Sentinel Journal

## 2025-02-18 - SQL Injection in Active Routes
**Vulnerability:** Found widespread SQL Injection in `src/routes/tours.js` where user input (search, range, etc.) was interpolated directly into `knex.raw` queries.
**Learning:** The legacy codebase relies heavily on `knex.raw` for complex queries but failed to use parameter bindings, likely due to the complexity of dynamic WHERE clause construction.
**Prevention:** Implemented a pattern of collecting bindings in arrays (`mainBindings`, `filterBindings`) alongside SQL construction, ensuring all user input is passed as parameters. Future dynamic queries must follow this pattern.
