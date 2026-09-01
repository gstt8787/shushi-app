'use strict';
/*
 * storage.js — データ層（モック版: localStorage実装）
 *
 * 本番版ではこのファイルだけを Supabase 実装（認証＋DB＋行単位権限）に
 * 差し替える。app.js は Storage の公開APIしか呼ばない約束。
 *
 * localStorage のキーは 'boatrace_kiroku_v1' の一つにまとめる。
 */
var Storage = (function () {
  var KEY = 'boatrace_kiroku_v1';

  function defaultData() {
    return {
      version: 1,
      users: [
        { id: 'userA', name: '利用者A', role: 'admin' },  // 管理者
        { id: 'userB', name: '利用者B', role: 'member' }  // 一般
      ],
      current_user: 'userA',
      bets: [],   // { id, user_id, race_date, jcd, race_no, jou_name, kaikata,
                  //   kingaku, status, payout, created_at,
                  //   kaimoku?: [{kumiban, kingaku}] }
                  //   status: 結果待ち / 的中 / 外れ / 見送り
                  //   kaimoku は2026-09-01改良で追加した買い目内訳（的中突合を買い目単位で
                  //   行える形）。旧形式=kaikata+合計kingakuのみの記録には無い（互換で共存）
      tenji: [],  // { bet_id, q1, q2, q3, q4, q5, q6 } 展示チェック票（任意）
      flags: {}   // results_imported / ios_hint_shown など
    };
  }

  var cache = null;

  function load() {
    if (cache) { return cache; }
    try {
      var raw = localStorage.getItem(KEY);
      cache = raw ? JSON.parse(raw) : defaultData();
    } catch (e) {
      cache = defaultData();
    }
    if (!cache.users) { cache = defaultData(); }
    return cache;
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(cache));
    } catch (e) {
      // 保存失敗（容量など）はモックでは握りつぶさず知らせる
      console.error('保存に失敗しました', e);
    }
  }

  // ---- 利用者 ----
  function getUsers() { return load().users.slice(); }

  function getUser(id) {
    var us = load().users;
    for (var i = 0; i < us.length; i++) { if (us[i].id === id) { return us[i]; } }
    return null;
  }

  function getCurrentUser() { return getUser(load().current_user) || load().users[0]; }

  function setCurrentUser(id) {
    if (getUser(id)) { load().current_user = id; save(); }
  }

  // ---- レース（デモ: demo_data.js を前日リストの取込結果とみなす）----
  function getRaces() { return (window.DEMO_RACES || []).slice(); }
  function getResults() { return (window.DEMO_RESULTS || []).slice(); }
  function getDemoDate() { return window.DEMO_DATE || ''; }

  function findResult(raceDate, jcd, raceNo) {
    var rs = getResults();
    for (var i = 0; i < rs.length; i++) {
      var r = rs[i];
      if (r.race_date === raceDate && r.jcd === jcd && r.race_no === raceNo) { return r; }
    }
    return null;
  }

  // ---- 記録（bets） ----
  function addBet(bet, tenjiAnswers) {
    var d = load();
    var id = 'b' + Date.now() + Math.floor(Math.random() * 1000);
    var row = {
      id: id,
      user_id: d.current_user,
      race_date: bet.race_date,
      jcd: bet.jcd,
      race_no: bet.race_no,
      jou_name: bet.jou_name,
      kaikata: bet.kaikata,        // 買い方の短名（例: ２連単2点）
      kingaku: bet.kingaku,        // 購入合計（円）。見送りは0
      status: bet.status,          // 結果待ち / 見送り
      payout: 0,
      created_at: new Date().toISOString()
    };
    // 買い目内訳（新形式）。無い時はフィールド自体を付けない=旧形式と同じ形
    // kumiban表記は表示と同じ（連単系='-'・連複系='='。突合時は'='→'-'正規化でDB表記に一致）
    // 自由買い目行だけ shubetsu / jiyuu が付く（イレギュラー記録。通常行の形は不変）
    if (bet.kaimoku && bet.kaimoku.length) {
      row.kaimoku = bet.kaimoku.map(function (k) {
        var o = { kumiban: String(k.kumiban), kingaku: Number(k.kingaku) || 0 };
        if (k.jiyuu) {
          o.jiyuu = true;
          if (k.shubetsu) { o.shubetsu = String(k.shubetsu); }
        }
        return o;
      });
    }
    d.bets.push(row);
    if (tenjiAnswers) {
      var t = { bet_id: id };
      for (var k in tenjiAnswers) {
        if (Object.prototype.hasOwnProperty.call(tenjiAnswers, k)) { t[k] = tenjiAnswers[k]; }
      }
      d.tenji.push(t);
    }
    save();
    return id;
  }

  function cancelBet(betId) {
    // 入力の取消（当日分のみ・自分の記録のみ・誤入力対応）
    var d = load();
    var today = getDemoDate();
    for (var i = 0; i < d.bets.length; i++) {
      var b = d.bets[i];
      if (b.id === betId) {
        if (b.user_id !== d.current_user) { return { ok: false, msg: '自分の記録のみ取消できます' }; }
        if (b.race_date !== today) { return { ok: false, msg: '取消は当日分のみです' }; }
        d.bets.splice(i, 1);
        d.tenji = d.tenji.filter(function (t) { return t.bet_id !== betId; });
        save();
        return { ok: true };
      }
    }
    return { ok: false, msg: '記録が見つかりません' };
  }

  function listBets(opt) {
    // opt.userId を指定するとその利用者のみ。管理者は指定なし（全員分）も可
    var d = load();
    var out = d.bets.slice();
    if (opt && opt.userId) {
      out = out.filter(function (b) { return b.user_id === opt.userId; });
    }
    out.sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
    return out;
  }

  function getTenji(betId) {
    var ts = load().tenji;
    for (var i = 0; i < ts.length; i++) { if (ts[i].bet_id === betId) { return ts[i]; } }
    return null;
  }

  // ---- 的中の機械突合（モック: 結果取込ボタンで実行）----
  // 買い方8種は組番固定のため本番では全券種を自動判定できる。
  // モックのデモデータは単勝払戻のみ実額を持つので、単勝1点だけ実額で確定し、
  // 他券種は「結果待ち（本番で自動突合）」のままにする。
  function importResults() {
    var d = load();
    var n = { tansho: 0, hit: 0, miss: 0, pending: 0 };
    for (var i = 0; i < d.bets.length; i++) {
      var b = d.bets[i];
      if (b.status !== '結果待ち') { continue; }
      var r = findResult(b.race_date, b.jcd, b.race_no);
      if (!r || !r.has_result) { continue; }
      // 自由買い目を含む記録は組合せが読めないためモックでは確定しない（本番で自動突合）
      var jiyuu = false;
      if (b.kaimoku) {
        for (var jj = 0; jj < b.kaimoku.length; jj++) {
          if (b.kaimoku[jj].jiyuu) { jiyuu = true; break; }
        }
      }
      if (b.kaikata === '単勝1点' && !jiyuu) {
        n.tansho++;
        // 購入額: kaimoku（新形式）があれば「1」の行の金額、無ければ従来どおり合計kingaku
        var tanKin = b.kingaku;
        if (b.kaimoku && b.kaimoku.length) {
          for (var j = 0; j < b.kaimoku.length; j++) {
            if (b.kaimoku[j].kumiban === '1') { tanKin = Number(b.kaimoku[j].kingaku) || 0; break; }
          }
        }
        if (r.chaku1 === 1) {
          b.status = '的中';
          b.payout = Math.round(tanKin * r.tansho_pay / 100);
          n.hit++;
        } else {
          b.status = '外れ';
          b.payout = 0;
          n.miss++;
        }
      } else {
        n.pending++;  // 表示側で「結果待ち（本番で自動突合）」にする
      }
    }
    d.flags.results_imported = true;
    save();
    return n;
  }

  function resultsImported() { return !!load().flags.results_imported; }

  // ---- 集計（表示のたびに再計算）----
  // 収支 = 確定分（的中・外れ）だけで計算。結果待ちは収支に混ぜず別枠（要望対応2026-09-01）
  function summarize(bets) {
    var kounyuu = 0, haraimodoshi = 0, hit = 0, settled = 0, n = 0, miokuri = 0;
    var pendingKin = 0, pendingN = 0;
    for (var i = 0; i < bets.length; i++) {
      var b = bets[i];
      n++;
      if (b.status === '見送り') { miokuri++; continue; }
      if (b.status === '結果待ち') { pendingN++; pendingKin += b.kingaku; continue; }
      kounyuu += b.kingaku;
      haraimodoshi += b.payout || 0;
      if (b.status === '的中') { hit++; settled++; }
      if (b.status === '外れ') { settled++; }
    }
    return {
      n: n,                       // 入力件数（見送り・結果待ち含む）
      miokuri: miokuri,
      kounyuu: kounyuu,           // 確定分の購入
      haraimodoshi: haraimodoshi,
      shushi: haraimodoshi - kounyuu,   // 確定分の収支
      pending_n: pendingN,              // 結果待ち件数
      pending_kingaku: pendingKin,      // 結果待ちの購入額（収支には未算入）
      tekichuritsu: settled > 0 ? (hit / settled) : null,   // 的中÷確定
      kaishuritsu: kounyuu > 0 ? (haraimodoshi / kounyuu) : null  // 払戻÷確定分購入
    };
  }

  // 週の起点は月曜
  function weekStartOf(dateStr) {
    var p = dateStr.split('-');
    var dt = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    var off = (dt.getDay() + 6) % 7;  // 月=0
    dt.setDate(dt.getDate() - off);
    var m = ('0' + (dt.getMonth() + 1)).slice(-2);
    var day = ('0' + dt.getDate()).slice(-2);
    return dt.getFullYear() + '-' + m + '-' + day;
  }

  function addDays(dateStr, days) {
    var p = dateStr.split('-');
    var dt = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    dt.setDate(dt.getDate() + days);
    var m = ('0' + (dt.getMonth() + 1)).slice(-2);
    var day = ('0' + dt.getDate()).slice(-2);
    return dt.getFullYear() + '-' + m + '-' + day;
  }

  function filterToday(bets) {
    var today = getDemoDate();
    return bets.filter(function (b) { return b.race_date === today; });
  }

  function filterWeek(bets) {
    var start = weekStartOf(getDemoDate());
    var end = addDays(start, 6);
    return bets.filter(function (b) { return b.race_date >= start && b.race_date <= end; });
  }

  // ---- フラグ ----
  function getFlag(name) { return load().flags[name]; }
  function setFlag(name, v) { load().flags[name] = v; save(); }

  // ---- デモ用リセット（開発補助・UIには小さく置く）----
  function resetAll() { cache = defaultData(); save(); }

  return {
    getUsers: getUsers,
    getUser: getUser,
    getCurrentUser: getCurrentUser,
    setCurrentUser: setCurrentUser,
    getRaces: getRaces,
    getResults: getResults,
    getDemoDate: getDemoDate,
    findResult: findResult,
    addBet: addBet,
    cancelBet: cancelBet,
    listBets: listBets,
    getTenji: getTenji,
    importResults: importResults,
    resultsImported: resultsImported,
    summarize: summarize,
    weekStartOf: weekStartOf,
    addDays: addDays,
    filterToday: filterToday,
    filterWeek: filterWeek,
    getFlag: getFlag,
    setFlag: setFlag,
    resetAll: resetAll
  };
})();
