// ==== API и кеш ====
const API_BASE = '/api/v4'; // надёжнее, чем просто '/api/v4'

const CATALOGS = { apartmentsId: 9973 };

const cache = {
  get(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const { val, exp } = JSON.parse(raw);
      if (exp && Date.now() > exp) { localStorage.removeItem(key); return null; }
      return val;
    } catch { return null; }
  },
  set(key, val, ttlMs) {
    localStorage.setItem(key, JSON.stringify({ val, exp: Date.now() + ttlMs }));
  }
};

async function http(url) {
  const res = await fetch(url, { credentials: 'include' }); // важна авторизация amoCRM
  if (!res.ok) throw new Error(`HTTP ${res.status} at ${url}`);
  return res.json();
}

async function getCatalogElements(catalogId, page = 1, limit = 250) {
  const u = new URL(`${API_BASE}/catalogs/${catalogId}/elements`);
  u.searchParams.set('page', String(page));
  u.searchParams.set('limit', String(limit));
  return http(u.toString());
}

// ==== Полезные функции ====
function cf(el, codeOrName) {
  const arr = el.custom_fields_values || [];
  const f = arr.find(x =>
    x.field_code === codeOrName ||
    x.field_name === codeOrName ||
    x.code === codeOrName ||
    x.name === codeOrName
  );
  return f?.values?.[0]?.value ?? undefined;
}

function mapApartmentFromProduct(el) {
  return {
    id: el.id,
    complex: cf(el, 'complex') || '',     // строковое название ЖК
    complex_id: undefined,                // отдельного каталога ЖК нет — оставим undefined
    building: cf(el, 'building'),
    floor: Number(cf(el, 'floor')),
    rooms: Number(cf(el, 'rooms')),
    area: Number(cf(el, 'area')),
    total_price: Number(cf(el, 'total_price') ?? cf(el, 'totalprice') ?? el.price ?? 0),
    status: cf(el, 'status') || 'В продаже',
    plan_url: cf(el, 'plan_url') || cf(el, 'planurl'),
    presentation_url: cf(el, 'presentation_url') || cf(el, 'presentationurl'),
    image: cf(el, 'image'),
  };
}

async function getLead(leadId) {
  if (!leadId) return null;
  try {
    return await http(`${API_BASE}/leads/${leadId}`);
  } catch {
    return null;
  }
}

async function getLeadLinkedProducts(leadId) {
  if (!leadId) return [];
  const u = new URL(`${API_BASE}/leads/${leadId}/links`);
  u.searchParams.set('limit', '250');
  const data = await http(u.toString());
  const links = data?._embedded?.links || [];
  return links
    .filter(l => l.to_entity_type === 'catalog_elements')
    .map(l => l.to_entity_id);
}

// автофильтры из сделки (по ТЗ)
function extractLeadAutoFilters(lead) {
  if (!lead) return { district: undefined, rooms: undefined, budget: undefined };
  const getCF = (code) =>
    (lead.custom_fields_values || []).find(f => f.field_code === code || f.field_name === code)?.values?.[0]?.value;

  const district = getCF('cf_preferred_district');
  const rooms = Number(getCF('cf_preferred_rooms') || 0) || undefined;
  const budget = Number(getCF('cf_client_budget') || 0) || undefined;

  return { district, rooms, budget };
}

function withinBudget(total, budget) {
  if (!budget) return true;
  return total >= budget * 0.85 && total <= budget * 1.15;
}

async function loadApartmentsFromProducts() {
  const cacheKey = 'cache:products_apartments';
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const out = [];
  let page = 1;
  while (true) {
    const res = await getCatalogElements(CATALOGS.apartmentsId, page, 250);
    const items = (res._embedded?.elements || []).map(mapApartmentFromProduct);
    out.push(...items);
    if (!res._links?.next) break;
    page += 1;
  }
  cache.set(cacheKey, out, 30 * 60 * 1000); // 30 минут
  return out;
}

// ==== Шаблонизатор и утилиты UI ====
function statusClass(status) {
  switch ((status || '').toLowerCase()) {
    case 'в продаже': return 'ForSale';
    case 'бронь': return 'Reserved';
    case 'продано': return 'Sold';
    default: return 'ForSale';
  }
}

