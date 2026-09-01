'use strict';
/*
 * app.js — 画面制御（画面A〜F）
 *
 * 画面A: ホーム / 画面B: レース選択 / 画面C: 買い方と金額 /
 * 画面D: 展示チェック票（モーダル・任意） / 画面E: 記録一覧 / 画面F: 週間
 *
 * 3タップ動線: レース選択 → 買い方選択 → 金額プリセット → 登録
 * 2026-09-01改良: 買い方を選ぶと買い目が「チェック＋個別金額」の行で並ぶ
 *   （初期=全チェックON。プリセットはチェック中の全行へ一括適用・行ごとの個別編集も可）
 * DOMは createElement / textContent のみで組み立てる（innerHTML不使用）
 */

// ---- 買い方8種（hako.py MENUS 準拠・仕様書 画面C の並び順）----
// boats は組番に使う艇番（表示用の艇番カラーチップ。データには保存しない）
// kumiban は買い目1点ずつの組番リスト（チェック行の生成と bets.kaimoku の保存に使う。
// 表記は表示と同じ: 連単系='-'・連複系='='。突合時は '='→'-' 正規化でDB表記に一致）
var KAIKATA = [
  { id: 'tansho',   name: '単勝1点',   ten: 1, kumi: '1', boats: [1],
    kumiban: ['1'] },
  { id: 'nitan2',   name: '２連単2点', ten: 2, kumi: '1-2 / 1-3', boats: [1, 2, 3],
    kumiban: ['1-2', '1-3'] },
  { id: 'nitan3',   name: '２連単3点', ten: 3, kumi: '1-2 / 1-3 / 1-4', boats: [1, 2, 3, 4],
    kumiban: ['1-2', '1-3', '1-4'] },
  { id: 'nitan5',   name: '２連単5点', ten: 5, kumi: '1-全（1-2〜1-6）', boats: [1, 2, 3, 4, 5, 6],
    kumiban: ['1-2', '1-3', '1-4', '1-5', '1-6'] },
  { id: 'niren3',   name: '２連複3点', ten: 3, kumi: '1=2 / 1=3 / 1=4', boats: [1, 2, 3, 4],
    kumiban: ['1=2', '1=3', '1=4'] },
  { id: 'kakuren2', name: '拡連複2点', ten: 2, kumi: '1=2 / 1=3', boats: [1, 2, 3],
    kumiban: ['1=2', '1=3'] },
  { id: 'santan4',  name: '３連単4点', ten: 4, kumi: '1-23-234（1-2-3/1-2-4/1-3-2/1-3-4）', boats: [1, 2, 3, 4],
    kumiban: ['1-2-3', '1-2-4', '1-3-2', '1-3-4'] },
  { id: 'sanren3',  name: '３連複3点', ten: 3, kumi: '1=2=3 / 1=2=4 / 1=3=4', boats: [1, 2, 3, 4],
    kumiban: ['1=2=3', '1=2=4', '1=3=4'] }
];

// ---- 目印ごとの推奨と表示（settings.yaml ichi_mejirushi ＋ 買い目推奨）----
var MEJIRUSHI = {
  '妙味':   { cls: 'tag-myomi',   recommend: ['tansho', 'nitan2', 'santan4'] },
  '普通':   { cls: 'tag-futsu',   recommend: ['tansho'] },
  '渋め':   { cls: 'tag-shibume', recommend: ['kakuren2'] },
  '妙味薄': { cls: 'tag-usui',    recommend: [] }
};

// ---- 金額プリセット ----
var KINGAKU_PRESET = [100, 200, 500, 1000, 2000];

// ---- 自由買い目の券種（表示にない組番を買った時のイレギュラー記録用）----
var JIYUU_SHUBETSU = ['単勝', '２連単', '２連複', '拡連複', '３連単', '３連複'];

// ---- リスト外レース用の全24場 ----
var JOU24 = [
  ['01', '桐生'], ['02', '戸田'], ['03', '江戸川'], ['04', '平和島'],
  ['05', '多摩川'], ['06', '浜名湖'], ['07', '蒲郡'], ['08', '常滑'],
  ['09', '津'], ['10', '三国'], ['11', 'びわこ'], ['12', '住之江'],
  ['13', '尼崎'], ['14', '鳴門'], ['15', '丸亀'], ['16', '児島'],
  ['17', '宮島'], ['18', '徳山'], ['19', '下関'], ['20', '若松'],
  ['21', '芦屋'], ['22', '福岡'], ['23', '唐津'], ['24', '大村']
];

// ---- 展示チェック票6項目（config/settings.yaml check_hyou の文言どおり）----
var TENJI_ITEMS = [
  { q: 'q1', no: 1, item: '1号艇の気配', type: 'single', choices: ['◎良い', '○普通', '▲不安'] },
  { q: 'q2', no: 2, item: 'スタート展示で1号艇の出遅れ気配', type: 'single', choices: ['なし', 'あり'] },
  { q: 'q3', no: 3, item: '外枠(4-6号艇)に目立つ艇', type: 'soto', choices: [] },
  { q: 'q4', no: 4, item: '回り足・伸びが目立った艇', type: 'multi', choices: [] },
  { q: 'q5', no: 5, item: '水面の様子', type: 'single', choices: ['穏やか', '風・波で荒れ気味'] },
  { q: 'q6', no: 6, item: '最終判断', type: 'single', choices: ['予定通り買う', '金額を下げる', '見送る'] }
];

var NOTICE = 'このアプリは記録専用です。土台は全買いで回収率100%未満・買う/見送るは当日の人の判断です';

// 画面Cの固定部品（HTML側にある）。選択中の買い方の直下へ移動して使う
var BET_FIXED_IDS = ['kingaku-free-row', 'btn-tenji', 'tenji-summary', 'bet-hint', 'kaimoku-total', 'bet-submit'];

// ---- 画面の状態 ----
var S = {
  tab: 'home',           // home / input / kiroku / week
  inputView: 'race',     // race（画面B）/ bet（画面C）
  race: null,            // 選択中レース
  kaikata: null,         // 選択中の買い方 id
  kaimoku: null,         // 買い目行 [{kumiban, kingaku, checked}]（買い方選択で生成）
  kingaku: null,         // 最後に一括適用したプリセット（ボタンの選択表示用）
  tenji: null,           // 画面Dの回答（登録前の一時保持）
  outsideJcd: '01',      // リスト外モーダルの場選択
  kanri: {               // 画面G: 管理（管理者のみ）
    period: 'week',      // today / week / month / all
    view: 'jin',         // jin（人別）/ race（レース別）
    sort: 'shushi',      // 人別の並び: shushi / kounyuu / kaishu
    kojinId: null        // 個人詳細で開いている users.id（null=一覧）
  }
};

function $(id) { return document.getElementById(id); }

// DOM組み立てヘルパ（textContentのみ使用）
function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) { e.className = cls; }
  if (text != null) { e.textContent = text; }
  return e;
}

function btn(cls, text, onclick) {
  var b = el('button', cls, text);
  b.type = 'button';
  if (onclick) { b.addEventListener('click', onclick); }
  return b;
}

function clear(node) { while (node.firstChild) { node.removeChild(node.firstChild); } }

function yen(v) { return Number(v || 0).toLocaleString('ja-JP') + '円'; }

function signedYen(v) {
  if (v > 0) { return '+' + yen(v); }
  if (v < 0) { return '−' + yen(Math.abs(v)); }
  return '±0円';
}

function signCls(v) { return v > 0 ? 'plus' : (v < 0 ? 'minus' : 'zero'); }

function pct(v) { return v == null ? '—' : (Math.round(v * 1000) / 10).toFixed(1) + '%'; }

// 荒らし役スコア・一強度の表示（前日リストの fmt_pt と同じ小数1桁。null=—）
function scoreStr(v) { return v == null ? '—' : Number(v).toFixed(1); }

// そのレースの目印に対応する想定回収率（demo_data.js の DEMO_KAISYU。無ければnull）
function kaisyuOf(mejirushi) {
  var k = window.DEMO_KAISYU;
  return (mejirushi && k && k[mejirushi]) ? k[mejirushi] : null;
}

function toast(msg) {
  var t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._tm);
  toast._tm = setTimeout(function () { t.classList.remove('show'); }, 2400);
}

// =====================================================================
// 遊び心の演出（見た目だけ。データ・機能には触れない）
// =====================================================================

