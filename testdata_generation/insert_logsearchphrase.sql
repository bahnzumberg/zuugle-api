INSERT INTO logsearchphrase (phrase, num_results, city_slug, menu_lang, country_code)
SELECT
LOWER(a.term) AS phrase,
COUNT(hashed_url) AS num_results,
f.city_slug,
LOWER(a.text_lang) AS menu_lang,
UPPER(city.city_country) AS country_code
FROM (SELECT
		provider,
		hashed_url,
		text_lang,
		REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(unnest(string_to_array(description, ' ')),'.',''),',',''),'!',''),')',''),'(',''),':',''),'"',''),'“','') as "term"
		FROM tour) AS a
INNER JOIN fahrplan AS f
ON f.hashed_url=a.hashed_url
INNER JOIN city
ON f.city_slug=city.city_slug
WHERE LENGTH(a.term)>3
AND f.city_any_connection='yes'
GROUP BY a.term, f.city_slug, a.text_lang, city.city_country
