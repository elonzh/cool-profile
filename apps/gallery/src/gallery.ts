import type { CatalogCard, GalleryEntry } from './model.js';
import { galleryEntries, wireValue } from './model.js';
import { labelFor, messages } from './copy.js';
import type { UiLocale, MessageKey } from './copy.js';

export function createGallery(
  cards: readonly CatalogCard[],
  getLocale: () => UiLocale,
  open: (entry: GalleryEntry) => void,
) {
  const cases = cards.flatMap((card) => card.cases);
  const collections = document.getElementById('collections')!;
  const navigation = document.getElementById('collection-nav')!;
  const total = document.getElementById('collection-total')!;
  const search = document.getElementById('search') as HTMLInputElement;
  const sources = document.getElementById('source-filter') as HTMLSelectElement;
  const languages = document.getElementById('language-filter') as HTMLSelectElement;
  const empty = document.getElementById('gallery-empty')!;
  const toolbar = document.getElementById('gallery-filters')!;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const sections = new Map<string, HTMLElement>();
  const links = new Map<string, HTMLAnchorElement>();
  let source = '';
  let locale = 'zh-CN';
  let query = '';
  let frame = 0;
  const text = (key: MessageKey) => messages[getLocale()][key];
  const cardName = (card: CatalogCard) => card.name[getLocale()] ?? card.id;
  const countLabel = (count: number) =>
    count.toLocaleString(getLocale()) +
    (getLocale() === 'zh-CN' ? ' 个示例' : count === 1 ? ' example' : ' examples');
  const sourceName = (value: string) =>
    value === 'github' ? 'GitHub' : value === 'cnb' ? 'CNB' : value;
  const extraParams = (entry: GalleryEntry) =>
    Object.entries(entry.card.cases[entry.caseIndex]!.params)
      .filter(([key]) => key !== 'source' && key !== 'subject')
      .map(([, value]) => labelFor(wireValue(value), getLocale()));
  const entryTitle = (entry: GalleryEntry) =>
    [labelFor(entry.sample.theme, getLocale()), ...extraParams(entry)].join(' · ');

  function activeNavigation() {
    frame = 0;
    const top = toolbar.getBoundingClientRect().bottom + 32;
    let current = '';
    for (const card of cards) {
      const section = sections.get(card.id)!;
      if (!section.hidden && section.getBoundingClientRect().top <= top) current = card.id;
    }
    for (const [id, link] of links) {
      if (id === current) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }

  function tile(entry: GalleryEntry) {
    const { sample, card, caseIndex } = entry;
    const params = card.cases[caseIndex]!.params;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'example-tile';
    button.dataset.theme = sample.theme;
    button.dataset.card = card.id;
    const name = entryTitle(entry);
    const sourceLabel = params.source ? sourceName(String(params.source)) : '';
    button.setAttribute(
      'aria-label',
      [
        cardName(card),
        name,
        sourceLabel,
        params.subject,
        sample.locale,
        sample.format.toUpperCase(),
      ]
        .filter(Boolean)
        .join(' · '),
    );
    const visual = document.createElement('span');
    visual.className = 'tile-visual';
    visual.style.aspectRatio = String(Math.min(2.4, Math.max(1.45, sample.width / sample.height)));
    const image = document.createElement('img');
    image.src = sample.poster;
    image.alt = '';
    image.loading = 'lazy';
    image.decoding = 'async';
    image.width = sample.width;
    image.height = sample.height;
    visual.append(image);
    const format = document.createElement('span');
    format.className = 'tile-format';
    format.textContent = sample.format.toUpperCase();
    if (sample.animated) format.classList.add('is-animated');
    visual.append(format);
    const caption = document.createElement('span');
    caption.className = 'tile-caption';
    const title = document.createElement('strong');
    title.textContent = name;
    const arrow = document.createElement('span');
    arrow.className = 'tile-open';
    arrow.innerHTML =
      '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5"/></svg>';
    caption.append(title, arrow);
    const detail = document.createElement('span');
    detail.className = 'tile-detail';
    const identity = document.createElement('span');
    identity.textContent = String(
      params.subject ?? Object.values(params).map(wireValue).join(' / '),
    );
    if (sourceLabel) {
      const platform = document.createElement('span');
      platform.className = 'platform-label';
      platform.textContent = sourceLabel;
      detail.append(platform);
    }
    detail.append(identity);
    button.append(visual, caption, detail);
    if (sample.animated) {
      const animate = () => {
        if (!reducedMotion.matches) image.src = sample.url;
      };
      const stop = () => {
        image.src = sample.poster;
      };
      button.addEventListener('pointerenter', animate);
      button.addEventListener('pointerleave', stop);
      button.addEventListener('focus', animate);
      button.addEventListener('blur', stop);
      button.addEventListener('click', stop);
    }
    button.addEventListener('click', () => {
      button.focus({ preventScroll: true });
      open(entry);
    });
    return button;
  }

  function navLink(name: string, target: string, count: number) {
    const link = document.createElement('a');
    link.href = '#' + encodeURIComponent(target || 'gallery-start');
    const label = document.createElement('span');
    label.textContent = name;
    const amount = document.createElement('span');
    amount.className = 'nav-count';
    amount.textContent = String(count);
    link.append(label, amount);
    if (!count) {
      link.setAttribute('aria-disabled', 'true');
      link.tabIndex = -1;
      link.addEventListener('click', (event) => event.preventDefault());
    }
    links.set(target, link);
    return link;
  }

  function render() {
    const visible = galleryEntries(cards, (entry) => {
      const { sample, card, caseIndex } = entry;
      const params = card.cases[caseIndex]!.params;
      if (source && params.source !== source) return false;
      if (locale && sample.locale !== locale) return false;
      const terms = [
        card.id,
        ...Object.values(card.name),
        sample.theme,
        entryTitle(entry),
        ...Object.values(params).map(wireValue),
      ]
        .join(' ')
        .toLocaleLowerCase(getLocale());
      return !query || terms.includes(query.toLocaleLowerCase(getLocale()));
    });
    total.textContent = countLabel(visible.length);
    empty.hidden = visible.length > 0;
    links.clear();
    const nav = [navLink(text('allExamples'), '', visible.length)];
    for (const card of cards) {
      const matches = visible.filter((entry) => entry.card === card);
      let section = sections.get(card.id);
      if (!section) {
        section = document.createElement('section');
        section.id = card.id;
        section.className = 'collection';
        sections.set(card.id, section);
        collections.append(section);
      }
      section.hidden = !matches.length;
      const heading = document.createElement('header');
      heading.className = 'collection-heading';
      const title = document.createElement('h2');
      title.id = 'title-' + card.id;
      title.textContent = cardName(card);
      section.setAttribute('aria-labelledby', title.id);
      const count = document.createElement('span');
      count.textContent = countLabel(matches.length);
      heading.append(title, count);
      const grid = document.createElement('div');
      grid.className = 'example-grid';
      grid.append(...matches.map(tile));
      section.replaceChildren(heading, grid);
      nav.push(navLink(cardName(card), card.id, matches.length));
    }
    navigation.replaceChildren(...nav);
    navigation.setAttribute('aria-label', text('navigation'));
    activeNavigation();
  }

  function fill(
    select: HTMLSelectElement,
    values: string[],
    selected: string,
    all: string,
    label: (value: string) => string,
  ) {
    select.replaceChildren(
      ...['', ...values].map((value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value ? label(value) : all;
        return option;
      }),
    );
    select.value = selected;
  }
  function localize() {
    sources.setAttribute('aria-label', text('platform'));
    languages.setAttribute('aria-label', text('mediaLanguage'));
    search.placeholder = text('searchPlaceholder');
    fill(
      sources,
      [
        ...new Set(
          cases
            .map((example) => example.params.source)
            .filter((value): value is string => typeof value === 'string'),
        ),
      ],
      source,
      text('allPlatforms'),
      sourceName,
    );
    fill(
      languages,
      [...new Set(cases.flatMap((example) => example.samples.map((sample) => sample.locale)))],
      locale,
      text('allLanguages'),
      (value) => (value === 'zh-CN' ? '中文' : value === 'en' ? 'English' : value),
    );
    render();
  }
  toolbar.addEventListener('submit', (event) => event.preventDefault());
  search.addEventListener('input', () => {
    query = search.value.trim();
    render();
  });
  sources.addEventListener('change', () => {
    source = sources.value;
    render();
  });
  languages.addEventListener('change', () => {
    locale = languages.value;
    render();
  });
  document.getElementById('clear-filters')!.addEventListener('click', () => {
    source = '';
    locale = 'zh-CN';
    query = '';
    search.value = '';
    localize();
    search.focus();
  });
  window.addEventListener(
    'scroll',
    () => {
      if (!frame) frame = requestAnimationFrame(activeNavigation);
    },
    { passive: true },
  );
  new ResizeObserver(() => {
    document.documentElement.style.setProperty(
      '--mobile-sidebar-height',
      document.querySelector<HTMLElement>('.sidebar')!.getBoundingClientRect().height + 'px',
    );
  }).observe(document.querySelector('.sidebar')!);
  reducedMotion.addEventListener('change', () => {
    if (!reducedMotion.matches) return;
    for (const image of collections.querySelectorAll<HTMLImageElement>('img')) {
      const sample = cases
        .flatMap((example) => example.samples)
        .find((sample) => sample.url === image.getAttribute('src'));
      if (sample) image.src = sample.poster;
    }
  });
  return { localize };
}
