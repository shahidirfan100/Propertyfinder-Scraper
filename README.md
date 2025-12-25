# PropertyFinder Scraper

<p>
  <strong>Extract property listings from PropertyFinder.ae</strong> – the UAE's leading real estate portal. This actor efficiently scrapes property details including prices, locations, specifications, and agent information.
</p>

<p>
  PropertyFinder.ae is the largest property portal in the UAE with over 500,000 listings. This scraper helps you gather market intelligence, track pricing trends, monitor inventory, and analyze real estate data at scale.
</p>

## What data can you extract?

The PropertyFinder Scraper extracts comprehensive property information:

- **Property Details** – Title, type (apartment, villa, townhouse, etc.), description
- **Pricing** – Sale/rental prices in AED, price per square foot
- **Specifications** – Bedrooms, bathrooms, area (sqft), floor level
- **Location** – Complete address, community, city, emirate
- **Agent Information** – Agent name, company, contact details
- **Listing Metadata** – Posted date, listing ID, verification status
- **URLs** – Direct links to property pages

## Why scrape PropertyFinder.ae?

<ul>
  <li><strong>Market Research</strong> – Analyze pricing trends across different areas and property types</li>
  <li><strong>Competitive Analysis</strong> – Monitor competitor listings and pricing strategies</li>
  <li><strong>Investment Decisions</strong> – Identify investment opportunities based on data-driven insights</li>
  <li><strong>Property Valuation</strong> – Compare similar properties for accurate valuations</li>
  <li><strong>Lead Generation</strong> – Collect agent contact information for business development</li>
  <li><strong>Inventory Tracking</strong> – Monitor property availability in target locations</li>
</ul>

## How to use this actor

### Input Configuration

Configure the scraper using these parameters:

#### Search Parameters

<table>
  <thead>
    <tr>
      <th>Parameter</th>
      <th>Type</th>
      <th>Description</th>
      <th>Example</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>propertyType</code></td>
      <td>String</td>
      <td>Type of property to search</td>
      <td>apartment, villa, townhouse</td>
    </tr>
    <tr>
      <td><code>location</code></td>
      <td>String</td>
      <td>City or emirate to search in</td>
      <td>dubai, abu-dhabi, sharjah</td>
    </tr>
    <tr>
      <td><code>categoryType</code></td>
      <td>Integer</td>
      <td>1 = For Sale, 2 = For Rent</td>
      <td>1</td>
    </tr>
    <tr>
      <td><code>minPrice</code></td>
      <td>Integer</td>
      <td>Minimum price in AED</td>
      <td>500000</td>
    </tr>
    <tr>
      <td><code>maxPrice</code></td>
      <td>Integer</td>
      <td>Maximum price in AED</td>
      <td>2000000</td>
    </tr>
    <tr>
      <td><code>minBedrooms</code></td>
      <td>Integer</td>
      <td>Minimum number of bedrooms</td>
      <td>2</td>
    </tr>
    <tr>
      <td><code>maxBedrooms</code></td>
      <td>Integer</td>
      <td>Maximum number of bedrooms</td>
      <td>4</td>
    </tr>
  </tbody>
</table>

#### Scraping Options

<table>
  <thead>
    <tr>
      <th>Parameter</th>
      <th>Type</th>
      <th>Description</th>
      <th>Default</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>results_wanted</code></td>
      <td>Integer</td>
      <td>Maximum properties to collect</td>
      <td>100</td>
    </tr>
    <tr>
      <td><code>max_pages</code></td>
      <td>Integer</td>
      <td>Maximum search pages to visit</td>
      <td>20</td>
    </tr>
    <tr>
      <td><code>collectDetails</code></td>
      <td>Boolean</td>
      <td>Visit detail pages for full info</td>
      <td>true</td>
    </tr>
    <tr>
      <td><code>startUrl</code></td>
      <td>String</td>
      <td>Custom PropertyFinder search URL</td>
      <td>-</td>
    </tr>
  </tbody>
</table>

### Basic Example

```json
{
  "propertyType": "apartment",
  "location": "dubai",
  "categoryType": 1,
  "minPrice": 1000000,
  "maxPrice": 3000000,
  "minBedrooms": 2,
  "maxBedrooms": 3,
  "results_wanted": 100,
  "collectDetails": true,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"]
  }
}
```

### Advanced Example - Custom URL

