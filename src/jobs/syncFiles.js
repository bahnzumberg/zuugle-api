/**
 * syncFiles.js
 *
 * Generates GPX track files, connection GPX files, GPX preview images,
 * and copies range images. Flushes the cache when done.
 *
 * Usage: npm run import-files
 * (After building: node build/jobs/syncFiles.js)
 */

import { syncConnectionGPX, syncGPX, syncGPXImage, copyRangeImage } from "./sync";
import cacheService from "../services/cache.js";
import logger from "../utils/logger";

async function main() {
    logger.info("Create GPX files...");
    await syncGPX();
    logger.info("Done GPX files");

    logger.info("Create GPX connection files...");
    await syncConnectionGPX("dev");
    logger.info("Done GPX connection files");

    logger.info("Create GPX image files...");
    await syncGPXImage();
    logger.info("Done GPX image files");

    logger.info("Copy range image files...");
    await copyRangeImage();
    logger.info("Done range image files");

    logger.info("Flushing cache...");
    await cacheService.flush();
    logger.info("Cache flushed");
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        logger.error("Error during file sync:", err);
        process.exit(1);
    });
