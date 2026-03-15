/**
 * syncDataProd.js
 *
 * Full production data sync pipeline. Fetches tour data from the source
 * database and rebuilds all derived tables, search indexes and sitemaps.
 *
 * Steps: syncTours → syncCities → fixTours → KPIs → city2tour_flat
 *        → search suggestions → sitemaps → providers → flush cache.
 *
 * Usage: npm run import-data
 * (After building: node build/jobs/syncDataProd.js)
 */

import {
    getProvider,
    writeKPIs,
    fixTours,
    syncCities,
    syncTours,
    populateCity2TourFlat,
    refreshSearchSuggestions,
    generateSitemaps,
} from "./sync";
import cacheService from "../services/cache.js";
import logger from "../utils/logger";

async function main() {
    logger.info("FULL LOAD");

    logger.info("Sync tours...");
    await syncTours();
    logger.info("Done sync tours");

    logger.info("Sync cities...");
    await syncCities();
    logger.info("Done sync cities");

    logger.info("Fix tours...");
    await fixTours();
    logger.info("Done fix tours");

    logger.info("Write KPIs...");
    await writeKPIs();
    logger.info("Done writing KPIs");

    logger.info("Populate city2tour_flat...");
    await populateCity2TourFlat();
    logger.info("Done populate city2tour_flat");

    logger.info("Refresh search suggestions...");
    await refreshSearchSuggestions();
    logger.info("Done refresh search suggestions");

    logger.info("Generate sitemaps...");
    await generateSitemaps();
    logger.info("Done generate sitemaps");

    logger.info("Fetch providers...");
    await getProvider();
    logger.info("Done fetch providers");

    // Log cache statistics before flushing
    const stats = await cacheService.getStats();
    if (stats) {
        const total = stats.hits + stats.misses;
        const hitRate = total > 0 ? ((stats.hits / total) * 100).toFixed(1) : 0;
        logger.info(
            `Cache stats (previous day): hits=${stats.hits}, misses=${stats.misses}, hit_rate=${hitRate}%`,
        );
    } else {
        logger.info("Cache stats: unavailable");
    }

    await cacheService.flush();
    logger.info("Cache flushed");
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        logger.error("Error during sync:", err);
        process.exit(1);
    });