```json
{
  "startUrl": "https://www.propertyfinder.ae/en/search?page=1&c=1&fu=0&ob=mr&l=1",
  "results_wanted": 500,
  "max_pages": 50,
  "collectDetails": true,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"]
  }
}
```

### Quick Start Examples

#### Example 1: Villas for Sale in Dubai

```json
{
  "propertyType": "villa",
  "location": "dubai",
  "categoryType": 1,
  "minPrice": 3000000,
  "results_wanted": 200
}
```

#### Example 2: Apartments for Rent in Abu Dhabi

```json
{
  "propertyType": "apartment",
  "location": "abu-dhabi",
  "categoryType": 2,
  "minBedrooms": 1,
  "maxBedrooms": 2,
  "maxPrice": 100000,
  "results_wanted": 150
}
```

#### Example 3: Luxury Properties

```json
{
  "location": "dubai",
  "categoryType": 1,
  "minPrice": 10000000,
  "results_wanted": 50,
  "collectDetails": true
}
```

## Output Format

The actor saves data to the dataset in this structure:

```json
{
  "title": "Spacious 2BR Apartment | Marina View | Prime Location",
  "propertyType": "Apartment",
  "price": "1,850,000 AED",
  "location": "Dubai Marina, Dubai",
  "bedrooms": 2,
  "bathrooms": 2,
  "area": "1,200 sqft",
  "description": "Beautiful 2-bedroom apartment with stunning marina views...",
  "agentName": "John Smith",
  "postedDate": "Posted 2 days ago",
  "url": "https://www.propertyfinder.ae/en/plp/buy/apartment-for-sale-..."
}
```

### Dataset Fields

<table>
  <thead>
    <tr>
      <th>Field</th>
      <th>Type</th>
      <th>Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>title</code></td>
      <td>String</td>
      <td>Property listing title</td>
    </tr>
    <tr>
      <td><code>propertyType</code></td>
      <td>String</td>
      <td>Type of property (apartment, villa, etc.)</td>
    </tr>
    <tr>
      <td><code>price</code></td>
      <td>String</td>
      <td>Price in AED</td>
    </tr>
    <tr>
      <td><code>location</code></td>
      <td>String</td>
      <td>Property location</td>
    </tr>
    <tr>
      <td><code>bedrooms</code></td>
      <td>Integer</td>
      <td>Number of bedrooms</td>
    </tr>
    <tr>
      <td><code>bathrooms</code></td>
      <td>Integer</td>
      <td>Number of bathrooms</td>
    </tr>
    <tr>
      <td><code>area</code></td>
      <td>String</td>
      <td>Property size in square feet</td>
    </tr>
    <tr>
      <td><code>description</code></td>
      <td>String</td>
      <td>Full property description</td>
    </tr>
    <tr>
      <td><code>agentName</code></td>
      <td>String</td>
      <td>Listing agent's name</td>
    </tr>
    <tr>
      <td><code>postedDate</code></td>
      <td>String</td>
      <td>When listing was posted</td>
    </tr>
    <tr>
      <td><code>url</code></td>
      <td>String</td>
      <td>Direct link to property page</td>
    </tr>
  </tbody>
</table>

## Performance and Best Practices

### Proxy Configuration

<blockquote>
  <strong>Important:</strong> Always use proxies when scraping PropertyFinder to avoid IP blocks.
</blockquote>

We recommend using **Residential proxies** for best results:

```json
{
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"]
  }
}
```

### Optimization Tips

<ul>
  <li><strong>Start Small</strong> – Test with low <code>results_wanted</code> values first</li>
  <li><strong>Use Filters</strong> – Apply price and bedroom filters to reduce irrelevant results</li>
  <li><strong>Disable Details</strong> – Set <code>collectDetails: false</code> for faster basic scraping</li>
  <li><strong>Monitor Costs</strong> – Track compute units and proxy usage in the Apify Console</li>
  <li><strong>Schedule Runs</strong> – Use Apify Scheduler for regular data updates</li>
</ul>

### Resource Consumption

<table>
  <thead>
    <tr>
      <th>Properties</th>
      <th>Runtime</th>
      <th>Compute Units</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>100</td>
      <td>~2-3 min</td>
      <td>~0.05</td>
    </tr>
    <tr>
      <td>500</td>
      <td>~8-10 min</td>
      <td>~0.15</td>
    </tr>
    <tr>
      <td>1000</td>
      <td>~15-20 min</td>
      <td>~0.30</td>
    </tr>
  </tbody>
</table>

<p><em>Note: Times vary based on <code>collectDetails</code> setting and proxy speed.</em></p>

