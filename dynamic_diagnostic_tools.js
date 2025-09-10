// Dynamic Diagnostic Tools - Search real medical databases
import superagent from "superagent";

const PUBMED_API_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const WHO_API_BASE = "https://ghoapi.azureedge.net/api";
const USER_AGENT = "Medical-MCP/1.0.0";

// Dynamic Risk Calculator Search
export async function searchRiskCalculatorsDynamic(condition) {
  console.log(`🔍 Searching risk calculators for: ${condition}`);

  const terms = [
    `"${condition}" AND "risk calculator"`,
    `"${condition}" AND "scoring system"`,
    `"${condition}" AND "risk assessment"`,
    `"${condition}" AND "prognostic score"`,
  ];

  const calculators = [];
  const sources = [];

  for (const term of terms) {
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

          // Extract calculator information
          if (
            text.includes("calculator") ||
            text.includes("score") ||
            text.includes("risk")
          ) {
            const calculatorName = extractCalculatorName(article.title, text);
            const parameters = extractParameters(text);
            const validation = extractValidation(text);

            if (calculatorName) {
              calculators.push({
                name: calculatorName,
                condition: condition,
                parameters: parameters,
                validation: validation,
                source: {
                  title: article.title,
                  journal: article.journal,
                  year: article.publication_date,
                  pmid: article.pmid,
                },
              });
            }

            sources.push({
              title: article.title,
              journal: article.journal,
              year: article.publication_date,
              pmid: article.pmid,
            });
          }
        }
      }
    } catch (error) {
      console.error(`Error searching risk calculators: ${error.message}`);
      continue;
    }
  }

  return {
    calculators: calculators,
    sources: sources,
    search_term: condition,
  };
}

// Dynamic Lab Values Search
export async function searchLabValuesDynamic(testName) {
  console.log(`🔍 Searching lab values for: ${testName}`);

  const terms = [
    `"${testName}" AND "normal range"`,
    `"${testName}" AND "reference range"`,
    `"${testName}" AND "critical value"`,
    `"${testName}" AND "pregnancy" AND "range"`,
  ];

  const labValues = [];
  const sources = [];

  for (const term of terms) {
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

          if (
            text.includes("normal range") ||
            text.includes("reference range")
          ) {
            const ranges = extractLabRanges(text, testName);
            const criticalValues = extractCriticalValues(text);
            const ageGroups = extractAgeGroups(text);

            if (ranges.length > 0) {
              labValues.push({
                test_name: testName,
                normal_ranges: ranges,
                critical_values: criticalValues,
                age_groups: ageGroups,
                source: {
                  title: article.title,
                  journal: article.journal,
                  year: article.publication_date,
                  pmid: article.pmid,
                },
              });
            }

            sources.push({
              title: article.title,
              journal: article.journal,
              year: article.publication_date,
              pmid: article.pmid,
            });
          }
        }
      }
    } catch (error) {
      console.error(`Error searching lab values: ${error.message}`);
      continue;
    }
  }

  return {
    lab_values: labValues,
    sources: sources,
    search_term: testName,
  };
}

// Dynamic Diagnostic Criteria Search
export async function searchDiagnosticCriteriaDynamic(condition) {
  console.log(`🔍 Searching diagnostic criteria for: ${condition}`);

  const terms = [
    `"${condition}" AND "diagnostic criteria"`,
    `"${condition}" AND "DSM"`,
    `"${condition}" AND "ICD"`,
    `"${condition}" AND "diagnosis" AND "criteria"`,
  ];

  const criteria = [];
  const sources = [];

  for (const term of terms) {
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
                source: {
                  title: article.title,
                  journal: article.journal,
                  year: article.publication_date,
                  pmid: article.pmid,
                },
              });
            }

            sources.push({
              title: article.title,
              journal: article.journal,
              year: article.publication_date,
              pmid: article.pmid,
            });
          }
        }
      }
    } catch (error) {
      console.error(`Error searching diagnostic criteria: ${error.message}`);
      continue;
    }
  }

  return {
    criteria: criteria,
    sources: sources,
    search_term: condition,
  };
}

