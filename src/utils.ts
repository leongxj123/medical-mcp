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

// Google Scholar API functions
export async function searchGoogleScholar(
  query: string,
): Promise<GoogleScholarArticle[]> {
  let browser;
  try {
    // Add a small random delay to avoid rate limiting
    await randomDelay(1000, 3000);

    // Launch browser with stealth settings
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
        "--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ],
    });

    const page = await browser.newPage();

    // Set viewport and user agent
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );

    // Add extra headers to appear more like a real browser
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    });

    // Navigate to Google Scholar
    const searchUrl = `${GOOGLE_SCHOLAR_API_BASE}?q=${encodeURIComponent(query)}&hl=en`;
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 30000 });

    // Wait for results to load with multiple possible selectors
    try {
      await page.waitForSelector(".gs_r, .gs_ri", { timeout: 15000 });
    } catch (error) {
      // If no results found, check if there's a "no results" message
      const noResults = await page.$(".gs_r");
      if (!noResults) {
        throw new Error("No search results found or page structure changed");
      }
    }

    return await page.evaluate(() => {
      const results: GoogleScholarArticle[] = [];
      // Try multiple selectors for different Google Scholar layouts
      const articleElements = document.querySelectorAll(
        ".gs_r, .gs_ri, [data-rp]",
      );

      articleElements.forEach((element) => {
        // Try multiple selectors for title
        const titleElement =
          element.querySelector(".gs_rt a, .gs_rt, h3 a, h3") ||
          element.querySelector("a[data-clk]") ||
          element.querySelector("h3");
        const title = titleElement?.textContent?.trim() || "";
        const url = (titleElement as HTMLAnchorElement)?.href || "";

        // Try multiple selectors for authors/venue
        const authorsElement =
          element.querySelector(".gs_a, .gs_authors, .gs_venue") ||
          element.querySelector('[class*="author"]') ||
          element.querySelector('[class*="venue"]');
        const authors = authorsElement?.textContent?.trim() || "";

        // Try multiple selectors for abstract
        const abstractElement =
          element.querySelector(".gs_rs, .gs_rs_a, .gs_snippet") ||
          element.querySelector('[class*="snippet"]') ||
          element.querySelector('[class*="abstract"]');
        const abstract = abstractElement?.textContent?.trim() || "";

        // Try multiple selectors for citations
        const citationsElement =
          element.querySelector(".gs_fl a, .gs_fl") ||
          element.querySelector('[class*="citation"]') ||
          element.querySelector('a[href*="cites"]');
        const citations = citationsElement?.textContent?.trim() || "";

        // Extract year from various sources
        let year = "";
        const yearMatch =
          authors.match(/(\d{4})/) ||
          title.match(/(\d{4})/) ||
          abstract.match(/(\d{4})/);
        if (yearMatch) {
          year = yearMatch[1];
        }

        // Extract journal from authors string or other sources
        let journal = "";
        const journalMatch =
          authors.match(/- ([^-]+)$/) ||
          authors.match(/, ([^,]+)$/) ||
          authors.match(/in ([^,]+)/);
        if (journalMatch) {
          journal = journalMatch[1].trim();
        }

        if (title && title.length > 5) {
          // Only include if title is substantial
          results.push({
            title,
            authors,
            abstract,
            journal,
            year,
            citations,
            url,
          });
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

// Drug Safety Functions
export async function getDrugSafetyInfo(
  drugName: string,
): Promise<DrugSafetyInfo | null> {
  try {
    // This is a simplified implementation - in a real system, you would integrate with
    // specialized drug safety databases like LactMed, Reprotox, or commercial APIs

    // For now, we'll search PubMed for safety information
    const safetyTerms = [
      `"${drugName}" AND "pregnancy" AND "safety"`,
      `"${drugName}" AND "lactation" AND "breastfeeding"`,
      `"${drugName}" AND "contraindications"`,
      `"${drugName}" AND "adverse effects" AND "pregnancy"`,
    ];

    const safetyInfo: DrugSafetyInfo = {
      drug_name: drugName,
      last_updated: new Date().toISOString(),
    };

    // Search for pregnancy safety information
    for (const term of safetyTerms) {
      try {
        const searchRes = await superagent
          .get(`${PUBMED_API_BASE}/esearch.fcgi`)
          .query({
            db: "pubmed",
            term: term,
            retmode: "json",
            retmax: 5,
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

          // Extract safety information from abstracts
          for (const article of articles) {
            const abstract = (article.abstract || "").toLowerCase();
            const title = article.title.toLowerCase();

            // Determine pregnancy category based on content
            if (
              abstract.includes("pregnancy category") ||
              title.includes("pregnancy category")
            ) {
              if (
                abstract.includes("category a") ||
                abstract.includes("category b")
              ) {
                safetyInfo.pregnancy_category = abstract.includes("category a")
                  ? "A"
                  : "B";
              } else if (abstract.includes("category c")) {
                safetyInfo.pregnancy_category = "C";
              } else if (abstract.includes("category d")) {
                safetyInfo.pregnancy_category = "D";
              } else if (abstract.includes("category x")) {
                safetyInfo.pregnancy_category = "X";
              }
            }

            // Determine lactation safety
            if (
              abstract.includes("lactation") ||
              abstract.includes("breastfeeding")
            ) {
              if (abstract.includes("safe") && !abstract.includes("not safe")) {
                safetyInfo.lactation_safety = "Safe";
              } else if (
                abstract.includes("caution") ||
                abstract.includes("monitor")
              ) {
                safetyInfo.lactation_safety = "Caution";
              } else if (
                abstract.includes("avoid") ||
                abstract.includes("contraindicated")
              ) {
                safetyInfo.lactation_safety = "Avoid";
              }
            }

            // Extract contraindications
            if (
              abstract.includes("contraindication") ||
              abstract.includes("contraindicated")
            ) {
              if (!safetyInfo.contraindications) {
                safetyInfo.contraindications = [];
              }
              // This is simplified - in practice, you'd use NLP to extract specific contraindications
              safetyInfo.contraindications.push(
                "See full prescribing information for contraindications",
              );
            }
          }
        }
      } catch (error) {
        console.error(`Error searching safety info for term: ${term}`, error);
        continue;
      }
    }

    // Set defaults if no information found
    if (!safetyInfo.pregnancy_category) {
      safetyInfo.pregnancy_category = "N"; // Not classified
    }
    if (!safetyInfo.lactation_safety) {
      safetyInfo.lactation_safety = "Unknown";
    }

    return safetyInfo;
  } catch (error) {
    console.error("Error getting drug safety info:", error);
    return null;
  }
}

export async function checkDrugInteractions(
  drug1: string,
  drug2: string,
): Promise<DrugInteraction[]> {
  try {
    // Check for known safe combinations first
    const safeCombinations = [
      ["metformin", "insulin"],
      ["insulin", "metformin"],
      ["metformin", "glipizide"],
      ["glipizide", "metformin"],
      ["metformin", "sitagliptin"],
      ["sitagliptin", "metformin"],
      ["simvastatin", "amlodipine"],
      ["amlodipine", "simvastatin"],
      ["atorvastatin", "amlodipine"],
      ["amlodipine", "atorvastatin"],
      ["lisinopril", "amlodipine"],
      ["amlodipine", "lisinopril"],
      ["metoprolol", "amlodipine"],
      ["amlodipine", "metoprolol"],
      ["warfarin", "aspirin"],
      ["aspirin", "warfarin"],
      ["clopidogrel", "aspirin"],
      ["aspirin", "clopidogrel"],
    ];

    const drug1Lower = drug1.toLowerCase();
    const drug2Lower = drug2.toLowerCase();

    // Check if this is a known safe combination
    for (const [safe1, safe2] of safeCombinations) {
      if (
        (drug1Lower.includes(safe1) && drug2Lower.includes(safe2)) ||
        (drug1Lower.includes(safe2) && drug2Lower.includes(safe1))
      ) {
        // Provide specific guidance based on the combination
        let description = `Commonly used combination`;
        let clinicalEffects = "Generally safe when used together";
        let management = "Monitor as clinically indicated";

        if (safe1.includes("metformin") || safe2.includes("metformin")) {
          description = `Commonly used combination for diabetes management`;
          clinicalEffects = "Generally safe when used together";
          management = "Monitor blood glucose levels regularly";
        } else if (safe1.includes("simvastatin") || safe2.includes("simvastatin")) {
          description = `Commonly used combination for cardiovascular risk management`;
          clinicalEffects = "Generally safe with appropriate dose adjustments";
          management = "Limit simvastatin to ≤20mg daily, monitor for myopathy";
        } else if (safe1.includes("amlodipine") || safe2.includes("amlodipine")) {
          description = `Commonly used combination for hypertension management`;
          clinicalEffects = "Generally safe when used together";
          management = "Monitor blood pressure and adjust doses as needed";
        } else if (safe1.includes("warfarin") || safe2.includes("warfarin")) {
          description = `Commonly used combination for cardiovascular protection`;
          clinicalEffects = "Generally safe with appropriate monitoring";
          management = "Monitor INR closely, consider bleeding risk";
        }

        return [
          {
            drug1,
            drug2,
            severity: "Minor" as const,
            description: description,
            clinical_effects: clinicalEffects,
            management: management,
            evidence_level: "Clinical Practice",
          },
        ];
      }
    }

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

    // If no dynamic results found, provide fallback based on common symptoms
    if (results.possible_diagnoses.length === 0) {
      if (symptomString.includes("chest pain")) {
        results.possible_diagnoses = [
          {
            diagnosis: "Myocardial Infarction",
            probability: "High" as const,
            key_findings: ["ST elevation", "Troponin elevation"],
            next_steps: ["ECG", "Cardiac enzymes", "Chest X-ray"],
          },
          {
            diagnosis: "Pulmonary Embolism",
            probability: "Moderate" as const,
            key_findings: ["Dyspnea", "Tachycardia"],
            next_steps: ["D-dimer", "CT-PA", "Wells score"],
          },
          {
            diagnosis: "GERD",
            probability: "Moderate" as const,
            key_findings: ["Heartburn", "Regurgitation"],
            next_steps: ["PPI trial", "Endoscopy"],
          },
        ];
        results.red_flags = [
          "Sudden onset",
          "Radiation to arm/jaw",
          "Diaphoresis",
          "Nausea",
        ];
        results.urgent_considerations = [
          "Rule out MI",
          "Consider PE",
          "Assess vital signs",
        ];
      } else if (symptomString.includes("abdominal pain")) {
        results.possible_diagnoses = [
          {
            diagnosis: "Appendicitis",
            probability: "High" as const,
            key_findings: ["RLQ pain", "Rebound tenderness"],
            next_steps: ["CT abdomen", "Surgical consult"],
          },
          {
            diagnosis: "Cholecystitis",
            probability: "Moderate" as const,
            key_findings: ["RUQ pain", "Murphy's sign"],
            next_steps: ["Ultrasound", "LFTs"],
          },
          {
            diagnosis: "Gastroenteritis",
            probability: "Moderate" as const,
            key_findings: ["Nausea", "Vomiting", "Diarrhea"],
            next_steps: ["Stool studies", "Supportive care"],
          },
        ];
        results.red_flags = [
          "Severe pain",
          "Peritoneal signs",
          "Fever",
          "Vomiting",
        ];
        results.urgent_considerations = [
          "Rule out surgical emergency",
          "Assess for peritonitis",
        ];
      } else if (symptomString.includes("headache")) {
        // Check for classic meningitis presentation first
        if (symptomString.includes("fever") && symptomString.includes("neck stiffness")) {
          results.possible_diagnoses = [
            {
              diagnosis: "Bacterial Meningitis",
              probability: "High" as const,
              key_findings: ["Fever", "Neck stiffness", "Headache", "Altered mental status"],
              next_steps: ["Immediate LP", "Blood cultures", "Empiric antibiotics", "CT head if focal signs"],
            },
            {
              diagnosis: "Viral Meningitis",
              probability: "Moderate" as const,
              key_findings: ["Fever", "Neck stiffness", "Headache", "Less severe than bacterial"],
              next_steps: ["LP", "CSF analysis", "Supportive care"],
            },
            {
              diagnosis: "Subarachnoid Hemorrhage",
              probability: "Moderate" as const,
              key_findings: ["Thunderclap onset", "Neck stiffness", "Photophobia"],
              next_steps: ["CT head", "LP if CT negative", "Neurosurgical consult"],
            },
          ];
          results.red_flags = [
            "Fever with neck stiffness",
            "Altered mental status",
            "Thunderclap onset",
            "Focal neurological signs",
          ];
          results.urgent_considerations = [
            "IMMEDIATE: Rule out bacterial meningitis",
            "Consider empiric antibiotics",
            "Assess for increased ICP",
          ];
        } else {
          // Non-meningitis headache presentations
          results.possible_diagnoses = [
            {
              diagnosis: "Tension Headache",
              probability: "High" as const,
              key_findings: ["Bilateral", "Pressure-like", "No fever"],
              next_steps: ["Analgesics", "Stress management"],
            },
            {
              diagnosis: "Migraine",
              probability: "Moderate" as const,
              key_findings: ["Unilateral", "Photophobia", "Nausea"],
              next_steps: ["Triptans", "Preventive therapy"],
            },
            {
              diagnosis: "Subarachnoid Hemorrhage",
              probability: "Low" as const,
              key_findings: ["Thunderclap onset", "Severe intensity"],
              next_steps: ["CT head", "LP if CT negative"],
            },
          ];
          results.red_flags = [
            "Sudden onset",
            "Worst headache of life",
            "Fever",
            "Neck stiffness",
          ];
          results.urgent_considerations = [
            "Rule out SAH",
            "Assess for meningitis if fever present",
          ];
        }
      }
    }

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

    // Essential risk calculators as fallback
    const essentialCalculators: RiskCalculator[] = [
      {
        name: "APGAR Score",
        description:
          "Assessment of newborn's physical condition at 1 and 5 minutes after birth",
        parameters: [
          {
            name: "Appearance (Color)",
            type: "select",
            options: [
              "0 - Blue/pale",
              "1 - Body pink, extremities blue",
              "2 - Completely pink",
            ],
            required: true,
          },
          {
            name: "Pulse (Heart Rate)",
            type: "select",
            options: ["0 - Absent", "1 - <100 bpm", "2 - >100 bpm"],
            required: true,
          },
          {
            name: "Grimace (Reflex Irritability)",
            type: "select",
            options: [
              "0 - No response",
              "1 - Grimace",
              "2 - Cry or active withdrawal",
            ],
            required: true,
          },
          {
            name: "Activity (Muscle Tone)",
            type: "select",
            options: ["0 - Flaccid", "1 - Some flexion", "2 - Active motion"],
            required: true,
          },
          {
            name: "Respiration (Breathing)",
            type: "select",
            options: ["0 - Absent", "1 - Slow/irregular", "2 - Good, crying"],
            required: true,
          },
        ],
        calculation: "Sum of all parameters (0-10)",
        interpretation: {
          low_risk: "7-10: Normal, routine care",
          moderate_risk: "4-6: Some assistance needed, may need stimulation",
          high_risk: "0-3: Immediate resuscitation required",
        },
        references: [
          "American Academy of Pediatrics",
          "Neonatal Resuscitation Program",
        ],
      },
      {
        name: "Bishop Score",
        description: "Assessment of cervical readiness for labor induction",
        parameters: [
          { name: "Dilation (cm)", type: "number", required: true },
          { name: "Effacement (%)", type: "number", required: true },
          {
            name: "Station",
            type: "select",
            options: ["-3", "-2", "-1", "0", "+1", "+2", "+3"],
            required: true,
          },
          {
            name: "Consistency",
            type: "select",
            options: ["Firm", "Medium", "Soft"],
            required: true,
          },
          {
            name: "Position",
            type: "select",
            options: ["Posterior", "Mid", "Anterior"],
            required: true,
          },
        ],
        calculation: "Sum of all parameters (0-13)",
        interpretation: {
          low_risk: "0-4: Unfavorable for induction",
          moderate_risk: "5-9: Moderate success rate",
          high_risk: "10-13: Favorable for induction",
        },
        references: ["ACOG Practice Bulletin", "Obstetric Guidelines"],
      },
    ];

    return [...essentialCalculators, ...additionalCalculators];
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

    // Combine essential lab values with dynamically found ones
    const essentialLabValues: LabValue[] = [
      {
        test_name: "Hemoglobin",
        normal_ranges: [
          {
            age_group: "Adult",
            male_range: "13.8-17.2",
            female_range: "12.1-15.1",
            units: "g/dL",
          },
          {
            age_group: "Pregnancy",
            pregnancy_status: "1st trimester",
            male_range: "11.0-13.0",
            female_range: "11.0-13.0",
            units: "g/dL",
          },
          {
            age_group: "Pregnancy",
            pregnancy_status: "2nd trimester",
            male_range: "10.5-14.0",
            female_range: "10.5-14.0",
            units: "g/dL",
          },
          {
            age_group: "Pregnancy",
            pregnancy_status: "3rd trimester",
            male_range: "11.0-15.0",
            female_range: "11.0-15.0",
            units: "g/dL",
          },
          {
            age_group: "Newborn",
            male_range: "14.0-24.0",
            female_range: "14.0-24.0",
            units: "g/dL",
          },
        ],
        critical_values: { low: "<7.0", high: ">20.0" },
        interpretation: "Measures oxygen-carrying capacity of blood",
        clinical_significance:
          "Low values indicate anemia; high values may indicate polycythemia",
      },
      {
        test_name: "White Blood Cell Count",
        normal_ranges: [
          {
            age_group: "Adult",
            male_range: "4.5-11.0",
            female_range: "4.5-11.0",
            units: "×10³/μL",
          },
          {
            age_group: "Pregnancy",
            pregnancy_status: "All trimesters",
            male_range: "5.7-13.6",
            female_range: "5.7-13.6",
            units: "×10³/μL",
          },
          {
            age_group: "Newborn",
            male_range: "9.0-30.0",
            female_range: "9.0-30.0",
            units: "×10³/μL",
          },
        ],
        critical_values: { low: "<2.0", high: ">30.0" },
        interpretation: "Measures immune system cell count",
        clinical_significance:
          "Low values indicate immunosuppression; high values suggest infection or inflammation",
      },
    ];

    return [...essentialLabValues, ...additionalLabValues];
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

export async function getDiagnosticCriteria(
  condition: string,
): Promise<DiagnosticCriteria | null> {
  try {
    // Search for diagnostic criteria in medical literature with more specific terms
    const terms = [
      `"${condition}" AND "diagnostic criteria" AND "guidelines"`,
      `"${condition}" AND "DSM-5"`,
      `"${condition}" AND "ICD-11"`,
      `"${condition}" AND "diagnosis" AND "classification"`,
      `"${condition}" AND "definition" AND "criteria"`,
    ];

    const criteria: DiagnosticCriteria = {
      condition: condition,
      criteria_sets: [],
      differential_diagnosis: [],
      red_flags: [],
    };

    for (const term of terms) {
      try {
        const searchRes = await superagent
          .get(`${PUBMED_API_BASE}/esearch.fcgi`)
          .query({
            db: "pubmed",
            term: term,
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
            const text = `${article.title} ${article.abstract}`;
            const textLower = text.toLowerCase();

            // Only process if it contains actual diagnostic criteria
            if (
              textLower.includes("criteria") &&
              (textLower.includes("diagnosis") ||
                textLower.includes("classification")) &&
              !textLower.includes("no criteria") &&
              !textLower.includes("criteria not")
            ) {
              // Extract structured criteria sets using improved NLP patterns
              const criteriaSets = extractStructuredCriteria(
                text,
                condition,
                article.journal,
              );
              const redFlags = extractRedFlags(text);
              const differential = extractDifferentialDiagnosis(text);

              if (criteriaSets.length > 0) {
                criteria.criteria_sets.push(...criteriaSets);
              }
              if (redFlags.length > 0) {
                criteria.red_flags.push(...redFlags);
              }
              if (differential.length > 0) {
                criteria.differential_diagnosis.push(...differential);
              }
            }
          }
        }
      } catch (error) {
        console.error(
          `Error searching diagnostic criteria for ${condition}:`,
          error,
        );
        continue;
      }
    }

    // If no criteria found through dynamic search, return null
    // This is better than showing fragmented, unusable data
    if (criteria.criteria_sets.length === 0) {
      return null;
    }

    // Remove duplicates and clean up the results
    const uniqueCriteriaSets = criteria.criteria_sets.filter(
      (set, index, self) =>
        index ===
        self.findIndex((s) => s.name === set.name && s.source === set.source),
    );

    criteria.criteria_sets = uniqueCriteriaSets;

    return criteria;
  } catch (error) {
    console.error("Error getting diagnostic criteria:", error);
    return null;
  }
}

// Helper functions for extracting criteria from text
function extractStructuredCriteria(
  text: string,
  condition: string,
  journal: string,
): any[] {
  const criteriaSets: any[] = [];
  const textLower = text.toLowerCase();

  // Look for specific diagnostic patterns - balanced approach
  const diagnosticPatterns = [
    // Blood pressure patterns
    /(?:systolic|sbp)\s*(\d+)-(\d+)\s*(?:mmhg|mm hg).*?(?:diastolic|dbp)\s*(\d+)-(\d+)\s*(?:mmhg|mm hg)/gi,
    /(?:systolic|sbp)\s*(?:≥|>=|greater than or equal to)\s*(\d+)\s*(?:mmhg|mm hg).*?(?:diastolic|dbp)\s*(?:≥|>=|greater than or equal to)\s*(\d+)\s*(?:mmhg|mm hg)/gi,
    /(?:stage\s*[12]|mild|moderate|severe)\s*[:\s]*(?:systolic|sbp|diastolic|dbp)\s*[^.]{10,80}/gi,

    // Blood glucose patterns
    /(?:fasting|fpg|fasting plasma glucose)\s*(?:≥|>=|greater than or equal to)\s*(\d+)\s*(?:mg\/dl|mg\/dL)/gi,
    /(?:hba1c|hemoglobin a1c|a1c)\s*(?:≥|>=|greater than or equal to)\s*(\d+\.?\d*)\s*%/gi,
    /(?:random|casual)\s*(?:glucose|blood glucose)\s*(?:≥|>=|greater than or equal to)\s*(\d+)\s*(?:mg\/dl|mg\/dL)/gi,
    /(?:ogtt|oral glucose tolerance test)\s*(?:≥|>=|greater than or equal to)\s*(\d+)\s*(?:mg\/dl|mg\/dL)/gi,

    // General criteria patterns - more balanced
    /(?:diagnostic criteria|diagnosis requires?|must have)[:\s]*([^.]{20,120})/gi,
    /(?:criteria|definition)[:\s]*([^.]{20,120})/gi,
  ];

  // Extract blood pressure criteria
  if (
    textLower.includes("hypertension") ||
    textLower.includes("blood pressure")
  ) {
    const bpCriteria = extractBloodPressureCriteria(text);
    if (bpCriteria.length > 0) {
      criteriaSets.push({
        name: "Hypertension Diagnostic Criteria",
        source: journal || "Literature Review",
        criteria: bpCriteria,
      });
    }
  }

  // Extract diabetes criteria
  if (textLower.includes("diabetes") || textLower.includes("diabetic")) {
    const diabetesCriteria = extractDiabetesCriteria(text);
    if (diabetesCriteria.length > 0) {
      criteriaSets.push({
        name: "Diabetes Diagnostic Criteria",
        source: journal || "Literature Review",
        criteria: diabetesCriteria,
      });
    }
  }

  // Extract general criteria patterns - only if they look like actual diagnostic criteria
  diagnosticPatterns.forEach((pattern) => {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach((match) => {
        const criteria = match.trim();
        // Balanced filtering - must contain actual diagnostic information
        if (
          criteria.length > 20 &&
          criteria.length < 150 &&
          (criteria.includes("≥") ||
            criteria.includes(">") ||
            criteria.includes("<") ||
            criteria.includes("stage") ||
            criteria.includes("criteria") ||
            criteria.includes("diagnosis") ||
            criteria.includes("mmhg") ||
            criteria.includes("mg/dl") ||
            criteria.includes("%"))
        ) {
          // Try to extract structured information
          const structuredCriteria = parseCriteriaText(criteria, condition);
          if (structuredCriteria.length > 0) {
            criteriaSets.push({
              name: `${condition} Criteria`,
              source: journal || "Literature Review",
              criteria: structuredCriteria,
            });
          }
        }
      });
    }
  });

  return criteriaSets;
}

function extractBloodPressureCriteria(text: string): any[] {
  const criteria: any[] = [];
  const textLower = text.toLowerCase();

  // Look for specific BP values
  const stage1Pattern =
    /(?:stage\s*1|mild)[:\s]*(?:systolic|sbp)\s*(\d+)-(\d+)\s*(?:mmhg|mm hg).*?(?:diastolic|dbp)\s*(\d+)-(\d+)\s*(?:mmhg|mm hg)/gi;
  const stage2Pattern =
    /(?:stage\s*2|moderate|severe)[:\s]*(?:systolic|sbp)\s*(?:≥|>=|greater than or equal to)\s*(\d+)\s*(?:mmhg|mm hg).*?(?:diastolic|dbp)\s*(?:≥|>=|greater than or equal to)\s*(\d+)\s*(?:mmhg|mm hg)/gi;
  const crisisPattern =
    /(?:crisis|emergency)[:\s]*(?:systolic|sbp)\s*(?:>|greater than)\s*(\d+)\s*(?:mmhg|mm hg).*?(?:diastolic|dbp)\s*(?:>|greater than)\s*(\d+)\s*(?:mmhg|mm hg)/gi;

  if (stage1Pattern.test(text)) {
    criteria.push({
      category: "Stage 1 Hypertension",
      items: ["Systolic 130-139 mmHg", "Diastolic 80-89 mmHg"],
      required_count: 1,
    });
  }

  if (stage2Pattern.test(text)) {
    criteria.push({
      category: "Stage 2 Hypertension",
      items: ["Systolic ≥140 mmHg", "Diastolic ≥90 mmHg"],
      required_count: 1,
    });
  }

  if (crisisPattern.test(text)) {
    criteria.push({
      category: "Hypertensive Crisis",
      items: ["Systolic >180 mmHg", "Diastolic >120 mmHg"],
      required_count: 1,
    });
  }

  return criteria;
}

function extractDiabetesCriteria(text: string): any[] {
  const criteria: any[] = [];
  const textLower = text.toLowerCase();

  // Look for specific diabetes criteria
  const fpgPattern =
    /(?:fasting|fpg|fasting plasma glucose)\s*(?:≥|>=|greater than or equal to)\s*(\d+)\s*(?:mg\/dl|mg\/dL)/gi;
  const a1cPattern =
    /(?:hba1c|hemoglobin a1c|a1c)\s*(?:≥|>=|greater than or equal to)\s*(\d+\.?\d*)\s*%/gi;
  const randomPattern =
    /(?:random|casual)\s*(?:glucose|blood glucose)\s*(?:≥|>=|greater than or equal to)\s*(\d+)\s*(?:mg\/dl|mg\/dL)/gi;
  const ogttPattern =
    /(?:ogtt|oral glucose tolerance test)\s*(?:≥|>=|greater than or equal to)\s*(\d+)\s*(?:mg\/dl|mg\/dL)/gi;

  if (fpgPattern.test(text)) {
    criteria.push({
      category: "Fasting Plasma Glucose",
      items: ["≥126 mg/dL (7.0 mmol/L)"],
      required_count: 1,
    });
  }

  if (a1cPattern.test(text)) {
    criteria.push({
      category: "Hemoglobin A1C",
      items: ["≥6.5%"],
      required_count: 1,
    });
  }

  if (randomPattern.test(text)) {
    criteria.push({
      category: "Random Plasma Glucose",
      items: ["≥200 mg/dL (11.1 mmol/L) with symptoms"],
      required_count: 1,
    });
  }

  if (ogttPattern.test(text)) {
    criteria.push({
      category: "Oral Glucose Tolerance Test",
      items: ["2-hour plasma glucose ≥200 mg/dL (11.1 mmol/L)"],
      required_count: 1,
    });
  }

  return criteria;
}

function parseCriteriaText(criteria: string, condition: string): any[] {
  // Try to parse structured criteria from text - be more selective
  const items = criteria
    .split(/[,;]|\band\b/)
    .map((item) => item.trim())
    .filter((item) => {
      // Include items that look like actual diagnostic criteria
      return (
        item.length > 8 &&
        item.length < 120 &&
        (item.includes("≥") ||
          item.includes(">") ||
          item.includes("<") ||
          item.includes("stage") ||
          item.includes("criteria") ||
          item.includes("diagnosis") ||
          item.includes("mmhg") ||
          item.includes("mg/dl") ||
          item.includes("%") ||
          item.includes("hypertension") ||
          item.includes("diabetes") ||
          item.includes("glucose"))
      );
    });

  if (items.length > 0) {
    return [
      {
        category: "Diagnostic Criteria",
        items: items,
        required_count: items.length > 1 ? Math.ceil(items.length / 2) : 1,
      },
    ];
  }

  return [];
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
