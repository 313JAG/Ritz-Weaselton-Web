const RECOMMENDED_CODES = [
  'AAA',
  'GOV',
  'S9R',
  'XYD',
  'IBM',
  'GGL',
  'AMZ',
  'APL',
  'MCO',
  '253151',
  'ACC',
  'DTC',
  'PCW',
  'KPM',
  'ERN',
  'BHP',
];

const DEFAULT_PRESETS = [
  {
    id: 'quick10',
    name: 'Quick 10',
    icon: 'bolt',
    codes: ['AAA', 'GOV', 'S9R', 'IBM', 'GGL', 'AMZ', 'MCO', 'ACC', 'DTC', 'PCW'],
    isDefault: true,
  },
  {
    id: 'tech',
    name: 'Top Tech',
    icon: 'tech',
    codes: ['GGL', 'AMZ', 'APL', 'MCO', '253151', 'IBM', 'ORA', 'SAP', 'CIS'],
    isDefault: true,
  },
  {
    id: 'finance',
    name: 'Finance',
    icon: 'finance',
    codes: ['GS1', '254797', 'JPM', '2743', 'BOA', 'HSB', 'DBK', 'CIT'],
    isDefault: true,
  },
  {
    id: 'big4',
    name: 'Big 4 / Consulting',
    icon: 'consulting',
    codes: ['ACC', 'DTC', 'PCW', 'KPM', 'ERN', 'EYC'],
    isDefault: true,
  },
  {
    id: 'recommended',
    name: 'Recommended',
    icon: 'star',
    codes: [],
    isDefault: true,
    dynamic: 'recommended',
  },
];

const CODE_DISPLAY = {
  BASELINE: 'STD',
};

module.exports = {
  CODE_DISPLAY,
  DEFAULT_PRESETS,
  RECOMMENDED_CODES,
};
