// Seed data emulating the 4 external datasets (Google Sheets tabs:
// FootTraffic, SpendingRange, SupplierMap, NearbyPOI), keyed by zone_id.
// The sheets adapter serves these when no live Sheets credentials are set,
// through the same interface the future API clients will implement.

export const ZONES = [
  {
    zone_id: 'thonglor',
    label: 'Thonglor (Sukhumvit 55)',
    center: { lat: 13.7262, lng: 100.5783 },
    foot_traffic: {
      weekday_hourly: [12, 8, 5, 4, 6, 18, 45, 90, 130, 110, 95, 140, 180, 150, 120, 115, 130, 170, 210, 230, 200, 150, 90, 40],
      weekend_hourly: [20, 14, 9, 6, 6, 10, 22, 45, 80, 120, 160, 200, 230, 220, 200, 190, 200, 230, 260, 280, 250, 190, 120, 60],
      peak_note: 'Evening-heavy zone; strong Fri–Sat nightlife traffic'
    },
    spending_range: { avg_income_thb: 85000, avg_spend_per_visit_thb: 450, bracket: 'high' },
    suppliers: [
      { name: 'Thonglor Fresh Market', category: 'produce', lat: 13.7301, lng: 100.5771 },
      { name: 'Makro Food Service Ekkamai', category: 'wholesale', lat: 13.7212, lng: 100.5889 },
      { name: 'K. Somchai Seafood Supply', category: 'seafood', lat: 13.7245, lng: 100.5741 },
      { name: 'Bangkok Beverage Distribution', category: 'beverage', lat: 13.7288, lng: 100.5825 }
    ],
    poi: {
      competitors: [
        { name: 'Casual Thai Bistro 55', category: 'restaurant', lat: 13.7268, lng: 100.5791 },
        { name: 'Izakaya Ren', category: 'restaurant', lat: 13.7274, lng: 100.5779 },
        { name: 'Brunch Club Thonglor', category: 'cafe', lat: 13.7251, lng: 100.5795 },
        { name: 'Seoul Grill House', category: 'restaurant', lat: 13.7239, lng: 100.5772 },
        { name: 'The Salad Concept', category: 'restaurant', lat: 13.7280, lng: 100.5802 }
      ],
      transit: [
        { name: 'BTS Thong Lo', category: 'bts', lat: 13.7242, lng: 100.5783 },
        { name: 'Thonglor Bus Stop (Soi 10)', category: 'bus', lat: 13.7295, lng: 100.5788 }
      ],
      anchors: [
        { name: 'The Commons Thonglor', category: 'mall', lat: 13.7332, lng: 100.5806 },
        { name: 'Donki Mall Thonglor', category: 'mall', lat: 13.7295, lng: 100.5842 },
        { name: 'Samitivej Sukhumvit Hospital', category: 'hospital', lat: 13.7331, lng: 100.5747 }
      ],
      retail: [
        { name: 'Thonglor Art Space Boutique', category: 'retail', lat: 13.7270, lng: 100.5786 },
        { name: 'Vintage Vinyl Records', category: 'retail', lat: 13.7259, lng: 100.5776 },
        { name: 'Blossom Flower Studio', category: 'retail', lat: 13.7283, lng: 100.5793 },
        { name: 'Urban Barber Co.', category: 'retail', lat: 13.7247, lng: 100.5787 }
      ],
      schools: [{ name: 'Wells International School Thonglor', category: 'school', lat: 13.7223, lng: 100.5813 }],
      hospitals: [{ name: 'Samitivej Sukhumvit Hospital', category: 'hospital', lat: 13.7331, lng: 100.5747 }]
    }
  },
  {
    zone_id: 'ekkamai',
    label: 'Ekkamai (Sukhumvit 63)',
    center: { lat: 13.7196, lng: 100.5852 },
    foot_traffic: {
      weekday_hourly: [8, 6, 4, 3, 5, 15, 40, 85, 110, 90, 80, 120, 150, 130, 100, 95, 110, 150, 180, 190, 170, 120, 70, 30],
      weekend_hourly: [15, 10, 7, 5, 5, 8, 18, 35, 60, 95, 130, 165, 190, 185, 170, 160, 170, 195, 220, 235, 210, 160, 100, 50],
      peak_note: 'Similar to Thonglor but ~15% lighter; strong dinner trade'
    },
    spending_range: { avg_income_thb: 72000, avg_spend_per_visit_thb: 380, bracket: 'upper-mid' },
    suppliers: [
      { name: 'Makro Food Service Ekkamai', category: 'wholesale', lat: 13.7212, lng: 100.5889 },
      { name: 'Ekkamai Butcher & Deli Supply', category: 'meat', lat: 13.7188, lng: 100.5871 },
      { name: 'Green Farm Organics BKK', category: 'produce', lat: 13.7231, lng: 100.5903 }
    ],
    poi: {
      competitors: [
        { name: 'Wattana Panich Beef Noodle', category: 'restaurant', lat: 13.7249, lng: 100.5857 },
        { name: 'Ekkamai Craft Kitchen', category: 'restaurant', lat: 13.7201, lng: 100.5844 },
        { name: 'One Ounce for Onion Cafe', category: 'cafe', lat: 13.7223, lng: 100.5891 }
      ],
      transit: [
        { name: 'BTS Ekkamai', category: 'bts', lat: 13.7197, lng: 100.5851 },
        { name: 'Ekkamai Bus Terminal (Eastern)', category: 'bus', lat: 13.7199, lng: 100.5856 }
      ],
      anchors: [
        { name: 'Gateway Ekamai', category: 'mall', lat: 13.7194, lng: 100.5849 },
        { name: 'Major Cineplex Sukhumvit', category: 'entertainment', lat: 13.7191, lng: 100.5842 }
      ],
      retail: [
        { name: 'Ekkamai Design Store', category: 'retail', lat: 13.7208, lng: 100.5861 },
        { name: 'Sneaker Loft 63', category: 'retail', lat: 13.7215, lng: 100.5848 }
      ],
      schools: [{ name: 'Ekamai International School', category: 'school', lat: 13.7166, lng: 100.5878 }],
      hospitals: [{ name: 'Sukhumvit Hospital', category: 'hospital', lat: 13.7186, lng: 100.5901 }]
    }
  },
  {
    zone_id: 'ari',
    label: 'Ari (Phahonyothin 7)',
    center: { lat: 13.7797, lng: 100.5427 },
    foot_traffic: {
      weekday_hourly: [5, 4, 3, 3, 6, 25, 60, 110, 95, 70, 65, 130, 160, 120, 85, 80, 95, 140, 165, 150, 110, 70, 40, 15],
      weekend_hourly: [10, 7, 5, 4, 5, 10, 25, 55, 90, 130, 160, 185, 200, 190, 170, 155, 150, 160, 175, 165, 130, 90, 55, 25],
      peak_note: 'Lunch + weekend brunch zone; office crowd on weekdays'
    },
    spending_range: { avg_income_thb: 58000, avg_spend_per_visit_thb: 280, bracket: 'mid' },
    suppliers: [
      { name: 'Ari Morning Market', category: 'produce', lat: 13.7812, lng: 100.5419 },
      { name: 'Phahonyothin Dry Goods Co.', category: 'dry-goods', lat: 13.7778, lng: 100.5445 },
      { name: 'Coffee Roasters Collective (B2B)', category: 'beverage', lat: 13.7804, lng: 100.5451 }
    ],
    poi: {
      competitors: [
        { name: 'Lay Lao Ari', category: 'restaurant', lat: 13.7801, lng: 100.5422 },
        { name: 'Ongtong Khaosoi', category: 'restaurant', lat: 13.7795, lng: 100.5433 },
        { name: 'Guss Damn Good Ice Cream', category: 'cafe', lat: 13.7788, lng: 100.5418 },
        { name: 'Salt Ari Bistro', category: 'restaurant', lat: 13.7809, lng: 100.5437 }
      ],
      transit: [{ name: 'BTS Ari', category: 'bts', lat: 13.7797, lng: 100.5446 }],
      anchors: [
        { name: 'La Villa Ari', category: 'mall', lat: 13.7793, lng: 100.5449 },
        { name: 'IBM Thailand HQ (office anchor)', category: 'office', lat: 13.7818, lng: 100.5458 }
      ],
      retail: [
        { name: 'Ari Vintage Closet', category: 'retail', lat: 13.7803, lng: 100.5424 },
        { name: 'Paper Plane Stationery', category: 'retail', lat: 13.7791, lng: 100.5429 }
      ],
      schools: [{ name: 'Anuban Sam Sen Kindergarten', category: 'school', lat: 13.7822, lng: 100.5411 }],
      hospitals: [{ name: 'Phyathai 2 Hospital', category: 'hospital', lat: 13.7719, lng: 100.5389 }]
    }
  },
  {
    zone_id: 'silom',
    label: 'Silom / Sala Daeng',
    center: { lat: 13.7268, lng: 100.5238 },
    foot_traffic: {
      weekday_hourly: [10, 7, 5, 4, 8, 30, 80, 160, 210, 180, 160, 240, 280, 220, 170, 160, 190, 240, 220, 180, 140, 100, 60, 25],
      weekend_hourly: [15, 10, 7, 5, 6, 10, 20, 40, 70, 100, 130, 160, 175, 165, 150, 140, 150, 170, 185, 175, 150, 110, 70, 35],
      peak_note: 'Weekday office-lunch powerhouse; quieter weekends'
    },
    spending_range: { avg_income_thb: 65000, avg_spend_per_visit_thb: 250, bracket: 'mid' },
    suppliers: [
      { name: 'Bang Rak Fresh Market', category: 'produce', lat: 13.7241, lng: 100.5175 },
      { name: 'Silom Restaurant Supply Co.', category: 'equipment', lat: 13.7255, lng: 100.5261 },
      { name: 'Charoen Wholesale Foods', category: 'wholesale', lat: 13.7282, lng: 100.5289 }
    ],
    poi: {
      competitors: [
        { name: 'Somtam Der Sala Daeng', category: 'restaurant', lat: 13.7275, lng: 100.5344 },
        { name: 'Silom Lunchbox Express', category: 'restaurant', lat: 13.7262, lng: 100.5241 },
        { name: 'Convent Road Noodle Bar', category: 'restaurant', lat: 13.7251, lng: 100.5289 },
        { name: 'Office Canteen 9F (Silom Complex)', category: 'food-court', lat: 13.7285, lng: 100.5346 }
      ],
      transit: [
        { name: 'BTS Sala Daeng', category: 'bts', lat: 13.7285, lng: 100.5347 },
        { name: 'MRT Si Lom', category: 'mrt', lat: 13.7292, lng: 100.5365 },
        { name: 'BTS Chong Nonsi', category: 'bts', lat: 13.7239, lng: 100.5294 }
      ],
      anchors: [
        { name: 'Silom Complex', category: 'mall', lat: 13.7287, lng: 100.5344 },
        { name: 'Lumpini Park', category: 'park', lat: 13.7314, lng: 100.5417 },
        { name: 'United Center Tower (offices)', category: 'office', lat: 13.7259, lng: 100.5321 }
      ],
      retail: [
        { name: 'Silom Optical House', category: 'retail', lat: 13.7266, lng: 100.5252 },
        { name: 'Patpong Night Market stalls', category: 'retail', lat: 13.7279, lng: 100.5312 }
      ],
      schools: [{ name: 'Assumption Convent School', category: 'school', lat: 13.7228, lng: 100.5182 }],
      hospitals: [{ name: 'BNH Hospital', category: 'hospital', lat: 13.7263, lng: 100.5359 }]
    }
  },
  {
    zone_id: 'phrom_phong',
    label: 'Phrom Phong (Sukhumvit 24–39)',
    center: { lat: 13.7305, lng: 100.5697 },
    foot_traffic: {
      weekday_hourly: [10, 7, 5, 4, 6, 16, 42, 88, 125, 115, 105, 150, 175, 155, 130, 125, 140, 175, 195, 205, 180, 135, 85, 38],
      weekend_hourly: [18, 12, 8, 6, 6, 9, 20, 42, 78, 118, 155, 195, 225, 215, 195, 185, 190, 215, 240, 250, 225, 175, 110, 55],
      peak_note: 'Mall-driven all-day traffic; large Japanese expat base'
    },
    spending_range: { avg_income_thb: 92000, avg_spend_per_visit_thb: 520, bracket: 'high' },
    suppliers: [
      { name: 'UFM Baking Supply Sukhumvit', category: 'bakery', lat: 13.7318, lng: 100.5672 },
      { name: 'Nihon Foods Import (B2B)', category: 'import', lat: 13.7291, lng: 100.5724 },
      { name: 'Klong Toei Wholesale Market', category: 'produce', lat: 13.7183, lng: 100.5636 }
    ],
    poi: {
      competitors: [
        { name: 'Sushi Masa 33', category: 'restaurant', lat: 13.7312, lng: 100.5688 },
        { name: 'Emquartier Food Hall vendors', category: 'food-court', lat: 13.7311, lng: 100.5698 },
        { name: 'Bistro 39 Garden', category: 'restaurant', lat: 13.7297, lng: 100.5711 }
      ],
      transit: [{ name: 'BTS Phrom Phong', category: 'bts', lat: 13.7305, lng: 100.5697 }],
      anchors: [
        { name: 'EmQuartier', category: 'mall', lat: 13.7311, lng: 100.5698 },
        { name: 'Emporium', category: 'mall', lat: 13.7297, lng: 100.5690 },
        { name: 'Benjasiri Park', category: 'park', lat: 13.7302, lng: 100.5680 }
      ],
      retail: [
        { name: 'K Village lifestyle shops', category: 'retail', lat: 13.7255, lng: 100.5679 },
        { name: 'Sukhumvit 31 Gallery Row', category: 'retail', lat: 13.7331, lng: 100.5674 }
      ],
      schools: [{ name: 'NIST International School', category: 'school', lat: 13.7419, lng: 100.5622 }],
      hospitals: [{ name: 'Bangkok Hospital (Soi Soonvijai)', category: 'hospital', lat: 13.7472, lng: 100.5843 }]
    }
  }
];

export function findZone(zoneId) {
  return ZONES.find((z) => z.zone_id === zoneId) || null;
}

// Resolve the nearest zone to a coordinate (grid-cell style lookup).
export function nearestZone(lat, lng) {
  let best = null;
  let bestD = Infinity;
  for (const z of ZONES) {
    const d = (z.center.lat - lat) ** 2 + (z.center.lng - lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = z;
    }
  }
  return best;
}

// Fuzzy match a typed area string ("Thonglor, Bangkok") to a zone.
export function matchZoneByName(area) {
  const q = String(area || '').toLowerCase();
  const aliases = {
    thonglor: ['thonglor', 'thong lo', 'sukhumvit 55'],
    ekkamai: ['ekkamai', 'ekamai', 'sukhumvit 63'],
    ari: ['ari', 'phahonyothin', 'aree'],
    silom: ['silom', 'sala daeng', 'saladaeng', 'bang rak'],
    phrom_phong: ['phrom phong', 'prompong', 'phromphong', 'sukhumvit 24', 'sukhumvit 39', 'emquartier']
  };
  for (const [zoneId, names] of Object.entries(aliases)) {
    if (names.some((n) => q.includes(n))) return findZone(zoneId);
  }
  return null;
}
