import {
  DrugLabel,
  GoogleScholarArticle,
  PubMedArticle,
  RxNormDrug,
  WHOIndicator,
  ClinicalGuideline,
  DrugSafetyInfo,
  DrugInteraction,
  DifferentialDiagnosis,
  RiskCalculator,
  LabValue,
  DiagnosticCriteria,
} from "./types.js";
import superagent from "superagent";
import puppeteer from "puppeteer";
import {
  FDA_API_BASE,
  GOOGLE_SCHOLAR_API_BASE,
  PUBMED_API_BASE,
  RXNAV_API_BASE,
  USER_AGENT,
  WHO_API_BASE,
} from "./constants.js";

export async function searchDrugs(
  query: string,
  limit: number = 10,
): Promise<DrugLabel[]> {
  const res = await superagent
    .get(`${FDA_API_BASE}/drug/label.json`)
    .query({
      search: `openfda.brand_name:${query}`,
      limit: limit,
    })
    .set("User-Agent", USER_AGENT);

  return res.body.results || [];
}

export async function getDrugByNDC(ndc: string): Promise<DrugLabel | null> {
  try {
    const res = await superagent
      .get(`${FDA_API_BASE}/drug/label.json`)
      .query({
        search: `openfda.product_ndc:${ndc}`,
        limit: 1,
      })
      .set("User-Agent", USER_AGENT);

    return res.body.results?.[0] || null;
  } catch (error) {
    return null;
  }
}

// WHO API functions
export async function getHealthIndicators(
  indicatorName: string,
  country?: string,
): Promise<WHOIndicator[]> {
  try {
    // First, find the indicator code by searching for the indicator name
    let filter = `contains(IndicatorName, '${indicatorName}')`;

    let res = await superagent
      .get(`${WHO_API_BASE}/Indicator`)
      .query({
        $filter: filter,
        $format: "json",
      })
      .set("User-Agent", USER_AGENT);

    let indicators = res.body.value || [];

    // If no results, try common variations
    if (indicators.length === 0) {
      const variations = getIndicatorVariations(indicatorName);
      for (const variation of variations) {
        filter = `contains(IndicatorName, '${variation}')`;

        res = await superagent
          .get(`${WHO_API_BASE}/Indicator`)
          .query({
            $filter: filter,
            $format: "json",
          })
          .set("User-Agent", USER_AGENT);

        const variationResults = res.body.value || [];
        if (variationResults.length > 0) {
          indicators = variationResults;
          break;
        }
      }
    }

    if (indicators.length === 0) {
      return [];
    }

    // Now fetch actual data for each indicator
    const results: WHOIndicator[] = [];

    for (const indicator of indicators.slice(0, 3)) {
      // Limit to first 3 indicators
      try {
        const indicatorCode = indicator.IndicatorCode;
        let dataFilter = "";
        if (country) {
          dataFilter = `SpatialDim eq '${country}'`;
        }

        const queryParams: any = {
          $format: "json",
          $top: 50, // Limit results
        };

        if (dataFilter) {
          queryParams.$filter = dataFilter;
        }

        const dataRes = await superagent
          .get(`${WHO_API_BASE}/${indicatorCode}`)
          .query(queryParams)
          .set("User-Agent", USER_AGENT);

        const dataValues = dataRes.body.value || [];

        // Group data by country and get the most recent values
        const countryData = new Map();
        dataValues.forEach((item: any) => {
          const country = item.SpatialDim || "Global";
          const year = item.TimeDim || "Unknown";
          const value = item.NumericValue;

          if (value !== null && value !== undefined) {
            if (
              !countryData.has(country) ||
              year > countryData.get(country).year
            ) {
              countryData.set(country, {
                country,
                year,
                value,
                indicator: indicator.IndicatorName,
                unit: item.Unit || "Unknown",
              });
            }
          }
        });

        // Add the data to results with better formatting
        countryData.forEach((data) => {
          // Format the value based on the indicator type
          let formattedValue = data.value;
          let unit = data.unit || "Unknown";

          // Add context based on indicator name
          if (data.indicator.toLowerCase().includes("life expectancy")) {
            unit = "years";
            formattedValue = `${data.value} years`;
          } else if (data.indicator.toLowerCase().includes("mortality")) {
            unit = "per 1000 population";
            formattedValue = `${data.value} per 1000`;
          } else if (data.indicator.toLowerCase().includes("prevalence")) {
            unit = "%";
            formattedValue = `${data.value}%`;
          } else if (data.indicator.toLowerCase().includes("incidence")) {
            unit = "per 100,000 population";
            formattedValue = `${data.value} per 100,000`;
          }

          results.push({
            IndicatorCode: indicator.IndicatorCode,
            IndicatorName: data.indicator,
            SpatialDimType: "Country",
            SpatialDim: data.country,
            TimeDim: data.year.toString(),
            TimeDimType: "Year",
            DataSourceDim: "WHO",
            DataSourceType: "Official",
            Value: formattedValue,
            NumericValue: data.value,
            Low: 0,
            High: 0,
            Comments: `Unit: ${unit} | Year: ${data.year}`,
            Date: new Date().toISOString(),
          });
        });
      } catch (dataError) {
        console.error(
          `Error fetching data for indicator ${indicator.IndicatorCode}:`,
          dataError,
        );
        // Still add the indicator definition even if data fetch fails
        results.push({
          IndicatorCode: indicator.IndicatorCode,
          IndicatorName: indicator.IndicatorName,
          SpatialDimType: "Country",
          SpatialDim: country || "Global",
          TimeDim: "Unknown",
          TimeDimType: "Year",
          DataSourceDim: "WHO",
          DataSourceType: "Official",
          Value: 0,
          NumericValue: 0,
          Low: 0,
          High: 0,
          Comments: "Data not available",
          Date: new Date().toISOString(),
        });
      }
    }

    return results;
  } catch (error) {
    console.error("Error fetching WHO indicators:", error);
    return [];
  }
}

// Helper function to generate common variations of indicator names
function getIndicatorVariations(indicatorName: string): string[] {
  const variations: string[] = [];
  const lower = indicatorName.toLowerCase();

  // Common medical indicator variations
  const commonMappings: { [key: string]: string[] } = {
    "maternal mortality": ["maternal", "mortality", "maternal death"],
    "infant mortality": [
      "infant",
      "mortality",
      "infant death",
      "child mortality",
    ],
    "life expectancy": ["life expectancy", "expectancy", "life"],
    "mortality rate": ["mortality", "death rate", "mortality rate"],
    "birth rate": ["birth", "fertility", "birth rate"],
    "death rate": ["death", "mortality", "death rate"],
    population: ["population", "demographics"],
    "health expenditure": ["health", "expenditure", "spending"],
    immunization: ["immunization", "vaccination", "vaccine"],
    malnutrition: ["malnutrition", "nutrition", "undernutrition"],
    diabetes: ["diabetes", "diabetic"],
    hypertension: ["hypertension", "blood pressure", "high blood pressure"],
    cancer: ["cancer", "neoplasm", "tumor"],
    hiv: ["hiv", "aids", "hiv/aids"],
    tuberculosis: ["tuberculosis", "tb"],
    malaria: ["malaria"],
    obesity: ["obesity", "overweight"],
  };

  // Check for exact matches first
  for (const [key, values] of Object.entries(commonMappings)) {
    if (lower.includes(key)) {
      variations.push(...values);
    }
  }

  // Add the original term and some basic variations
  variations.push(indicatorName);
  variations.push(lower);

  // Remove duplicates
  return [...new Set(variations)];
}

// RxNorm API functions
export async function searchRxNormDrugs(query: string): Promise<RxNormDrug[]> {
  try {
    const res = await superagent
      .get(`${RXNAV_API_BASE}/drugs.json`)
      .query({ name: query })
      .set("User-Agent", USER_AGENT);

    return res.body.drugGroup?.conceptGroup?.[0]?.concept || [];
  } catch (error) {
    return [];
  }
}

