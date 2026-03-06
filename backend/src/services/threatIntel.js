import fetch from 'node-fetch';
import { logger } from '../utils/logger.js';

const { BLACKLOTUS_API_URL, BLACKLOTUS_API_KEY } = process.env;

export async function enrichWithThreatIntel(targetUrl, vulns) {
  if (!BLACKLOTUS_API_URL || !BLACKLOTUS_API_KEY) return vulns;
  try {
    const url = new URL(targetUrl);
    const domain = url.hostname;
    const resp = await fetch(`${BLACKLOTUS_API_URL}?domain=${encodeURIComponent(domain)}`, {
      headers: { Authorization: `Bearer ${BLACKLOTUS_API_KEY}` },
      timeout: 8000,
    });
    if (!resp.ok) throw new Error(`Threat API ${resp.status}`);
    const data = await resp.json();
    const riskLabel = data?.risk || 'unknown';
    return vulns.map(v => ({ ...v, threatIntel: { blackLotusRisk: riskLabel } }));
  } catch (e) {
    logger.warn('Threat intel enrichment failed', { error: e.message });
    return vulns;
  }
}