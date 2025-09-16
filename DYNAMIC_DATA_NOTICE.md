# 🚨 DYNAMIC DATA SOURCE NOTICE

## Medical MCP Server - No Hardcoded Data

This Medical MCP Server is designed to provide **100% dynamic medical information** by querying live medical databases and APIs. **NO hardcoded medical data is used anywhere in the system.**

## 📊 Data Sources

All medical information is retrieved dynamically from these live sources:

### 1. **FDA API** (Food and Drug Administration)

- **Purpose**: Drug labeling, safety information, warnings
- **Endpoint**: `https://api.fda.gov/drug/label.json`
- **Data**: Real-time drug information, contraindications, adverse effects
- **Freshness**: Depends on FDA database updates

### 2. **PubMed API** (National Library of Medicine)

- **Purpose**: Medical literature, research articles, clinical studies
- **Endpoint**: `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/`
- **Data**: Latest medical research, diagnostic criteria, treatment guidelines
- **Freshness**: Real-time as articles are published and indexed

### 3. **WHO Global Health Observatory API**

- **Purpose**: Global health statistics and indicators
- **Endpoint**: `https://apps.who.int/gho/athena/api/`
- **Data**: Population health metrics, mortality rates, disease prevalence
- **Freshness**: Updated as WHO releases new data

### 4. **RxNorm API** (National Library of Medicine)

- **Purpose**: Standardized drug nomenclature
- **Endpoint**: `https://rxnav.nlm.nih.gov/REST/`
- **Data**: Drug name standardization, clinical drug information
- **Freshness**: Updated with new drug approvals and nomenclature changes

### 5. **Google Scholar** (Enhanced Web Scraping)

- **Purpose**: Academic research discovery
- **Method**: Advanced dynamic web scraping with anti-detection measures
- **Data**: Additional research articles, citations, journal information
- **Freshness**: Real-time search results
- **Features**: User agent rotation, random viewports, stealth configuration

### 6. **Cochrane Library** (Web Scraping)

- **Purpose**: Systematic reviews and evidence-based medicine
- **Method**: Dynamic web scraping
- **Data**: Cochrane reviews, systematic reviews, meta-analyses
- **Freshness**: Real-time search results

### 7. **ClinicalTrials.gov** (API)

- **Purpose**: Clinical trial information
- **Endpoint**: `https://clinicaltrials.gov/api/v2/studies`
- **Data**: Clinical trial protocols, study information, sponsor details
- **Freshness**: Real-time as trials are registered

### 8. **Top Medical Journals** (Enhanced Scraping)

- **Purpose**: High-quality medical research
- **Journals**: NEJM, JAMA, Lancet, BMJ, Nature Medicine
- **Method**: Journal-specific Google Scholar searches
- **Data**: Latest research from top-tier medical journals
- **Freshness**: Real-time search results

## ⚠️ Important Warnings

### **Network Dependency**

- **REQUIRED**: Internet connectivity for all medical information
- **Impact**: System will return empty results if APIs are unavailable
- **Fallback**: No hardcoded fallback data - system fails gracefully

### **Data Freshness**

- **Variable**: Depends on source database update schedules
- **FDA**: Updated as new drugs are approved or safety alerts issued
- **PubMed**: Updated as new research is published and indexed
- **WHO**: Updated periodically with new health statistics
- **RxNorm**: Updated with new drug nomenclature

### **API Rate Limits**

- **PubMed**: 3 requests per second without API key
- **FDA**: No official rate limit, but reasonable use expected
- **WHO**: No official rate limit
- **Google Scholar**: Subject to anti-bot measures

## 🔍 What This Means

### **For Users:**

1. **Always Current**: Information reflects the latest available data
2. **No Stale Data**: No risk of outdated hardcoded information
3. **Comprehensive**: Access to vast medical databases
4. **Transparent**: Source of information is always disclosed

### **For Developers:**

1. **No Maintenance**: No need to update hardcoded medical data
2. **Scalable**: Can handle any medical query through live APIs
3. **Reliable**: Uses authoritative medical sources
4. **Extensible**: Easy to add new data sources

## 🚨 Safety Considerations

### **Data Accuracy**

- Information comes from authoritative medical sources
- However, API data may have errors or be incomplete
- Always verify critical information through multiple sources

### **Clinical Use**

- **NEVER** use this system as the sole basis for clinical decisions
- **ALWAYS** consult qualified healthcare professionals
- **ALWAYS** verify information through official medical resources

### **System Reliability**

- System performance depends on external API availability
- Network issues may cause temporary unavailability
- No offline functionality - requires internet connection

## 📋 System Architecture

```
User Query → MCP Server → Live API Calls → Medical Databases
                ↓
         Dynamic Processing → Real-time Results → User
```

**No hardcoded data layer exists in this architecture.**

## ✅ Verification

To verify this system uses no hardcoded data:

1. **Search the codebase** for any hardcoded medical information
2. **Check API calls** - all data comes from live endpoints
3. **Review error messages** - they indicate dynamic search failures, not missing hardcoded data
4. **Test offline** - system returns empty results when APIs are unavailable

## 🆕 New Enhanced Scrapers

### **Comprehensive Medical Database Search**
- **Tool**: `search-medical-databases`
- **Sources**: PubMed, Google Scholar, Cochrane Library, ClinicalTrials.gov
- **Features**: Parallel searching, duplicate removal, comprehensive results
- **Use Case**: Broad medical research queries

### **Top Medical Journals Search**
- **Tool**: `search-medical-journals`
- **Sources**: NEJM, JAMA, Lancet, BMJ, Nature Medicine
- **Features**: Journal-specific searches, high-quality research focus
- **Use Case**: Latest research from top-tier medical journals

### **Enhanced Google Scholar Scraper**
- **Features**: 
  - User agent rotation (4 different browsers)
  - Random viewport sizes
  - Stealth configuration to avoid detection
  - Multiple selector strategies for different layouts
  - Enhanced data extraction with better patterns
  - Quality filtering and content length limits

## 🔄 Continuous Updates

This system automatically benefits from:

- New drug approvals (FDA)
- Latest medical research (PubMed)
- Updated health statistics (WHO)
- New drug nomenclature (RxNorm)
- Recent academic publications (Google Scholar)
- New systematic reviews (Cochrane Library)
- New clinical trials (ClinicalTrials.gov)
- Latest research from top medical journals

**No manual updates required for medical data content.**
