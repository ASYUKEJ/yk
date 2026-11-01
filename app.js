// ============================================
// Yumika Karimey — Twitch API Auto-Refresh System
// ============================================

const CONFIG = {
    // Настройки обновления
    REFRESH_INTERVAL: 30000,      // Обновление данных: 30 секунд
    TEST_INTERVAL: 5000,         // Проверка тест: 5 секунд
    ANIMATION_INTERVAL: 10000,   // Анимация: каждые 10 секунд

    // Twitch API
    TWITCH_CLIENT_ID: 'kimne78kx3ncx6brgo4mv6wki5h1ko',
    TWITCH_GQL_URL: 'https://gql.twitch.tv/gql',
    CHANNEL_NAME: 'yumika_karimey',

    // === Источники донатов ===
    // 'auto'  — реальные источники, если настроены; иначе локальный JSON/демо
    // true    — всегда тестовые данные
    // false   — только реальные источники, без демо-заглушки
    USE_MOCK_DATA: 'auto',

    // Порядок опроса источников. Источник без токена пропускается,
    // локальный JSON пробуется всегда.
    DONATION_PROVIDERS: ['donationalerts', 'streamelements', 'streamlabs', 'json'],

    // Токены (можно вписать здесь или один раз выполнить в консоли браузера:
    // YumikaSystem.setTokens({ donationalerts: '...' }))
    TWITCH_OAUTH_TOKEN: '',      // OAuth токен Twitch (не обязателен для статусов каналов)
    DONATIONALERTS_TOKEN: '',    // Bearer-токен DonationAlerts
    STREAMELEMENTS_TOKEN: '',    // JWT из панели StreamElements (Account → API)
    STREAMLABS_TOKEN: '',        // Access-токен StreamLabs API

    // DonationAlerts берёт данные из той же истории, что и лента активности:
    // https://www.donationalerts.com/dashboard/activity-feed/donations/
    // Нужен только токен. Чем больше страниц — тем точнее топ, но больше запросов.
    DONATIONALERTS_DASHBOARD_URL: 'https://www.donationalerts.com/dashboard/activity-feed/donations/',

    // StreamElements нужен ID канала (24 символа), а не ник.
    // Если пусто — подставляется CHANNEL_NAME (работает не для всех аккаунтов).
    STREAMELEMENTS_CHANNEL_ID: '',

    // Локальный файл с донатами — работает без токенов и без бэкенда
    DONATIONS_JSON_URL: 'data/donations.json',

    // Сколько последних донатов запрашивать у API и сколько показывать в топе
    DONATIONS_FETCH_LIMIT: 100,
    DONATION_LIMIT: 5,
    DONATIONALERTS_PAGES: 2,

    // Сколько живёт кэш, если API временно недоступен (24 часа)
    DONATIONS_CACHE_TTL: 24 * 60 * 60 * 1000,
    DONATIONS_CACHE_KEY: 'yumika_donations_cache',
    TOKENS_STORAGE_KEY: 'yumika_tokens',
};

// Токены, сохранённые через YumikaSystem.setTokens(), имеют приоритет над CONFIG
(function loadSavedTokens() {
    try {
        const saved = JSON.parse(localStorage.getItem(CONFIG.TOKENS_STORAGE_KEY) || '{}');
        if (typeof saved.donationalerts === 'string') CONFIG.DONATIONALERTS_TOKEN = saved.donationalerts;
        if (typeof saved.streamelements === 'string') CONFIG.STREAMELEMENTS_TOKEN = saved.streamelements;
        if (typeof saved.streamlabs === 'string') CONFIG.STREAMLABS_TOKEN = saved.streamlabs;
        if (typeof saved.streamelementsChannelId === 'string') CONFIG.STREAMELEMENTS_CHANNEL_ID = saved.streamelementsChannelId;
    } catch (e) {
        console.warn('[Config] Не удалось прочитать сохранённые токены:', e);
    }
})();

// === Хранилище данных ===
const DataStore = {
    donators: [],
    memeAlerts: [],
    boosters: [],
    lastUpdate: null,
    source: null,
    isUpdating: false,

    // Инициализация
    init() {
        this.loadFromStorage();
        console.log('[DataStore] Инициализирован');
    },

    // Загрузка из localStorage
    loadFromStorage() {
        try {
            const saved = localStorage.getItem('yumika_data');
            if (saved) {
                const data = JSON.parse(saved);
                this.donators = data.donators || [];
                this.memeAlerts = data.memeAlerts || [];
                this.boosters = data.boosters || [];
                this.lastUpdate = data.lastUpdate || null;
                this.source = data.source || null;
            }
        } catch (e) {
            console.warn('[DataStore] Ошибка загрузки:', e);
        }
    },

    // Сохранение в localStorage
    saveToStorage() {
        try {
            localStorage.setItem('yumika_data', JSON.stringify({
                donators: this.donators,
                memeAlerts: this.memeAlerts,
                boosters: this.boosters,
                lastUpdate: this.lastUpdate,
                source: this.source
            }));
        } catch (e) {
            console.warn('[DataStore] Ошибка сохранения:', e);
        }
    }
};

