export class Localization {
    constructor() {
        this.currentLocale = 'ru';
        this.translations = {};
        this.availableLocales = ['ru', 'en'];
    }

    async loadTranslations() {
        try {
            const response = await fetch('/i18n.json');
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            this.translations = await response.json();
            
            const savedLocale = localStorage.getItem('locale');
            if (savedLocale && this.availableLocales.includes(savedLocale)) {
                this.currentLocale = savedLocale;
            } else {
                const browserLang = navigator.language.split('-')[0];
                if (this.availableLocales.includes(browserLang)) {
                    this.currentLocale = browserLang;
                }
            }
            
            document.documentElement.lang = this.currentLocale;
            return this.translations;
        } catch (error) {
            console.error('Failed to load translations:', error);
            this.translations = {
                ru: { home: 'Главная', navigation: 'Навигация' },
                en: { home: 'Home', navigation: 'Navigation' }
            };
            return this.translations;
        }
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