// Utility function to add random delay
function randomDelay(min: number, max: number): Promise<void> {
  const delay = Math.random() * (max - min) + min;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

// Enhanced Medical Scraper System - No Hardcoded Data
export async function searchGoogleScholar(
  query: string,
): Promise<GoogleScholarArticle[]> {
  let browser;
  try {
    console.log(`🔍 Scraping Google Scholar for: ${query}`);
    
    // Add random delay to avoid rate limiting
    await randomDelay(2000, 5000);

    // Enhanced browser configuration for better anti-detection
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor",
        "--disable-blink-features=AutomationControlled",
        "--disable-extensions",
        "--disable-plugins",
        "--disable-images",
        "--disable-javascript",
        "--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      ],
    });

    const page = await browser.newPage();

    // Enhanced stealth configuration
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });

    // Random viewport size
    const viewports = [
      { width: 1920, height: 1080 },
      { width: 1366, height: 768 },
      { width: 1440, height: 900 },
      { width: 1536, height: 864 },
    ];
    const randomViewport = viewports[Math.floor(Math.random() * viewports.length)];
    await page.setViewport(randomViewport);

    // Rotate user agents
    const userAgents = [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
    ];
    const randomUA = userAgents[Math.floor(Math.random() * userAgents.length)];
    await page.setUserAgent(randomUA);

    // Enhanced headers
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
      "Accept-Encoding": "gzip, deflate, br",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
    });

    // Navigate to Google Scholar with enhanced query
    const searchUrl = `${GOOGLE_SCHOLAR_API_BASE}?q=${encodeURIComponent(query)}&hl=en&as_sdt=0%2C5&as_ylo=2020`;
    await page.goto(searchUrl, { 
      waitUntil: "networkidle2", 
      timeout: 45000 
    });

    // Wait for results with multiple fallback selectors
    try {
      await page.waitForSelector(".gs_r, .gs_ri, .gs_or, [data-rp]", { timeout: 20000 });
    } catch (error) {
      // Try alternative selectors
      try {
        await page.waitForSelector(".g, .rc, .r", { timeout: 10000 });
      } catch (error2) {
        console.error("No search results found or page structure changed");
        return [];
      }
    }

    // Enhanced data extraction with better selectors
    return await page.evaluate(() => {
      const results: GoogleScholarArticle[] = [];
      
      // Multiple selector strategies for different Google Scholar layouts
      const selectors = [
        ".gs_r, .gs_ri, .gs_or",
        ".g, .rc, .r",
        "[data-rp]",
        ".gs_rt, .gs_ri"
      ];
      
      let articleElements: NodeListOf<Element> | null = null;
      for (const selector of selectors) {
        articleElements = document.querySelectorAll(selector);
        if (articleElements.length > 0) break;
      }

      if (!articleElements || articleElements.length === 0) {
        return results;
      }

      articleElements.forEach((element) => {
        try {
          // Enhanced title extraction
          const titleSelectors = [
            ".gs_rt a, .gs_rt",
            "h3 a, h3",
            "a[data-clk]",
            ".gs_rt a",
            ".rc h3 a",
            ".r h3 a"
          ];
          
          let title = "";
          let url = "";
          for (const selector of titleSelectors) {
            const titleElement = element.querySelector(selector);
            if (titleElement) {
              title = titleElement.textContent?.trim() || "";
              url = (titleElement as HTMLAnchorElement)?.href || "";
              if (title) break;
            }
          }

          // Enhanced authors/venue extraction
          const authorSelectors = [
            ".gs_a, .gs_authors, .gs_venue",
            '[class*="author"]',
            '[class*="venue"]',
            ".gs_a",
            ".rc .s",
            ".r .s"
          ];
          
          let authors = "";
          for (const selector of authorSelectors) {
            const authorElement = element.querySelector(selector);
            if (authorElement) {
              authors = authorElement.textContent?.trim() || "";
              if (authors) break;
            }
          }

          // Enhanced abstract extraction
          const abstractSelectors = [
            ".gs_rs, .gs_rs_a, .gs_snippet",
            '[class*="snippet"]',
            '[class*="abstract"]',
            ".gs_rs",
            ".rc .st",
            ".r .st"
          ];
          
          let abstract = "";
          for (const selector of abstractSelectors) {
            const abstractElement = element.querySelector(selector);
            if (abstractElement) {
              abstract = abstractElement.textContent?.trim() || "";
              if (abstract) break;
            }
          }

          // Enhanced citation extraction
          const citationSelectors = [
            ".gs_fl a, .gs_fl",
            '[class*="citation"]',
            'a[href*="cites"]',
            ".gs_fl",
            ".rc .f",
            ".r .f"
          ];
          
          let citations = "";
          for (const selector of citationSelectors) {
            const citationElement = element.querySelector(selector);
            if (citationElement) {
              citations = citationElement.textContent?.trim() || "";
              if (citations) break;
            }
          }

          // Enhanced year extraction with better patterns
          let year = "";
          const yearPatterns = [
            /(\d{4})/g,
            /\((\d{4})\)/g,
            /(\d{4})\s*[–-]/g,
            /(\d{4})\s*$/g
          ];
          
          const textSources = [authors, title, abstract, citations];
          for (const text of textSources) {
            for (const pattern of yearPatterns) {
              const matches = text.match(pattern);
              if (matches) {
                const years = matches.map(m => m.replace(/\D/g, '')).filter(y => y.length === 4);
                const validYears = years.filter(y => parseInt(y) >= 1900 && parseInt(y) <= new Date().getFullYear() + 1);
                if (validYears.length > 0) {
                  year = validYears[validYears.length - 1]; // Get most recent year
                  break;
                }
              }
            }
            if (year) break;
          }

          // Enhanced journal extraction
          let journal = "";
          const journalPatterns = [
            /- ([^-]+)$/,
            /, ([^,]+)$/,
            /in ([^,]+)/,
            /([A-Z][^,]+(?:Journal|Review|Medicine|Health|Science|Research))/i,
            /([A-Z][^,]+(?:Lancet|Nature|Science|NEJM|JAMA|BMJ))/i
          ];
          
          for (const pattern of journalPatterns) {
            const match = authors.match(pattern);
            if (match) {
              journal = match[1].trim();
              break;
            }
          }

          // Quality filter - only include substantial results
          if (title && title.length > 10 && title.length < 500) {
            results.push({
              title: title.substring(0, 500), // Limit title length
              authors: authors.substring(0, 300), // Limit authors length
              abstract: abstract.substring(0, 1000), // Limit abstract length
              journal: journal.substring(0, 200), // Limit journal length
              year,
              citations: citations.substring(0, 100), // Limit citations length
              url: url.substring(0, 500), // Limit URL length
            });
          }
        } catch (error) {
          console.error("Error processing article element:", error);
          // Skip this iteration
        }
      });

      return results;
    });
  } catch (error) {
    console.error("Error scraping Google Scholar:", error);
    return [];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Additional Medical Scrapers - No Hardcoded Data
export async function searchMedicalDatabases(
  query: string,
): Promise<GoogleScholarArticle[]> {
  console.log(`🔍 Searching medical databases for: ${query}`);
  
  // Try multiple medical databases in parallel
  const searches = await Promise.allSettled([
    searchPubMedArticles(query, 5),
    searchGoogleScholar(query),
    searchCochraneLibrary(query),
    searchClinicalTrials(query),
  ]);

  const results: GoogleScholarArticle[] = [];

  // Process PubMed results
  if (searches[0].status === "fulfilled" && searches[0].value) {
    searches[0].value.forEach((article) => {
      results.push({
        title: article.title,
        authors: article.authors.join(", "),
        abstract: article.abstract,
        journal: article.journal,
        year: article.publication_date.split("-")[0],
        citations: "",
        url: `https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`,
      });
    });
  }

  // Process Google Scholar results
  if (searches[1].status === "fulfilled" && searches[1].value) {
    results.push(...searches[1].value);
  }

  // Process Cochrane Library results
  if (searches[2].status === "fulfilled" && searches[2].value) {
    results.push(...searches[2].value);
  }

  // Process Clinical Trials results
  if (searches[3].status === "fulfilled" && searches[3].value) {
    results.push(...searches[3].value);
  }

  // Remove duplicates based on title similarity
  const uniqueResults = results.filter((article, index, self) =>
    index === self.findIndex(a => 
      a.title.toLowerCase().replace(/[^\w\s]/g, "") === 
      article.title.toLowerCase().replace(/[^\w\s]/g, "")
    )
  );

  return uniqueResults.slice(0, 20); // Limit to 20 results
}

// Search Cochrane Library
async function searchCochraneLibrary(query: string): Promise<GoogleScholarArticle[]> {
  let browser;
  try {
    console.log(`🔍 Scraping Cochrane Library for: ${query}`);
    
    await randomDelay(1000, 3000);

    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
        "--disable-web-security",
        "--disable-features=VizDisplayCompositor",
        "--disable-blink-features=AutomationControlled",
        "--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36");

    // Search Cochrane Library
    const searchUrl = `https://www.cochranelibrary.com/search?q=${encodeURIComponent(query)}`;
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });

    return await page.evaluate(() => {
      const results: GoogleScholarArticle[] = [];
      const articles = document.querySelectorAll(".search-result-item, .result-item, .search-result");
      
      articles.forEach((article) => {
        const titleElement = article.querySelector("h3 a, .title a, .result-title a");
        const title = titleElement?.textContent?.trim() || "";
        const url = (titleElement as HTMLAnchorElement)?.href || "";
        
        const authorsElement = article.querySelector(".authors, .author-list, .contributors");
        const authors = authorsElement?.textContent?.trim() || "";
        
        const abstractElement = article.querySelector(".abstract, .snippet, .summary");
        const abstract = abstractElement?.textContent?.trim() || "";
        
        const journalElement = article.querySelector(".journal, .source, .publication");
        const journal = journalElement?.textContent?.trim() || "Cochrane Database";
        
        if (title && title.length > 10) {
          results.push({
            title,
            authors,
            abstract,
            journal,
            year: "",
            citations: "",
            url: url.startsWith("http") ? url : `https://www.cochranelibrary.com${url}`,
          });
        }
      });
      
      return results;
    });
  } catch (error) {
    console.error("Error scraping Cochrane Library:", error);
    return [];
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Search Clinical Trials
async function searchClinicalTrials(query: string): Promise<GoogleScholarArticle[]> {
  try {
    console.log(`🔍 Searching ClinicalTrials.gov for: ${query}`);
    
    // Use ClinicalTrials.gov API
    const response = await superagent
      .get("https://clinicaltrials.gov/api/v2/studies")
      .query({
        query: query,
        format: "json",
        limit: 10,
      })
      .set("User-Agent", USER_AGENT);

    const data = response.body;
    const results: GoogleScholarArticle[] = [];

    if (data.studies && data.studies.length > 0) {
      data.studies.forEach((study: any) => {
        const protocolSection = study.protocolSection;
        if (protocolSection) {
          const identificationModule = protocolSection.identificationModule;
          const statusModule = protocolSection.statusModule;
          const designModule = protocolSection.designModule;
          
          if (identificationModule) {
            results.push({
              title: identificationModule.briefTitle || identificationModule.officialTitle || "Clinical Trial",
              authors: identificationModule.leadSponsor?.name || "Clinical Trial",
              abstract: identificationModule.briefSummary || "",
              journal: "ClinicalTrials.gov",
              year: statusModule?.startDateStruct?.date || "",
              citations: "",
              url: `https://clinicaltrials.gov/study/${study.protocolSection.identificationModule.nctId}`,
            });
          }
        }
      });
    }

    return results;
  } catch (error) {
    console.error("Error searching ClinicalTrials.gov:", error);
    return [];
  }
}

// Search medical journals directly
export async function searchMedicalJournals(
  query: string,
): Promise<GoogleScholarArticle[]> {
  console.log(`🔍 Searching medical journals for: ${query}`);
  
  const journalSearches = await Promise.allSettled([
    searchJournal("NEJM", query),
    searchJournal("JAMA", query),
    searchJournal("Lancet", query),
    searchJournal("BMJ", query),
    searchJournal("Nature Medicine", query),
  ]);

  const results: GoogleScholarArticle[] = [];

  journalSearches.forEach((search) => {
    if (search.status === "fulfilled" && search.value) {
      results.push(...search.value);
    }
  });

  return results.slice(0, 15);
}

// Generic journal search function
async function searchJournal(journalName: string, query: string): Promise<GoogleScholarArticle[]> {
  try {
    // Use Google Scholar with journal-specific search
    const journalQuery = `"${journalName}" ${query}`;
    return await searchGoogleScholar(journalQuery);
  } catch (error) {
    console.error(`Error searching ${journalName}:`, error);
    return [];
  }
}

export async function searchPubMedArticles(
  query: string,
  maxResults: number = 10,
): Promise<PubMedArticle[]> {
  try {
    // First, search for article IDs
    const searchRes = await superagent
      .get(`${PUBMED_API_BASE}/esearch.fcgi`)
      .query({
        db: "pubmed",
        term: query,
        retmode: "json",
        retmax: maxResults,
      })
      .set("User-Agent", USER_AGENT);

    const idList = searchRes.body.esearchresult?.idlist || [];

    if (idList.length === 0) return [];

    // Then, fetch article details
    const fetchRes = await superagent
      .get(`${PUBMED_API_BASE}/efetch.fcgi`)
      .query({
        db: "pubmed",
        id: idList.join(","),
        retmode: "xml",
      })
      .set("User-Agent", USER_AGENT);

    return parsePubMedXML(fetchRes.text);
  } catch (error) {
    console.error("Error searching PubMed:", error);
    return [];
  }
}

// Enhanced PubMed XML parser
export function parsePubMedXML(xmlText: string): PubMedArticle[] {
  const articles: PubMedArticle[] = [];

  // Split by article boundaries
  const articleMatches = xmlText.match(
    /<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g,
  );

  if (!articleMatches) return articles;

  for (const articleXml of articleMatches) {
    try {
      // Extract PMID
      const pmidMatch = articleXml.match(/<PMID[^>]*>(\d+)<\/PMID>/);
      const pmid = pmidMatch?.[1];
      if (!pmid) continue;

      // Extract title
      const titleMatch = articleXml.match(
        /<ArticleTitle[^>]*>([^<]+)<\/ArticleTitle>/,
      );
      const title = titleMatch?.[1]?.trim() || "No title available";

      // Extract abstract
      let abstract = "No abstract available";
      const abstractMatch = articleXml.match(
        /<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/,
      );
      if (abstractMatch) {
        abstract = abstractMatch[1]
          .replace(/<[^>]*>/g, "") // Remove HTML tags
          .replace(/\s+/g, " ") // Normalize whitespace
          .trim();
      }

      // Extract authors
      const authors: string[] = [];
      const authorMatches = articleXml.match(/<Author[\s\S]*?<\/Author>/g);
      if (authorMatches) {
        for (const authorXml of authorMatches) {
          const lastNameMatch = authorXml.match(
            /<LastName>([^<]+)<\/LastName>/,
          );
          const firstNameMatch = authorXml.match(
            /<ForeName>([^<]+)<\/ForeName>/,
          );
          const collectiveNameMatch = authorXml.match(
            /<CollectiveName>([^<]+)<\/CollectiveName>/,
          );

          if (collectiveNameMatch) {
            authors.push(collectiveNameMatch[1].trim());
          } else if (lastNameMatch && firstNameMatch) {
            authors.push(
              `${firstNameMatch[1].trim()} ${lastNameMatch[1].trim()}`,
            );
          } else if (lastNameMatch) {
            authors.push(lastNameMatch[1].trim());
          }
        }
      }

      // Extract journal information
      let journal = "Journal information not available";
      const journalMatch = articleXml.match(/<Title>([^<]+)<\/Title>/);
      if (journalMatch) {
        journal = journalMatch[1].trim();
      }

      // Extract publication date
      let publicationDate = "Date not available";
      const yearMatch = articleXml.match(/<Year>(\d{4})<\/Year>/);
      const monthMatch = articleXml.match(/<Month>(\d{1,2})<\/Month>/);
      const dayMatch = articleXml.match(/<Day>(\d{1,2})<\/Day>/);

      if (yearMatch) {
        const year = yearMatch[1];
        const month = monthMatch?.[1]?.padStart(2, "0") || "01";
        const day = dayMatch?.[1]?.padStart(2, "0") || "01";
        publicationDate = `${year}-${month}-${day}`;
      }

      // Extract DOI
      let doi: string | undefined;
      const doiMatch = articleXml.match(
        /<ELocationID[^>]*EIdType="doi"[^>]*>([^<]+)<\/ELocationID>/,
      );
      if (doiMatch) {
        doi = doiMatch[1].trim();
      }

      articles.push({
        pmid,
        title,
        abstract,
        authors,
        journal,
        publication_date: publicationDate,
        doi,
      });
    } catch (error) {
      console.error("Error parsing individual article:", error);
      continue;
    }
  }

  return articles;
}

// Get detailed article information by PMID
export async function getPubMedArticleByPMID(
  pmid: string,
): Promise<PubMedArticle | null> {
  try {
    const fetchRes = await superagent
      .get(`${PUBMED_API_BASE}/efetch.fcgi`)
      .query({
        db: "pubmed",
        id: pmid,
        retmode: "xml",
      })
      .set("User-Agent", USER_AGENT);

    const articles = parsePubMedXML(fetchRes.text);
    return articles[0] || null;
  } catch (error) {
    console.error("Error fetching article by PMID:", error);
    return null;
  }
}

// Clinical Guidelines search function
export async function searchClinicalGuidelines(
  query: string,
  organization?: string,
): Promise<ClinicalGuideline[]> {
  try {
    // Enhanced search strategy with broader terms and specific guideline databases
    const searchTerms = [
      `guidelines ${query}`,
      `recommendations ${query}`,
      `consensus ${query}`,
      `position statement ${query}`,
      `evidence-based ${query}`,
      `best practice ${query}`,
      `American Heart Association ${query}`,
      `American College of Cardiology ${query}`,
      `American Diabetes Association ${query}`,
      `American College of Physicians ${query}`,
      `WHO guidelines ${query}`,
      `CDC guidelines ${query}`,
    ];

    const allGuidelines: ClinicalGuideline[] = [];

    for (const searchTerm of searchTerms) {
      try {
        const searchRes = await superagent
          .get(`${PUBMED_API_BASE}/esearch.fcgi`)
          .query({
            db: "pubmed",
            term: searchTerm,
            retmode: "json",
            retmax: 10, // Increased from 5
          })
          .set("User-Agent", USER_AGENT);

        const idList = searchRes.body.esearchresult?.idlist || [];
        if (idList.length === 0) continue;

        // Fetch article details
        const fetchRes = await superagent
          .get(`${PUBMED_API_BASE}/efetch.fcgi`)
          .query({
            db: "pubmed",
            id: idList.join(","),
            retmode: "xml",
          })
          .set("User-Agent", USER_AGENT);

        const articles = parsePubMedXML(fetchRes.text);

        for (const article of articles) {
          // More flexible guideline detection
          const title = article.title.toLowerCase();
          const abstract = (article.abstract || "").toLowerCase();

          const isGuideline =
            title.includes("guideline") ||
            title.includes("recommendation") ||
            title.includes("consensus") ||
            title.includes("position statement") ||
            title.includes("expert consensus") ||
            title.includes("best practice") ||
            title.includes("evidence-based") ||
            abstract.includes("guideline") ||
            abstract.includes("recommendation") ||
            abstract.includes("consensus") ||
            abstract.includes("position statement");

          if (isGuideline) {
            // Extract organization from journal, abstract, or title
            let org = "Unknown Organization";

            // Try to extract from journal first
            if (article.journal) {
              org = article.journal;
            }

            // Try to extract from abstract
            if (article.abstract) {
              const orgPatterns = [
                /([A-Z][a-z]+ [A-Z][a-z]+ (?:Society|Association|College|Institute|Foundation|Organization|Committee|Academy))/,
                /(American [A-Z][a-z]+ (?:Society|Association|College|Institute|Foundation|Organization|Committee|Academy))/,
                /(World Health Organization|WHO)/,
                /(Centers for Disease Control|CDC)/,
                /(National [A-Z][a-z]+ (?:Institute|Institute of Health|Academy))/,
              ];

              for (const pattern of orgPatterns) {
                const match = article.abstract.match(pattern);
                if (match) {
                  org = match[1];
                  break;
                }
              }
            }

            // Try to extract from title
            if (org === "Unknown Organization") {
              const titleOrgPatterns = [
                /(American [A-Z][a-z]+ (?:Society|Association|College|Institute|Foundation|Organization|Committee|Academy))/,
                /(World Health Organization|WHO)/,
                /(Centers for Disease Control|CDC)/,
              ];

              for (const pattern of titleOrgPatterns) {
                const match = article.title.match(pattern);
                if (match) {
                  org = match[1];
                  break;
                }
              }
            }

            // Skip if organization filter is specified and doesn't match
            if (
              organization &&
              !org.toLowerCase().includes(organization.toLowerCase()) &&
              !article.title.toLowerCase().includes(organization.toLowerCase())
            ) {
              continue;
            }

            // Extract year
            const yearMatch = article.publication_date.match(/(\d{4})/);
            const year = yearMatch ? yearMatch[1] : "Unknown";

            // Determine category based on content
            let category = "General";
            if (
              title.includes("cardiology") ||
              abstract.includes("cardiac") ||
              abstract.includes("heart")
            )
              category = "Cardiology";
            else if (
              title.includes("oncology") ||
              abstract.includes("cancer") ||
              abstract.includes("tumor")
            )
              category = "Oncology";
            else if (
              title.includes("diabetes") ||
              abstract.includes("diabetes")
            )
              category = "Endocrinology";
            else if (
              title.includes("hypertension") ||
              abstract.includes("hypertension") ||
              abstract.includes("blood pressure")
            )
              category = "Cardiology";
            else if (
              title.includes("infectious") ||
              abstract.includes("infection") ||
              abstract.includes("infectious")
            )
              category = "Infectious Diseases";
            else if (
              title.includes("pediatric") ||
              abstract.includes("pediatric") ||
              abstract.includes("children")
            )
              category = "Pediatrics";
            else if (
              title.includes("mental") ||
              abstract.includes("mental") ||
              abstract.includes("psychiatric")
            )
              category = "Psychiatry";

            // Determine evidence level
            let evidenceLevel = "Systematic Review/Consensus";
            if (
              title.includes("meta-analysis") ||
              abstract.includes("meta-analysis")
            )
              evidenceLevel = "Meta-analysis";
            else if (
              title.includes("systematic review") ||
              abstract.includes("systematic review")
            )
              evidenceLevel = "Systematic Review";
            else if (
              title.includes("randomized") ||
              abstract.includes("randomized")
            )
              evidenceLevel = "Randomized Controlled Trial";

            allGuidelines.push({
              title: article.title,
              organization: org,
              year: year,
              url: `https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`,
              description: (article.abstract || "").substring(0, 200) + "...",
              category: category,
              evidence_level: evidenceLevel,
            });
          }
        }
      } catch (error) {
        console.error(
          `Error searching for guidelines with term: ${searchTerm}`,
          error instanceof Error ? error.message : String(error),
        );
        continue;
      }
    }

    // Remove duplicates based on title similarity
    const uniqueGuidelines = allGuidelines.filter(
      (guideline, index, self) =>
        index ===
        self.findIndex(
          (g) =>
            g.title.toLowerCase().replace(/[^\w\s]/g, "") ===
            guideline.title.toLowerCase().replace(/[^\w\s]/g, ""),
        ),
    );

    return uniqueGuidelines.slice(0, 15); // Increased limit to 15 results
  } catch (error) {
    console.error("Error searching clinical guidelines:", error);
    return [];
  }
}

// Drug Safety Functions - Enhanced Dynamic Search
export async function getDrugSafetyInfo(
  drugName: string,
): Promise<DrugSafetyInfo | null> {
  try {
    console.log(`🔍 Searching safety info for: ${drugName}`);

    const sources = await Promise.allSettled([
      searchPregnancySafety(drugName),
      searchLactationSafety(drugName),
      searchContraindications(drugName),
      searchFDAWarnings(drugName),
      searchDrugInteractions(drugName),
    ]);

    const results = {
      drug_name: drugName,
      sources_searched: sources.length,
      successful_sources: sources.filter((s) => s.status === "fulfilled")
        .length,
      data: {} as any,
    };

    sources.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value) {
        const sourceNames = [
          "pregnancy",
          "lactation",
          "contraindications",
          "fda_warnings",
          "interactions",
        ];
        results.data[sourceNames[index]] = result.value;
      }
    });

    // Convert to DrugSafetyInfo format
    const safetyInfo: DrugSafetyInfo = {
      drug_name: drugName,
      last_updated: new Date().toISOString(),
    };

    // Extract pregnancy category
    if (results.data.pregnancy?.pregnancy_category) {
      safetyInfo.pregnancy_category = results.data.pregnancy.pregnancy_category;
    } else {
      safetyInfo.pregnancy_category = "N"; // Not classified
    }

    // Extract lactation safety
    if (results.data.lactation?.lactation_safety) {
      safetyInfo.lactation_safety = results.data.lactation.lactation_safety;
    } else {
      safetyInfo.lactation_safety = "Unknown";
    }

    // Extract contraindications
    if (results.data.contraindications?.contraindications) {
      safetyInfo.contraindications =
        results.data.contraindications.contraindications;
    }

    // Extract warnings
    if (results.data.fda_warnings?.warnings) {
      safetyInfo.warnings = results.data.fda_warnings.warnings;
    }

    // Extract monitoring requirements
    if (results.data.fda_warnings?.monitoring_requirements) {
      safetyInfo.monitoring_requirements =
        results.data.fda_warnings.monitoring_requirements;
    }

    return safetyInfo;
  } catch (error) {
    console.error("Error getting drug safety info:", error);
    return null;
  }
}