function renderTemplate(tpl, ctx) {
  const out = tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const val = path.split('.').reduce((acc, p) => (acc ? acc[p] : undefined), ctx);
    return (val === undefined || val === null) ? '' : String(val);
  });
  return out
    .split('\n')
    .map(line => line.trimRight())
    .filter(line => line.trim().length > 0)
    .join('\n');
}

// ==== Глобальные ====
let amoData = {};
window.amocrmWidgets = window.amocrmWidgets || {};
amocrmWidgets.zhkwidget = {
  init: function (params) {
    amoData = params;
    console.log("Виджет запущен", amoData);
    const leadId = amoData.entity_id;
    console.log("Текущая сделка:", leadId);
  }
};

// Заглушки для ТЗ (контакт/менеджер)
const contactName = "Иван Иванов";
const userName = "Менеджер";

// DOM
const modal = document.getElementById("modal");
const backdrop = document.getElementById("modal-backdrop");
const step1 = document.getElementById("step-1");
const step2 = document.getElementById("step-2");

// ==== Открытие модалки ====
document.getElementById("open-widget").addEventListener("click", async () => {
  modal.style.display = "block";
  backdrop.style.display = "block";

  try {
    const leadId = window.CURRENT_LEAD_ID || amoData?.entity_id;
    const [apts, lead, linkedIds] = await Promise.all([
      loadApartmentsFromProducts(),
      getLead(leadId),
      getLeadLinkedProducts(leadId)
    ]);

    // приоритизируем связанные с сделкой элементы
    if (linkedIds?.length) {
      apts.sort(
        (a, b) =>
          (linkedIds.includes(a.id) ? -1 : 0) - (linkedIds.includes(b.id) ? -1 : 0)
      );
    }

    // список ЖК из строкового поля complex
    const complexes = Array.from(new Set(apts.map(a => a.complex).filter(Boolean))).sort();

    // автофильтры
    const auto = extractLeadAutoFilters(lead);

    // rooms + бюджет ±15%
    let filtered = apts.filter(a => {
      const okRooms = auto.rooms ? (Number(a.rooms) === Number(auto.rooms)) : true;
      const okBudget = withinBudget(Number(a.total_price || 0), auto.budget);
      return okRooms && okBudget;
    });

    populateComplexDropdownFromList(complexes);
    renderGrid(filtered);

    step1.style.display = "block";
    step2.style.display = "none";

    if (filtered.length > 0) {
      showApartmentDetail(filtered[0]);
    } else {
      document.getElementById('detail-panel').innerHTML =
        '<div class="empty-state">Нет подходящих помещений. Измените фильтры.</div>';
    }

    window.__DATA__ = { apts, complexes, auto };
  } catch (e) {
    console.error(e);
    alert('Ошибка загрузки данных из каталога. Проверьте права доступа и ID каталога (9973).');
  }
});

function populateComplexDropdownFromList(complexNames){
  const select = document.getElementById("filter-complex");
  select.innerHTML = '<option value="">Все</option>';
  complexNames.forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
}

// ==== Закрытие/переходы ====
document.querySelectorAll(".close-modal").forEach(btn => btn.addEventListener("click", closeModal));
backdrop.addEventListener("click", closeModal);
function closeModal() {
  modal.style.display = "none";
  backdrop.style.display = "none";
}

document.getElementById("next-step").addEventListener("click", ()=>{
  step1.style.display = "none";
  step2.style.display = "block";
});
document.getElementById("back-step").addEventListener("click", ()=>{
  step2.style.display = "none";
  step1.style.display = "block";
});

