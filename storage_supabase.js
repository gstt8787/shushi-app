'use strict';
/*
 * storage_supabase.js — データ層（本番: Supabase実装）
 *
 * 仕組み（同期キャッシュ方式）:
 *   app.js は Storage を「同期API」で呼ぶ約束のまま変えない。
 *   そこで起動時（ログイン後）に見える全データをメモリへ読み込み、
 *   読み取りはキャッシュから同期で返す。書き込みはキャッシュを即時更新し、
 *   裏でSupabaseへ送信する（失敗したら知らせてリロードを促す）。
 *   他の人の入力は「アプリを開き直す」と反映される（記録アプリなので十分）。
 *
 * 誰が何を見られるか＝サーバ側の行単位権限（db/policies_v1.sql）が守る。
 *   ・自分の記録=読み書き可 ／ 管理者=全員分を閲覧可
 *   ・レース情報と結果=ログイン者は閲覧のみ
 *
 * config.js の USE_SUPABASE=false ならこのファイルは何もしない（モックのまま）。
 */
(function () {
  if (typeof APP_CONFIG === 'undefined' || !APP_CONFIG.USE_SUPABASE) { return; }
  if (typeof supabase === 'undefined' || !supabase.createClient) {
    console.error('supabase-js が読み込まれていません');
    return;
  }

  var sb = supabase.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_KEY);

  // ---- メモリ上のキャッシュ（モックの defaultData と同じ形＋races/results） ----
  var C = {
    users: [], bets: [], tenji: [], races: [], results: [],
    current_user: null   // ログイン中の users.id
  };

  function todayLocal() {
    var d = new Date();
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    return d.getFullYear() + '-' + m + '-' + day;
  }

  // 場コード→表示グループ（レース選択画面の組分け札。出典=settings.yamlの鉄板5場/準採用4場）
  var TETSUBAN5_JCD = { '18': 1, '24': 1, '13': 1, '22': 1, '19': 1 };
  function groupOf(jcd) {
    return TETSUBAN5_JCD[jcd] ? '鉄板5場' : '準採用4場';
  }

  // 書き込み失敗＝キャッシュとDBがズレた状態。放置せず知らせて読み直させる
  function writeFailed(e, what) {
    console.error('保存失敗:', what, e);
    alert('保存に失敗しました（' + what + '）。電波を確認して、画面を開き直してください。');
  }

  // ---- 起動時の全読み込み（見える範囲は行単位権限が自動で絞る） ----
  function fetchAll() {
    return Promise.all([
      sb.from('users').select('*'),
      sb.from('bets').select('*').order('created_at', { ascending: false }),
      sb.from('tenji').select('*'),
      sb.from('races').select('*').eq('race_date', todayLocal()),
      sb.from('results').select('*').eq('race_date', todayLocal())
    ]).then(function (rs) {
      for (var i = 0; i < rs.length; i++) {
        if (rs[i].error) { throw rs[i].error; }
      }
      C.users = rs[0].data || [];
      C.bets = rs[1].data || [];
      C.tenji = rs[2].data || [];
      C.races = (rs[3].data || []).map(function (r) {
        r.group = groupOf(r.jcd);   // 組分け札はアプリ側で導出（テーブルには持たない）
        return r;
      });
      C.results = rs[4].data || [];
    });
  }

  // ---- Storage を本番実装で置き換え（公開APIはモックと同形） ----
  Storage = (function () {
    function getUsers() { return C.users.slice(); }

    function getUser(id) {
      for (var i = 0; i < C.users.length; i++) { if (C.users[i].id === id) { return C.users[i]; } }
      return null;
    }

    function getCurrentUser() { return getUser(C.current_user) || { id: null, name: '—', role: 'member' }; }

    function setCurrentUser() { /* 本番はログイン本人で固定（切替なし） */ }

    function getRaces() { return C.races.slice(); }
    function getResults() { return C.results.slice(); }
    function getDemoDate() { return todayLocal(); }

    function findResult(raceDate, jcd, raceNo) {
      for (var i = 0; i < C.results.length; i++) {
        var r = C.results[i];
        if (r.race_date === raceDate && r.jcd === jcd && r.race_no === raceNo) { return r; }
      }
      return null;
    }

    function addBet(bet, tenjiAnswers) {
      var id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
        : 'b' + Date.now() + Math.floor(Math.random() * 100000);
      var row = {
        id: id,
        user_id: C.current_user,
        race_date: bet.race_date,
        jcd: bet.jcd,
        race_no: bet.race_no,
        jou_name: bet.jou_name,
        kaikata: bet.kaikata,
        kingaku: bet.kingaku,
        status: bet.status,
        payout: 0,
        created_at: new Date().toISOString()
      };
      if (bet.kaimoku && bet.kaimoku.length) {
        row.kaimoku = bet.kaimoku.map(function (k) {
          var o = { kumiban: String(k.kumiban), kingaku: Number(k.kingaku) || 0 };
          if (k.jiyuu) { o.jiyuu = true; if (k.shubetsu) { o.shubetsu = String(k.shubetsu); } }
          return o;
        });
      }
      C.bets.unshift(row);
      var t = null;
      if (tenjiAnswers) {
        t = { bet_id: id };
        for (var k in tenjiAnswers) {
          if (Object.prototype.hasOwnProperty.call(tenjiAnswers, k) && tenjiAnswers[k]) { t[k] = tenjiAnswers[k]; }
        }
        C.tenji.push(t);
      }
      sb.from('bets').insert(row).then(function (res) {
        if (res.error) { writeFailed(res.error, '記録の追加'); return; }
        if (t) {
          sb.from('tenji').insert(t).then(function (res2) {
            if (res2.error) { writeFailed(res2.error, '展示チェック票'); }
          });
        }
      });
      return id;
    }

    function cancelBet(betId) {
      var today = todayLocal();
      for (var i = 0; i < C.bets.length; i++) {
        var b = C.bets[i];
        if (b.id === betId) {
          if (b.user_id !== C.current_user) { return { ok: false, msg: '自分の記録のみ取消できます' }; }
          if (b.race_date !== today) { return { ok: false, msg: '取消は当日分のみです' }; }
          C.bets.splice(i, 1);
          C.tenji = C.tenji.filter(function (t) { return t.bet_id !== betId; });
          sb.from('bets').delete().eq('id', betId).then(function (res) {
            if (res.error) { writeFailed(res.error, '取消'); }
          });
          return { ok: true };
        }
      }
      return { ok: false, msg: '記録が見つかりません' };
    }

    function listBets(opt) {
      var out = C.bets.slice();
      if (opt && opt.userId) {
        out = out.filter(function (b) { return b.user_id === opt.userId; });
      }
      out.sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
      return out;
    }

    function getTenji(betId) {
      for (var i = 0; i < C.tenji.length; i++) { if (C.tenji[i].bet_id === betId) { return C.tenji[i]; } }
      return null;
    }

    // 結果突合: キャッシュ済みresultsで単勝を実額確定（モックと同じ判定）。
    // 他券種の自動突合は朝パイプラインのresults拡張（pays）導入後にサーバ側で行う。
    function importResults() {
      var n = { tansho: 0, hit: 0, miss: 0, pending: 0 };
      var changed = [];
      for (var i = 0; i < C.bets.length; i++) {
        var b = C.bets[i];
        if (b.status !== '結果待ち') { continue; }
        if (b.user_id !== C.current_user) { continue; }  // 更新権限は自分の行のみ
        var r = findResult(b.race_date, b.jcd, b.race_no);
        if (!r || !r.has_result) { continue; }
        var jiyuu = false;
        if (b.kaimoku) {
          for (var jj = 0; jj < b.kaimoku.length; jj++) {
            if (b.kaimoku[jj].jiyuu) { jiyuu = true; break; }
          }
        }
        if (b.kaikata === '単勝1点' && !jiyuu) {
          n.tansho++;
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
          changed.push({ id: b.id, status: b.status, payout: b.payout });
        } else {
          n.pending++;
        }
      }
      changed.forEach(function (ch) {
        sb.from('bets').update({ status: ch.status, payout: ch.payout }).eq('id', ch.id)
          .then(function (res) { if (res.error) { writeFailed(res.error, '結果の確定'); } });
      });
      // 次回に備えて最新の結果を裏で読み直す（今回の返り値には影響しない）
      sb.from('results').select('*').eq('race_date', todayLocal()).then(function (res) {
        if (!res.error && res.data) { C.results = res.data; }
      });
      return n;
    }

    function resultsImported() { return true; }

    // ---- 集計・日付（モックと同一の純粋関数） ----
    // 収支 = 確定分（的中・外れ）だけ。結果待ちは別枠（要望対応2026-09-01）
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
        n: n, miokuri: miokuri, kounyuu: kounyuu, haraimodoshi: haraimodoshi,
        shushi: haraimodoshi - kounyuu,
        pending_n: pendingN, pending_kingaku: pendingKin,
        tekichuritsu: settled > 0 ? (hit / settled) : null,
        kaishuritsu: kounyuu > 0 ? (haraimodoshi / kounyuu) : null
      };
    }

    function weekStartOf(dateStr) {
      var p = dateStr.split('-');
      var dt = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
      var off = (dt.getDay() + 6) % 7;
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
      var today = todayLocal();
      return bets.filter(function (b) { return b.race_date === today; });
    }

    function filterWeek(bets) {
      var start = weekStartOf(todayLocal());
      var end = addDays(start, 6);
      return bets.filter(function (b) { return b.race_date >= start && b.race_date <= end; });
    }

    // 端末ごとの表示フラグ（iOSヒント等）は端末内に保存で足りる
    function getFlag(name) {
      try { return JSON.parse(localStorage.getItem('boatrace_flag_' + name)); } catch (e) { return null; }
    }
    function setFlag(name, v) {
      try { localStorage.setItem('boatrace_flag_' + name, JSON.stringify(v)); } catch (e) { /* 容量等 */ }
    }

    function resetAll() {
      alert('本番モードでは初期化できません（全員の記録を守るため）。個別の取消は記録一覧からどうぞ');
    }

    return {
      getUsers: getUsers, getUser: getUser,
      getCurrentUser: getCurrentUser, setCurrentUser: setCurrentUser,
      getRaces: getRaces, getResults: getResults, getDemoDate: getDemoDate,
      findResult: findResult, addBet: addBet, cancelBet: cancelBet,
      listBets: listBets, getTenji: getTenji,
      importResults: importResults, resultsImported: resultsImported,
      summarize: summarize, weekStartOf: weekStartOf, addDays: addDays,
      filterToday: filterToday, filterWeek: filterWeek,
      getFlag: getFlag, setFlag: setFlag, resetAll: resetAll,
      dateLabel: '本日'
    };
  })();

  // ---- ログインの流れ（app.jsのinitより先に登録される読み込み順） ----
  function show(el, on) { if (el) { el.classList.toggle('hidden', !on); } }

  function loginError(msg) {
    var m = document.getElementById('login-msg');
    if (m) { m.textContent = msg; }
  }

  function enterApp() {
    return fetchAll().then(function () {
      var session = null;
      return sb.auth.getSession().then(function (s) {
        session = s.data.session;
        if (!session) { throw new Error('no session'); }
        var me = null;
        for (var i = 0; i < C.users.length; i++) {
          if (C.users[i].auth_id === session.user.id) { me = C.users[i]; break; }
        }
        if (!me) {
          loginError('利用者登録がまだです。管理者に連絡してください（' + session.user.email + '）');
          sb.auth.signOut();
          return false;
        }
        C.current_user = me.id;
        show(document.getElementById('login-screen'), false);
        if (typeof renderAll === 'function') { renderAll(); }
        return true;
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var scr = document.getElementById('login-screen');
    var btn = document.getElementById('login-btn');
    show(scr, true);

    sb.auth.getSession().then(function (s) {
      if (s.data.session) {
        loginError('読み込み中…');
        enterApp().catch(function (e) { console.error(e); loginError('読み込みに失敗しました。開き直してください'); });
      } else {
        loginError('');
      }
    });

    if (btn) {
      btn.addEventListener('click', function () {
        var email = (document.getElementById('login-email').value || '').trim();
        var pass = document.getElementById('login-pass').value || '';
        if (!email || !pass) { loginError('メールとパスワードを入れてください'); return; }
        loginError('確認中…');
        sb.auth.signInWithPassword({ email: email, password: pass }).then(function (res) {
          if (res.error) { loginError('ログインできません: ' + res.error.message); return; }
          enterApp().catch(function (e) { console.error(e); loginError('読み込みに失敗しました。開き直してください'); });
        });
      });
    }
  });
})();
