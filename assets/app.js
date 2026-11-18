(function () {
  const METRICS = {
    cpm: { name: 'CPM', title: 'Average CPM', higherIsWorse: true },
    cpm_wow: { name: 'CPM change', chip: 'CPM vs prior week', title: 'CPM, last 7 days against the 7 days before (median brand). This sets the weather.', higherIsWorse: true, line: true },
    cpa: { name: 'CPA', title: 'CPA, last 7 days against the 7 days before (median brand)', higherIsWorse: true, line: true },
    spend: { name: 'Spend', title: 'Daily spend, last 7 days against the 7 days before (median brand)', neutral: true, line: true },
    roas: { name: 'ROAS', title: 'ROAS, last 7 days against the 7 days before (median brand)', higherIsWorse: false, line: true },
    ctr: { name: 'CTR', title: 'Click-through rate, last 7 days against the 7 days before (median brand)', higherIsWorse: false, line: true }
  };
  const CHIPS = ['cpm', 'cpa', 'roas', 'ctr', 'spend'];
  const wow = (d, m) => d && d.wow ? d.wow[m] ?? null : null;
  const yoy = (d, m) => d && d.yoy ? d.yoy[m] ?? null : null;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const LOG_PAGE = 12;
  const $ = id => document.getElementById(id);
  const isDemo = new URLSearchParams(location.search).has('demo');
  let D, days = [], metric = 'cpm', range = '90', unit = 'month', selected = null, chart = null, items = [];
  let logFilter = 'all', logAll = false;

  $('logo').innerHTML = MW.logo;
  MW.initTheme(() => { if (D) drawChart(); });

  const signed = v => v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + '%';
  const money = v => v == null ? '—' : '$' + v.toFixed(2);
  const cpm = d => d && d.usd ? d.usd.cpm : null;
  const cpm7 = d => d && d.usd && d.usd.cpm7 != null ? d.usd.cpm7 : null;
  const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const pill = s => '<span class="pill ' + s + '">' + (MW.icon[s] ? '<span class="pi" aria-hidden="true">' + MW.icon[s] + '</span>' : '') + MW.label[s] + '</span>';
  const isStorm = d => d.status === 'STORM' || d.status === 'SEVERE';
  function tone(m, v) {
    if (v == null || METRICS[m].neutral || v === 0) return '';
    return (v > 0) === METRICS[m].higherIsWorse ? 'bad' : 'good';
  }
  function esc(s) { const e = document.createElement('i'); e.textContent = s == null ? '' : String(s); return e.innerHTML; }
  const dayName = d => d.dow + ', ' + MW.fmtDate(d.date);
  function periodName(p, u) {
    if (u === 'week') return MW.fmtDate(p.start) + ' – ' + MW.fmtDate(p.end);
    if (u === 'month') return MONTHS[+p.start.slice(5, 7) - 1] + ' ' + p.start.slice(0, 4);
    return p.key.slice(5) + ' ' + p.key.slice(0, 4);
  }

  // Platform incidents: Meta Status reports plus any logged by hand.
  const hasInc = d => !!(d && d.incidents && d.incidents.length);
  const incTitle = i => i.service || i.source;
  const TZ = { timeZone: 'America/New_York' };
  const etTime = iso => new Date(iso).toLocaleTimeString('en-US', Object.assign({ hour: 'numeric', minute: '2-digit' }, TZ));
  const etDay = iso => new Date(iso).toLocaleDateString('en-US', Object.assign({ month: 'short', day: 'numeric' }, TZ));
  function lasted(i) {
    if (!i.start) return '';
    if (!i.end) return 'ongoing';
    const m = Math.max(1, Math.round((new Date(i.end) - new Date(i.start)) / 6e4));
    return m < 60 ? m + ' min' : Math.floor(m / 60) + ' hr' + (m % 60 ? ' ' + (m % 60) + ' min' : '');
  }
  const incSummary = d => d.incidents.map(i => incTitle(i) + (lasted(i) ? ' (' + lasted(i) + ')' : '')).join(', ');
  function incCard(i, showDay) {
    if (!i.start) {
      return '<article class="inc-card"><header><div><h3>' + esc(i.source) + '</h3><p>' + MW.fmtDate(i.date) + ' · logged by Meta Weatherman</p></div></header><p class="inc-text">' + esc(i.summary) + '</p></article>';
    }
    const sev = i.severity ? '<span class="pill sev-' + esc(i.severity) + '">' + esc(i.severity) + ' disruption</span>' : '';
    const span = (showDay || etDay(i.start) !== MW.fmtDate(i.date) ? etDay(i.start) + ', ' : '') + etTime(i.start) +
      (i.end ? ' – ' + (etDay(i.end) !== etDay(i.start) ? etDay(i.end) + ', ' : '') + etTime(i.end) : '') + ' ET';
    const steps = (i.updates || []).map(u => '<li class="' + (u.status === 'Resolved' ? 'ok' : '') + '"><time>' + etTime(u.time) + '</time><b>' + esc(u.status) + '</b><span>' + esc(u.text) + '</span></li>').join('');
    const link = /^https:\/\//.test(i.url || '') ? '<a class="inc-link" href="' + esc(i.url) + '" target="_blank" rel="noopener noreferrer">View on Meta Status &#8599;</a>' : '';
    return '<article class="inc-card"><header><div><h3>' + esc(i.service) + '</h3><p>' + esc(i.product) + '</p></div>' + sev + '</header>' +
      '<p class="inc-when">' + span + ' · ' + lasted(i) + '</p>' + (steps ? '<ol class="inc-steps">' + steps + '</ol>' : '') + link + '</article>';
  }
  // `what` names the day or period, `word` is "day", "week", "month" or "quarter".
  function openIncidents(d, what, word) {
    if (!hasInc(d)) return;
    $('inc-title').textContent = (d.incidents.length > 1 ? 'Platform issues' : 'Platform issue') + ' · ' + what;
    $('inc-body').innerHTML = d.incidents.map(i => incCard(i, word !== 'day')).join('') +
      '<p class="inc-note">Reported by Meta on metastatus.com, times in Eastern. An outage does not always move results, so compare it with this ' + word + '\'s readings.</p>';
    const dlg = $('inc-modal');
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }
  $('inc-modal').addEventListener('click', e => { if (e.target === e.currentTarget || e.target.closest('[data-close]')) e.currentTarget.close(); });
  const openDay = date => { const d = days.find(x => x.date === date); if (d) openIncidents(d, dayName(d), 'day'); };

  // Headline: fixed to the latest full day, phrased as today.
  function headline(d) {
    const st = d ? d.status : 'CALIBRATING';
    const sky = $('now-sky');
    sky.style.backgroundImage = 'url(' + MW.sky[st] + ')';
    sky.className = 'now-sky ' + st;
    $('now-icon').textContent = MW.icon[st] || '🛰️';
    const w = wow(d, 'cpm'), y = yoy(d, 'cpm');
    const rated = d && w != null;
    $('now-status').innerHTML = rated
      ? { SEVERE: 'Severe storms', STORM: 'Storms', CLOUDY: 'Cloudy', FAIR: 'Clear skies' }[st] + '<span> on Meta today</span>'
      : 'Calibrating';
    let text;
    if (!d) text = 'The first reading arrives ' + MW.fmtDate(D.station.first_percentages) + '.';
    else if (!rated) text = money(cpm(d)) + ' CPM today. Storm ratings start ' + MW.fmtDate(D.station.first_status) + '.';
    else {
      text = w >= 15 ? 'Ads cost far more than last week.' : w >= 5 ? 'Ads cost more than last week.' : w > 0 ? 'Ads cost a little more than last week.' : w < 0 ? 'Ads are cheaper than last week.' : 'Ad prices are flat on last week.';
      const cpa = wow(d, 'cpa');
      if (cpa != null) {
        if (w >= 5 && cpa <= -3) text += ' But CPA is down, so it still converts.';
        else if (w >= 5 && cpa >= 5) text += ' CPA is up too.';
        else if (w < 5 && cpa >= 5) text += ' But CPA is up ' + cpa + '%.';
      }
    }
    $('result').textContent = text;

    const big = $('now-big');
    big.hidden = !rated;
    if (rated) {
      const tile = (v, label) => '<div class="big-tile"><span class="big-v ' + tone('cpm', v) + '">' + (v == null ? '–' : signed(v)) + '</span><span class="big-l">CPM ' + label + '</span></div>';
      big.innerHTML = tile(w, 'vs prior week') + tile(y, 'vs last year');
    }
    gauge(d);
    $('now-chips').innerHTML = rated ? CHIPS.filter(m => m !== 'cpm').map(m =>
      '<div class="m-tile"><span class="m-name">' + METRICS[m].name + '</span>' +
      '<span class="m-v ' + tone(m, wow(d, m)) + '">' + signed(wow(d, m)) + '<i>wk</i></span>' +
      '<span class="m-y ' + tone(m, yoy(d, m)) + '">' + signed(yoy(d, m)) + '<i>yr</i></span></div>').join('') : '';
    const alert = $('now-alert');
    alert.hidden = !hasInc(d);
    if (hasInc(d)) {
      alert.innerHTML = '<span aria-hidden="true">&#9888;</span><span>Meta reported a platform issue on this day: ' + esc(d.incidents.map(incTitle).join(', ')) + '.</span><u>Details</u>';
      alert.onclick = () => openIncidents(d, dayName(d), 'day');
    }
  }

  // Where the latest 7-day CPM sits in the trailing year.
  function gauge(d) {
    const g = $('now-gauge');
    g.hidden = !(d && d.rank != null && D.year && cpm7(d) != null);
    if (g.hidden) return;
    const pos = Math.min(100, Math.max(0, (cpm7(d) - D.year.lo) / ((D.year.hi - D.year.lo) || 1) * 100));
    g.innerHTML = '<span class="g-label"><b>' + money(cpm7(d)) + '</b> avg CPM · pricier than <b>' + d.rank + '%</b> of the past year</span>' +
      '<span>' + money(D.year.lo) + '</span><span class="g-track" role="img" aria-label="' + ordinal(d.rank) + ' percentile of the past year"><span class="g-mark" style="left:' + pos.toFixed(1) + '%"></span></span><span>' + money(D.year.hi) + '</span>';
  }

  // Seven day cards around the selected day. The selected day moves as you hover the chart.
  function cards() {
    if (!days.length) { $('week').innerHTML = '<div class="empty" style="grid-column:1/-1">The first readings arrive ' + MW.fmtDate(D.station.first_percentages) + '.</div>'; return; }
    const idx = Math.max(0, days.findIndex(d => d.date === selected));
    const start = Math.min(Math.max(0, idx - 3), Math.max(0, days.length - 7));
    const latest = days[days.length - 1].date;
    $('week').innerHTML = days.slice(start, start + 7).map(d => {
      const label = dayName(d) + ', ' + MW.label[d.status] + (cpm(d) != null ? ', ' + money(cpm(d)) + ' CPM' : '') + (hasInc(d) ? ', platform issue reported' : '');
      return '<div class="day ' + d.status + (d.date === selected ? ' sel' : '') + '" role="button" tabindex="0" data-date="' + d.date + '" aria-label="' + label + '" aria-pressed="' + (d.date === selected) + '">' +
        '<span class="day-sky" style="background-image:url(' + MW.sky[d.status] + ')"></span>' +
        (hasInc(d) ? '<button class="tri" data-inc="' + d.date + '" aria-label="Platform issue reported on ' + MW.fmtDate(d.date) + ', view details" title="Platform issue reported">&#9888;</button>' : '') +
        '<span class="day-dow">' + (d.date === latest ? 'Today' : d.dow) + '</span><span class="day-date">' + MW.fmtDate(d.date) + '</span>' +
        pill(d.status) +
        (cpm(d) != null ? '<span class="day-usd">' + money(cpm(d)) + ' CPM</span>' : '') + '</div>';
    }).join('');
    $('week').querySelectorAll('.day').forEach(c => {
      c.onclick = e => { if (e.target.closest('.tri')) return; select(c.dataset.date); };
      c.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(c.dataset.date); } };
    });
    $('week').querySelectorAll('.tri').forEach(b => b.onclick = () => openDay(b.dataset.inc));
    $('to-latest').hidden = selected === latest;
    // On narrow screens the row scrolls, so keep the selected card in view.
    const row = $('week'), sel = row.querySelector('.sel');
    if (sel && row.scrollWidth > row.clientWidth) {
      const r = row.getBoundingClientRect(), c = sel.getBoundingClientRect();
      row.scrollLeft += c.left - r.left - (r.width - c.width) / 2;
    }
  }

  function select(date) {
    if (!date || date === selected) return;
    selected = date;
    cards();
    if (chart) chart.draw();
  }

  // Chart: daily readings with a 7-day average, for any range.
  const value = d => metric === 'cpm' ? cpm(d) : wow(d, metric === 'cpm_wow' ? 'cpm' : metric);
  const fmt = v => v == null ? '—' : metric === 'cpm' ? money(v) : signed(Math.round(v));
  function rolling7(all) {
    return all.map((_, i) => {
      const w = all.slice(Math.max(0, i - 6), i + 1).filter(v => v != null);
      return w.length >= 4 ? w.reduce((a, b) => a + b, 0) / w.length : null;
    });
  }

  function drawChart() {
    if (chart) { chart.destroy(); chart = null; }
    const offset = range === 'all' ? 0 : Math.max(0, days.length - Number(range));
    items = days.slice(offset);
    $('chart-title').textContent = METRICS[metric].title;
    const canvas = $('chart'), empty = $('chart-empty');
    const values = items.map(value);
    if (!values.some(v => v != null)) {
      canvas.style.visibility = 'hidden'; empty.hidden = false;
      empty.textContent = 'Readings start ' + MW.fmtDate(D.station.first_percentages) + '.';
      $('legend').innerHTML = '';
      return;
    }
    canvas.style.visibility = ''; empty.hidden = true;
    const css = MW.css, grid = css('--grid'), tick = css('--tick'), font = { size: 11, family: 'Geist, sans-serif' };
    const dotColor = d => d.status === 'SEVERE' ? css('--severe') : d.status === 'STORM' ? css('--storm') : d.status === 'CLOUDY' ? css('--cloudy') : css('--fair');
    const asLine = !!METRICS[metric].line;
    const colors = items.map(dotColor);
    const small = items.length > 200 ? 1.8 : items.length > 45 ? 2.6 : 3.5;
    const datasets = [
      { label: 'Daily', data: values, showLine: asLine, borderColor: css('--sun'), borderWidth: 2, tension: .3, spanGaps: true, pointRadius: items.map(d => isStorm(d) ? small + 1 : small), pointHoverRadius: 5, pointBackgroundColor: colors, pointBorderColor: colors, order: 2 },
      { label: '7-day average', hidden: asLine, data: rolling7(days.map(value)).slice(offset), borderColor: css('--sun'), borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 0, tension: .35, spanGaps: true, order: 1 }
    ];
    const bands = {
      id: 'stormBands',
      beforeDatasetsDraw(c) {
        const { ctx, chartArea: a, scales: { x } } = c;
        const step = items.length > 1 ? x.getPixelForValue(1) - x.getPixelForValue(0) : a.width;
        ctx.save();
        items.forEach((d, i) => {
          if (!isStorm(d)) return;
          ctx.fillStyle = css(d.status === 'SEVERE' ? '--band-severe' : '--band-storm');
          const px = x.getPixelForValue(i), l = Math.max(a.left, px - step / 2), r = Math.min(a.right, px + step / 2);
          ctx.fillRect(l, a.top, Math.max(r - l, 3), a.bottom - a.top);
        });
        if (metric === 'cpm_wow' && D.thresholds) {
          const y = c.scales.y;
          [['storm', '--line-storm'], ['severe', '--line-severe']].forEach(([k, col]) => {
            const py = y.getPixelForValue(D.thresholds[k]);
            if (py < a.top || py > a.bottom) return;
            ctx.beginPath(); ctx.moveTo(a.left, py); ctx.lineTo(a.right, py); ctx.setLineDash([5, 4]); ctx.strokeStyle = css(col); ctx.lineWidth = 1.2; ctx.stroke();
          });
        }
        ctx.restore();
      }
    };
    const marks = {
      id: 'marks',
      afterDraw(c) {
        const { ctx, chartArea: a, scales: { x } } = c;
        ctx.save();
        ctx.fillStyle = css('--storm');
        items.forEach((d, i) => {
          if (!hasInc(d)) return;
          const px = x.getPixelForValue(i);
          ctx.beginPath(); ctx.moveTo(px - 5, a.bottom); ctx.lineTo(px + 5, a.bottom); ctx.lineTo(px, a.bottom - 9); ctx.closePath(); ctx.fill();
        });
        const si = items.findIndex(d => d.date === selected);
        if (si >= 0) {
          const px = x.getPixelForValue(si);
          ctx.beginPath(); ctx.moveTo(px, a.top); ctx.lineTo(px, a.bottom); ctx.setLineDash([4, 4]); ctx.strokeStyle = css('--text'); ctx.globalAlpha = .45; ctx.lineWidth = 1; ctx.stroke();
        }
        ctx.restore();
      }
    };
    chart = new Chart(canvas, {
      type: 'line', data: { labels: items.map(d => MW.fmtDate(d.date) + (range === 'all' || range === '365' ? ' ' + d.date.slice(2, 4) : '')), datasets }, plugins: [bands, marks],
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        interaction: { mode: 'index', intersect: false },
        onHover: (e, els) => {
          if (!els.length) return;
          const d = items[els[0].index];
          canvas.style.cursor = hasInc(d) ? 'pointer' : '';
          select(d.date);
        },
        onClick: (e, els) => { if (els.length && hasInc(items[els[0].index])) openDay(items[els[0].index].date); },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: css('--surface'), titleColor: css('--text'), bodyColor: css('--muted'), footerColor: css('--muted2'),
            borderColor: css('--border'), borderWidth: 1, padding: 10, cornerRadius: 10, displayColors: false,
            itemSort: (a, b) => a.datasetIndex - b.datasetIndex,
            titleFont: { family: 'Geist, sans-serif', weight: '500', size: 13 }, bodyFont: { family: 'Geist, sans-serif', size: 12 }, footerFont: { family: 'Geist, sans-serif', size: 11, weight: '400' },
            callbacks: {
              title: els => dayName(items[els[0].dataIndex]) + ', ' + items[els[0].dataIndex].date.slice(0, 4),
              label: el => (el.dataset.label === '7-day average' ? '7-day average' : METRICS[metric].name) + ': ' + fmt(el.raw),
              filter: el => !(asLine && el.datasetIndex === 1),
              afterBody: els => { const d = items[els[0].dataIndex]; return [MW.label[d.status]].concat(hasInc(d) ? ['⚠ Platform issue: ' + incSummary(d)] : []); },
              footer: els => hasInc(items[els[0].dataIndex]) ? 'Click for details' : ''
            }
          }
        },
        scales: {
          x: { ticks: { color: tick, font, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 }, grid: { display: false }, border: { color: grid } },
          y: {
            ticks: { color: tick, font, maxTicksLimit: 6, callback: v => metric === 'cpm' ? '$' + v : (v > 0 ? '+' : '') + v + '%' },
            grid: { color: ctx => metric !== 'cpm' && ctx.tick.value === 0 ? tick : grid }, border: { display: false }
          }
        }
      }
    });
    $('legend').innerHTML = '<span><i class="dot" style="background:' + css('--fair') + '"></i>Clear</span><span><i class="dot" style="background:' + css('--cloudy') + '"></i>Cloudy</span>' +
      (metric === 'cpm_wow' ? '<span>Dashed lines: Storm +' + D.thresholds.storm + '%, Severe +' + D.thresholds.severe + '%</span>' : asLine ? '' : '<span><i class="lline"></i>7-day average</span>') +
      '<span><i class="band" style="background:' + css('--band-storm') + '"></i>Storm</span><span><i class="band" style="background:' + css('--band-severe') + '"></i>Severe</span>' +
      (items.some(hasInc) ? '<span><span class="inc-mark">&#9650;</span>Platform issue (click)</span>' : '') +
      (metric === 'cpm' ? '' : '<span>0% is no change on the prior week</span>');
  }

  // Jump to a day from elsewhere on the page, widening the chart range if the day is outside it.
  function goTo(date) {
    const pos = days.findIndex(d => d.date === date);
    const shown = range === 'all' ? days.length : Number(range);
    if (pos < days.length - shown) {
      const fit = ['30', '90', '365'].find(r => pos >= days.length - Number(r)) || 'all';
      range = fit;
      $('ranges').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.range === fit));
      drawChart();
    }
    selected = null;
    select(date);
    $('conditions').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  // Storm log: storm days and platform issues, newest first.
  function log() {
    const all = days.filter(d => logFilter === 'storm' ? isStorm(d) : logFilter === 'issue' ? hasInc(d) : isStorm(d) || hasInc(d)).reverse();
    if (!all.length) {
      $('log').innerHTML = '<div class="empty">' + (logFilter === 'issue' ? 'No platform issues reported yet.' : logFilter === 'storm' ? 'No storm days yet.' : 'No storm days or platform issues yet.') + '</div>';
      return;
    }
    const list = logAll ? all : all.slice(0, LOG_PAGE);
    $('log').innerHTML = list.map(d => {
      const tags = (isStorm(d) ? pill(d.status) : '') +
        (hasInc(d) ? '<span class="pill sev-' + esc(d.incidents[0].severity || 'Medium') + '">Platform issue</span>' : '');
      const what = hasInc(d) ? esc(incSummary(d)) + ' · <u data-inc="' + d.date + '">Details</u>' : 'CPM ' + signed(wow(d, 'cpm')) + ' on the prior week' + (yoy(d, 'cpm') != null ? ', ' + signed(yoy(d, 'cpm')) + ' on last year' : '');
      return '<div class="log-row" role="button" tabindex="0" data-date="' + d.date + '"><span class="log-date">' + dayName(d) + '<small>' + d.date.slice(0, 4) + '</small></span>' +
        '<span class="log-tags">' + tags + '</span><span class="log-what">' + what + '</span>' +
        '<span class="log-nums">CPM wk<b class="' + tone('cpm', wow(d, 'cpm')) + '">' + signed(wow(d, 'cpm')) + '</b> · CPA wk<b class="' + tone('cpa', wow(d, 'cpa')) + '">' + signed(wow(d, 'cpa')) + '</b> · CPM<b>' + money(cpm(d)) + '</b></span></div>';
    }).join('') + (all.length > LOG_PAGE ? '<button class="log-more" id="log-more">' + (logAll ? 'Show fewer' : 'Show all ' + all.length) + '</button>' : '');
    $('log').querySelectorAll('.log-row').forEach(r => {
      r.onclick = e => { if (e.target.closest('[data-inc]')) { openDay(r.dataset.date); return; } goTo(r.dataset.date); };
      r.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goTo(r.dataset.date); } };
    });
    if ($('log-more')) $('log-more').onclick = () => { logAll = !logAll; log(); };
  }

  // By period: one row per week, month or quarter, newest first.
  function table() {
    const list = D.periods[unit] || [];
    const rows = list.map((p, i) => {
      const cur = cpm(p), change = wow(p, 'cpm');
      const note = p.end > D.updated ? '<small>to date</small>' : p.days < p.span ? '<small>partial</small>' : '';
      const weather = p.status === 'CALIBRATING' || change == null ? '<span class="pill">Calibrating</span>' : pill(p.status) +
        '<small class="storm-days">' + (p.storm_days ? plural(p.storm_days, 'storm day') : 'no storm days') + '</small>';
      const flag = hasInc(p) ? '<button class="inc-flag" data-i="' + i + '" title="Platform issue reported" aria-label="' + plural(p.incidents.length, 'platform issue') + ' reported in ' + periodName(p, unit) + ', view details">&#9888;</button>' : '';
      return '<tr><td>' + periodName(p, unit) + note + '</td><td>' + weather + flag + '</td><td>' + money(cur) + '</td>' + [['cpm', wow], ['cpm', yoy], ['cpa', wow], ['cpa', yoy]].map(([m, f]) => '<td class="' + tone(m, f(p, m)) + '">' + signed(f(p, m)) + '</td>').join('') + '</tr>';
    }).reverse();
    const word = { week: 'week', month: 'month', quarter: 'quarter' }[unit];
    $('period-table').innerHTML = '<thead><tr><th>' + word[0].toUpperCase() + word.slice(1) + '</th><th>Weather</th><th>Avg CPM</th><th>CPM vs prior ' + word + '</th><th>CPM vs last year</th><th>CPA vs prior ' + word + '</th><th>CPA vs last year</th></tr></thead><tbody>' +
      (rows.length ? rows.join('') : '<tr><td colspan="7" style="text-align:center;color:var(--muted)">No readings yet</td></tr>') + '</tbody>';
    $('period-table').querySelectorAll('.inc-flag').forEach(b => b.onclick = () => { const p = list[+b.dataset.i]; openIncidents(p, periodName(p, unit), word); });
  }

  function controls() {
    $('metrics').innerHTML = Object.keys(METRICS).map(m => '<button data-metric="' + m + '" class="' + (m === metric ? 'active' : '') + '">' + METRICS[m].name + '</button>').join('');
    $('metrics').querySelectorAll('button').forEach(b => b.onclick = () => { metric = b.dataset.metric; controls(); drawChart(); });
  }
  function group(id, attr, set) {
    $(id).querySelectorAll('button').forEach(b => b.onclick = () => {
      $(id).querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      set(b.dataset[attr]);
    });
  }
  group('ranges', 'range', v => { range = v; drawChart(); });
  group('units', 'unit', v => { unit = v; table(); });
  group('log-filter', 'f', v => { logFilter = v; logAll = false; log(); });
  $('to-latest').onclick = () => select(days[days.length - 1].date);

  fetch(isDemo ? '/demo/conditions.json' : '/data/conditions.json', { cache: 'no-store' })
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(json => {
      D = json; days = D.days;
      $('sample').hidden = !isDemo;
      $('foot-date').textContent = 'Latest full day: ' + MW.fmtDate(D.updated) + ', ' + D.updated.slice(0, 4);
      headline(days[days.length - 1]);
      selected = days.length ? days[days.length - 1].date : null;
      cards(); controls(); drawChart(); log(); table();
    })
    .catch(err => {
      $('week').innerHTML = '<div class="empty" style="grid-column:1/-1">Conditions are unavailable. ' + (isDemo ? 'Sample mode is not enabled on this server.' : 'Please try again shortly.') + '</div>';
      console.error(err);
    });
})();