// 登録完了時: 舟券風チケットが一瞬出て収支へ吸い込まれる（0.8秒以内・連打対応）
function showTicketFx(race, kkName, kin) {
  var old = $('ticket-fx');
  if (old && old.parentNode) { old.parentNode.removeChild(old); }
  var wrap = el('div', 'ticket-fx');
  wrap.id = 'ticket-fx';
  wrap.setAttribute('aria-hidden', 'true');
  var card = el('div', 'ticket-card');
  card.appendChild(el('div', 'ticket-side', '収支記録'));
  card.appendChild(el('div', 'ticket-head', 'BOATRACE KIROKU'));
  card.appendChild(el('div', 'ticket-race', race.jou_name + ' ' + race.race_no + 'R'));
  card.appendChild(el('div', 'ticket-kaikata', kkName));
  card.appendChild(el('div', 'ticket-kin', yen(kin)));
  card.appendChild(el('div', 'ticket-date', race.race_date));
  card.appendChild(el('div', 'ticket-stamp', '登録'));
  wrap.appendChild(card);
  document.body.appendChild(wrap);
  setTimeout(function () {
    if (wrap.parentNode) { wrap.parentNode.removeChild(wrap); }
  }, 820);
}

// 結果取込で的中が出た時: 軽い紙吹雪（艇番6色・CSSアニメ・2秒で消える）
function launchConfetti() {
  var old = $('confetti-box');
  if (old && old.parentNode) { old.parentNode.removeChild(old); }
  var box = el('div', 'confetti-box');
  box.id = 'confetti-box';
  box.setAttribute('aria-hidden', 'true');
  for (var i = 0; i < 18; i++) {
    var p = el('span', 'cf');
    p.style.left = ((i * 37 + 8) % 96) + '%';
    p.style.animationDelay = ((i % 5) * 0.06) + 's';
    p.style.animationDuration = (1.15 + (i % 4) * 0.16) + 's';
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(function () {
    if (box.parentNode) { box.parentNode.removeChild(box); }
  }, 2000);
}

// 結果取込直後に「🎯的中!」バッジを付ける記録ID（2秒ちょっとで消す）
var newlyHit = {};

// =====================================================================
// 描画
// =====================================================================

function renderAll() {
  renderHeader();
  renderHome();
  renderRaceList();
  renderBetScreen();
  renderKiroku();
  renderWeek();
  renderKanri();
  renderTabs();
}

function renderTabs() {
  var tabs = document.querySelectorAll('.tabbar button');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].classList.toggle('active', tabs[i].dataset.tab === S.tab);
  }
  var isAdmin = Storage.getCurrentUser().role === 'admin';
  var kanriTab = $('tab-kanri');
  if (kanriTab) { kanriTab.classList.toggle('hidden', !isAdmin); }
  var views = { home: 'screen-home', input: 'screen-input', kiroku: 'screen-kiroku', week: 'screen-week', kanri: 'screen-kanri' };
  for (var k in views) {
    if (Object.prototype.hasOwnProperty.call(views, k)) {
      $(views[k]).classList.toggle('hidden', S.tab !== k);
    }
  }
  $('view-race').classList.toggle('hidden', S.inputView !== 'race');
  $('view-bet').classList.toggle('hidden', S.inputView !== 'bet');
}

function renderHeader() {
  var u = Storage.getCurrentUser();
  var btn = $('user-switch');
  btn.textContent = '👤 ' + u.name + (u.role === 'admin' ? '（管理者）' : '（一般）');
  var mail = (typeof Storage.getCurrentEmail === 'function') ? Storage.getCurrentEmail() : null;
  if (mail) {
    var mini = document.createElement('span');
    mini.className = 'login-email-mini';
    mini.textContent = mail;
    btn.appendChild(mini);
  }
  $('demo-date').textContent = (Storage.dateLabel || 'デモ日') + ' ' + Storage.getDemoDate();
}

// ---- 画面A: ホーム ----
function renderHome() {
  var u = Storage.getCurrentUser();
  var mine = Storage.listBets({ userId: u.id });
  var today = Storage.summarize(Storage.filterToday(mine));
  var week = Storage.summarize(Storage.filterWeek(mine));
  var total = Storage.summarize(mine);

  var elToday = $('home-today');
  elToday.textContent = signedYen(today.shushi);
  elToday.className = 'big-money ' + signCls(today.shushi);

  // 結果待ち（確定前）の購入分は収支に混ぜず、別枠で見せる（要望対応2026-09-01）
  var hp = $('home-pending');
  if (today.pending_n > 0) {
    hp.textContent = '⏳ 結果待ち ' + today.pending_kingaku.toLocaleString('ja-JP')
      + '円（' + today.pending_n + '件）＝確定後に反映';
    hp.classList.remove('hidden');
  } else {
    hp.classList.add('hidden');
  }

  $('home-week').textContent = signedYen(week.shushi);
  $('home-week').className = 'sub-money ' + signCls(week.shushi);
  $('home-total').textContent = signedYen(total.shushi);
  $('home-total').className = 'big-money2 ' + signCls(total.shushi);
  $('home-count').textContent = today.n + '件';
  // 今日の購入額 = 確定分＋結果待ち分の合計（見送りは0円）
  var todayBet = today.kounyuu + today.pending_kingaku;
  $('home-bet-total').textContent = todayBet.toLocaleString('ja-JP') + '円';

  // 遊び心: 連続的中（確定済みの購入記録を新しい順に見る）と今週の的中数
  var streak = 0;
  for (var i = 0; i < mine.length; i++) {
    var st = mine[i].status;
    if (st === '的中') { streak++; }
    else if (st === '外れ') { break; }
    // 結果待ち・見送りは数えず次を見る
  }
  var weekHits = 0;
  Storage.filterWeek(mine).forEach(function (b) { if (b.status === '的中') { weekHits++; } });

  var fs = $('fun-streak');
  clear(fs);
  fs.appendChild(document.createTextNode(String(streak)));
  fs.appendChild(el('span', 'fun-unit', '連続'));
  fs.classList.toggle('hot', streak >= 2);

  var fw = $('fun-weekhit');
  clear(fw);
  fw.appendChild(document.createTextNode(String(weekHits)));
  fw.appendChild(el('span', 'fun-unit', '本'));
}

// ---- 画面B: レース選択 ----
function raceKey(r) { return r.race_date + '_' + r.jcd + '_' + r.race_no; }

// 開催日の短い表示（例 8/24（月））。日付文字列だけで曜日を出す（時差ズレ防止にUTC固定）
var YOUBI = ['日', '月', '火', '水', '木', '金', '土'];
function fmtDateShort(iso) {
  if (!iso) { return ''; }
  var p = String(iso).split('-');
  if (p.length !== 3) { return String(iso); }
  var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  return (+p[1]) + '/' + (+p[2]) + '（' + YOUBI[d.getUTCDay()] + '）';
}

function renderRaceList() {
  var u = Storage.getCurrentUser();
  var mine = Storage.listBets({ userId: u.id });
  var counts = {};
  for (var i = 0; i < mine.length; i++) {
    var k = raceKey(mine[i]);
    counts[k] = (counts[k] || 0) + 1;
  }

  var races = Storage.getRaces();
  var root = $('race-list');
  clear(root);

  var groups = [['鉄板5場', '🏆 鉄板5場'], ['準採用4場', '🥈 準採用4場']];
  groups.forEach(function (g) {
    root.appendChild(el('div', 'group-label', g[1]));
    var gr = races.filter(function (r) { return r.group === g[0]; });
    if (!gr.length) {
      root.appendChild(el('p', 'mini-note', '（本日なし）'));
      return;
    }
    gr.forEach(function (r) {
      var m = MEJIRUSHI[r.mejirushi] || {};
      var b = btn('race-btn ' + (m.cls || ''), null, function () { openBetScreen(r); });

      var main = el('span', 'race-main');
      main.appendChild(el('span', 'race-name', r.jou_name + ' ' + r.race_no + 'R'));
      var sub = el('span', 'race-sub',
        (r.race_date ? fmtDateShort(r.race_date) + ' ' : '')
        + '節' + r.setsu_day + '日目' + (r.setsu_len ? '/' + r.setsu_len + '日' : ''));
      // 締切時刻（前日リストと同じ判断材料。データに無ければ出さない）
      if (r.shimekiri) { sub.appendChild(el('span', 'race-shime', '〆' + r.shimekiri)); }
      main.appendChild(sub);
      b.appendChild(main);

      var side = el('span', 'race-side');
      var cnt = counts[raceKey(r)] || 0;
      if (cnt) { side.appendChild(el('span', 'done-chip', '記録' + cnt + '件')); }
      side.appendChild(el('span', 'tag ' + (m.cls || ''), r.mejirushi));
      if (r.mejirushi === '渋め') { side.appendChild(el('span', 'warn-mini', '見送り筆頭')); }
      b.appendChild(side);
      root.appendChild(b);
    });
  });
}

