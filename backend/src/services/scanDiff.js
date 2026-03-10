const signatureFor = (v = {}) => {
  const category = (v.category || 'other').toLowerCase().trim();
  const title = (v.title || '').toLowerCase().trim();
  const cve = (v.cve || '').toLowerCase().trim();
  return `${category}|${title}|${cve}`;
};

export function computeScanDiff(baselineResults = [], currentResults = []) {
  const baseMap = new Map();
  const curMap = new Map();

  (baselineResults || []).forEach((v) => {
    baseMap.set(signatureFor(v), v);
  });

  (currentResults || []).forEach((v) => {
    curMap.set(signatureFor(v), v);
  });

  const newIssues = [];
  const fixedIssues = [];
  const persisting = [];

  for (const [sig, v] of curMap.entries()) {
    if (!baseMap.has(sig)) newIssues.push(v);
    else persisting.push(v);
  }

  for (const [sig, v] of baseMap.entries()) {
    if (!curMap.has(sig)) fixedIssues.push(v);
  }

  const countBySeverity = (arr) =>
    (arr || []).reduce((acc, v) => {
      const s = (v.severity || 'info').toLowerCase();
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});

  return {
    newIssues,
    fixedIssues,
    persisting,
    counts: {
      new: countBySeverity(newIssues),
      fixed: countBySeverity(fixedIssues),
      persisting: countBySeverity(persisting),
    },
  };
}