// ==== Мини-шахматка ====
function renderGrid(apts){
  const grid = document.getElementById("grid");
  grid.innerHTML = "";

  const floors = [...new Set(apts.map(a => a.floor).filter(f => Number.isFinite(f)))].sort((a, b) => b - a);

  floors.forEach(floor => {
    const row = document.createElement("div");
    row.className = "floor-row";

    const label = document.createElement("div");
    label.style.minWidth = "50px";
    label.style.display = "flex";
    label.style.alignItems = "center";
    label.style.justifyContent = "center";
    label.style.fontWeight = "bold";
    label.textContent = floor;
    row.appendChild(label);

    const onThisFloor = apts.filter(a => a.floor === floor);

    onThisFloor.forEach(a => {
      const cell = document.createElement("button");
      cell.className = `cell status-${statusClass(a.status)}`;
      cell.title = `${a.rooms}к · ${a.area} м² · ${(a.total_price ?? 0).toLocaleString?.() || a.total_price} ₽`;
      cell.innerHTML = `
        <div class="cell-top"><span class="badge">${a.status || ''}</span></div>
        <div class="cell-main"><strong>${a.rooms}к</strong> · ${a.area} м²</div>
        <div class="cell-price">${(a.total_price ?? 0).toLocaleString?.() || a.total_price} ₽</div>
      `;
      cell.addEventListener("click", () => {
        showApartmentDetail(a);
        step1.style.display = "none";
        step2.style.display = "block";
      });
      row.appendChild(cell);
    });

    grid.appendChild(row);
  });
}

// ==== Детальная карточка и сообщение ====
function showApartmentDetail(a){
  const panel = document.getElementById("detail-panel");
  panel.innerHTML = `
    <h3>${a.complex || '—'}, корп. ${a.building ?? '—'}, этаж ${a.floor ?? '—'}</h3>
    <p>${a.rooms ?? '—'} к., ${a.area ?? '—'} м², ${(a.total_price ?? 0).toLocaleString?.() || a.total_price} ₽</p>
    <p>Статус: ${a.status || '—'}</p>
    <p>
      ${a.plan_url ? `<a target="_blank" href="${a.plan_url}">Открыть планировку</a>` : ''}
      ${a.presentation_url ? ` · <a target="_blank" href="${a.presentation_url}">Презентация ЖК</a>` : ''}
    </p>
  `;

  // Кнопка "Смотреть PDF" (если планировка — pdf)
  if (a.plan_url && /\.pdf(\?|$)/i.test(a.plan_url)) {
    const btn = document.createElement('button');
    btn.textContent = 'Смотреть PDF';
    btn.style.marginTop = '6px';
    btn.addEventListener('click', () => {
      let box = document.getElementById('pdf-preview');
      if (!box) {
        box = document.createElement('div');
        box.id = 'pdf-preview';
        box.style.marginTop = '8px';
        box.innerHTML = `<iframe src="${a.plan_url}" style="width:100%;height:400px;border:1px solid #ccc;border-radius:6px;"></iframe>`;
        panel.appendChild(box);
      } else {
        box.remove();
      }
    });
    panel.appendChild(btn);
  }

  const template = `Здравствуйте, {{contact.name}}!
Предлагаем рассмотреть квартиру в ЖК "{{apartment.complex}}" (), корпус {{apartment.building}}, этаж {{apartment.floor}}.
Параметры: {{apartment.rooms}}-комн., {{apartment.area}} м², ориентир. цена — {{apartment.total_price}} ₽.
Планировка: {{apartment.plan_url}}
Презентация ЖК: {{apartment.presentation_url}}
Если подходит по бюджету, обсудим детали.
С уважением, {{user.name}}.`;

  const ctx = {
    contact: { name: contactName },
    user: { name: userName },
    complex: { name: a.complex || '', district: '' },
    apartment: a
  };

  document.getElementById("message-text").value = renderTemplate(template, ctx);

  window.__lastSelected = {
    complex: { name: a.complex || '', district: '' },
    apartment: a,
    contact: ctx.contact,
    user: ctx.user
  };
}

