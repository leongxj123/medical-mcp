import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getDrugByNDC,
  getHealthIndicators,
  searchDrugs,
  searchPubMedArticles,
  searchRxNormDrugs,
  searchGoogleScholar,
  getPubMedArticleByPMID,
  searchClinicalGuidelines,
  getDrugSafetyInfo,
  checkDrugInteractions,
  generateDifferentialDiagnosis,
  getRiskCalculators,
  getLabValues,
  getDiagnosticCriteria,
} from "./utils.js";

const server = new McpServer({
  name: "medical-mcp",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});

// Add global safety warning
console.error("🚨 MEDICAL MCP SERVER - SAFETY NOTICE:");
console.error(
  "This server provides medical information for educational purposes only.",
);
console.error(
  "NEVER use this information as the sole basis for clinical decisions.",
);
console.error(
  "Always consult qualified healthcare professionals for patient care.",
);
console.error("");
console.error("📊 DYNAMIC DATA SOURCE NOTICE:");
console.error(
  "This system queries live medical databases (FDA, WHO, PubMed, RxNorm)",
);
console.error(
  "NO hardcoded medical data is used - all information is retrieved dynamically",
);
console.error(
  "Data freshness depends on source database updates and API availability",
);
console.error(
  "Network connectivity required for all medical information retrieval",
);

