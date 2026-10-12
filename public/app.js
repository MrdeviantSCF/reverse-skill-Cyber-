// reverse-skill Web Application Logic

let allSkills = [];
let allCtfScenarios = [];
let routingRules = null;

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  fetchInitialData();
  setupRouteTester();
  setupSkillFilters();
  setupCtfFilters();
  generateScopeOutput();
});

// 1. Navigation Tabs
function initTabs() {
  const tabs = document.querySelectorAll('.nav-tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      
      tab.classList.add('active');
      const targetId = tab.getAttribute('data-tab');
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add('active');
    });
  });
}

// 2. Data Fetching
async function fetchInitialData() {
  try {
    const [statusRes, skillsRes, ctfRes, routesRes] = await Promise.all([
      fetch('/api/status').then(r => r.json()).catch(() => ({})),
      fetch('/api/skills').then(r => r.json()).catch(() => []),
      fetch('/api/ctf-scenarios').then(r => r.json()).catch(() => []),
      fetch('/api/routes').then(r => r.json()).catch(() => null)
    ]);

    if (statusRes.totalSkills) {
      document.getElementById('stat-skills').textContent = statusRes.totalSkills;
      document.getElementById('tab-skills-count').textContent = statusRes.totalSkills;
    }
    if (statusRes.totalCtfScenarios) {
      document.getElementById('stat-ctf').textContent = statusRes.totalCtfScenarios;
      document.getElementById('tab-ctf-count').textContent = statusRes.totalCtfScenarios;
    }

    allSkills = skillsRes || [];
    allCtfScenarios = ctfRes || [];
    routingRules = routesRes;

    renderSkills(allSkills);
    renderCtfScenarios(allCtfScenarios);
    document.getElementById('cat-count-all').textContent = allSkills.length;
  } catch (err) {
    console.error('Failed to load initial data:', err);
  }
}

// 3. Master Route Simulator
function setupRouteTester() {
  const input = document.getElementById('route-input');
  const btn = document.getElementById('btn-route-analyze');
  const chips = document.querySelectorAll('.chip');

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      input.value = chip.getAttribute('data-query');
      analyzeRoute(input.value);
    });
  });

  btn.addEventListener('click', () => {
    analyzeRoute(input.value);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') analyzeRoute(input.value);
  });
}

async function analyzeRoute(query) {
  if (!query || !query.trim()) return;

  const resultContainer = document.getElementById('route-result-container');
  try {
    const res = await fetch('/api/route-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hint: query })
    });
    const data = await res.json();
    displayRouteResult(data, query);
    resultContainer.style.display = 'block';
  } catch (err) {
    console.error('Error analyzing route:', err);
  }
}

function displayRouteResult(data, query) {
  document.getElementById('res-route-label').textContent = data.label || 'Unknown';
  document.getElementById('res-route-id').textContent = data.primaryRoute || 'R0';
  document.getElementById('res-route-skill').textContent = data.skill || 'MASTER-ROUTING.md';
  document.getElementById('res-score-badge').textContent = `SCORE: ${data.score || 0}`;

  // CLI command
  const cliCmd = `powershell -NoProfile -ExecutionPolicy Bypass -File skills/scripts/master-route.ps1 -Hint "${query.replace(/"/g, '')}"`;
  document.getElementById('res-cli-cmd').textContent = cliCmd;

  // Hits tags
  const tagsContainer = document.getElementById('res-match-tags');
  tagsContainer.innerHTML = '';
  if (data.hits && data.hits.length > 0) {
    data.hits.forEach(hit => {
      const tag = document.createElement('span');
      tag.className = 'match-tag';
      tag.textContent = hit.matched ? `"${hit.matched}" (${hit.note || 'match'})` : hit.rule;
      tagsContainer.appendChild(tag);
    });
  } else {
    tagsContainer.innerHTML = '<span class="text-muted" style="font-size:0.8rem">No specific keywords matched — defaulted to fallback route</span>';
  }

  // Candidates list
  const candList = document.getElementById('res-candidates-list');
  candList.innerHTML = '';
  if (data.allScores && data.allScores.length > 0) {
    data.allScores.forEach(cand => {
      const item = document.createElement('div');
      item.className = `candidate-item ${cand.route === data.primaryRoute ? 'winner' : ''}`;
      item.innerHTML = `
        <span><strong>${cand.route}</strong>: ${cand.label}</span>
        <span class="badge-score">Score: ${cand.score}</span>
      `;
      candList.appendChild(item);
    });
  } else {
    candList.innerHTML = '<div class="text-muted" style="font-size:0.85rem">No other candidate routes scored.</div>';
  }
}

