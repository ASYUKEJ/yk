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

    // Токены (добавьте свои при необходимости)
    TWITCH_OAUTH_TOKEN: '',      // OAuth токен для доступа к данным
    STREAMELEMENTS_TOKEN: '',    // StreamElements API токен
    STREAMLABS_TOKEN: '',        // StreamLabs API токен

    // Режим работы
    USE_MOCK_DATA: true,         // true = тестовые данные, false = реальный API
};

// === Хранилище данных ===
const DataStore = {
    donators: [],
    memeAlerts: [],
    boosters: [],
    lastUpdate: null,
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
                lastUpdate: this.lastUpdate
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

    // Получение донатеров (требует OAuth)
    async getTopDonators() {
        // Примечание: Twitch не предоставляет публичный API для донатов
        // Используйте StreamElements, StreamLabs или собственный бэкенд
        if (CONFIG.STREAMELEMENTS_TOKEN) {
            return this.getStreamElementsDonators();
        }
        return [];
    },

    // StreamElements API
    async getStreamElementsDonators() {
        try {
            const response = await fetch(`https://api.streamelements.com/kappa/v2/tips?channel=${CONFIG.CHANNEL_NAME}&limit=5`, {
                headers: {
                    'Authorization': `Bearer ${CONFIG.STREAMELEMENTS_TOKEN}`
                }
            });
            return await response.json();
        } catch (e) {
            console.warn('[TwitchAPI] StreamElements ошибка:', e);
            return [];
        }
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
        { name: 'Naokifuri', amount: '1770 RUB', rank: 1 },
        { name: 'Леми', amount: '536,74 RUB', rank: 2 },
        { name: 'Аноним', amount: '520 RUB', rank: 3 },
        { name: 'Аteenss', amount: '400 RUB', rank: 4 },
        { name: 'Yumika_Karimey (Michealufo1250)', amount: '80 RUB', rank: 5 }
    ],

    memeAlerts: [
        { name: 'Voidbasis', amount: '1785 RUB' }
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
            const amount = `${Math.floor(Math.random() * 1000)} RUB`;
            this.donators.push({ name, amount, rank: this.donators.length + 1 });
            this.donators = this.donators.slice(0, 5);
        } else if (type === 'memeAlert') {
            const names = [];
            const name = names.length > 0 ? names[Math.floor(Math.random() * names.length)] : null;
            if (!name) return;
            const amount = `${Math.floor(Math.random() * 500)} RUB`;
            this.memeAlerts.push({ name, amount });
        } else {
            const names = [];
            const name = names.length > 0 ? names[Math.floor(Math.random() * names.length)] : null;
            if (!name) return;
            this.boosters.push({ name });
        }
    }
};

// === Система обновления ===
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
    async refreshData() {
        if (DataStore.isUpdating) return;
        DataStore.isUpdating = true;

        console.log(`[${new Date().toLocaleTimeString()}] Обновление данных...`);

        try {
            if (CONFIG.USE_MOCK_DATA) {
                // Тестовый режим
                MockData.getRandomUpdate();
                DataStore.donators = [...MockData.donators];
                DataStore.memeAlerts = [...MockData.memeAlerts];
                DataStore.boosters = [...MockData.boosters];
            } else {
                // Реальный API
                const donators = await TwitchAPI.getTopDonators();
                const boosters = await TwitchAPI.getDiscordBoosters();
                DataStore.donators = donators;
                DataStore.boosters = boosters;
            }

            DataStore.lastUpdate = new Date().toISOString();
            DataStore.saveToStorage();

            // Обновление UI
            UI.updateDonators(DataStore.donators);
            UI.updateMemeAlerts(DataStore.memeAlerts);
            UI.updateBoosters(DataStore.boosters);

            console.log(`[${new Date().toLocaleTimeString()}] Данные обновлены`);
        } catch (e) {
            console.error('[UpdateSystem] Ошибка обновления:', e);
        } finally {
            DataStore.isUpdating = false;
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
    // Обновление донатеров
    updateDonators(donators) {
        const container = document.getElementById('donators-list');
        if (!container) return;

        const medals = [
            'fa-trophy" style="color: #ffd700;',
            'fa-trophy" style="color: #c0c0c0;',
            'fa-trophy" style="color: #cd7f32;',
            'fa-medal',
            'fa-medal'
        ];

        let html = '';
        donators.forEach((d, i) => {
            const medal = medals[i] || 'fa-medal';
            html += `<p><i class="fa-solid ${medal}"></i> ${d.name} — ${d.amount}</p>`;
        });
        container.innerHTML = html;
    },

    // Обновление Meme Alerts
    updateMemeAlerts(alerts) {
        const container = document.getElementById('memealerts-list');
        if (!container) return;

        let html = '';
        alerts.forEach(a => {
            html += `<p><i class="fa-solid fa-bolt"></i> ${a.name} — ${a.amount}</p>`;
        });
        container.innerHTML = html;
    },

    // Обновление бустеров
    updateBoosters(boosters) {
        const container = document.getElementById('boosters-list');
        if (!container) return;

        let html = '';
        boosters.forEach(b => {
            html += `<p><i class="fa-solid fa-star"></i> ${b.name}</p>`;
        });
        container.innerHTML = html;
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
    defaultItem: null,
    closeDelay: 250,

    init() {
        this.groups = Array.from(document.querySelectorAll('.collapse-group'))
            .map(group => {
                const header = group.querySelector('.collapsible-header');
                return header ? { group, header, open: false } : null;
            })
            .filter(Boolean);

        const cards = new Set(this.groups.map(g => g.group.parentElement));

        this.groups.forEach(item => {
            // Секция с .is-open в разметке открыта по умолчанию
            if (this.isOpen(item)) {
                this.defaultItem = item;
                this.pinned = item;
            } else {
                this.collapse(item);
            }

            // Клик — открыть/закрыть и закрепить
            item.header.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.toggle(item);
            });

            // Наведение — раскрыть
            item.group.addEventListener('mouseenter', () => this.expand(item));
        });

        // Уход курсора с карточки:
        //   - если секция закреплена кликом — не трогаем
        //   - иначе возвращаем дефолтную «О себе», чтобы колонка не пустовала
        cards.forEach(card => {
            if (!card) return;
            card.addEventListener('mouseleave', () => {
                if (this.pinned) return;
                this.collapseAll();
                if (this.defaultItem) {
                    this.defaultItem.group.classList.add('is-open');
                    this.defaultItem.header.classList.add('open');
                }
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

    collapseAll() {
        this.groups.forEach(item => this.collapse(item));
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
    update: UpdateSystem,
    animation: AnimationSystem,
    ui: UI,
    collapsible: Collapsible,

    // Ручное обновление
    refresh: () => UpdateSystem.refreshData(),

    // Переключение режима
    setMockMode: (enabled) => {
        CONFIG.USE_MOCK_DATA = enabled;
        console.log(`[YumikaSystem] Mock режим: ${enabled}`);
    },

    // Установка токенов
    setTokens: (tokens) => {
        if (tokens.twitch) CONFIG.TWITCH_OAUTH_TOKEN = tokens.twitch;
        if (tokens.streamelements) CONFIG.STREAMELEMENTS_TOKEN = tokens.streamelements;
        if (tokens.streamlabs) CONFIG.STREAMLABS_TOKEN = tokens.streamlabs;
        console.log('[YumikaSystem] Токены обновлены');
    }
};
