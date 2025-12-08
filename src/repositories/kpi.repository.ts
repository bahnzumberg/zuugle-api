import knex from "../knex";

export const getKpiByNames = async (
  names: string[],
): Promise<Record<string, number>> => {
  const rows = await knex("kpi").select("name", "value").whereIn("name", names);
  return Object.fromEntries(rows.map((r) => [r.name, r.value]));
};
