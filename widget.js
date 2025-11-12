/* global AMOCRM */
(function () {
  // Логгер, чтобы видеть в консоли этапы
  const log = (...a) => console.log('[JK widget]', ...a);

  // Фолбэк: попытка вытащить id сделки из URL
  function getLeadIdFromUrl() {
    try {
      const m = (location.pathname || '').match(/\/leads\/detail\/(\d+)/);
      return m ? Number(m[1]) : undefined;
    } catch { return undefined; }
  }

  // Находим правую колонку (в разных версиях интерфейса путь разный)
  function findSidebar() {
    return (
      document.querySelector('[data-pei="right"]') ||      // новый UI
      document.querySelector('.card-widgets__buttons') ||  // старый UI
      document.querySelector('.js-card-widgets') ||        // очень старый UI
      null
    );
  }

  // Рисуем кнопку один раз
  function ensureButton() {
    if (document.getElementById('jk-open-btn')) return true;

    const sidebar = findSidebar();
    if (!sidebar) return false; // ещё не дорисовался интерфейс карточки

    const btn = document.createElement('button');
    btn.id = 'jk-open-btn';
    btn.textContent = 'Отправить презентацию ЖК';
    btn.className = 'button-input js-button-with-loader';
    btn.style.margin = '8px 0';

    btn.addEventListener('click', function () {
      const leadId =
        (window.AMOCRM &&
          AMOCRM.data &&
          AMOCRM.data.current_card &&
          (AMOCRM.data.current_card.get
            ? AMOCRM.data.current_card.get('id')
            : AMOCRM.data.current_card.id)) ||
        getLeadIdFromUrl();

      log('click, leadId =', leadId);
      window.dispatchEvent(new CustomEvent('jk:open', { detail: { leadId } }));
    });

    sidebar.appendChild(btn);
    log('button added');
    return true;
  }

  // Иногда карточка дорисовывается позже — ждём DOM и наблюдаем изменения
  function mountButtonWithObserver() {
    if (ensureButton()) return; // получилось сразу

    const obs = new MutationObserver(() => {
      if (ensureButton()) obs.disconnect();
    });
    obs.observe(document.body, { childList: true, subtree: true });

    // подстрахуемся таймером на 5 сек
    setTimeout(() => {
      ensureButton();
    }, 5000);
  }

  // Официальная точка входа виджета в amoCRM
  var CustomWidget = function () {
    this.callbacks = {
      init: function () {
        log('init');
        return true;
      },

      render: function () {
        log('render');
        // мы в карточке? — появится кнопка; если нет — просто ничего не случится
        mountButtonWithObserver();
        return true;
      },

      bind_actions: function () { return true; },
      settings: function () { return true; },
      onSave: function () { return true; },
      destroy: function () { return true; },
      advancedSettings: function () { return true; }
    };
    return this;
  };

  if (window.AMOCRM && AMOCRM.widgets) {
    AMOCRM.widgets.add({ code: 'jk', widget: CustomWidget });
    log('registered');
  } else {
    // Если вдруг файл подгрузился на странице без AMOCRM (например, в окне настроек)
    log('AMOCRM not ready yet; will retry');
    const t = setInterval(() => {
      if (window.AMOCRM && AMOCRM.widgets) {
        clearInterval(t);
        AMOCRM.widgets.add({ code: 'jk', widget: CustomWidget });
        log('registered (late)');
      }
    }, 300);
  }
})();
