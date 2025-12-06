import knex, { Knex } from "knex";
import knexConfig from "./knexfile";
import { Database } from "./db/types";

const environment = process.env.NODE_ENV || "development";
const db: Knex<Database> = knex(knexConfig[environment]);

if (!knexConfig[environment]) {
  throw new Error(`Unknown NODE_ENV: ${environment}`);
}

export default db;
