export class Localization {
    constructor() {
        this.currentLocale = 'ru';
        this.translations = {};
        this.availableLocales = ['ru', 'en'];
        
        // Список стран СНГ и русскоязычных регионов
        this.russianLocales = [
            'ru', 'ru-RU', 'ru-UA', 'ru-BY', 'ru-KZ', 'ru-KG', 'ru-MD', 'ru-TJ', 'ru-TM', 'ru-UZ',
            'be', 'uk', 'kk', 'ky', 'tg', 'tk', 'uz', 'az', 'hy', 'ka', 'mo'
        ];
    }

    async loadTranslations() {
        try {
            const response = await fetch('/i18n.json');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            this.translations = await response.json();
            
            // Проверяем сохранённый язык в localStorage
            const savedLocale = localStorage.getItem('locale');
            
            if (savedLocale && this.availableLocales.includes(savedLocale)) {
                // Если есть сохранённый язык - используем его
                this.currentLocale = savedLocale;
            } else {
                // Иначе определяем язык по браузеру
                this.currentLocale = this.detectBrowserLanguage();
                // Сохраняем определённый язык в localStorage
                localStorage.setItem('locale', this.currentLocale);
            }
            
            document.documentElement.lang = this.currentLocale;
            document.documentElement.setAttribute('data-locale', this.currentLocale);
            
            return this.translations;
        } catch (error) {
            console.error('Failed to load translations:', error);
            // Fallback переводы
            this.translations = {
                ru: { 
                    home: 'Главная', 
                    navigation: 'Навигация',
                    loading: 'Загрузка...'
                },
                en: { 
                    home: 'Home', 
                    navigation: 'Navigation',
                    loading: 'Loading...'
                }
            };
            return this.translations;
        }
    }

    detectBrowserLanguage() {
        const browserLang = navigator.language || navigator.userLanguage || 'en';
        
        // Проверяем, относится ли язык браузера к русскоязычным
        const isRussian = this.russianLocales.some(locale => 
            browserLang.toLowerCase() === locale.toLowerCase() ||
            browserLang.toLowerCase().startsWith(locale.toLowerCase())
        );
        
        return isRussian ? 'ru' : 'en';
    }

    t(key, params = {}) {
        const translation = this.translations[this.currentLocale]?.[key] || 
                           this.translations['en']?.[key] || 
                           key;
        
        return translation.replace(/\{(\w+)\}/g, (match, paramName) => {
            return params[paramName] !== undefined ? params[paramName] : match;
        });
    }

    setLocale(locale) {
        if (this.availableLocales.includes(locale)) {
            this.currentLocale = locale;
            localStorage.setItem('locale', locale);
            document.documentElement.lang = locale;
            document.documentElement.setAttribute('data-locale', locale);
            return true;
        }
        return false;
    }

    getCurrentLocale() {
        return this.currentLocale;
    }

    getAvailableLocales() {
        return this.availableLocales;
    }
}