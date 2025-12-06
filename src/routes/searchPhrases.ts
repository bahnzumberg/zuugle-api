import express from "express";
import knex from "../knex";
import { searchPhrasesQuerySchema } from "../schemas/searchPhrasesQuery.schema";

const router = express.Router();
router.get("/", async (req, res) => {
  const parsed = searchPhrasesQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    // TODO: test what this looks like on the client side
    return res.status(400).json({ errors: parsed.error.message });
  }

  const { search, city, language, tld } = parsed.data;

  const items = await createQuery(
    "phrase",
    "search_phrase",
    city || "",
    search,
    language || "",
    tld || "",
  );

  return res.status(200).json({ success: true, items });
});

//queries through the database table "logsearchphrase" and returns the phrases that start with the search phrase
const createQuery = async (
  field: string,
  alias: string,
  city: string,
  search: string,
  language: string,
  tld: string,
) => {
  let query = knex("logsearchphrase")
    .select(knex.raw("MIN(??) as ??", [field, alias])) // shortest original phrase
    .count("* as CNT")
    .whereNot(field, null)
    .andWhereNot(field, "")
    .andWhere("country_code", tld);

  if (!!city && city.length > 0 && city != "null") {
    query = query.andWhere("city_slug", city);
  }

  if (!!language && language.length > 0) {
    query = query.andWhere("menu_lang", language);
  }

  query = query.andWhereRaw(`search_time > CURRENT_DATE - INTERVAL '12 MONTH'`);

  const normalizedField = `LOWER(TRIM(${field}))`;
  const searchTerm = `${search.trim().toLowerCase()}%`;

  query = query.andWhereRaw(`${normalizedField} LIKE ?`, [searchTerm]);

  const queryResult = await query
    .groupByRaw(normalizedField)
    .orderBy(`CNT`, `desc`)
    .orderBy(alias, `asc`)
    .limit(5);

  const result = queryResult.map((entry) => {
    return {
      // @ts-expect-error TODO: fix at later time
      suggestion: entry[alias],
    };
  });
  return result;
};
export default router;
