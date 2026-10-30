import type { ModelId } from "@/lib/models";

/** Interface language. The document is left alone when this changes. */
export const LOCALES = [
  { id: "pt-BR", label: "Português (Brasil)", flag: "🇧🇷" },
  { id: "en-US", label: "English (US)", flag: "🇺🇸" },
  { id: "es-AR", label: "Español (Argentina)", flag: "🇦🇷" },
  { id: "zh-CN", label: "中文（简体）", flag: "🇨🇳" },
] as const;

export type Locale = (typeof LOCALES)[number]["id"];

export const DEFAULT_LOCALE: Locale = "en-US";
export const LOCALE_STORAGE_KEY = "coauthor.locale";

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((locale) => locale.id === value);
}

/** Browser language, mapped onto the four locales this app ships. */
export function matchLocale(language: string): Locale {
  const tag = language.toLowerCase();
  if (tag.startsWith("pt")) return "pt-BR";
  if (tag.startsWith("es")) return "es-AR";
  if (tag.startsWith("zh")) return "zh-CN";
  return DEFAULT_LOCALE;
}

export function readStoredLocale(key: string, fallback: Locale): Locale {
  try {
    const saved = localStorage.getItem(key);
    if (isLocale(saved)) return saved;
  } catch {
    // Private mode can throw. Fall through to the fallback.
  }
  return fallback;
}

export function readLocale(): Locale {
  const language = typeof navigator === "undefined" ? "" : navigator.language;
  return readStoredLocale(LOCALE_STORAGE_KEY, matchLocale(language));
}

/**
 * Button labels are translated. The instruction sent to the model stays in
 * English so switching the interface does not translate the document.
 */
export const QUICK_ACTIONS = [
  { id: "improve", instruction: "Improve clarity and flow without changing the meaning." },
  { id: "shorten", instruction: "Make this more concise. Cut filler, keep every point." },
  { id: "expand", instruction: "Expand this with one or two concrete details or examples." },
  { id: "grammar", instruction: "Fix spelling, grammar and punctuation only." },
  { id: "formal", instruction: "Rewrite in a more formal, professional tone." },
  { id: "casual", instruction: "Rewrite in a relaxed, conversational tone." },
] as const;

export type QuickId = (typeof QUICK_ACTIONS)[number]["id"];

/** Sent to the model in English so the request does not depend on the interface language. */
export function translateInstruction(locale: Locale): string {
  const item = LOCALES.find((entry) => entry.id === locale)!;
  return `Translate the text into ${item.label} (${item.id}). Preserve Markdown structure, links, code spans, and list markers. Do not add a preamble, notes, or code fences. Keep the meaning.`;
}

/** Inverse of translateInstruction, so the mock can't drift from the wording. */
export function translationLocale(instruction: string): Locale | null {
  return LOCALES.find((entry) => translateInstruction(entry.id) === instruction)?.id ?? null;
}

export type Messages = {
  product: string;
  tagline: string;
  language: string;
  documentLanguage: string;
  documentLanguageHint: string;
  acceptAll: string;
  rejectAll: string;
  acceptChunk: string;
  rejectChunk: string;
  go: string;
  refine: string;
  thinking: string;
  wholeDocument: string;
  reviewHint: string;
  placeholder: string;
  refinePlaceholder: string;
  nothing: string;
  textChanged: string;
  collabOff: string;
  loadingDoc: string;
  loadFailed: string;
  editing(count: number): string;
  generic: string;
  documentTooLong: string;
  translationTooLong: string;
  missingKey: string;
  mock: string;
  noKey: string;
  quick: Record<QuickId, string>;
  tier: { fast: string; quality: string };
  price: Record<ModelId, string>;
  selection(count: number): string;
  changes(count: number): string;
  lastRequest(amount: string): string;
  thisSession(amount: string): string;
  budgetLeft(remaining: string, limit: string): string;
  keyUsage(amount: string): string;
  budgetExhausted(remaining: string): string;
  requestFailed(status: number): string;
  invalidRequest: string;
  upstreamError: string;
};

