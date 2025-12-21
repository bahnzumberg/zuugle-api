export interface Database {
  // add other tables as needed

  logsearchphrase: {
    id?: number;
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

  fahrplan: {
    id: number;
    tour_provider: string;
    hashed_url: string;
    calendar_date: Date;
    weekday: string | null;
    date_any_connection: string;
    city_slug: string;
    city_name: string;
    city_any_connection: string;
    best_connection_duration: string | null;
    connection_rank: number | null;
    connection_departure_datetime: Date | null;
    connection_duration: string | null;
    connection_no_of_transfers: number | null;
    connection_arrival_datetime: Date | null;
    connection_returns_trips_back: number | null;
    connection_returns_min_waiting_duration: string | null;
    connection_returns_max_waiting_duration: string | null;
    connection_returns_warning_level: number;
    connection_returns_warning: string;
    return_row: number | null;
    return_waiting_duration: string | null;
    return_departure_datetime: Date | null;
    return_duration: string | null;
    return_no_of_transfers: number | null;
    return_arrival_datetime: Date | null;
    totour_track_key: number | null;
    totour_track_duration: string | null;
    fromtour_track_key: number | null;
    fromtour_track_duration: string | null;
    connection_description_json: any | null;
    connection_lastregular_arrival_datetime: Date | null;
    return_description_json: any | null;
    return_firstregular_departure_datetime: Date | null;
  };

  kpi: {
    name: string;
    value: number;
  };
}