// Search pregnancy safety from multiple sources
async function searchPregnancySafety(drugName: string) {
  const terms = [
    `"${drugName}" AND "pregnancy" AND ("FDA category" OR "pregnancy category")`,
    `"${drugName}" AND "teratogenic" AND "pregnancy"`,
    `"${drugName}" AND "fetal" AND "safety"`,
    `"${drugName}" AND "reproductive" AND "toxicity"`,
  ];

  const results = {
    sources: [] as any[],
    pregnancy_category: null as string | null,
    evidence_level: "Unknown",
  };

  for (const term of terms) {
    try {
      const searchRes = await superagent
        .get(`${PUBMED_API_BASE}/esearch.fcgi`)
        .query({
          db: "pubmed",
          term: term,
          retmode: "json",
          retmax: 3,
          sort: "relevance",
        })
        .set("User-Agent", USER_AGENT);

      const idList = searchRes.body.esearchresult?.idlist || [];
      if (idList.length > 0) {
        const fetchRes = await superagent
          .get(`${PUBMED_API_BASE}/efetch.fcgi`)
          .query({
            db: "pubmed",
            id: idList.join(","),
            retmode: "xml",
          })
          .set("User-Agent", USER_AGENT);

        const articles = parsePubMedXML(fetchRes.text);

        for (const article of articles) {
          const text = `${article.title} ${article.abstract}`.toLowerCase();

          // Extract pregnancy category using regex patterns
          const categoryMatch =
            text.match(/pregnancy\s+category\s+([a-dx])/i) ||
            text.match(/fda\s+category\s+([a-dx])/i) ||
            text.match(/category\s+([a-dx])\s+pregnancy/i);

          if (categoryMatch) {
            results.pregnancy_category = categoryMatch[1].toUpperCase();
            results.evidence_level = "Literature Review";
            results.sources.push({
              title: article.title,
              journal: article.journal,
              year: article.publication_date,
              pmid: article.pmid,
            });
            break;
          }
        }
      }
    } catch (error: any) {
      console.error(`Error searching pregnancy safety: ${error.message}`);
      continue;
    }
  }

  return results;
}

