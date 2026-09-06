/* =====================================================================
   ร้านเติมเกมกาชา — script.js
   Vanilla JavaScript เท่านั้น ไม่มี jQuery / library ภายนอก
   ทำงานร่วมกับ: products.json, index.html, games.html, order.html,
                 thankyou.html, admin.html
   ===================================================================== */

(function () {
  'use strict';

  /* -------------------------------------------------------------------
     0. CONFIG — ค่าคงที่ส่วนกลาง
     ------------------------------------------------------------------- */
  var CONFIG = {
    PRODUCTS_JSON_PATH: 'products.json',
    // TODO: แทนที่ด้วย URL จริงหลัง deploy Google Apps Script เป็น Web App
    APPS_SCRIPT_URL: '[APPS_SCRIPT_URL]',
    // TODO: แทนที่ด้วย URL export CSV ของ Google Sheet (ใช้ในหน้า admin)
    CSV_URL: '[CSV_URL]',
    SESSION_KEY_SELECTED_ORDER: 'gachaTopup.selectedOrder',
    SESSION_KEY_LAST_ORDER: 'gachaTopup.lastOrder',
    // คำต้องห้าม (เคสไม่สนตัวพิมพ์เล็ก/ใหญ่) ที่ไม่ควรปรากฏใน playerId / note
    FORBIDDEN_WORDS: ['password', 'passwd', 'otp', 'verification code', 'รหัสผ่าน']
  };

  // แผนที่ slug เกม (ใช้กับ URL param บน games.html เช่น ?game=genshin)
  // ต้องตรงกับ prefix ของ "id" ใน products.json
  var GAME_SLUGS = {
    'Genshin Impact': 'genshin',
    'Honkai: Star Rail': 'hsr',
    'Zenless Zone Zero': 'zzz',
    'Wuthering Waves': 'wuwa',
    'Fate/Grand Order': 'fgo',
    'Uma Musume Pretty Derby': 'umamusume',
    'Chaos Zero Nightmare': 'chaoszero',
    'Limbus Company': 'limbus',
    'Blue Archive': 'bluearchive'
  };

  /* -------------------------------------------------------------------
     1. Entry point
     ------------------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', function () {
    initNavToggle();

    if (document.getElementById('game-list')) {
      initGamesPage();
    }
    if (document.getElementById('orderForm')) {
      initOrderPage();
    }
    if (document.getElementById('thankyou-page')) {
      initThankyouPage();
    }
    if (document.getElementById('admin-page')) {
      initAdminPage();
    }
  });

  /**
   * เปิด/ปิดเมนูมือถือ — ใช้ ID: #navbar-toggle, #navbar-mobile-menu
   * (มีในทุกหน้าที่ใช้ .navbar ร่วมกัน)
   */
  function initNavToggle() {
    var toggleBtn = document.getElementById('navbar-toggle');
    var menu = document.getElementById('navbar-mobile-menu');
    if (!toggleBtn || !menu) return;

    toggleBtn.addEventListener('click', function () {
      var isOpen = menu.classList.toggle('is-open');
      toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
      toggleBtn.textContent = isOpen ? '\u2715' : '\u2630';
    });
  }

  /* =====================================================================
     2. Utilities ทั่วไป
     ===================================================================== */

  function formatPrice(price) {
    if (price === null || price === undefined || price === '' || isNaN(Number(price))) {
      return null;
    }
    return '\u0E3F' + Number(price).toLocaleString('th-TH');
  }

  function parsePriceFromFormatted(text) {
    if (!text) return null;
    var digits = String(text).replace(/[^\d.]/g, '');
    if (digits === '') return null;
    var num = Number(digits);
    return isNaN(num) ? null : num;
  }

  function getQueryParams() {
    return new URLSearchParams(window.location.search);
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = String(str === null || str === undefined ? '' : str);
    return div.innerHTML;
  }

  function generateOrderId() {
    var now = new Date();
    function pad(n) { return String(n).padStart(2, '0'); }
    var datePart = String(now.getFullYear()) + pad(now.getMonth() + 1) + pad(now.getDate());
    var timePart = pad(now.getHours()) + pad(now.getMinutes()) + pad(now.getSeconds());
    var randomPart = String(Math.floor(1000 + Math.random() * 9000));
    // หมายเหตุ: orderId นี้ใช้เพื่ออ้างอิงเท่านั้น ไม่ใช่กลไกความปลอดภัย
    // (ห้ามใช้แทนการยืนยันตัวตนหรือสิทธิ์การเข้าถึงข้อมูล)
    return 'ORD-' + datePart + '-' + timePart + '-' + randomPart;
  }

  function containsForbiddenWord(value) {
    if (!value) return false;
    var lower = String(value).toLowerCase();
    return CONFIG.FORBIDDEN_WORDS.some(function (word) {
      return lower.indexOf(word.toLowerCase()) !== -1;
    });
  }

  function showFieldError(inputEl, message) {
    if (!inputEl) return;
    inputEl.classList.add('is-invalid');
    var errorEl = document.getElementById(inputEl.id + '-error');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add('is-visible');
    }
  }

  function clearFieldError(inputEl) {
    if (!inputEl) return;
    inputEl.classList.remove('is-invalid');
    var errorEl = document.getElementById(inputEl.id + '-error');
    if (errorEl) {
      errorEl.textContent = '';
      errorEl.classList.remove('is-visible');
    }
  }

  /**
   * โหลด products.json ผ่าน fetch()
   * คืนค่าเป็น Array ของ product object หรือ null ถ้าเกิดข้อผิดพลาด
   */
  function loadProducts() {
    return fetch(CONFIG.PRODUCTS_JSON_PATH)
      .then(function (res) {
        if (!res.ok) {
          throw new Error('โหลด products.json ไม่สำเร็จ: HTTP ' + res.status);
        }
        return res.json();
      })
      .catch(function (err) {
        console.error('loadProducts error:', err.message);
        return null;
      });
  }

  /* =====================================================================
     3. Games Page (games.html)
     ใช้ ID: #game-list, #game-filter, #package-list
     เพิ่มเติม (ใหม่ — โปรดแจ้งหากต้องการเปลี่ยน):
       #category-filter, #server-filter, #package-section, #package-empty
     ===================================================================== */

  function initGamesPage() {
    var gameListEl = document.getElementById('game-list');
    var gameFilterEl = document.getElementById('game-filter');
    var categoryFilterEl = document.getElementById('category-filter');
    var packageListEl = document.getElementById('package-list');

    var state = {
      allProducts: [],
      games: [],       // รายชื่อเกมที่ไม่ซ้ำกัน พร้อม meta (image, category)
      activeGameName: null,
      activeServer: null
    };

    loadProducts().then(function (products) {
      if (!products) {
        renderLoadError(gameListEl);
        return;
      }
      state.allProducts = products;
      state.games = buildGameSummaries(products);

      renderCategoryFilter(categoryFilterEl, state.games);
      renderGameFilterOptions(gameFilterEl, state.games);
      renderGameList(gameListEl, state.games, null);

      // อ่าน URL parameter เช่น games.html?game=genshin แล้วเลือกให้อัตโนมัติ
      var params = getQueryParams();
      var gameSlugFromUrl = params.get('game');
      if (gameSlugFromUrl) {
        var matched = state.games.find(function (g) {
          return g.slug === gameSlugFromUrl;
        });
        if (matched) {
          selectGame(matched.name);
        }
      }

      if (gameFilterEl) {
        gameFilterEl.addEventListener('change', function () {
          if (gameFilterEl.value) {
            selectGame(gameFilterEl.value);
          } else {
            clearPackageList();
          }
        });
      }

      gameListEl.addEventListener('gacha:selectGame', function (e) {
        selectGame(e.detail.gameName);
      });

      if (categoryFilterEl) {
        categoryFilterEl.addEventListener('change', function () {
          var filtered = categoryFilterEl.value
            ? state.games.filter(function (g) { return g.category === categoryFilterEl.value; })
            : state.games;
          renderGameList(gameListEl, filtered, state.activeGameName);
        });
      }
    });

    function selectGame(gameName) {
      state.activeGameName = gameName;
      state.activeServer = null;
      if (gameFilterEl) gameFilterEl.value = gameName;
      renderGameList(gameListEl, currentVisibleGames(), gameName);
      renderServerAndPackages(gameName);
    }

    function currentVisibleGames() {
      if (!categoryFilterEl || !categoryFilterEl.value) return state.games;
      return state.games.filter(function (g) { return g.category === categoryFilterEl.value; });
    }

    function renderServerAndPackages(gameName) {
      var productsForGame = state.allProducts.filter(function (p) { return p.game === gameName; });
      var servers = uniqueValues(productsForGame.map(function (p) { return p.server; }));

      var serverFilterEl = document.getElementById('server-filter');
      if (serverFilterEl) {
        if (servers.length > 1) {
          serverFilterEl.hidden = false;
          serverFilterEl.innerHTML = servers.map(function (s) {
            return '<option value="' + escapeHtml(s) + '">' + escapeHtml(s) + '</option>';
          }).join('');
          serverFilterEl.value = state.activeServer || servers[0];
          serverFilterEl.onchange = function () {
            state.activeServer = serverFilterEl.value;
            renderPackageList(packageListEl, productsForGame.filter(function (p) {
              return p.server === serverFilterEl.value;
            }));
          };
        } else {
          serverFilterEl.hidden = true;
        }
      }

      state.activeServer = servers.length > 1 ? (state.activeServer || servers[0]) : servers[0];
      var visibleProducts = productsForGame.filter(function (p) { return p.server === state.activeServer; });
      renderPackageList(packageListEl, visibleProducts);
    }

    function clearPackageList() {
      state.activeGameName = null;
      if (packageListEl) packageListEl.innerHTML = '';
      var packageEmptyEl = document.getElementById('package-empty');
      if (packageEmptyEl) packageEmptyEl.hidden = false;
    }
  }

  function buildGameSummaries(products) {
    var seen = {};
    var games = [];
    products.forEach(function (p) {
      if (!seen[p.game]) {
        seen[p.game] = true;
        games.push({
          name: p.game,
          slug: GAME_SLUGS[p.game] || slugify(p.game),
          image: p.image,
          category: p.category
        });
      }
    });
    return games;
  }

  function uniqueValues(arr) {
    var seen = {};
    var out = [];
    arr.forEach(function (v) {
      if (!seen[v]) {
        seen[v] = true;
        out.push(v);
      }
    });
    return out;
  }

  function slugify(str) {
    return String(str).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  function renderGameFilterOptions(selectEl, games) {
    if (!selectEl) return;
    var options = ['<option value="">เลือกเกม</option>'].concat(
      games.map(function (g) {
        return '<option value="' + escapeHtml(g.name) + '">' + escapeHtml(g.name) + '</option>';
      })
    );
    selectEl.innerHTML = options.join('');
  }

  function renderCategoryFilter(selectEl, games) {
    if (!selectEl) return;
    var categories = uniqueValues(games.map(function (g) { return g.category; }));
    var options = ['<option value="">ทุกหมวดหมู่</option>'].concat(
      categories.map(function (c) {
        return '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>';
      })
    );
    selectEl.innerHTML = options.join('');
  }

  function renderGameList(container, games, activeGameName) {
    if (!container) return;
    if (!games.length) {
      container.innerHTML = '<p class="text-muted">ไม่พบเกมที่ตรงกับตัวกรอง</p>';
      return;
    }
    container.innerHTML = games.map(function (g) {
      var activeClass = g.name === activeGameName ? ' is-selected' : '';
      return (
        '<button type="button" class="game-card' + activeClass + '" data-game-name="' + escapeHtml(g.name) + '">' +
          '<img class="game-card__image" src="' + escapeHtml(g.image) + '" alt="' + escapeHtml(g.name) + '" loading="lazy">' +
          '<div class="game-card__title">' + escapeHtml(g.name) + '</div>' +
          '<div class="game-card__meta">' + escapeHtml(g.category) + '</div>' +
          '<span class="game-card__cta">ดูแพ็กเกจ</span>' +
        '</button>'
      );
    }).join('');

    // คลิกการ์ดเกม -> ยิง custom event ให้ initGamesPage() (ผู้เรียก renderGameList)
    // เป็นคนจัดการ state และ re-render จริง เก็บ renderGameList ให้เป็นฟังก์ชัน
    // pure-ish ที่ไม่ผูกกับ state ของหน้าโดยตรง
    container.querySelectorAll('.game-card').forEach(function (card) {
      card.addEventListener('click', function () {
        var gameName = card.getAttribute('data-game-name');
        container.dispatchEvent(new CustomEvent('gacha:selectGame', {
          detail: { gameName: gameName },
          bubbles: false
        }));
      });
    });
  }

  function renderPackageList(container, products) {
    if (!container) return;
    var packageEmptyEl = document.getElementById('package-empty');
    if (!products.length) {
      container.innerHTML = '';
      if (packageEmptyEl) packageEmptyEl.hidden = false;
      return;
    }
    if (packageEmptyEl) packageEmptyEl.hidden = true;

    container.innerHTML = products.map(function (p) {
      var isContact = p.price === null || p.price === undefined;
      var priceDisplay = isContact ? 'ติดต่อแอดมิน' : formatPrice(p.price);
      var priceClass = isContact ? 'package-card__price package-card__price--contact' : 'package-card__price';
      var subscriptionClass = p.packageType === 'subscription' ? ' package-card--subscription' : '';
      var buttonLabel = isContact ? 'สอบถามราคา' : 'สั่งซื้อ';

      return (
        '<div class="package-card' + subscriptionClass + '" data-product-id="' + escapeHtml(p.id) + '">' +
          '<span class="package-card__icon" aria-hidden="true"></span>' +
          '<div class="package-card__body">' +
            '<div class="package-card__name">' + escapeHtml(p.package) + '</div>' +
            '<div class="package-card__server">' + escapeHtml(p.game) + ' &middot; ' + escapeHtml(p.server) + '</div>' +
          '</div>' +
          '<div class="' + priceClass + '">' + escapeHtml(priceDisplay) + '</div>' +
          '<button type="button" class="btn btn-primary btn-sm" data-order-btn>' + buttonLabel + '</button>' +
        '</div>'
      );
    }).join('');

    container.querySelectorAll('[data-order-btn]').forEach(function (btn, index) {
      btn.addEventListener('click', function () {
        goToOrderPage(products[index]);
      });
    });
  }

  function renderLoadError(container) {
    if (!container) return;
    container.innerHTML = '<div class="alert alert-error">โหลดข้อมูลเกมไม่สำเร็จ กรุณารีเฟรชหน้าใหม่อีกครั้ง</div>';
  }

  /**
   * นำทางไปหน้า order.html พร้อม URL parameters ตามสเปก
   */
  function goToOrderPage(product) {
    var params = new URLSearchParams();
    params.set('game', product.game);
    params.set('server', product.server);
    params.set('package', product.package);
    params.set('price', product.price === null || product.price === undefined ? '' : String(product.price));
    params.set('productId', product.id);
    window.location.href = 'order.html?' + params.toString();
  }

  /* =====================================================================
     4. Order Page (order.html)
     ใช้ ID: #orderForm, #orderId, #customerName, #contact, #game, #server,
             #playerId, #playerName, #package, #amount, #note
     ===================================================================== */

  function initOrderPage() {
    var form = document.getElementById('orderForm');
    var fields = {
      orderId: document.getElementById('orderId'),
      customerName: document.getElementById('customerName'),
      contact: document.getElementById('contact'),
      game: document.getElementById('game'),
      server: document.getElementById('server'),
      playerId: document.getElementById('playerId'),
      playerName: document.getElementById('playerName'),
      package: document.getElementById('package'),
      amount: document.getElementById('amount'),
      note: document.getElementById('note')
    };

    var orderContext = prefillOrderForm(fields);
    setupSecurityWarning(fields.playerId);
    setupSecurityWarning(fields.note);
    setupLiveValidation(fields);

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        handleOrderSubmit(form, fields, orderContext);
      });
    }
  }

  /**
   * อ่าน URL parameters แล้วเติมค่าลงฟอร์มโดยอัตโนมัติ
   * game / server / package / amount เป็น readonly ห้ามลูกค้าแก้เอง
   */
  function prefillOrderForm(fields) {
    var params = getQueryParams();
    var gameParam = params.get('game') || '';
    var serverParam = params.get('server') || '';
    var packageParam = params.get('package') || '';
    var priceParam = params.get('price');
    var productIdParam = params.get('productId') || '';

    var isContact = priceParam === null || priceParam === '' || isNaN(Number(priceParam));

    if (fields.game) {
      fields.game.value = gameParam;
      fields.game.readOnly = true;
    }
    if (fields.server) {
      fields.server.value = serverParam;
      fields.server.readOnly = true;
    }
    if (fields.package) {
      fields.package.value = packageParam;
      fields.package.readOnly = true;
    }
    if (fields.amount) {
      fields.amount.value = isContact ? 'ติดต่อแอดมิน' : formatPrice(priceParam);
      fields.amount.readOnly = true;
    }
    if (fields.orderId) {
      var newOrderId = generateOrderId();
      fields.orderId.value = newOrderId;
      fields.orderId.readOnly = true;
    }

    return {
      productId: productIdParam,
      isContact: isContact,
      rawPrice: isContact ? null : Number(priceParam)
    };
  }

  /**
   * เฝ้าดู playerId และ note ว่ามีคำต้องห้าม (password/OTP ฯลฯ) หรือไม่
   * ถ้าพบ ให้แสดง warning ใต้ช่องนั้น และกันการ submit จนกว่าจะแก้ไข
   */
  function setupSecurityWarning(inputEl) {
    if (!inputEl) return;
    inputEl.addEventListener('input', function () {
      if (containsForbiddenWord(inputEl.value)) {
        showFieldError(
          inputEl,
          'กรุณาอย่ากรอกรหัสผ่านหรือรหัส OTP ในช่องนี้ ระบบต้องการเฉพาะ UID / Player ID เท่านั้น'
        );
        inputEl.setAttribute('data-security-flag', 'true');
      } else {
        inputEl.removeAttribute('data-security-flag');
        // เคลียร์เฉพาะเมื่อไม่มี error อื่นค้างอยู่จาก validation ทั่วไป
        if (inputEl.getAttribute('data-validation-flag') !== 'true') {
          clearFieldError(inputEl);
        }
      }
    });
  }

  function setupLiveValidation(fields) {
    ['customerName', 'contact', 'playerId'].forEach(function (key) {
      var el = fields[key];
      if (!el) return;
      el.addEventListener('blur', function () {
        validateRequiredField(el);
      });
    });
  }

  function validateRequiredField(inputEl) {
    var value = inputEl.value ? inputEl.value.trim() : '';
    if (value === '') {
      showFieldError(inputEl, 'กรุณากรอกข้อมูลในช่องนี้');
      inputEl.setAttribute('data-validation-flag', 'true');
      return false;
    }
    inputEl.removeAttribute('data-validation-flag');
    if (inputEl.getAttribute('data-security-flag') !== 'true') {
      clearFieldError(inputEl);
    }
    return true;
  }

  /**
   * ตรวจสอบข้อมูลทั้งฟอร์มก่อนส่ง
   * คืนค่า true ถ้าผ่านทุกเงื่อนไข
   */
  function validateOrderForm(fields, orderContext) {
    var isValid = true;

    var requiredTextFields = ['customerName', 'contact', 'playerId'];
    requiredTextFields.forEach(function (key) {
      if (!validateRequiredField(fields[key])) {
        isValid = false;
      }
    });

    if (!fields.game || !fields.game.value.trim()) {
      isValid = false;
    }
    if (!fields.server || !fields.server.value.trim()) {
      isValid = false;
    }
    if (!fields.package || !fields.package.value.trim()) {
      isValid = false;
    }

    // amount: ถูกต้องเมื่อเป็นราคาที่มาจากระบบ (ตัวเลข) หรือเป็นแพ็กเกจแบบติดต่อแอดมิน
    if (!fields.amount || !fields.amount.value.trim()) {
      isValid = false;
    }

    // playerId ต้องไม่เป็นช่องว่างล้วน (เช่น กรอกแต่เว้นวรรค)
    if (fields.playerId && fields.playerId.value.trim() === '') {
      showFieldError(fields.playerId, 'กรุณากรอก Player ID / UID ให้ถูกต้อง');
      isValid = false;
    }

    // บล็อกการ submit ถ้ามีคำต้องห้าม (password/OTP) ค้างอยู่ใน playerId หรือ note
    if (fields.playerId && fields.playerId.getAttribute('data-security-flag') === 'true') {
      isValid = false;
    }
    if (fields.note && fields.note.getAttribute('data-security-flag') === 'true') {
      isValid = false;
    }

    return isValid;
  }

  function handleOrderSubmit(form, fields, orderContext) {
    if (!validateOrderForm(fields, orderContext)) {
      var firstInvalid = form.querySelector('.is-invalid');
      if (firstInvalid) {
        firstInvalid.focus();
      }
      return;
    }

    var submitBtn = form.querySelector('[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'กำลังส่งคำสั่งซื้อ...';
    }

    var payload = {
      orderId: fields.orderId.value,
      customerName: fields.customerName.value.trim(),
      contact: fields.contact.value.trim(),
      game: fields.game.value,
      server: fields.server.value,
      playerId: fields.playerId.value.trim(),
      playerName: fields.playerName ? fields.playerName.value.trim() : '',
      package: fields.package.value,
      amount: orderContext.isContact ? 'ติดต่อแอดมิน' : orderContext.rawPrice,
      note: fields.note ? fields.note.value.trim() : ''
    };

    fetch(https://script.google.com/macros/s/AKfycbyspAjhfrdcm2aYqN1TA1hmvB0kurpuVmmyQW973fBDUK4EHpkVJ5MtJMII_MFvwD26/exec
, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        if (!res.ok) {
          throw new Error('ส่ง Order ไม่สำเร็จ: HTTP ' + res.status);
        }
        return res.json().catch(function () {
          return { success: true };
        });
      })
      .then(function () {
        try {
          sessionStorage.setItem(
            CONFIG.SESSION_KEY_LAST_ORDER,
            JSON.stringify({
              orderId: payload.orderId,
              game: payload.game,
              package: payload.package,
              amount: payload.amount
            })
          );
        } catch (storageErr) {
          console.error('ไม่สามารถบันทึก sessionStorage:', storageErr.message);
        }
        window.location.href = 'thankyou.html?orderId=' + encodeURIComponent(payload.orderId);
      })
      .catch(function (err) {
        console.error('handleOrderSubmit error:', err.message);
        renderOrderSubmitError(form);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'ส่งคำสั่งซื้อ';
        }
      });
  }

  function renderOrderSubmitError(form) {
    var existing = document.getElementById('order-submit-error');
    if (existing) {
      existing.hidden = false;
      return;
    }
    var alertEl = document.createElement('div');
    alertEl.id = 'order-submit-error';
    alertEl.className = 'alert alert-error';
    alertEl.textContent = 'ส่งคำสั่งซื้อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง หรือติดต่อแอดมินโดยตรง';
    form.prepend(alertEl);
  }

  /* =====================================================================
     5. Thank You Page (thankyou.html)
     ใช้ container marker: #thankyou-page
     เพิ่มเติม (ใหม่ — โปรดแจ้งหากต้องการเปลี่ยน):
       #display-order-id, #display-game, #display-package, #display-amount
     ===================================================================== */

  function initThankyouPage() {
    var params = getQueryParams();
    var orderIdFromUrl = params.get('orderId');

    var storedOrder = null;
    try {
      var raw = sessionStorage.getItem(CONFIG.SESSION_KEY_LAST_ORDER);
      if (raw) storedOrder = JSON.parse(raw);
    } catch (err) {
      console.error('อ่าน sessionStorage ไม่สำเร็จ:', err.message);
    }

    var orderIdEl = document.getElementById('display-order-id');
    var gameEl = document.getElementById('display-game');
    var packageEl = document.getElementById('display-package');
    var amountEl = document.getElementById('display-amount');

    var finalOrderId = orderIdFromUrl || (storedOrder && storedOrder.orderId) || '-';
    if (orderIdEl) orderIdEl.textContent = finalOrderId;

    if (storedOrder && storedOrder.orderId === finalOrderId) {
      if (gameEl) gameEl.textContent = storedOrder.game || '-';
      if (packageEl) packageEl.textContent = storedOrder.package || '-';
      if (amountEl) {
        amountEl.textContent = typeof storedOrder.amount === 'number'
          ? formatPrice(storedOrder.amount)
          : (storedOrder.amount || '-');
      }
    } else {
      // ไม่มีข้อมูลใน session (เช่น ผู้ใช้เข้าหน้านี้ตรงๆ) — แสดงเฉพาะ orderId ที่มี
      if (gameEl) gameEl.textContent = '-';
      if (packageEl) packageEl.textContent = '-';
      if (amountEl) amountEl.textContent = '-';
    }
  }

  /* =====================================================================
     6. Admin Page (admin.html)
     ใช้ container marker: #admin-page
     เพิ่มเติม (ใหม่ — โปรดแจ้งหากต้องการเปลี่ยน):
       #ordersTableBody, #ordersLoading, #ordersEmpty, #ordersError,
       #stat-total, #stat-pending, #stat-processing, #stat-completed, #stat-cancelled
     ===================================================================== */

  function initAdminPage() {
    var tableBody = document.getElementById('ordersTableBody');
    var searchEl = document.getElementById('searchOrders');
    var statusFilterEl = document.getElementById('statusFilter');
    var gameFilterEl = document.getElementById('gameFilterAdmin');
    var loadingEl = document.getElementById('ordersLoading');
    var emptyEl = document.getElementById('ordersEmpty');
    var errorEl = document.getElementById('ordersError');

    var state = { allOrders: [] };

    setVisible(loadingEl, true);
    setVisible(emptyEl, false);
    setVisible(errorEl, false);

    fetch(https://docs.google.com/spreadsheets/d/e/2PACX-1vRnqkRQWkzwSnN5RpPq76iVsT12VYpTRaz6WGD_IPq4RCmUX1ctjmZeZYKU7FypWMD4kZp9Yt_7_QMJ/pub?gid=0&single=true&output=csv
      .then(function (res) {
        if (!res.ok) {
          throw new Error('โหลดข้อมูล Order ไม่สำเร็จ: HTTP ' + res.status);
        }
        return res.text();
      }))
      .then(function (csvText) {
        var rows = parseCSV(csvText);
        state.allOrders = csvRowsToOrders(rows);
        state.allOrders.sort(compareOrdersLatestFirst);

        updateDashboardStats(state.allOrders);
        renderOrderTable(tableBody, state.allOrders);
        toggleEmptyState(emptyEl, state.allOrders.length === 0);
      })
      .catch(function (err) {
        console.error('initAdminPage load error:', err.message);
        setVisible(errorEl, true);
      })
      .finally(function () {
        setVisible(loadingEl, false);
      });

    function applyFilters() {
      var keyword = searchEl ? searchEl.value.trim().toLowerCase() : '';
      var status = statusFilterEl ? statusFilterEl.value.trim().toLowerCase() : '';
      var game = gameFilterEl ? gameFilterEl.value : '';

      var filtered = state.allOrders.filter(function (order) {
        var matchesKeyword = !keyword || [
          order.orderId, order.customer, order.contact, order.game, order.playerId
        ].some(function (field) {
          return String(field || '').toLowerCase().indexOf(keyword) !== -1;
        });
        var matchesStatus = !status || String(order.status || '').trim().toLowerCase() === status;
        var matchesGame = !game || order.game === game;
        return matchesKeyword && matchesStatus && matchesGame;
      });

      renderOrderTable(tableBody, filtered);
      toggleEmptyState(emptyEl, filtered.length === 0);
    }

    if (searchEl) searchEl.addEventListener('input', debounce(applyFilters, 200));
    if (statusFilterEl) statusFilterEl.addEventListener('change', applyFilters);
    if (gameFilterEl) gameFilterEl.addEventListener('change', applyFilters);
  }

  /**
   * อัปเดตตัวเลขบน Dashboard: Total / Pending / Processing / Completed / Cancelled
   * นับแบบไม่สนตัวพิมพ์เล็ก-ใหญ่ของค่า status ที่มาจาก Sheet
   */
  function updateDashboardStats(orders) {
    var counts = { pending: 0, processing: 0, completed: 0, cancelled: 0 };
    orders.forEach(function (o) {
      var normalized = String(o.status || '').trim().toLowerCase();
      if (normalized === 'cancelled' || normalized === 'canceled') {
        counts.cancelled++;
      } else if (counts.hasOwnProperty(normalized)) {
        counts[normalized]++;
      }
    });

    setStatValue('stat-total', orders.length);
    setStatValue('stat-pending', counts.pending);
    setStatValue('stat-processing', counts.processing);
    setStatValue('stat-completed', counts.completed);
    setStatValue('stat-cancelled', counts.cancelled);
  }

  function setStatValue(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = String(value);
  }

  function setVisible(el, isVisible) {
    if (!el) return;
    el.hidden = !isVisible;
  }

  function toggleEmptyState(emptyEl, isEmpty) {
    setVisible(emptyEl, isEmpty);
  }

  function debounce(fn, delay) {
    var timer = null;
    return function () {
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(null, args); }, delay);
    };
  }

  function renderOrderTable(tableBody, orders) {
    if (!tableBody) return;
    if (!orders.length) {
      tableBody.innerHTML = '';
      return;
    }
    tableBody.innerHTML = orders.map(function (o) {
      return (
        '<tr>' +
          '<td>' + escapeHtml(o.orderId) + '</td>' +
          '<td>' + escapeHtml(o.date) + '</td>' +
          '<td>' + escapeHtml(o.customer) + '</td>' +
          '<td>' + escapeHtml(o.contact) + '</td>' +
          '<td>' + escapeHtml(o.game) + '</td>' +
          '<td>' + escapeHtml(o.server) + '</td>' +
          '<td>' + escapeHtml(o.playerId) + '</td>' +
          '<td>' + escapeHtml(o.playerName) + '</td>' +
          '<td>' + escapeHtml(o.package) + '</td>' +
          '<td>' + escapeHtml(o.amount) + '</td>' +
          '<td>' + renderStatusBadge(o.status) + '</td>' +
          '<td>' + escapeHtml(o.note) + '</td>' +
        '</tr>'
      );
    }).join('');
  }

  function renderStatusBadge(status) {
    var normalized = String(status || '').trim().toLowerCase();
    var badgeClassMap = {
      pending: 'badge-pending',
      processing: 'badge-processing',
      completed: 'badge-completed',
      cancelled: 'badge-cancelled',
      canceled: 'badge-cancelled',
      problem: 'badge-problem',
      // ค่าเก่าที่อาจหลงเหลือใน Sheet (รองรับไว้เผื่อ)
      paid: 'badge-paid',
      contact: 'badge-contact'
    };
    var badgeClass = badgeClassMap[normalized] || 'badge-pending';
    return '<span class="badge ' + badgeClass + '">' + escapeHtml(status || '-') + '</span>';
  }

  function compareOrdersLatestFirst(a, b) {
    var dateA = new Date(a.date);
    var dateB = new Date(b.date);
    var validA = !isNaN(dateA.getTime());
    var validB = !isNaN(dateB.getTime());
    if (validA && validB) {
      return dateB.getTime() - dateA.getTime();
    }
    // ถ้า parse วันที่ไม่ได้ ให้เรียงจาก orderId แบบ string ย้อนกลับแทน (fallback)
    return String(b.orderId).localeCompare(String(a.orderId));
  }

  /**
   * แปลงแถว CSV (array of array) ให้เป็น array of order object
   * โดยอิง header row แถวแรก จับคู่ตามชื่อคอลัมน์ (case-insensitive)
   */
  function csvRowsToOrders(rows) {
    if (!rows.length) return [];
    var header = rows[0].map(function (h) { return h.trim().toLowerCase(); });

    var columnMap = {
      orderId: findColumnIndex(header, ['order id', 'orderid']),
      date: findColumnIndex(header, ['date', 'timestamp']),
      customer: findColumnIndex(header, ['customer', 'customername']),
      contact: findColumnIndex(header, ['contact']),
      game: findColumnIndex(header, ['game']),
      server: findColumnIndex(header, ['server']),
      playerId: findColumnIndex(header, ['player id', 'playerid']),
      playerName: findColumnIndex(header, ['player name', 'playername']),
      package: findColumnIndex(header, ['package']),
      amount: findColumnIndex(header, ['amount']),
      status: findColumnIndex(header, ['status']),
      note: findColumnIndex(header, ['note', 'adminnote', 'admin note'])
    };

    return rows.slice(1)
      .filter(function (row) { return row.some(function (cell) { return cell !== ''; }); })
      .map(function (row) {
        return {
          orderId: getCell(row, columnMap.orderId),
          date: getCell(row, columnMap.date),
          customer: getCell(row, columnMap.customer),
          contact: getCell(row, columnMap.contact),
          game: getCell(row, columnMap.game),
          server: getCell(row, columnMap.server),
          playerId: getCell(row, columnMap.playerId),
          playerName: getCell(row, columnMap.playerName),
          package: getCell(row, columnMap.package),
          amount: getCell(row, columnMap.amount),
          status: getCell(row, columnMap.status),
          note: getCell(row, columnMap.note)
        };
      });
  }

  function findColumnIndex(header, possibleNames) {
    for (var i = 0; i < header.length; i++) {
      if (possibleNames.indexOf(header[i]) !== -1) return i;
    }
    return -1;
  }

  function getCell(row, index) {
    if (index === -1 || index === undefined) return '';
    return row[index] !== undefined ? row[index] : '';
  }

  /* =====================================================================
     7. CSV Parser (เขียนเอง — ไม่ใช้ library ภายนอก)
     รองรับ: comma ใน field ที่ครอบด้วย double quote, quoted field,
             newline ในฟิลด์ที่ครอบด้วย quote, การ escape quote คู่ ("")
     คืนค่า: array of rows โดยแต่ละ row เป็น array of string
     ===================================================================== */
  function parseCSV(text) {
    var rows = [];
    var row = [];
    var field = '';
    var insideQuotes = false;

    // normalize CRLF -> LF เพื่อลดความซับซ้อนของ state machine
    var normalized = String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    for (var i = 0; i < normalized.length; i++) {
      var char = normalized[i];
      var nextChar = normalized[i + 1];

      if (insideQuotes) {
        if (char === '"' && nextChar === '"') {
          field += '"';
          i++; // ข้าม quote ตัวที่สอง (escaped quote)
        } else if (char === '"') {
          insideQuotes = false;
        } else {
          field += char; // รวมถึง newline ภายใน quoted field
        }
        continue;
      }

      if (char === '"') {
        insideQuotes = true;
      } else if (char === ',') {
        row.push(field);
        field = '';
      } else if (char === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += char;
      }
    }

    // เก็บ field/row สุดท้ายที่เหลืออยู่ (กรณีไฟล์ไม่ได้ลงท้ายด้วย newline)
    if (field !== '' || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    return rows.filter(function (r) {
      return !(r.length === 1 && r[0] === '');
    });
  }

}());
