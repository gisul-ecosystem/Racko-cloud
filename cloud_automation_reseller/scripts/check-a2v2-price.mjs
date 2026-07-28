const filter = [
  "serviceName eq 'Virtual Machines'",
  "armSkuName eq 'Standard_A2_v2'",
  "armRegionName eq 'westeurope'",
  "priceType eq 'Consumption'",
  "contains(meterName, 'Spot') eq false",
  "contains(productName, 'Windows') eq true",
].join(' and ');

const url = new URL('https://prices.azure.com/api/retail/prices');
url.searchParams.set('$filter', filter);

const res = await fetch(url);
const data = await res.json();
const items = (data.Items || []).map((i) => ({
  productName: i.productName,
  meterName: i.meterName,
  skuName: i.skuName,
  retailPrice: i.retailPrice,
  unitOfMeasure: i.unitOfMeasure,
  type: i.type,
}));

console.log(JSON.stringify({ count: items.length, items }, null, 2));

const hourly = items.filter(
  (i) => i.type === 'Consumption' && i.unitOfMeasure === '1 Hour' && typeof i.retailPrice === 'number'
);
console.log('firstHourlyPick', hourly[0] || null);
console.log(
  'allHourly',
  hourly.map((i) => ({ productName: i.productName, meterName: i.meterName, retailPrice: i.retailPrice }))
);
