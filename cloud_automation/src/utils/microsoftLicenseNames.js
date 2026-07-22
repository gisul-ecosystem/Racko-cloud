/**
 * Map Microsoft Graph skuPartNumber → admin-center style product names.
 * Fallback humanizes unknown SKUs (underscores → spaces).
 */
const LICENSE_DISPLAY_NAMES = {
  CCIBOTS_PRIVPREV_VIRAL: 'Copilot Studio Viral Trial',
  ENTERPRISEPREMIUM: 'Office 365 E5',
  ENTERPRISEPACK: 'Office 365 E3',
  FLOW_FREE: 'Microsoft Power Automate Free',
  MDATP_XPLAT: 'Microsoft Defender for Endpoint (servers)',
  Microsoft_Teams_Exploratory_Dept: 'Microsoft Teams Exploratory',
  O365_BUSINESS_ESSENTIALS: 'Microsoft 365 Business Basic',
  O365_BUSINESS_PREMIUM: 'Microsoft 365 Business Standard',
  'Office_365_E1_(no_Teams)': 'Office 365 E1 (no Teams)',
  POWER_BI_STANDARD: 'Microsoft Fabric (Free)',
  POWER_BI_PRO: 'Power BI Pro',
  Power_Pages_vTrial_for_Makers: 'Power Pages Trial for Makers',
  Power_Virtual_Agents: 'Power Virtual Agents',
  POWERAPPS_DEV: 'Power Apps for Developer',
  POWERAPPS_VIRAL: 'Power Apps Plan 2 Trial',
  SPB: 'Microsoft 365 Business Premium',
  STANDARDPACK: 'Office 365 E1',
  STANDARDWOFFPACK: 'Office 365 E2',
  VIRTUAL_AGENT_USL: 'Power Virtual Agents User License',
  SPE_E3: 'Microsoft 365 E3',
  SPE_E5: 'Microsoft 365 E5',
  EMS: 'Enterprise Mobility + Security E3',
  EMSPREMIUM: 'Enterprise Mobility + Security E5',
  PROJECTPREMIUM: 'Project Plan 5',
  PROJECTPROFESSIONAL: 'Project Plan 3',
  VISIOCLIENT: 'Visio Plan 2',
  WIN_DEF_ATP: 'Microsoft Defender for Endpoint',
  MCOEV: 'Microsoft 365 Phone System',
  MCOMEETADV: 'Microsoft 365 Audio Conferencing',
  ATP_ENTERPRISE: 'Microsoft Defender for Office 365 (Plan 1)',
  RIGHTSMANAGEMENT: 'Azure Information Protection Plan 1',
  AAD_PREMIUM: 'Microsoft Entra ID P1',
  AAD_PREMIUM_P2: 'Microsoft Entra ID P2',
  INTUNE_A: 'Microsoft Intune'
};

const humanizeSkuPartNumber = (skuPartNumber) => {
  const raw = String(skuPartNumber || '').trim();
  if (!raw) return 'Microsoft license';

  return raw
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const resolveLicenseDisplayName = (skuPartNumber) => {
  const key = String(skuPartNumber || '').trim();
  if (LICENSE_DISPLAY_NAMES[key]) {
    return LICENSE_DISPLAY_NAMES[key];
  }

  return humanizeSkuPartNumber(key);
};

module.exports = {
  LICENSE_DISPLAY_NAMES,
  humanizeSkuPartNumber,
  resolveLicenseDisplayName
};