// Search lactation safety
async function searchLactationSafety(drugName: string) {
  const terms = [
    `"${drugName}" AND "lactation" AND "safety"`,
    `"${drugName}" AND "breastfeeding" AND "safe"`,
    `"${drugName}" AND "milk" AND "transfer"`,
    `"${drugName}" AND "lactmed"`,
  ];

  const results = {
    sources: [] as any[],
    lactation_safety: "Unknown",
    evidence_level: "Unknown",
  };

  for (const term of terms) {
    try {
      const searchRes = await superagent
        .get(`${PUBMED_API_BASE}/esearch.fcgi`)
        .query({
          db: "pubmed",
          term: term,
          retmode: "json",
          retmax: 3,
        })
        .set("User-Agent", USER_AGENT);

      const idList = searchRes.body.esearchresult?.idlist || [];
      if (idList.length > 0) {
        const fetchRes = await superagent
          .get(`${PUBMED_API_BASE}/efetch.fcgi`)
          .query({
            db: "pubmed",
            id: idList.join(","),
            retmode: "xml",
          })
          .set("User-Agent", USER_AGENT);

        const articles = parsePubMedXML(fetchRes.text);

        for (const article of articles) {
          const text = `${article.title} ${article.abstract}`.toLowerCase();

          if (text.includes("lactation") || text.includes("breastfeeding")) {
            if (
              text.includes("safe") &&
              !text.includes("not safe") &&
              !text.includes("unsafe")
            ) {
              results.lactation_safety = "Safe";
            } else if (text.includes("caution") || text.includes("monitor")) {
              results.lactation_safety = "Caution";
            } else if (
              text.includes("avoid") ||
              text.includes("contraindicated")
            ) {
              results.lactation_safety = "Avoid";
            }

            results.evidence_level = "Literature Review";
            results.sources.push({
              title: article.title,
              journal: article.journal,
              year: article.publication_date,
              pmid: article.pmid,
            });
            break;
          }
        }
      }
    } catch (error: any) {
      console.error(`Error searching lactation safety: ${error.message}`);
      continue;
    }
  }

  return results;
}