// ---- 画面C: 買い方と金額 ----
function openBetScreen(race) {
  S.race = race;
  S.kaikata = null;
  S.kaimoku = null;
  S.kingaku = null;
  S.tenji = null;
  S.tab = 'input';
  S.inputView = 'bet';
  $('kingaku-custom').value = '';
  renderAll();
  window.scrollTo(0, 0);
}

function tenjiMiokuri() { return !!(S.tenji && S.tenji.q6 === '見送る'); }

function findKaikata(id) {
  for (var i = 0; i < KAIKATA.length; i++) {
    if (KAIKATA[i].id === id) { return KAIKATA[i]; }
  }
  return null;
}

// チェック中の買い目の合計（ten=点数・kin=合計金額）
function kaimokuSummary() {
  var ten = 0, kin = 0;
  if (S.kaimoku) {
    for (var i = 0; i < S.kaimoku.length; i++) {
      var row = S.kaimoku[i];
      if (!row.checked) { continue; }
      ten++;
      kin += Number(row.kingaku) || 0;
    }
  }
  return { ten: ten, kin: kin };
}

// 行の金額を個別編集した時にプリセットの選択表示だけ外す（再描画なし）
function clearPresetHighlight() {
  var sel = document.querySelectorAll('.kingaku-btn.selected');
  for (var i = 0; i < sel.length; i++) { sel[i].classList.remove('selected'); }
}

// 買い目1行 =「チェック＋組番（艇番カラーチップ）＋個別金額欄」
// 1行だけの単勝はチェックUIを省略（常に1行買い）。金額編集・チェック変更は
// 合計バーと登録ボタンだけを更新する（全再描画すると入力フォーカスが飛ぶため）
// 自由買い目行（jiyuu）は券種ラベルと削除ボタンが付く
function kaimokuRowEl(row, kk) {
  var isTansho = kk.ten === 1 && S.kaimoku.length === 1;
  var r = el('div', 'kaimoku-row' + (row.checked ? '' : ' off'));
  var inp = document.createElement('input');

  var left = el(isTansho ? 'div' : 'label', 'kaimoku-left');
  if (!isTansho) {
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'kaimoku-check';
    cb.checked = row.checked;
    cb.addEventListener('change', function () {
      row.checked = this.checked;
      r.classList.toggle('off', !row.checked);
      inp.disabled = !row.checked;
      updateBetFooter();
    });
    left.appendChild(cb);
  }
  var chips = el('span', 'kaimoku-kumi');
  for (var i = 0; i < row.kumiban.length; i++) {
    var ch = row.kumiban.charAt(i);
    if (ch >= '1' && ch <= '6') {
      chips.appendChild(el('span', 'kumi-chip tb' + ch, ch));
    } else {
      chips.appendChild(el('span', 'kumi-sep', ch));
    }
  }
  left.appendChild(chips);
  if (row.jiyuu) { left.appendChild(el('span', 'jiyuu-tag', row.shubetsu || '自由')); }
  r.appendChild(left);

  var wrap = el('span', 'kaimoku-kinwrap');
  inp.type = 'number';
  inp.className = 'kaimoku-kin';
  inp.setAttribute('inputmode', 'numeric');
  inp.min = '0';
  inp.step = '100';
  inp.placeholder = '金額';
  inp.value = (Number(row.kingaku) > 0) ? String(row.kingaku) : '';
  inp.disabled = !row.checked;
  inp.addEventListener('input', function () {
    var v = parseInt(this.value, 10);
    row.kingaku = (v > 0) ? v : 0;
    S.kingaku = null;
    clearPresetHighlight();
    updateBetFooter();
  });
  wrap.appendChild(inp);
  wrap.appendChild(el('span', 'kaimoku-en', '円'));
  r.appendChild(wrap);
  if (row.jiyuu) {
    // 自由買い目行は削除できる（追加のやり直し用）
    r.appendChild(btn('jiyuu-del', '×', function () {
      var ix = S.kaimoku.indexOf(row);
      if (ix >= 0) { S.kaimoku.splice(ix, 1); }
      renderBetScreen();
    }));
  }
  return r;
}

// 自由買い目の追加欄（券種＋組番＋金額）。表示にない組番のイレギュラー記録用
function jiyuuBoxEl() {
  var box = el('div', 'jiyuu-box');
  box.appendChild(el('div', 'jiyuu-title', '自由買い目を追加（表示にない組番を買った時用・任意）'));
  var row = el('div', 'jiyuu-row');

  var sel = document.createElement('select');
  sel.className = 'jiyuu-shubetsu';
  for (var i = 0; i < JIYUU_SHUBETSU.length; i++) {
    var op = document.createElement('option');
    op.value = JIYUU_SHUBETSU[i];
    op.textContent = JIYUU_SHUBETSU[i];
    sel.appendChild(op);
  }
  row.appendChild(sel);

  var kumi = document.createElement('input');
  kumi.type = 'text';
  kumi.className = 'jiyuu-kumi';
  kumi.placeholder = '例 2-1';
  kumi.setAttribute('inputmode', 'numeric');
  row.appendChild(kumi);

  var kin = document.createElement('input');
  kin.type = 'number';
  kin.className = 'jiyuu-kin';
  kin.setAttribute('inputmode', 'numeric');
  kin.min = '0';
  kin.step = '100';
  kin.placeholder = '金額';
  row.appendChild(kin);

  row.appendChild(btn('jiyuu-add', '追加', function () {
    // 全角の数字・区切りは半角へ寄せる（形式チェックは緩く=記録できることを優先）
    var Z2H = { '０': '0', '１': '1', '２': '2', '３': '3', '４': '4', '５': '5',
                '６': '6', '－': '-', 'ー': '-', '−': '-', '＝': '=' };
    var km = (kumi.value || '').replace(/\s/g, '').split('').map(function (c) {
      return Z2H[c] || c;
    }).join('');
    if (!/^[1-6]([-=][1-6]){0,2}$/.test(km)) {
      toast('組番は 2-1 / 2=3 のような形式で入力してください（艇番1〜6）');
      return;
    }
    var v = parseInt(kin.value, 10);
    S.kaimoku.push({ kumiban: km, kingaku: (v > 0) ? v : 0,
                     checked: true, shubetsu: sel.value, jiyuu: true });
    S.kingaku = null;
    renderBetScreen();
  }));
  box.appendChild(row);
  return box;
}

// 合計バー（○点 ○○円）と登録ボタンの状態。チェック変更・金額変更で即時再計算
function updateBetFooter() {
  var totalBar = $('kaimoku-total');
  var submit = $('bet-submit');
  var sum = kaimokuSummary();

  if (S.race && S.kaikata && S.kaimoku) {
    totalBar.textContent = '合計 ' + sum.ten + '点 ' + sum.kin.toLocaleString('ja-JP') + '円';
    totalBar.classList.remove('hidden');
  } else {
    totalBar.classList.add('hidden');
  }

  var miokuri = tenjiMiokuri();
  if (miokuri) {
    submit.textContent = '見送りを記録する（0円）';
    submit.disabled = false;
    submit.classList.add('miokuri');
  } else {
    submit.textContent = '登録する';
    // チェック全部外し（0点）や金額なしでは登録できない
    submit.disabled = !(S.kaikata && sum.ten > 0 && sum.kin > 0);
    submit.classList.remove('miokuri');
  }
}

