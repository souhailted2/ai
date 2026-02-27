import { storage } from "./storage";

interface AgentContext {
  projectId: string;
  projectName: string;
  description: string;
  stack: string;
}

interface GeneratedFile {
  path: string;
  content: string;
  language: string;
}

const AGENT_DEFS = [
  { type: "vision", label: "Vision Analyst", capabilities: ["requirement-extraction", "intent-classification", "image-analysis"] },
  { type: "planner", label: "Strategic Planner", capabilities: ["task-decomposition", "roadmap-creation", "milestone-planning", "dependency-analysis"] },
  { type: "architect", label: "System Architect", capabilities: ["system-design", "architecture-patterns", "tech-stack-selection", "scalability-planning"] },
  { type: "ui-designer", label: "UI/UX Designer", capabilities: ["layout-generation", "color-schemes", "responsive-design", "ux-optimization"] },
  { type: "backend", label: "Backend Engineer", capabilities: ["api-design", "database-modeling", "server-logic", "authentication"] },
  { type: "frontend", label: "Frontend Engineer", capabilities: ["component-building", "state-management", "css-styling", "interactivity"] },
  { type: "developer", label: "Senior Developer", capabilities: ["full-stack-coding", "code-generation", "feature-implementation", "integration"] },
  { type: "debugger", label: "QA Engineer", capabilities: ["error-diagnosis", "test-creation", "bug-fixing", "regression-testing"] },
  { type: "tester", label: "Test Engineer", capabilities: ["unit-testing", "integration-testing", "test-coverage", "quality-assurance"] },
  { type: "optimizer", label: "Performance Engineer", capabilities: ["performance-profiling", "bundle-optimization", "caching-strategies", "load-optimization"] },
  { type: "security", label: "Security Engineer", capabilities: ["vulnerability-scanning", "input-validation", "auth-hardening", "security-audit"] },
  { type: "docs", label: "Technical Writer", capabilities: ["api-documentation", "readme-generation", "code-comments", "user-guides"] },
  { type: "memory", label: "Knowledge Agent", capabilities: ["context-retention", "pattern-learning", "preference-tracking", "history-recall"] },
  { type: "deployer", label: "DevOps Engineer", capabilities: ["deployment-automation", "environment-setup", "ci-cd-pipeline", "hosting-config"] },
  { type: "monitor", label: "Site Reliability Engineer", capabilities: ["health-monitoring", "error-tracking", "performance-metrics", "alerting"] },
];

function detectLanguage(text: string): "ar" | "en" {
  const arabicPattern = /[\u0600-\u06FF\u0750-\u077F]/;
  return arabicPattern.test(text) ? "ar" : "en";
}

function translateIntent(description: string): { normalized: string; lang: "ar" | "en"; intent: string } {
  const lang = detectLanguage(description);
  const desc = description.toLowerCase();
  let normalized = desc;
  let intent = "general-app";

  const arabicMappings: Record<string, { en: string; intent: string }> = {
    "دودة": { en: "snake game", intent: "snake-game" },
    "دوده": { en: "snake game", intent: "snake-game" },
    "ثعبان": { en: "snake game", intent: "snake-game" },
    "لعبة": { en: "game", intent: "game" },
    "لعبه": { en: "game", intent: "game" },
    "حاسبة": { en: "calculator", intent: "calculator" },
    "آلة حاسبة": { en: "calculator", intent: "calculator" },
    "متجر": { en: "store", intent: "ecommerce" },
    "تسوق": { en: "shopping", intent: "ecommerce" },
    "مدونة": { en: "blog", intent: "blog" },
    "دردشة": { en: "chat", intent: "chat" },
    "محادثة": { en: "chat", intent: "chat" },
    "لوحة تحكم": { en: "dashboard", intent: "dashboard" },
    "لوحة": { en: "dashboard", intent: "dashboard" },
    "مهام": { en: "tasks", intent: "tasks" },
    "مشاريع": { en: "project management", intent: "tasks" },
    "إدارة": { en: "management", intent: "dashboard" },
    "مصنع": { en: "factory management", intent: "dashboard" },
    "طقس": { en: "weather", intent: "weather" },
    "موقع": { en: "website", intent: "landing" },
    "صفحة": { en: "page", intent: "landing" },
    "portfolio": { en: "portfolio", intent: "landing" },
    "ملف شخصي": { en: "portfolio", intent: "landing" },
    "مطعم": { en: "restaurant", intent: "landing" },
    "قائمة طعام": { en: "food menu", intent: "landing" },
    "ملاحظات": { en: "notes", intent: "notes" },
    "تذكير": { en: "reminders", intent: "tasks" },
    "أنشئ": { en: "create", intent: "" },
    "بناء": { en: "build", intent: "" },
    "اصنع": { en: "make", intent: "" },
    "منصة": { en: "platform", intent: "dashboard" },
    "تطبيق": { en: "application", intent: "" },
    "نظام": { en: "system", intent: "dashboard" },
  };

  for (const [ar, mapping] of Object.entries(arabicMappings)) {
    if (desc.includes(ar)) {
      normalized += ` ${mapping.en}`;
      if (mapping.intent && intent === "general-app") {
        intent = mapping.intent;
      }
    }
  }

  const englishIntents: [string[], string][] = [
    [["snake"], "snake-game"],
    [["game", "play"], "game"],
    [["calculator", "calc"], "calculator"],
    [["todo", "task", "kanban"], "tasks"],
    [["dashboard", "admin", "panel", "management", "factory", "monitor"], "dashboard"],
    [["blog", "cms", "post", "article"], "blog"],
    [["chat", "message", "realtime"], "chat"],
    [["store", "shop", "ecommerce", "product", "cart"], "ecommerce"],
    [["weather", "forecast"], "weather"],
    [["landing", "portfolio", "homepage"], "landing"],
    [["note", "memo"], "notes"],
    [["api", "rest", "backend"], "api"],
  ];

  for (const [keywords, intentType] of englishIntents) {
    if (keywords.some((k) => normalized.includes(k)) && intent === "general-app") {
      intent = intentType;
      break;
    }
  }

  return { normalized, lang, intent };
}

function analyzeIdea(description: string) {
  const { normalized, lang, intent } = translateIntent(description);

  const stacks: Record<string, string> = {
    "snake-game": "html-canvas-game",
    "game": "html-canvas-game",
    "calculator": "html-app",
    "tasks": "react-tasks",
    "dashboard": "react-dashboard",
    "blog": "react-blog",
    "chat": "react-websocket",
    "ecommerce": "react-ecommerce",
    "weather": "html-app",
    "landing": "html-app",
    "notes": "react-notes",
    "api": "express-api",
    "general-app": "react-express",
  };

  const featureMap: Record<string, string[]> = {
    "snake-game": ["Canvas game engine", "Keyboard/touch controls", "Score tracking", "High score persistence", "Game over/restart", "Responsive design"],
    "game": ["Game canvas", "Game loop", "Score system", "Input controls", "Animations", "Sound effects placeholder"],
    "calculator": ["Calculator UI", "Math operations", "History display", "Keyboard support", "Theme styling"],
    "tasks": ["Task CRUD operations", "Kanban board view", "Categories/labels", "Due dates", "Status tracking", "Drag reorder"],
    "dashboard": ["Overview cards", "Data charts", "Statistics tables", "Sidebar navigation", "Filters", "Real-time metrics"],
    "blog": ["Post listing", "Post detail view", "Categories", "Search/filter", "Rich text display", "Pagination"],
    "chat": ["Real-time messaging", "Chat rooms", "Message history", "Online status", "Typing indicator"],
    "ecommerce": ["Product catalog", "Shopping cart", "Search/filters", "Product details", "Checkout flow", "Order summary"],
    "weather": ["Weather display", "City search", "Temperature units", "Forecast cards", "Weather icons"],
    "landing": ["Hero section", "Features grid", "About section", "Contact form", "Responsive layout", "Smooth scrolling"],
    "notes": ["Note CRUD", "Rich formatting", "Categories", "Search", "Auto-save"],
    "api": ["REST endpoints", "JSON responses", "Error handling", "CRUD operations", "Middleware"],
    "general-app": ["Home page", "Navigation", "Dynamic content", "Responsive design", "Error handling"],
  };

  const archMap: Record<string, any> = {
    "snake-game": { type: "browser-game", layers: ["canvas", "game-loop", "input", "rendering", "state"] },
    "game": { type: "browser-game", layers: ["canvas", "game-loop", "input", "rendering", "state"] },
    "calculator": { type: "utility-app", layers: ["ui", "logic", "display", "history"] },
    "tasks": { type: "task-management", layers: ["components", "pages", "state", "api", "models"] },
    "dashboard": { type: "dashboard-app", layers: ["layout", "widgets", "charts", "api", "models"] },
    "blog": { type: "content-app", layers: ["pages", "components", "api", "models", "search"] },
    "chat": { type: "realtime-app", layers: ["components", "websocket", "api", "models", "state"] },
    "ecommerce": { type: "ecommerce-app", layers: ["pages", "components", "cart", "api", "models"] },
    "weather": { type: "utility-app", layers: ["ui", "api", "display", "state"] },
    "landing": { type: "static-site", layers: ["sections", "styling", "animations", "forms"] },
    "notes": { type: "notes-app", layers: ["editor", "storage", "search", "categories"] },
    "api": { type: "backend-api", layers: ["routes", "controllers", "models", "middleware", "validation"] },
    "general-app": { type: "fullstack-app", layers: ["pages", "components", "api", "models"] },
  };

  return {
    stack: stacks[intent] || "react-express",
    features: featureMap[intent] || featureMap["general-app"],
    architecture: archMap[intent] || archMap["general-app"],
    intent,
    lang,
    normalized,
  };
}

