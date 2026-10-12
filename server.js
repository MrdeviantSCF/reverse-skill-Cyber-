const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

// MIME types dictionary
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

// Helper: load and cache routing.json
let routingData = null;
function getRoutingData() {
  if (!routingData) {
    try {
      const routingPath = path.join(ROOT_DIR, 'skills', 'config', 'routing.json');
      if (fs.existsSync(routingPath)) {
        routingData = JSON.parse(fs.readFileSync(routingPath, 'utf8'));
      }
    } catch (err) {
      console.error('Error reading routing.json:', err.message);
    }
  }
  return routingData;
}

// Helper: discover skills
function getSkillsList() {
  const skillsDir = path.join(ROOT_DIR, 'skills');
  const results = [];
  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory() && !['config', 'ops', 'references', 'scripts', 'tests'].includes(ent.name)) {
        const skillMd = path.join(skillsDir, ent.name, 'SKILL.md');
        let description = 'Cybersecurity and reverse engineering specialized workflow.';
        if (fs.existsSync(skillMd)) {
          const content = fs.readFileSync(skillMd, 'utf8');
          const descMatch = content.match(/description:\s*([^\r\n]+)/i);
          if (descMatch) {
            description = descMatch[1].replace(/^["']|["']$/g, '').trim();
          }
        }
        results.push({
          id: ent.name,
          name: ent.name,
          path: `skills/${ent.name}/SKILL.md`,
          description
        });
      }
    }
  } catch (err) {
    console.error('Error discovering skills:', err.message);
  }
  return results;
}

// Helper: discover CTF Sandbox Orchestrator challenges
function getCtfScenarios() {
  const ctfDir = path.join(ROOT_DIR, 'CTF-Sandbox-Orchestrator');
  const scenarios = [];
  try {
    if (fs.existsSync(ctfDir)) {
      const entries = fs.readdirSync(ctfDir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.isDirectory() && ent.name.startsWith('competition-')) {
          const cleanName = ent.name.replace(/^competition-/, '');
          let category = 'General';
          if (cleanName.includes('pwn') || cleanName.includes('reverse') || cleanName.includes('crypto')) category = 'Binary & Crypto';
          else if (cleanName.includes('web') || cleanName.includes('graphql') || cleanName.includes('ssrf') || cleanName.includes('jwt')) category = 'Web Security';
          else if (cleanName.includes('ad') || cleanName.includes('windows') || cleanName.includes('kerberos') || cleanName.includes('identity')) category = 'Enterprise & AD';
          else if (cleanName.includes('cloud') || cleanName.includes('k8s') || cleanName.includes('container')) category = 'Cloud & DevOps';
          else if (cleanName.includes('android') || cleanName.includes('ios') || cleanName.includes('mobile')) category = 'Mobile';
          else if (cleanName.includes('forensic') || cleanName.includes('timeline') || cleanName.includes('pcap')) category = 'Forensics & Network';

          scenarios.push({
            id: ent.name,
            title: cleanName.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' '),
            folder: ent.name,
            category
          });
        }
      }
    }
  } catch (err) {
    console.error('Error discovering CTF challenges:', err.message);
  }
  return scenarios;
}

// Helper: Route match simulation
function simulateRouting(hint) {
  const routing = getRoutingData();
  if (!routing || !routing.routes) {
    return { primary: 'R0', label: 'Fallback default', score: 0, reason: 'No routing rules loaded' };
  }

  const scores = {};
  const hitDetails = {};
  const normalizedHint = (hint || '').toLowerCase();

  for (const [routeId, routeDef] of Object.entries(routing.routes)) {
    scores[routeId] = 0;
    hitDetails[routeId] = [];

    if (!routeDef.keywords) continue;

    for (const kw of routeDef.keywords) {
      let isHit = false;
      let matchedTerm = '';

      if (kw.must) {
        try {
          const re = new RegExp(kw.must, 'i');
          const m = normalizedHint.match(re);
          if (m) {
            isHit = true;
            matchedTerm = m[0];
          }
        } catch (_) {}
      }

      if (isHit && kw.exclude) {
        try {
          const excl = new RegExp(kw.exclude, 'i');
          if (normalizedHint.match(excl)) {
            isHit = false;
          }
        } catch (_) {}
      }

      if (isHit && kw.mustAll && Array.isArray(kw.mustAll)) {
        for (const req of kw.mustAll) {
          try {
            const reqRe = new RegExp(req, 'i');
            if (!normalizedHint.match(reqRe)) {
              isHit = false;
              break;
            }
          } catch (_) {}
        }
      }

      if (isHit) {
        scores[routeId] += 1;
        hitDetails[routeId].push({
          rule: kw.must,
          matched: matchedTerm,
          note: kw.note || ''
        });
      }
    }
  }

  // Determine top hit by priority order if tied
  const priorities = routing.priority || Object.keys(routing.routes);
  let bestRouteId = routing.meta?.fallbackId || 'R0';
  let bestScore = 0;

  for (const rId of priorities) {
    const s = scores[rId] || 0;
    if (s > bestScore) {
      bestScore = s;
      bestRouteId = rId;
    }
  }

  const matchedRoute = routing.routes[bestRouteId] || { label: 'Fallback General', skill: 'skills/MASTER-ROUTING.md' };
  return {
    primaryRoute: bestRouteId,
    label: matchedRoute.label,
    skill: matchedRoute.skill,
    score: bestScore,
    hits: hitDetails[bestRouteId] || [],
    allScores: Object.entries(scores).filter(([_, s]) => s > 0).map(([k, s]) => ({ route: k, label: routing.routes[k]?.label || k, score: s }))
  };
}

// HTTP Server
const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // CORS headers for local dev convenience
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // --- API Endpoints ---
  if (pathname === '/api/status') {
    const routing = getRoutingData();
    const skills = getSkillsList();
    const ctf = getCtfScenarios();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'online',
      system: 'reverse-skill-Cyber-',
      version: '1.0.1',
      totalSkills: skills.length,
      totalRoutes: routing ? Object.keys(routing.routes).length : 0,
      totalCtfScenarios: ctf.length,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    }));
    return;
  }

  if (pathname === '/api/routes') {
    const routing = getRoutingData();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(routing || { error: 'Not found' }));
    return;
  }

  if (pathname === '/api/skills') {
    const skills = getSkillsList();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(skills));
    return;
  }

  if (pathname === '/api/ctf-scenarios') {
    const scenarios = getCtfScenarios();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(scenarios));
    return;
  }

  if (pathname === '/api/route-test' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const hint = payload.hint || '';
        const result = simulateRouting(hint);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // --- Static Files Serving ---
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // Fallback for root files like reverse-skill.png
  if (!fs.existsSync(filePath) && pathname === '/reverse-skill.png') {
    filePath = path.join(ROOT_DIR, 'reverse-skill.png');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // 404 handler
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`[reverse-skill] Cyber Router Dashboard running at:`);
  console.log(`  -> Local:   http://localhost:${PORT}`);
  console.log(`  -> Network: http://127.0.0.1:${PORT}`);
  console.log(`=======================================================`);
});