const prices = {
  "en-US": {
    "anthropic/claude-haiku-5.5": "$0.10 in / $0.50 out per 1M tokens",
    "openai/gpt-6-luna": "$0.10 in / $0.50 out per 1M tokens",
    "anthropic/claude-sonnet-5.5": "$2 in / $10 out per 1M tokens, about 20× Fast",
  },
  "pt-BR": {
    "anthropic/claude-haiku-5.5": "US$ 0,10 entrada / US$ 0,50 saída por 1M tokens",
    "openai/gpt-6-luna": "US$ 0,10 entrada / US$ 0,50 saída por 1M tokens",
    "anthropic/claude-sonnet-5.5": "US$ 2 entrada / US$ 10 saída por 1M tokens, cerca de 20× o Rápido",
  },
  "es-AR": {
    "anthropic/claude-haiku-5.5": "US$ 0,10 de entrada / US$ 0,50 de salida por millón de tokens",
    "openai/gpt-6-luna": "US$ 0,10 de entrada / US$ 0,50 de salida por millón de tokens",
    "anthropic/claude-sonnet-5.5": "US$ 2 de entrada / US$ 10 de salida por millón, unas 20× Rápido",
  },
  "zh-CN": {
    "anthropic/claude-haiku-5.5": "每百万 token：输入 $0.10 / 输出 $0.50",
    "openai/gpt-6-luna": "每百万 token：输入 $0.10 / 输出 $0.50",
    "anthropic/claude-sonnet-5.5": "每百万 token：输入 $2 / 输出 $10，约为快速档的 20 倍",
  },
} as const satisfies Record<Locale, Record<ModelId, string>>;

