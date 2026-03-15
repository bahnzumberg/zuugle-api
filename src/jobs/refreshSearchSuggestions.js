/**
 * refreshSearchSuggestions.js
 *
 * One-shot script that refreshes the search_suggestions table.
 * Called after deploy on UAT/prod to ensure autocomplete data is up to date.
 *
 * Usage: npm run refresh-search-suggestions
 * (After building: node build/jobs/refreshSearchSuggestions.js)
 */

import { refreshSearchSuggestions } from "./sync.js";
import logger from "../utils/logger";

refreshSearchSuggestions()
    .then(() => {
        logger.info("search_suggestions refreshed successfully.");
        process.exit(0);
    })
    .catch((err) => {
        logger.error("Error refreshing search_suggestions:", err);
        process.exit(1);
    });
