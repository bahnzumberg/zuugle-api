/**
 * generateTestdata.js
 *
 * Generates test fixture data for local development and automated tests.
 *
 * Usage: npm run generate-testdata
 * (After building: node build/jobs/generateTestdata.js)
 */

import { generateTestdata } from "./sync";
import logger from "../utils/logger";

logger.info("Generating test data...");
generateTestdata()
    .then(() => {
        logger.info("Done generating test data");
        process.exit(0);
    })
    .catch((err) => {
        logger.error("Error generating test data:", err);
        process.exit(1);
    });