function renderBetScreen() {
  var body = $('bet-body');
  // 固定部品（自由入力〜登録ボタン）は選択中の買い方の直下へ引っ越すため、
  // clear(body)の巻き添えでDOMから消えないよう、先にview-bet末尾の定位置へ戻す
  var viewBet = $('view-bet');
  var betNotice = viewBet.querySelector('p.notice-text');
  BET_FIXED_IDS.forEach(function (fid) {
    var fe = $(fid);
    if (fe) { viewBet.insertBefore(fe, betNotice); }
  });
  clear(body);
  var freeRow = $('kingaku-free-row');
  if (!S.race) {
    freeRow.classList.add('hidden');
    $('kaimoku-total').classList.add('hidden');
    return;
  }
  var r = S.race;
  var m = r.mejirushi ? (MEJIRUSHI[r.mejirushi] || {}) : {};
  var rec = m.recommend || [];

  // レース情報カード
  var card = el('div', 'bet-race-card ' + (m.cls || ''));
  var title = el('div', 'bet-race-title', r.jou_name + ' ' + r.race_no + 'R');
  if (r.race_date) {
    title.appendChild(el('span', 'bet-race-setsu', fmtDateShort(r.race_date)));
  }
  if (r.setsu_day) {
    title.appendChild(el('span', 'bet-race-setsu',
      '節' + r.setsu_day + '日目' + (r.setsu_len ? '/' + r.setsu_len + '日' : '')));
  }
  title.appendChild(r.mejirushi
    ? el('span', 'tag ' + (m.cls || ''), r.mejirushi)
    : el('span', 'tag tag-outside', 'リスト外'));
  card.appendChild(title);
  // 出走6艇の簡易表（誤入力防止: 前日リストと選手名を照合できる。見るだけ・タップ不要）
  if (r.senshu && r.senshu.length) {
    var sbox = el('div', 'senshu-box');
    sbox.appendChild(el('div', 'senshu-head', '出走6艇（枠・選手・級・実力点）'));
    for (var si = 0; si < r.senshu.length; si++) {
      var sn = r.senshu[si];
      var srow = el('div', 'senshu-row');
      srow.appendChild(el('span', 'kumi-chip tb' + sn.waku, String(sn.waku)));
      srow.appendChild(el('span', 'senshu-name', (sn.name || '—') + (sn.joshi ? '❤️' : '')));
      srow.appendChild(el('span', 'senshu-kyu', sn.kyu || '—'));
      srow.appendChild(el('span', 'senshu-pt', scoreStr(sn.pt)));
      sbox.appendChild(srow);
    }
    card.appendChild(sbox);
  }
  if (r.suisho) { card.appendChild(el('div', 'bet-suisho', '買い目推奨: ' + r.suisho)); }
  // 前日リストと同じ判断材料: 荒らし役スコア・一強度（リスト外レースには無い）
  if (r.arashi != null || r.ikkyoudo != null) {
    card.appendChild(el('div', 'bet-score-row',
      '荒らし役 ' + scoreStr(r.arashi) + '（90未満=外枠は静か）・一強度 '
      + scoreStr(r.ikkyoudo) + '（0に近いほど1号艇が信用できる）'));
  }
  // レース注意事項: 前日リストと同じ注意文（chui）。無い旧データは従来の固定文で表示
  if (r.chui && r.chui.length) {
    for (var ci = 0; ci < r.chui.length; ci++) {
      card.appendChild(el('div', 'warn-banner', '⚠️ ' + r.chui[ci]));
    }
  } else if (r.mejirushi === '渋め') {
    card.appendChild(el('div', 'warn-banner', '⚠️ 見送り筆頭のレースです。買う場合も金額は控えめに'));
  } else if (r.mejirushi === '妙味薄') {
    card.appendChild(el('div', 'info-banner', '🔸 参考格（希少パターン・週次レビューで検証中）'));
  }
  if (!r.mejirushi) {
    card.appendChild(el('div', 'info-banner', 'リスト外レース（目印・推奨なし）。記録として残せます'));
  }
  body.appendChild(card);

  // 買い方8種
  var lab1 = el('div', 'section-label', '買い方を選ぶ ');
  lab1.appendChild(el('span', 'step-chip', 'タップ2'));
  body.appendChild(lab1);
  var kdata = kaisyuOf(r.mejirushi);  // この目印の買い方別・想定回収率（無ければnull）
  var list = el('div', 'kaikata-list');
  KAIKATA.forEach(function (kk) {
    var b = btn('kaikata-btn' + (S.kaikata === kk.id ? ' selected' : ''), null, function () {
      if (S.kaikata !== kk.id) {
        S.kaikata = kk.id;
        S.kingaku = null;
        $('kingaku-custom').value = '';
        // 買い目行を生成（初期=全チェックON・金額は未入力）
        S.kaimoku = kk.kumiban.map(function (km) {
          return { kumiban: km, kingaku: 0, checked: true };
        });
      }
      renderBetScreen();
    });
    var nm = el('span', 'kaikata-name', kk.name);
    if (rec.indexOf(kk.id) >= 0) { nm.appendChild(el('span', 'rec-badge', '推奨')); }
    b.appendChild(nm);
    var right = el('span', 'kaikata-right');
    right.appendChild(el('span', 'kaikata-kumi', kk.kumi));
    if (kk.boats) {
      // 組番に使う艇番を公式カラーの小チップで（1白/2黒/3赤/4青/5黄/6緑）
      var kchips = el('span', 'kumi-chips');
      kk.boats.forEach(function (bn) {
        kchips.appendChild(el('span', 'kumi-chip tb' + bn, String(bn)));
      });
      right.appendChild(kchips);
    }
    // この目印×この買い方の想定回収率（4年実測・全買い時の土台。データが無ければ非表示）
    var kv = kdata ? kdata[kk.name] : null;
    if (typeof kv === 'number') {
      right.appendChild(el('span', 'kaisyu-mini', '実測 ' + kv.toFixed(1) + '%'));
    }
    b.appendChild(right);
    list.appendChild(b);
    // 選択中の買い方の直下に買い目〜登録の一式を展開（下までスクロール不要・要望対応2026-09-01）
    if (S.kaikata === kk.id && S.kaimoku) {
      var kb = kaimokuBlockEl(kk);
      if (kb) { list.appendChild(kb); }
    }
  });
  body.appendChild(list);
  if (kdata) {
    body.appendChild(el('p', 'mini-note',
      '実測%=同じ目印のレースを機械的に全部買った場合の4年実測回収率（すべて100%未満・買う/見送るは人の判断）'));
  }

  if (findKaikata(S.kaikata) && S.kaimoku) {
    freeRow.classList.remove('hidden');
  } else {
    freeRow.classList.add('hidden');
  }

  // 展示チェック票の状態表示
  var tSum = $('tenji-summary');
  if (S.tenji) {
    var parts = [];
    if (S.tenji.q1) { parts.push('気配' + S.tenji.q1.charAt(0)); }
    if (S.tenji.q6) { parts.push('最終判断: ' + S.tenji.q6); }
    tSum.textContent = '📋 記入済み' + (parts.length ? '（' + parts.join('・') + '）' : '');
    tSum.classList.remove('hidden');
  } else {
    tSum.classList.add('hidden');
  }

  // 合計バー（○点 ○○円）と登録ボタンの状態
  updateBetFooter();
}

// 買い目〜登録の一式ブロック。選択中の買い方ボタンの直下に挿す（要望対応2026-09-01）
function kaimokuBlockEl(kkSel) {
  if (!kkSel || !S.kaimoku) { return null; }
  var wrap = el('div', 'kaimoku-inline');

  var lab2 = el('div', 'section-label',
    (kkSel.ten === 1 && S.kaimoku.length === 1)
      ? '買い目と金額' : '買い目を選ぶ（チェック＝買う・外した行は買わない）');
  wrap.appendChild(lab2);
  var klist = el('div', 'kaimoku-list');
  for (var ki = 0; ki < S.kaimoku.length; ki++) {
    klist.appendChild(kaimokuRowEl(S.kaimoku[ki], kkSel));
  }
  wrap.appendChild(klist);
  // 自由買い目の追加欄（表示にない組番=イレギュラーの記録用）
  wrap.appendChild(jiyuuBoxEl());

  var lab3 = el('div', 'section-label', '金額をえらぶ（チェック中の全買い目へ一括） ');
  lab3.appendChild(el('span', 'step-chip', 'タップ3'));
  wrap.appendChild(lab3);
  var row = el('div', 'kingaku-row');
  KINGAKU_PRESET.forEach(function (v) {
    var b = btn('kingaku-btn' + (S.kingaku === v ? ' selected' : ''), null, function () {
      S.kingaku = v;
      $('kingaku-custom').value = '';
      for (var i = 0; i < S.kaimoku.length; i++) {
        if (S.kaimoku[i].checked) { S.kaimoku[i].kingaku = v; }
      }
      renderBetScreen();
    });
    b.appendChild(el('span', null, v.toLocaleString('ja-JP')));
    b.appendChild(el('span', 'en', '円'));
    row.appendChild(b);
  });
  wrap.appendChild(row);
  if (kkSel.ten > 1) {
    wrap.appendChild(el('p', 'mini-note', '行の金額欄を直接編集すると買い目ごとに金額を変えられます'));
  }

  // 画面下部の固定部品（自由入力・展示チェック票・合計・登録）もこのブロック内へ移動＝ここで登録まで完結
  BET_FIXED_IDS.forEach(function (fid) {
    var fe = $(fid);
    if (fe) { wrap.appendChild(fe); }
  });
  return wrap;
  var hint = $('bet-hint');
  if (S.tenji && S.tenji.q6 === '金額を下げる' && !tenjiMiokuri()) {
    hint.textContent = 'チェック票: 金額を下げる → いつもより低い金額で登録しましょう';
    hint.classList.remove('hidden');
  } else {
    hint.classList.add('hidden');
  }
}