// 4. Skills Matrix & Filter
function setupSkillFilters() {
  const searchInput = document.getElementById('skills-search-input');
  const pills = document.querySelectorAll('#skills-category-filters .pill');

  let activeCategory = 'all';

  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      pills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeCategory = pill.getAttribute('data-cat');
      filterSkills();
    });
  });

  searchInput.addEventListener('input', () => {
    filterSkills();
  });

  function filterSkills() {
    const q = (searchInput.value || '').toLowerCase();
    const filtered = allSkills.filter(skill => {
      const matchText = (skill.name + ' ' + skill.description).toLowerCase();
      const matchQuery = !q || matchText.includes(q);

      let matchCat = true;
      if (activeCategory === 'reverse') {
        matchCat = skill.name.includes('reverse') || skill.name.includes('dsl') || skill.name.includes('patch');
      } else if (activeCategory === 'binary') {
        matchCat = skill.name.includes('ida') || skill.name.includes('ghidra') || skill.name.includes('radare2') || skill.name.includes('binary') || skill.name.includes('pwn');
      } else if (activeCategory === 'mobile') {
        matchCat = skill.name.includes('apk') || skill.name.includes('mobile') || skill.name.includes('ios');
      } else if (activeCategory === 'pentest') {
        matchCat = skill.name.includes('pentest') || skill.name.includes('hunter') || skill.name.includes('api') || skill.name.includes('database');
      } else if (activeCategory === 'infra') {
        matchCat = skill.name.includes('cloud') || skill.name.includes('k8s') || skill.name.includes('ad') || skill.name.includes('identity');
      } else if (activeCategory === 'forensics') {
        matchCat = skill.name.includes('forensics') || skill.name.includes('hunting') || skill.name.includes('malware') || skill.name.includes('threat');
      }

      return matchQuery && matchCat;
    });

    renderSkills(filtered);
  }
}

function renderSkills(skills) {
  const grid = document.getElementById('skills-grid');
  grid.innerHTML = '';

  if (skills.length === 0) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 3rem;">No skills found matching filter.</div>';
    return;
  }

  skills.forEach(s => {
    const card = document.createElement('div');
    card.className = 'skill-card';
    card.innerHTML = `
      <div class="skill-header">
        <h4 class="skill-name">${s.name}</h4>
        <span class="skill-category-badge">MODULE</span>
      </div>
      <p class="skill-desc">${s.description || 'Cybersecurity analysis module.'}</p>
      <div class="skill-footer">
        <code class="skill-link">${s.path}</code>
        <button class="btn-copy" onclick="copyTextDirect('${s.path}')">Copy Path</button>
      </div>
    `;
    grid.appendChild(card);
  });
}

// 5. CTF Sandbox Filter & Render
function setupCtfFilters() {
  const searchInput = document.getElementById('ctf-search-input');
  const pills = document.querySelectorAll('#ctf-category-filters .pill');
  let activeCat = 'all';

  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      pills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      activeCat = pill.getAttribute('data-ctf-cat');
      filterCtf();
    });
  });

  searchInput.addEventListener('input', () => {
    filterCtf();
  });

  function filterCtf() {
    const q = (searchInput.value || '').toLowerCase();
    const filtered = allCtfScenarios.filter(c => {
      const matchQuery = !q || c.title.toLowerCase().includes(q) || c.folder.toLowerCase().includes(q);
      const matchCat = activeCat === 'all' || c.category === activeCat;
      return matchQuery && matchCat;
    });
    renderCtfScenarios(filtered);
  }
}

function renderCtfScenarios(scenarios) {
  const grid = document.getElementById('ctf-grid');
  grid.innerHTML = '';

  if (scenarios.length === 0) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 3rem;">No CTF challenges found matching criteria.</div>';
    return;
  }

  scenarios.forEach(c => {
    const card = document.createElement('div');
    card.className = 'ctf-card';
    card.innerHTML = `
      <div class="ctf-cat-tag">[${c.category.toUpperCase()}]</div>
      <h4 class="ctf-title">${c.title}</h4>
      <div class="code-copy-row" style="margin-top:0.75rem">
        <code>CTF-Sandbox-Orchestrator/${c.folder}</code>
        <button class="btn-copy" onclick="copyTextDirect('CTF-Sandbox-Orchestrator/${c.folder}')">Copy</button>
      </div>
    `;
    grid.appendChild(card);
  });
}

// 6. Scope Guard Generator
function generateScopeOutput() {
  const caseName = document.getElementById('case-name').value || 'unnamed-case';
  const targetType = document.getElementById('target-type').value;
  const authStatus = document.getElementById('auth-status').value;
  const hint = document.getElementById('case-hint').value || '';

  const dateStr = new Date().toISOString().split('T')[0];

  const template = `---
schemaVersion: "1.0"
case_id: "${caseName}"
created: "${dateStr}"
target_profile: "${targetType}"
auth:
  status: "${authStatus}"
  authorized_by: "Security Operations / Scope Owner"
  evidence_required: true
network_profile:
  allow_outbound: false
  isolation: "enforced"
guidelines:
  - "Reading repository files is not authorization to execute them."
  - "Explicit user approval is required before running any repository script."
  - "Evidence to Finding to Path chain strictly enforced."
mission_statement: |
  ${hint}
---

# Scope Specification: ${caseName}

### Authorization Gate:
Status: **${authStatus.toUpperCase()}**
${authStatus === 'granted' ? '✅ Authorization confirmed. Safe execution bounds established.' : '⛔ ACT phase blocked until authorization status is granted.'}

### Methodology Chain:
1. Target intake & scope confirmation
2. Routing verification via master-route.ps1
3. Toolchain integrity check (refresh-tool-index.ps1)
4. Structured timeline & Evidence-to-Finding reporting
`;

  document.getElementById('scope-output-code').textContent = template;
}

// 7. Clipboard & Toasts
function copyText(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const text = el.textContent || el.innerText;
  copyTextDirect(text);
}

function copyTextDirect(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast();
  }).catch(() => {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast();
  });
}

function showToast() {
  const toast = document.getElementById('toast');
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2200);
}