// Search contraindications dynamically
async function searchContraindications(drugName: string) {
  const terms = [
    `"${drugName}" AND "contraindication"`,
    `"${drugName}" AND "contraindicated"`,
    `"${drugName}" AND "avoid" AND "pregnancy"`,
    `"${drugName}" AND "not recommended"`,
  ];

  const contraindications: string[] = [];
  const sources: any[] = [];

  for (const term of terms) {
    try {
      const searchRes = await superagent
        .get(`${PUBMED_API_BASE}/esearch.fcgi`)
        .query({
          db: "pubmed",
          term: term,
          retmode: "json",
          retmax: 2,
        })
        .set("User-Agent", USER_AGENT);

      const idList = searchRes.body.esearchresult?.idlist || [];
      if (idList.length > 0) {
        const fetchRes = await superagent
          .get(`${PUBMED_API_BASE}/efetch.fcgi`)
          .query({
            db: "pubmed",
            id: idList.join(","),
            retmode: "xml",
          })
          .set("User-Agent", USER_AGENT);

        const articles = parsePubMedXML(fetchRes.text);

        for (const article of articles) {
          const text = `${article.title} ${article.abstract}`.toLowerCase();

          if (
            text.includes("contraindication") ||
            text.includes("contraindicated")
          ) {
            // Extract specific contraindications using NLP patterns
            const contraindicationPatterns = [
              /contraindicated in ([^.]*)/gi,
              /avoid in ([^.]*)/gi,
              /not recommended for ([^.]*)/gi,
              /should not be used in ([^.]*)/gi,
            ];

            contraindicationPatterns.forEach((pattern) => {
              const matches = text.match(pattern);
              if (matches) {
                matches.forEach((match) => {
                  const extracted = match
                    .replace(
                      /contraindicated in |avoid in |not recommended for |should not be used in /gi,
                      "",
                    )
                    .trim();
                  if (extracted.length > 10 && extracted.length < 100) {
                    contraindications.push(extracted);
                  }
                });
              }
            });

            sources.push({
              title: article.title,
              journal: article.journal,
              year: article.publication_date,
              pmid: article.pmid,
            });
          }
        }
      }
    } catch (error: any) {
      console.error(`Error searching contraindications: ${error.message}`);
      continue;
    }
  }

  return {
    contraindications: [...new Set(contraindications)],
    sources: sources,
    evidence_level: "Literature Review",
  };
}

// Search FDA warnings dynamically
async function searchFDAWarnings(drugName: string) {
  try {
    const fdaRes = await superagent
      .get(`${FDA_API_BASE}/drug/label.json`)
      .query({
        search: `openfda.brand_name:"${drugName}" OR openfda.generic_name:"${drugName}"`,
        limit: 1,
      })
      .set("User-Agent", USER_AGENT);

    const drugs = fdaRes.body.results || [];
    if (drugs.length > 0) {
      const drug = drugs[0];
      const warnings: string[] = [];
      const monitoring: string[] = [];

      if (drug.warnings && drug.warnings.length > 0) {
        warnings.push(...drug.warnings);
      }

      if (
        drug.dosage_and_administration &&
        drug.dosage_and_administration.length > 0
      ) {
        drug.dosage_and_administration.forEach((dosage: any) => {
          if (dosage.toLowerCase().includes("monitor")) {
            monitoring.push(dosage);
          }
        });
      }

      return {
        warnings: warnings,
        monitoring_requirements: monitoring,
        source: "FDA Database",
        last_updated: drug.effective_time,
      };
    }
  } catch (error: any) {
    console.error(`Error searching FDA warnings: ${error.message}`);
  }

  return { source: "FDA Database", error: "No data found" };
}