// === Twitch API клиент ===
const TwitchAPI = {
    // GraphQL запрос
    async graphql(query, variables = {}) {
        const headers = {
            'Client-ID': CONFIG.TWITCH_CLIENT_ID,
            'Content-Type': 'application/json',
        };

        if (CONFIG.TWITCH_OAUTH_TOKEN) {
            headers['Authorization'] = `Bearer ${CONFIG.TWITCH_OAUTH_TOKEN}`;
        }

        const response = await fetch(CONFIG.TWITCH_GQL_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify({ query, variables })
        });

        return response.json();
    },

    // Получение информации о канале
    async getChannelInfo() {
        const query = `
            query {
                user(login: "${CONFIG.CHANNEL_NAME}") {
                    id
                    login
                    displayName
                    description
                    profileImageURL
                    createdAt
                }
            }
        `;
        return this.graphql(query);
    },

    // Получение донатов вынесено в модуль Donations (ниже):
    // Twitch не предоставляет публичный API для донатов, поэтому
    // используются DonationAlerts / StreamElements / StreamLabs / локальный JSON.
    async getTopDonators() {
        const result = await Donations.fetchTop();
        return result.items || [];
    },

    // Получение бустеров Discord (требует Discord API)
    async getDiscordBoosters() {
        // Примечание: требует Discord Bot Token и Server ID
        // Нужен серверный компонент
        return [];
    }
};

// === Тестовые данные (Mock) ===
const MockData = {
    donators: [
        { name: 'kakTY3', amount: '2090 ₽', rank: 1 },
        { name: 'Naokifuri', amount: '1570 ₽', rank: 2 },
        { name: 'Ateenss', amount: '920 ₽', rank: 3 },
        { name: 'Lem_q', amount: '494,63 ₽', rank: 4 },
        { name: 'Michaelufo1250', amount: '80 ₽', rank: 5 }
    ],

    memeAlerts: [
        { name: 'Voidnu11', amount: '2958 ₽' }
    ],

    boosters: [
        { name: 'ateenss' },
        { name: 'molodoy_rus_' }
    ],

    // Случайное обновление для теста
    getRandomUpdate() {
        const types = ['donator', 'memeAlert', 'booster'];
        const type = types[Math.floor(Math.random() * types.length)];

        if (type === 'donator') {
            const names = ['TestUser1', 'TestUser2', 'NewDonator'];
            const name = names.length > 0 ? names[Math.floor(Math.random() * names.length)] : null;
            if (!name) return;
            const amount = `${Math.floor(Math.random() * 1000)} ₽`;
            this.donators.push({ name, amount, rank: this.donators.length + 1 });
            this.donators = this.donators.slice(0, 5);
        } else if (type === 'memeAlert') {
            const names = [];
            const name = names.length > 0 ? names[Math.floor(Math.random() * names.length)] : null;
            if (!name) return;
            const amount = `${Math.floor(Math.random() * 500)} ₽`;
            this.memeAlerts.push({ name, amount });
        } else {
            const names = [];
            const name = names.length > 0 ? names[Math.floor(Math.random() * names.length)] : null;
            if (!name) return;
            this.boosters.push({ name });
        }
    }
};

