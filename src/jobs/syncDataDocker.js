/**
 * syncDataDocker.js
 *
 * Imports a PostgreSQL dump into a Docker-based database.
 * Steps: copy dump → truncate → restore → KPIs → city2tour_flat → search suggestions → sitemaps → flush cache.
 *
 * Usage: npm run import-data-docker
 * (After building: node build/jobs/syncDataDocker.js)
 *
 * Requires a `zuugle_postgresql.dump` file in the working directory.
 * See also: syncDataDockerDownload.js (downloads the dump first).
 */

import {
    writeKPIs,
    truncateAll,
    restoreDump,
    copyDump,
    populateCity2TourFlat,
    refreshSearchSuggestions,
    generateSitemaps,
} from "./sync.js";
import cacheService from "../services/cache.js";
import logger from "../utils/logger";

async function main() {
    logger.info("Copy dump to container");
    await copyDump("zuugle_postgresql.dump", "/tmp/zuugle_postgresql.dump");

    logger.info("Truncate tables");
    await truncateAll();

    logger.info("Restore from database dump (this will take a while)");
    await restoreDump();

    logger.info("Write KPIs");
    await writeKPIs();

    logger.info("Populate city2tour_flat");
    await populateCity2TourFlat();

    logger.info("Refresh search suggestions");
    await refreshSearchSuggestions();

    logger.info("Generate sitemaps");
    await generateSitemaps();

    logger.info("Flushing cache...");
    await cacheService.flush();
    logger.info("Cache flushed. Database ready!");
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        logger.error("Error during sync:", err);
        process.exit(1);
    });
