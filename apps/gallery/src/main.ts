import { catalog } from '../../../generated/card-catalog.ts';
import { createConfigurator } from './configurator.js';
import { createGallery } from './gallery.js';
import type { UiLocale } from './copy.js';
import { messages } from './copy.js';
import './style.css';

let ui: UiLocale = new URLSearchParams(location.search).get('ui') === 'en' ? 'en' : 'zh-CN';
const getLocale = () => ui;
const configurator = createConfigurator(catalog[0]!, getLocale);
const gallery = createGallery(catalog, getLocale, configurator.open);
const language = document.getElementById('ui-language')!;
function localize() {
  document.documentElement.lang = ui;
  for (const node of document.querySelectorAll<HTMLElement>('[data-global-copy]'))
    node.textContent = messages[ui][node.dataset.globalCopy as keyof (typeof messages)['zh-CN']];
  language.textContent = ui === 'zh-CN' ? 'English' : '中文';
  language.setAttribute('aria-label', messages[ui].uiLanguage);
  gallery.localize();
  configurator.localize();
}
language.addEventListener('click', () => {
  ui = ui === 'zh-CN' ? 'en' : 'zh-CN';
  const url = new URL(location.href);
  url.searchParams.set('ui', ui);
  history.replaceState(null, '', url);
  localize();
});
localize();
