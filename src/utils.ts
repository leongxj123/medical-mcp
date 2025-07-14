import { DrugLabel, PubMedArticle, RxNormDrug, WHOIndicator } from "./types.js";
import superagent from "superagent";
import {
  FDA_API_BASE,
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
  let filter = `IndicatorName eq '${indicatorName}'`;
  if (country) {
    filter += ` and SpatialDim eq '${country}'`;
  }

  const res = await superagent
    .get(`${WHO_API_BASE}/Indicator`)
    .query({
      $filter: filter,
      $format: "json",
    })
    .set("User-Agent", USER_AGENT);

  return res.body.value || [];
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

// PubMed API functions
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

    // Parse XML response (simplified)
    const articles: PubMedArticle[] = [];
    const xmlText = fetchRes.text;

    // Simple XML parsing for demonstration
    const pmidMatches = xmlText.match(/<PMID[^>]*>(\d+)<\/PMID>/g);
    const titleMatches = xmlText.match(
      /<ArticleTitle[^>]*>([^<]+)<\/ArticleTitle>/g,
    );

    if (pmidMatches && titleMatches) {
      for (
        let i = 0;
        i < Math.min(pmidMatches.length, titleMatches.length);
        i++
      ) {
        const pmid = pmidMatches[i].match(/<PMID[^>]*>(\d+)<\/PMID>/)?.[1];
        const title = titleMatches[i].match(
          /<ArticleTitle[^>]*>([^<]+)<\/ArticleTitle>/,
        )?.[1];

        if (pmid && title) {
          articles.push({
            pmid,
            title,
            abstract: "Abstract not available in this format",
            authors: [],
            journal: "Journal information not available",
            publication_date: "Date not available",
          });
        }
      }
    }

    return articles;
  } catch (error) {
    return [];
  }
}