export const messages: Record<Locale, Messages> = {
  "en-US": {
    product: "Co-author",
    tagline: "Write Markdown. Select some text, ask for a change, and review it as tracked edits.",
    language: "Language",
    documentLanguage: "Text language",
    documentLanguageHint: "Translate the text with the co-author",
    acceptAll: "Accept all",
    rejectAll: "Reject all",
    acceptChunk: "Accept",
    rejectChunk: "Reject",
    go: "Go",
    refine: "Refine",
    thinking: "Thinking…",
    wholeDocument: "Whole document",
    reviewHint: "or review each change inline, or refine:",
    placeholder: "Or tell the co-author what to do…  (⌘K)",
    refinePlaceholder: "Refine: e.g. shorter, keep my examples…",
    nothing: "The co-author found nothing to change here.",
    textChanged: "Someone changed this text while you were reviewing, so the suggestion wasn't applied. Ask again.",
    collabOff: "Collaboration off: this document is not shared or saved",
    loadingDoc: "Opening document…",
    loadFailed: "Couldn't open this document. Check the link and try again.",
    editing: (count) => (count === 1 ? "Only you here" : `${count} people editing`),
    generic: "Something went wrong.",
    documentTooLong: "The document is too long to edit in one go. Select a section instead.",
    translationTooLong: "The document is too long to translate in one go.",
    missingKey: "OPENROUTER_API_KEY is not set. Add it to .env.local, or run with MOCK_AI=1.",
    mock: "Mock mode: no API calls are made",
    noKey: "No OpenRouter key, so the co-author cannot run",
    quick: {
      improve: "Improve",
      shorten: "Shorten",
      expand: "Expand",
      grammar: "Fix grammar",
      formal: "More formal",
      casual: "More casual",
    },
    tier: { fast: "Fast", quality: "Quality" },
    price: prices["en-US"],
    selection: (count) => `Selection, ${count} ${count === 1 ? "word" : "words"}`,
    changes: (count) => `${count} suggested ${count === 1 ? "change" : "changes"}`,
    lastRequest: (amount) => `Last request ${amount}`,
    thisSession: (amount) => `This session ${amount}`,
    budgetLeft: (remaining, limit) => `Demo budget: ${remaining} of ${limit} left`,
    keyUsage: (amount) => `Key usage so far: ${amount}`,
    budgetExhausted: (remaining) =>
      `The demo budget is used up (${remaining} left). Run it locally with your own key.`,
    requestFailed: (status) => `Request failed (${status})`,
    invalidRequest: "The co-author could not read this request. Reload the page and try again.",
    upstreamError: "The AI service returned an error. Try again in a moment.",
  },
  "pt-BR": {
    product: "Coautor",
    tagline: "Escreva em Markdown. Selecione um trecho, peça uma mudança e revise como edições rastreadas.",
    language: "Idioma",
    documentLanguage: "Idioma do texto",
    documentLanguageHint: "Traduz o texto com o coautor",
    acceptAll: "Aceitar tudo",
    rejectAll: "Rejeitar tudo",
    acceptChunk: "Aceitar",
    rejectChunk: "Rejeitar",
    go: "Ir",
    refine: "Refinar",
    thinking: "Pensando…",
    wholeDocument: "Documento inteiro",
    reviewHint: "ou revise cada mudança no texto, ou refine:",
    placeholder: "Ou diga ao coautor o que fazer…  (⌘K)",
    refinePlaceholder: "Refinar: ex. mais curto, mantenha meus exemplos…",
    nothing: "O coautor não encontrou nada para mudar aqui.",
    textChanged: "Alguém alterou este texto enquanto você revisava, então a sugestão não foi aplicada. Peça de novo.",
    collabOff: "Colaboração desligada: este documento não é compartilhado nem salvo",
    loadingDoc: "Abrindo documento…",
    loadFailed: "Não foi possível abrir este documento. Confira o link e tente de novo.",
    editing: (count) => (count === 1 ? "Só você aqui" : `${count} pessoas editando`),
    generic: "Algo deu errado.",
    documentTooLong: "O documento é longo demais para editar de uma vez. Selecione uma seção.",
    translationTooLong: "O documento é longo demais para traduzir de uma vez.",
    missingKey: "OPENROUTER_API_KEY não está definida. Coloque em .env.local ou rode com MOCK_AI=1.",
    mock: "Modo simulado: nenhuma chamada de API",
    noKey: "Sem chave da OpenRouter, o coautor não pode rodar",
    quick: {
      improve: "Melhorar",
      shorten: "Encurtar",
      expand: "Expandir",
      grammar: "Corrigir gramática",
      formal: "Mais formal",
      casual: "Mais casual",
    },
    tier: { fast: "Rápido", quality: "Qualidade" },
    price: prices["pt-BR"],
    selection: (count) => `Seleção, ${count} ${count === 1 ? "palavra" : "palavras"}`,
    changes: (count) => `${count} ${count === 1 ? "alteração sugerida" : "alterações sugeridas"}`,
    lastRequest: (amount) => `Último pedido ${amount}`,
    thisSession: (amount) => `Nesta sessão ${amount}`,
    budgetLeft: (remaining, limit) => `Orçamento da demo: ${remaining} de ${limit} restantes`,
    keyUsage: (amount) => `Uso da chave até agora: ${amount}`,
    budgetExhausted: (remaining) =>
      `O orçamento da demo acabou (${remaining} restantes). Rode localmente com a sua própria chave.`,
    requestFailed: (status) => `O pedido falhou (${status})`,
    invalidRequest: "O coautor não conseguiu ler este pedido. Recarregue a página e tente de novo.",
    upstreamError: "O serviço de IA retornou um erro. Tente de novo em instantes.",
  },
  "es-AR": {
    product: "Coautor",
    tagline: "Escribí en Markdown. Seleccioná un texto, pedí un cambio y revisalo como ediciones sugeridas.",
    language: "Idioma",
    documentLanguage: "Idioma del texto",
    documentLanguageHint: "Traduce el texto con el coautor",
    acceptAll: "Aceptar todo",
    rejectAll: "Rechazar todo",
    acceptChunk: "Aceptar",
    rejectChunk: "Rechazar",
    go: "Ir",
    refine: "Afinar",
    thinking: "Pensando…",
    wholeDocument: "Documento completo",
    reviewHint: "o revisá cada cambio en el texto, o afiná:",
    placeholder: "O decile al coautor qué hacer…  (⌘K)",
    refinePlaceholder: "Afinar: por ej. más corto, dejá mis ejemplos…",
    nothing: "El coautor no encontró nada para cambiar acá.",
    textChanged: "Alguien cambió este texto mientras revisabas, así que la sugerencia no se aplicó. Pedila de nuevo.",
    collabOff: "Colaboración desactivada: este documento no se comparte ni se guarda",
    loadingDoc: "Abriendo documento…",
    loadFailed: "No se pudo abrir este documento. Revisá el enlace y probá de nuevo.",
    editing: (count) => (count === 1 ? "Solo vos acá" : `${count} personas editando`),
    generic: "Algo salió mal.",
    documentTooLong: "El documento es demasiado largo para editarlo de una. Seleccioná una sección.",
    translationTooLong: "El documento es demasiado largo para traducirlo de una.",
    missingKey: "No está OPENROUTER_API_KEY. Agregala en .env.local, o ejecutá con MOCK_AI=1.",
    mock: "Modo de prueba: no se hacen llamadas a la API",
    noKey: "Sin clave de OpenRouter, el coautor no puede funcionar",
    quick: {
      improve: "Mejorar",
      shorten: "Acortar",
      expand: "Expandir",
      grammar: "Corregir gramática",
      formal: "Más formal",
      casual: "Más informal",
    },
    tier: { fast: "Rápido", quality: "Calidad" },
    price: prices["es-AR"],
    selection: (count) => `Selección, ${count} ${count === 1 ? "palabra" : "palabras"}`,
    changes: (count) => `${count} ${count === 1 ? "cambio sugerido" : "cambios sugeridos"}`,
    lastRequest: (amount) => `Último pedido ${amount}`,
    thisSession: (amount) => `Esta sesión ${amount}`,
    budgetLeft: (remaining, limit) => `Presupuesto de la demo: quedan ${remaining} de ${limit}`,
    keyUsage: (amount) => `Uso de la clave hasta ahora: ${amount}`,
    budgetExhausted: (remaining) =>
      `Se agotó el presupuesto de la demo (quedan ${remaining}). Ejecutalo en tu máquina con tu propia clave.`,
    requestFailed: (status) => `El pedido falló (${status})`,
    invalidRequest: "El coautor no pudo leer este pedido. Recargá la página y probá de nuevo.",
    upstreamError: "El servicio de IA devolvió un error. Probá de nuevo en un momento.",
  },
  "zh-CN": {
    product: "合著者",
    tagline: "用 Markdown 写作。选中文字，提出修改，再以修订痕迹审阅。",
    language: "语言",
    documentLanguage: "正文语言",
    documentLanguageHint: "用合著者翻译正文",
    acceptAll: "全部接受",
    rejectAll: "全部拒绝",
    acceptChunk: "接受",
    rejectChunk: "拒绝",
    go: "开始",
    refine: "再改",
    thinking: "思考中…",
    wholeDocument: "整篇文档",
    reviewHint: "或在文中逐条审阅，或继续修改：",
    placeholder: "或告诉合著者要做什么…  (⌘K)",
    refinePlaceholder: "再改：例如更短一些，保留我的例子…",
    nothing: "合著者认为这里无需修改。",
    textChanged: "你审阅期间有人修改了这段文字，因此建议未被应用。请重新请求。",
    collabOff: "协作已关闭：此文档不会共享或保存",
    loadingDoc: "正在打开文档…",
    loadFailed: "无法打开此文档。请检查链接后重试。",
    editing: (count) => (count === 1 ? "只有你在这里" : `${count} 人正在编辑`),
    generic: "出了点问题。",
    documentTooLong: "文档太长，无法一次修改。请选中一个部分。",
    translationTooLong: "文档太长，无法一次翻译。",
    missingKey: "未设置 OPENROUTER_API_KEY。请写入 .env.local，或使用 MOCK_AI=1 运行。",
    mock: "模拟模式：不会调用 API",
    noKey: "没有 OpenRouter 密钥，合著者无法运行",
    quick: {
      improve: "改进",
      shorten: "缩短",
      expand: "扩展",
      grammar: "修正语法",
      formal: "更正式",
      casual: "更随意",
    },
    tier: { fast: "快速", quality: "高质量" },
    price: prices["zh-CN"],
    selection: (count) => `已选 ${count} 个词`,
    changes: (count) => `${count} 处建议修改`,
    lastRequest: (amount) => `上次请求 ${amount}`,
    thisSession: (amount) => `本次会话 ${amount}`,
    budgetLeft: (remaining, limit) => `演示预算：剩余 ${remaining} / ${limit}`,
    keyUsage: (amount) => `密钥已用 ${amount}`,
    budgetExhausted: (remaining) => `演示预算已用完（剩余 ${remaining}）。请在本地使用你自己的密钥运行。`,
    requestFailed: (status) => `请求失败（${status}）`,
    invalidRequest: "合著者无法读取此请求。请刷新页面后重试。",
    upstreamError: "AI 服务返回了错误，请稍后重试。",
  },
};
