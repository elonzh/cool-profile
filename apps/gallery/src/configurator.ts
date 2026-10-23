import { schemaAt } from '@cool-profile/card-kit/wire';
import type { MediaOptions } from '@cool-profile/card-kit/media';
import type { CatalogCard, GallerySample, GalleryEntry } from './model.js';
import { isAnimatedSvg, requestArtifacts, sampleFor, wireValue } from './model.js';
import { messages } from './copy.js';
import type { MessageKey, UiLocale } from './copy.js';

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error('Missing element: ' + id);
  return value as T;
}
export function createConfigurator(initialCard: CatalogCard, getLocale: () => UiLocale) {
  const dialog = element<HTMLDialogElement>('configuration');
  const form = element<HTMLFormElement>('settings');
  const image = element<HTMLImageElement>('preview');
  const empty = element<HTMLParagraphElement>('empty-preview');
  const badge = element<HTMLSpanElement>('preview-badge');
  const download = element<HTMLAnchorElement>('download');
  const play = element<HTMLButtonElement>('play');
  const generate = element<HTMLButtonElement>('generate');
  const staticGallery = import.meta.env.MODE === 'pages';
  generate.hidden = staticGallery;
  element<HTMLElement>('tab-url').hidden = staticGallery;
  const copy = element<HTMLButtonElement>('copy');
  const status = element<HTMLParagraphElement>('request-status');
  const examplePicker = element<HTMLSelectElement>('example');
  const formatPicker = element<HTMLSelectElement>('format');
  const themePicker = element<HTMLSelectElement>('theme');
  const localePicker = element<HTMLSelectElement>('locale');
  const seed = element<HTMLInputElement>('seed');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let card = initialCard;
  let exampleIndex = 0;
  let fields = new Map<string, string>();
  let media: MediaOptions = {
    format: card.formats[0]!,
    theme: 'default',
    locale: 'zh-CN',
    seed: 0,
  };
  let outputKind: 'cli' | 'url' | 'config' = 'cli';
  let outputs: ReturnType<typeof requestArtifacts> | undefined;
  let pending: AbortController | undefined;
  let motionAllowed = !reducedMotion.matches;
  let blobUrl: string | undefined;
  let preview:
    | (Pick<GallerySample, 'url' | 'animated' | 'format'> & {
        poster?: string;
        kind: 'sample' | 'generated';
        identity: string;
      })
    | undefined;

  const text = (key: MessageKey) => messages[getLocale()][key];
  const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
  const caseIdentity = (params: Record<string, unknown>) =>
    Object.values(params).map(wireValue).join(' / ');
  const cardName = (item: CatalogCard) => item.name[getLocale()] ?? item.id;

  function notice(message: string, error = false) {
    status.textContent = message;
    status.hidden = !message;
    status.classList.toggle('error', error);
  }

  function options(
    select: HTMLSelectElement,
    values: readonly string[],
    current: string,
    label: (value: string) => string = (value) => value,
  ) {
    select.replaceChildren(
      ...values.map((value) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label(value);
        return option;
      }),
    );
    select.value = current;
  }

  function updateOutputs() {
    try {
      outputs = requestArtifacts(card, media, fields, location.origin);
      element<HTMLElement>('output').textContent = outputs[outputKind];
      copy.disabled = false;
    } catch (error) {
      outputs = undefined;
      element<HTMLElement>('output').textContent = text('invalid') + ': ' + errorText(error);
      copy.disabled = true;
    }
    copy.textContent = text('copy');
  }

  function renderPreview() {
    const available = preview && (!preview.animated || motionAllowed || preview.poster);
    image.hidden = !available;
    if (available && preview) {
      const src = preview.animated && !motionAllowed ? preview.poster! : preview.url;
      if (image.getAttribute('src') !== src) image.src = src;
    } else image.removeAttribute('src');
    image.alt = preview ? cardName(card) + ' · ' + preview.identity : '';
    empty.hidden = Boolean(available);
    empty.textContent = preview ? text('ready') : text('noSample');
    badge.textContent = preview
      ? (preview.kind === 'sample'
          ? text('sample') + ' · ' + preview.identity
          : text('generated')) +
        ' · ' +
        preview.format.toUpperCase()
      : '';
    badge.title = badge.textContent;
    play.hidden = !preview?.animated;
    play.textContent = text(motionAllowed ? 'stop' : 'play');
    download.hidden = !preview;
    if (preview) {
      download.href = preview.url;
      download.download = card.id.replaceAll('/', '-') + '.' + preview.format;
      download.textContent = text(preview.kind === 'sample' ? 'downloadSample' : 'download');
    }
    element<HTMLElement>('canvas').classList.toggle('dark-preview', media.theme === 'dark');
  }

  function useSample() {
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      blobUrl = undefined;
    }
    const example = card.cases[exampleIndex];
    const sample = sampleFor(example, media);
    preview = sample
      ? { ...sample, kind: 'sample', identity: caseIdentity(example!.params) }
      : undefined;
    renderPreview();
  }

  function changed() {
    pending?.abort();
    pending = undefined;
    generate.disabled = false;
    generate.textContent = text('generate');
    form.removeAttribute('aria-busy');
    notice('');
    updateOutputs();
    useSample();
  }

  function field(name: string): HTMLLabelElement {
    const schema = schemaAt(card.parameterSchema, [name]);
    const label = document.createElement('label');
    const caption = document.createElement('span');
    caption.textContent =
      name === 'source' || name === 'subject'
        ? text(name)
        : getLocale() === 'zh-CN'
          ? (schema.description ?? name)
          : name;
    label.append(caption);
    let input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const values =
      schema.enum ??
      (Object.hasOwn(schema, 'const')
        ? [schema.const]
        : schema.type === 'boolean'
          ? [true, false]
          : undefined);
    if (values) {
      const select = document.createElement('select');
      options(
        select,
        ['', ...values.map(wireValue)],
        fields.get(name) ?? '',
        (value) => value || text('defaultValue'),
      );
      input = select;
    } else if (schema.type === 'string' || schema.type === 'number' || schema.type === 'integer') {
      const box = document.createElement('input');
      box.type = schema.type === 'string' ? 'text' : 'number';
      box.placeholder = text('defaultValue');
      if (typeof schema.minimum === 'number') box.min = String(schema.minimum);
      if (typeof schema.maximum === 'number') box.max = String(schema.maximum);
      if (typeof schema.maxLength === 'number') box.maxLength = schema.maxLength;
      box.step = schema.type === 'integer' ? '1' : 'any';
      box.autocomplete = 'off';
      input = box;
    } else {
      const box = document.createElement('textarea');
      box.rows = 3;
      box.placeholder = text('json');
      input = box;
    }
    input.name = name;
    input.value = fields.get(name) ?? '';
    input.addEventListener('input', () => {
      fields.set(name, input.value);
      changed();
    });
    label.append(input);
    return label;
  }

  function renderFields() {
    const names = Object.keys(card.parameterSchema.properties ?? {});
    const primary = Object.keys(card.cases[exampleIndex]?.params ?? {}).filter((name) =>
      names.includes(name),
    );
    const primaryNames = primary.length ? primary : names.slice(0, 2);
    element<HTMLElement>('primary-fields').replaceChildren(...primaryNames.map(field));
    element<HTMLElement>('advanced-fields').replaceChildren(
      ...names.filter((name) => !primaryNames.includes(name)).map(field),
    );
  }

  function renderCopy() {
    dialog.querySelector('.outputs')!.setAttribute('aria-label', text('usage'));
    element<HTMLElement>('preview-section').setAttribute('aria-label', text('preview'));
    for (const node of dialog.querySelectorAll<HTMLElement>('[data-copy]'))
      node.textContent = text(node.dataset.copy as MessageKey);
    element<HTMLElement>('card-title').textContent = cardName(card);
    element<HTMLElement>('card-path').textContent = card.id;
    element<HTMLButtonElement>('close-configuration').setAttribute('aria-label', text('close'));
    element<HTMLElement>('tabs').setAttribute('aria-label', text('usage'));
    options(formatPicker, card.formats, media.format, (value) => value.toUpperCase());
    options(themePicker, card.themes, media.theme, (value) =>
      Object.hasOwn(messages[getLocale()], value) ? text(value as MessageKey) : value,
    );
    options(localePicker, card.locales, media.locale, (value) =>
      value === 'zh-CN' ? '中文' : value === 'en' ? 'English' : value,
    );
    options(
      examplePicker,
      card.cases.map((_, index) => String(index)),
      String(exampleIndex),
      (value) => caseIdentity(card.cases[Number(value)]!.params),
    );
    examplePicker.disabled = !card.cases.length;
    renderFields();
    renderPreview();
    updateOutputs();
  }

  function open(entry: GalleryEntry) {
    pending?.abort();
    pending = undefined;
    card = entry.card;
    exampleIndex = entry.caseIndex;
    fields = new Map(
      Object.entries(card.cases[exampleIndex]!.params).map(([name, value]) => [
        name,
        wireValue(value),
      ]),
    );
    media = {
      format: entry.sample.format,
      theme: entry.sample.theme,
      locale: entry.sample.locale,
      seed: 0,
    };
    seed.value = '0';
    generate.disabled = false;
    generate.textContent = text('generate');
    form.removeAttribute('aria-busy');
    notice('');
    useSample();
    renderCopy();
    dialog.showModal();
    element<HTMLElement>('dialog-content').scrollTop = 0;
  }

  examplePicker.addEventListener('change', () => {
    exampleIndex = Number(examplePicker.value);
    fields = new Map(
      Object.entries(card.cases[exampleIndex]!.params).map(([name, value]) => [
        name,
        wireValue(value),
      ]),
    );
    renderFields();
    changed();
  });
  for (const select of [formatPicker, themePicker, localePicker])
    select.addEventListener('change', () => {
      media = {
        ...media,
        format: formatPicker.value as MediaOptions['format'],
        theme: themePicker.value,
        locale: localePicker.value,
      };
      changed();
    });
  seed.addEventListener('input', () => {
    media = { ...media, seed: seed.value === '' ? 0 : Number(seed.value) };
    changed();
  });
  play.addEventListener('click', () => {
    motionAllowed = !motionAllowed;
    renderPreview();
  });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) motionAllowed = false;
    renderPreview();
  });
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('[data-output]')].filter(
    (tab) => !tab.hidden,
  );
  for (const tab of tabs)
    tab.addEventListener('click', () => {
      outputKind = tab.dataset.output as typeof outputKind;
      for (const item of tabs) {
        const selected = item === tab;
        item.setAttribute('aria-selected', String(selected));
        item.tabIndex = selected ? 0 : -1;
      }
      element<HTMLElement>('output-panel').setAttribute('aria-labelledby', tab.id);
      updateOutputs();
    });
  element<HTMLElement>('tabs').addEventListener('keydown', (event) => {
    const current = tabs.findIndex((tab) => tab === document.activeElement);
    const index =
      event.key === 'ArrowRight'
        ? (current + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (current + tabs.length - 1) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : -1;
    if (index >= 0) {
      event.preventDefault();
      tabs[index]!.focus();
      tabs[index]!.click();
    }
  });
  copy.addEventListener('click', async () => {
    if (!outputs) return;
    try {
      await navigator.clipboard.writeText(outputs[outputKind]);
      copy.textContent = text('copied');
    } catch {
      notice(text('copyFailed'), true);
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (staticGallery) return;
    updateOutputs();
    if (!outputs || !form.reportValidity()) {
      notice(text('invalid'), true);
      return;
    }
    pending?.abort();
    const controller = new AbortController();
    pending = controller;
    generate.disabled = true;
    generate.textContent = text('generating');
    form.setAttribute('aria-busy', 'true');
    notice('');
    try {
      const response = await fetch(outputs.url, { signal: controller.signal });
      if (!response.ok) {
        const body: unknown = await response.json();
        const message =
          body &&
          typeof body === 'object' &&
          'error' in body &&
          body.error &&
          typeof body.error === 'object' &&
          'message' in body.error
            ? String(body.error.message)
            : 'HTTP ' + response.status;
        throw new Error(message);
      }
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) throw new Error('Expected an image response');
      const animated =
        media.format === 'gif' ||
        media.format === 'webp' ||
        (media.format === 'svg' && isAnimatedSvg(await blob.text()));
      controller.signal.throwIfAborted();
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      blobUrl = URL.createObjectURL(blob);
      preview = {
        url: blobUrl,
        animated,
        format: media.format,
        kind: 'generated',
        identity: caseIdentity(outputs.params),
      };
      renderPreview();
    } catch (error) {
      if (!controller.signal.aborted) notice(text('failed') + ': ' + errorText(error), true);
    } finally {
      if (pending === controller) {
        pending = undefined;
        generate.disabled = false;
        generate.textContent = text('generate');
        form.removeAttribute('aria-busy');
      }
    }
  });

  element<HTMLButtonElement>('close-configuration').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    )
      dialog.close();
  });
  dialog.addEventListener('close', () => {
    pending?.abort();
    pending = undefined;
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = undefined;
    preview = undefined;
    image.removeAttribute('src');
  });
  return { open, localize: renderCopy };
}