function submitBet() {
  if (!S.race) { return; }
  var race = S.race;
  var miokuri = tenjiMiokuri();
  var kk = findKaikata(S.kaikata);
  var sum = kaimokuSummary();
  if (!miokuri && (!kk || sum.ten === 0 || sum.kin === 0)) { return; }
  var kkName = kk ? kk.name : '（未選択）';
  var kin = miokuri ? 0 : sum.kin;

  // 買い目内訳（チェックON・金額>0 の行だけを保存。本番の的中突合に使う形。
  // 自由買い目行は shubetsu / jiyuu 付きで保存＝イレギュラーだと分かる形）
  var kaimoku = null;
  if (!miokuri && S.kaimoku) {
    kaimoku = [];
    for (var i = 0; i < S.kaimoku.length; i++) {
      var row = S.kaimoku[i];
      var v = Number(row.kingaku) || 0;
      if (row.checked && v > 0) {
        var kmRow = { kumiban: row.kumiban, kingaku: v };
        if (row.jiyuu) { kmRow.jiyuu = true; kmRow.shubetsu = row.shubetsu || ''; }
        kaimoku.push(kmRow);
      }
    }
  }

  Storage.addBet({
    race_date: race.race_date,
    jcd: race.jcd,
    race_no: race.race_no,
    jou_name: race.jou_name,
    kaikata: kkName,
    kingaku: kin,
    kaimoku: kaimoku,
    status: miokuri ? '見送り' : '結果待ち'
  }, S.tenji);

  // チェックを外して点数が変わった時はラベルに実点数を添える
  var label = kkName;
  if (!miokuri && kk && kaimoku && kaimoku.length !== kk.ten) {
    label += '（' + kaimoku.length + '点買い）';
  }
  toast(miokuri
    ? '👍 見送りも立派な判断。' + race.jou_name + ' ' + race.race_no + 'R を0円で記録しました'
    : race.jou_name + ' ' + race.race_no + 'R ' + label + ' ' + yen(kin) + ' を登録しました');

  // 画面Aへ戻り収支を即時更新
  S.tab = 'home';
  S.inputView = 'race';
  S.race = null;
  S.kaikata = null;
  S.kaimoku = null;
  S.kingaku = null;
  S.tenji = null;
  renderAll();
  window.scrollTo(0, 0);

  // 遊び心: 舟券風チケットが収支へ吸い込まれる（見送りはトーストのみ）
  if (!miokuri) { showTicketFx(race, label, kin); }
}

// ---- 画面D: 展示チェック票（モーダル）----
var tenjiDraft = null;

function openTenjiModal() {
  tenjiDraft = {};
  if (S.tenji) {
    for (var k in S.tenji) {
      if (Object.prototype.hasOwnProperty.call(S.tenji, k)) { tenjiDraft[k] = S.tenji[k]; }
    }
  }
  renderTenjiModal();
  $('tenji-modal').classList.remove('hidden');
}

function closeTenjiModal() { $('tenji-modal').classList.add('hidden'); }

function toggleMulti(field, v) {
  var cur = (tenjiDraft[field] && tenjiDraft[field] !== 'なし') ? tenjiDraft[field].split(',') : [];
  var ix = cur.indexOf(v);
  if (ix >= 0) { cur.splice(ix, 1); } else { cur.push(v); }
  cur.sort();
  tenjiDraft[field] = cur.length ? cur.join(',') : undefined;
}

function renderTenjiModal() {
  var body = $('tenji-body');
  clear(body);

  TENJI_ITEMS.forEach(function (it) {
    var box = el('div', 'tenji-item');
    box.appendChild(el('div', 'tenji-q', it.no + '. ' + it.item));
    var chs = el('div', 'tenji-choices');

    if (it.type === 'single') {
      it.choices.forEach(function (ch) {
        chs.appendChild(btn('chip' + (tenjiDraft[it.q] === ch ? ' selected' : ''), ch, function () {
          // 同じ選択肢をもう一度タップで解除（全部スキップ可）
          tenjiDraft[it.q] = (tenjiDraft[it.q] === ch) ? undefined : ch;
          renderTenjiModal();
        }));
      });
    } else if (it.type === 'soto') {
      // なし／あり(艇番選択: 4-6号艇・複数可)
      chs.appendChild(btn('chip' + (tenjiDraft.q3 === 'なし' ? ' selected' : ''), 'なし', function () {
        tenjiDraft.q3 = (tenjiDraft.q3 === 'なし') ? undefined : 'なし';
        renderTenjiModal();
      }));
      [4, 5, 6].forEach(function (w) {
        var on = tenjiDraft.q3 && tenjiDraft.q3 !== 'なし' && tenjiDraft.q3.split(',').indexOf(String(w)) >= 0;
        // 公式の艇番カラー（4青/5黄/6緑）で塗る
        chs.appendChild(btn('chip tb tb' + w + (on ? ' selected' : ''), 'あり:' + w + '号艇', function () {
          if (tenjiDraft.q3 === 'なし') { tenjiDraft.q3 = undefined; }
          toggleMulti('q3', String(w));
          renderTenjiModal();
        }));
      });
    } else if (it.type === 'multi') {
      // 艇番選択(複数可・なし可): 1-6号艇
      chs.appendChild(btn('chip' + (tenjiDraft.q4 === 'なし' ? ' selected' : ''), 'なし', function () {
        tenjiDraft.q4 = (tenjiDraft.q4 === 'なし') ? undefined : 'なし';
        renderTenjiModal();
      }));
      [1, 2, 3, 4, 5, 6].forEach(function (w) {
        var on = tenjiDraft.q4 && tenjiDraft.q4 !== 'なし' && tenjiDraft.q4.split(',').indexOf(String(w)) >= 0;
        // 公式の艇番カラー（1白/2黒/3赤/4青/5黄/6緑）で塗る
        chs.appendChild(btn('chip tb tb' + w + (on ? ' selected' : ''), w + '号艇', function () {
          if (tenjiDraft.q4 === 'なし') { tenjiDraft.q4 = undefined; }
          toggleMulti('q4', String(w));
          renderTenjiModal();
        }));
      });
    }
    box.appendChild(chs);
    if (it.q === 'q6') {
      box.appendChild(el('p', 'mini-note',
        '「見送る」を選ぶと金額0円の見送り記録として保存できます（週次レビューの材料）'));
    }
    body.appendChild(box);
  });
}

function applyTenji() {
  // 空回答（全部スキップ）は「付けない」と同じ扱い
  var any = false;
  for (var k in tenjiDraft) {
    if (Object.prototype.hasOwnProperty.call(tenjiDraft, k) && tenjiDraft[k]) { any = true; break; }
  }
  S.tenji = any ? tenjiDraft : null;
  closeTenjiModal();
  renderBetScreen();
}

// ---- リスト外レース入力（画面Bの補助）----
function renderOutsideModal() {
  var body = $('outside-body');
  clear(body);

  body.appendChild(el('div', 'section-label', '場を選ぶ'));
  var jr = el('div', 'outside-jcd');
  JOU24.forEach(function (j) {
    jr.appendChild(btn('chip' + (S.outsideJcd === j[0] ? ' selected' : ''), j[1], function () {
      S.outsideJcd = j[0];
      renderOutsideModal();
    }));
  });
  body.appendChild(jr);

  body.appendChild(el('div', 'section-label', 'レース番号を選ぶ（選ぶと入力へ進みます）'));
  var rr = el('div', 'outside-rno');
  for (var r = 1; r <= 12; r++) {
    (function (no) {
      rr.appendChild(btn('chip rno', no + 'R', function () {
        var name = '';
        JOU24.forEach(function (x) { if (x[0] === S.outsideJcd) { name = x[1]; } });
        $('outside-modal').classList.add('hidden');
        openBetScreen({
          race_date: Storage.getDemoDate(),
          jcd: S.outsideJcd,
          jou_name: name,
          race_no: no,
          setsu_day: null, setsu_len: null,
          mejirushi: null, suisho: null,
          outside: true
        });
      }));
    })(r);
  }
  body.appendChild(rr);
}

function openOutsideModal() {
  renderOutsideModal();
  $('outside-modal').classList.remove('hidden');
}

// ---- 画面E: 記録一覧 ----
// 自由買い目を含む記録か（モックの単勝突合は対象外＝本番で自動突合の扱いにする）
function hasJiyuuRow(b) {
  if (!b.kaimoku) { return false; }
  for (var i = 0; i < b.kaimoku.length; i++) {
    if (b.kaimoku[i].jiyuu) { return true; }
  }
  return false;
}