// MCP Tools
server.tool(
  "search-drugs",
  "Search for drug information using FDA database",
  {
    query: z
      .string()
      .describe("Drug name to search for (brand name or generic name)"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(10)
      .describe("Number of results to return (max 50)"),
  },
  async ({ query, limit }) => {
    try {
      const drugs = await searchDrugs(query, limit);

      if (drugs.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No drugs found matching "${query}". Try a different search term.`,
            },
          ],
        };
      }

      let result = `**Drug Search Results for "${query}"**\n\n`;
      result += `Found ${drugs.length} drug(s)\n\n`;

      drugs.forEach((drug, index) => {
        result += `${index + 1}. **${drug.openfda.brand_name?.[0] || "Unknown Brand"}**\n`;
        result += `   Generic Name: ${drug.openfda.generic_name?.[0] || "Not specified"}\n`;
        result += `   Manufacturer: ${drug.openfda.manufacturer_name?.[0] || "Not specified"}\n`;
        result += `   Route: ${drug.openfda.route?.[0] || "Not specified"}\n`;
        result += `   Dosage Form: ${drug.openfda.dosage_form?.[0] || "Not specified"}\n`;

        if (drug.purpose && drug.purpose.length > 0) {
          result += `   Purpose: ${drug.purpose[0].substring(0, 200)}${drug.purpose[0].length > 200 ? "..." : ""}\n`;
        }

        result += `   Last Updated: ${drug.effective_time}\n\n`;
      });

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching drugs: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "get-drug-details",
  "Get detailed information about a specific drug by NDC (National Drug Code)",
  {
    ndc: z.string().describe("National Drug Code (NDC) of the drug"),
  },
  async ({ ndc }) => {
    try {
      const drug = await getDrugByNDC(ndc);

      if (!drug) {
        return {
          content: [
            {
              type: "text",
              text: `No drug found with NDC: ${ndc}`,
            },
          ],
        };
      }

      let result = `**Drug Details for NDC: ${ndc}**\n\n`;
      result += `**Basic Information:**\n`;
      result += `- Brand Name: ${drug.openfda.brand_name?.[0] || "Not specified"}\n`;
      result += `- Generic Name: ${drug.openfda.generic_name?.[0] || "Not specified"}\n`;
      result += `- Manufacturer: ${drug.openfda.manufacturer_name?.[0] || "Not specified"}\n`;
      result += `- Route: ${drug.openfda.route?.[0] || "Not specified"}\n`;
      result += `- Dosage Form: ${drug.openfda.dosage_form?.[0] || "Not specified"}\n`;
      result += `- Last Updated: ${drug.effective_time}\n\n`;

      if (drug.purpose && drug.purpose.length > 0) {
        result += `**Purpose/Uses:**\n`;
        drug.purpose.forEach((purpose, index) => {
          result += `${index + 1}. ${purpose}\n`;
        });
        result += "\n";
      }

      if (drug.warnings && drug.warnings.length > 0) {
        result += `**Warnings:**\n`;
        drug.warnings.forEach((warning, index) => {
          result += `${index + 1}. ${warning.substring(0, 300)}${warning.length > 300 ? "..." : ""}\n`;
        });
        result += "\n";
      }

      if (drug.drug_interactions && drug.drug_interactions.length > 0) {
        result += `**Drug Interactions:**\n`;
        drug.drug_interactions.forEach((interaction, index) => {
          result += `${index + 1}. ${interaction.substring(0, 300)}${interaction.length > 300 ? "..." : ""}\n`;
        });
        result += "\n";
      }

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching drug details: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "get-health-statistics",
  "Get health statistics and indicators from WHO Global Health Observatory",
  {
    indicator: z
      .string()
      .describe(
        "Health indicator to search for (e.g., 'Life expectancy', 'Mortality rate')",
      ),
    country: z
      .string()
      .optional()
      .describe("Country code (e.g., 'USA', 'GBR') - optional"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .default(10)
      .describe("Number of results to return (max 20)"),
  },
  async ({ indicator, country, limit }) => {
    try {
      const indicators = await getHealthIndicators(indicator, country);

      if (indicators.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No health indicators found for "${indicator}"${country ? ` in ${country}` : ""}. Try a different search term.`,
            },
          ],
        };
      }

      let result = `**Health Statistics: ${indicator}**\n\n`;
      if (country) {
        result += `Country: ${country}\n`;
      }
      result += `Found ${indicators.length} data points\n\n`;

      const displayIndicators = indicators.slice(0, limit);
      displayIndicators.forEach((ind, index) => {
        result += `${index + 1}. **${ind.SpatialDim}** (${ind.TimeDim})\n`;
        result += `   Value: ${ind.Value} ${ind.Comments || ""}\n`;
        result += `   Numeric Value: ${ind.NumericValue}\n`;
        if (ind.Low && ind.High) {
          result += `   Range: ${ind.Low} - ${ind.High}\n`;
        }
        result += `   Date: ${ind.Date}\n\n`;
      });

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching health statistics: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "search-medical-literature",
  "Search for medical research articles in PubMed",
  {
    query: z.string().describe("Medical topic or condition to search for"),
    max_results: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .default(10)
      .describe("Maximum number of articles to return (max 20)"),
  },
  async ({ query, max_results }) => {
    try {
      const articles = await searchPubMedArticles(query, max_results);

      if (articles.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No medical articles found for "${query}". Try a different search term.`,
            },
          ],
        };
      }

      let result = `**Medical Literature Search: "${query}"**\n\n`;
      result += `Found ${articles.length} article(s)\n\n`;

      articles.forEach((article, index) => {
        result += `${index + 1}. **${article.title}**\n`;
        result += `   PMID: ${article.pmid}\n`;
        result += `   Journal: ${article.journal}\n`;
        result += `   Publication Date: ${article.publication_date}\n`;
        if (article.doi) {
          result += `   DOI: ${article.doi}\n`;
        }
        if (article.authors && article.authors.length > 0) {
          result += `   Authors: ${article.authors.slice(0, 5).join(", ")}${article.authors.length > 5 ? " et al." : ""}\n`;
        }
        if (article.abstract && article.abstract !== "No abstract available") {
          result += `   Abstract: ${article.abstract.substring(0, 300)}${article.abstract.length > 300 ? "..." : ""}\n`;
        }
        result += "\n";
      });

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching medical literature: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "get-article-details",
  "Get detailed information about a specific medical article by PMID",
  {
    pmid: z.string().describe("PubMed ID (PMID) of the article"),
  },
  async ({ pmid }) => {
    try {
      const article = await getPubMedArticleByPMID(pmid);

      if (!article) {
        return {
          content: [
            {
              type: "text",
              text: `No article found with PMID: ${pmid}`,
            },
          ],
        };
      }

      let result = `**Article Details for PMID: ${pmid}**\n\n`;
      result += `**Title:** ${article.title}\n\n`;

      if (article.authors && article.authors.length > 0) {
        result += `**Authors:** ${article.authors.join(", ")}\n\n`;
      }

      result += `**Journal:** ${article.journal}\n`;
      result += `**Publication Date:** ${article.publication_date}\n`;

      if (article.doi) {
        result += `**DOI:** ${article.doi}\n`;
      }

      result += `\n**Abstract:**\n${article.abstract}\n`;

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching article details: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "search-drug-nomenclature",
  "Search for drug information using RxNorm (standardized drug nomenclature)",
  {
    query: z.string().describe("Drug name to search for in RxNorm database"),
  },
  async ({ query }) => {
    try {
      const drugs = await searchRxNormDrugs(query);

      if (drugs.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No drugs found in RxNorm database for "${query}". Try a different search term.`,
            },
          ],
        };
      }

      let result = `**RxNorm Drug Search: "${query}"**\n\n`;
      result += `Found ${drugs.length} drug(s)\n\n`;

      drugs.forEach((drug, index) => {
        result += `${index + 1}. **${drug.name}**\n`;
        result += `   RxCUI: ${drug.rxcui}\n`;
        result += `   Term Type: ${drug.tty}\n`;
        result += `   Language: ${drug.language}\n`;
        if (drug.synonym && drug.synonym.length > 0) {
          result += `   Synonyms: ${drug.synonym.slice(0, 3).join(", ")}${drug.synonym.length > 3 ? "..." : ""}\n`;
        }
        result += "\n";
      });

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching RxNorm: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "search-google-scholar",
  "Search for academic research articles using Google Scholar",
  {
    query: z
      .string()
      .describe("Academic topic or research query to search for"),
  },
  async ({ query }) => {
    try {
      const articles = await searchGoogleScholar(query);

      if (articles.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No academic articles found for "${query}". This could be due to:\n- No results matching your query\n- Google Scholar rate limiting\n- Network connectivity issues\n\nTry refining your search terms or try again later.`,
            },
          ],
        };
      }

      let result = `**Google Scholar Search: "${query}"**\n\n`;
      result += `Found ${articles.length} article(s)\n\n`;

      articles.forEach((article, index) => {
        result += `${index + 1}. **${article.title}**\n`;
        if (article.authors) {
          result += `   Authors: ${article.authors}\n`;
        }
        if (article.journal) {
          result += `   Journal: ${article.journal}\n`;
        }
        if (article.year) {
          result += `   Year: ${article.year}\n`;
        }
        if (article.citations) {
          result += `   Citations: ${article.citations}\n`;
        }
        if (article.url) {
          result += `   URL: ${article.url}\n`;
        }
        if (article.abstract) {
          result += `   Abstract: ${article.abstract.substring(0, 300)}${article.abstract.length > 300 ? "..." : ""}\n`;
        }
        result += "\n";
      });

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching Google Scholar: ${error.message || "Unknown error"}. This might be due to rate limiting or network issues. Please try again later.`,
          },
        ],
      };
    }
  },
);