// Helper functions for extracting information
function extractCalculatorName(title, text) {
  // Extract calculator name from title or text
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

function extractParameters(text) {
  const parameters = [];
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

function extractValidation(text) {
  if (text.includes("validated") || text.includes("validation")) {
    return "Validated";
  } else if (text.includes("prospective") || text.includes("cohort")) {
    return "Prospective Study";
  } else {
    return "Literature Review";
  }
}

function extractLabRanges(text, testName) {
  const ranges = [];
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
            low: parts[1],
            high: parts[2],
            units: parts[3],
          });
        }
      });
    }
  });

  return ranges;
}

function extractCriticalValues(text) {
  const critical = { low: null, high: null };
  const criticalPatterns = [
    /critical\s*value\s*[<>]\s*(\d+\.?\d*)/gi,
    /alert\s*value\s*[<>]\s*(\d+\.?\d*)/gi,
  ];

  criticalPatterns.forEach((pattern) => {
    const matches = text.match(pattern);
    if (matches) {
      matches.forEach((match) => {
        if (match.includes("<")) {
          critical.low = match.match(/(\d+\.?\d*)/)[1];
        } else if (match.includes(">")) {
          critical.high = match.match(/(\d+\.?\d*)/)[1];
        }
      });
    }
  });

  return critical;
}

function extractAgeGroups(text) {
  const ageGroups = [];
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

function extractCriteriaSets(text, condition) {
  const criteriaSets = [];
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

function extractRedFlags(text) {
  const redFlags = [];
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

function extractDifferentialDiagnosis(text) {
  const differential = [];
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

// Simple XML parser for PubMed
function parsePubMedXML(xmlText) {
  const articles = [];
  const titleRegex = /<ArticleTitle[^>]*>([^<]*)<\/ArticleTitle>/g;
  const abstractRegex = /<AbstractText[^>]*>([^<]*)<\/AbstractText>/g;
  const journalRegex = /<Journal[^>]*>[\s\S]*?<Title>([^<]*)<\/Title>/g;
  const pmidRegex = /<PMID[^>]*>([^<]*)<\/PMID>/g;
  const dateRegex = /<PubDate[^>]*>[\s\S]*?<Year>([^<]*)<\/Year>/g;

  let titleMatch, abstractMatch, journalMatch, pmidMatch, dateMatch;
  const titles = [];
  const abstracts = [];
  const journals = [];
  const pmids = [];
  const dates = [];

  while ((titleMatch = titleRegex.exec(xmlText)) !== null) {
    titles.push(titleMatch[1]);
  }
  while ((abstractMatch = abstractRegex.exec(xmlText)) !== null) {
    abstracts.push(abstractMatch[1]);
  }
  while ((journalMatch = journalRegex.exec(xmlText)) !== null) {
    journals.push(journalMatch[1]);
  }
  while ((pmidMatch = pmidRegex.exec(xmlText)) !== null) {
    pmids.push(pmidMatch[1]);
  }
  while ((dateMatch = dateRegex.exec(xmlText)) !== null) {
    dates.push(dateMatch[1]);
  }

  for (let i = 0; i < Math.max(titles.length, pmids.length); i++) {
    articles.push({
      title: titles[i] || "No title available",
      abstract: abstracts[i] || "No abstract available",
      journal: journals[i] || "No journal available",
      pmid: pmids[i] || "No PMID available",
      publication_date: dates[i] || "No date available",
    });
  }

  return articles;
}

// Test the dynamic diagnostic tools
async function testDynamicDiagnosticTools() {
  console.log("🧪 Testing Dynamic Diagnostic Tools...\n");

  // Test risk calculators
  const riskResults = await searchRiskCalculatorsDynamic("preeclampsia");
  console.log("Risk Calculator Results:", JSON.stringify(riskResults, null, 2));

  // Test lab values
  const labResults = await searchLabValuesDynamic("hemoglobin");
  console.log("\nLab Values Results:", JSON.stringify(labResults, null, 2));

  // Test diagnostic criteria
  const criteriaResults = await searchDiagnosticCriteriaDynamic("depression");
  console.log(
    "\nDiagnostic Criteria Results:",
    JSON.stringify(criteriaResults, null, 2),
  );
}

// Uncomment to test
// testDynamicDiagnosticTools();