function statusChipEl(b) {
  if (b.status === '的中') {
    return el('span', 'st-chip st-hit', '的中 ' + signedYen(b.payout - b.kingaku));
  }
  if (b.status === '外れ') {
    return el('span', 'st-chip st-miss', '外れ −' + Number(b.kingaku).toLocaleString('ja-JP') + '円');
  }
  if (b.status === '見送り') {
    return el('span', 'st-chip st-skip', '見送り 0円');
  }
  var r = Storage.findResult(b.race_date, b.jcd, b.race_no);
  if (Storage.resultsImported() && r && r.has_result
      && (b.kaikata !== '単勝1点' || hasJiyuuRow(b))) {
    return el('span', 'st-chip st-wait', '結果待ち（本番で自動突合）');
  }
  return el('span', 'st-chip st-wait', '結果待ち');
}

function renderKiroku() {
  var u = Storage.getCurrentUser();
  var isAdmin = u.role === 'admin';
  // 一般=自分の記録のみ／管理者=全員分
  var bets = isAdmin ? Storage.listBets({}) : Storage.listBets({ userId: u.id });
  var today = Storage.getDemoDate();

  $('kiroku-scope').textContent = isAdmin ? '表示範囲: 全員分（管理者）' : '表示範囲: 自分の記録のみ';

  var root = $('kiroku-list');
  clear(root);
  if (!bets.length) {
    root.appendChild(el('p', 'empty-note', 'まだ記録がありません。「入力」タブから登録できます。'));
    return;
  }

  bets.forEach(function (b) {
    var owner = Storage.getUser(b.user_id);
    var mine = b.user_id === u.id;
    var row = el('div', 'kiroku-row');

    var main = el('div', 'kiroku-main');
    var title = el('div', 'kiroku-title', b.jou_name + ' ' + b.race_no + 'R');
    title.appendChild(el('span', 'kiroku-kaikata', b.kaikata));
    if (newlyHit[b.id]) { title.appendChild(el('span', 'hit-flash', '🎯的中!')); }
    if (isAdmin) {
      title.appendChild(el('span', 'user-chip' + (mine ? ' me' : ''), owner ? owner.name : b.user_id));
    }
    main.appendChild(title);
    main.appendChild(el('div', 'kiroku-sub',
      b.race_date + '　購入 ' + yen(b.kingaku) + (Storage.getTenji(b.id) ? '　📋チェック票あり' : '')));
    // 買い目内訳（2026-09-01改良の新形式のみ。旧記録＝kaimoku無しでは出さない。
    // 自由買い目行は券種名を添えて区別する。例: ２連単2-1:300円）
    if (b.kaimoku && b.kaimoku.length) {
      var kmParts = [];
      for (var km = 0; km < b.kaimoku.length; km++) {
        var kmr = b.kaimoku[km];
        kmParts.push((kmr.jiyuu && kmr.shubetsu ? kmr.shubetsu : '')
          + kmr.kumiban + ':' + yen(kmr.kingaku));
      }
      main.appendChild(el('div', 'kiroku-kaimoku', kmParts.join('・')));
    }
    row.appendChild(main);

    var side = el('div', 'kiroku-side');
    side.appendChild(statusChipEl(b));
    if (mine && b.race_date === today) {
      // 2タップ式の取消（誤タップ防止。モーダル不使用でスマホでも確実に動く）
      side.appendChild(btn('cancel-btn', '取消', function () {
        var self = this;
        if (self.dataset.armed === '1') {
          var res = Storage.cancelBet(b.id);
          toast(res.ok ? '記録を取り消しました' : res.msg);
          renderAll();
          return;
        }
        self.dataset.armed = '1';
        self.classList.add('armed');
        self.textContent = 'もう一度タップで取消';
        setTimeout(function () {
          if (self.dataset.armed === '1') {
            self.dataset.armed = '';
            self.classList.remove('armed');
            self.textContent = '取消';
          }
        }, 5000);
      }));
    }
    row.appendChild(side);
    root.appendChild(row);
  });
}

// ---- 画面F: 週間 ----
function renderWeek() {
  var u = Storage.getCurrentUser();
  var isAdmin = u.role === 'admin';
  var start = Storage.weekStartOf(Storage.getDemoDate());
  var end = Storage.addDays(start, 6);
  $('week-range').textContent = start + ' 〜 ' + end + '（月曜起点）';

  var mine = Storage.filterWeek(Storage.listBets({ userId: u.id }));
  var sum = Storage.summarize(mine);

  var big = $('week-money');
  big.textContent = signedYen(sum.shushi);
  big.className = 'big-money ' + signCls(sum.shushi);

  // マイナスの週は目立たせる（隠さない）
  $('week-minus-banner').classList.toggle('hidden', !(sum.shushi < 0));

  // 遊び心: ゲームのリザルト風スコア（的中 VS 外れ）＋1レース=1ドットの戦績
  var wl = $('week-wl');
  clear(wl);
  var wlHit = 0, wlMiss = 0;
  mine.forEach(function (b) {
    if (b.status === '的中') { wlHit++; }
    if (b.status === '外れ') { wlMiss++; }
  });
  var head = el('div', 'wl-head');
  var sideH = el('span', 'wl-side');
  sideH.appendChild(el('span', 'wl-label', '的中'));
  sideH.appendChild(el('span', 'wl-num wl-hit', String(wlHit)));
  head.appendChild(sideH);
  head.appendChild(el('span', 'wl-vs', 'VS'));
  var sideM = el('span', 'wl-side');
  sideM.appendChild(el('span', 'wl-label', '外れ'));
  sideM.appendChild(el('span', 'wl-num wl-miss', String(wlMiss)));
  head.appendChild(sideM);
  wl.appendChild(head);
  if (mine.length) {
    var dots = el('div', 'wl-dots');
    var ordered = mine.slice().sort(function (a, b) { return a.created_at < b.created_at ? -1 : 1; });
    ordered.slice(-24).forEach(function (b) {
      var c = b.status === '的中' ? 'hit'
        : b.status === '外れ' ? 'miss'
        : b.status === '見送り' ? 'skip' : 'wait';
      dots.appendChild(el('span', 'wl-dot ' + c));
    });
    wl.appendChild(dots);
    var lg = el('div', 'wl-legend');
    [['hit', '的中'], ['miss', '外れ'], ['skip', '見送り'], ['wait', '結果待ち']].forEach(function (p) {
      lg.appendChild(el('span', 'wl-dot mini ' + p[0]));
      lg.appendChild(document.createTextNode(p[1] + '　'));
    });
    lg.appendChild(document.createTextNode('（左が古い・直近24件）'));
    wl.appendChild(lg);
  }

  var stats = $('week-stats');
  clear(stats);
  [['的中率', pct(sum.tekichuritsu)], ['回収率', pct(sum.kaishuritsu)],
   ['購入（確定分）', yen(sum.kounyuu)], ['払戻', yen(sum.haraimodoshi)],
   ['結果待ち', yen(sum.pending_kingaku)], ['入力件数', sum.n + '件'],
   ['うち見送り', sum.miokuri + '件']].forEach(function (p) {
    var s = el('div', 'stat');
    s.appendChild(el('div', 'stat-label', p[0]));
    s.appendChild(el('div', 'stat-val', p[1]));
    stats.appendChild(s);
  });

  // 人別内訳（管理者のみ全員分）
  var box = $('week-users');
  clear(box);
  if (!isAdmin) {
    $('week-users-label').classList.add('hidden');
    return;
  }
  $('week-users-label').classList.remove('hidden');
  Storage.getUsers().forEach(function (us) {
    var s = Storage.summarize(Storage.filterWeek(Storage.listBets({ userId: us.id })));
    var row = el('div', 'week-user-row');
    var nm = el('span', 'week-user-name', us.name);
    if (us.role === 'admin') { nm.appendChild(el('span', 'role-mini', '管理者')); }
    row.appendChild(nm);
    row.appendChild(el('span', 'week-user-stats',
      '的中率 ' + pct(s.tekichuritsu) + '・回収率 ' + pct(s.kaishuritsu)));
    row.appendChild(el('span', 'week-user-money ' + signCls(s.shushi), signedYen(s.shushi)));
    box.appendChild(row);
  });
}

// ---- 画面G: 管理（管理者のみ・全員の明細を見る） ----

// 今月（デモ日と同じ年月）で絞る
function filterMonth(bets) {
  var ym = Storage.getDemoDate().slice(0, 7);
  return bets.filter(function (b) { return b.race_date.slice(0, 7) === ym; });
}

function kanriFilter(bets) {
  if (S.kanri.period === 'today') { return Storage.filterToday(bets); }
  if (S.kanri.period === 'week') { return Storage.filterWeek(bets); }
  if (S.kanri.period === 'month') { return filterMonth(bets); }
  return bets;
}

function kanriPeriodLabel() {
  return { today: '今日', week: '今週', month: '今月', all: '通算' }[S.kanri.period] || '';
}

function statusClass(st) {
  return st === '的中' ? 'hit' : st === '外れ' ? 'miss' : st === '見送り' ? 'skip' : 'wait';
}

