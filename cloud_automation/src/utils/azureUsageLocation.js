/**
 * Map Azure region / display name → ISO 3166-1 alpha-2 usageLocation for Graph licenses.
 * Microsoft requires a valid two-letter country code before assignLicense.
 */

const DEFAULT_USAGE_LOCATION = String(process.env.AZURE_LICENSE_USAGE_LOCATION || 'IN')
  .trim()
  .toUpperCase()
  .slice(0, 2) || 'IN';

/** Azure ARM region name (lowercase, no spaces) → country code */
const ARM_REGION_TO_COUNTRY = {
  australiacentral: 'AU',
  australiacentral2: 'AU',
  australiaeast: 'AU',
  australiasoutheast: 'AU',
  austriacentral: 'AT',
  belgiumcentral: 'BE',
  brazilsouth: 'BR',
  brazilsoutheast: 'BR',
  canadacentral: 'CA',
  canadaeast: 'CA',
  centralindia: 'IN',
  centralus: 'US',
  chilecentral: 'CL',
  denmarkeast: 'DK',
  eastasia: 'HK',
  eastus: 'US',
  eastus2: 'US',
  eastus3: 'US',
  eastusstg: 'US',
  francecentral: 'FR',
  francesouth: 'FR',
  germanynorth: 'DE',
  germanywestcentral: 'DE',
  indonesiaeast: 'ID',
  israelcentral: 'IL',
  italynorth: 'IT',
  japaneast: 'JP',
  japanwest: 'JP',
  jioindiacentral: 'IN',
  jioindiawest: 'IN',
  koreacentral: 'KR',
  koreasouth: 'KR',
  malaysiawest: 'MY',
  mexicocentral: 'MX',
  newzealandnorth: 'NZ',
  northcentralus: 'US',
  northeurope: 'IE',
  norwayeast: 'NO',
  norwaywest: 'NO',
  polandcentral: 'PL',
  qatarcentral: 'QA',
  southafricanorth: 'ZA',
  southafricawest: 'ZA',
  southcentralus: 'US',
  southcentralusstg: 'US',
  southeastasia: 'SG',
  southindia: 'IN',
  spaincentral: 'ES',
  swedencentral: 'SE',
  switzerlandnorth: 'CH',
  switzerlandwest: 'CH',
  uaecentral: 'AE',
  uaenorth: 'AE',
  uksouth: 'GB',
  ukwest: 'GB',
  westcentralus: 'US',
  westeurope: 'NL',
  westindia: 'IN',
  westus: 'US',
  westus2: 'US',
  westus3: 'US'
};

/** Loose display-name keywords → country (checked after ARM map) */
const DISPLAY_KEYWORD_TO_COUNTRY = [
  [/south\s*africa/i, 'ZA'],
  [/australia/i, 'AU'],
  [/austria/i, 'AT'],
  [/belgium/i, 'BE'],
  [/brazil/i, 'BR'],
  [/canada/i, 'CA'],
  [/chile/i, 'CL'],
  [/denmark/i, 'DK'],
  [/france/i, 'FR'],
  [/germany/i, 'DE'],
  [/hong\s*kong|east\s*asia/i, 'HK'],
  [/india/i, 'IN'],
  [/indonesia/i, 'ID'],
  [/ireland|north\s*europe/i, 'IE'],
  [/israel/i, 'IL'],
  [/italy/i, 'IT'],
  [/japan/i, 'JP'],
  [/korea/i, 'KR'],
  [/malaysia/i, 'MY'],
  [/mexico/i, 'MX'],
  [/netherlands|west\s*europe/i, 'NL'],
  [/new\s*zealand/i, 'NZ'],
  [/norway/i, 'NO'],
  [/poland/i, 'PL'],
  [/qatar/i, 'QA'],
  [/singapore|southeast\s*asia/i, 'SG'],
  [/spain/i, 'ES'],
  [/sweden/i, 'SE'],
  [/switzerland/i, 'CH'],
  [/united\s*arab|uae|dubai/i, 'AE'],
  [/united\s*kingdom|\buk\b/i, 'GB'],
  [/united\s*states|\busa\b|\bus\b/i, 'US']
];

const isValidUsageLocation = (value) => /^[A-Z]{2}$/.test(String(value || '').trim().toUpperCase());

/**
 * Normalize any Azure location / country hint to a Graph usageLocation code.
 */
const resolveUsageLocation = (locationHint) => {
  const raw = String(locationHint || '').trim();
  if (!raw) {
    return DEFAULT_USAGE_LOCATION;
  }

  const upper = raw.toUpperCase();
  if (isValidUsageLocation(upper)) {
    return upper;
  }

  const armKey = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (ARM_REGION_TO_COUNTRY[armKey]) {
    return ARM_REGION_TO_COUNTRY[armKey];
  }

  for (const [pattern, country] of DISPLAY_KEYWORD_TO_COUNTRY) {
    if (pattern.test(raw)) {
      return country;
    }
  }

  return DEFAULT_USAGE_LOCATION;
};

module.exports = {
  DEFAULT_USAGE_LOCATION,
  isValidUsageLocation,
  resolveUsageLocation
};
