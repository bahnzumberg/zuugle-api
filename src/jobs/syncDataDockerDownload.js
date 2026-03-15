/**
 * syncDataDockerDownload.js
 *
 * Downloads the latest PostgreSQL dump from the UAT server, then runs
 * syncDataDocker.js to import it into the local Docker database.
 *
 * Usage: npm run import-data-docker-download
 * (After building: node build/jobs/syncDataDockerDownload.js)
 */

import { createWriteStream } from "fs";
import { get } from "https";
import { spawn } from "child_process";
import logger from "../utils/logger";

const DUMP_URL = "https://uat-dump.zuugle.at/zuugle_postgresql.dump";
const DUMP_FILE = "zuugle_postgresql.dump";

function download(url) {
    return new Promise((resolve, reject) => {
        const file = createWriteStream(DUMP_FILE);
        get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                file.close();
                return download(response.headers.location).then(resolve, reject);
            }
            if (response.statusCode !== 200) {
                file.close();
                return reject(new Error(`Download failed with status: ${response.statusCode}`));
            }
            response.pipe(file);
            file.on("finish", () => {
                file.close();
                resolve();
            });
        }).on("error", reject);
    });
}

function runImport() {
    return new Promise((resolve, reject) => {
        const child = spawn("node", ["build/jobs/syncDataDocker.js"], {
            stdio: "inherit",
            cwd: process.cwd(),
        });
        child.on("close", (code) =>
            code === 0 ? resolve() : reject(new Error(`Exit code ${code}`)),
        );
    });
}

async function main() {
    logger.info(`Downloading ${DUMP_URL}...`);
    await download(DUMP_URL);
    logger.info(`Downloaded ${DUMP_FILE}`);

    logger.info("Starting database import...");
    await runImport();
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        logger.error("Error:", err);
        process.exit(1);
    });
