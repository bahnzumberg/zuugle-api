import db from "../knex";
import { Database } from "../db/types";

export type City = Database["city"];

export const getCitiesByCountry = async (
  country: City["city_country"],
): Promise<City[]> => {
  return db<City>("city").where("city_country", country);
};
