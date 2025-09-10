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

        // Add the data to results
        countryData.forEach((data) => {
          results.push({
            IndicatorCode: indicator.IndicatorCode,
            IndicatorName: data.indicator,
            SpatialDimType: "Country",
            SpatialDim: data.country,
            TimeDim: data.year.toString(),
            TimeDimType: "Year",
            DataSourceDim: "WHO",
            DataSourceType: "Official",
            Value: data.value,
            NumericValue: data.value,
            Low: 0,
            High: 0,
            Comments: `Unit: ${data.unit}`,
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

          for (const article of articles) {
            const abstract = (article.abstract || "").toLowerCase();

            if (
              abstract.includes("interaction") ||
              abstract.includes("contraindication")
            ) {
              let severity: "Minor" | "Moderate" | "Major" | "Contraindicated" =
                "Moderate";

              if (
                abstract.includes("severe") ||
                abstract.includes("major") ||
                abstract.includes("contraindicated")
              ) {
                severity = abstract.includes("contraindicated")
                  ? "Contraindicated"
                  : "Major";
              } else if (
                abstract.includes("minor") ||
                abstract.includes("mild")
              ) {
                severity = "Minor";
              }

              interactions.push({
                drug1,
                drug2,
                severity,
                description: `Interaction between ${drug1} and ${drug2}`,
                clinical_effects:
                  "See full prescribing information for details",
                management:
                  "Consult healthcare provider before combining medications",
                evidence_level: "Literature Review",
              });
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

// Diagnostic Support Functions
export function generateDifferentialDiagnosis(
  symptoms: string[],
): DifferentialDiagnosis {
  // This is a simplified implementation - in practice, you'd use a comprehensive
  // medical knowledge base or AI model trained on clinical data

  const symptomString = symptoms.join(" ").toLowerCase();

  // Common differential diagnoses based on symptoms
  const commonDiagnoses = {
    "chest pain": [
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
    ],
    "abdominal pain": [
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
    ],
    headache: [
      {
        diagnosis: "Tension Headache",
        probability: "High" as const,
        key_findings: ["Bilateral", "Pressure-like"],
        next_steps: ["Analgesics", "Stress management"],
      },
      {
        diagnosis: "Migraine",
        probability: "Moderate" as const,
        key_findings: ["Unilateral", "Photophobia"],
        next_steps: ["Triptans", "Preventive therapy"],
      },
      {
        diagnosis: "Subarachnoid Hemorrhage",
        probability: "Low" as const,
        key_findings: ["Thunderclap onset", "Neck stiffness"],
        next_steps: ["CT head", "LP if CT negative"],
      },
    ],
  };

  let possibleDiagnoses: {
    diagnosis: string;
    probability: "Low" | "Moderate" | "High";
    key_findings: string[];
    next_steps: string[];
  }[] = [];
  let redFlags: string[] = [];
  let urgentConsiderations: string[] = [];

  // Find matching diagnoses
  for (const [symptomPattern, diagnoses] of Object.entries(commonDiagnoses)) {
    if (symptomString.includes(symptomPattern)) {
      possibleDiagnoses = diagnoses;
      break;
    }
  }

  // Add red flags based on symptoms
  if (symptomString.includes("chest pain")) {
    redFlags.push(
      "Sudden onset",
      "Radiation to arm/jaw",
      "Diaphoresis",
      "Nausea",
    );
    urgentConsiderations.push(
      "Rule out MI",
      "Consider PE",
      "Assess vital signs",
    );
  }
  if (symptomString.includes("abdominal pain")) {
    redFlags.push("Severe pain", "Peritoneal signs", "Fever", "Vomiting");
    urgentConsiderations.push(
      "Rule out surgical emergency",
      "Assess for peritonitis",
    );
  }
  if (symptomString.includes("headache")) {
    redFlags.push(
      "Sudden onset",
      "Worst headache of life",
      "Fever",
      "Neck stiffness",
    );
    urgentConsiderations.push("Rule out SAH", "Assess for meningitis");
  }

  return {
    symptoms,
    possible_diagnoses: possibleDiagnoses,
    red_flags: redFlags,
    urgent_considerations: urgentConsiderations,
  };
}

export function getRiskCalculators(): RiskCalculator[] {
  return [
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
}

export function getLabValues(): LabValue[] {
  return [
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
}

export function getDiagnosticCriteria(
  condition: string,
): DiagnosticCriteria | null {
  const criteriaDatabase: { [key: string]: DiagnosticCriteria } = {
    "major depressive disorder": {
      condition: "Major Depressive Disorder",
      criteria_sets: [
        {
          name: "DSM-5 Criteria",
          source:
            "Diagnostic and Statistical Manual of Mental Disorders, 5th Edition",
          criteria: [
            {
              category: "Core Symptoms",
              items: [
                "Depressed mood most of the day, nearly every day",
                "Markedly diminished interest or pleasure in activities",
              ],
              required_count: 1,
            },
            {
              category: "Additional Symptoms",
              items: [
                "Significant weight loss or gain",
                "Insomnia or hypersomnia",
                "Psychomotor agitation or retardation",
                "Fatigue or loss of energy",
                "Feelings of worthlessness or guilt",
                "Diminished ability to think or concentrate",
                "Recurrent thoughts of death or suicide",
              ],
              required_count: 4,
            },
          ],
        },
      ],
      differential_diagnosis: [
        "Bipolar Disorder",
        "Persistent Depressive Disorder",
        "Adjustment Disorder",
        "Substance-Induced Mood Disorder",
        "Medical Condition-Related Depression",
      ],
      red_flags: [
        "Suicidal ideation",
        "Psychotic features",
        "Catatonic features",
        "Melancholic features",
      ],
    },
    preeclampsia: {
      condition: "Preeclampsia",
      criteria_sets: [
        {
          name: "ACOG Criteria",
          source: "American College of Obstetricians and Gynecologists",
          criteria: [
            {
              category: "Required",
              items: [
                "Systolic BP ≥140 mmHg or diastolic BP ≥90 mmHg on two occasions at least 4 hours apart",
                "Proteinuria ≥300 mg/24 hours or protein/creatinine ratio ≥0.3",
              ],
              required_count: 2,
            },
            {
              category: "Severe Features",
              items: [
                "Systolic BP ≥160 mmHg or diastolic BP ≥110 mmHg",
                "Thrombocytopenia (<100,000/μL)",
                "Impaired liver function (elevated transaminases)",
                "Progressive renal insufficiency",
                "Pulmonary edema",
                "New-onset headache or visual disturbances",
              ],
              required_count: 0,
            },
          ],
        },
      ],
      differential_diagnosis: [
        "Chronic Hypertension",
        "Gestational Hypertension",
        "HELLP Syndrome",
        "Eclampsia",
        "Other causes of proteinuria",
      ],
      red_flags: [
        "Severe hypertension",
        "Severe headache",
        "Visual changes",
        "Epigastric pain",
        "Decreased urine output",
        "Altered mental status",
      ],
    },
  };

  return criteriaDatabase[condition.toLowerCase()] || null;
}
