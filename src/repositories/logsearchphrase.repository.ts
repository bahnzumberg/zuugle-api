import db from "../knex";
import { Database } from "../db/types";

export type Entry = Database["logsearchphrase"];

export const insertLogsearchphrase = async (entry: Entry): Promise<void> => {
  await db<Entry>("logsearchphrase").insert(entry);
};
