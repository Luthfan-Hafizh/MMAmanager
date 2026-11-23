// Countries, the eight regions of the sport and the name culture of each country.
// `talent` is how many fighters a scene produces relative to the rest of its region.

export type RegionId = "na" | "sa" | "we" | "ee" | "ea" | "af" | "wa" | "oc";

export interface RegionDef {
  id: RegionId;
  name: string;
  short: string;
}

export const REGIONS: Record<RegionId, RegionDef> = {
  na: { id: "na", name: "North America", short: "N. America" },
  sa: { id: "sa", name: "South America", short: "S. America" },
  we: { id: "we", name: "Western Europe", short: "W. Europe" },
  ee: { id: "ee", name: "Eastern Europe & Central Asia", short: "E. Europe" },
  ea: { id: "ea", name: "East & Southeast Asia", short: "Asia" },
  af: { id: "af", name: "Africa", short: "Africa" },
  wa: { id: "wa", name: "Middle East & South Asia", short: "Middle East" },
  oc: { id: "oc", name: "Oceania", short: "Oceania" },
};
export const REGION_IDS = Object.keys(REGIONS) as RegionId[];

export interface CountryDef {
  code: string;
  name: string;
  region: RegionId;
  culture: string;
  /** Second culture and its share of the population of fighters. */
  alt?: [string, number];
  talent: number;
  cities: string[];
}

const C = (code: string, name: string, region: RegionId, culture: string, talent: number, cities: string, alt?: [string, number]): CountryDef => ({
  code,
  name,
  region,
  culture,
  talent,
  cities: cities.split("|"),
  alt,
});

