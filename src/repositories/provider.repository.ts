import db from "../knex";
import { Database } from "../db/types";

export type Provider = Database["provider"];

export const getProvidersByProvider = async (
  provider: Provider["provider"],
): Promise<Provider[]> => {
  return await db<Provider>("provider").where("provider", provider);
};