function kanriStatGrid(sum) {
  var st = el('div', 'week-stats');
  [['購入（確定分）', yen(sum.kounyuu)], ['払戻', yen(sum.haraimodoshi)],
   ['的中率', pct(sum.tekichuritsu)], ['回収率', pct(sum.kaishuritsu)],
   ['結果待ち', yen(sum.pending_kingaku)], ['入力件数', sum.n + '件'],
   ['うち見送り', sum.miokuri + '件']].forEach(function (p) {
    var s = el('div', 'stat');
    s.appendChild(el('div', 'stat-label', p[0]));
    s.appendChild(el('div', 'stat-val', p[1]));
    st.appendChild(s);
  });
  return st;
}

function renderKanri() {
  var box = $('kanri-body');
  if (!box) { return; }
  var isAdmin = Storage.getCurrentUser().role === 'admin';
  if (!isAdmin) {
    if (S.tab === 'kanri') { S.tab = 'home'; }
    return;
  }

  var pbs = document.querySelectorAll('#kanri-period button');
  for (var i = 0; i < pbs.length; i++) { pbs[i].classList.toggle('active', pbs[i].dataset.period === S.kanri.period); }
  var vbs = document.querySelectorAll('#kanri-view button');
  for (var j = 0; j < vbs.length; j++) { vbs[j].classList.toggle('active', vbs[j].dataset.view === S.kanri.view); }

  var all = kanriFilter(Storage.listBets({}));
  var users = Storage.getUsers();

  var sm = $('kanri-summary');
  clear(sm);
  var sum = Storage.summarize(all);
  var active = {};
  all.forEach(function (b) { active[b.user_id] = true; });
  sm.appendChild(el('div', 'home-label',
    kanriPeriodLabel() + 'の全体（メンバー' + users.length + '人・記録あり' + Object.keys(active).length + '人）'));
  sm.appendChild(el('div', 'big-money ' + signCls(sum.shushi), signedYen(sum.shushi)));
  sm.appendChild(kanriStatGrid(sum));

  var kojinBox = $('kanri-kojin');
  var sortRow = $('kanri-sort-row');
  if (S.kanri.kojinId != null) {
    box.classList.add('hidden');
    sortRow.classList.add('hidden');
    kojinBox.classList.remove('hidden');
    renderKanriKojin(all);
    return;
  }
  box.classList.remove('hidden');
  kojinBox.classList.add('hidden');
  clear(box);

  if (S.kanri.view === 'jin') {
    sortRow.classList.remove('hidden');
    renderKanriJin(box, sortRow, all, users);
  } else {
    sortRow.classList.add('hidden');
    renderKanriRace(box, all, users);
  }
}

// 人別ビュー: 1人1カード（タップで個人詳細）
function renderKanriJin(box, sortRow, all, users) {
  clear(sortRow);
  sortRow.appendChild(el('span', 'kanri-sort-label', '並び:'));
  [['shushi', '収支'], ['kounyuu', '購入額'], ['kaishu', '回収率']].forEach(function (p) {
    sortRow.appendChild(btn('kanri-sort-btn' + (S.kanri.sort === p[0] ? ' active' : ''), p[1], function () {
      S.kanri.sort = p[0]; renderKanri();
    }));
  });

  var rows = users.map(function (us) {
    var mine = all.filter(function (b) { return b.user_id === us.id; });
    return { u: us, s: Storage.summarize(mine) };
  });
  rows.sort(function (a, b) {
    if (S.kanri.sort === 'kounyuu') { return b.s.kounyuu - a.s.kounyuu; }
    if (S.kanri.sort === 'kaishu') { return (b.s.kaishuritsu || 0) - (a.s.kaishuritsu || 0); }
    return b.s.shushi - a.s.shushi;
  });

  rows.forEach(function (r) {
    var card = el('div', 'kanri-card tap');
    var head = el('div', 'kanri-card-head');
    var nm = el('span', 'kanri-name', r.u.name);
    if (r.u.role === 'admin') { nm.appendChild(el('span', 'role-mini', '管理者')); }
    head.appendChild(nm);
    head.appendChild(el('span', 'kanri-money ' + signCls(r.s.shushi), signedYen(r.s.shushi)));
    card.appendChild(head);
    card.appendChild(el('div', 'kanri-sub',
      '購入 ' + yen(r.s.kounyuu) + '・的中率 ' + pct(r.s.tekichuritsu) +
      '・回収率 ' + pct(r.s.kaishuritsu) + '・入力 ' + r.s.n + '件（見送り' + r.s.miokuri + '）'));
    card.appendChild(el('div', 'kanri-tap-hint', 'タップで明細 →'));
    card.addEventListener('click', function () {
      S.kanri.kojinId = r.u.id;
      renderKanri();
      window.scrollTo(0, 0);
    });
    box.appendChild(card);
  });
}

// レース別ビュー: 1レース1カード（誰が何にいくら賭けたかの逆引き）
function renderKanriRace(box, all, users) {
  var uname = {};
  users.forEach(function (us) { uname[us.id] = us.name; });
  var groups = {};
  var order = [];
  all.forEach(function (b) {
    var key = b.race_date + '|' + b.jcd + '|' + b.race_no;
    if (!groups[key]) {
      groups[key] = { date: b.race_date, jou: b.jou_name, no: b.race_no, bets: [] };
      order.push(key);
    }
    groups[key].bets.push(b);
  });
  if (!order.length) {
    box.appendChild(el('p', 'mini-note', kanriPeriodLabel() + 'の記録はありません'));
    return;
  }
  order.sort(function (a, b) {
    var ga = groups[a], gb = groups[b];
    if (ga.date !== gb.date) { return ga.date < gb.date ? 1 : -1; }
    if (ga.jou !== gb.jou) { return ga.jou < gb.jou ? -1 : 1; }
    return ga.no - gb.no;
  });
  var memberN = users.length;
  order.forEach(function (key) {
    var g = groups[key];
    var card = el('div', 'kanri-card');
    var head = el('div', 'kanri-card-head');
    head.appendChild(el('span', 'kanri-name', g.date + ' ' + g.jou + ' ' + g.no + 'R'));
    var sanka = {};
    var total = 0;
    g.bets.forEach(function (b) {
      if (b.status !== '見送り') { sanka[b.user_id] = true; total += b.kingaku; }
    });
    var sankaN = Object.keys(sanka).length;
    head.appendChild(el('span',
      'kanri-race-badge' + (memberN > 1 && sankaN >= memberN ? ' all' : ''),
      (memberN > 1 && sankaN >= memberN ? '全員参加・' : '参加' + sankaN + '/' + memberN + '人・') + '計' + yen(total)));
    card.appendChild(head);
    g.bets.forEach(function (b) {
      var line = el('div', 'kanri-race-line');
      line.appendChild(el('span', 'kanri-race-user', uname[b.user_id] || '—'));
      var desc;
      if (b.status === '見送り') {
        desc = '見送り';
      } else {
        desc = (b.kaikata || '—');
        if (b.kaimoku && b.kaimoku.length) {
          desc += ' ' + b.kaimoku.map(function (k) { return k.kumiban; }).join(',');
        }
        desc += '　' + yen(b.kingaku);
        if (b.status === '的中') { desc += ' → 払戻' + yen(b.payout); }
      }
      line.appendChild(el('span', 'kanri-race-desc', desc));
      line.appendChild(el('span', 'kanri-meisai-status st-' + statusClass(b.status), b.status));
      card.appendChild(line);
    });
    box.appendChild(card);
  });
}