// Search drug interactions dynamically
async function searchDrugInteractions(drugName: string) {
  const terms = [
    `"${drugName}" AND "drug interaction"`,
    `"${drugName}" AND "pharmacokinetic" AND "interaction"`,
    `"${drugName}" AND "cyp" AND "inhibition"`,
  ];

  const interactions: any[] = [];
  const sources: any[] = [];

  for (const term of terms) {
    try {
      const searchRes = await superagent
        .get(`${PUBMED_API_BASE}/esearch.fcgi`)
        .query({
          db: "pubmed",
          term: term,
          retmode: "json",
          retmax: 3,
        })
        .set("User-Agent", USER_AGENT);

      const idList = searchRes.body.esearchresult?.idlist || [];
      if (idList.length > 0) {
        const fetchRes = await superagent
          .get(`${PUBMED_API_BASE}/efetch.fcgi`)
          .query({
            db: "pubmed",
            id: idList.join(","),
            retmode: "xml",
          })
          .set("User-Agent", USER_AGENT);

        const articles = parsePubMedXML(fetchRes.text);

        for (const article of articles) {
          const text = `${article.title} ${article.abstract}`.toLowerCase();

          if (
            text.includes("interaction") ||
            text.includes("contraindication")
          ) {
            // Extract interaction severity
            let severity = "Moderate";
            if (text.includes("severe") || text.includes("major")) {
              severity = "Major";
            } else if (text.includes("minor") || text.includes("mild")) {
              severity = "Minor";
            } else if (text.includes("contraindicated")) {
              severity = "Contraindicated";
            }

            interactions.push({
              severity: severity,
              description: `Interaction data from literature`,
              evidence_level: "Literature Review",
            });

            sources.push({
              title: article.title,
              journal: article.journal,
              year: article.publication_date,
              pmid: article.pmid,
            });
          }
        }
      }
    } catch (error: any) {
      console.error(`Error searching drug interactions: ${error.message}`);
      continue;
    }
  }

  return {
    interactions: interactions,
    sources: sources,
    evidence_level: "Literature Review",
  };
}

