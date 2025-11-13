// ======================================================
// 1. DEMO-ДАННЫЕ (вместо загрузки из amoCRM)
// ======================================================

const DEMO_APARTMENTS = [
  {
    id: 1,
    complex: 'ЖК Солнечный',
    building: '1',
    floor: 5,
    rooms: 1,
    area: 32,
    total_price: 4_500_000,
    status: 'В продаже',
    plan_url: '',
    presentation_url: '',
  },
  {
    id: 2,
    complex: 'ЖК Солнечный',
    building: '1',
    floor: 5,
    rooms: 2,
    area: 48,
    total_price: 6_200_000,
    status: 'Бронь',
    plan_url: '',
    presentation_url: '',
  },
  {
    id: 3,
    complex: 'ЖК Северный',
    building: '2',
    floor: 10,
    rooms: 3,
    area: 75,
    total_price: 9_500_000,
    status: 'Продано',
    plan_url: '',
    presentation_url: '',
  },
  {
    id: 4,
    complex: 'ЖК Северный',
    building: '2',
    floor: 7,
    rooms: 2,
    area: 55,
    total_price: 7_300_000,
    status: 'В продаже',
    plan_url: '',
    presentation_url: '',
  }
];


const DEMO_LEAD = {
  custom_fields_values: [
    { field_code: "cf_preferred_rooms", values: [{ value: 2 }] },   
    { field_code: "cf_client_budget",   values: [{ value: 7000000 }] } 
  ]
};


async function loadApartmentsFromProducts() {
  return DEMO_APARTMENTS;
}


// автофильтры из "сделки" (для демо используем DEMO_LEAD)
function extractLeadAutoFilters(lead) {
  if (!lead) return { district: undefined, rooms: undefined, budget: undefined };

  const getCF = (code) =>
    (lead.custom_fields_values || []).find(
      f => f.field_code === code || f.field_name === code
    )?.values?.[0]?.value;

  const district = getCF('cf_preferred_district');
  const rooms   = Number(getCF('cf_preferred_rooms') || 0) || undefined;
  const budget  = Number(getCF('cf_client_budget')   || 0) || undefined;

  return { district, rooms, budget };
}


function withinBudget(total, budget) {
  if (!budget) return true; // если бюджета нет — не фильтруем
  return total >= budget * 0.85 && total <= budget * 1.15;
}



function statusClass(status) {
  switch ((status || '').toLowerCase()) {
    case 'в продаже': return 'ForSale';
    case 'бронь': return 'Reserved';
    case 'продано': return 'Sold';
    default: return 'ForSale';
  }
}

// простой шаблонизатор {{a.b.c}} + зачистка пустых строк
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


const contactName = "Иван Иванов";
const userName = "Менеджер";

// DOM элементы
const modal = document.getElementById("modal");
const backdrop = document.getElementById("modal-backdrop");
const step1 = document.getElementById("step-1");
const step2 = document.getElementById("step-2");


window.__lastSelected = null;
window.__DATA__ = null;



document.getElementById("open-widget").addEventListener("click", async () => {
  modal.style.display = "block";
  backdrop.style.display = "block";

  try {
    // грузим демо-квартиры
    const apts = await loadApartmentsFromProducts();

    // список ЖК
    const complexes = Array.from(new Set(apts.map(a => a.complex).filter(Boolean))).sort();

    // автофильтры 
    const auto = extractLeadAutoFilters(DEMO_LEAD);

    // rooms + бюджет 
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
    alert('Ошибка загрузки данных. Для демо используем статичный список квартир.');
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

// ======================================================
// 5. Закрытие модалки и переходы между шагами
// ======================================================

document.querySelectorAll(".close-modal")
  .forEach(btn => btn.addEventListener("click", closeModal));

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

// ======================================================
// 6. Мини-шахматка
// ======================================================

function renderGrid(apts){
  const grid = document.getElementById("grid");
  grid.innerHTML = "";

  if (!apts.length) {
    grid.innerHTML = '<div class="empty-state">Нет квартир для отображения.</div>';
    return;
  }

  const floors = [...new Set(apts.map(a => a.floor).filter(f => Number.isFinite(f)))]
    .sort((a, b) => b - a); // сверху — верхние этажи

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

// ======================================================
// 8. Кнопки отправки (WhatsApp / Telegram / Email / Копировать)
// ======================================================

document.getElementById("copy-text").addEventListener("click", async ()=>{
  const text = document.getElementById("message-text").value;
  try {
    await navigator.clipboard.writeText(text);
    alert("Скопировано!");
  } catch {
    alert("Не удалось скопировать автоматически, скопируйте текст вручную.");
  }
});

document.getElementById("send-whatsapp").addEventListener("click", ()=>{
  const text = encodeURIComponent(document.getElementById("message-text").value);
  window.open(`https://wa.me/?text=${text}`,"_blank");
});

document.getElementById("send-telegram").addEventListener("click", ()=>{
  const text = encodeURIComponent(document.getElementById("message-text").value);
  window.open(`https://t.me/share/url?url=&text=${text}`,"_blank");
});

document.getElementById("send-email").addEventListener("click", ()=>{
  const text = encodeURIComponent(document.getElementById("message-text").value);
  const ctx = window.__lastSelected || {};
  const subjectTpl = 'ЖК {{complex.name}} — предложение по квартире, {{apartment.rooms}} к., {{apartment.area}} м²';
  const subject = renderTemplate(subjectTpl, ctx);
  window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${text}`);
});

// ======================================================
// 9. Фильтры
// ======================================================

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
  if (filtered.length > 0) showApartmentDetail(filtered[0]);
  else document.getElementById('detail-panel').innerHTML =
    '<div class="empty-state">Нет подходящих помещений. Измените фильтры.</div>';
});


