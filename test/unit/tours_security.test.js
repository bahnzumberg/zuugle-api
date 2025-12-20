/* eslint-disable */
import { jest } from "@jest/globals";

// Define mocks before imports
jest.mock("../../src/knex", () => {
    const mKnex = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        whereNotNull: jest.fn().mockReturnThis(),
        first: jest.fn().mockResolvedValue(null),
        raw: jest.fn().mockResolvedValue({ rows: [] }),
        on: jest.fn(),
    };
    // Allow raw to be called directly on the object returned by import
    const fn = () => mKnex;
    Object.assign(fn, mKnex);
    return {
        __esModule: true,
        default: fn,
    };
});

jest.mock("../../src/services/cache.js", () => ({
    __esModule: true,
    default: {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(null),
    },
}));

jest.mock("../../src/utils/gpx/gpxUtils", () => ({
    hashedUrlsFromPoi: jest.fn().mockResolvedValue([]),
    mergeGpxFilesToOne: jest.fn(),
    last_two_characters: jest.fn(),
}));

jest.mock("../../src/utils/utils", () => ({
    get_domain_country: jest.fn().mockReturnValue("AT"),
    isNumber: jest.fn((val) => typeof val === "number"),
    getHost: jest.fn().mockReturnValue("http://localhost"),
    replaceFilePath: jest.fn((p) => p),
    convertDifficulty: jest.fn((d) => d),
    minutesFromMoment: jest.fn(),
}));

jest.mock("fs", () => ({
    createReadStream: jest.fn(),
    existsSync: jest.fn(),
}));
jest.mock("path", () => ({
    join: jest.fn(),
    resolve: jest.fn(),
}));
jest.mock("moment", () => {
    const fn = () => ({
        format: () => "2023-01-01",
        add: () => ({ format: () => "2023-01-01" }),
        set: () => ({ format: () => "2023-01-01" }),
        isBefore: () => false,
    });
    return fn;
});
jest.mock("moment-timezone", () => {
    const fn = () => ({
        tz: () => ({ format: () => "2023-01-01" }),
    });
    return fn;
});

import router from "../../src/routes/tours";
import knex from "../../src/knex";

describe("Tours Route Security", () => {
    let listHandler;

    beforeAll(() => {
        // Find the listWrapper handler attached to GET /
        const layer = router.stack.find((l) => {
            return l.route && l.route.path === "/" && l.route.methods["get"];
        });
        if (!layer) {
            throw new Error("Could not find GET / handler in tours router");
        }
        listHandler = layer.route.stack[0].handle;
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("listWrapper uses parameterized queries for city parameter", async () => {
        const req = {
            query: {
                city: "'; DROP TABLE users; --",
                domain: "www.zuugle.at",
            },
        };
        const res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn(),
            setHeader: jest.fn(),
        };

        await listHandler(req, res);

        // Check calls to knex.raw
        const calls = knex.raw.mock.calls;

        const injectionPayload = "'; DROP TABLE users; --";
        let injectionFoundInSql = false;

        calls.forEach((call) => {
            const sql = call[0];

            // If the SQL string contains the payload, it's vulnerable
            if (typeof sql === "string" && sql.includes(injectionPayload)) {
                injectionFoundInSql = true;
            }
        });

        if (injectionFoundInSql) {
            throw new Error(
                "SQL Injection vulnerability detected! Payload found directly in SQL string.",
            );
        }
    });
});