server.tool(
  "search-clinical-guidelines",
  "Search for clinical guidelines and practice recommendations from medical organizations",
  {
    query: z
      .string()
      .describe("Medical condition or topic to search for guidelines"),
    organization: z
      .string()
      .optional()
      .describe(
        "Specific medical organization to filter by (e.g., 'American Heart Association', 'WHO')",
      ),
  },
  async ({ query, organization }) => {
    try {
      const guidelines = await searchClinicalGuidelines(query, organization);

      if (guidelines.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No clinical guidelines found for "${query}"${organization ? ` from ${organization}` : ""}. Try a different search term or check if the condition has established guidelines.`,
            },
          ],
        };
      }

      let result = `**Clinical Guidelines Search: "${query}"**\n\n`;
      if (organization) {
        result += `Organization Filter: ${organization}\n`;
      }
      result += `Found ${guidelines.length} guideline(s)\n\n`;

      guidelines.forEach((guideline, index) => {
        result += `${index + 1}. **${guideline.title}**\n`;
        result += `   Organization: ${guideline.organization}\n`;
        result += `   Year: ${guideline.year}\n`;
        result += `   Category: ${guideline.category}\n`;
        result += `   Evidence Level: ${guideline.evidence_level}\n`;
        if (guideline.description) {
          result += `   Description: ${guideline.description}\n`;
        }
        result += `   URL: ${guideline.url}\n\n`;
      });

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error searching clinical guidelines: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

// Drug Safety Tools
server.tool(
  "get-drug-safety-info",
  "Get comprehensive drug safety information including pregnancy and lactation categories",
  {
    drug_name: z
      .string()
      .describe("Name of the drug to check for safety information"),
  },
  async ({ drug_name }) => {
    try {
      const safetyInfo = await getDrugSafetyInfo(drug_name);

      if (!safetyInfo) {
        return {
          content: [
            {
              type: "text",
              text: `No safety information found for "${drug_name}". This may be due to limited data availability or the drug name not being recognized.`,
            },
          ],
        };
      }

      let result = `**Drug Safety Information: ${safetyInfo.drug_name}**\n\n`;

      result += `**Pregnancy Safety:**\n`;
      result += `- FDA Category: ${safetyInfo.pregnancy_category}\n`;
      if (safetyInfo.pregnancy_category === "A") {
        result += `  ✅ Safe - Adequate studies show no risk to fetus\n`;
      } else if (safetyInfo.pregnancy_category === "B") {
        result += `  ⚠️  Generally Safe - Animal studies show no risk, limited human data\n`;
      } else if (safetyInfo.pregnancy_category === "C") {
        result += `  ⚠️  Use with Caution - Animal studies show adverse effects, limited human data\n`;
      } else if (safetyInfo.pregnancy_category === "D") {
        result += `  ❌ Risk - Evidence of human fetal risk, use only if benefits justify risk\n`;
      } else if (safetyInfo.pregnancy_category === "X") {
        result += `  ❌ Contraindicated - Studies show fetal abnormalities, contraindicated in pregnancy\n`;
      } else {
        result += `  ❓ Not Classified - Insufficient data available\n`;
      }

      result += `\n**Lactation Safety:**\n`;
      result += `- Breastfeeding: ${safetyInfo.lactation_safety}\n`;
      if (safetyInfo.lactation_safety === "Safe") {
        result += `  ✅ Safe for breastfeeding\n`;
      } else if (safetyInfo.lactation_safety === "Caution") {
        result += `  ⚠️  Use with caution, monitor infant\n`;
      } else if (safetyInfo.lactation_safety === "Avoid") {
        result += `  ❌ Avoid during breastfeeding\n`;
      } else {
        result += `  ❓ Unknown safety profile\n`;
      }

      if (
        safetyInfo.contraindications &&
        safetyInfo.contraindications.length > 0
      ) {
        result += `\n**Contraindications:**\n`;
        safetyInfo.contraindications.forEach((contraindication, index) => {
          result += `${index + 1}. ${contraindication}\n`;
        });
      }

      if (safetyInfo.warnings && safetyInfo.warnings.length > 0) {
        result += `\n**Warnings:**\n`;
        safetyInfo.warnings.forEach((warning, index) => {
          result += `${index + 1}. ${warning}\n`;
        });
      }

      if (
        safetyInfo.monitoring_requirements &&
        safetyInfo.monitoring_requirements.length > 0
      ) {
        result += `\n**Monitoring Requirements:**\n`;
        safetyInfo.monitoring_requirements.forEach((requirement, index) => {
          result += `${index + 1}. ${requirement}\n`;
        });
      }

      if (
        safetyInfo.alternative_drugs &&
        safetyInfo.alternative_drugs.length > 0
      ) {
        result += `\n**Alternative Drugs:**\n`;
        safetyInfo.alternative_drugs.forEach((drug, index) => {
          result += `${index + 1}. ${drug}\n`;
        });
      }

      result += `\n**Last Updated:** ${new Date(safetyInfo.last_updated).toLocaleDateString()}\n`;
      result += `\n🚨 **CRITICAL SAFETY WARNING:**\n`;
      result += `This drug safety information is for educational purposes only and may not be complete or current.\n\n`;
      result += `**DYNAMIC DATA SOURCE:**\n`;
      result += `• Information retrieved from live FDA, PubMed, and medical literature searches\n`;
      result += `• No hardcoded safety data - all information retrieved dynamically\n`;
      result += `• Data freshness depends on source database updates and API availability\n\n`;
      result += `**ALWAYS:**\n`;
      result += `• Consult with a qualified healthcare provider for personalized medical advice\n`;
      result += `• Check current drug safety databases and prescribing information\n`;
      result += `• Consider individual patient factors and medical history\n`;
      result += `• Follow established clinical guidelines and protocols\n\n`;
      result += `**NEVER make medication decisions based solely on this information.**`;

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching drug safety information: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "check-drug-interactions",
  "Check for potential drug-drug interactions between two medications",
  {
    drug1: z.string().describe("First drug name"),
    drug2: z.string().describe("Second drug name"),
  },
  async ({ drug1, drug2 }) => {
    try {
      const interactions = await checkDrugInteractions(drug1, drug2);

      if (interactions.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No known interactions found between "${drug1}" and "${drug2}". However, this does not guarantee safety - always consult with a healthcare provider before combining medications.`,
            },
          ],
        };
      }

      let result = `**Drug Interaction Check: ${drug1} + ${drug2}**\n\n`;
      result += `Found ${interactions.length} potential interaction(s)\n\n`;

      interactions.forEach((interaction, index) => {
        result += `${index + 1}. **${interaction.drug1} + ${interaction.drug2}**\n`;
        result += `   Severity: `;

        if (interaction.severity === "Contraindicated") {
          result += `❌ **CONTRAINDICATED**\n`;
        } else if (interaction.severity === "Major") {
          result += `🔴 **MAJOR**\n`;
        } else if (interaction.severity === "Moderate") {
          result += `🟡 **MODERATE**\n`;
        } else {
          result += `🟢 **MINOR**\n`;
        }

        result += `   Description: ${interaction.description}\n`;
        result += `   Clinical Effects: ${interaction.clinical_effects}\n`;
        result += `   Management: ${interaction.management}\n`;
        result += `   Evidence Level: ${interaction.evidence_level}\n\n`;
      });

      result += `\n🚨 **CRITICAL SAFETY WARNING:**\n`;
      result += `This drug interaction information is for educational purposes only and may not be complete or current.\n\n`;
      result += `**DYNAMIC DATA SOURCE:**\n`;
      result += `• Information retrieved from live PubMed database searches\n`;
      result += `• No hardcoded interaction data - all results are dynamically generated\n`;
      result += `• Data freshness depends on PubMed indexing and API availability\n\n`;
      result += `**ALWAYS:**\n`;
      result += `• Consult with a qualified healthcare provider before combining medications\n`;
      result += `• Check current drug interaction databases\n`;
      result += `• Consider patient-specific factors (age, comorbidities, other medications)\n`;
      result += `• Monitor patients closely for adverse effects\n`;
      result += `• Follow established clinical guidelines\n\n`;
      result += `**NEVER make medication decisions based solely on this information.**`;

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error checking drug interactions: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

