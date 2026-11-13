/* Stats screens: the Stats tab in Profile (lifetime numbers from js/achievements.js plus the last table you left)
   and the in-game session panel (T, or the Stats button in the top bar), both drawing a bankroll graph.
   The session numbers come from js/sessionstats.js; ui.js keeps the last session in the progress save
   (Modes save.lastSession) when you leave a table. */
(function (root) {
  'use strict';

  const doc = root.document;
  const fmt = (n) => Math.round(n || 0).toLocaleString('en-US');
  const pct = (a, b) => (b ? `${((a / b) * 100).toFixed(1)}%` : '-');
  const signed = (n) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${fmt(Math.abs(n))}`;
  const tile = (v, k, cls) => `<div><b${cls ? ` class="${cls}"` : ''}>${v}</b><span>${k}</span></div>`;

  /** Bankroll after each round as a stepped pixel line, with the starting bankroll dashed. */
  function graph(series, start, w, h) {
    const s = series && series.length > 1 ? series : [start, start];
    const pad = { l: 44, r: 8, t: 8, b: 18 };
    const step = niceStep(Math.max(...s, start) - Math.min(...s, start));
    const lo = Math.floor(Math.min(...s, start) / step) * step;
    const hi = Math.max(lo + step, Math.ceil(Math.max(...s, start) / step) * step);
    const X = (i) => pad.l + (i / (s.length - 1)) * (w - pad.l - pad.r);
    const Y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b);
    let d = `M${X(0).toFixed(1)},${Y(s[0]).toFixed(1)}`;
    for (let i = 1; i < s.length; i++) d += `H${X(i).toFixed(1)}V${Y(s[i]).toFixed(1)}`;
    const ticks = [];
    for (let v = lo; v <= hi + 0.5; v += step) ticks.push(v);
    const last = s[s.length - 1];
    return `<svg class="stv-graph" viewBox="0 0 ${w} ${h}" role="img" aria-label="Bankroll after each hand, from ${fmt(s[0])} to ${fmt(last)}">
      ${ticks.map((v) => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="#ffffff14"/><text x="${pad.l - 6}" y="${Y(v) + 4}" text-anchor="end">${fmt(v)}</text>`).join('')}
      <line x1="${pad.l}" x2="${w - pad.r}" y1="${Y(start)}" y2="${Y(start)}" stroke="#b8a890" stroke-dasharray="4 4"/>
      <path d="${d}V${Y(lo)}H${X(0)}Z" fill="#ffd75e22"/>
      <path d="${d}" fill="none" stroke="#ffd75e" stroke-width="2"/>
      <rect x="${X(s.length - 1) - 3}" y="${Y(last) - 3}" width="6" height="6" fill="#ffd75e"/>
      <text x="${pad.l}" y="${h - 3}">Start</text><text x="${w - pad.r}" y="${h - 3}" text-anchor="end">Hand ${Math.max(0, s.length - 1)}</text></svg>`;
  }
  function niceStep(range) {
    const raw = Math.max(50, range / 4);
    const pow = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((v) => v >= raw);
  }

  function sessionTiles(d) {
    const net = d.net || 0;
    return [tile(fmt(d.hands), 'Hands'), tile(pct(d.won, d.hands), 'Win rate'), tile(signed(net), 'Net', net > 0 ? 'up' : net < 0 ? 'down' : ''),
      tile(d.biggestWin ? signed(d.biggestWin) : '-', 'Biggest win', d.biggestWin ? 'up' : ''), tile(d.biggestLoss ? signed(-d.biggestLoss) : '-', 'Biggest loss', d.biggestLoss ? 'down' : ''),
      tile(fmt(d.blackjacks), 'Blackjacks')].join('');
  }

  /** Profile > Stats. */
  function profileHtml() {
    const A = root.Achievements;
    const st = A && A.stats ? A.stats() : {};
    const M = root.Modes ? root.Modes.load() : {};
    const beaten = Object.values(M.challengeWins || {}).filter(Boolean).length;
    const best = Math.max(0, ...Object.values(M.endless || {}).map((r) => (r && r.best) || 0));
    const life = [
      tile(fmt(st.hands), 'Hands played'), tile(fmt(st.handsWon), 'Hands won'), tile(pct(st.handsWon, st.hands), 'Win rate'),
      tile(fmt(st.blackjacks), 'Blackjacks'), tile(fmt(st.chipsWon), 'Chips won'), tile(fmt(st.doublesWon), 'Doubles won'),
      tile(fmt(st.dealerBusts), 'Dealer busts'), tile(fmt(st.surrenders), 'Surrenders'), tile(`${beaten} / 4`, 'Challenges beaten'),
      tile(fmt(best), 'Best Endless'), tile(fmt(st.dailies), 'Dailies played'), tile(fmt((M.streak && M.streak.best) || 0), 'Best Daily streak'),
    ].join('');
    const last = M.lastSession;
    const lastHtml = last && last.stats && last.stats.hands
      ? `<div class="stv-k">LAST SESSION <span>${last.label}${last.at ? ` · ${new Date(last.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</span></div>
        <div class="stv-tiles">${sessionTiles(last.stats)}${tile(fmt(last.stats.peak), 'Peak')}</div>
        <div class="stv-box">${graph(last.stats.series, last.stats.start, 520, 170)}</div>`
      : '<div class="stv-k">LAST SESSION</div><p class="stv-empty">Play a few hands and your last session shows up here, with a graph of your bankroll.</p>';
    return `<div class="stv"><div><div class="stv-k">LIFETIME</div><div class="stv-tiles">${life}</div></div><div>${lastHtml}</div></div>`;
  }

  // ---------------------------------------------------------------- the in-game panel
  let pop = null;
  function panelHtml() {
    const S = root.SessionStats && root.SessionStats.get();
    if (!S) return '';
    return `<h3>THIS SESSION <button type="button" class="stv-x" data-stv-close aria-label="Close">T</button></h3>
      <div class="stv-mini">${sessionTiles(S)}</div>
      <div class="stv-box">${S.hands ? graph(S.series, S.start, 340, 120) : '<p class="stv-empty">No hands yet.</p>'}</div>`;
  }
  function open() {
    if (!pop) {
      pop = doc.createElement('div');
      pop.className = 'stv-pop';
      pop.setAttribute('role', 'dialog');
      pop.setAttribute('aria-label', 'Session stats');
      pop.addEventListener('click', (e) => { if (e.target.closest('[data-stv-close]')) close(); });
      doc.body.appendChild(pop);
    }
    pop.innerHTML = panelHtml();
    pop.hidden = false;
    doc.body.classList.add('stv-open');
  }
  function close() { if (pop) pop.hidden = true; doc.body.classList.remove('stv-open'); }
  const isOpen = () => !!pop && !pop.hidden;
  function toggle() { if (isOpen()) close(); else open(); }
  /** ui.js calls this after each render so an open panel stays current. */
  function refresh() { if (isOpen()) pop.innerHTML = panelHtml(); }

  root.StatsView = { profileHtml, graph, open, close, toggle, refresh, isOpen };
})(window);