// === Источники донатов ===
// DonationAlerts / StreamElements / StreamLabs / локальный JSON.
// Все адаптеры возвращают «сырые» записи, а Donations сам считает топ
// и приводит суммы к единому виду.
const Donations = {
    errors: [],

    // "1770", "536,74 RUB", "$5.00" → { amount: 536.74, currency: "RUB" }
    parseAmount(value, fallbackCurrency = '') {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return { amount: value, currency: fallbackCurrency };
        }

        const text = String(value ?? '').trim();
        const normalized = text.replace(/\s+/g, '').replace(',', '.');
        const numberMatch = normalized.match(/-?\d+(?:\.\d+)?/);
        const amount = numberMatch ? parseFloat(numberMatch[0]) : 0;
        const currencyMatch = text.match(/RUB|USD|EUR|UAH|BYN|KZT|GBP|JPY|руб\.?|грн\.?|[₽$€£₴]/i);

        let currency = fallbackCurrency || '';
        if (currencyMatch) {
            const raw = currencyMatch[0].replace(/\./g, '').toUpperCase();
            const map = {
                '₽': 'RUB', 'РУБ': 'RUB',
                '$': 'USD', '€': 'EUR', '£': 'GBP',
                '₴': 'UAH', 'ГРН': 'UAH'
            };
            currency = map[raw] || raw;
        }

        return { amount: Number.isFinite(amount) ? amount : 0, currency };
    },

    // Приводит запись любого источника к { name, amount, currency }
    normalizeEntry(entry) {
        if (!entry || typeof entry !== 'object') return null;

        const name = entry.name || entry.username || entry.donor || entry.user || entry.sender || 'Аноним';
        const parsed = this.parseAmount(entry.amount, (entry.currency || '').toUpperCase());
        if (!(parsed.amount > 0)) return null;

        return {
            name: String(name).trim() || 'Аноним',
            amount: parsed.amount,
            currency: (entry.currency || parsed.currency || 'RUB').toString().toUpperCase()
        };
    },

    // Достаёт массив записей из ответа API (форматы у сервисов разные)
    extractArray(payload) {
        if (Array.isArray(payload)) return payload;
        if (!payload || typeof payload !== 'object') return [];

        for (const key of ['data', 'docs', 'donations', 'donators', 'items']) {
            if (Array.isArray(payload[key])) return payload[key];
            if (payload[key] && Array.isArray(payload[key].data)) return payload[key].data;
        }
        return [];
    },

    formatAmount(amount, currency) {
        const formatted = new Intl.NumberFormat('ru-RU', {
            maximumFractionDigits: 2
        }).format(amount);

        // Рубли показываем символом ₽, как в оформлении страницы
        if (currency === 'RUB' || currency === 'РУБ') return `${formatted} ₽`;

        return currency ? `${formatted} ${currency}` : formatted;
    },

    // Суммирует донаты одного человека и строит топ
    aggregate(entries) {
        const totals = new Map();
        const seenIds = new Set();

        (entries || []).forEach(entry => {
            if (!entry || typeof entry !== 'object') return;

            // Одна и та же запись может прийти с разных страниц API
            const id = entry.id ?? entry._id ?? entry.donationId;
            if (id !== undefined && id !== null) {
                const key = String(id);
                if (seenIds.has(key)) return;
                seenIds.add(key);
            }

            const item = this.normalizeEntry(entry);
            if (!item) return;

            const key = item.name.toLowerCase();
            const current = totals.get(key);
            if (!current) {
                totals.set(key, { ...item });
                return;
            }

            // Разные валюты не складываем — оставляем больший номинал
            if (!current.currency || current.currency === item.currency) {
                current.amount += item.amount;
                current.currency = current.currency || item.currency;
            } else if (item.amount > current.amount) {
                current.amount = item.amount;
                current.currency = item.currency;
            }
        });

        return Array.from(totals.values())
            .sort((a, b) => b.amount - a.amount)
            .slice(0, CONFIG.DONATION_LIMIT)
            .map((item, index) => ({
                name: item.name,
                amount: this.formatAmount(item.amount, item.currency),
                rank: index + 1
            }));
    },

    async request(url, headers = {}) {
        const response = await fetch(url, {
            headers: { Accept: 'application/json', ...headers },
            cache: 'no-store'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    },

    // DonationAlerts: последние донаты по страницам
    async fetchDonationAlerts() {
        const pages = Math.max(1, Math.min(5, Number(CONFIG.DONATIONALERTS_PAGES) || 1));
        const requests = [];

        for (let page = 1; page <= pages; page++) {
            requests.push(this.request(
                `https://www.donationalerts.com/api/v1/alerts/donations?page=${page}`,
                { Authorization: `Bearer ${CONFIG.DONATIONALERTS_TOKEN}` }
            ));
        }

        const payloads = await Promise.all(requests);
        return payloads.flatMap(payload => this.extractArray(payload));
    },

    // StreamElements: JWT + ID канала
    async fetchStreamElements() {
        const channel = CONFIG.STREAMELEMENTS_CHANNEL_ID || CONFIG.CHANNEL_NAME;
        const payload = await this.request(
            `https://api.streamelements.com/kappa/v2/tips/${encodeURIComponent(channel)}?limit=${CONFIG.DONATIONS_FETCH_LIMIT}`,
            { Authorization: `Bearer ${CONFIG.STREAMELEMENTS_TOKEN}` }
        );
        return this.extractArray(payload);
    },

    // StreamLabs: access-токен
    async fetchStreamLabs() {
        const payload = await this.request(
            `https://streamlabs.com/api/v2.0/donations?limit=${CONFIG.DONATIONS_FETCH_LIMIT}&sort_by=created_at&order=desc`,
            { Authorization: `Bearer ${CONFIG.STREAMLABS_TOKEN}` }
        );
        return this.extractArray(payload);
    },

    // Локальный JSON — работает без токенов
    async fetchJson() {
        const payload = await this.request(CONFIG.DONATIONS_JSON_URL);
        return this.extractArray(payload);
    },

    getProviders() {
        return {
            donationalerts: {
                label: 'DonationAlerts',
                enabled: Boolean(CONFIG.DONATIONALERTS_TOKEN),
                load: () => this.fetchDonationAlerts()
            },
            streamelements: {
                label: 'StreamElements',
                enabled: Boolean(CONFIG.STREAMELEMENTS_TOKEN),
                load: () => this.fetchStreamElements()
            },
            streamlabs: {
                label: 'StreamLabs',
                enabled: Boolean(CONFIG.STREAMLABS_TOKEN),
                load: () => this.fetchStreamLabs()
            },
            json: {
                label: 'локальный JSON',
                enabled: Boolean(CONFIG.DONATIONS_JSON_URL),
                load: () => this.fetchJson()
            }
        };
    },

    // Пробует источники по порядку и возвращает первый непустой результат
    async fetchTop() {
        this.errors = [];

        // Принудительно демо-режим
        if (CONFIG.USE_MOCK_DATA === true) {
            return { items: null, source: 'демо' };
        }

        const providers = this.getProviders();
        const order = Array.isArray(CONFIG.DONATION_PROVIDERS) && CONFIG.DONATION_PROVIDERS.length
            ? CONFIG.DONATION_PROVIDERS
            : ['json'];

        for (const key of order) {
            const provider = providers[key];
            if (!provider || !provider.enabled) continue;

            try {
                const entries = await provider.load();
                const items = this.aggregate(entries);

                if (items.length) {
                    console.log(`[Donations] ${provider.label}: ${items.length} записей`);
                    return { items, source: provider.label };
                }
                this.errors.push(`${provider.label}: нет донатов`);
            } catch (error) {
                this.errors.push(`${provider.label}: ${error.message}`);
                console.warn(`[Donations] ${provider.label} недоступен:`, error.message);
            }
        }

        return { items: null, source: null };
    },

    saveCache(items, source) {
        try {
            localStorage.setItem(CONFIG.DONATIONS_CACHE_KEY, JSON.stringify({
                items,
                source,
                cachedAt: Date.now()
            }));
        } catch (e) {
            console.warn('[Donations] Не удалось сохранить кэш:', e);
        }
    },

    loadCache() {
        try {
            const raw = localStorage.getItem(CONFIG.DONATIONS_CACHE_KEY);
            if (!raw) return null;

            const data = JSON.parse(raw);
            if (!data || !Array.isArray(data.items) || !data.items.length) return null;
            if (Date.now() - (data.cachedAt || 0) > CONFIG.DONATIONS_CACHE_TTL) return null;

            return data;
        } catch (e) {
            return null;
        }
    }
};


const UpdateSystem = {
    refreshTimer: null,
    testTimer: null,
    animationTimer: null,

    // Запуск всех систем
    start() {
        console.log('[UpdateSystem] Запуск системы автообновления');

        // Обновление данных каждые 30 секунд
        this.refreshTimer = setInterval(() => {
            this.refreshData();
        }, CONFIG.REFRESH_INTERVAL);

        // Проверка тест каждые 5 секунд
        this.testTimer = setInterval(() => {
            this.runTestCheck();
        }, CONFIG.TEST_INTERVAL);

        // Анимация каждые 10 секунд
        this.animationTimer = setInterval(() => {
            this.triggerAnimation();
        }, CONFIG.ANIMATION_INTERVAL);

        // Первоначальная загрузка
        this.refreshData();
    },

    // Остановка всех систем
    stop() {
        clearInterval(this.refreshTimer);
        clearInterval(this.testTimer);
        clearInterval(this.animationTimer);
        console.log('[UpdateSystem] Система остановлена');
    },

    // Обновление данных
    async refreshData({ manual = false } = {}) {
        if (DataStore.isUpdating) return;
        DataStore.isUpdating = true;

        // Индикатор загрузки показываем только при ручном обновлении,
        // чтобы автообновление каждые 30 секунд не мигало в шапке.
        if (manual) {
            UI.setRefreshing(true);
            UI.renderSyncStatus('loading');
        }

        console.log(`[${new Date().toLocaleTimeString()}] Обновление данных...`);

        try {
            if (CONFIG.USE_MOCK_DATA === true) {
                // Тестовый режим
                MockData.getRandomUpdate();
                DataStore.donators = [...MockData.donators];
                DataStore.memeAlerts = [...MockData.memeAlerts];
                DataStore.boosters = [...MockData.boosters];
                DataStore.source = 'демо';
            } else {
                // Реальные источники: DonationAlerts / StreamElements / StreamLabs / JSON
                const result = await Donations.fetchTop();

                if (result.items) {
                    DataStore.donators = result.items;
                    DataStore.source = result.source;
                    Donations.saveCache(result.items, result.source);
                } else {
                    const cached = Donations.loadCache();

                    if (cached) {
                        DataStore.donators = cached.items;
                        DataStore.source = `кэш · ${cached.source}`;
                    } else if (CONFIG.USE_MOCK_DATA !== false) {
                        DataStore.donators = [...MockData.donators];
                        DataStore.source = 'демо';
                    } else {
                        DataStore.donators = [];
                        DataStore.source = null;
                    }
                }

                // Meme Alerts и бустеры Discord приходят не из донат-API,
                // поэтому не затираем статичные данные пустыми массивами.
            }

            DataStore.lastUpdate = new Date().toISOString();
            DataStore.saveToStorage();

            // Обновление UI
            UI.updateDonators(DataStore.donators);
            if (CONFIG.USE_MOCK_DATA === true) {
                UI.updateMemeAlerts(DataStore.memeAlerts);
                UI.updateBoosters(DataStore.boosters);
            }

            UI.renderSyncStatus();
            console.log(`[${new Date().toLocaleTimeString()}] Данные обновлены (${DataStore.source || 'нет источника'})`);
        } catch (e) {
            console.error('[UpdateSystem] Ошибка обновления:', e);
            UI.renderSyncStatus('error');
        } finally {
            DataStore.isUpdating = false;
            UI.setRefreshing(false);
        }

        if (manual) {
            AnimationSystem.play('update');
        }
    },

    // Проверка тест (каждые 5 сек)
    runTestCheck() {
        const status = {
            timestamp: new Date().toLocaleTimeString(),
            donatorsCount: DataStore.donators.length,
            memeAlertsCount: DataStore.memeAlerts.length,
            boostersCount: DataStore.boosters.length,
            lastUpdate: DataStore.lastUpdate,
            isUpdating: DataStore.isUpdating
        };

        // Отправка события для анимации при изменении
        if (this.hasDataChanged(status)) {
            AnimationSystem.play('update');
        }

        console.log('[TestCheck]', status);
    },

    // Проверка изменений данных
    hasDataChanged(status) {
        const prevStatus = this._lastStatus;
        this._lastStatus = status;

        if (!prevStatus) return false;

        return prevStatus.donatorsCount !== status.donatorsCount ||
               prevStatus.memeAlertsCount !== status.memeAlertsCount ||
               prevStatus.boostersCount !== status.boostersCount;
    },

    // Запуск анимации
    triggerAnimation() {
        AnimationSystem.play('interval');
    }
};

// === Система анимаций ===
const AnimationSystem = {
    // Типы анимаций
    types: {
        update: { duration: 1000, intensity: 0.5 },
        interval: { duration: 2000, intensity: 0.3 },
        lightning: { duration: 500, intensity: 1.0 }
    },

    // Воспроизведение анимации
    play(type = 'update') {
        const config = this.types[type] || this.types.update;
        console.log(`[Animation] Запуск: ${type}`);

        // Добавление CSS класса для анимации
        document.body.classList.add(`anim-${type}`);

        // Запуск CSS анимации
        this.triggerLightning(config.intensity);

        // Удаление класса после завершения
        setTimeout(() => {
            document.body.classList.remove(`anim-${type}`);
        }, config.duration);
    },

    // Запуск молнии
    triggerLightning(intensity = 0.5) {
        const flash = document.createElement('div');
        flash.className = 'lightning-flash';
        flash.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 191, 255, ${intensity * 0.3});
            pointer-events: none;
            z-index: 9999;
            animation: flash ${300 + intensity * 200}ms ease-out;
        `;

        document.body.appendChild(flash);

        setTimeout(() => {
            flash.remove();
        }, 500);
    }
};

// === UI обновления ===
const UI = {
    // Создаёт строку списка без innerHTML — имена пользователей не могут
    // внедрить разметку/скрипт (защита от XSS).
    createRow(iconClass, color, text) {
        const row = document.createElement('p');
        const icon = document.createElement('i');

        icon.className = `fa-solid ${iconClass}`;
        if (color) icon.style.color = color;

        row.appendChild(icon);
        row.appendChild(document.createTextNode(` ${text}`));
        return row;
    },

    createEmptyRow(text) {
        const row = document.createElement('p');
        row.className = 'empty-state';
        row.textContent = text;
        return row;
    },

    // Приводит старые сохранённые суммы вида "1770 RUB" к "1770 ₽"
    formatStoredAmount(value) {
        if (value === undefined || value === null) return '';
        return String(value)
            .replace(/\bRUB\b/gi, '₽')
            .replace(/\bРУБ\b/gi, '₽');
    },

    // Обновление донатеров
    updateDonators(donators) {
        const container = document.getElementById('donators-list');
        if (!container) return;

        container.textContent = '';

        if (!Array.isArray(donators) || !donators.length) {
            container.appendChild(this.createEmptyRow('Пока нет данных о донатах'));
            return;
        }

        const medals = [
            { icon: 'fa-trophy', color: '#ffd700' },
            { icon: 'fa-trophy', color: '#c0c0c0' },
            { icon: 'fa-trophy', color: '#cd7f32' },
            { icon: 'fa-medal', color: null },
            { icon: 'fa-medal', color: null }
        ];

        donators.forEach((d, i) => {
            const medal = medals[i] || { icon: 'fa-medal', color: null };
            const amount = d.amount === undefined || d.amount === null
                ? ''
                : ` — ${this.formatStoredAmount(d.amount)}`;
            container.appendChild(this.createRow(medal.icon, medal.color, `${d.name}${amount}`));
        });
    },

    // Обновление Meme Alerts
    updateMemeAlerts(alerts) {
        const container = document.getElementById('memealerts-list');
        if (!container) return;

        container.textContent = '';

        if (!Array.isArray(alerts) || !alerts.length) {
            container.appendChild(this.createEmptyRow('Пока нет данных'));
            return;
        }

        alerts.forEach(a => {
            const amount = a.amount === undefined || a.amount === null
                ? ''
                : ` — ${this.formatStoredAmount(a.amount)}`;
            container.appendChild(this.createRow('fa-bolt', null, `${a.name}${amount}`));
        });
    },

    // Обновление бустеров
    updateBoosters(boosters) {
        const container = document.getElementById('boosters-list');
        if (!container) return;

        container.textContent = '';

        if (!Array.isArray(boosters) || !boosters.length) {
            container.appendChild(this.createEmptyRow('Пока нет бустеров'));
            return;
        }

        boosters.forEach(b => {
            container.appendChild(this.createRow('fa-star', null, b.name));
        });
    },

    // Состояние кнопки «Обновить»
    setRefreshing(isRefreshing) {
        const button = document.getElementById('refresh-btn');
        if (!button) return;

        button.classList.toggle('is-loading', isRefreshing);
        button.disabled = isRefreshing;

        const label = button.querySelector('span');
        if (label) label.textContent = isRefreshing ? 'Обновление…' : 'Обновить';
    },

    formatUpdatedAt(isoString) {
        const date = new Date(isoString);
        if (Number.isNaN(date.getTime())) return '—';

        const now = new Date();
        const time = date.toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        const sameDay = date.getFullYear() === now.getFullYear()
            && date.getMonth() === now.getMonth()
            && date.getDate() === now.getDate();

        return sameDay ? time : `${date.toLocaleDateString('ru-RU')} ${time}`;
    },

    // «Обновлено: 12:34:56 · Источник: StreamElements»
    renderSyncStatus(state) {
        const status = document.getElementById('sync-status');
        const text = document.getElementById('sync-status-text');
        const source = document.getElementById('sync-source');
        if (!status || !text || !source) return;

        status.classList.remove('is-live', 'is-error', 'is-loading');

        if (state === 'loading') {
            status.classList.add('is-loading');
            text.textContent = 'Обновление данных…';
            source.textContent = '';
            return;
        }

        if (DataStore.lastUpdate) {
            text.textContent = `Обновлено: ${this.formatUpdatedAt(DataStore.lastUpdate)}`;
        } else {
            text.textContent = 'Обновлено: —';
        }

        if (DataStore.source) {
            source.textContent = `Источник: ${DataStore.source}`;
        } else {
            source.textContent = 'Источник не подключён';
        }

        if (state === 'error' || !DataStore.source) {
            status.classList.add('is-error');
        } else {
            status.classList.add('is-live');
        }

        status.title = (Donations.errors || []).join('\n');
    }
};

// === Twitch Channel Status API ===
const ChannelStatus = {
    channels: ['foximyr', 'jomsvovy2', 'deafdenis2', 'lemi_q', 'poniixfnchk', 'm1sticfool', 'yastya_', 'lisichka_gamer'],
    statuses: {},
    avatars: {},

    // Проверка статуса канала + получение аватара
    async checkChannel(channelName) {
        try {
            const query = `
                query {
                    user(login: "${channelName}") {
                        profileImageURL(width: 150)
                        stream {
                            type
                            viewersCount
                        }
                    }
                }
            `;

            const result = await TwitchAPI.graphql(query);
            const user = result?.data?.user;
            const stream = user?.stream;

            return {
                isLive: stream?.type === 'live',
                viewers: stream?.viewersCount || 0,
                avatar: user?.profileImageURL || null
            };
        } catch (e) {
            console.warn(`[ChannelStatus] Ошибка ${channelName}:`, e);
            return { isLive: false, viewers: 0, avatar: null };
        }
    },

    // Проверка всех каналов
    async checkAll() {
        const promises = this.channels.map(async (ch) => {
            const status = await this.checkChannel(ch);
            this.statuses[ch] = status;
            return { channel: ch, ...status };
        });

        return Promise.all(promises);
    },

    // Умная бегущая строка: если текст влезает — стоит, если нет — едет
    checkTextOverflow(el) {
        const viewport = el.querySelector('.status-viewport');
        const textEl = el.querySelector('.status-text');
        if (!viewport || !textEl) return;

        // Сбрасываем перед измерением, иначе transform исказит результат
        el.classList.remove('scroll-anim');
        textEl.style.transform = 'none';
        el.style.removeProperty('--scroll-dist');

        const boxWidth = viewport.clientWidth;
        const textWidth = textEl.scrollWidth;
        const overflow = textWidth - boxWidth;

        if (overflow > 1) {
            // Сдвиг ровно на ширину переполнения — конец текста доедет до края
            el.style.setProperty('--scroll-dist', `${-overflow}px`);
            el.classList.add('scroll-anim');
        }
    },

    // Обновление UI
    async updateUI() {
        const results = await this.checkAll();
        const container = document.getElementById('recommended-channels');

        results.forEach(({ channel, isLive, viewers, avatar }) => {
            const item = document.querySelector(`.channel-item[data-channel="${channel}"]`);
            if (!item) return;

            const statusEl = item.querySelector('.channel-status');
            const avatarEl = item.querySelector('.channel-avatar');

            // Обновление аватара через Twitch API
            if (avatar) {
                avatarEl.src = avatar;
                this.avatars[channel] = avatar;
            }

            if (isLive) {
                statusEl.className = 'channel-status live';
                statusEl.innerHTML =
                    '<i class="fa-solid fa-circle"></i>' +
                    '<span class="status-viewport"><span class="status-text">' +
                    `Стрим — онлайн • ${viewers} зрителей</span></span>`;
                item.classList.add('is-live');
            } else {
                statusEl.className = 'channel-status offline';
                statusEl.innerHTML =
                    '<i class="fa-solid fa-circle"></i>' +
                    '<span class="status-viewport"><span class="status-text">Не в сети</span></span>';
                item.classList.remove('is-live');
            }

            // Проверка на длинный текст и запуск анимации
            this.checkTextOverflow(statusEl);
        });

        // Сортировка: LIVE каналы первыми
        if (container) {
            const items = Array.from(container.querySelectorAll('.channel-item'));
            items.sort((a, b) => {
                const aLive = a.classList.contains('is-live') ? 0 : 1;
                const bLive = b.classList.contains('is-live') ? 0 : 1;
                return aLive - bLive;
            });
            items.forEach(item => container.appendChild(item));
        }

        console.log(`[${new Date().toLocaleTimeString()}] Статусы каналов и аватары обновлены`);
    }
};

// === Сворачиваемые секции (аккордеон) ===
const Collapsible = {
    groups: [],
    pinned: null,

    init() {
        this.groups = Array.from(document.querySelectorAll('.collapse-group'))
            .map(group => {
                const header = group.querySelector('.collapsible-header');
                return header ? { group, header } : null;
            })
            .filter(Boolean);

        const cards = new Set(this.groups.map(g => g.group.parentElement));

        this.groups.forEach(item => {
            // На старте всё закрыто — «О себе» закрывается сама,
            // а следующая секция раскрывается просто от наведения мыши
            this.collapse(item);

            // Клик — открыть/закрыть и закрепить
            item.header.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggle(item);
            });

            // Наведение — раскрыть
            item.group.addEventListener('mouseenter', () => this.expand(item));
        });

        // Уход курсора с карточки — свернуть всё незакреплённое
        cards.forEach(card => {
            if (!card) return;
            card.addEventListener('mouseleave', () => {
                this.groups.forEach(item => {
                    if (this.pinned === item) return;
                    this.collapse(item);
                });
            });
        });
    },

    isOpen(item) {
        return item.group.classList.contains('is-open');
    },

    // Раскрыть одну секцию и свернуть все остальные
    expand(item) {
        this.groups.forEach(other => {
            if (other === item) return;
            this.collapse(other);
        });

        if (this.isOpen(item)) return;
        item.group.classList.add('is-open');
        item.header.classList.add('open');
    },

    collapse(item) {
        item.group.classList.remove('is-open');
        item.header.classList.remove('open');
    },

    // Клик: закрепляет секцию (не реагирует на уход курсора)
    toggle(item) {
        // Клик по закреплённой секции — снимаем фиксацию
        if (this.pinned === item) {
            this.pinned = null;
            this.collapse(item);
            return;
        }

        // Клик по закрытой — закрепляем её
        if (!this.isOpen(item)) {
            this.pinned = item;
            this.expand(item);
            return;
        }

        // Клик по открытой, но не закреплённой — переносим фиксацию на неё
        this.pinned = item;
    }
};

// === Инициализация при загрузке страницы ===
document.addEventListener('DOMContentLoaded', () => {
    DataStore.init();

    // Показываем сохранённые данные, не дожидаясь ответа API
    if (DataStore.donators.length) UI.updateDonators(DataStore.donators);

    UI.renderSyncStatus();

    // Ручное обновление
    const refreshButton = document.getElementById('refresh-btn');
    if (refreshButton) {
        refreshButton.addEventListener('click', () => {
            UpdateSystem.refreshData({ manual: true });
        });
    }

    UpdateSystem.start();
    Collapsible.init();

    // Проверка статуса каналов каждые 30 секунд
    ChannelStatus.updateUI();
    setInterval(() => ChannelStatus.updateUI(), 30000);

    // Пересчёт автоскролла при изменении ширины окна
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            document.querySelectorAll('.channel-status').forEach(statusEl => {
                ChannelStatus.checkTextOverflow(statusEl);
            });
        }, 200);
    });
});

// === Глобальные функции для отладки ===
window.YumikaSystem = {
    config: CONFIG,
    data: DataStore,
    api: TwitchAPI,
    donations: Donations,
    update: UpdateSystem,
    animation: AnimationSystem,
    ui: UI,
    collapsible: Collapsible,

    // Ручное обновление
    refresh: () => UpdateSystem.refreshData({ manual: true }),

    // Переключение режима: true — демо, false — только реальные источники,
    // 'auto' — реальные источники с откатом на JSON/демо
    setMockMode: (enabled) => {
        CONFIG.USE_MOCK_DATA = enabled;
        console.log(`[YumikaSystem] Mock режим: ${enabled}`);
        return UpdateSystem.refreshData({ manual: true });
    },

    // Установка и запоминание токенов
    // Пример: YumikaSystem.setTokens({ donationalerts: '...' })
    // Пустая строка очищает сохранённый токен.
    setTokens: (tokens = {}) => {
        const has = (key) => Object.prototype.hasOwnProperty.call(tokens, key);

        if (has('twitch')) CONFIG.TWITCH_OAUTH_TOKEN = tokens.twitch || '';
        if (has('donationalerts')) CONFIG.DONATIONALERTS_TOKEN = tokens.donationalerts || '';
        if (has('streamelements')) CONFIG.STREAMELEMENTS_TOKEN = tokens.streamelements || '';
        if (has('streamlabs')) CONFIG.STREAMLABS_TOKEN = tokens.streamlabs || '';
        if (has('streamelementsChannelId')) CONFIG.STREAMELEMENTS_CHANNEL_ID = tokens.streamelementsChannelId || '';

        try {
            localStorage.setItem(CONFIG.TOKENS_STORAGE_KEY, JSON.stringify({
                donationalerts: CONFIG.DONATIONALERTS_TOKEN,
                streamelements: CONFIG.STREAMELEMENTS_TOKEN,
                streamlabs: CONFIG.STREAMLABS_TOKEN,
                streamelementsChannelId: CONFIG.STREAMELEMENTS_CHANNEL_ID
            }));
        } catch (e) {
            console.warn('[YumikaSystem] Не удалось сохранить токены:', e);
        }

        console.log('[YumikaSystem] Токены обновлены');
        return UpdateSystem.refreshData({ manual: true });
    },

    // Порядок источников, например ['streamelements', 'json']
    setProviderOrder: (providers) => {
        CONFIG.DONATION_PROVIDERS = Array.isArray(providers) ? providers : [];
        console.log('[YumikaSystem] Порядок источников:', CONFIG.DONATION_PROVIDERS);
        return UpdateSystem.refreshData({ manual: true });
    }
};