// 個人詳細: 集計＋買い方別内訳＋全明細（買い目・掛金・結果まで）
function renderKanriKojin(all) {
  var body = $('kanri-kojin-body');
  clear(body);
  var us = Storage.getUser(S.kanri.kojinId);
  if (!us || !us.id) { S.kanri.kojinId = null; renderKanri(); return; }
  var mine = all.filter(function (b) { return b.user_id === us.id; });
  var s = Storage.summarize(mine);

  var head = el('div', 'home-card');
  head.appendChild(el('div', 'home-label', us.name + (us.role === 'admin' ? '（管理者）' : '') + '・' + kanriPeriodLabel()));
  head.appendChild(el('div', 'big-money ' + signCls(s.shushi), signedYen(s.shushi)));
  head.appendChild(kanriStatGrid(s));
  body.appendChild(head);

  var kk = {};
  mine.forEach(function (b) {
    if (b.status === '見送り') { return; }
    var key = b.kaikata || '不明';
    if (!kk[key]) { kk[key] = { n: 0, kounyuu: 0, haraimodoshi: 0 }; }
    kk[key].n++;
    if (b.status === '結果待ち') { return; }
    kk[key].kounyuu += b.kingaku;
    kk[key].haraimodoshi += b.payout || 0;
  });
  var keys = Object.keys(kk);
  if (keys.length) {
    body.appendChild(el('div', 'section-label', '買い方別の内訳'));
    keys.sort(function (a, b) { return kk[b].kounyuu - kk[a].kounyuu; });
    keys.forEach(function (k) {
      var d = kk[k];
      var sh = d.haraimodoshi - d.kounyuu;
      var row = el('div', 'kanri-kk-row');
      row.appendChild(el('span', 'kanri-kk-name', k));
      row.appendChild(el('span', 'kanri-kk-stats',
        d.n + '件・購入 ' + yen(d.kounyuu) + '・回収率 ' + pct(d.kounyuu > 0 ? d.haraimodoshi / d.kounyuu : null)));
      row.appendChild(el('span', 'kanri-money ' + signCls(sh), signedYen(sh)));
      body.appendChild(row);
    });
  }

  body.appendChild(el('div', 'section-label', '明細 ' + mine.length + '件（新しい順）'));
  mine.forEach(function (b) {
    var row = el('div', 'kanri-meisai');
    var l1 = el('div', 'kanri-meisai-l1');
    l1.appendChild(el('span', 'kanri-meisai-race', b.race_date + ' ' + b.jou_name + ' ' + b.race_no + 'R'));
    l1.appendChild(el('span', 'kanri-meisai-status st-' + statusClass(b.status), b.status));
    row.appendChild(l1);
    var l2 = el('div', 'kanri-meisai-l2');
    if (b.status === '見送り') {
      l2.textContent = '見送り（0円）';
    } else {
      var parts = [b.kaikata || '—'];
      if (b.kaimoku && b.kaimoku.length) {
        parts.push(b.kaimoku.map(function (k) { return k.kumiban + '(' + yen(k.kingaku) + ')'; }).join(' '));
      }
      parts.push('計 ' + yen(b.kingaku));
      if (b.status === '的中') { parts.push('払戻 ' + yen(b.payout)); }
      l2.textContent = parts.join('　');
    }
    row.appendChild(l2);
    body.appendChild(row);
  });
  if (!mine.length) { body.appendChild(el('p', 'mini-note', kanriPeriodLabel() + 'の記録はありません')); }
}

// ---- 結果取込（デモ）----
function doImportResults() {
  // 演出用: 取込前に「結果待ち」だった記録を控える（データには触れない）
  var before = {};
  Storage.listBets({}).forEach(function (b) {
    if (b.status === '結果待ち') { before[b.id] = true; }
  });

  var n = Storage.importResults();

  if (n.hit > 0) {
    Storage.listBets({}).forEach(function (b) {
      if (b.status === '的中' && before[b.id]) { newlyHit[b.id] = true; }
    });
    launchConfetti();
    setTimeout(function () {
      newlyHit = {};
      var flashes = document.querySelectorAll('.hit-flash');
      for (var i = 0; i < flashes.length; i++) {
        if (flashes[i].parentNode) { flashes[i].parentNode.removeChild(flashes[i]); }
      }
    }, 2400);
  }

  toast('結果を取り込みました（単勝: 的中' + n.hit + '・外れ' + n.miss
    + (n.pending ? '／他券種' + n.pending + '件は本番で自動突合' : '') + '）');
  renderAll();
}

// ---- 利用者切替（デモ用。本番＝realModeでは無効化し、ログイン中メアドの確認だけ出す）----
function switchUser() {
  if (Storage.realMode) {
    var mail = (typeof Storage.getCurrentEmail === 'function' && Storage.getCurrentEmail()) || '';
    toast('ログイン中: ' + mail);
    return;
  }
  var users = Storage.getUsers();
  var cur = Storage.getCurrentUser();
  var ix = 0;
  users.forEach(function (x, i) { if (x.id === cur.id) { ix = i; } });
  var next = users[(ix + 1) % users.length];
  Storage.setCurrentUser(next.id);
  toast(next.name + (next.role === 'admin' ? '（管理者）' : '（一般）') + ' に切り替えました');
  // 入力途中の画面は初期化（他人の入力に混ざらないように）
  S.inputView = 'race';
  S.race = null;
  S.kaikata = null;
  S.kaimoku = null;
  S.kingaku = null;
  S.tenji = null;
  renderAll();
}

// ---- iPhone Safari 初回案内（PWA: 共有→ホーム画面に追加）----
function maybeShowIosHint() {
  var ua = navigator.userAgent;
  var isIos = /iPhone|iPad|iPod/.test(ua);
  var standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  if (isIos && !standalone && !Storage.getFlag('ios_hint_shown')) {
    $('ios-hint').classList.remove('hidden');
  }
}

// =====================================================================
// 起動
// =====================================================================
function init() {
  var tabs = document.querySelectorAll('.tabbar button');
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener('click', function () {
      S.tab = this.dataset.tab;
      if (S.tab === 'input') { S.inputView = S.race ? 'bet' : 'race'; }
      renderAll();
      window.scrollTo(0, 0);
    });
  }

  $('user-switch').addEventListener('click', switchUser);
  $('btn-nyuryoku').addEventListener('click', function () {
    S.tab = 'input'; S.inputView = 'race'; S.race = null; renderAll(); window.scrollTo(0, 0);
  });
  $('btn-import-home').addEventListener('click', doImportResults);
  $('btn-import-kiroku').addEventListener('click', doImportResults);
  $('bet-back').addEventListener('click', function () {
    S.inputView = 'race'; S.race = null; S.kaikata = null; S.kaimoku = null;
    S.kingaku = null; S.tenji = null; renderAll();
  });
  $('bet-submit').addEventListener('click', submitBet);
  $('btn-tenji').addEventListener('click', openTenjiModal);
  $('tenji-skip').addEventListener('click', closeTenjiModal);
  $('tenji-apply').addEventListener('click', applyTenji);
  $('btn-outside').addEventListener('click', openOutsideModal);
  $('outside-close').addEventListener('click', function () { $('outside-modal').classList.add('hidden'); });
  $('kingaku-custom').addEventListener('input', function () {
    // 自由入力の金額もチェック中の全買い目へ一括適用（プリセットと同じ扱い）。
    // この欄は #bet-body の外なので renderBetScreen してもフォーカスは飛ばない
    if (!S.kaimoku) { return; }
    var v = parseInt(this.value, 10);
    var kin = (v > 0) ? v : 0;
    S.kingaku = null;
    for (var i = 0; i < S.kaimoku.length; i++) {
      if (S.kaimoku[i].checked) { S.kaimoku[i].kingaku = kin; }
    }
    renderBetScreen();
  });
  $('ios-hint-close').addEventListener('click', function () {
    Storage.setFlag('ios_hint_shown', true);
    $('ios-hint').classList.add('hidden');
  });

  // 画面G: 管理の期間・ビュー切替と個人詳細の戻る
  var kanriPeriodBtns = document.querySelectorAll('#kanri-period button');
  for (var kp = 0; kp < kanriPeriodBtns.length; kp++) {
    kanriPeriodBtns[kp].addEventListener('click', function () {
      S.kanri.period = this.dataset.period;
      renderKanri();
    });
  }
  var kanriViewBtns = document.querySelectorAll('#kanri-view button');
  for (var kv = 0; kv < kanriViewBtns.length; kv++) {
    kanriViewBtns[kv].addEventListener('click', function () {
      S.kanri.view = this.dataset.view;
      S.kanri.kojinId = null;
      renderKanri();
    });
  }
  $('kanri-kojin-back').addEventListener('click', function () {
    S.kanri.kojinId = null;
    renderKanri();
    window.scrollTo(0, 0);
  });
  $('btn-demo-reset').addEventListener('click', function () {
    var self = this;
    if (self.dataset.armed === '1') {
      Storage.resetAll();
      S.tab = 'home'; S.inputView = 'race'; S.race = null;
      S.kaikata = null; S.kaimoku = null; S.kingaku = null; S.tenji = null;
      self.dataset.armed = '';
      self.classList.remove('armed');
      self.textContent = 'デモ記録を初期化';
      toast('全員の記録を初期化しました');
      renderAll();
      return;
    }
    self.dataset.armed = '1';
    self.classList.add('armed');
    self.textContent = 'もう一度タップで全記録を初期化';
    setTimeout(function () {
      if (self.dataset.armed === '1') {
        self.dataset.armed = '';
        self.classList.remove('armed');
        self.textContent = 'デモ記録を初期化';
      }
    }, 5000);
  });

  // 固定注意書き（全画面に常設）
  var notices = document.querySelectorAll('.notice-text');
  for (var n = 0; n < notices.length; n++) { notices[n].textContent = NOTICE; }

  maybeShowIosHint();
  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
