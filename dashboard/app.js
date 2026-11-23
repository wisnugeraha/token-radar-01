// Token Radar dashboard: renders window.RADAR (written by main.ts) with no
// network. Sort by clicking a column header, filter with the toolbar, click
// a row for its detail view and farm plan. Hash routes: #detail=<slug> opens
// a protocol, #filter=cat:<Category> filters the board to one category.
(function () {
  'use strict';
  var R = window.RADAR;
  if (!R) { document.body.textContent = 'No radar data.'; return; }

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var money = function (n) {
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n;
  };
  var pct = function (n) {
    if (n === null || n === undefined) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  };
  var age = function (n) {
    if (n === null || n === undefined) return '—';
    if (n < 30) return n + 'd';
    if (n < 365) return Math.round(n / 30) + 'mo';
    return (n / 365).toFixed(1) + 'y';
  };

  // ---- header facts ----
  $('meta').innerHTML =
    '<div><dt>Snapshot</dt><dd>' + esc(R.as_of) + '</dd></div>' +
    '<div><dt>Model</dt><dd>' + esc(R.model_version) + '</dd></div>' +
    '<div><dt>Watchlist</dt><dd>' + R.watchlist_size + ' protocols</dd></div>' +
    '<div><dt>Board</dt><dd>' + R.board_size + ' rows</dd></div>';
  $('asof').textContent = R.as_of;
  $('stats').innerHTML =
    '<div class="stat"><b>' + R.board_size + '</b><span>protocols ranked, every rankable pre-token protocol in the snapshot</span></div>' +
    '<div class="stat"><b>' + R.watchlist_size + ' / ' + R.watchlist_size + '</b><span>watchlist protocols covered</span></div>' +
    '<div class="stat"><b>' + R.global_peer_multiple.toFixed(3) + '×</b><span>global peer multiple — median mcap / TVL of ' + R.global_peer_count + ' tokenised protocols</span></div>' +
    '<div class="stat"><b>' + money(R.rows[0].implied_value_usd) + '</b><span>top implied value, rank 1 of ' + R.board_size + '</span></div>';

  // ---- filter controls ----
  var cats = [], chains = [];
  R.rows.forEach(function (r) {
    if (r.category && cats.indexOf(r.category) < 0) cats.push(r.category);
    (r.chains || []).forEach(function (c) { if (chains.indexOf(c) < 0) chains.push(c); });
  });
  cats.sort(); chains.sort();
  $('cat').innerHTML = '<option value="">All categories</option>' + cats.map(function (c) {
    return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
  }).join('');
  $('chain').innerHTML = '<option value="">All chains</option>' + chains.map(function (c) {
    return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
  }).join('');

  var watchlist = {};
  (R.watchlist || []).forEach(function (s) { watchlist[s] = true; });

  var state = { q: '', cat: '', chain: '', watch: false, sort: 'rank', dir: 1, sel: null };

  function filtered() {
    var q = state.q.trim().toLowerCase();
    var rows = R.rows.filter(function (r) {
      if (state.watch && !watchlist[r.slug]) return false;
      if (state.cat && r.category !== state.cat) return false;
      if (state.chain && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (q && r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var k = state.sort, d = state.dir;
    rows.sort(function (a, b) {
      var av = a[k], bv = b[k];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === 'string') return av.localeCompare(bv) * d;
      return (av - bv) * d;
    });
    return rows;
  }

  function render() {
    var rows = filtered();
    $('rows').innerHTML = rows.map(function (r) {
      var chg = r.change_7d === null ? '<span class="num">—</span>'
        : '<span class="num ' + (r.change_7d >= 0 ? 'up' : 'down') + '">' + pct(r.change_7d) + '</span>';
      return '<tr data-slug="' + esc(r.slug) + '"' + (state.sel === r.slug ? ' class="sel"' : '') + '>' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><span class="name">' + esc(r.name) + (watchlist[r.slug] ? '<span class="badge">WATCH</span>' : '') +
        '<span class="slug">' + esc(r.slug) + '</span></span></td>' +
        '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td>' + chg + '</td>' +
        '<td class="num">' + age(r.age_days) + '</td>' +
        '<td class="num">' + r.peer_multiple.toFixed(2) + '×</td>' +
        '</tr>';
    }).join('');
    $('count').textContent = rows.length + ' of ' + R.board_size + ' protocols shown. Click a row for its detail view and farm plan.';
    $('caption').textContent = 'Ranked board — ' + rows.length + ' rows' +
      (state.cat ? ' · category ' + state.cat : '') + (state.chain ? ' · chain ' + state.chain : '') +
      (state.watch ? ' · watchlist only' : '');
    document.querySelectorAll('#board thead th').forEach(function (th) {
      th.setAttribute('aria-sort', th.dataset.sort === state.sort ? (state.dir === 1 ? 'ascending' : 'descending') : 'none');
    });
  }

  // ---- detail view ----
  var bySlug = {};
  R.rows.forEach(function (r) { bySlug[r.slug] = r; });
  function showDetail(slug) {
    var r = bySlug[slug];
    var box = $('detail');
    if (!r) { box.hidden = true; state.sel = null; render(); return; }
    state.sel = slug;
    var steps = r.farm_steps || [];
    var math = '$' + r.tvl_usd.toLocaleString('en-US') + ' TVL × <b>' + r.peer_multiple.toFixed(3) +
      '</b> peer × <b>' + r.growth_multiplier.toFixed(2) + '</b> growth × <b>' + r.maturity_multiplier.toFixed(2) +
      '</b> maturity × <b>' + r.breadth_multiplier.toFixed(2) + '</b> breadth = <b>' + money(r.implied_value_usd) + '</b>';
    box.innerHTML =
      '<button class="close" id="closeDetail" type="button">Close ×</button>' +
      '<h2>' + esc(r.name) + ' <span class="slug">' + esc(r.slug) + '</span></h2>' +
      '<p class="tagline">Rank ' + r.rank + ' of ' + R.board_size + ' · ' + esc(r.category || 'Uncategorised') +
      ' · ' + (r.chains || []).map(esc).join(', ') + (watchlist[r.slug] ? ' · <span class="badge">WATCHLIST</span>' : '') + '</p>' +
      '<div class="facts">' +
      '<div><span>Implied value</span><b>' + money(r.implied_value_usd) + '</b></div>' +
      '<div><span>TVL</span><b>' + money(r.tvl_usd) + '</b></div>' +
      '<div><span>7-day change</span><b>' + pct(r.change_7d) + '</b></div>' +
      '<div><span>Age</span><b>' + age(r.age_days) + '</b></div>' +
      '<div><span>Peer multiple</span><b>' + r.peer_multiple.toFixed(3) + '× (' + r.peer_count + ' peer' + (r.peer_count === 1 ? '' : 's') + (r.peer_count < 3 ? ', global fallback' : '') + ')</b></div>' +
      '</div>' +
      '<p class="math">' + math + '</p>' +
      '<h3>Farm plan — 7 steps</h3>' +
      '<ol class="steps">' + steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>';
    box.hidden = false;
    $('closeDetail').onclick = function () { showDetail(null); };
    render();
    box.scrollIntoView({ block: 'nearest' });
  }

  // ---- events ----
  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) showDetail(tr.dataset.slug);
  });
  document.querySelectorAll('#board thead th').forEach(function (th) {
    th.addEventListener('click', function () {
      var k = th.dataset.sort;
      if (state.sort === k) state.dir = -state.dir; else { state.sort = k; state.dir = k === 'name' ? 1 : -1; }
      render();
    });
  });
  $('q').addEventListener('input', function () { state.q = $('q').value; render(); });
  $('cat').addEventListener('change', function () { state.cat = $('cat').value; render(); });
  $('chain').addEventListener('change', function () { state.chain = $('chain').value; render(); });
  $('watch').addEventListener('change', function () { state.watch = $('watch').checked; render(); });
  $('reset').addEventListener('click', function () {
    state = { q: '', cat: '', chain: '', watch: false, sort: 'rank', dir: 1, sel: null };
    $('q').value = ''; $('cat').value = ''; $('chain').value = ''; $('watch').checked = false;
    $('detail').hidden = true; render();
  });

  // ---- peer calibration table + live list ----
  $('peers').innerHTML = R.peers.map(function (p) {
    return '<tr><td>' + esc(p.category) + '</td><td class="num">' + p.peer_count + '</td>' +
      '<td class="num">' + p.median_multiple.toFixed(3) + '×</td>' +
      '<td>' + (p.fallback ? 'global median (under 3 peers)' : 'category median') + '</td></tr>';
  }).join('');
  $('live').innerHTML = R.live.map(function (p) {
    return '<li>' + esc(p.name) + ' <span class="mcap">' + money(p.mcap_usd || 0) + ' mcap · ' + money(p.tvl_usd) + ' TVL</span></li>';
  }).join('');

  // ---- hash routes: #detail=<slug> and #filter=cat:<Category> ----
  function applyHash() {
    var h = location.hash || '';
    var m = h.match(/#detail=([A-Za-z0-9._-]+)/);
    if (m) { showDetail(m[1]); return; }
    var f = h.match(/#filter=cat:(.+)$/);
    if (f) {
      var cat = decodeURIComponent(f[1]);
      if (cats.indexOf(cat) >= 0) { state.cat = cat; $('cat').value = cat; }
      render();
    }
  }

  render();
  applyHash();
})();