export async function checkDrugInteractions(
  drug1: string,
  drug2: string,
): Promise<DrugInteraction[]> {
  try {
    // Search for interaction studies between the two drugs
    const interactionTerms = [
      `"${drug1}" AND "${drug2}" AND "interaction"`,
      `"${drug1}" AND "${drug2}" AND "contraindication"`,
      `"${drug1}" AND "${drug2}" AND "adverse"`,
    ];

    const interactions: DrugInteraction[] = [];

    for (const term of interactionTerms) {
      try {
        const searchRes = await superagent
          .get(`${PUBMED_API_BASE}/esearch.fcgi`)
          .query({
            db: "pubmed",
            term: term,
            retmode: "json",
            retmax: 3,
          })
          .set("User-Agent", USER_AGENT);

        const idList = searchRes.body.esearchresult?.idlist || [];
        if (idList.length > 0) {
          const fetchRes = await superagent
            .get(`${PUBMED_API_BASE}/efetch.fcgi`)
            .query({
              db: "pubmed",
              id: idList.join(","),
              retmode: "xml",
            })
            .set("User-Agent", USER_AGENT);

          const articles = parsePubMedXML(fetchRes.text);

          for (const article of articles) {
            const abstract = (article.abstract || "").toLowerCase();
            const title = (article.title || "").toLowerCase();

            // Only process if it's actually about drug interactions
            if (
              (abstract.includes("interaction") ||
                abstract.includes("contraindication")) &&
              !abstract.includes("no interaction") &&
              !abstract.includes("safe combination") &&
              !abstract.includes("no contraindication") &&
              !abstract.includes("can be used together")
            ) {
              let severity: "Minor" | "Moderate" | "Major" | "Contraindicated" =
                "Moderate";

              // More careful severity assessment
              if (
                abstract.includes("contraindicated") ||
                abstract.includes("avoid")
              ) {
                severity = "Contraindicated";
              } else if (
                abstract.includes("severe") ||
                abstract.includes("major")
              ) {
                severity = "Major";
              } else if (
                abstract.includes("minor") ||
                abstract.includes("mild")
              ) {
                severity = "Minor";
              }

              // Avoid duplicates
              const existingInteraction = interactions.find(
                (i) => i.drug1 === drug1 && i.drug2 === drug2,
              );
              if (!existingInteraction) {
                // Extract specific clinical effects from the abstract
                const clinicalEffects = extractClinicalEffects(
                  abstract,
                  drug1,
                  drug2,
                );
                const management = extractManagementAdvice(abstract);

                interactions.push({
                  drug1,
                  drug2,
                  severity,
                  description: `Interaction between ${drug1} and ${drug2} - see referenced literature`,
                  clinical_effects:
                    clinicalEffects ||
                    "See referenced literature for clinical effects",
                  management:
                    management ||
                    "Consult healthcare provider before combining medications",
                  evidence_level: "Literature Review",
                });
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error checking interactions for term: ${term}`, error);
        continue;
      }
    }

    return interactions;
  } catch (error) {
    console.error("Error checking drug interactions:", error);
    return [];
  }
}

// Helper functions for drug interactions
function extractClinicalEffects(
  abstract: string,
  drug1: string,
  drug2: string,
): string | null {
  const text = abstract.toLowerCase();

  // Look for specific clinical effect patterns
  const effectPatterns = [
    /(?:increased|elevated|higher)\s+(?:risk\s+of\s+)?([^.]{10,100})/gi,
    /(?:decreased|reduced|lower)\s+(?:risk\s+of\s+)?([^.]{10,100})/gi,
    /(?:may\s+cause|can\s+cause|leads\s+to)\s+([^.]{10,100})/gi,
    /(?:result\s+in|results\s+in)\s+([^.]{10,100})/gi,
    /(?:associated\s+with|linked\s+to)\s+([^.]{10,100})/gi,
  ];

  for (const pattern of effectPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      const effect = matches[0].trim();
      if (effect.length > 15 && effect.length < 150) {
        return effect;
      }
    }
  }

  return null;
}

function extractManagementAdvice(abstract: string): string | null {
  const text = abstract.toLowerCase();

  // Look for management advice patterns
  const managementPatterns = [
    /(?:monitor|monitoring)\s+([^.]{10,100})/gi,
    /(?:avoid|avoiding)\s+([^.]{10,100})/gi,
    /(?:adjust|adjusting)\s+([^.]{10,100})/gi,
    /(?:reduce|reducing)\s+([^.]{10,100})/gi,
    /(?:consider|considering)\s+([^.]{10,100})/gi,
    /(?:recommend|recommended)\s+([^.]{10,100})/gi,
  ];

  for (const pattern of managementPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      const advice = matches[0].trim();
      if (advice.length > 15 && advice.length < 150) {
        return advice;
      }
    }
  }

  return null;
}

// Diagnostic Support Functions
export async function generateDifferentialDiagnosis(
  symptoms: string[],
): Promise<DifferentialDiagnosis> {
  try {
    const symptomString = symptoms.join(" ").toLowerCase();
    const searchTerms = [
      `"${symptomString}" AND "differential diagnosis"`,
      `"${symptomString}" AND "diagnosis" AND "symptoms"`,
      `"${symptomString}" AND "clinical presentation"`,
    ];

    const results: DifferentialDiagnosis = {
      symptoms: symptoms,
      possible_diagnoses: [],
      red_flags: [],
      urgent_considerations: [],
    };

    for (const term of searchTerms) {
      try {
        const searchRes = await superagent
          .get(`${PUBMED_API_BASE}/esearch.fcgi`)
          .query({
            db: "pubmed",
            term: term,
            retmode: "json",
            retmax: 5,
            sort: "relevance",
          })
          .set("User-Agent", USER_AGENT);

        const idList = searchRes.body.esearchresult?.idlist || [];
        if (idList.length > 0) {
          const fetchRes = await superagent
            .get(`${PUBMED_API_BASE}/efetch.fcgi`)
            .query({
              db: "pubmed",
              id: idList.join(","),
              retmode: "xml",
            })
            .set("User-Agent", USER_AGENT);

          const articles = parsePubMedXML(fetchRes.text);

          for (const article of articles) {
            const text = `${article.title} ${article.abstract}`.toLowerCase();

            // Extract diagnoses using NLP patterns
            const diagnosisPatterns = [
              /differential diagnosis includes? ([^.]*)/gi,
              /consider ([^.]*)/gi,
              /rule out ([^.]*)/gi,
            ];

            diagnosisPatterns.forEach((pattern) => {
              const matches = text.match(pattern);
              if (matches) {
                matches.forEach((match) => {
                  const diagnosis = match
                    .replace(
                      /differential diagnosis includes? |consider |rule out /gi,
                      "",
                    )
                    .trim();
                  if (diagnosis.length > 5 && diagnosis.length < 50) {
                    results.possible_diagnoses.push({
                      diagnosis: diagnosis,
                      probability: "Moderate" as const,
                      key_findings: ["See referenced literature"],
                      next_steps: ["See referenced literature"],
                    });
                  }
                });
              }
            });

            // Extract red flags
            const redFlagPatterns = [
              /red\s*flag\s*:?\s*([^.]*)/gi,
              /warning\s*sign\s*:?\s*([^.]*)/gi,
              /urgent\s*:?\s*([^.]*)/gi,
            ];

            redFlagPatterns.forEach((pattern) => {
              const matches = text.match(pattern);
              if (matches) {
                matches.forEach((match) => {
                  const flag = match
                    .replace(
                      /red\s*flag\s*:?\s*|warning\s*sign\s*:?\s*|urgent\s*:?\s*/gi,
                      "",
                    )
                    .trim();
                  if (flag.length > 5) {
                    results.red_flags.push(flag);
                  }
                });
              }
            });
          }
        }
      } catch (error) {
        console.error(
          `Error searching differential diagnosis: ${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }
    }

    // If no dynamic results found, return empty results rather than hardcoded fallbacks
    // This ensures all data comes from real-time API sources

    return results;
  } catch (error) {
    console.error("Error generating differential diagnosis:", error);
    return {
      symptoms: symptoms,
      possible_diagnoses: [],
      red_flags: [],
      urgent_considerations: [],
    };
  }
}

export async function getRiskCalculators(
  condition?: string,
): Promise<RiskCalculator[]> {
  try {
    // If specific condition requested, try dynamic search first
    if (condition) {
      const searchTerm = `"${condition}" AND "risk calculator"`;

      try {
        const searchRes = await superagent
          .get(`${PUBMED_API_BASE}/esearch.fcgi`)
          .query({
            db: "pubmed",
            term: searchTerm,
            retmode: "json",
            retmax: 5,
            sort: "relevance",
          })
          .set("User-Agent", USER_AGENT);

        const idList = searchRes.body.esearchresult?.idlist || [];
        if (idList.length > 0) {
          const fetchRes = await superagent
            .get(`${PUBMED_API_BASE}/efetch.fcgi`)
            .query({
              db: "pubmed",
              id: idList.join(","),
              retmode: "xml",
            })
            .set("User-Agent", USER_AGENT);

          const articles = parsePubMedXML(fetchRes.text);
          const calculators: RiskCalculator[] = [];

          for (const article of articles) {
            const text = `${article.title} ${article.abstract}`.toLowerCase();

            if (
              text.includes("calculator") ||
              text.includes("score") ||
              text.includes("risk")
            ) {
              const calculatorName = extractCalculatorName(article.title, text);
              const parameters = extractParameters(text);

              if (calculatorName) {
                calculators.push({
                  name: calculatorName,
                  description: `Risk calculator found in literature: ${article.title}`,
                  parameters: parameters.map((param) => ({
                    name: param,
                    type: "number" as const,
                    required: true,
                  })),
                  calculation:
                    "See referenced literature for calculation details",
                  interpretation: {
                    low_risk: "See referenced literature for interpretation",
                    moderate_risk:
                      "See referenced literature for interpretation",
                    high_risk: "See referenced literature for interpretation",
                  },
                  references: [article.journal, article.title],
                });
              }
            }
          }

          if (calculators.length > 0) {
            return calculators;
          }
        }
      } catch (error) {
        console.error(`Error searching for ${condition} calculators:`, error);
      }
    }

    // Try to find additional cardiovascular risk calculators through dynamic search
    const cardiovascularTerms = [
      "ASCVD risk calculator",
      "Framingham risk score",
      "CHA2DS2-VASc",
      "Wells score",
      "TIMI risk score",
    ];
    const additionalCalculators: RiskCalculator[] = [];

    for (const term of cardiovascularTerms) {
      try {
        const searchRes = await superagent
          .get(`${PUBMED_API_BASE}/esearch.fcgi`)
          .query({
            db: "pubmed",
            term: `"${term}" AND "calculator" AND "risk"`,
            retmode: "json",
            retmax: 2,
            sort: "relevance",
          })
          .set("User-Agent", USER_AGENT);

        const idList = searchRes.body.esearchresult?.idlist || [];
        if (idList.length > 0) {
          const fetchRes = await superagent
            .get(`${PUBMED_API_BASE}/efetch.fcgi`)
            .query({
              db: "pubmed",
              id: idList.join(","),
              retmode: "xml",
            })
            .set("User-Agent", USER_AGENT);

          const articles = parsePubMedXML(fetchRes.text);

          for (const article of articles) {
            const text = `${article.title} ${article.abstract}`.toLowerCase();

            if (
              text.includes("calculator") ||
              text.includes("score") ||
              text.includes("risk")
            ) {
              const calculatorName = extractCalculatorName(article.title, text);
              const parameters = extractParameters(text);

              if (
                calculatorName &&
                !additionalCalculators.find((c) => c.name === calculatorName)
              ) {
                additionalCalculators.push({
                  name: calculatorName,
                  description: `Risk calculator found in literature: ${article.title}`,
                  parameters: parameters.map((param) => ({
                    name: param,
                    type: "number" as const,
                    required: true,
                  })),
                  calculation:
                    "See referenced literature for calculation details",
                  interpretation: {
                    low_risk: "See referenced literature for interpretation",
                    moderate_risk:
                      "See referenced literature for interpretation",
                    high_risk: "See referenced literature for interpretation",
                  },
                  references: [article.journal, article.title],
                });
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error searching for ${term}:`, error);
        continue;
      }
    }

    // Return only dynamically found calculators - no hardcoded fallbacks
    return additionalCalculators;
  } catch (error) {
    console.error("Error getting risk calculators:", error);
    return [];
  }
}

// Helper functions for extracting calculator information
function extractCalculatorName(title: string, text: string): string | null {
  const patterns = [
    /([A-Z][a-z]+ [A-Z][a-z]+ [Ss]core)/g,
    /([A-Z][a-z]+ [Rr]isk [Cc]alculator)/g,
    /([A-Z][a-z]+ [Ss]coring [Ss]ystem)/g,
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern) || text.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return null;
}

function extractParameters(text: string): string[] {
  const parameters: string[] = [];
  const paramPatterns = [
    /age\s*:?\s*(\d+)/gi,
    /weight\s*:?\s*(\d+)/gi,
    /height\s*:?\s*(\d+)/gi,
    /blood\s*pressure\s*:?\s*(\d+)/gi,
    /heart\s*rate\s*:?\s*(\d+)/gi,
  ];

  paramPatterns.forEach((pattern) => {
    const matches = text.match(pattern);
    if (matches) {
      parameters.push(matches[0]);
    }
  });

  return parameters;
}

function extractValidation(text: string): string {
  if (text.includes("validated") || text.includes("validation")) {
    return "Validated";
  } else if (text.includes("prospective") || text.includes("cohort")) {
    return "Prospective Study";
  } else {
    return "Literature Review";
  }
}

export async function getLabValues(testName?: string): Promise<LabValue[]> {
  try {
    // If specific test requested, try dynamic search first
    if (testName) {
      const searchTerm = `"${testName}" AND "normal range"`;

      try {
        const searchRes = await superagent
          .get(`${PUBMED_API_BASE}/esearch.fcgi`)
          .query({
            db: "pubmed",
            term: searchTerm,
            retmode: "json",
            retmax: 5,
            sort: "relevance",
          })
          .set("User-Agent", USER_AGENT);

        const idList = searchRes.body.esearchresult?.idlist || [];
        if (idList.length > 0) {
          const fetchRes = await superagent
            .get(`${PUBMED_API_BASE}/efetch.fcgi`)
            .query({
              db: "pubmed",
              id: idList.join(","),
              retmode: "xml",
            })
            .set("User-Agent", USER_AGENT);

          const articles = parsePubMedXML(fetchRes.text);
          const labValues: LabValue[] = [];

          for (const article of articles) {
            const text = `${article.title} ${article.abstract}`.toLowerCase();

            if (
              text.includes("normal range") ||
              text.includes("reference range")
            ) {
              const ranges = extractLabRanges(text, testName);
              const criticalValues = extractCriticalValues(text);

              if (ranges.length > 0) {
                labValues.push({
                  test_name: testName,
                  normal_ranges: ranges,
                  critical_values: criticalValues,
                  interpretation:
                    "See referenced literature for interpretation",
                  clinical_significance:
                    "See referenced literature for clinical significance",
                });
              }
            }
          }

          if (labValues.length > 0) {
            return labValues;
          }
        }
      } catch (error) {
        console.error(`Error searching for ${testName}:`, error);
      }
    }

    // Try to find additional essential lab values through dynamic search
    const essentialTests = [
      "glucose",
      "creatinine",
      "alt",
      "ast",
      "cholesterol",
      "ldl",
      "hdl",
      "triglycerides",
    ];
    const additionalLabValues: LabValue[] = [];

    for (const test of essentialTests) {
      try {
        const searchTerm = `"${test}" AND "normal range" AND "reference values"`;

        const searchRes = await superagent
          .get(`${PUBMED_API_BASE}/esearch.fcgi`)
          .query({
            db: "pubmed",
            term: searchTerm,
            retmode: "json",
            retmax: 2,
            sort: "relevance",
          })
          .set("User-Agent", USER_AGENT);

        const idList = searchRes.body.esearchresult?.idlist || [];
        if (idList.length > 0) {
          const fetchRes = await superagent
            .get(`${PUBMED_API_BASE}/efetch.fcgi`)
            .query({
              db: "pubmed",
              id: idList.join(","),
              retmode: "xml",
            })
            .set("User-Agent", USER_AGENT);

          const articles = parsePubMedXML(fetchRes.text);

          for (const article of articles) {
            const text = `${article.title} ${article.abstract}`.toLowerCase();

            if (
              text.includes("normal range") ||
              text.includes("reference range")
            ) {
              const ranges = extractLabRanges(text, test);
              const criticalValues = extractCriticalValues(text);

              if (ranges.length > 0) {
                additionalLabValues.push({
                  test_name: test.charAt(0).toUpperCase() + test.slice(1),
                  normal_ranges: ranges,
                  critical_values: criticalValues,
                  interpretation:
                    "See referenced literature for interpretation",
                  clinical_significance:
                    "See referenced literature for clinical significance",
                });
                break; // Only take the first good result for each test
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error searching for ${test}:`, error);
        continue;
      }
    }

    // Return only dynamically found lab values - no hardcoded fallbacks
    return additionalLabValues;
  } catch (error) {
    console.error("Error getting lab values:", error);
    return [];
  }
}

// Helper functions for extracting lab information
function extractLabRanges(text: string, testName: string): any[] {
  const ranges: any[] = [];
  const rangePatterns = [
    /(\d+\.?\d*)\s*-\s*(\d+\.?\d*)\s*([a-zA-Z\/%]+)/gi,
    /(\d+\.?\d*)\s*to\s*(\d+\.?\d*)\s*([a-zA-Z\/%]+)/gi,
  ];

  rangePatterns.forEach((pattern) => {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach((match) => {
        const parts = match.match(
          /(\d+\.?\d*)\s*[-to]\s*(\d+\.?\d*)\s*([a-zA-Z\/%]+)/i,
        );
        if (parts) {
          ranges.push({
            age_group: "Adult",
            male_range: `${parts[1]}-${parts[2]}`,
            female_range: `${parts[1]}-${parts[2]}`,
            units: parts[3],
          });
        }
      });
    }
  });

  return ranges;
}

function extractCriticalValues(text: string): any {
  const critical: { low: string | null; high: string | null } = {
    low: null,
    high: null,
  };
  const criticalPatterns = [
    /critical\s*value\s*[<>]\s*(\d+\.?\d*)/gi,
    /alert\s*value\s*[<>]\s*(\d+\.?\d*)/gi,
  ];

  criticalPatterns.forEach((pattern) => {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach((match) => {
        const valueMatch = match.match(/(\d+\.?\d*)/);
        if (valueMatch) {
          if (match.includes("<")) {
            critical.low = valueMatch[1];
          } else if (match.includes(">")) {
            critical.high = valueMatch[1];
          }
        }
      });
    }
  });

  return critical;
}

function extractAgeGroups(text: string): string[] {
  const ageGroups: string[] = [];
  const agePatterns = [
    /(\d+)\s*-\s*(\d+)\s*years/gi,
    /(\d+)\s*to\s*(\d+)\s*years/gi,
    /adult/gi,
    /pediatric/gi,
    /newborn/gi,
  ];

  agePatterns.forEach((pattern) => {
    const matches = text.match(pattern);
    if (matches) {
      ageGroups.push(...matches);
    }
  });

  return ageGroups;
}

function extractCriteriaSets(text: string, condition: string): any[] {
  const criteriaSets: any[] = [];
  const criteriaPatterns = [
    /criteria\s*:?\s*([^.]*)/gi,
    /diagnostic\s*criteria\s*:?\s*([^.]*)/gi,
  ];

  criteriaPatterns.forEach((pattern) => {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach((match) => {
        const criteria = match
          .replace(/criteria\s*:?\s*|diagnostic\s*criteria\s*:?\s*/gi, "")
          .trim();
        if (criteria.length > 10) {
          criteriaSets.push({
            name: `${condition} Criteria`,
            source: "Literature Review",
            criteria: [
              {
                category: "Diagnostic Criteria",
                items: [criteria],
                required_count: 1,
              },
            ],
          });
        }
      });
    }
  });

  return criteriaSets;
}

function extractRedFlags(text: string): string[] {
  const redFlags: string[] = [];
  const redFlagPatterns = [
    /red\s*flag\s*:?\s*([^.]*)/gi,
    /warning\s*sign\s*:?\s*([^.]*)/gi,
    /urgent\s*:?\s*([^.]*)/gi,
  ];

  redFlagPatterns.forEach((pattern) => {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach((match) => {
        const flag = match
          .replace(
            /red\s*flag\s*:?\s*|warning\s*sign\s*:?\s*|urgent\s*:?\s*/gi,
            "",
          )
          .trim();
        if (flag.length > 5) {
          redFlags.push(flag);
        }
      });
    }
  });

  return redFlags;
}

function extractDifferentialDiagnosis(text: string): string[] {
  const differential: string[] = [];
  const diffPatterns = [
    /differential\s*diagnosis\s*:?\s*([^.]*)/gi,
    /consider\s*:?\s*([^.]*)/gi,
    /rule\s*out\s*:?\s*([^.]*)/gi,
  ];

  diffPatterns.forEach((pattern) => {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach((match) => {
        const diagnosis = match
          .replace(
            /differential\s*diagnosis\s*:?\s*|consider\s*:?\s*|rule\s*out\s*:?\s*/gi,
            "",
          )
          .trim();
        if (diagnosis.length > 5) {
          differential.push(diagnosis);
        }
      });
    }
  });

  return differential;
}

export async function getDiagnosticCriteria(
  condition: string,
): Promise<DiagnosticCriteria | null> {
  try {
    // Search for diagnostic criteria dynamically from medical literature
    const searchTerms = [
      `"${condition}" AND "diagnostic criteria"`,
      `"${condition}" AND "DSM"`,
      `"${condition}" AND "ICD"`,
      `"${condition}" AND "diagnosis" AND "criteria"`,
    ];

    const criteria: DiagnosticCriteria[] = [];

    for (const term of searchTerms) {
      try {
        const searchRes = await superagent
          .get(`${PUBMED_API_BASE}/esearch.fcgi`)
          .query({
            db: "pubmed",
            term: term,
            retmode: "json",
            retmax: 5,
            sort: "relevance",
          })
          .set("User-Agent", USER_AGENT);

        const idList = searchRes.body.esearchresult?.idlist || [];
        if (idList.length > 0) {
          const fetchRes = await superagent
            .get(`${PUBMED_API_BASE}/efetch.fcgi`)
            .query({
              db: "pubmed",
              id: idList.join(","),
              retmode: "xml",
            })
            .set("User-Agent", USER_AGENT);

          const articles = parsePubMedXML(fetchRes.text);

          for (const article of articles) {
            const text = `${article.title} ${article.abstract}`.toLowerCase();

            if (text.includes("criteria") || text.includes("diagnosis")) {
              const criteriaSets = extractCriteriaSets(text, condition);
              const redFlags = extractRedFlags(text);
              const differential = extractDifferentialDiagnosis(text);

              if (criteriaSets.length > 0) {
                criteria.push({
                  condition: condition,
                  criteria_sets: criteriaSets,
                  red_flags: redFlags,
                  differential_diagnosis: differential,
                });
              }
            }
          }
        }
      } catch (error: any) {
        console.error(`Error searching diagnostic criteria: ${error.message}`);
        continue;
      }
    }

    // Return the first found criteria or null if none found
    return criteria.length > 0 ? criteria[0] : null;
  } catch (error) {
    console.error("Error getting diagnostic criteria:", error);
    return null;
  }
}
