import('dotenv/config').then(async () => {
  const mongoose = await import('mongoose');
  await mongoose.default.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME });
  const { PricingClient, GetProductsCommand } = await import('@aws-sdk/client-pricing');
  
  const client = new PricingClient({
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
  });

  // Test eu-west-1 with exact location string
  const command = new GetProductsCommand({
    ServiceCode: 'AmazonEC2',
    Filters: [
      { Type: 'TERM_MATCH', Field: 'instanceType',    Value: 't3.micro' },
      { Type: 'TERM_MATCH', Field: 'location',        Value: 'EU (Ireland)' },
      { Type: 'TERM_MATCH', Field: 'operatingSystem', Value: 'Linux' },
      { Type: 'TERM_MATCH', Field: 'tenancy',         Value: 'Shared' },
      { Type: 'TERM_MATCH', Field: 'capacitystatus',  Value: 'Used' },
      { Type: 'TERM_MATCH', Field: 'preInstalledSw',  Value: 'NA' },
    ],
    MaxResults: 1,
  });

  const data = await client.send(command);
  console.log('eu-west-1 result count:', data.PriceList?.length);
  if (data.PriceList?.length > 0) {
    const p = JSON.parse(data.PriceList[0]);
    console.log('Location in response:', p.product.attributes.location);
  }
  process.exit(0);
})