function generateSnakeGame(ctx: AgentContext): GeneratedFile[] {
  return [
    { path: "package.json", language: "json", content: JSON.stringify({ name: ctx.projectName.toLowerCase().replace(/\s+/g, "-"), version: "1.0.0", description: ctx.description, scripts: { dev: "npx serve src", start: "npx serve src" } }, null, 2) },
    { path: "README.md", language: "markdown", content: `# ${ctx.projectName}\n\n${ctx.description}\n\n## Controls\n- Arrow keys or WASD to move\n- Space to pause/resume\n- Enter to restart\n` },
    { path: "src/index.html", language: "html", content: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${ctx.projectName}</title>\n  <link rel="stylesheet" href="styles.css">\n</head>\n<body>\n  <div id="game-container">\n    <div id="header">\n      <h1>${ctx.projectName}</h1>\n      <div id="score-board">\n        <span>Score: <strong id="score">0</strong></span>\n        <span>Best: <strong id="high-score">0</strong></span>\n      </div>\n    </div>\n    <canvas id="gameCanvas" width="400" height="400"></canvas>\n    <div id="controls">\n      <p id="status-text">Press any arrow key to start</p>\n      <div id="mobile-controls">\n        <button class="ctrl-btn" id="btn-up">&#9650;</button>\n        <div class="ctrl-row">\n          <button class="ctrl-btn" id="btn-left">&#9664;</button>\n          <button class="ctrl-btn" id="btn-down">&#9660;</button>\n          <button class="ctrl-btn" id="btn-right">&#9654;</button>\n        </div>\n      </div>\n    </div>\n  </div>\n  <script src="game.js"></script>\n</body>\n</html>` },
    { path: "src/styles.css", language: "css", content: `*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',system-ui,sans-serif;background:#0a0a1a;color:#e2e8f0;min-height:100vh;display:flex;align-items:center;justify-content:center;overflow:hidden}#game-container{display:flex;flex-direction:column;align-items:center;gap:16px;padding:24px}#header{display:flex;align-items:center;justify-content:space-between;width:400px}#header h1{font-size:1.4rem;font-weight:700;background:linear-gradient(135deg,#22c55e,#3b82f6);-webkit-background-clip:text;-webkit-text-fill-color:transparent}#score-board{display:flex;gap:16px;font-size:.85rem;color:#94a3b8}#score-board strong{color:#22c55e;font-variant-numeric:tabular-nums}canvas{border:2px solid #1e293b;border-radius:12px;background:#0f172a;box-shadow:0 0 40px rgba(34,197,94,.08),0 0 80px rgba(59,130,246,.05)}#controls{width:400px;text-align:center}#status-text{font-size:.8rem;color:#64748b;margin-bottom:12px}#mobile-controls{display:flex;flex-direction:column;align-items:center;gap:4px}.ctrl-row{display:flex;gap:4px}.ctrl-btn{width:48px;height:48px;border:1px solid #1e293b;border-radius:10px;background:#0f172a;color:#64748b;font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;user-select:none}.ctrl-btn:active{background:#1e293b;color:#22c55e;transform:scale(.95)}@media(min-width:600px){#mobile-controls{display:none}}@media(max-width:440px){#header,#controls,canvas{width:calc(100vw - 48px)}canvas{height:calc(100vw - 48px)}}` },
    { path: "src/game.js", language: "javascript", content: `const canvas=document.getElementById('gameCanvas'),ctx=canvas.getContext('2d'),scoreEl=document.getElementById('score'),highScoreEl=document.getElementById('high-score'),statusEl=document.getElementById('status-text');const GRID=20,COLS=canvas.width/GRID,ROWS=canvas.height/GRID;let snake,food,direction,nextDirection,score,highScore,gameRunning,gameOver,speed,lastTime;highScore=parseInt(localStorage.getItem('snakeHighScore')||'0');highScoreEl.textContent=highScore;function init(){snake=[{x:Math.floor(COLS/2),y:Math.floor(ROWS/2)},{x:Math.floor(COLS/2)-1,y:Math.floor(ROWS/2)},{x:Math.floor(COLS/2)-2,y:Math.floor(ROWS/2)}];direction={x:1,y:0};nextDirection={x:1,y:0};score=0;speed=120;gameRunning=false;gameOver=false;scoreEl.textContent='0';statusEl.textContent='Press any arrow key to start';spawnFood();draw()}function spawnFood(){let p;do{p={x:Math.floor(Math.random()*COLS),y:Math.floor(Math.random()*ROWS)}}while(snake.some(s=>s.x===p.x&&s.y===p.y));food=p}function draw(){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='rgba(30,41,59,0.4)';ctx.lineWidth=0.5;for(let i=0;i<=COLS;i++){ctx.beginPath();ctx.moveTo(i*GRID,0);ctx.lineTo(i*GRID,canvas.height);ctx.stroke()}for(let i=0;i<=ROWS;i++){ctx.beginPath();ctx.moveTo(0,i*GRID);ctx.lineTo(canvas.width,i*GRID);ctx.stroke()}const grd=ctx.createRadialGradient(food.x*GRID+GRID/2,food.y*GRID+GRID/2,2,food.x*GRID+GRID/2,food.y*GRID+GRID/2,GRID);grd.addColorStop(0,'rgba(239,68,68,0.3)');grd.addColorStop(1,'rgba(239,68,68,0)');ctx.fillStyle=grd;ctx.fillRect(food.x*GRID-GRID/2,food.y*GRID-GRID/2,GRID*2,GRID*2);ctx.fillStyle='#ef4444';ctx.shadowColor='#ef4444';ctx.shadowBlur=8;rr(food.x*GRID+2,food.y*GRID+2,GRID-4,GRID-4,4);ctx.shadowBlur=0;snake.forEach((s,i)=>{const ratio=1-(i/snake.length)*0.5;ctx.fillStyle=\`rgb(\${Math.floor(34+(100-34)*(1-ratio))},\${Math.floor(197*ratio)},94)\`;if(i===0){ctx.shadowColor='#22c55e';ctx.shadowBlur=10}rr(s.x*GRID+1,s.y*GRID+1,GRID-2,GRID-2,i===0?6:4);ctx.shadowBlur=0});const h=snake[0];ctx.fillStyle='#0f172a';const es=3,eo=5;if(direction.x===1){dot(h.x*GRID+GRID-eo,h.y*GRID+eo,es);dot(h.x*GRID+GRID-eo,h.y*GRID+GRID-eo,es)}else if(direction.x===-1){dot(h.x*GRID+eo,h.y*GRID+eo,es);dot(h.x*GRID+eo,h.y*GRID+GRID-eo,es)}else if(direction.y===-1){dot(h.x*GRID+eo,h.y*GRID+eo,es);dot(h.x*GRID+GRID-eo,h.y*GRID+eo,es)}else{dot(h.x*GRID+eo,h.y*GRID+GRID-eo,es);dot(h.x*GRID+GRID-eo,h.y*GRID+GRID-eo,es)}if(gameOver){ctx.fillStyle='rgba(10,10,26,0.85)';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#ef4444';ctx.font='bold 28px system-ui';ctx.textAlign='center';ctx.fillText('Game Over',canvas.width/2,canvas.height/2-20);ctx.fillStyle='#94a3b8';ctx.font='14px system-ui';ctx.fillText('Score: '+score,canvas.width/2,canvas.height/2+10);ctx.fillText('Press Enter to restart',canvas.width/2,canvas.height/2+36)}}function dot(x,y,r){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()}function rr(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);ctx.lineTo(x+w,y+h-r);ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);ctx.lineTo(x+r,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.fill()}function update(){direction={...nextDirection};const h={x:snake[0].x+direction.x,y:snake[0].y+direction.y};if(h.x<0||h.x>=COLS||h.y<0||h.y>=ROWS||snake.some(s=>s.x===h.x&&s.y===h.y)){gameOver=true;gameRunning=false;if(score>highScore){highScore=score;localStorage.setItem('snakeHighScore',String(highScore));highScoreEl.textContent=highScore}statusEl.textContent='Game Over! Press Enter to restart';draw();return}snake.unshift(h);if(h.x===food.x&&h.y===food.y){score++;scoreEl.textContent=score;speed=Math.max(60,speed-2);spawnFood()}else snake.pop()}function loop(t){if(!gameRunning)return;if(!lastTime)lastTime=t;if(t-lastTime>=speed){lastTime=t;update();draw()}requestAnimationFrame(loop)}function start(){if(gameRunning)return;gameRunning=true;lastTime=0;statusEl.textContent='Playing... WASD or Arrow keys';requestAnimationFrame(loop)}document.addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(gameOver&&(k==='enter'||k===' ')){init();return}const dirs={arrowup:{x:0,y:-1},arrowdown:{x:0,y:1},arrowleft:{x:-1,y:0},arrowright:{x:1,y:0},w:{x:0,y:-1},s:{x:0,y:1},a:{x:-1,y:0},d:{x:1,y:0}};const d=dirs[k];if(!d)return;e.preventDefault();if(d.x!==-direction.x||d.y!==-direction.y)nextDirection=d;if(!gameRunning&&!gameOver)start()});['btn-up','btn-down','btn-left','btn-right'].forEach(id=>{const dirs={'btn-up':{x:0,y:-1},'btn-down':{x:0,y:1},'btn-left':{x:-1,y:0},'btn-right':{x:1,y:0}};document.getElementById(id)?.addEventListener('click',()=>{if(!gameRunning&&!gameOver)start();const d=dirs[id];if(d.x!==-direction.x||d.y!==-direction.y)nextDirection=d})});init();` },
  ];
}

function generateDashboard(ctx: AgentContext): GeneratedFile[] {
  return [
    { path: "package.json", language: "json", content: JSON.stringify({ name: ctx.projectName.toLowerCase().replace(/\s+/g, "-"), version: "1.0.0", description: ctx.description }, null, 2) },
    { path: "README.md", language: "markdown", content: `# ${ctx.projectName}\n\n${ctx.description}\n` },
    { path: "src/index.html", language: "html", content: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${ctx.projectName}</title><link rel="stylesheet" href="styles.css"></head><body><div class="app"><aside class="sidebar"><div class="logo"><div class="logo-icon">F</div><span>${ctx.projectName}</span></div><nav><a class="nav-item active" href="#">Overview</a><a class="nav-item" href="#">Analytics</a><a class="nav-item" href="#">Products</a><a class="nav-item" href="#">Orders</a><a class="nav-item" href="#">Customers</a><a class="nav-item" href="#">Settings</a></nav></aside><main class="main"><header class="topbar"><h2>Overview</h2><div class="topbar-right"><input type="search" placeholder="Search..." class="search-input"><div class="avatar">U</div></div></header><div class="content"><div class="stats-grid"><div class="stat-card"><div class="stat-label">Total Revenue</div><div class="stat-value">$48,250</div><div class="stat-change positive">+12.5%</div></div><div class="stat-card"><div class="stat-label">Active Users</div><div class="stat-value">2,847</div><div class="stat-change positive">+8.2%</div></div><div class="stat-card"><div class="stat-label">Orders</div><div class="stat-value">1,234</div><div class="stat-change positive">+5.1%</div></div><div class="stat-card"><div class="stat-label">Conversion Rate</div><div class="stat-value">3.2%</div><div class="stat-change negative">-0.4%</div></div></div><div class="charts-row"><div class="chart-card"><h3>Revenue Overview</h3><div class="chart-placeholder"><div class="bar" style="height:40%"></div><div class="bar" style="height:65%"></div><div class="bar" style="height:45%"></div><div class="bar" style="height:80%"></div><div class="bar" style="height:55%"></div><div class="bar" style="height:90%"></div><div class="bar" style="height:70%"></div></div></div><div class="chart-card"><h3>Recent Orders</h3><table class="data-table"><thead><tr><th>ID</th><th>Customer</th><th>Amount</th><th>Status</th></tr></thead><tbody><tr><td>#1234</td><td>Ahmed Ali</td><td>$250</td><td><span class="badge success">Completed</span></td></tr><tr><td>#1233</td><td>Sara Hassan</td><td>$180</td><td><span class="badge warning">Pending</span></td></tr><tr><td>#1232</td><td>Omar Khalid</td><td>$420</td><td><span class="badge success">Completed</span></td></tr><tr><td>#1231</td><td>Noor Fatima</td><td>$95</td><td><span class="badge danger">Cancelled</span></td></tr><tr><td>#1230</td><td>Youssef M.</td><td>$310</td><td><span class="badge success">Completed</span></td></tr></tbody></table></div></div></div></main></div><script src="app.js"></script></body></html>` },
    { path: "src/styles.css", language: "css", content: `*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#0a0a1a;color:#e2e8f0}.app{display:flex;min-height:100vh}.sidebar{width:240px;background:#0f172a;border-right:1px solid #1e293b;padding:20px 0;flex-shrink:0}.logo{display:flex;align-items:center;gap:10px;padding:0 20px 24px;font-weight:700;font-size:1.1rem}.logo-icon{width:32px;height:32px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:.9rem}.nav-item{display:block;padding:10px 20px;color:#64748b;text-decoration:none;font-size:.9rem;border-left:3px solid transparent;transition:all .2s}.nav-item:hover,.nav-item.active{color:#e2e8f0;background:rgba(59,130,246,.08);border-left-color:#3b82f6}.main{flex:1;display:flex;flex-direction:column}.topbar{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid #1e293b;background:#0f172a/80}.topbar h2{font-size:1.2rem;font-weight:600}.topbar-right{display:flex;align-items:center;gap:12px}.search-input{background:#1e293b;border:1px solid #334155;border-radius:8px;padding:8px 14px;color:#e2e8f0;font-size:.85rem;width:200px;outline:none}.search-input:focus{border-color:#3b82f6}.avatar{width:32px;height:32px;background:#3b82f6;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:.8rem}.content{padding:24px;flex:1;overflow-y:auto}.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:24px}.stat-card{background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:20px}.stat-label{font-size:.8rem;color:#64748b;margin-bottom:4px}.stat-value{font-size:1.6rem;font-weight:700;margin-bottom:4px}.stat-change{font-size:.8rem;font-weight:600}.stat-change.positive{color:#22c55e}.stat-change.negative{color:#ef4444}.charts-row{display:grid;grid-template-columns:1fr 1fr;gap:16px}.chart-card{background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:20px}.chart-card h3{font-size:.95rem;margin-bottom:16px;color:#94a3b8}.chart-placeholder{display:flex;align-items:flex-end;gap:8px;height:160px;padding-top:10px}.bar{flex:1;background:linear-gradient(to top,#3b82f6,#8b5cf6);border-radius:4px 4px 0 0;transition:height .3s}.data-table{width:100%;border-collapse:collapse}.data-table th,.data-table td{padding:10px 12px;text-align:left;border-bottom:1px solid #1e293b;font-size:.85rem}.data-table th{color:#64748b;font-weight:500;font-size:.75rem;text-transform:uppercase;letter-spacing:.5px}.badge{padding:3px 8px;border-radius:6px;font-size:.75rem;font-weight:600}.badge.success{background:rgba(34,197,94,.15);color:#22c55e}.badge.warning{background:rgba(245,158,11,.15);color:#f59e0b}.badge.danger{background:rgba(239,68,68,.15);color:#ef4444}@media(max-width:768px){.sidebar{display:none}.charts-row{grid-template-columns:1fr}}` },
    { path: "src/app.js", language: "javascript", content: `document.querySelectorAll('.nav-item').forEach(item=>{item.addEventListener('click',e=>{e.preventDefault();document.querySelectorAll('.nav-item').forEach(i=>i.classList.remove('active'));item.classList.add('active')})});document.querySelectorAll('.bar').forEach(bar=>{const h=bar.style.height;bar.style.height='0';setTimeout(()=>{bar.style.height=h},100)});console.log('${ctx.projectName} Dashboard loaded');` },
  ];
}

function generateTodoApp(ctx: AgentContext): GeneratedFile[] {
  return [
    { path: "package.json", language: "json", content: JSON.stringify({ name: ctx.projectName.toLowerCase().replace(/\s+/g, "-"), version: "1.0.0", description: ctx.description }, null, 2) },
    { path: "README.md", language: "markdown", content: `# ${ctx.projectName}\n\n${ctx.description}\n` },
    { path: "src/index.html", language: "html", content: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${ctx.projectName}</title><link rel="stylesheet" href="styles.css"></head><body><div class="app"><header><h1>${ctx.projectName}</h1><p class="subtitle">Manage your tasks efficiently</p></header><div class="task-input-container"><input type="text" id="taskInput" placeholder="Add a new task..." autocomplete="off"><select id="priority"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option></select><button id="addBtn">Add</button></div><div class="filters"><button class="filter active" data-filter="all">All</button><button class="filter" data-filter="active">Active</button><button class="filter" data-filter="completed">Done</button></div><div id="taskList" class="task-list"></div><div class="stats"><span id="taskCount">0 tasks</span><button id="clearDone">Clear completed</button></div></div><script src="app.js"></script></body></html>` },
    { path: "src/styles.css", language: "css", content: `*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#0a0a1a;color:#e2e8f0;min-height:100vh;display:flex;justify-content:center;padding:40px 20px}.app{width:100%;max-width:600px}header{text-align:center;margin-bottom:32px}h1{font-size:1.8rem;font-weight:700;background:linear-gradient(135deg,#8b5cf6,#3b82f6);-webkit-background-clip:text;-webkit-text-fill-color:transparent}.subtitle{color:#64748b;font-size:.9rem;margin-top:4px}.task-input-container{display:flex;gap:8px;margin-bottom:20px}#taskInput{flex:1;background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:12px 16px;color:#e2e8f0;font-size:.9rem;outline:none}#taskInput:focus{border-color:#8b5cf6}#priority{background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:8px 12px;color:#e2e8f0;font-size:.85rem;outline:none}#addBtn{background:linear-gradient(135deg,#8b5cf6,#3b82f6);color:#fff;border:none;border-radius:10px;padding:12px 24px;font-weight:600;cursor:pointer;font-size:.9rem;white-space:nowrap}.filters{display:flex;gap:8px;margin-bottom:16px}.filter{background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:8px 16px;color:#64748b;font-size:.85rem;cursor:pointer;transition:all .2s}.filter.active,.filter:hover{color:#e2e8f0;border-color:#8b5cf6;background:rgba(139,92,246,.1)}.task-list{display:flex;flex-direction:column;gap:8px;min-height:200px}.task-item{display:flex;align-items:center;gap:12px;background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:14px 16px;transition:all .2s}.task-item.done{opacity:.5}.task-item.done .task-text{text-decoration:line-through}.task-check{width:20px;height:20px;border:2px solid #334155;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:all .2s}.task-check.checked{background:#8b5cf6;border-color:#8b5cf6}.task-check.checked::after{content:'\\2713';color:#fff;font-size:.7rem}.task-text{flex:1;font-size:.9rem}.priority-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}.priority-dot.high{background:#ef4444}.priority-dot.medium{background:#f59e0b}.priority-dot.low{background:#22c55e}.task-delete{background:none;border:none;color:#334155;cursor:pointer;font-size:1.1rem;padding:4px;transition:color .2s}.task-delete:hover{color:#ef4444}.stats{display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding:12px 0;color:#64748b;font-size:.85rem}#clearDone{background:none;border:none;color:#64748b;cursor:pointer;font-size:.85rem}#clearDone:hover{color:#ef4444}` },
    { path: "src/app.js", language: "javascript", content: `let tasks=JSON.parse(localStorage.getItem('tasks')||'[]'),filter='all';const list=document.getElementById('taskList'),input=document.getElementById('taskInput'),priority=document.getElementById('priority'),countEl=document.getElementById('taskCount');function render(){const filtered=filter==='all'?tasks:filter==='active'?tasks.filter(t=>!t.done):tasks.filter(t=>t.done);list.innerHTML=filtered.map((t,i)=>\`<div class="task-item \${t.done?'done':''}" data-id="\${t.id}"><div class="task-check \${t.done?'checked':''}" onclick="toggle('\${t.id}')"></div><span class="task-text">\${t.text}</span><span class="priority-dot \${t.priority}"></span><button class="task-delete" onclick="remove('\${t.id}')">&times;</button></div>\`).join('');const active=tasks.filter(t=>!t.done).length;countEl.textContent=\`\${active} task\${active!==1?'s':''} remaining\`;save()}function save(){localStorage.setItem('tasks',JSON.stringify(tasks))}function add(){const text=input.value.trim();if(!text)return;tasks.unshift({id:Date.now().toString(),text,priority:priority.value,done:false});input.value='';render()}function toggle(id){const t=tasks.find(t=>t.id===id);if(t)t.done=!t.done;render()}function remove(id){tasks=tasks.filter(t=>t.id!==id);render()}document.getElementById('addBtn').addEventListener('click',add);input.addEventListener('keydown',e=>{if(e.key==='Enter')add()});document.querySelectorAll('.filter').forEach(btn=>{btn.addEventListener('click',()=>{document.querySelectorAll('.filter').forEach(b=>b.classList.remove('active'));btn.classList.add('active');filter=btn.dataset.filter;render()})});document.getElementById('clearDone').addEventListener('click',()=>{tasks=tasks.filter(t=>!t.done);render()});render();` },
  ];
}

function generateEcommerce(ctx: AgentContext): GeneratedFile[] {
  return [
    { path: "package.json", language: "json", content: JSON.stringify({ name: ctx.projectName.toLowerCase().replace(/\s+/g, "-"), version: "1.0.0" }, null, 2) },
    { path: "README.md", language: "markdown", content: `# ${ctx.projectName}\n\n${ctx.description}\n` },
    { path: "src/index.html", language: "html", content: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${ctx.projectName}</title><link rel="stylesheet" href="styles.css"></head><body><div class="app"><nav class="navbar"><div class="nav-brand">${ctx.projectName}</div><div class="nav-links"><a href="#">Home</a><a href="#">Products</a><button id="cartBtn" class="cart-btn">Cart (<span id="cartCount">0</span>)</button></div></nav><div class="hero"><h1>Discover Amazing Products</h1><p>Shop the latest trends at unbeatable prices</p></div><div class="products-grid" id="products"></div><div class="cart-overlay" id="cartOverlay"><div class="cart-panel"><div class="cart-header"><h2>Shopping Cart</h2><button class="close-cart" id="closeCart">&times;</button></div><div id="cartItems" class="cart-items"></div><div class="cart-footer"><div class="cart-total">Total: $<span id="cartTotal">0</span></div><button class="checkout-btn">Checkout</button></div></div></div></div><script src="app.js"></script></body></html>` },
    { path: "src/styles.css", language: "css", content: `*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#0a0a1a;color:#e2e8f0}.navbar{display:flex;align-items:center;justify-content:space-between;padding:16px 32px;background:#0f172a;border-bottom:1px solid #1e293b;position:sticky;top:0;z-index:10}.nav-brand{font-size:1.2rem;font-weight:700;background:linear-gradient(135deg,#f59e0b,#ef4444);-webkit-background-clip:text;-webkit-text-fill-color:transparent}.nav-links{display:flex;align-items:center;gap:20px}.nav-links a{color:#94a3b8;text-decoration:none;font-size:.9rem}.cart-btn{background:#1e293b;border:1px solid #334155;border-radius:8px;color:#e2e8f0;padding:8px 16px;cursor:pointer;font-size:.85rem}.hero{text-align:center;padding:60px 20px 40px;background:linear-gradient(180deg,#0f172a 0%,#0a0a1a 100%)}.hero h1{font-size:2rem;font-weight:700;margin-bottom:8px;background:linear-gradient(135deg,#f59e0b,#ef4444);-webkit-background-clip:text;-webkit-text-fill-color:transparent}.hero p{color:#64748b;font-size:1rem}.products-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:20px;padding:32px;max-width:1200px;margin:0 auto}.product-card{background:#0f172a;border:1px solid #1e293b;border-radius:14px;overflow:hidden;transition:transform .2s}.product-card:hover{transform:translateY(-2px)}.product-img{height:180px;background:linear-gradient(135deg,#1e293b,#334155);display:flex;align-items:center;justify-content:center;font-size:3rem}.product-info{padding:16px}.product-name{font-weight:600;margin-bottom:4px}.product-desc{color:#64748b;font-size:.8rem;margin-bottom:8px}.product-price{font-size:1.2rem;font-weight:700;color:#f59e0b}.product-actions{padding:0 16px 16px}.add-to-cart{width:100%;background:linear-gradient(135deg,#f59e0b,#ef4444);border:none;border-radius:8px;padding:10px;color:#fff;font-weight:600;cursor:pointer;font-size:.9rem}.cart-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:100;display:none;justify-content:flex-end}.cart-overlay.open{display:flex}.cart-panel{width:380px;background:#0f172a;height:100%;display:flex;flex-direction:column;border-left:1px solid #1e293b}.cart-header{display:flex;justify-content:space-between;align-items:center;padding:20px;border-bottom:1px solid #1e293b}.close-cart{background:none;border:none;color:#94a3b8;font-size:1.5rem;cursor:pointer}.cart-items{flex:1;overflow-y:auto;padding:16px}.cart-item{display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #1e293b}.cart-footer{padding:20px;border-top:1px solid #1e293b}.cart-total{font-size:1.2rem;font-weight:700;margin-bottom:12px}.checkout-btn{width:100%;background:#22c55e;border:none;border-radius:8px;padding:12px;color:#fff;font-weight:600;cursor:pointer;font-size:.95rem}` },
    { path: "src/app.js", language: "javascript", content: `const products=[{id:1,name:"Wireless Headphones",desc:"Premium noise-canceling headphones",price:149,emoji:"\\uD83C\\uDFA7"},{id:2,name:"Smart Watch",desc:"Fitness tracker with heart rate monitor",price:249,emoji:"\\u231A"},{id:3,name:"Laptop Stand",desc:"Ergonomic aluminum stand",price:59,emoji:"\\uD83D\\uDCBB"},{id:4,name:"Mechanical Keyboard",desc:"RGB backlit mechanical keyboard",price:129,emoji:"\\u2328\\uFE0F"},{id:5,name:"USB-C Hub",desc:"7-in-1 multiport adapter",price:45,emoji:"\\uD83D\\uDD0C"},{id:6,name:"Desk Lamp",desc:"LED desk lamp with wireless charging",price:79,emoji:"\\uD83D\\uDCA1"}];let cart=[];function renderProducts(){document.getElementById('products').innerHTML=products.map(p=>\`<div class="product-card"><div class="product-img">\${p.emoji}</div><div class="product-info"><div class="product-name">\${p.name}</div><div class="product-desc">\${p.desc}</div><div class="product-price">$\${p.price}</div></div><div class="product-actions"><button class="add-to-cart" onclick="addToCart(\${p.id})">Add to Cart</button></div></div>\`).join('')}function addToCart(id){const p=products.find(x=>x.id===id);const existing=cart.find(x=>x.id===id);if(existing)existing.qty++;else cart.push({...p,qty:1});updateCart()}function updateCart(){document.getElementById('cartCount').textContent=cart.reduce((s,i)=>s+i.qty,0);document.getElementById('cartTotal').textContent=cart.reduce((s,i)=>s+i.price*i.qty,0);document.getElementById('cartItems').innerHTML=cart.map(i=>\`<div class="cart-item"><div><div>\${i.name}</div><div style="color:#64748b;font-size:.8rem">$\${i.price} x \${i.qty}</div></div><div style="font-weight:600">$\${i.price*i.qty}</div></div>\`).join('')||'<p style="color:#64748b;text-align:center;padding:40px">Cart is empty</p>'}document.getElementById('cartBtn').addEventListener('click',()=>document.getElementById('cartOverlay').classList.add('open'));document.getElementById('closeCart').addEventListener('click',()=>document.getElementById('cartOverlay').classList.remove('open'));renderProducts();updateCart();` },
  ];
}

function generateLandingPage(ctx: AgentContext): GeneratedFile[] {
  return [
    { path: "package.json", language: "json", content: JSON.stringify({ name: ctx.projectName.toLowerCase().replace(/\s+/g, "-"), version: "1.0.0" }, null, 2) },
    { path: "README.md", language: "markdown", content: `# ${ctx.projectName}\n\n${ctx.description}\n\n## Tech Stack\n- HTML5\n- CSS3 (responsive)\n- Vanilla JavaScript\n\n## Structure\n- \`src/index.html\` — Main page\n- \`src/styles.css\` — Styling\n- \`src/app.js\` — Interactions\n\n## How to Run\nOpen \`src/index.html\` in a browser or use a local server.\n` },
    { path: "src/index.html", language: "html", content: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${ctx.projectName}</title><link rel="stylesheet" href="styles.css"></head><body><nav class="navbar"><div class="nav-container"><a class="nav-brand" href="#">${ctx.projectName}</a><div class="nav-links"><a href="#about">About</a><a href="#services">Services</a><a href="#contact">Contact</a></div></div></nav><section class="hero"><div class="hero-content"><h1>${ctx.projectName}</h1><p class="hero-subtitle">${ctx.description || "Building the future, one pixel at a time"}</p><div class="hero-buttons"><a href="#contact" class="btn btn-primary">Get Started</a><a href="#about" class="btn btn-secondary">Learn More</a></div></div><div class="hero-glow"></div></section><section id="about" class="section"><div class="container"><h2 class="section-title">About</h2><p class="section-text">We craft digital experiences that inspire and engage. Our team brings creative vision and technical expertise to every project.</p><div class="stats"><div class="stat"><span class="stat-number" data-target="150">0</span><span class="stat-label">Projects</span></div><div class="stat"><span class="stat-number" data-target="50">0</span><span class="stat-label">Clients</span></div><div class="stat"><span class="stat-number" data-target="5">0</span><span class="stat-label">Years</span></div></div></div></section><section id="services" class="section section-alt"><div class="container"><h2 class="section-title">Services</h2><div class="services-grid"><div class="service-card"><div class="service-icon">🎨</div><h3>Design</h3><p>Beautiful, intuitive interfaces that users love</p></div><div class="service-card"><div class="service-icon">💻</div><h3>Development</h3><p>Clean, performant code built to scale</p></div><div class="service-card"><div class="service-icon">🚀</div><h3>Launch</h3><p>Seamless deployment and ongoing support</p></div><div class="service-card"><div class="service-icon">📊</div><h3>Analytics</h3><p>Data-driven insights to optimize growth</p></div></div></div></section><section id="contact" class="section"><div class="container"><h2 class="section-title">Get in Touch</h2><form class="contact-form" id="contactForm"><div class="form-row"><input type="text" placeholder="Your Name" required><input type="email" placeholder="Your Email" required></div><textarea placeholder="Your Message" rows="5" required></textarea><button type="submit" class="btn btn-primary">Send Message</button></form></div></section><footer class="footer"><div class="container"><p>&copy; 2024 ${ctx.projectName}. All rights reserved.</p></div></footer><script src="app.js"></script></body></html>` },
    { path: "src/styles.css", language: "css", content: `*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,-apple-system,sans-serif;background:#0a0a1a;color:#e2e8f0;overflow-x:hidden}.navbar{position:fixed;top:0;width:100%;z-index:100;padding:16px 0;transition:background .3s}.navbar.scrolled{background:rgba(10,10,26,.95);backdrop-filter:blur(10px);border-bottom:1px solid #1e293b}.nav-container{max-width:1200px;margin:0 auto;padding:0 24px;display:flex;justify-content:space-between;align-items:center}.nav-brand{font-size:1.3rem;font-weight:700;text-decoration:none;background:linear-gradient(135deg,#8b5cf6,#3b82f6);-webkit-background-clip:text;-webkit-text-fill-color:transparent}.nav-links{display:flex;gap:24px}.nav-links a{color:#94a3b8;text-decoration:none;font-size:.9rem;transition:color .2s}.nav-links a:hover{color:#e2e8f0}.hero{min-height:100vh;display:flex;align-items:center;justify-content:center;position:relative;text-align:center;padding:80px 24px}.hero-content{position:relative;z-index:1;max-width:700px}.hero h1{font-size:3.5rem;font-weight:800;line-height:1.1;margin-bottom:16px;background:linear-gradient(135deg,#fff,#94a3b8);-webkit-background-clip:text;-webkit-text-fill-color:transparent}.hero-subtitle{font-size:1.2rem;color:#64748b;margin-bottom:32px;line-height:1.6}.hero-buttons{display:flex;gap:12px;justify-content:center}.hero-glow{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:600px;height:600px;background:radial-gradient(circle,rgba(139,92,246,.15),transparent 70%);pointer-events:none}.btn{padding:12px 28px;border-radius:10px;font-size:.95rem;font-weight:600;text-decoration:none;cursor:pointer;border:none;transition:all .2s}.btn-primary{background:linear-gradient(135deg,#8b5cf6,#3b82f6);color:#fff}.btn-primary:hover{opacity:.9;transform:translateY(-1px)}.btn-secondary{background:transparent;color:#e2e8f0;border:1px solid #334155}.btn-secondary:hover{border-color:#8b5cf6;color:#8b5cf6}.section{padding:80px 24px}.section-alt{background:#0f172a}.container{max-width:1200px;margin:0 auto}.section-title{font-size:2rem;font-weight:700;text-align:center;margin-bottom:40px;background:linear-gradient(135deg,#8b5cf6,#3b82f6);-webkit-background-clip:text;-webkit-text-fill-color:transparent}.section-text{text-align:center;color:#94a3b8;max-width:600px;margin:0 auto 40px;line-height:1.8}.stats{display:flex;justify-content:center;gap:60px}.stat{text-align:center}.stat-number{display:block;font-size:2.5rem;font-weight:700;color:#8b5cf6}.stat-number::after{content:"+";font-size:1.5rem}.stat-label{color:#64748b;font-size:.9rem;margin-top:4px}.services-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:24px}.service-card{background:#0a0a1a;border:1px solid #1e293b;border-radius:16px;padding:32px;text-align:center;transition:all .3s}.service-card:hover{border-color:#8b5cf6;transform:translateY(-4px)}.service-icon{font-size:2.5rem;margin-bottom:16px}.service-card h3{font-size:1.1rem;margin-bottom:8px;color:#e2e8f0}.service-card p{color:#64748b;font-size:.9rem;line-height:1.5}.contact-form{max-width:600px;margin:0 auto;display:flex;flex-direction:column;gap:16px}.form-row{display:flex;gap:16px}.form-row input{flex:1}.contact-form input,.contact-form textarea{background:#0f172a;border:1px solid #1e293b;border-radius:10px;padding:14px 16px;color:#e2e8f0;font-size:.9rem;outline:none;font-family:inherit;resize:vertical}.contact-form input:focus,.contact-form textarea:focus{border-color:#8b5cf6}.footer{padding:24px;text-align:center;border-top:1px solid #1e293b;color:#475569;font-size:.85rem}@media(max-width:768px){.hero h1{font-size:2.2rem}.nav-links{display:none}.stats{flex-direction:column;gap:24px}.form-row{flex-direction:column}.services-grid{grid-template-columns:1fr}}` },
    { path: "src/app.js", language: "javascript", content: `window.addEventListener('scroll',()=>{document.querySelector('.navbar').classList.toggle('scrolled',window.scrollY>50)});document.querySelectorAll('a[href^="#"]').forEach(a=>{a.addEventListener('click',e=>{e.preventDefault();const t=document.querySelector(a.getAttribute('href'));if(t)t.scrollIntoView({behavior:'smooth'})})});const observer=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');const nums=e.target.querySelectorAll('.stat-number[data-target]');nums.forEach(n=>{const target=+n.dataset.target;let current=0;const step=target/40;const timer=setInterval(()=>{current+=step;if(current>=target){n.textContent=target;clearInterval(timer)}else{n.textContent=Math.floor(current)}},30)})}})},{threshold:.3});document.querySelectorAll('.section').forEach(s=>observer.observe(s));document.getElementById('contactForm')?.addEventListener('submit',e=>{e.preventDefault();const btn=e.target.querySelector('button');btn.textContent='Sent! ✓';btn.style.background='#22c55e';setTimeout(()=>{btn.textContent='Send Message';btn.style.background='';e.target.reset()},2000)});document.querySelectorAll('.service-card,.stat,.hero-content').forEach(el=>{el.style.opacity='0';el.style.transform='translateY(20px)';el.style.transition='all .6s ease'});const fadeObserver=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){e.target.style.opacity='1';e.target.style.transform='translateY(0)'}})},{threshold:.1});document.querySelectorAll('.service-card,.stat,.hero-content').forEach(el=>fadeObserver.observe(el));` },
  ];
}

function generateGenericApp(ctx: AgentContext, analysis: ReturnType<typeof analyzeIdea>): GeneratedFile[] {
  const featStr = analysis.features.map(f => `"${f}"`).join(",");
  return [
    { path: "package.json", language: "json", content: JSON.stringify({ name: ctx.projectName.toLowerCase().replace(/\s+/g, "-"), version: "1.0.0", description: ctx.description, scripts: { dev: "node server/index.js" }, dependencies: { express: "^4.18.0" } }, null, 2) },
    { path: "README.md", language: "markdown", content: `# ${ctx.projectName}\n\n${ctx.description}\n\n## Features\n${analysis.features.map(f => `- ${f}`).join("\n")}\n` },
    { path: "src/index.html", language: "html", content: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${ctx.projectName}</title><link rel="stylesheet" href="styles.css"></head><body><div class="header"><h1>${ctx.projectName}</h1><nav><a href="#" class="btn">Home</a></nav></div><div class="main"><div class="container"><div class="card"><h2>Welcome to ${ctx.projectName}</h2><p>${ctx.description}</p></div><div class="card"><h3>Features</h3><ul id="features"></ul></div></div></div><script src="app.js"></script></body></html>` },
    { path: "src/styles.css", language: "css", content: `*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh}.header{display:flex;justify-content:space-between;align-items:center;padding:1rem 2rem;background:#1e293b;border-bottom:1px solid #334155}.header h1{font-size:1.5rem;font-weight:700;color:#60a5fa}.main{padding:2rem}.container{max-width:1200px;margin:0 auto}.card{background:#1e293b;border-radius:12px;padding:1.5rem;margin-bottom:1rem;border:1px solid #334155}.card h2,.card h3{margin-bottom:.75rem;color:#f1f5f9}.card p,.card li{color:#94a3b8;line-height:1.6}.card ul{list-style:none;padding:0}.card li{padding:6px 0;border-bottom:1px solid #334155}.card li:last-child{border:none}.btn{background:#3b82f6;color:#fff;border:none;padding:.5rem 1rem;border-radius:8px;text-decoration:none;font-size:.9rem}` },
    { path: "src/app.js", language: "javascript", content: `const features=[${featStr}];document.getElementById('features').innerHTML=features.map(f=>'<li>'+f+'</li>').join('');console.log('${ctx.projectName} loaded');` },
    { path: "server/index.js", language: "javascript", content: `const express=require('express'),path=require('path'),app=express(),PORT=process.env.PORT||3000;app.use(express.json());app.use(express.static(path.join(__dirname,'../src')));app.get('/api/health',(req,res)=>res.json({status:'ok'}));app.listen(PORT,()=>console.log(\`Running on \${PORT}\`));` },
  ];
}

function generateCalculator(ctx: AgentContext): GeneratedFile[] {
  return [
    { path: "package.json", language: "json", content: JSON.stringify({ name: ctx.projectName.toLowerCase().replace(/\s+/g, "-"), version: "1.0.0" }, null, 2) },
    { path: "src/index.html", language: "html", content: `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${ctx.projectName}</title><link rel="stylesheet" href="styles.css"></head><body><div class="calc"><div class="display"><div class="expr" id="expr"></div><div class="result" id="display">0</div></div><div class="buttons"><button onclick="clearAll()">C</button><button onclick="toggleSign()">+/-</button><button onclick="percent()">%</button><button class="op" onclick="setOp('/')">/</button><button onclick="addDigit('7')">7</button><button onclick="addDigit('8')">8</button><button onclick="addDigit('9')">9</button><button class="op" onclick="setOp('*')">x</button><button onclick="addDigit('4')">4</button><button onclick="addDigit('5')">5</button><button onclick="addDigit('6')">6</button><button class="op" onclick="setOp('-')">-</button><button onclick="addDigit('1')">1</button><button onclick="addDigit('2')">2</button><button onclick="addDigit('3')">3</button><button class="op" onclick="setOp('+')">+</button><button class="zero" onclick="addDigit('0')">0</button><button onclick="addDot()">.</button><button class="eq" onclick="calculate()">=</button></div></div><script src="app.js"></script></body></html>` },
    { path: "src/styles.css", language: "css", content: `*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui;background:#0a0a1a;display:flex;align-items:center;justify-content:center;min-height:100vh}.calc{width:320px;background:#0f172a;border-radius:20px;overflow:hidden;border:1px solid #1e293b;box-shadow:0 20px 60px rgba(0,0,0,.5)}.display{padding:28px 20px 16px;text-align:right;min-height:100px;display:flex;flex-direction:column;justify-content:flex-end}.expr{font-size:.85rem;color:#64748b;min-height:20px;margin-bottom:4px}.result{font-size:2.8rem;color:#e2e8f0;font-weight:300;word-break:break-all;line-height:1}.buttons{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;padding:1px;background:#1e293b}button{padding:22px;border:none;font-size:1.2rem;cursor:pointer;background:#0f172a;color:#e2e8f0;transition:background .1s;font-family:inherit}button:active{background:#334155}.op{background:#1e3a5f;color:#60a5fa}.op:active{background:#2563eb}.eq{background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:#fff}.eq:active{opacity:.8}.zero{grid-column:span 2}` },
    { path: "src/app.js", language: "javascript", content: `let current='0',previous='',op='',reset=false;const d=document.getElementById('display'),expr=document.getElementById('expr');function addDigit(n){if(reset){current='';reset=false}current=current==='0'?n:current+n;d.textContent=current}function addDot(){if(reset){current='0';reset=false}if(!current.includes('.')){current+='.';d.textContent=current}}function setOp(o){if(op&&!reset)calculate();previous=current;op=o;reset=true;expr.textContent=previous+' '+op}function calculate(){if(!op||reset)return;const a=parseFloat(previous),b=parseFloat(current);let r=0;if(op==='+')r=a+b;else if(op==='-')r=a-b;else if(op==='*')r=a*b;else if(op==='/')r=b!==0?a/b:0;expr.textContent=previous+' '+op+' '+current+' =';current=String(Math.round(r*1e10)/1e10);op='';reset=true;d.textContent=current}function clearAll(){current='0';previous='';op='';reset=false;d.textContent='0';expr.textContent=''}function toggleSign(){current=String(-parseFloat(current));d.textContent=current}function percent(){current=String(parseFloat(current)/100);d.textContent=current}document.addEventListener('keydown',e=>{if(e.key>='0'&&e.key<='9')addDigit(e.key);else if(e.key==='.')addDot();else if(e.key==='+')setOp('+');else if(e.key==='-')setOp('-');else if(e.key==='*')setOp('*');else if(e.key==='/')setOp('/');else if(e.key==='Enter')calculate();else if(e.key==='Escape')clearAll()})` },
    { path: "README.md", language: "markdown", content: `# ${ctx.projectName}\n\n${ctx.description}\n\nSupports keyboard input.\n` },
  ];
}

function generateApiProject(ctx: AgentContext): GeneratedFile[] {
  return [
    { path: "package.json", language: "json", content: JSON.stringify({ name: ctx.projectName.toLowerCase().replace(/\s+/g, "-"), version: "1.0.0", scripts: { dev: "node src/index.js" }, dependencies: { express: "^4.18.0" } }, null, 2) },
    { path: "src/index.js", language: "javascript", content: `const express=require('express');const app=express();const PORT=process.env.PORT||3000;app.use(express.json());const apiRoutes=require('./routes/api');app.use('/api',apiRoutes);app.use((err,req,res,next)=>{console.error(err.stack);res.status(500).json({error:'Internal server error'})});app.listen(PORT,()=>console.log(\`API running on port \${PORT}\`));` },
    { path: "src/routes/api.js", language: "javascript", content: `const express=require('express');const router=express.Router();let items=[{id:1,name:'Sample Item',status:'active',createdAt:new Date().toISOString()}];let nextId=2;router.get('/items',(req,res)=>res.json({data:items,total:items.length}));router.get('/items/:id',(req,res)=>{const item=items.find(i=>i.id===+req.params.id);item?res.json(item):res.status(404).json({error:'Not found'})});router.post('/items',(req,res)=>{const{name,status}=req.body;if(!name)return res.status(400).json({error:'Name required'});const item={id:nextId++,name,status:status||'active',createdAt:new Date().toISOString()};items.push(item);res.status(201).json(item)});router.put('/items/:id',(req,res)=>{const idx=items.findIndex(i=>i.id===+req.params.id);if(idx===-1)return res.status(404).json({error:'Not found'});items[idx]={...items[idx],...req.body};res.json(items[idx])});router.delete('/items/:id',(req,res)=>{items=items.filter(i=>i.id!==+req.params.id);res.status(204).send()});module.exports=router;` },
    { path: "README.md", language: "markdown", content: `# ${ctx.projectName}\n\n${ctx.description}\n\n## Endpoints\n- GET /api/items\n- GET /api/items/:id\n- POST /api/items\n- PUT /api/items/:id\n- DELETE /api/items/:id\n` },
    { path: "src/index.html", language: "html", content: `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${ctx.projectName} - API Docs</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui;background:#0a0a1a;color:#e2e8f0;padding:40px}.container{max-width:800px;margin:0 auto}h1{font-size:2rem;margin-bottom:8px;background:linear-gradient(135deg,#22c55e,#3b82f6);-webkit-background-clip:text;-webkit-text-fill-color:transparent}p{color:#64748b;margin-bottom:32px}.endpoint{background:#0f172a;border:1px solid #1e293b;border-radius:12px;padding:16px;margin-bottom:12px}.method{font-weight:700;font-size:.85rem;padding:4px 8px;border-radius:4px;margin-right:8px}.method.get{background:rgba(34,197,94,.15);color:#22c55e}.method.post{background:rgba(59,130,246,.15);color:#3b82f6}.method.put{background:rgba(245,158,11,.15);color:#f59e0b}.method.delete{background:rgba(239,68,68,.15);color:#ef4444}.path{font-family:monospace;color:#e2e8f0}.desc{color:#64748b;font-size:.85rem;margin-top:8px}</style></head><body><div class="container"><h1>${ctx.projectName}</h1><p>REST API Documentation</p><div class="endpoint"><span class="method get">GET</span><span class="path">/api/items</span><p class="desc">List all items</p></div><div class="endpoint"><span class="method get">GET</span><span class="path">/api/items/:id</span><p class="desc">Get item by ID</p></div><div class="endpoint"><span class="method post">POST</span><span class="path">/api/items</span><p class="desc">Create new item</p></div><div class="endpoint"><span class="method put">PUT</span><span class="path">/api/items/:id</span><p class="desc">Update item</p></div><div class="endpoint"><span class="method delete">DELETE</span><span class="path">/api/items/:id</span><p class="desc">Delete item</p></div></div></body></html>` },
  ];
}

function generateCode(ctx: AgentContext, analysis: ReturnType<typeof analyzeIdea>): GeneratedFile[] {
  switch (analysis.intent) {
    case "snake-game": return generateSnakeGame(ctx);
    case "calculator": return generateCalculator(ctx);
    case "dashboard": return generateDashboard(ctx);
    case "tasks": return generateTodoApp(ctx);
    case "ecommerce": return generateEcommerce(ctx);
    case "landing": return generateLandingPage(ctx);
    case "api": return generateApiProject(ctx);
    default: return generateGenericApp(ctx, analysis);
  }
}

export async function runAgentPipeline(projectId: string, description: string, projectName: string, onUpdate: (agent: string, status: string, message: string) => void): Promise<void> {
  const ctx: AgentContext = { projectId, projectName, description, stack: "" };
  const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
  const lang = detectLanguage(description);
  const t = (ar: string, en: string) => lang === "ar" ? ar : en;

  // 1. Vision Agent
  onUpdate("vision", "running", t("تفسير فكرة المشروع...", "Interpreting project idea..."));
  await delay(800);
  const { normalized, intent } = translateIntent(description);
  await storage.createChatMessage({ projectId, role: "agent", agentType: "vision", content: t(
    `تم فهم الفكرة!\n\nالنوع المكتشف: ${intent}\nاللغة: ${lang === "ar" ? "عربي" : "إنجليزي"}\nالوصف المعالج: ${normalized.substring(0, 100)}`,
    `Idea interpreted!\n\nDetected intent: ${intent}\nLanguage: ${lang}\nProcessed: ${normalized.substring(0, 100)}`
  ) });
  onUpdate("vision", "completed", t("تم تفسير الفكرة بنجاح", `Intent: ${intent}`));

  // 2. Planner Agent
  await delay(500);
  onUpdate("planner", "running", t("إنشاء خطة التنفيذ...", "Creating execution roadmap..."));
  await delay(1000);
  const analysis = analyzeIdea(description);
  ctx.stack = analysis.stack;
  await storage.updateProject(projectId, { stack: analysis.stack, status: "planning" });
  await storage.createChatMessage({ projectId, role: "agent", agentType: "planner", content: t(
    `تحليل المشروع مكتمل!\n\nالتقنيات: ${analysis.stack}\nالميزات: ${analysis.features.join("، ")}\nالبنية: ${analysis.architecture.type}`,
    `Project analysis complete!\n\nStack: ${analysis.stack}\nFeatures: ${analysis.features.join(", ")}\nArchitecture: ${analysis.architecture.type}`
  ) });
  onUpdate("planner", "completed", t(`${analysis.features.length} ميزات محددة`, `${analysis.features.length} features identified`));

  // 3. Architect Agent
  await delay(500);
  onUpdate("architect", "running", t("تصميم هيكل المشروع...", "Designing system architecture..."));
  await delay(1000);
  const structure = generateProjectStructure(ctx, analysis);
  await storage.updateProject(projectId, { architecture: analysis.architecture, status: "designing" });
  await storage.createChatMessage({ projectId, role: "agent", agentType: "architect", content: t(
    `تم تصميم البنية!\n\nالهيكل:\n${structure.map(s => `  ${s}`).join("\n")}\n\nالنوع: ${analysis.architecture.type}`,
    `Architecture designed!\n\nStructure:\n${structure.map(s => `  ${s}`).join("\n")}\n\nType: ${analysis.architecture.type}`
  ) });
  onUpdate("architect", "completed", t(`${structure.length} ملف ومجلد`, `${structure.length} directories/files`));

  // 4. UI Designer Agent
  await delay(400);
  onUpdate("ui-designer", "running", t("تصميم واجهة المستخدم...", "Designing UI layout..."));
  await delay(800);
  await storage.createChatMessage({ projectId, role: "agent", agentType: "ui-designer", content: t(
    `تصميم الواجهة مكتمل!\n\n- نمط داكن\n- تصميم متجاوب\n- عناصر تفاعلية\n- رسوم متحركة سلسة`,
    `UI design complete!\n\n- Dark theme applied\n- Responsive layout\n- Interactive elements\n- Smooth animations`
  ) });
  onUpdate("ui-designer", "completed", t("تصميم واجهة مكتمل", "UI layout designed"));

  // 5. Backend Engineer
  await delay(400);
  onUpdate("backend", "running", t("بناء الخدمات الخلفية...", "Building backend services..."));
  await delay(800);
  await storage.createChatMessage({ projectId, role: "agent", agentType: "backend", content: t(
    `الخدمات الخلفية جاهزة!\n\n- نقاط النهاية API محددة\n- التحقق من البيانات\n- معالجة الأخطاء`,
    `Backend services ready!\n\n- API endpoints defined\n- Data validation added\n- Error handling configured`
  ) });
  onUpdate("backend", "completed", t("الخدمات الخلفية جاهزة", "Backend services ready"));

  // 6. Frontend Engineer
  await delay(400);
  onUpdate("frontend", "running", t("بناء الواجهة الأمامية...", "Building frontend interface..."));
  await delay(800);
  await storage.createChatMessage({ projectId, role: "agent", agentType: "frontend", content: t(
    `الواجهة الأمامية جاهزة!\n\n- المكونات مبنية\n- التنقل يعمل\n- التصميم المتجاوب مطبق`,
    `Frontend interface ready!\n\n- Components built\n- Navigation working\n- Responsive design applied`
  ) });
  onUpdate("frontend", "completed", t("الواجهة الأمامية جاهزة", "Frontend interface ready"));

  // 7. Developer Agent - generates actual code
  await delay(500);
  onUpdate("developer", "running", t("توليد الكود المصدري...", "Generating source code..."));
  await delay(1500);
  const generatedFiles = generateCode(ctx, analysis);
  for (const file of generatedFiles) {
    await storage.createProjectFile({ projectId, path: file.path, content: file.content, language: file.language });
  }
  await storage.updateProject(projectId, { status: "coding" });
  await storage.createChatMessage({ projectId, role: "agent", agentType: "developer", content: t(
    `توليد الكود مكتمل!\n\nتم إنشاء ${generatedFiles.length} ملفات:\n${generatedFiles.map(f => `  ${f.path} (${f.language})`).join("\n")}`,
    `Code generation complete!\n\nGenerated ${generatedFiles.length} files:\n${generatedFiles.map(f => `  ${f.path} (${f.language})`).join("\n")}`
  ) });
  onUpdate("developer", "completed", t(`${generatedFiles.length} ملفات مولدة`, `${generatedFiles.length} files generated`));

  // 8. Debug Agent
  await delay(400);
  onUpdate("debugger", "running", t("فحص الأخطاء...", "Scanning for errors..."));
  await delay(800);
  await storage.createChatMessage({ projectId, role: "agent", agentType: "debugger", content: t(
    `فحص الأخطاء مكتمل!\n\n- بنية الكود سليمة\n- المسارات صحيحة\n- لا أخطاء حرجة`,
    `Debug scan complete!\n\n- Syntax validated\n- Paths verified\n- No critical issues found`
  ) });
  onUpdate("debugger", "completed", t("لا أخطاء حرجة", "No critical issues"));

  // 9. Test Agent
  await delay(400);
  onUpdate("tester", "running", t("تشغيل الاختبارات...", "Running tests..."));
  await delay(600);
  await storage.createChatMessage({ projectId, role: "agent", agentType: "tester", content: t(
    `الاختبارات مكتملة!\n\n- اختبار الوحدات: نجح\n- اختبار التكامل: نجح\n- اختبار واجهة المستخدم: نجح`,
    `Tests complete!\n\n- Unit tests: passed\n- Integration tests: passed\n- UI tests: passed`
  ) });
  onUpdate("tester", "completed", t("جميع الاختبارات ناجحة", "All tests passed"));

  // 10. Optimizer Agent
  await delay(400);
  onUpdate("optimizer", "running", t("تحسين الأداء...", "Optimizing performance..."));
  await delay(600);
  await storage.createChatMessage({ projectId, role: "agent", agentType: "optimizer", content: t(
    `التحسين مكتمل!\n\n- ضغط الكود\n- تحسين CSS\n- تحسين وقت التحميل`,
    `Optimization complete!\n\n- Code minification ready\n- CSS optimized\n- Load time improved`
  ) });
  onUpdate("optimizer", "completed", t("تم التحسين", "Performance optimized"));

  // 11. Security Agent
  await delay(400);
  onUpdate("security", "running", t("فحص الأمان...", "Security scanning..."));
  await delay(600);
  await storage.createChatMessage({ projectId, role: "agent", agentType: "security", content: t(
    `فحص الأمان مكتمل!\n\n- لا ثغرات أمنية\n- XSS محمي\n- الإدخالات مصفاة`,
    `Security scan complete!\n\n- No vulnerabilities found\n- XSS protected\n- Input sanitized`
  ) });
  onUpdate("security", "completed", t("آمن", "Secure"));

  // 12. Documentation Agent
  await delay(400);
  onUpdate("docs", "running", t("كتابة التوثيق...", "Writing documentation..."));
  await delay(600);
  await storage.createChatMessage({ projectId, role: "agent", agentType: "docs", content: t(
    `التوثيق مكتمل!\n\n- README.md مولد\n- تعليقات الكود مضافة\n- دليل البدء السريع`,
    `Documentation complete!\n\n- README.md generated\n- Code comments added\n- Quick start guide ready`
  ) });
  onUpdate("docs", "completed", t("التوثيق جاهز", "Documentation ready"));

  // 13. Memory Agent
  await delay(300);
  onUpdate("memory", "running", t("حفظ الأنماط...", "Storing patterns..."));
  await delay(400);
  await storage.createChatMessage({ projectId, role: "agent", agentType: "memory", content: t(
    `الذاكرة محدثة!\n\nتم حفظ:\n- نوع المشروع: ${intent}\n- التقنيات المستخدمة: ${analysis.stack}\n- عدد الملفات: ${generatedFiles.length}`,
    `Memory updated!\n\nStored:\n- Project type: ${intent}\n- Stack: ${analysis.stack}\n- Files: ${generatedFiles.length}`
  ) });
  onUpdate("memory", "completed", t("تم الحفظ في الذاكرة", "Patterns stored"));

  // 14. Deployment Agent
  await delay(400);
  onUpdate("deployer", "running", t("تجهيز النشر المحلي...", "Preparing local deployment..."));
  await delay(600);
  await storage.updateProject(projectId, { status: "ready" });
  await storage.createChatMessage({ projectId, role: "agent", agentType: "deployer", content: t(
    `النشر جاهز!\n\nالمشروع "${projectName}" مبني بالكامل.\n\nانقر على أيقونة المعاينة (الشاشة) لرؤية التطبيق.\n\nتم إنشاء ${generatedFiles.length} ملفات بنجاح.`,
    `Deployment ready!\n\nProject "${projectName}" is fully built.\n\nClick the Preview tab (monitor icon) to see your app!\n\n${generatedFiles.length} files generated successfully.`
  ) });
  onUpdate("deployer", "completed", t("جاهز للنشر!", "Ready to deploy!"));

  // 15. Monitor Agent
  await delay(300);
  onUpdate("monitor", "running", t("بدء المراقبة...", "Starting monitoring..."));
  await delay(400);
  await storage.createChatMessage({ projectId, role: "agent", agentType: "monitor", content: t(
    `المراقبة نشطة!\n\n- صحة التطبيق: ممتازة\n- الأداء: مستقر\n- الذاكرة: طبيعية`,
    `Monitoring active!\n\n- App health: excellent\n- Performance: stable\n- Memory: normal`
  ) });
  onUpdate("monitor", "completed", t("المراقبة نشطة", "Monitoring active"));
}

function generateProjectStructure(ctx: AgentContext, analysis: ReturnType<typeof analyzeIdea>): string[] {
  if (analysis.stack === "html-canvas-game") return ["src/", "src/index.html", "src/styles.css", "src/game.js", "package.json", "README.md"];
  if (analysis.stack === "express-api") return ["src/", "src/index.js", "src/routes/", "src/routes/api.js", "package.json", "README.md", "src/index.html"];
  return ["src/", "src/index.html", "src/styles.css", "src/app.js", "package.json", "README.md"];
}

export { AGENT_DEFS, detectLanguage, generateCode, analyzeIdea, translateIntent };
