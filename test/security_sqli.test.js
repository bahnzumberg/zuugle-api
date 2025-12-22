import request from 'supertest';
import express from 'express';

// Mocks need to be defined in the factory or use require
jest.mock('../src/knex', () => ({
  raw: jest.fn().mockResolvedValue({ rows: [] }),
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  whereNotNull: jest.fn().mockReturnThis(),
  first: jest.fn().mockResolvedValue(null),
  insert: jest.fn().mockResolvedValue(null),
  client: { driver: {} }
}));

jest.mock('../src/services/cache', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(null),
}));

// Mock other utils
jest.mock('../src/utils/gpx/gpxUtils', () => ({
  mergeGpxFilesToOne: jest.fn(),
  last_two_characters: jest.fn(),
  hashedUrlsFromPoi: jest.fn(),
}));
jest.mock('../src/utils/utils', () => ({
  getHost: jest.fn(),
  replaceFilePath: jest.fn(),
  get_domain_country: jest.fn().mockReturnValue('at'),
  isNumber: jest.fn().mockImplementation(n => !isNaN(parseFloat(n)) && isFinite(n)),
}));
jest.mock('../src/utils/dataConversion', () => ({
  convertDifficulty: jest.fn(),
}));
jest.mock('../src/utils/helper', () => ({
  minutesFromMoment: jest.fn(),
}));

// Import the mocked module to access the mocks
import knex from '../src/knex';
import toursRouter from '../src/routes/tours';

const app = express();
app.use(express.json());
app.use('/api/tours', toursRouter);

describe('Security: SQL Injection in Tours Filter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should PREVENT SQL injection in ranges filter', async () => {
    // Payload that attempts SQL injection
    // JSON: { ranges: ["x') OR 1=1 --"] }
    // Vulnerable code produces: AND t.range IN ('x') OR 1=1 --')
    // Fixed code produces:      AND t.range IN ('x'') OR 1=1 --')

    const payload = JSON.stringify({
      ranges: ["x') OR 1=1 --"]
    });

    await request(app)
      .get('/api/tours')
      .query({ filter: payload, city: 'vienna' });

    // Check the calls to knex.raw
    const rawCalls = knex.raw.mock.calls;

    // We expect the SQL to contain the ESCAPED string
    const expectedSafeString = "x'') OR 1=1 --";

    const foundSafe = rawCalls.some(call => {
      const sql = call[0];
      return sql.includes(expectedSafeString);
    });

    if (!foundSafe) {
        console.log("Debug: SQL Calls captured:");
        rawCalls.forEach((c, i) => console.log(`Call ${i}:`, c[0]));
    }

    expect(foundSafe).toBe(true);
  });
});
