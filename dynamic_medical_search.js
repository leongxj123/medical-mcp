// Dynamic Medical Search - Real-time data from multiple sources
import superagent from "superagent";

const PUBMED_API_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const FDA_API_BASE = "https://api.fda.gov";
const WHO_API_BASE = "https://ghoapi.azureedge.net/api";
const USER_AGENT = "Medical-MCP/1.0.0";

// Dynamic Drug Safety Search
export async function searchDrugSafetyDynamic(drugName) {
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
    successful_sources: sources.filter((s) => s.status === "fulfilled").length,
    data: {},
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

  return results;
}

// Search pregnancy safety from multiple sources
async function searchPregnancySafety(drugName) {
  const terms = [
    `"${drugName}" AND "pregnancy" AND ("FDA category" OR "pregnancy category")`,
    `"${drugName}" AND "teratogenic" AND "pregnancy"`,
    `"${drugName}" AND "fetal" AND "safety"`,
    `"${drugName}" AND "reproductive" AND "toxicity"`,
  ];

  const results = {
    sources: [],
    pregnancy_category: null,
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
    } catch (error) {
      console.error(`Error searching pregnancy safety: ${error.message}`);
      continue;
    }
  }

  return results;
}

// Search lactation safety
async function searchLactationSafety(drugName) {
  const terms = [
    `"${drugName}" AND "lactation" AND "safety"`,
    `"${drugName}" AND "breastfeeding" AND "safe"`,
    `"${drugName}" AND "milk" AND "transfer"`,
    `"${drugName}" AND "lactmed"`,
  ];

  const results = {
    sources: [],
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
    } catch (error) {
      console.error(`Error searching lactation safety: ${error.message}`);
      continue;
    }
  }

  return results;
}

// Search contraindications dynamically
async function searchContraindications(drugName) {
  const terms = [
    `"${drugName}" AND "contraindication"`,
    `"${drugName}" AND "contraindicated"`,
    `"${drugName}" AND "avoid" AND "pregnancy"`,
    `"${drugName}" AND "not recommended"`,
  ];

  const contraindications = [];
  const sources = [];

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
    } catch (error) {
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
async function searchFDAWarnings(drugName) {
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
      const warnings = [];
      const monitoring = [];

      if (drug.warnings && drug.warnings.length > 0) {
        warnings.push(...drug.warnings);
      }

      if (
        drug.dosage_and_administration &&
        drug.dosage_and_administration.length > 0
      ) {
        drug.dosage_and_administration.forEach((dosage) => {
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
  } catch (error) {
    console.error(`Error searching FDA warnings: ${error.message}`);
  }

  return { source: "FDA Database", error: "No data found" };
}

// Search drug interactions dynamically
async function searchDrugInteractions(drugName) {
  const terms = [
    `"${drugName}" AND "drug interaction"`,
    `"${drugName}" AND "pharmacokinetic" AND "interaction"`,
    `"${drugName}" AND "cyp" AND "inhibition"`,
  ];

  const interactions = [];
  const sources = [];

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
    } catch (error) {
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

// Dynamic Differential Diagnosis Search
export async function searchDifferentialDiagnosisDynamic(symptoms) {
  console.log(
    `🔍 Searching differential diagnosis for: ${symptoms.join(", ")}`,
  );

  const symptomString = symptoms.join(" ").toLowerCase();
  const searchTerms = [
    `"${symptomString}" AND "differential diagnosis"`,
    `"${symptomString}" AND "diagnosis" AND "symptoms"`,
    `"${symptomString}" AND "clinical presentation"`,
  ];

  const results = {
    symptoms: symptoms,
    possible_diagnoses: [],
    red_flags: [],
    urgent_considerations: [],
    sources: [],
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
                    probability: "Moderate",
                    source: article.title,
                    pmid: article.pmid,
                  });
                }
              });
            }
          });

          results.sources.push({
            title: article.title,
            journal: article.journal,
            year: article.publication_date,
            pmid: article.pmid,
          });
        }
      }
    } catch (error) {
      console.error(`Error searching differential diagnosis: ${error.message}`);
      continue;
    }
  }

  return results;
}

// Simple XML parser for PubMed
function parsePubMedXML(xmlText) {
  const articles = [];
  const titleRegex = /<ArticleTitle[^>]*>([^<]*)<\/ArticleTitle>/g;
  const abstractRegex = /<AbstractText[^>]*>([^<]*)<\/AbstractText>/g;
  const journalRegex = /<Journal[^>]*>[\s\S]*?<Title>([^<]*)<\/Title>/g;
  const pmidRegex = /<PMID[^>]*>([^<]*)<\/PMID>/g;
  const dateRegex = /<PubDate[^>]*>[\s\S]*?<Year>([^<]*)<\/Year>/g;
  const authorRegex =
    /<Author[^>]*>[\s\S]*?<LastName>([^<]*)<\/LastName>[\s\S]*?<ForeName>([^<]*)<\/ForeName>/g;
  const doiRegex =
    /<ELocationID[^>]*EIdType="doi"[^>]*>([^<]*)<\/ELocationID>/g;

  let titleMatch,
    abstractMatch,
    journalMatch,
    pmidMatch,
    dateMatch,
    authorMatch,
    doiMatch;
  const titles = [];
  const abstracts = [];
  const journals = [];
  const pmids = [];
  const dates = [];
  const authors = [];
  const dois = [];

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
  while ((authorMatch = authorRegex.exec(xmlText)) !== null) {
    authors.push(`${authorMatch[2]} ${authorMatch[1]}`);
  }
  while ((doiMatch = doiRegex.exec(xmlText)) !== null) {
    dois.push(doiMatch[1]);
  }

  for (let i = 0; i < Math.max(titles.length, pmids.length); i++) {
    articles.push({
      title: titles[i] || "No title available",
      abstract: abstracts[i] || "No abstract available",
      journal: journals[i] || "No journal available",
      pmid: pmids[i] || "No PMID available",
      publication_date: dates[i] || "No date available",
      authors: authors,
      doi: dois[i] || null,
    });
  }

  return articles;
}

// Test the dynamic approach
async function testDynamicSearch() {
  console.log("🧪 Testing Dynamic Medical Search...\n");

  // Test drug safety
  const safetyResults = await searchDrugSafetyDynamic("warfarin");
  console.log("Drug Safety Results:", JSON.stringify(safetyResults, null, 2));

  // Test differential diagnosis
  const diagnosisResults = await searchDifferentialDiagnosisDynamic([
    "chest pain",
    "shortness of breath",
  ]);
  console.log(
    "\nDifferential Diagnosis Results:",
    JSON.stringify(diagnosisResults, null, 2),
  );
}

// Uncomment to test
// testDynamicSearch();