export const COUNTRY_LIST: CountryDef[] = [
  // North America
  C("US", "United States", "na", "anglo", 40, "Las Vegas|Los Angeles|New York|Miami|Denver|Albuquerque|Phoenix|Houston|Chicago|Philadelphia|Atlanta|San Jose|Sacramento|Boston|Nashville|Salt Lake City|Columbus|Milwaukee|Newark|Kansas City|San Diego|Dallas", ["hispanic", 0.2]),
  C("CA", "Canada", "na", "anglo", 5, "Toronto|Montreal|Vancouver|Edmonton|Calgary|Winnipeg", ["french", 0.3]),
  C("MX", "Mexico", "na", "hispanic", 6, "Mexico City|Tijuana|Guadalajara|Monterrey|Puebla"),
  C("PR", "Puerto Rico", "na", "hispanic", 0.8, "San Juan|Ponce"),
  C("CU", "Cuba", "na", "hispanic", 1.4, "Havana|Santiago de Cuba"),
  C("DO", "Dominican Republic", "na", "hispanic", 0.6, "Santo Domingo"),
  C("JM", "Jamaica", "na", "anglo", 0.6, "Kingston|Montego Bay"),
  C("PA", "Panama", "na", "hispanic", 0.4, "Panama City"),
  C("CR", "Costa Rica", "na", "hispanic", 0.3, "San José"),
  C("GT", "Guatemala", "na", "hispanic", 0.3, "Guatemala City"),
  // South America
  C("BR", "Brazil", "sa", "brazil", 30, "São Paulo|Rio de Janeiro|Curitiba|Belo Horizonte|Manaus|Salvador|Recife|Fortaleza|Florianópolis|Porto Alegre|Belém|Natal|Goiânia|Brasília"),
  C("AR", "Argentina", "sa", "hispanic", 3, "Buenos Aires|Córdoba|Rosario|Mendoza"),
  C("CL", "Chile", "sa", "hispanic", 1.5, "Santiago|Valparaíso"),
  C("PE", "Peru", "sa", "hispanic", 2, "Lima|Arequipa|Cusco"),
  C("CO", "Colombia", "sa", "hispanic", 1.2, "Bogotá|Medellín|Cali"),
  C("VE", "Venezuela", "sa", "hispanic", 1.5, "Caracas|Maracaibo|Valencia"),
  C("EC", "Ecuador", "sa", "hispanic", 1.4, "Quito|Guayaquil|Chone"),
  C("UY", "Uruguay", "sa", "hispanic", 0.5, "Montevideo"),
  C("PY", "Paraguay", "sa", "hispanic", 0.4, "Asunción"),
  C("BO", "Bolivia", "sa", "hispanic", 0.3, "La Paz|Santa Cruz"),
  // Western Europe
  C("GB-ENG", "England", "we", "anglo", 10, "London|Manchester|Liverpool|Birmingham|Leeds|Nottingham|Newcastle|Bristol|Sheffield"),
  C("GB-SCT", "Scotland", "we", "anglo", 2, "Glasgow|Edinburgh|Aberdeen"),
  C("GB-WLS", "Wales", "we", "anglo", 1.5, "Cardiff|Swansea|Newport"),
  C("GB-NIR", "Northern Ireland", "we", "irish", 0.7, "Belfast|Derry"),
  C("IE", "Ireland", "we", "irish", 2.5, "Dublin|Cork|Limerick|Galway"),
  C("FR", "France", "we", "french", 7, "Paris|Marseille|Lyon|Nice|Toulouse|Bordeaux|Lille|Nantes", ["arabic", 0.2]),
  C("DE", "Germany", "we", "german", 5, "Berlin|Hamburg|Munich|Cologne|Frankfurt|Düsseldorf|Stuttgart", ["turkish", 0.15]),
  C("NL", "Netherlands", "we", "dutch", 3, "Amsterdam|Rotterdam|The Hague|Utrecht|Eindhoven", ["arabic", 0.15]),
  C("BE", "Belgium", "we", "dutch", 1.5, "Brussels|Antwerp|Liège|Ghent", ["french", 0.4]),
  C("ES", "Spain", "we", "spanish", 3, "Madrid|Barcelona|Valencia|Seville|Alicante|Bilbao"),
  C("PT", "Portugal", "we", "brazil", 1, "Lisbon|Porto"),
  C("IT", "Italy", "we", "italian", 3, "Rome|Milan|Naples|Turin|Bologna"),
  C("CH", "Switzerland", "we", "german", 1, "Zurich|Geneva|Basel", ["french", 0.3]),
  C("AT", "Austria", "we", "german", 1, "Vienna|Graz|Salzburg"),
  C("SE", "Sweden", "we", "nordic", 2.5, "Stockholm|Gothenburg|Malmö"),
  C("NO", "Norway", "we", "nordic", 1, "Oslo|Bergen"),
  C("DK", "Denmark", "we", "nordic", 1, "Copenhagen|Aarhus"),
  C("FI", "Finland", "we", "nordic", 0.8, "Helsinki|Tampere"),
  C("IS", "Iceland", "we", "nordic", 0.4, "Reykjavík"),
  C("GR", "Greece", "we", "greek", 0.8, "Athens|Thessaloniki"),
  // Eastern Europe and Central Asia
  C("RU", "Russia", "ee", "russian", 22, "Moscow|Saint Petersburg|Makhachkala|Grozny|Kazan|Yekaterinburg|Krasnodar|Novosibirsk|Ufa|Kaspiysk", ["caucasus", 0.55]),
  C("PL", "Poland", "ee", "polish", 6, "Warsaw|Kraków|Łódź|Gdańsk|Wrocław|Poznań|Szczecin"),
  C("CZ", "Czechia", "ee", "czech", 2.5, "Prague|Brno|Ostrava"),
  C("SK", "Slovakia", "ee", "czech", 1, "Bratislava|Košice"),
  C("UA", "Ukraine", "ee", "russian", 4, "Kyiv|Kharkiv|Odesa|Lviv|Dnipro"),
  C("BY", "Belarus", "ee", "russian", 1.2, "Minsk|Brest"),
  C("LT", "Lithuania", "ee", "baltic", 0.8, "Vilnius|Kaunas"),
  C("LV", "Latvia", "ee", "baltic", 0.4, "Riga"),
  C("EE", "Estonia", "ee", "baltic", 0.3, "Tallinn"),
  C("RO", "Romania", "ee", "romanian", 1, "Bucharest|Cluj-Napoca|Iași"),
  C("MD", "Moldova", "ee", "romanian", 0.6, "Chișinău"),
  C("BG", "Bulgaria", "ee", "balkan", 0.8, "Sofia|Plovdiv|Varna"),
  C("RS", "Serbia", "ee", "balkan", 1, "Belgrade|Novi Sad|Niš"),
  C("HR", "Croatia", "ee", "balkan", 1.2, "Zagreb|Split|Rijeka"),
  C("BA", "Bosnia and Herzegovina", "ee", "balkan", 0.6, "Sarajevo|Mostar"),
  C("ME", "Montenegro", "ee", "balkan", 0.3, "Podgorica"),
  C("MK", "North Macedonia", "ee", "balkan", 0.3, "Skopje"),
  C("AL", "Albania", "ee", "balkan", 0.4, "Tirana"),
  C("SI", "Slovenia", "ee", "balkan", 0.3, "Ljubljana"),
  C("HU", "Hungary", "ee", "hungarian", 0.6, "Budapest|Debrecen"),
  C("GE", "Georgia", "ee", "georgian", 2.5, "Tbilisi|Batumi|Kutaisi"),
  C("AM", "Armenia", "ee", "armenian", 1.5, "Yerevan|Gyumri"),
  C("AZ", "Azerbaijan", "ee", "caucasus", 1.5, "Baku|Ganja"),
  C("KZ", "Kazakhstan", "ee", "central", 3, "Almaty|Astana|Shymkent|Karaganda"),
  C("KG", "Kyrgyzstan", "ee", "central", 2, "Bishkek|Osh"),
  C("UZ", "Uzbekistan", "ee", "central", 2, "Tashkent|Samarkand|Bukhara"),
  C("TJ", "Tajikistan", "ee", "persian", 1.2, "Dushanbe"),
  C("TM", "Turkmenistan", "ee", "central", 0.3, "Ashgabat"),
  // East and Southeast Asia
  C("JP", "Japan", "ea", "japanese", 6, "Tokyo|Osaka|Yokohama|Nagoya|Saitama|Fukuoka|Sapporo|Kobe"),
  C("KR", "South Korea", "ea", "korean", 3, "Seoul|Busan|Incheon|Daegu"),
  C("CN", "China", "ea", "chinese", 7, "Beijing|Shanghai|Chengdu|Shenzhen|Guangzhou|Hohhot|Xi'an|Kunming"),
  C("TW", "Taiwan", "ea", "chinese", 0.5, "Taipei|Kaohsiung"),
  C("HK", "Hong Kong", "ea", "chinese", 0.2, "Hong Kong"),
  C("MN", "Mongolia", "ea", "mongolian", 1.5, "Ulaanbaatar|Erdenet"),
  C("PH", "Philippines", "ea", "filipino", 2, "Manila|Baguio|Cebu|Davao"),
  C("TH", "Thailand", "ea", "thai", 2, "Bangkok|Phuket|Chiang Mai|Pattaya"),
  C("VN", "Vietnam", "ea", "vietnamese", 0.6, "Ho Chi Minh City|Hanoi"),
  C("ID", "Indonesia", "ea", "malay", 1, "Jakarta|Denpasar|Surabaya|Bandung"),
  C("MY", "Malaysia", "ea", "malay", 0.6, "Kuala Lumpur|Penang"),
  C("SG", "Singapore", "ea", "chinese", 0.4, "Singapore"),
  C("MM", "Myanmar", "ea", "burmese", 0.4, "Yangon|Mandalay|Hakha"),
  // Africa
  C("NG", "Nigeria", "af", "westafrican", 3, "Lagos|Abuja|Ibadan|Port Harcourt"),
  C("CM", "Cameroon", "af", "francoafrican", 2, "Douala|Yaoundé"),
  C("ZA", "South Africa", "af", "southafrican", 3, "Johannesburg|Cape Town|Durban|Pretoria"),
  C("CD", "DR Congo", "af", "francoafrican", 1.5, "Kinshasa|Lubumbashi"),
  C("GH", "Ghana", "af", "westafrican", 0.8, "Accra|Kumasi"),
  C("SN", "Senegal", "af", "francoafrican", 1.5, "Dakar|Thiès"),
  C("CI", "Ivory Coast", "af", "francoafrican", 0.6, "Abidjan"),
  C("MA", "Morocco", "af", "arabic", 2, "Casablanca|Rabat|Marrakesh|Tangier"),
  C("DZ", "Algeria", "af", "arabic", 1, "Algiers|Oran"),
  C("TN", "Tunisia", "af", "arabic", 0.8, "Tunis|Sfax"),
  C("EG", "Egypt", "af", "arabic", 1.5, "Cairo|Alexandria"),
  C("KE", "Kenya", "af", "eastafrican", 0.5, "Nairobi|Mombasa"),
  C("AO", "Angola", "af", "brazil", 0.5, "Luanda"),
  C("ZW", "Zimbabwe", "af", "southafrican", 0.4, "Harare|Bulawayo"),
  C("UG", "Uganda", "af", "eastafrican", 0.3, "Kampala"),
  // Middle East and South Asia
  C("AE", "United Arab Emirates", "wa", "arabic", 1, "Abu Dhabi|Dubai|Sharjah"),
  C("SA", "Saudi Arabia", "wa", "arabic", 1, "Riyadh|Jeddah"),
  C("BH", "Bahrain", "wa", "arabic", 0.5, "Manama"),
  C("KW", "Kuwait", "wa", "arabic", 0.4, "Kuwait City"),
  C("JO", "Jordan", "wa", "arabic", 0.6, "Amman"),
  C("LB", "Lebanon", "wa", "arabic", 0.6, "Beirut"),
  C("IQ", "Iraq", "wa", "arabic", 0.8, "Baghdad|Erbil|Basra"),
  C("SY", "Syria", "wa", "arabic", 0.4, "Damascus|Aleppo"),
  C("IR", "Iran", "wa", "persian", 2.5, "Tehran|Mashhad|Tabriz|Isfahan"),
  C("TR", "Türkiye", "wa", "turkish", 2, "Istanbul|Ankara|Izmir|Bursa"),
  C("IL", "Israel", "wa", "hebrew", 0.6, "Tel Aviv|Haifa"),
  C("PK", "Pakistan", "wa", "southasian", 1, "Karachi|Lahore|Islamabad"),
  C("IN", "India", "wa", "southasian", 2, "Mumbai|New Delhi|Bengaluru|Chandigarh"),
  C("AF", "Afghanistan", "wa", "persian", 0.8, "Kabul|Herat"),
  // Oceania
  C("AU", "Australia", "oc", "anglo", 6, "Sydney|Melbourne|Brisbane|Perth|Adelaide|Gold Coast"),
  C("NZ", "New Zealand", "oc", "anglo", 2.5, "Auckland|Wellington|Christchurch", ["polynesian", 0.35]),
  C("FJ", "Fiji", "oc", "polynesian", 0.3, "Suva"),
  C("WS", "Samoa", "oc", "polynesian", 0.3, "Apia"),
  C("TO", "Tonga", "oc", "polynesian", 0.3, "Nukuʻalofa"),
  C("PG", "Papua New Guinea", "oc", "polynesian", 0.2, "Port Moresby"),
];

export const COUNTRIES: Record<string, CountryDef> = Object.fromEntries(COUNTRY_LIST.map((c) => [c.code, c]));

const FALLBACK_REGION: Record<string, RegionId> = {};

export function countryOf(code: string): CountryDef {
  return (
    COUNTRIES[code] ?? {
      code,
      name: code,
      region: FALLBACK_REGION[code] ?? "we",
      culture: "anglo",
      talent: 0.1,
      cities: ["Capital"],
    }
  );
}

export function regionOf(code: string): RegionId {
  return countryOf(code).region;
}

export function countriesIn(region: RegionId): CountryDef[] {
  return COUNTRY_LIST.filter((c) => c.region === region);
}

/** Flag image for a country code (flagcdn serves the UK nations as gb-eng and so on). */
export function flagUrl(code: string, width: 20 | 40 | 80 = 40): string {
  return `https://flagcdn.com/w${width}/${code.toLowerCase()}.png`;
}
