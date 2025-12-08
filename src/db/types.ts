export interface Database {
  // add other tables as needed

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

  provider: {
    provider: string;
    provider_name: string;
    allow_gpx_download: boolean;
  };

  tour: {
    id: number;
    url: string;
    provider: string;
    hashed_url: string;
    description: string;
    image_url: string;
    ascent: number;
    descent: number;
    difficulty: number;
    difficulty_orig: string;
    duration: number;
    distance: number;
    title: string;
    type: string;
    number_of_days: number;
    traverse: number;
    country: string;
    state: string;
    range_slug: string;
    range: string;
    season: string;
    jan: boolean;
    feb: boolean;
    mar: boolean;
    apr: boolean;
    may: boolean;
    jun: boolean;
    jul: boolean;
    aug: boolean;
    sep: boolean;
    oct: boolean;
    nov: boolean;
    dec: boolean;
    month_order: number;
    quality_rating: number;
    full_text: string;
    search_column: string; // tsvector column
    ai_search_column: string; // vector
    max_ele: number;
    text_lang: string;
  };

  tour_inactive: {
    id: number;
    url: string;
    provider: string;
    hashed_url: string;
    description: string;
    image_url: string;
    ascent: number;
    descent: number;
    difficulty: number;
    difficulty_orig: string;
    duration: number;
    distance: number;
    title: string;
    type: string;
    number_of_days: number;
    traverse: number;
    country: string;
    state: string;
    range_slug: string;
    range: string;
    last_active: Date;
  };

  kpi: {
    name: string;
    value: number;
  };
}
