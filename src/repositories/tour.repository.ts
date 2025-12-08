import knex from "../knex";

export const getTourWithFallback = async (
  id: number,
  tld: string,
  city?: string,
): Promise<any> => {
  // Common columns for both active and inactive tours
  const baseColumns = [
    "id",
    "url",
    "provider",
    "hashed_url",
    "description",
    "image_url",
    "ascent",
    "descent",
    "difficulty",
    "difficulty_orig",
    "duration",
    "distance",
    "title",
    "type",
    "number_of_days",
    "traverse",
    "country",
    "state",
    "range_slug",
    "range",
  ];

  const activeTourQuery = knex("tour")
    .select([
      ...baseColumns,
      "season",
      "month_order",
      "quality_rating",
      "max_ele",
      "c2t.min_connection_duration",
      "c2t.min_connection_no_of_transfers",
      "c2t.avg_total_tour_duration",
    ])
    .innerJoin("city2tour as c2t", "c2t.tour_id", "id")
    .where("c2t.reachable_from_country", tld)
    .where("id", id);

  // Best case: active tour WITH city constraint
  if (city) {
    const tourWithCity = await activeTourQuery
      .andWhere("c2t.city_slug", city)
      .first();

    if (tourWithCity) {
      return {
        ...tourWithCity,
        valid_tour: 1,
        avg_total_tour_duration:
          (Math.round(
            ((tourWithCity.avg_total_tour_duration ?? 0) * 100) / 25,
          ) *
            25) /
          100,
      };
    }
  }

  // 2nd best case: Active tour WITHOUT city constraint
  const tourNoCity = await activeTourQuery
    .andWhere("c2t.stop_selector", "y")
    .first();

  if (tourNoCity) {
    return {
      ...tourNoCity,
      valid_tour: 2,
    };
  }

  // Last case: Inactive tour
  const inactiveTour = await knex("tour_inactive")
    .select(baseColumns)
    .where("id", id)
    .first();

  if (inactiveTour) {
    return {
      ...inactiveTour,
      valid_tour: 0,
    };
  }

  return null;
};