// ==== Примечание в таймлайне ====
async function tryCreateNote(channel, lot) {
  const leadId = window.CURRENT_LEAD_ID || amoData?.entity_id;
  if (!leadId) return;

  const text = `Отправлена презентация по квартире (ЖК "${lot.complex || '—'}", корп. ${lot.building ?? '—'}, этаж ${lot.floor ?? '—'}) через ${channel}.`;

  try {
    const body = [{
      note_type: "common",
      params: { text }
    }];

    const res = await fetch(`${API_BASE}/leads/${leadId}/notes`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error(`Notes HTTP ${res.status}`);
    console.log('Примечание создано');
  } catch (e) {
    console.warn('Не удалось создать примечание фронтом:', e);
    try {
      await navigator.clipboard.writeText(text);
      alert('Не удалось создать примечание автоматически. Текст скопирован в буфер — вставьте в таймлайн сделки.');
    } catch {
      alert('Не удалось создать примечание. Скопируйте вручную:\n\n' + text);
    }
  }
}

// ==== Кнопки действий ====
document.getElementById("copy-text").addEventListener("click", async ()=>{
  const text=document.getElementById("message-text").value;
  await navigator.clipboard.writeText(text);
  alert("Скопировано!");
  if (window.__lastSelected?.apartment) await tryCreateNote('Копирование', window.__lastSelected.apartment);
});

document.getElementById("send-whatsapp").addEventListener("click", async ()=>{
  const text=encodeURIComponent(document.getElementById("message-text").value);
  window.open(`https://wa.me/?text=${text}`,"_blank");
  if (window.__lastSelected?.apartment) await tryCreateNote('WhatsApp', window.__lastSelected.apartment);
});

document.getElementById("send-telegram").addEventListener("click", async ()=>{
  const text=encodeURIComponent(document.getElementById("message-text").value);
  window.open(`https://t.me/share/url?url=&text=${text}`,"_blank");
  if (window.__lastSelected?.apartment) await tryCreateNote('Telegram', window.__lastSelected.apartment);
});

document.getElementById("send-email").addEventListener("click", async ()=>{
  const text = encodeURIComponent(document.getElementById("message-text").value);
  const ctx = window.__lastSelected || {};
  const subjectTpl = 'ЖК {{complex.name}} — предложение по квартире, {{apartment.rooms}} к., {{apartment.area}} м²';
  const subject = renderTemplate(subjectTpl, ctx);
  window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${text}`);
  if (window.__lastSelected?.apartment) await tryCreateNote('Email', window.__lastSelected.apartment);
});

// Быстрая кнопка «В продаже»
const btnOnSale = document.getElementById("filter-onsale");
if (btnOnSale) {
  btnOnSale.addEventListener("click", () => {
    document.getElementById("filter-status").value = "В продаже";
    document.getElementById("apply-filters").click();
  });
}

// Применить фильтры
document.getElementById("apply-filters").addEventListener("click", ()=>{
  const data = window.__DATA__;
  if (!data) return;

  let filtered = [...data.apts];
  const complexName = document.getElementById("filter-complex").value;
  const building = document.getElementById("filter-building").value.trim();
  const floor = document.getElementById("filter-floor").value;
  const rooms = document.getElementById("filter-rooms").value;
  const status = document.getElementById("filter-status").value;
  const minPrice = parseFloat(document.getElementById("filter-min-price").value) || 0;
  const maxPrice = parseFloat(document.getElementById("filter-max-price").value) || Infinity;

  if (complexName) filtered = filtered.filter(a => (a.complex || '') === complexName);
  if (building) filtered = filtered.filter(a => String(a.building || '').toLowerCase() === building.toLowerCase());
  if (floor) filtered = filtered.filter(a => Number(a.floor) === Number(floor));
  if (rooms) filtered = filtered.filter(a => Number(a.rooms) === Number(rooms));
  if (status) filtered = filtered.filter(a => (a.status || '').toLowerCase() === status.toLowerCase());
  filtered = filtered.filter(a => (a.total_price || 0) >= minPrice && (a.total_price || 0) <= maxPrice);

  renderGrid(filtered);
  if (filtered.length>0) showApartmentDetail(filtered[0]);
  else document.getElementById('detail-panel').innerHTML =
    '<div class="empty-state">Нет подходящих помещений. Измените фильтры.</div>';
});

// Событие открытия из кнопки в карточке сделки (widget.js)
window.addEventListener('jk:open', (e) => {
  if (e && e.detail && e.detail.leadId) {
    window.CURRENT_LEAD_ID = e.detail.leadId;
  }
  document.getElementById("open-widget").click();
});
