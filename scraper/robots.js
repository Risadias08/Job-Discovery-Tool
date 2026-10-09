/**
 * Minimal robots.txt support (enough for our three sites):
 * - uses the group for our own user-agent token if present, otherwise the "*" group
 * - handles multiple User-agent lines sharing one rule group
 * - supports * wildcards and the $ end anchor
 * - longest matching rule wins; Allow wins a tie
 */
export function parseRobots(text, agentToken = 'gradguidestudentproject') {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const lineRaw of text.split(/\r?\n/)) {
    const line = lineRaw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (field === 'allow' || field === 'disallow') {
      lastWasAgent = false;
      if (current && value !== '') current.rules.push({ allow: field === 'allow', pattern: value });
    } else {
      lastWasAgent = false;
    }
  }
  const specific = groups.filter((g) => g.agents.some((a) => a !== '*' && agentToken.includes(a)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes('*'));
  return chosen.flatMap((g) => g.rules);
}

function toRegex(pattern) {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp('^' + body + (anchored ? '$' : ''));
}

/** @param rules from parseRobots, @param pathAndQuery e.g. "/jobs/page-2/?x=1" */
export function isAllowed(rules, pathAndQuery) {
  let best = null;
  for (const r of rules) {
    if (!toRegex(r.pattern).test(pathAndQuery)) continue;
    if (!best || r.pattern.length > best.pattern.length || (r.pattern.length === best.pattern.length && r.allow)) best = r;
  }
  return best ? best.allow : true;
}
