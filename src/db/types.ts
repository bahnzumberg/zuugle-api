export interface Database {
  logsearchphrase: {
    id: number;
    phrase: string;
    num_results: number;
    city_slug: string;
    menu_lang: string;
    country_code: string;
    search_time: Date;
  };

  // TODO add other tables as needed
}
