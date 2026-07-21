// Seed pool of "scrapeable" property listings, used by the Property Sourcing
// Agent in mock mode (no live web scraping). Each row mirrors what the
// scrape -> parse -> LLM-extraction pipeline would emit from a real listing
// page, including imperfect rows (missing contact, lower confidence).

export const LISTING_POOL = [
  {
    zone_id: 'thonglor',
    property_name: 'Shophouse Soi Thonglor 13',
    address: '55/13 Soi Thonglor 13, Sukhumvit 55, Watthana, Bangkok',
    lat: 13.7289, lng: 100.5794,
    monthly_rent_thb: 120000, size_sqm: 140, property_type: 'shophouse',
    owner_contact: '081-234-5678',
    source_url: 'https://www.ddproperty.com/en/property/shophouse-thonglor-13-9915521',
    scrape_confidence: 0.92
  },
  {
    zone_id: 'thonglor',
    property_name: 'Ground-floor unit, 72 Courtyard',
    address: '72 Courtyard, Sukhumvit 55, Watthana, Bangkok',
    lat: 13.7304, lng: 100.5801,
    monthly_rent_thb: 145000, size_sqm: 95, property_type: 'mall_unit',
    owner_contact: null,
    source_url: 'https://www.ddproperty.com/en/property/72-courtyard-retail-8804412',
    scrape_confidence: 0.78
  },
  {
    zone_id: 'thonglor',
    property_name: 'Standalone house-cafe conversion',
    address: 'Soi Thonglor 9, Sukhumvit 55, Watthana, Bangkok',
    lat: 13.7276, lng: 100.5769,
    monthly_rent_thb: 95000, size_sqm: 180, property_type: 'standalone',
    owner_contact: '089-555-1122',
    source_url: 'https://bkkcommercial.example.com/listing/tl-house-cafe-2291',
    scrape_confidence: 0.85
  },
  {
    zone_id: 'thonglor',
    property_name: 'Corner retail, Soi Thonglor 5',
    address: 'Soi Thonglor 5, Sukhumvit 55, Watthana, Bangkok',
    lat: 13.7255, lng: 100.5779,
    monthly_rent_thb: 88000, size_sqm: 85, property_type: 'shophouse',
    owner_contact: '062-888-9001',
    source_url: 'https://www.ddproperty.com/en/property/corner-retail-thonglor5-9101777',
    scrape_confidence: 0.88
  },
  {
    zone_id: 'ekkamai',
    property_name: 'Gateway Ekamai G-floor kiosk unit',
    address: 'Gateway Ekamai, 982/22 Sukhumvit Rd, Phra Khanong, Bangkok',
    lat: 13.7194, lng: 100.5850,
    monthly_rent_thb: 65000, size_sqm: 48, property_type: 'mall_unit',
    owner_contact: '02-108-2888',
    source_url: 'https://www.ddproperty.com/en/property/gateway-ekamai-kiosk-7702218',
    scrape_confidence: 0.9
  },
  {
    zone_id: 'ekkamai',
    property_name: 'Ekkamai 10 warehouse-loft restaurant space',
    address: 'Soi Ekkamai 10, Sukhumvit 63, Watthana, Bangkok',
    lat: 13.7229, lng: 100.5878,
    monthly_rent_thb: 110000, size_sqm: 220, property_type: 'standalone',
    owner_contact: null,
    source_url: 'https://bkkcommercial.example.com/listing/ekm-loft-8817',
    scrape_confidence: 0.72
  },
  {
    zone_id: 'ekkamai',
    property_name: 'Shophouse near BTS Ekkamai exit 1',
    address: '63/4 Sukhumvit 63, Phra Khanong Nuea, Bangkok',
    lat: 13.7203, lng: 100.5846,
    monthly_rent_thb: 75000, size_sqm: 110, property_type: 'shophouse',
    owner_contact: '085-777-3344',
    source_url: 'https://www.ddproperty.com/en/property/shophouse-ekkamai-bts-9944120',
    scrape_confidence: 0.87
  },
  {
    zone_id: 'ari',
    property_name: 'Ari Soi 1 garden shophouse',
    address: 'Soi Ari 1, Phahonyothin Rd, Phaya Thai, Bangkok',
    lat: 13.7801, lng: 100.5419,
    monthly_rent_thb: 55000, size_sqm: 120, property_type: 'shophouse',
    owner_contact: '081-909-2210',
    source_url: 'https://www.ddproperty.com/en/property/ari-garden-shophouse-6633001',
    scrape_confidence: 0.91
  },
  {
    zone_id: 'ari',
    property_name: 'La Villa Ari 2F food unit',
    address: 'La Villa Ari, Phahonyothin Rd, Phaya Thai, Bangkok',
    lat: 13.7793, lng: 100.5449,
    monthly_rent_thb: 68000, size_sqm: 60, property_type: 'mall_unit',
    owner_contact: '02-613-1777',
    source_url: 'https://retailspace.example.co.th/lavilla-ari-2f-104',
    scrape_confidence: 0.83
  },
  {
    zone_id: 'ari',
    property_name: 'Standalone corner house, Ari Samphan 5',
    address: 'Ari Samphan 5, Phaya Thai, Bangkok',
    lat: 13.7823, lng: 100.5402,
    monthly_rent_thb: 42000, size_sqm: 150, property_type: 'standalone',
    owner_contact: null,
    source_url: 'https://bkkcommercial.example.com/listing/ari-corner-5521',
    scrape_confidence: 0.68
  },
  {
    zone_id: 'silom',
    property_name: 'Silom Soi 20 shophouse (ex-noodle shop)',
    address: 'Silom Soi 20, Bang Rak, Bangkok',
    lat: 13.7248, lng: 100.5221,
    monthly_rent_thb: 60000, size_sqm: 96, property_type: 'shophouse',
    owner_contact: '086-141-5926',
    source_url: 'https://www.ddproperty.com/en/property/silom20-shophouse-5510992',
    scrape_confidence: 0.89
  },
  {
    zone_id: 'silom',
    property_name: 'Silom Complex B1 food court booth',
    address: 'Silom Complex, 191 Silom Rd, Bang Rak, Bangkok',
    lat: 13.7287, lng: 100.5344,
    monthly_rent_thb: 45000, size_sqm: 25, property_type: 'food_court',
    owner_contact: '02-231-3100',
    source_url: 'https://retailspace.example.co.th/silomcomplex-b1-food-17',
    scrape_confidence: 0.86
  },
  {
    zone_id: 'silom',
    property_name: 'Office-retail podium unit, United Center',
    address: 'United Center, 323 Silom Rd, Bang Rak, Bangkok',
    lat: 13.7259, lng: 100.5321,
    monthly_rent_thb: 98000, size_sqm: 130, property_type: 'office_retail',
    owner_contact: null,
    source_url: 'https://www.ddproperty.com/en/property/unitedcenter-podium-7743210',
    scrape_confidence: 0.74
  },
  {
    zone_id: 'phrom_phong',
    property_name: 'Sukhumvit 26 shophouse near K Village',
    address: 'Sukhumvit 26, Khlong Tan, Bangkok',
    lat: 13.7261, lng: 100.5683,
    monthly_rent_thb: 130000, size_sqm: 160, property_type: 'shophouse',
    owner_contact: '081-661-8890',
    source_url: 'https://www.ddproperty.com/en/property/sukhumvit26-shophouse-8890013',
    scrape_confidence: 0.9
  },
  {
    zone_id: 'phrom_phong',
    property_name: 'EmQuartier Helix 7F restaurant unit',
    address: 'EmQuartier, 693 Sukhumvit Rd, Watthana, Bangkok',
    lat: 13.7311, lng: 100.5698,
    monthly_rent_thb: 185000, size_sqm: 105, property_type: 'mall_unit',
    owner_contact: '02-269-1000',
    source_url: 'https://retailspace.example.co.th/emq-helix-7f-22',
    scrape_confidence: 0.88
  },
  {
    zone_id: 'phrom_phong',
    property_name: 'Soi 39 garden villa restaurant space',
    address: 'Sukhumvit Soi 39, Watthana, Bangkok',
    lat: 13.7334, lng: 100.5709,
    monthly_rent_thb: 150000, size_sqm: 240, property_type: 'standalone',
    owner_contact: '092-414-7708',
    source_url: 'https://bkkcommercial.example.com/listing/soi39-villa-3308',
    scrape_confidence: 0.81
  }
];