## Use Cases

### Real Estate Market Analysis

Monitor pricing trends across different areas:

- Track average prices per square foot
- Identify undervalued properties
- Analyze price changes over time
- Compare different neighborhoods

### Property Portfolio Management

Maintain updated information on your listings:

- Monitor competitor properties
- Track new listings in target areas
- Analyze market saturation
- Identify emerging markets

### Lead Generation

Build databases of agents and properties:

- Extract agent contact information
- Identify active property developers
- Find off-plan project opportunities
- Generate leads for real estate services

### Investment Research

Make data-driven investment decisions:

- Compare rental yields across locations
- Identify high-demand property types
- Analyze supply and demand trends
- Forecast market movements

## Integration and Export

### Export Formats

Export your data in multiple formats:

<ul>
  <li>JSON</li>
  <li>CSV</li>
  <li>Excel (XLSX)</li>
  <li>XML</li>
  <li>RSS Feed</li>
</ul>

### API Access

Access your data programmatically:

```javascript
// Get dataset items
const { ApifyClient } = require('apify-client');
const client = new ApifyClient({ token: 'YOUR_TOKEN' });

const datasetItems = await client.dataset('DATASET_ID').listItems();
```

### Webhooks

Set up webhooks to receive data automatically when the run completes.

## Compliance and Fair Use

<blockquote>
  <strong>Legal Notice:</strong> This actor is provided for legitimate use cases only. Users must comply with PropertyFinder.ae's Terms of Service and applicable laws.
</blockquote>

### Responsible Scraping

<ul>
  <li>Use reasonable rate limiting</li>
  <li>Respect robots.txt directives</li>
  <li>Don't overload the target servers</li>
  <li>Use data for lawful purposes only</li>
  <li>Respect intellectual property rights</li>
</ul>

## Troubleshooting

### Common Issues

<dl>
  <dt><strong>No results returned</strong></dt>
  <dd>
    <ul>
      <li>Check your search parameters are valid</li>
      <li>Verify the location name is correct</li>
      <li>Try widening price ranges</li>
      <li>Ensure proxies are configured</li>
    </ul>
  </dd>

  <dt><strong>Blocked by website</strong></dt>
  <dd>
    <ul>
      <li>Enable Residential proxies</li>
      <li>Reduce concurrency settings</li>
      <li>Add delays between requests</li>
    </ul>
  </dd>

  <dt><strong>Incomplete data</strong></dt>
  <dd>
    <ul>
      <li>Enable <code>collectDetails</code> option</li>
      <li>Check if listings have all information</li>
      <li>Review the property page structure</li>
    </ul>
  </dd>
</dl>

## Support and Resources

### Getting Help

<ul>
  <li>Check the <a href="https://docs.apify.com">Apify Documentation</a></li>
  <li>Visit the <a href="https://community.apify.com">Apify Community Forum</a></li>
  <li>Contact support via the Apify Console</li>
</ul>

### Related Actors

Explore other real estate scrapers:

<ul>
  <li><strong>Bayut Scraper</strong> – Scrape listings from Bayut.com</li>
  <li><strong>Dubizzle Scraper</strong> – Extract data from Dubizzle.com</li>
  <li><strong>Zillow Scraper</strong> – US property data from Zillow</li>
</ul>

## Technical Details

### Architecture

<ul>
  <li><strong>Framework:</strong> Efficient HTTP-based crawler for optimal performance</li>
  <li><strong>Extraction:</strong> JSON-LD structured data with HTML fallback</li>
  <li><strong>Pagination:</strong> Automatic page traversal with configurable limits</li>
  <li><strong>Deduplication:</strong> URL-based duplicate prevention</li>
</ul>

### Data Extraction Methods

1. **JSON-LD Priority** – Extracts structured data when available
2. **HTML Parsing** – Fallback for missing structured data
3. **Hybrid Approach** – Combines both methods for maximum accuracy

## Changelog

### Version 1.0.0

<ul>
  <li>Initial release</li>
  <li>Support for apartments, villas, and townhouses</li>
  <li>JSON-LD and HTML extraction</li>
  <li>Configurable filters and pagination</li>
  <li>Proxy support with Apify Proxy integration</li>
</ul>

---

<p align="center">
  <strong>Built with ❤️ by Shahid Irfan</strong>
</p>

<p align="center">
  <em>Need custom real estate data solutions? Contact us for tailored scraping services.</em>
</p>