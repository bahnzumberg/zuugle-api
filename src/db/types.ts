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

  city: {
    city_slug: string;
    city_name: string;
    city_country: string;
  };

  // TODO add other tables as needed
}
