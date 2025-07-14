# Medical MCP Server

A Model Context Protocol (MCP) server that provides comprehensive medical information by querying multiple authoritative medical APIs including FDA, WHO, PubMed, and RxNorm.

## Features

This MCP server offers five specialized tools for querying medical information from reliable sources:

### 💊 Drug Information Tools

#### `search-drugs`

Search for drug information using the FDA database.

**Input:**

- `query` (string): Drug name to search for (brand name or generic name)
- `limit` (optional, number): Number of results to return (1-50, default: 10)

**Output:**

- Drug information including brand name, generic name, manufacturer, route, dosage form, and purpose

**Example:**

```
Drug Search Results for "Advil"

Found 1 drug(s)

1. **ADVIL**
   Generic Name: IBUPROFEN
   Manufacturer: PFIZER CONSUMER HEALTHCARE
   Route: ORAL
   Dosage Form: TABLET
   Purpose: For temporary relief of minor aches and pains...
   Last Updated: 20210902
```

#### `get-drug-details`

Get detailed information about a specific drug by NDC (National Drug Code).

**Input:**

- `ndc` (string): National Drug Code (NDC) of the drug

**Output:**

- Comprehensive drug information including warnings, drug interactions, and clinical pharmacology

### 📊 Health Statistics Tools

#### `get-health-statistics`

Get health statistics and indicators from WHO Global Health Observatory.

**Input:**

- `indicator` (string): Health indicator to search for (e.g., 'Life expectancy', 'Mortality rate')
- `country` (optional, string): Country code (e.g., 'USA', 'GBR')
- `limit` (optional, number): Number of results to return (1-20, default: 10)

**Output:**

- Health statistics with values, ranges, and temporal data

**Example:**

```
Health Statistics: Life expectancy at birth (years)

Country: USA
Found 10 data points

1. **USA** (2019)
   Value: 78.5 years
   Numeric Value: 78.5
   Date: 2019-12-31
```

### 🔬 Medical Literature Tools

#### `search-medical-literature`

Search for medical research articles in PubMed.

**Input:**

- `query` (string): Medical topic or condition to search for
- `max_results` (optional, number): Maximum number of articles to return (1-20, default: 10)

**Output:**

- Medical research articles with titles, PMIDs, journals, and publication dates

**Example:**

```
Medical Literature Search: "diabetes treatment"

Found 10 article(s)

1. **Novel Approaches to Diabetes Management**
   PMID: 12345678
   Journal: New England Journal of Medicine
   Publication Date: 2024-01-15
```

### 🏥 Drug Nomenclature Tools

#### `search-drug-nomenclature`

Search for drug information using RxNorm (standardized drug nomenclature).

**Input:**

- `query` (string): Drug name to search for in RxNorm database

**Output:**

- Standardized drug information with RxCUI codes, synonyms, and term types

## Installation

1. Clone this repository:

```bash
git clone <repository-url>
cd medical-mcp
```

2. Install dependencies:

```bash
npm install
```

3. Build the project:

```bash
npm run build
```

## Usage

### Running the Server

Start the MCP server:

```bash
npm start
```

The server runs on stdio and can be connected to any MCP-compatible client.

### Example Queries

Here are some example queries you can make with this MCP server:

#### Search for Drug Information

```json
{
  "tool": "search-drugs",
  "arguments": {
    "query": "Tylenol",
    "limit": 5
  }
}
```

#### Get Drug Details by NDC

```json
{
  "tool": "get-drug-details",
  "arguments": {
    "ndc": "00071015527"
  }
}
```

#### Get Health Statistics

```json
{
  "tool": "get-health-statistics",
  "arguments": {
    "indicator": "Life expectancy at birth (years)",
    "country": "USA",
    "limit": 5
  }
}
```

#### Search Medical Literature

```json
{
  "tool": "search-medical-literature",
  "arguments": {
    "query": "COVID-19 treatment",
    "max_results": 10
  }
}
```

#### Search Drug Nomenclature

```json
{
  "tool": "search-drug-nomenclature",
  "arguments": {
    "query": "aspirin"
  }
}
```

## API Endpoints

This MCP server integrates with the following medical APIs:

### FDA API

- `GET /drug/label.json` - Drug labeling information
- Search by brand name, generic name, or NDC
- Provides safety information, warnings, and clinical data

### WHO Global Health Observatory API

- `GET /api/Indicator` - Health statistics and indicators
- Global health data with country-specific information
- Temporal data for trend analysis

### PubMed API

- `GET /esearch.fcgi` - Search for medical articles
- `GET /efetch.fcgi` - Retrieve article details
- Access to millions of medical research papers

### RxNorm API

- `GET /REST/drugs.json` - Standardized drug nomenclature
- Drug name standardization and relationships
- Clinical drug information

## Data Sources

### FDA (Food and Drug Administration)

- **Source**: Official FDA drug labeling database
- **Coverage**: All FDA-approved drugs in the United States
- **Data**: Drug safety, efficacy, dosage, warnings, and interactions
- **Update Frequency**: Real-time as drugs are approved or labeling changes

### WHO (World Health Organization)

- **Source**: Global Health Observatory database
- **Coverage**: Global health statistics from 194 countries
- **Data**: Life expectancy, mortality rates, disease prevalence, and health indicators
- **Update Frequency**: Annual updates with historical data

### PubMed (National Library of Medicine)

- **Source**: MEDLINE database of medical literature
- **Coverage**: Over 30 million citations from medical journals
- **Data**: Research articles, clinical studies, and medical reviews
- **Update Frequency**: Daily updates as new articles are published

### RxNorm (National Library of Medicine)

- **Source**: Standardized drug nomenclature system
- **Coverage**: Clinical drugs available in the United States
- **Data**: Drug names, codes, relationships, and clinical information
- **Update Frequency**: Weekly updates

## Error Handling

The server includes comprehensive error handling:

- Network errors are caught and reported with descriptive messages
- Invalid queries return appropriate error messages
- Rate limiting and API errors are handled gracefully
- Fallback responses when specific APIs are unavailable

## Medical Disclaimer

**Important**: This MCP server provides information from authoritative medical sources but should not be used as a substitute for professional medical advice, diagnosis, or treatment. Always consult with qualified healthcare professionals for medical decisions.

- The information provided is for educational and informational purposes only
- Drug information may not be complete or up-to-date for all medications
- Health statistics are aggregated data and may not reflect individual circumstances
- Medical literature should be interpreted by qualified healthcare professionals

## Dependencies

- `@modelcontextprotocol/sdk` - MCP SDK for server implementation
- `superagent` - HTTP client for API requests
- `zod` - Schema validation for tool parameters

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.