// Diagnostic Support Tools
server.tool(
  "generate-differential-diagnosis",
  "Generate differential diagnosis based on presenting symptoms",
  {
    symptoms: z
      .array(z.string())
      .min(1)
      .describe("List of symptoms or presenting complaints"),
  },
  async ({ symptoms }) => {
    try {
      const differential = await generateDifferentialDiagnosis(symptoms);

      let result = `**Differential Diagnosis Generator**\n\n`;
      result += `**Presenting Symptoms:** ${symptoms.join(", ")}\n\n`;

      if (differential.possible_diagnoses.length > 0) {
        result += `**Possible Diagnoses:**\n`;
        differential.possible_diagnoses.forEach((diagnosis, index) => {
          result += `${index + 1}. **${diagnosis.diagnosis}**\n`;
          result += `   Probability: `;
          if (diagnosis.probability === "High") {
            result += `🔴 **HIGH**\n`;
          } else if (diagnosis.probability === "Moderate") {
            result += `🟡 **MODERATE**\n`;
          } else {
            result += `🟢 **LOW**\n`;
          }
          result += `   Key Findings: ${diagnosis.key_findings.join(", ")}\n`;
          result += `   Next Steps: ${diagnosis.next_steps.join(", ")}\n\n`;
        });
      }

      if (differential.red_flags.length > 0) {
        result += `**🚨 Red Flags to Watch For:**\n`;
        differential.red_flags.forEach((flag, index) => {
          result += `${index + 1}. ${flag}\n`;
        });
        result += "\n";
      }

      if (differential.urgent_considerations.length > 0) {
        result += `**⚡ Urgent Considerations:**\n`;
        differential.urgent_considerations.forEach((consideration, index) => {
          result += `${index + 1}. ${consideration}\n`;
        });
        result += "\n";
      }

      result += `\n🚨 **CRITICAL SAFETY WARNING:**\n`;
      result += `This is a simplified diagnostic aid for educational purposes only. It is NOT a substitute for clinical judgment or professional medical evaluation.\n\n`;
      result += `**DYNAMIC DATA SOURCE:**\n`;
      result += `• Diagnostic suggestions generated from live PubMed literature searches\n`;
      result += `• No hardcoded diagnostic algorithms - all data retrieved dynamically\n`;
      result += `• Results based on current medical literature and research\n\n`;
      result += `**ALWAYS:**\n`;
      result += `• Perform a thorough clinical assessment\n`;
      result += `• Consider all diagnostic possibilities\n`;
      result += `• Consult with appropriate specialists when needed\n`;
      result += `• Follow established clinical protocols\n`;
      result += `• Document your clinical reasoning\n\n`;
      result += `**NEVER rely solely on this tool for patient care decisions.**`;

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error generating differential diagnosis: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "get-risk-calculators",
  "Get available medical risk calculators and scoring systems",
  {},
  async () => {
    try {
      const calculators = await getRiskCalculators();

      let result = `**Available Medical Risk Calculators**\n\n`;
      result += `Found ${calculators.length} calculator(s)\n\n`;

      calculators.forEach((calculator, index) => {
        result += `${index + 1}. **${calculator.name}**\n`;
        result += `   Description: ${calculator.description}\n`;
        result += `   Parameters: ${calculator.parameters.length} required\n`;
        result += `   Calculation: ${calculator.calculation}\n`;
        result += `   Interpretation:\n`;
        result += `   - Low Risk: ${calculator.interpretation.low_risk}\n`;
        result += `   - Moderate Risk: ${calculator.interpretation.moderate_risk}\n`;
        result += `   - High Risk: ${calculator.interpretation.high_risk}\n`;
        result += `   References: ${calculator.references.join(", ")}\n\n`;
      });

      result += `**How to Use:**\n`;
      result += `1. Select the appropriate calculator for your clinical scenario\n`;
      result += `2. Gather the required parameters from your patient assessment\n`;
      result += `3. Calculate the score using the provided formula\n`;
      result += `4. Interpret the results according to the risk categories\n\n`;
      result += `⚠️  **Important:** These calculators are clinical decision support tools. Always use them in conjunction with clinical judgment and consider individual patient factors.`;

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching risk calculators: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "get-lab-values",
  "Get normal lab value ranges by age group and pregnancy status",
  {},
  async () => {
    try {
      const labValues = await getLabValues();

      let result = `**Laboratory Value Reference**\n\n`;
      result += `Available for ${labValues.length} test(s)\n\n`;

      labValues.forEach((lab, index) => {
        result += `${index + 1}. **${lab.test_name}**\n`;
        result += `   Interpretation: ${lab.interpretation}\n`;
        result += `   Clinical Significance: ${lab.clinical_significance}\n`;
        result += `   Critical Values: Low < ${lab.critical_values.low}, High > ${lab.critical_values.high}\n\n`;

        result += `   **Normal Ranges by Age/Pregnancy Status:**\n`;
        lab.normal_ranges.forEach((range) => {
          result += `   - ${range.age_group}`;
          if (range.pregnancy_status) {
            result += ` (${range.pregnancy_status})`;
          }
          result += `: `;
          if (range.male_range && range.female_range) {
            result += `Male: ${range.male_range}, Female: ${range.female_range}`;
          } else if (range.male_range) {
            result += `${range.male_range}`;
          } else if (range.female_range) {
            result += `${range.female_range}`;
          }
          result += ` ${range.units}\n`;
        });
        result += "\n";
      });

      result += `⚠️  **Important:** Normal ranges may vary between laboratories. Always refer to your local lab's reference ranges. These values are for general guidance only.`;

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching lab values: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

server.tool(
  "get-diagnostic-criteria",
  "Get diagnostic criteria for specific medical conditions",
  {
    condition: z
      .string()
      .describe("Medical condition to get diagnostic criteria for"),
  },
  async ({ condition }) => {
    try {
      const criteria = await getDiagnosticCriteria(condition);

      if (!criteria) {
        return {
          content: [
            {
              type: "text",
              text: `No diagnostic criteria found for "${condition}". This system searches medical literature dynamically - try different search terms or check the spelling. The system queries PubMed and other medical databases in real-time.`,
            },
          ],
        };
      }

      let result = `**Diagnostic Criteria: ${criteria.condition}**\n\n`;

      criteria.criteria_sets.forEach((criteriaSet, index) => {
        result += `**${criteriaSet.name}** (${criteriaSet.source})\n\n`;

        criteriaSet.criteria.forEach((criterion, criterionIndex) => {
          result += `${criterionIndex + 1}. **${criterion.category}**\n`;
          if (criterion.required_count !== undefined) {
            result += `   Required: ${criterion.required_count} of the following:\n`;
          } else {
            result += `   Items:\n`;
          }
          criterion.items.forEach((item, itemIndex) => {
            result += `   ${itemIndex + 1}. ${item}\n`;
          });
          result += "\n";
        });
      });

      if (criteria.differential_diagnosis.length > 0) {
        result += `**Differential Diagnosis:**\n`;
        criteria.differential_diagnosis.forEach((diagnosis, index) => {
          result += `${index + 1}. ${diagnosis}\n`;
        });
        result += "\n";
      }

      if (criteria.red_flags.length > 0) {
        result += `**🚨 Red Flags:**\n`;
        criteria.red_flags.forEach((flag, index) => {
          result += `${index + 1}. ${flag}\n`;
        });
        result += "\n";
      }

      result += `\n🚨 **CRITICAL SAFETY WARNING:**\n`;
      result += `These diagnostic criteria are for clinical reference only and may not reflect the most current guidelines.\n\n`;
      result += `**DYNAMIC DATA SOURCE:**\n`;
      result += `• Criteria extracted from live PubMed literature searches\n`;
      result += `• No hardcoded diagnostic criteria - all data retrieved dynamically\n`;
      result += `• Information freshness depends on literature publication and indexing\n\n`;
      result += `**ALWAYS:**\n`;
      result += `• Use criteria in conjunction with clinical judgment\n`;
      result += `• Consider individual patient factors and presentation\n`;
      result += `• Consult current clinical guidelines and protocols\n`;
      result += `• Seek specialist consultation when appropriate\n`;
      result += `• Document your diagnostic reasoning\n\n`;
      result += `**NEVER use these criteria as the sole basis for diagnosis.**`;

      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error fetching diagnostic criteria: ${error.message || "Unknown error"}`,
          },
        ],
      };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Medical MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
