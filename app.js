/* global math, firebase */

(() => {
  // ---------------- Firebase Init ----------------
  const firebaseConfig = {
    apiKey: "AIzaSyDpZskO9fjNU0Fh8v6n5Pf-2m-JdjEpsr0",
    authDomain: "graph-plotter-5ec11.firebaseapp.com",
    projectId: "graph-plotter-5ec11",
    storageBucket: "graph-plotter-5ec11.firebasestorage.app",
    messagingSenderId: "1096298485646",
    appId: "1:1096298485646:web:78beee9d528dc6b2cb36df",
    measurementId: "G-3WEMFQF3PG"
  };

  const app = firebase.initializeApp(firebaseConfig);
  const auth = firebase.getAuth(app);
  const db = firebase.getFirestore(app);

  // -------------- DOM Helpers --------------
  const el = (s) => document.querySelector(s);
  const els = (s) => Array.from(document.querySelectorAll(s));
  const views = {
    auth: el('#authView'),
    dashboard: el('#dashboardView'),
    editor: el('#editorView')
  };
  const userArea = el('#userArea');
  const themeSel = el('#themeSel');
  const logoutBtn = el('#logoutBtn');

  // Auth form elements
  const loginEmail = el('#loginEmail'), loginPassword = el('#loginPassword'), loginBtn = el('#loginBtn'), loginMsg = el('#loginMsg');
  const regName = el('#regName'), regEmail = el('#regEmail'), regPassword = el('#regPassword'), registerBtn = el('#registerBtn'), registerMsg = el('#registerMsg');
  const authTabs = els('.auth-card .tab');

  // Dashboard
  const newPlaygroundBtn = el('#newPlaygroundBtn'), myList = el('#myList'), sharedList = el('#sharedList');

  // Editor
  const canvas = el('#canvas'), statusEl = el('#status');
  const pgNameEl = el('#pgName'), saveBtn = el('#saveBtn'), backBtn = el('#backBtn'), exportPngBtn = el('#exportPngBtn');

  // Layer panels
  const addExplicitBtn = el('#addExplicitBtn'), exprInput = el('#exprInput'), exXmin = el('#exXmin'), exXmax = el('#exXmax'), exSamples = el('#exSamples');
  const addParamBtn = el('#addParamBtn'), pxInput = el('#pxInput'), pyInput = el('#pyInput'), ptMin = el('#ptMin'), ptMax = el('#ptMax'), ptSamples = el('#ptSamples');
  const addPolarBtn = el('#addPolarBtn'), prInput = el('#prInput'), poMin = el('#poMin'), poMax = el('#poMax'), poSamples = el('#poSamples');
  const addImplicitBtn = el('#addImplicitBtn'), imInput = el('#imInput'), imGrid = el('#imGrid'), imStroke = el('#imStroke');
  const addIneqBtn = el('#addIneqBtn'), iqInput = el('#iqInput'), iqGrid = el('#iqGrid'), iqAlpha = el('#iqAlpha');
  const addPointsBtn = el('#addPointsBtn'), ptsInput = el('#ptsInput');
  const fnPalette = el('#fnPalette');
  const layersEl = el('#layers');

  // View controls
  const xminEl = el('#xmin'), xmaxEl = el('#xmax'), yminEl = el('#ymin'), ymaxEl = el('#ymax');
  const fitBtn = el('#fitBtn'), resetViewBtn = el('#resetViewBtn');
  const toggleGridBtn = el('#toggleGridBtn'), toggleTicksBtn = el('#toggleTicksBtn'), toggleCrosshairBtn = el('#toggleCrosshairBtn');
  const zoomInBtn = el('#zoomInBtn'), zoomOutBtn = el('#zoomOutBtn');

  // Share
  const inviteEmail = el('#inviteEmail'), inviteBtn = el('#inviteBtn');

  // Panels tabs
  const editorTabs = els('.group .tabs .tab');
  const panels = {
    explicit: el('#panel-explicit'),
    parametric: el('#panel-parametric'),
    polar: el('#panel-polar'),
    implicit: el('#panel-implicit'),
    inequality: el('#panel-inequality'),
    points: el('#panel-points')
  };

  // -------------- State --------------
  let me = null;
  let playground = null;       // doc data of current playground
  let pgUnsub = null;          // firestore unsubscribe for the current playground
  let myUnsub = null, sharedUnsub = null; // dashboard listeners

  // Render state
  let dpr = window.devicePixelRatio || 1;
  let ctx = canvas.getContext('2d');
  const COLORS = ['#4f8cff','#ff6b6b','#22c55e','#f59e0b','#a78bfa','#14b8a6','#ef4444','#eab308','#06b6d4','#fb7185','#94a3b8','#f97316'];
  const renderState = {
    xmin: -10, xmax: 10, ymin: -6, ymax: 6,
    grid: true, ticks: true, crosshair: true,
    drag: false, dragStart: null, lastMouse: { x: 0, y: 0 },
    layers: [] // [{ id, type, name, color, style, visible, config }]
  };
  const pickColor = (i) => COLORS[i % COLORS.length];

  // -------------- UI Switching & Theme --------------
  function show(view) {
    Object.values(views).forEach(v => v.classList.add('hidden'));
    if (view === 'auth') views.auth.classList.remove('hidden');
    if (view === 'dashboard') views.dashboard.classList.remove('hidden');
    if (view === 'editor') views.editor.classList.remove('hidden');
  }
  function setTheme(t) {
    document.body.setAttribute('data-theme', t);
    localStorage.setItem('theme', t);
    draw();
  }
  themeSel.addEventListener('change', () => setTheme(themeSel.value));
  setTheme(localStorage.getItem('theme') || 'dark');
  themeSel.value = localStorage.getItem('theme') || 'dark';

  // -------------- Auth Tabs --------------
  authTabs.forEach(btn => btn.addEventListener('click', () => {
    authTabs.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    els('.auth-card .tab-content').forEach(c => c.classList.remove('active'));
    el('#tab-' + btn.dataset.tab).classList.add('active');
  }));

  // -------------- Firebase Auth Handlers --------------
  firebase.onAuthStateChanged(auth, async (user) => {
    me = user;
    if (user) {
      userArea.textContent = user.email || '(user)';
      logoutBtn.classList.remove('hidden');
      show('dashboard');
      await attachDashboardListeners();
    } else {
      userArea.textContent = '';
      logoutBtn.classList.add('hidden');
      detachDashboardListeners();
      if (pgUnsub) { pgUnsub(); pgUnsub = null; }
      show('auth');
    }
  });

  logoutBtn.addEventListener('click', async () => {
    await firebase.signOut(auth);
  });

  loginBtn.addEventListener('click', async () => {
    loginMsg.textContent = '';
    try {
      await firebase.signInWithEmailAndPassword(auth, loginEmail.value.trim(), loginPassword.value.trim());
    } catch (e) {
      loginMsg.textContent = e.message;
    }
  });

  registerBtn.addEventListener('click', async () => {
    registerMsg.textContent = '';
    try {
      const cred = await firebase.createUserWithEmailAndPassword(auth, regEmail.value.trim(), regPassword.value.trim());
      await firebase.updateProfile(cred.user, { displayName: regName.value.trim() || '' });
    } catch (e) {
      registerMsg.textContent = e.message;
    }
  });

  // -------------- Dashboard (Firestore) --------------
  function detachDashboardListeners() {
    if (myUnsub) { myUnsub(); myUnsub = null; }
    if (sharedUnsub) { sharedUnsub(); sharedUnsub = null; }
    myList.innerHTML = ''; sharedList.innerHTML = '';
  }
  async function attachDashboardListeners() {
    const uid = me.uid;
    const myQuery = firebase.query(
      firebase.collection(db, 'playgrounds'),
      firebase.where('ownerId','==', uid),
      firebase.orderBy('updatedAt','desc')
    );
    const sharedQuery = firebase.query(
      firebase.collection(db, 'playgrounds'),
      firebase.where('collaborators', 'array-contains', uid),
      firebase.orderBy('updatedAt','desc')
    );
    myUnsub = firebase.onSnapshot(myQuery, (snap) => renderList(myList, snap));
    sharedUnsub = firebase.onSnapshot(sharedQuery, (snap) => renderList(sharedList, snap));
  }
  function renderList(container, snap) {
    container.innerHTML = '';
    snap.forEach(doc => {
      const pg = doc.data();
      pg.id = doc.id;
      const div = document.createElement('div');
      div.className = 'item';
      div.innerHTML = `
        <div>
          <div><strong>${escapeHtml(pg.name || 'Untitled')}</strong></div>
          <div class="meta">${pg.updatedAt?.toDate ? pg.updatedAt.toDate().toLocaleString() : ''}</div>
        </div>
        <div class="row">
          <button class="btn open">Open</button>
          ${pg.ownerId === me?.uid ? '<button class="btn danger del">Delete</button>' : ''}
        </div>`;
      div.querySelector('.open').addEventListener('click', () => openPlayground(pg.id));
      if (pg.ownerId === me?.uid) {
        div.querySelector('.del').addEventListener('click', () => deletePlayground(pg.id));
      }
      container.appendChild(div);
    });
  }

  newPlaygroundBtn.addEventListener('click', async () => {
    const name = prompt('Name your playground', 'Untitled');
    if (!name) return;
    const now = firebase.serverTimestamp();
    await firebase.addDoc(firebase.collection(db, 'playgrounds'), {
      ownerId: me.uid,
      name,
      layers: [],
      view: { xmin: -10, xmax: 10, ymin: -6, ymax: 6, grid: true, ticks: true, crosshair: true },
      collaborators: [], // array of user UIDs
      createdAt: now,
      updatedAt: now
    });
  });

  async function deletePlayground(id) {
    const docRef = firebase.doc(db, 'playgrounds', id);
    const pgDoc = await firebase.getDoc(docRef);
    const pg = pgDoc.data();
    if (!pg || pg.ownerId !== me.uid) return alert('Only owner can delete.');
    if (!confirm('Delete playground?')) return;
    await firebase.deleteDoc(docRef);
  }

  // -------------- Editor (Open + Realtime) --------------
  async function openPlayground(id) {
    if (pgUnsub) { pgUnsub(); pgUnsub = null; }
    const docRef = firebase.doc(db, 'playgrounds', id);
    pgUnsub = firebase.onSnapshot(docRef, (snap) => {
      if (!snap.exists()) {
        alert('Playground deleted');
        show('dashboard');
        return;
      }
      playground = { id: snap.id, ...snap.data() };
      // Merge into render state
      renderState.layers = (playground.layers || []).map(l => ({ ...l }));
      if (playground.view) Object.assign(renderState, playground.view);
      pgNameEl.value = playground.name || 'Untitled';
      syncViewInputs();
      renderLayersList();
      resizeCanvas();
      show('editor');
    });
  }

  backBtn.addEventListener('click', () => { show('dashboard'); });

  saveBtn.addEventListener('click', async () => {
    if (!playground) return;
    const docRef = firebase.doc(db, 'playgrounds', playground.id);
    await firebase.updateDoc(docRef, {
      name: pgNameEl.value || playground.name,
      layers: renderState.layers,
      view: pickViewState(),
      updatedAt: firebase.serverTimestamp()
    });
  });

  inviteBtn.addEventListener('click', async () => {
    if (!playground) return;
    const email = inviteEmail.value.trim().toLowerCase();
    if (!email) return;
    // Look up user by email with a public mapping collection (optional).
    // Since there's no backend, we store a directory: users/{uid} {email}
    const usersCol = firebase.collection(db, 'users');
    const q = firebase.query(usersCol, firebase.where('email','==', email), firebase.limit(1));
    const found = await firebase.getDocs(q);
    if (found.empty) return alert('No such user (user must log in once to be discoverable).');
    const uid = found.docs[0].id;
    const docRef = firebase.doc(db, 'playgrounds', playground.id);
    const pgDoc = await firebase.getDoc(docRef);
    const collabs = (pgDoc.data().collaborators || []);
    if (!collabs.includes(uid)) collabs.push(uid);
    await firebase.updateDoc(docRef, { collaborators: collabs, updatedAt: firebase.serverTimestamp() });
    inviteEmail.value = '';
    alert('Access granted.');
  });

  // On first login, ensure a users doc exists for discovery by email
  firebase.onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    const uref = firebase.doc(db, 'users', user.uid);
    const snap = await firebase.getDoc(uref);
    if (!snap.exists()) {
      await firebase.setDoc(uref, { email: user.email || '', name: user.displayName || '' });
    }
  });

  // -------------- Canvas & Rendering --------------
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(1,0,0,1,0,0);
    ctx.scale(dpr, dpr);
    draw();
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  function worldToScreen(x, y) {
    const rect = canvas.getBoundingClientRect(), w = rect.width, h = rect.height;
    const sx = (x - renderState.xmin) / (renderState.xmax - renderState.xmin) * w;
    const sy = h - (y - renderState.ymin) / (renderState.ymax - renderState.ymin) * h;
    return { x: sx, y: sy };
  }
  function screenToWorld(sx, sy) {
    const rect = canvas.getBoundingClientRect(), w = rect.width, h = rect.height;
    const x = renderState.xmin + (sx / w) * (renderState.xmax - renderState.xmin);
    const y = renderState.ymin + ((h - sy) / h) * (renderState.ymax - renderState.ymin);
    return { x, y };
  }
  function niceStep(pixelsPerUnit) {
    const targetUnits = 80 / pixelsPerUnit;
    const pow10 = Math.pow(10, Math.floor(Math.log10(targetUnits)));
    const cands = [1,2,5,10].map(m => m * pow10);
    return cands.reduce((a,b)=> Math.abs(a-targetUnits) < Math.abs(b-targetUnits) ? a : b);
  }
  function formatTick(v) {
    const a = Math.abs(v);
    if (a === 0) return '0';
    if (a >= 10000 || a < 0.001) return v.toExponential(1);
    if (a < 1) return v.toFixed(2);
    if (a < 10) return v.toFixed(1);
    return v.toFixed(0);
  }

  function drawGridAxes() {
    const rect = canvas.getBoundingClientRect(), w = rect.width, h = rect.height;
    ctx.clearRect(0,0,w,h);
    if (renderState.grid) {
      ctx.save();
      ctx.strokeStyle = getCss('--grid'); ctx.lineWidth = 1;
      const pxPerX = w / (renderState.xmax - renderState.xmin);
      const stepX = niceStep(pxPerX);
      let x0 = Math.ceil(renderState.xmin / stepX) * stepX;
      for (let x = x0; x <= renderState.xmax; x += stepX) {
        const p = worldToScreen(x, 0);
        ctx.beginPath(); ctx.moveTo(p.x, 0); ctx.lineTo(p.x, h); ctx.stroke();
      }
      const pxPerY = h / (renderState.ymax - renderState.ymin);
      const stepY = niceStep(pxPerY);
      let y0 = Math.ceil(renderState.ymin / stepY) * stepY;
      for (let y = y0; y <= renderState.ymax; y += stepY) {
        const p = worldToScreen(0, y);
        ctx.beginPath(); ctx.moveTo(0, p.y); ctx.lineTo(w, p.y); ctx.stroke();
      }
      ctx.restore();
    }
    // axes
    ctx.save();
    ctx.strokeStyle = getCss('--axis'); ctx.lineWidth = 1.5;
    if (renderState.xmin < 0 && renderState.xmax > 0) { const p = worldToScreen(0,0); ctx.beginPath(); ctx.moveTo(p.x, 0); ctx.lineTo(p.x, h); ctx.stroke(); }
    if (renderState.ymin < 0 && renderState.ymax > 0) { const p = worldToScreen(0,0); ctx.beginPath(); ctx.moveTo(0, p.y); ctx.lineTo(w, p.y); ctx.stroke(); }
    ctx.restore();
    // ticks
    if (renderState.ticks) {
      ctx.save();
      ctx.fillStyle = getCss('--axis'); ctx.font = '12px system-ui, Segoe UI, Roboto';
      const pxPerX = w / (renderState.xmax - renderState.xmin);
      const stepX = niceStep(pxPerX);
      let x0 = Math.ceil(renderState.xmin / stepX) * stepX;
      const yAxisY = Math.min(Math.max(worldToScreen(0, renderState.ymax).y, 0), h-14);
      for (let x = x0; x <= renderState.xmax; x += stepX) {
        const p = worldToScreen(x, 0);
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(formatTick(x), p.x, yAxisY);
      }
      const pxPerY = h / (renderState.ymax - renderState.ymin);
      const stepY = niceStep(pxPerY);
      let y0 = Math.ceil(renderState.ymin / stepY) * stepY;
      const xAxisX = Math.min(Math.max(worldToScreen(renderState.xmin, 0).x + 32, 32), w - 4);
      for (let y = y0; y <= renderState.ymax; y += stepY) {
        const p = worldToScreen(0, y);
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(formatTick(y), xAxisX, p.y);
      }
      ctx.restore();
    }
  }

  function drawLayers() {
    renderState.layers.forEach(layer => {
      if (!layer.visible) return;
      switch (layer.type) {
        case 'explicit': drawExplicit(layer); break;
        case 'parametric': drawParametric(layer); break;
        case 'polar': drawPolar(layer); break;
        case 'implicit': drawImplicit(layer); break;
        case 'inequality': drawInequality(layer); break;
        case 'points': drawPoints(layer); break;
      }
    });
  }
  function drawCrosshair() {
    if (!renderState.crosshair) return;
    const rect = canvas.getBoundingClientRect();
    const { x, y } = renderState.lastMouse;
    if (x<0 || y<0 || x>rect.width || y>rect.height) return;
    ctx.save();
    ctx.strokeStyle = document.body.getAttribute('data-theme') === 'light'
      ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.35)';
    ctx.setLineDash([5,5]);
    ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,rect.height); ctx.moveTo(0,y); ctx.lineTo(rect.width,y); ctx.stroke();
    ctx.restore();
  }
  function draw() {
    drawGridAxes();
    drawLayers();
    drawCrosshair();
  }

  // -------- Math compile (math.js) --------
  function compileExpression(src) {
    const patched = src.replace(/\bln\s*\(/g, 'log(');
    const expr = math.parse(patched);
    const code = expr.compile();
    return (scope) => code.evaluate(scope);
  }

  // -------- Layer Renderers --------
  function setStroke(layer) {
    ctx.strokeStyle = layer.color || '#fff';
    ctx.lineWidth = layer.style?.width || 2;
    if (layer.style?.dash === 'dash') ctx.setLineDash([6,4]);
    else if (layer.style?.dash === 'dot') ctx.setLineDash([2,3]);
    else ctx.setLineDash([]);
  }
  function drawExplicit(layer) {
    const { expr, domainMin, domainMax, samples } = layer.config;
    const f = compileExpression(expr);
    setStroke(layer);
    ctx.beginPath();
    let first = true;
    for (let i=0; i<=samples; i++) {
      const x = domainMin + (i / samples) * (domainMax - domainMin);
      let y;
      try { y = f({ x }); if (!isFinite(y)) { first = true; continue; } }
      catch { first = true; continue; }
      const p = worldToScreen(x, y);
      if (first) { ctx.moveTo(p.x, p.y); first = false; }
      else { ctx.lineTo(p.x, p.y); }
    }
    ctx.stroke();
  }
  function drawParametric(layer) {
    const { xExpr, yExpr, tMin, tMax, samples } = layer.config;
    const fx = compileExpression(xExpr), fy = compileExpression(yExpr);
    setStroke(layer);
    ctx.beginPath();
    let first = true;
    for (let i=0; i<=samples; i++) {
      const t = tMin + (i / samples) * (tMax - tMin);
      let x, y;
      try { x = fx({ t }); y = fy({ t }); if (!isFinite(x) || !isFinite(y)) { first = true; continue; } }
      catch { first = true; continue; }
      const p = worldToScreen(x, y);
      if (first) { ctx.moveTo(p.x, p.y); first = false; }
      else { ctx.lineTo(p.x, p.y); }
    }
    ctx.stroke();
  }
  function drawPolar(layer) {
    const { rExpr, thMin, thMax, samples } = layer.config;
    const fr = compileExpression(rExpr);
    setStroke(layer);
    ctx.beginPath(); let first = true;
    for (let i=0; i<=samples; i++) {
      const theta = thMin + (i / samples) * (thMax - thMin);
      let r;
      try { r = fr({ theta }); if (!isFinite(r)) { first = true; continue; } }
      catch { first = true; continue; }
      const x = r * Math.cos(theta), y = r * Math.sin(theta);
      const p = worldToScreen(x, y);
      if (first) { ctx.moveTo(p.x, p.y); first = false; }
      else { ctx.lineTo(p.x, p.y); }
    }
    ctx.stroke();
  }
  function drawImplicit(layer) {
    const { Fexpr, grid, stroke } = layer.config;
    const F = compileExpression(Fexpr);
    setStroke({ ...layer, style: { width: stroke, dash: layer.style?.dash } });

    const cols = grid, rows = grid;
    const dx = (renderState.xmax - renderState.xmin) / cols;
    const dy = (renderState.ymax - renderState.ymin) / rows;

    ctx.beginPath();
    for (let i=0;i<cols;i++){
      for (let j=0;j<rows;j++){
        const x0 = renderState.xmin + i*dx, x1 = x0+dx;
        const y0 = renderState.ymin + j*dy, y1 = y0+dy;
        let f00, f10, f01, f11;
        try { f00 = F({x:x0,y:y0}); f10 = F({x:x1,y:y0}); f01 = F({x:x0,y:y1}); f11 = F({x:x1,y:y1}); }
        catch { continue; }
        const edges = [];
        function interp(a,b,fa,fb){ const t = fa===fb?0.5:(0-fa)/(fb-fa); return a + t*(b-a); }
        if (f00*f10 <= 0) edges.push({ x: interp(x0,x1,f00,f10), y: y0 });
        if (f10*f11 <= 0) edges.push({ x: x1, y: interp(y0,y1,f10,f11) });
        if (f11*f01 <= 0) edges.push({ x: interp(x0,x1,f11,f01), y: y1 });
        if (f01*f00 <= 0) edges.push({ x: x0, y: interp(y0,y1,f01,f00) });
        if (edges.length >= 2){
          const p0 = worldToScreen(edges[0].x, edges[0].y);
          const p1 = worldToScreen(edges[1].x, edges[1].y);
          ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
        }
      }
    }
    ctx.stroke();
  }
  function drawInequality(layer) {
    const { expr, grid, alpha } = layer.config;
    ctx.save();
    const col = hexToRgb(layer.color || '#ffffff');
    const fill = `rgba(${col.r},${col.g},${col.b},${alpha})`;
    ctx.fillStyle = fill;

    const rect = canvas.getBoundingClientRect();
    const cols = grid, rows = grid;
    const dx = (renderState.xmax - renderState.xmin) / cols;
    const dy = (renderState.ymax - renderState.ymin) / rows;

    let op = null, left = null, right = null;
    const ops = ['<=','>=','<','>','==','='];
    for (const o of ops) {
      const idx = expr.indexOf(o);
      if (idx !== -1) { op = o; left = expr.slice(0,idx).trim(); right = expr.slice(idx+o.length).trim(); break; }
    }
    function sat(l, r) {
      switch (op) {
        case '<=': return l <= r;
        case '>=': return l >= r;
        case '<': return l < r;
        case '>': return l > r;
        case '==':
        case '=': return Math.abs(l - r) < 1e-6;
        default: return false;
      }
    }

    if (op) {
      const fL = compileExpression(left);
      const fR = compileExpression(right);
      for (let i=0;i<cols;i++){
        for (let j=0;j<rows;j++){
          const x = renderState.xmin + (i+0.5)*dx;
          const y = renderState.ymin + (j+0.5)*dy;
          let L,R;
          try { L = fL({x,y}); R = fR({x,y}); } catch { continue; }
          if (!isFinite(L) || !isFinite(R)) continue;
          if (sat(L,R)) {
            const p = worldToScreen(x, y);
            ctx.fillRect(
              p.x - (dx/2)*(rect.width/(renderState.xmax - renderState.xmin)),
              p.y - (dy/2)*(rect.height/(renderState.ymax - renderState.ymin)),
              dx*(rect.width/(renderState.xmax - renderState.xmin)),
              dy*(rect.height/(renderState.ymax - renderState.ymin))
            );
          }
        }
      }
    }
    ctx.restore();
  }
  function drawPoints(layer) {
    const r = layer.config.radius || 3;
    ctx.save();
    ctx.fillStyle = layer.color || '#ffd166';
    layer.config.points.forEach(pt => {
      const p = worldToScreen(pt.x, pt.y);
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI*2); ctx.fill();
    });
    ctx.restore();
  }

  // -------- Interactions --------
  canvas.addEventListener('mousedown', (e) => {
    renderState.drag = true; renderState.dragStart = { x: e.clientX, y: e.clientY };
    canvas.style.cursor = 'grabbing';
  });
  window.addEventListener('mouseup', () => { renderState.drag = false; canvas.style.cursor = 'default'; });
  window.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    renderState.lastMouse = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    if (renderState.crosshair) {
      const wpt = screenToWorld(renderState.lastMouse.x, renderState.lastMouse.y);
      statusEl.textContent = `x=${wpt.x.toFixed(4)} y=${wpt.y.toFixed(4)}`;
    }
    if (!renderState.drag) { draw(); return; }
    const dx = e.clientX - renderState.dragStart.x;
    const dy = e.clientY - renderState.dragStart.y;
    renderState.dragStart = { x: e.clientX, y: e.clientY };
    const rectW = rect.width, rectH = rect.height;
    const worldDx = -dx / rectW * (renderState.xmax - renderState.xmin);
    const worldDy =  dy / rectH * (renderState.ymax - renderState.ymin);
    renderState.xmin += worldDx; renderState.xmax += worldDx;
    renderState.ymin += worldDy; renderState.ymax += worldDy;
    syncViewInputs(); draw();
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAtPointer(e.deltaY < 0 ? 0.9 : 1.1, e.clientX, e.clientY);
  }, { passive: false });

  function zoomAtPointer(factor, cx, cy) {
    const rect = canvas.getBoundingClientRect();
    const sx = (cx - rect.left), sy = (cy - rect.top);
    const { x: wx, y: wy } = screenToWorld(sx, sy);
    renderState.xmin = renderState.xmin + (wx - renderState.xmin) * (1 - factor);
    renderState.xmax = renderState.xmax - (renderState.xmax - wx) * (1 - factor);
    renderState.ymin = renderState.ymin + (wy - renderState.ymin) * (1 - factor);
    renderState.ymax = renderState.ymax - (renderState.ymax - wy) * (1 - factor);
    syncViewInputs(); draw();
  }
  zoomInBtn.addEventListener('click', () => {
    const rect = canvas.getBoundingClientRect();
    zoomAtPointer(0.85, rect.left + rect.width/2, rect.top + rect.height/2);
  });
  zoomOutBtn.addEventListener('click', () => {
    const rect = canvas.getBoundingClientRect();
    zoomAtPointer(1.15, rect.left + rect.width/2, rect.top + rect.height/2);
  });

  toggleGridBtn.addEventListener('click', () => { renderState.grid = !renderState.grid; draw(); });
  toggleTicksBtn.addEventListener('click', () => { renderState.ticks = !renderState.ticks; draw(); });
  toggleCrosshairBtn.addEventListener('click', () => { renderState.crosshair = !renderState.crosshair; draw(); });

  fitBtn.addEventListener('click', () => {
    let xmin = renderState.xmin, xmax = renderState.xmax;
    let ymin = Infinity, ymax = -Infinity;
    const probe = (x,y) => { if (isFinite(y)) { ymin = Math.min(ymin,y); ymax = Math.max(ymax,y); } };
    renderState.layers.forEach(layer => {
      if (!layer.visible) return;
      if (layer.type === 'explicit') {
        xmin = Math.min(xmin, layer.config.domainMin); xmax = Math.max(xmax, layer.config.domainMax);
        const f = compileExpression(layer.config.expr);
        const S = 400;
        for (let i=0;i<=S;i++){ const x = layer.config.domainMin + (i/S)*(layer.config.domainMax - layer.config.domainMin); try { probe(x, f({x})); } catch {} }
      }
      if (layer.type === 'parametric') {
        const fx = compileExpression(layer.config.xExpr);
        const fy = compileExpression(layer.config.yExpr);
        const S = 600;
        for (let i=0;i<=S;i++){ const t = layer.config.tMin + (i/S)*(layer.config.tMax - layer.config.tMin); try { const x = fx({t}); const y = fy({t}); xmin=Math.min(xmin,x); xmax=Math.max(xmax,x); probe(x,y); } catch {} }
      }
      if (layer.type === 'polar') {
        const fr = compileExpression(layer.config.rExpr);
        const S = 600;
        for (let i=0;i<=S;i++){ const th = layer.config.thMin + (i/S)*(layer.config.thMax - layer.config.thMin); try { const r = fr({theta:th}); const x = r*Math.cos(th), y = r*Math.sin(th); xmin=Math.min(xmin,x); xmax=Math.max(xmax,x); probe(x,y); } catch {} }
      }
      if (layer.type === 'points') {
        layer.config.points.forEach(p => { xmin=Math.min(xmin,p.x); xmax=Math.max(xmax,p.x); probe(p.x,p.y); });
      }
    });
    if (!isFinite(ymin) || !isFinite(ymax)) { draw(); return; }
    const padX = (xmax - xmin) * 0.1 || 1;
    const padY = (ymax - ymin) * 0.1 || 1;
    renderState.xmin = xmin - padX; renderState.xmax = xmax + padX;
    renderState.ymin = ymin - padY; renderState.ymax = ymax + padY;
    syncViewInputs(); draw();
  });

  resetViewBtn.addEventListener('click', () => {
    Object.assign(renderState, { xmin: -10, xmax: 10, ymin: -6, ymax: 6 });
    syncViewInputs(); draw();
  });

  function syncViewInputs() {
    xminEl.value = +renderState.xmin.toFixed(6);
    xmaxEl.value = +renderState.xmax.toFixed(6);
    yminEl.value = +renderState.ymin.toFixed(6);
    ymaxEl.value = +renderState.ymax.toFixed(6);
  }
  [xminEl, xmaxEl, yminEl, ymaxEl].forEach(inp => {
    inp.addEventListener('change', async () => {
      const xn = parseFloat(xminEl.value), xx = parseFloat(xmaxEl.value);
      const yn = parseFloat(yminEl.value), yx = parseFloat(ymaxEl.value);
      if (isFinite(xn) && isFinite(xx) && xn < xx) { renderState.xmin=xn; renderState.xmax=xx; }
      if (isFinite(yn) && isFinite(yx) && yn < yx) { renderState.ymin=yn; renderState.ymax=yx; }
      draw();
      // Save view immediately (lightweight collab)
      if (playground) {
        const docRef = firebase.doc(db, 'playgrounds', playground.id);
        await firebase.updateDoc(docRef, { view: pickViewState(), updatedAt: firebase.serverTimestamp() });
      }
    });
  });

  // -------- Layers & Legend --------
  function renderLayersList() {
    layersEl.innerHTML = '';
    renderState.layers.forEach((layer, idx) => {
      const row = document.createElement('div');
      row.className = 'layer';
      row.innerHTML = `
        <input type="checkbox" class="vis" ${layer.visible?'checked':''} />
        <div>
          <div class="name">${escapeHtml(layer.name)}</div>
          <div class="meta" style="color:var(--muted); font-size:12px;">${describeLayer(layer)}</div>
        </div>
        <div class="controls">
          <input type="color" class="color" value="${layer.color || pickColor(idx)}" />
          <select class="dash">
            <option value="solid" ${layer.style?.dash==='solid'?'selected':''}>Solid</option>
            <option value="dash" ${layer.style?.dash==='dash'?'selected':''}>Dash</option>
            <option value="dot" ${layer.style?.dash==='dot'?'selected':''}>Dot</option>
          </select>
          <input type="number" min="1" max="6" class="width" value="${layer.style?.width || 2}" title="Thickness" />
          <button class="btn small up">↑</button>
          <button class="btn small down">↓</button>
          <button class="btn small danger del">Remove</button>
        </div>
      `;
      const vis = row.querySelector('.vis');
      const color = row.querySelector('.color');
      const dash = row.querySelector('.dash');
      const width = row.querySelector('.width');
      const up = row.querySelector('.up');
      const down = row.querySelector('.down');
      const del = row.querySelector('.del');

      vis.addEventListener('change', async () => { layer.visible = vis.checked; draw(); await persistLayers(); });
      color.addEventListener('input', async () => { layer.color = color.value; draw(); await persistLayers(); });
      dash.addEventListener('change', async () => { layer.style = layer.style || {}; layer.style.dash = dash.value; draw(); await persistLayers(); });
      width.addEventListener('change', async () => { layer.style = layer.style || {}; layer.style.width = Math.max(1, Math.min(6, Number(width.value))); draw(); await persistLayers(); });
      up.addEventListener('click', async () => { if (idx>0) { [renderState.layers[idx-1], renderState.layers[idx]] = [renderState.layers[idx], renderState.layers[idx-1]]; renderLayersList(); draw(); await persistLayers(); }});
      down.addEventListener('click', async () => { if (idx<renderState.layers.length-1) { [renderState.layers[idx+1], renderState.layers[idx]] = [renderState.layers[idx], renderState.layers[idx+1]]; renderLayersList(); draw(); await persistLayers(); }});
      del.addEventListener('click', async () => { renderState.layers.splice(idx,1); renderLayersList(); draw(); await persistLayers(); });

      layersEl.appendChild(row);
    });
  }
  function describeLayer(layer) {
    switch (layer.type) {
      case 'explicit': return `y = ${layer.config.expr}  [${layer.config.domainMin}, ${layer.config.domainMax}]`;
      case 'parametric': return `x(t)=${layer.config.xExpr}, y(t)=${layer.config.yExpr}  t∈[${layer.config.tMin}, ${layer.config.tMax}]`;
      case 'polar': return `r(θ)=${layer.config.rExpr}  θ∈[${layer.config.thMin}, ${layer.config.thMax}]`;
      case 'implicit': return `F(x,y)=0 → ${layer.config.Fexpr}`;
      case 'inequality': return `Region: ${layer.config.expr}`;
      case 'points': return `${layer.config.points.length} point(s)`;
      default: return '';
    }
  }
  async function persistLayers() {
    if (!playground) return;
    const docRef = firebase.doc(db, 'playgrounds', playground.id);
    await firebase.updateDoc(docRef, { layers: renderState.layers, updatedAt: firebase.serverTimestamp() });
  }

  // -------- Add layer handlers --------
  addExplicitBtn.addEventListener('click', async () => {
    if (!exprInput.value.trim()) return;
    addLayer({
      type: 'explicit',
      name: `f(x) = ${exprInput.value.trim()}`,
      color: pickColor(renderState.layers.length),
      style: { width: 2, dash: 'solid' },
      visible: true,
      config: {
        expr: exprInput.value.trim(),
        domainMin: parseFloat(exXmin.value), domainMax: parseFloat(exXmax.value),
        samples: Math.max(200, Math.min(20000, parseInt(exSamples.value,10)))
      }
    });
  });
  addParamBtn.addEventListener('click', async () => {
    if (!pxInput.value.trim() || !pyInput.value.trim()) return;
    addLayer({
      type: 'parametric',
      name: `⟨x(t),y(t)⟩`,
      color: pickColor(renderState.layers.length),
      style: { width: 2, dash: 'solid' },
      visible: true,
      config: {
        xExpr: pxInput.value.trim(), yExpr: pyInput.value.trim(),
        tMin: parseFloat(ptMin.value), tMax: parseFloat(ptMax.value),
        samples: Math.max(200, Math.min(20000, parseInt(ptSamples.value,10)))
      }
    });
  });
  addPolarBtn.addEventListener('click', async () => {
    if (!prInput.value.trim()) return;
    addLayer({
      type: 'polar',
      name: `r(θ) = ${prInput.value.trim()}`,
      color: pickColor(renderState.layers.length),
      style: { width: 2, dash: 'solid' },
      visible: true,
      config: {
        rExpr: prInput.value.trim(),
        thMin: parseFloat(poMin.value), thMax: parseFloat(poMax.value),
        samples: Math.max(200, Math.min(20000, parseInt(poSamples.value,10)))
      }
    });
  });
  addImplicitBtn.addEventListener('click', async () => {
    if (!imInput.value.trim()) return;
    addLayer({
      type: 'implicit',
      name: `F(x,y) = 0`,
      color: pickColor(renderState.layers.length),
      style: { width: 2, dash: 'solid' },
      visible: true,
      config: {
        Fexpr: imInput.value.trim(),
        grid: Math.max(50, Math.min(600, parseInt(imGrid.value,10))),
        stroke: Math.max(1, Math.min(4, parseInt(imStroke.value,10)))
      }
    });
  });
  addIneqBtn.addEventListener('click', async () => {
    if (!iqInput.value.trim()) return;
    addLayer({
      type: 'inequality',
      name: `Region`,
      color: pickColor(renderState.layers.length),
      style: { width: 1, dash: 'dot' },
      visible: true,
      config: {
        expr: iqInput.value.trim(),
        grid: Math.max(50, Math.min(600, parseInt(iqGrid.value,10))),
        alpha: Math.max(0.05, Math.min(1, parseFloat(iqAlpha.value)))
      }
    });
  });
  addPointsBtn.addEventListener('click', async () => {
    const pts = parsePoints(ptsInput.value);
    if (pts.length === 0) return;
    addLayer({
      type: 'points',
      name: `Points`,
      color: '#ffd166',
      style: { width: 2, dash: 'solid' },
      visible: true,
      config: { points: pts, radius: 3 }
    });
  });
  async function addLayer(layer) {
    renderState.layers.push(layer);
    renderLayersList();
    draw();
    await persistLayers();
  }

  // -------- Function Palette --------
  const paletteItems = [
    'sin(x)','cos(x)','tan(x)','asin(x)','acos(x)','atan(x)',
    'sinh(x)','cosh(x)','tanh(x)','asinh(x)','acosh(x)','atanh(x)',
    'log(x)','ln(x)','exp(x)','sqrt(x)','abs(x)','sign(x)',
    'floor(x)','ceil(x)','round(x)',
    'pow(x,3)','x^2','PI','E',
    'gamma(x)','erf(x)',
    'if(x>0,1,-1)','mod(x,2)'
  ];
  fnPalette.innerHTML = '';
  paletteItems.forEach((txt, i) => {
    const div = document.createElement('div');
    div.className = 'chip';
    div.innerHTML = `<span class="color" style="background:${pickColor(i)}"></span> <span>${txt}</span>`;
    div.addEventListener('click', () => {
      insertAtCursor(exprInput, txt);
      exprInput.focus();
    });
    fnPalette.appendChild(div);
  });

  // -------- Export --------
  exportPngBtn.addEventListener('click', () => {
    const a = document.createElement('a');
    a.download = `${(pgNameEl.value || 'plot').replace(/\s+/g,'_')}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  });

  // -------- Utility --------
  function pickViewState() {
    return { xmin: renderState.xmin, xmax: renderState.xmax, ymin: renderState.ymin, ymax: renderState.ymax,
             grid: renderState.grid, ticks: renderState.ticks, crosshair: renderState.crosshair };
  }
  function parsePoints(text) {
    const pts = [];
    (text || '').split(/\r?\n/).forEach(line => {
      const s = line.trim(); if (!s) return;
      const p = s.split(',').map(x => x.trim());
      if (p.length >= 2) {
        const x = parseFloat(p[0]), y = parseFloat(p[1]);
        if (isFinite(x) && isFinite(y)) pts.push({ x, y });
      }
    });
    return pts;
  }
  function insertAtCursor(input, text) {
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const val = input.value;
    input.value = val.slice(0,start) + text + val.slice(end);
    input.selectionStart = input.selectionEnd = start + text.length;
  }
  function escapeHtml(s) { return (s||'').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function getCss(varName) { return getComputedStyle(document.body).getPropertyValue(varName); }
  function hexToRgb(hex) {
    const m = hex.replace('#',''); const bigint = parseInt(m, 16);
    if (m.length===3) { const r=((bigint>>8)&0xF)*17, g=((bigint>>4)&0xF)*17, b=(bigint&0xF)*17; return {r,g,b}; }
    return { r: (bigint>>16)&255, g:(bigint>>8)&255, b: bigint&255 };
  }

  // -------- Panel tab switching --------
  editorTabs.forEach(btn => btn.addEventListener('click', () => {
    editorTabs.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    Object.values(panels).forEach(p => p.classList.remove('active'));
    panels[btn.dataset.tab].classList.add('active');
  }));
})();
