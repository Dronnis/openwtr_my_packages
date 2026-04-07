import { UIHelper } from '../shared/UIHelper.js';
import { loadingManager } from '../shared/LoadingManager.js';

export class IndexPage {
    constructor(contentLoader, localization, config) {
        this.contentLoader = contentLoader;
        this.localization = localization;
        this.config = config;
    }

    async render() {
        const main = document.querySelector('main');
        if (!main) return;
        
        const rootContent = await this.contentLoader.loadFolderContent('');
        
        let html = `<div class="main-content">`;
        
        // Messages
        for (const msg of rootContent.messages) {
            html += UIHelper.renderMessage(msg.content, msg.type);
        }
        
        // Latest Release Banner
        if (this.config?.mainPage?.latestRelease) {
            const latestPath = this.config.mainPage.latestRelease;
            const latestNode = this.contentLoader.getNodeInfo(latestPath);
            const latestInfo = latestNode?.__INFO__ || latestNode;
            
            if (latestInfo && latestInfo.downloadFile) {
                const downloadUrl = `${latestPath}/${latestInfo.downloadFile}`;
                const versionName = latestPath.split('/').pop();
                const exists = await this.contentLoader.fileExists(downloadUrl);
                
                if (exists) {
                    html += `
                        <div class="latest-release-banner">
                            <div class="banner-icon">🎉</div>
                            <div class="banner-content">
                                <h2>${this.localization.t('latest_release')}: ${versionName}</h2>
                                <a href="${downloadUrl}" class="download-btn" download>
                                    ⬇️ ${this.localization.t('download')} ${latestInfo.downloadFile}
                                </a>
                            </div>
                        </div>
                    `;
                }
            }
        }
        
        // Header
        if (rootContent.header) html += rootContent.header;
        
        // Changelog
        if (this.config?.mainPage?.showChangelog && this.config?.mainPage?.changelogFile) {
            const changelogPath = this.config.mainPage.changelogFile;
            const exists = await this.contentLoader.fileExists(changelogPath);
            if (exists) {
                const changelogHtml = await this.contentLoader.loadMarkdown(changelogPath);
                if (changelogHtml) {
                    html += `<div class="changelog-preview"><h2>📝 ${this.localization.t('whats_new')}</h2>${changelogHtml}</div>`;
                }
            }
        }
        
        // Footer
        if (rootContent.footer) html += rootContent.footer;
        
        html += `</div>`;
        main.innerHTML = html;
    }
}