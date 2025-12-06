import express from "express";
import { get_domain_country } from "../utils/utils";
import { citiesQuerySchema } from "../schemas/citiesQuery.schema";
import { getCitiesByCountry } from "../repositories/city.repository";

const router = express.Router();

router.get("/", async (req, res) => {
  const parsed = citiesQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.message });
  }

  const city_country = get_domain_country(parsed.data.domain);
  const cities = await getCitiesByCountry(city_country);

  // map to value/label pairs for frontend
  const result = cities.map((entry) => {
    return {
      value: entry.city_slug,
      label: entry.city_name,
    };
  });

  res.status(200).json({ success: true, cities: result });
});

export default router;
