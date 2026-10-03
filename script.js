'use strict';

/* =====================================================
   KONFIGURASI: tempel URL Web App Apps Script (berakhiran /exec)
   ===================================================== */
var API_URL = 'PASTE_URL_WEB_APP_APPS_SCRIPT_DI_SINI';
/* ===================================================== */

var PIN_KEY = 'kasir_pin';

var S = {
  menu: [], katM: [], katK: [],
  qty: {},
  filter: 'belum',
  orders: [],
  jenis: 'Pemasukan',
  sumber: '',
  tab: 'order',
  busy: 0,
  pin: ''
};

/* ---------- Helper ---------- */
var $ = function (id) { return document.getElementById(id); };

function el(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function rp(n) {
  n = Math.round(n || 0);
  var s = new Intl.NumberFormat('id-ID').format(Math.abs(n));
  return (n < 0 ? '−Rp ' : 'Rp ') + s;
}

function toast(msg, err) {
  var t = $('toast');
  t.textContent = msg;
  t.className = 'show' + (err ? ' err' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { t.className = ''; }, 2800);
}

function loadPin() { try { return localStorage.getItem(PIN_KEY) || ''; } catch (e) { return ''; } }
function savePin(p) {
  try { if (p) localStorage.setItem(PIN_KEY, p); else localStorage.removeItem(PIN_KEY); } catch (e) {}
}

/* ---------- Panggilan ke Apps Script ----------
   Body dikirim sebagai teks biasa (tanpa header Content-Type) supaya browser
   tidak melakukan preflight CORS, yang tidak didukung Apps Script. */
async function api(action, payload) {
  var body = Object.assign({ action: action, pin: S.pin }, payload || {});
  var res;
  S.busy++;
  try {
    res = await fetch(API_URL, { method: 'POST', body: JSON.stringify(body) });
  } catch (e) {
    throw new Error('Tidak bisa terhubung ke server. Cek internet lalu coba lagi.');
  } finally {
    S.busy--;
  }
  var j;
  try {
    j = await res.json();
  } catch (e) {
    throw new Error('Balasan server tidak terbaca. Pastikan deployment Apps Script diatur "Anyone" dan memakai versi terbaru.');
  }
  if (!j.ok) {
    var err = new Error(j.error || 'Terjadi kesalahan.');
    err.code = j.code;
    throw err;
  }
  return j.data;
}

/* ---------- Tab ---------- */
function showTab(t) {
  S.tab = t;
  document.querySelectorAll('.tab').forEach(function (s) { s.classList.toggle('active', s.id === 't-' + t); });
  document.querySelectorAll('#nav button').forEach(function (b) { b.classList.toggle('on', b.dataset.t === t); });
  window.scrollTo(0, 0);
  if (t === 'antrian') loadOrders();
  if (t === 'dash') loadDash();
}
$('nav').addEventListener('click', function (e) {
  var b = e.target.closest('button');
  if (b) showTab(b.dataset.t);
});

/* ---------- Order ---------- */
function renderMenu() {
  var box = $('menuList');
  box.innerHTML = '';
  if (!S.menu.length) {
    box.appendChild(el('p', 'empty', 'Menu masih kosong. Isi tab "Menu" di Google Sheet.'));
    return;
  }
  S.menu.forEach(function (m) {
    var row = el('div', 'menu-row');
    var info = el('div');
    info.appendChild(el('div', 'menu-name', m.nama));
    info.appendChild(el('div', 'menu-price', rp(m.harga)));

    var st = el('div', 'stepper');
    var minus = el('button', null, '−');
    var plus = el('button', null, '+');
    var out = document.createElement('output');
    minus.type = plus.type = 'button';
    minus.setAttribute('aria-label', 'Kurangi ' + m.nama);
    plus.setAttribute('aria-label', 'Tambah ' + m.nama);

    function paint() {
      var q = S.qty[m.nama] || 0;
      out.textContent = q;
      row.classList.toggle('picked', q > 0);
      updateCart();
    }
    minus.onclick = function () { S.qty[m.nama] = Math.max(0, (S.qty[m.nama] || 0) - 1); paint(); };
    plus.onclick = function () { S.qty[m.nama] = (S.qty[m.nama] || 0) + 1; paint(); };

    st.appendChild(minus); st.appendChild(out); st.appendChild(plus);
    row.appendChild(info); row.appendChild(st);
    box.appendChild(row);
    out.textContent = S.qty[m.nama] || 0;
    row.classList.toggle('picked', (S.qty[m.nama] || 0) > 0);
  });
  updateCart();
}

function updateCart() {
  var total = 0, count = 0;
  S.menu.forEach(function (m) {
    var q = S.qty[m.nama] || 0;
    total += q * m.harga;
    count += q;
  });
  $('total').textContent = rp(total);
  $('cartCount').textContent = count ? count + ' item' : 'Belum ada item';
  $('btnOrder').disabled = count === 0;
}

$('btnOrder').addEventListener('click', async function () {
  var nama = $('nama').value.trim();
  var items = S.menu
    .filter(function (m) { return (S.qty[m.nama] || 0) > 0; })
    .map(function (m) { return { menu: m.nama, qty: S.qty[m.nama] }; });

  if (!nama) { toast('Isi nama pemesan dulu.', true); $('nama').focus(); return; }
  if (!items.length) { toast('Pilih minimal satu menu.', true); return; }

  var b = $('btnOrder');
  b.disabled = true;
  b.textContent = 'Menyimpan...';
  try {
    var r = await api('addOrder', { nama: nama, items: items, catatan: $('catatan').value });
    toast('Order ' + r.id + ' disimpan (' + rp(r.total) + ').');
    $('nama').value = '';
    $('catatan').value = '';
    S.qty = {};
    renderMenu();
    loadOrders(true);
  } catch (e) {
    toast(e.message, true);
  } finally {
    b.textContent = 'Simpan order';
    updateCart();
  }
});

/* ---------- Antrian ---------- */
async function loadOrders(silent) {
  try {
    S.orders = await api('getOrders');
    renderOrders();
  } catch (e) {
    if (e.code === 'AUTH') return showLogin();
    if (!silent) toast(e.message, true);
  }
}

function renderOrders() {
  var belum = S.orders.filter(function (o) { return !o.selesai; }).length;
  var selesai = S.orders.length - belum;
  $('cBelum').textContent = belum;
  $('cSelesai').textContent = selesai;
  $('cSemua').textContent = S.orders.length;
  var bd = $('badge');
  bd.textContent = belum;
  bd.classList.toggle('hide', belum === 0);

  var box = $('orderList');
  box.innerHTML = '';
  var list = S.orders.filter(function (o) {
    return S.filter === 'semua' || (S.filter === 'belum' ? !o.selesai : o.selesai);
  });
  if (!list.length) {
    box.appendChild(el('p', 'empty', S.filter === 'belum'
      ? 'Semua order sudah selesai.'
      : 'Belum ada order di daftar ini.'));
    return;
  }

  list.forEach(function (o) {
    var c = el('article', 'ticket' + (o.selesai ? ' done' : ''));

    var head = el('div', 't-head');
    var left = el('div');
    left.appendChild(el('h3', 't-who', o.nama));
    var meta = el('div', 't-meta');
    meta.appendChild(el('span', null, o.id));
    meta.appendChild(el('span', null, 'Masuk ' + o.waktu));
    left.appendChild(meta);
    head.appendChild(left);
    head.appendChild(el('strong', 't-total', rp(o.total)));
    c.appendChild(head);

    var ul = el('ul', 't-items');
    if (o.items && o.items.length) {
      o.items.forEach(function (i) { ul.appendChild(el('li', null, i.qty + 'x ' + i.menu)); });
    } else {
      ul.appendChild(el('li', null, o.teks || '-'));
    }
    c.appendChild(ul);
    if (o.catatan) c.appendChild(el('p', 't-note', 'Catatan: ' + o.catatan));

    c.appendChild(el('div', 'tear'));

    var lab = el('label', 'toggle');
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = o.selesai;
    lab.appendChild(cb);
    lab.appendChild(el('span', null, o.selesai
      ? 'Selesai' + (o.waktuSelesai ? ' ' + o.waktuSelesai : '')
      : 'Tandai selesai'));
    cb.addEventListener('change', async function () {
      var want = cb.checked;
      cb.disabled = true;
      try {
        var res = await api('setStatus', { id: o.id, selesai: want });
        o.selesai = want;
        o.waktuSelesai = res.waktuSelesai;
        renderOrders();
      } catch (e) {
        cb.checked = !want;
        cb.disabled = false;
        toast(e.message, true);
      }
    });
    c.appendChild(lab);
    box.appendChild(c);
  });
}

$('filters').addEventListener('click', function (e) {
  var b = e.target.closest('button');
  if (!b) return;
  S.filter = b.dataset.f;
  document.querySelectorAll('#filters button').forEach(function (x) { x.classList.toggle('on', x === b); });
  renderOrders();
});

setInterval(function () {
  if (S.tab === 'antrian' && S.busy === 0 && !document.hidden) loadOrders(true);
}, 20000);

/* ---------- Keuangan ---------- */
function fillKat() {
  var sel = $('kat');
  sel.innerHTML = '';
  (S.jenis === 'Pemasukan' ? S.katM : S.katK).forEach(function (k) {
    var o = el('option', null, k);
    o.value = k;
    sel.appendChild(o);
  });
}

function syncUang() {
  var keluar = S.jenis === 'Pengeluaran';
  $('boxSumber').classList.toggle('hide', !keluar);
  $('boxNama').classList.toggle('hide', !(keluar && S.sumber === 'Pribadi'));
  $('btnUang').textContent = 'Simpan ' + S.jenis.toLowerCase();
  document.querySelectorAll('#segJenis button').forEach(function (b) { b.classList.toggle('on', b.dataset.j === S.jenis); });
  document.querySelectorAll('#segSumber button').forEach(function (b) { b.classList.toggle('on', b.dataset.s === S.sumber); });
}

$('segJenis').addEventListener('click', function (e) {
  var b = e.target.closest('button');
  if (!b) return;
  S.jenis = b.dataset.j;
  fillKat();
  syncUang();
});

$('segSumber').addEventListener('click', function (e) {
  var b = e.target.closest('button');
  if (!b) return;
  S.sumber = b.dataset.s;
  syncUang();
  if (S.sumber === 'Pribadi') $('namaDana').focus();
});

$('jumlah').addEventListener('input', function () {
  var d = this.value.replace(/\D/g, '');
  this.value = d ? new Intl.NumberFormat('id-ID').format(Number(d)) : '';
});

$('btnUang').addEventListener('click', async function () {
  var jumlah = Number($('jumlah').value.replace(/\D/g, ''));
  var d = {
    jenis: S.jenis,
    ket: $('ket').value,
    kat: $('kat').value,
    jumlah: jumlah,
    sumber: S.jenis === 'Pengeluaran' ? S.sumber : '',
    namaDana: $('namaDana').value,
    catatan: $('catatanU').value
  };
  if (!d.ket.trim()) { toast('Isi keterangan dulu.', true); $('ket').focus(); return; }
  if (!(jumlah > 0)) { toast('Isi jumlah lebih dari 0.', true); $('jumlah').focus(); return; }
  if (S.jenis === 'Pengeluaran' && !S.sumber) { toast('Pilih sumber dana: Pribadi atau Dana hasil.', true); return; }
  if (S.jenis === 'Pengeluaran' && S.sumber === 'Pribadi' && !d.namaDana.trim()) {
    toast('Isi nama pemilik dana pribadi.', true); $('namaDana').focus(); return;
  }

  var b = $('btnUang');
  b.disabled = true;
  b.textContent = 'Menyimpan...';
  try {
    await api('addTransaksi', d);
    toast(S.jenis + ' disimpan.');
    $('ket').value = '';
    $('jumlah').value = '';
    $('catatanU').value = '';
    $('namaDana').value = '';
  } catch (e) {
    toast(e.message, true);
  } finally {
    b.disabled = false;
    syncUang();
  }
});

/* ---------- Dashboard ---------- */
function ledger(rows) {
  var box = el('div', 'ledger');
  rows.forEach(function (r) {
    var row = el('div', 'row' + (r.strong ? ' strong' : '') + (r.sep ? ' sep' : ''));
    row.appendChild(el('span', null, r.k));
    row.appendChild(el('span', 'lead'));
    var v = el('b', r.v < 0 ? 'neg' : '', r.text != null ? r.text : rp(r.v));
    row.appendChild(v);
    box.appendChild(row);
  });
  return box;
}

function panel(title) {
  var p = el('section', 'panel');
  p.appendChild(el('h2', null, title));
  return p;
}

function bars(title, rows, opts) {
  opts = opts || {};
  var p = panel(title);
  if (!rows.length) { p.appendChild(el('p', 'muted', 'Belum ada data.')); return p; }
  var max = Math.max.apply(null, rows.map(function (r) { return r.v; })) || 1;
  rows.forEach(function (r) {
    var line = el('div', 'bar');
    var top = el('div', 'bar-top');
    top.appendChild(el('span', null, r.k));
    top.appendChild(el('b', null, opts.fmt ? opts.fmt(r.v) : rp(r.v)));
    var tr = el('div', 'track');
    var f = el('div', 'fill' + (opts.out ? ' out' : ''));
    f.style.width = Math.max(2, r.v / max * 100) + '%';
    tr.appendChild(f);
    line.appendChild(top);
    line.appendChild(tr);
    p.appendChild(line);
  });
  return p;
}

async function loadDash() {
  try {
    renderDash(await api('dashboard'));
  } catch (e) {
    if (e.code === 'AUTH') return showLogin();
    $('dash').innerHTML = '';
    $('dash').appendChild(el('p', 'form-error', e.message));
  }
}

function renderDash(d) {
  var root = $('dash');
  root.innerHTML = '';

  var kas = panel('Ringkasan kas');
  kas.appendChild(ledger([
    { k: 'Pemasukan', v: d.masuk },
    { k: 'Pengeluaran', v: d.keluar },
    { k: 'Laba / (rugi)', v: d.laba, strong: true, sep: true },
    { k: 'Dipakai dari dana hasil', v: d.dh, sep: true },
    { k: 'Dipakai dari dana pribadi', v: d.pr },
    { k: 'Saldo kas', v: d.saldo, strong: true, sep: true }
  ]));
  kas.appendChild(el('p', 'muted', 'Saldo kas = pemasukan dikurangi pengeluaran dari dana hasil. Dana pribadi adalah talangan, tidak mengurangi kas.'));
  root.appendChild(kas);

  var od = panel('Order');
  od.appendChild(ledger([
    { k: 'Total order', v: d.order.total, text: String(d.order.total) },
    { k: 'Belum selesai', v: d.order.belum, text: String(d.order.belum) },
    { k: 'Selesai', v: d.order.selesai, text: String(d.order.selesai) },
    { k: 'Nilai order selesai', v: d.order.nilaiSelesai, strong: true, sep: true }
  ]));
  od.appendChild(el('p', 'muted', 'Nilai order tidak otomatis masuk pemasukan. Catat di tab Keuangan.'));
  root.appendChild(od);

  root.appendChild(bars('Pengeluaran per kategori', d.kK, { out: true }));
  root.appendChild(bars('Pemasukan per kategori', d.kM));
  root.appendChild(bars('Dana pribadi per orang',
    d.pribadi.map(function (p) { return { k: p.k + ' (' + p.n + 'x)', v: p.v }; }), { out: true }));
  root.appendChild(bars('Menu terlaris', d.terlaris, { fmt: function (v) { return v + ' porsi'; } }));

  var hr = panel('Rekap 14 hari terakhir');
  if (!d.hari.length) hr.appendChild(el('p', 'muted', 'Belum ada transaksi.'));
  d.hari.forEach(function (h) {
    var r = el('div', 'day');
    r.appendChild(el('span', null, h.tgl));
    var s = el('span');
    s.appendChild(el('span', 'pos', '+' + rp(h.m)));
    s.appendChild(el('span', 'neg', '−' + rp(h.k)));
    r.appendChild(s);
    hr.appendChild(r);
  });
  root.appendChild(hr);
}

$('btnRefresh').addEventListener('click', loadDash);

/* ---------- PIN ---------- */
function showLogin(msg) {
  $('login').classList.remove('hide');
  var er = $('loginErr');
  er.textContent = msg || '';
  er.classList.toggle('hide', !msg);
  $('pin').value = '';
  $('pin').focus();
}

$('loginForm').addEventListener('submit', async function (e) {
  e.preventDefault();
  var b = $('btnLogin');
  b.disabled = true;
  S.pin = $('pin').value.trim();
  try {
    await api('ping');
    savePin(S.pin);
    $('login').classList.add('hide');
    boot();
  } catch (err) {
    showLogin(err.code === 'AUTH' ? 'PIN salah. Coba lagi.' : err.message);
  } finally {
    b.disabled = false;
  }
});

$('btnKunci').addEventListener('click', function () {
  savePin('');
  S.pin = '';
  location.reload();
});

/* ---------- Mulai ---------- */
async function boot() {
  if (!API_URL || API_URL.indexOf('PASTE_') === 0) {
    $('menuList').innerHTML = '';
    $('menuList').appendChild(el('p', 'form-error', 'API_URL belum diisi. Buka script.js lalu tempel URL web app Apps Script.'));
    return;
  }
  try {
    var d = await api('init');
    S.menu = d.menu;
    S.katM = d.katMasuk;
    S.katK = d.katKeluar;
    $('btnKunci').classList.toggle('hide', !S.pin);
    renderMenu();
    fillKat();
    syncUang();
    loadOrders(true);
  } catch (e) {
    if (e.code === 'AUTH') { showLogin(S.pin ? 'PIN salah. Coba lagi.' : ''); return; }
    $('menuList').innerHTML = '';
    $('menuList').appendChild(el('p', 'form-error', e.message));
  }
}

S.pin = loadPin();
boot();
