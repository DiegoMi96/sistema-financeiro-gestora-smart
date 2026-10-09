/*
 * Sincroniza com o banco as chaves de negócio do Comissionamento que antes só
 * viviam no localStorage do navegador (decisão do Diego, 09/10/2026: "as
 * informações têm que ficar no banco pra eu ou qualquer outra pessoa extrair a
 * qualquer momento").
 *
 *  - Shell (index.html, script com data-hydrate): ao abrir, baixa o estado do
 *    servidor (síncrono, ANTES dos iframes carregarem) e grava no localStorage;
 *    chaves que existem aqui mas não no servidor são enviadas (semeia o banco).
 *  - Todas as páginas: todo setItem/removeItem de uma chave da lista vai pro
 *    servidor com debounce. Se falhar, a chave fica em __com_pending e o próximo
 *    carregamento envia o que está local em vez de sobrescrever com o do servidor.
 *  - Sem backend/sem token: segue funcionando só com localStorage, como antes.
 *
 * A lista de chaves TEM que ser igual a ESTADO_CHAVES em
 * backend/app/routers/comissionamento.py.
 */
(function () {
  var API = '/api/comissionamento';
  var KEYS = [
    'gs5_v', 'gs5_m', 'gs5_d', 'gs5_f', 'gs5_r', 'gs5_celulas', 'gs5_celula_aliquotas',
    'dp1_m', 'dp1_pp', 'dp1_projetos', 'dp1_dealers', 'dp1_rules', 'dp1_bl', 'dp1_precos',
    'ind1_m', 'ind1_rules', 'ind1_list',
    'dc1_cfg', 'dc1_ext', 'dc1_m',
    'da1_cfg', 'da1_ext', 'da1_m',
    'go1_cfg', 'go1_ext', 'go1_m',
    'aprovacoes_mes', 'cons_hist_manual', 'imp_clientes_map', 'regras_comissao'
  ];
  var PENDING = '__com_pending';
  var origSet = Storage.prototype.setItem;
  var origRemove = Storage.prototype.removeItem;
  var ls;
  try { ls = window.localStorage; } catch (e) { return; }

  function token() { try { return ls.getItem('token'); } catch (e) { return null; } }
  function synced(k) { return KEYS.indexOf(k) >= 0; }
  function toJson(s) { try { return JSON.parse(s); } catch (e) { return { __raw: s }; } }
  function fromJson(v) { return (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && '__raw' in v) ? v.__raw : JSON.stringify(v); }

  function getPending() { try { return JSON.parse(ls.getItem(PENDING) || '[]'); } catch (e) { return []; } }
  function setPending(list) { try { origSet.call(ls, PENDING, JSON.stringify(list)); } catch (e) {} }
  function addPending(k) { var p = getPending(); if (p.indexOf(k) < 0) { p.push(k); setPending(p); } }
  function donePending(k) { setPending(getPending().filter(function (x) { return x !== k; })); }

  function headers() { return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() }; }

  // ── envio ────────────────────────────────────────────
  var timer = null, running = false;
  function queue(k) {
    addPending(k);
    clearTimeout(timer);
    timer = setTimeout(flush, 1500);
  }
  function flush() {
    if (running || !token()) return;
    var keys = getPending();
    if (!keys.length) return;
    running = true;
    (function next(i) {
      if (i >= keys.length) { running = false; return; }
      var k = keys[i];
      var raw = null;
      try { raw = ls.getItem(k); } catch (e) {}
      var body = {}; body[k] = raw == null ? null : toJson(raw);
      fetch(API + '/estado', { method: 'PUT', headers: headers(), body: JSON.stringify({ itens: body }) })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          donePending(k); next(i + 1);
        })
        .catch(function (e) {
          console.warn('[com_sync] falha ao gravar "' + k + '" no servidor — fica pendente:', e);
          running = false;
          timer = setTimeout(flush, 15000);
        });
    })(0);
  }

  Storage.prototype.setItem = function (k, v) {
    origSet.call(this, k, v);
    if (this === ls && synced(k)) queue(k);
  };
  Storage.prototype.removeItem = function (k) {
    origRemove.call(this, k);
    if (this === ls && synced(k)) queue(k);
  };
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('online', flush);

  // ── hidratação (só o shell) ──────────────────────────
  var me = document.currentScript;
  if (me && me.hasAttribute('data-hydrate') && token()) {
    try {
      var x = new XMLHttpRequest();
      x.open('GET', API + '/estado', false);   // síncrono de propósito: os iframes só começam depois
      x.setRequestHeader('Authorization', 'Bearer ' + token());
      x.send();
      if (x.status === 200) {
        var srv = JSON.parse(x.responseText).itens || {};
        var pend = getPending();
        KEYS.forEach(function (k) {
          if (pend.indexOf(k) >= 0) return;                 // local tem alteração ainda não enviada: local vence
          if (k in srv) { origSet.call(ls, k, fromJson(srv[k])); }
          else if (ls.getItem(k) != null) { addPending(k); } // existe só aqui: semeia o banco
        });
        window.COM_SYNC_STATUS = 'ok';
        setTimeout(flush, 500);
      } else { window.COM_SYNC_STATUS = 'erro ' + x.status; }
    } catch (e) { window.COM_SYNC_STATUS = 'offline'; console.warn('[com_sync] hidratação falhou — usando só o localStorage', e); }
  }
  window.COM_SYNC = { flush: flush, pending: getPending, keys: KEYS };
})();
