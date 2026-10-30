import { translationLocale, type Locale } from "@/lib/i18n";
import { SAMPLE_DOC } from "@/lib/sample";

// ponytail: fake co-author for MOCK_AI=1 so UI and diff work costs $0.
// Deterministic, produces visible diffs on ordinary prose.

/** Full stand-ins for the sample document, so mock translation is obvious. */
const CANON: Record<Locale, string> = {
  // ponytail: SAMPLE_DOC ends in "\n"; fine, matching is by first line and output takes the target's trailing whitespace.
  "en-US": SAMPLE_DOC,
  "pt-BR": `# Plano de lançamento do novo fluxo de onboarding

Este documento é um rascunho bem cru. Selecione qualquer parágrafo, escolha uma ação na barra acima, e o coautor vai propor mudanças como edições rastreadas que você pode aceitar ou rejeitar uma a uma.

## Por que estamos fazendo isso

Hoje muitos usuários novos desistem antes de criar o primeiro projeto. Acreditamos que o principal motivo é que a tela de configuração pede coisas demais para começar, e não fica claro o que acontece depois.

## O que vamos entregar

- Um formulário de configuração mais curto, só com os campos que realmente precisamos
- Um projeto de exemplo criado automaticamente
- Um checklist com os três passos até o primeiro resultado

## Riscos

O checklist pode parecer condescendente para usuários experientes. Devemos oferecer um botão de dispensar e lembrar a escolha. Também ainda não sabemos se o projeto de exemplo deve ser apagado depois que o primeiro projeto de verdade for criado.

## Perguntas em aberto

1. Mostramos o checklist no celular?
2. Quem escreve o texto dos estados vazios?`,
  "es-AR": `# Plan de lanzamiento del nuevo flujo de onboarding

Este documento es un borrador muy crudo. Seleccioná cualquier párrafo, elegí una acción en la barra de arriba, y el coautor va a proponer cambios como ediciones sugeridas que podés aceptar o rechazar una por una.

## Por qué estamos haciendo esto

Ahora mismo muchos usuarios nuevos abandonan antes de crear su primer proyecto. Creemos que el motivo principal es que la pantalla de configuración pide demasiadas cosas para empezar, y no queda claro qué pasa después.

## Qué vamos a entregar

- Un formulario de configuración más corto, solo con los campos que de verdad necesitamos
- Un proyecto de ejemplo que se crea automáticamente
- Una lista de verificación con los tres pasos hasta el primer resultado

## Riesgos

La lista puede parecer condescendiente para los usuarios con experiencia. Tendríamos que ofrecer un botón para descartarla y recordar la elección. Tampoco sabemos todavía si el proyecto de ejemplo debería borrarse después de que se cree el primero de verdad.

## Preguntas abiertas

1. ¿Mostramos la lista en el celular?
2. ¿Quién escribe los textos de los estados vacíos?`,
  "zh-CN": `# 新用户引导流程的发布计划

这是一份很粗糙的草稿。选中任意段落，在上方工具栏选一个操作，合著者会把修改显示为修订痕迹，你可以逐条接受或拒绝。

## 为什么要做这件事

现在很多新用户在创建第一个项目之前就离开了。我们认为主要原因是设置页面要求填写的内容太多，而且接下来会发生什么并不清楚。

## 我们会交付什么

- 更短的设置表单，只保留真正需要的字段
- 自动创建的示例项目
- 一份清单，列出到达第一个结果的三个步骤

## 风险

这份清单可能会让有经验的用户觉得被小看了。我们应该提供一个关闭按钮，并记住这个选择。我们也不确定，在用户创建第一个真正的项目之后，是否应该删除示例项目。

## 待解决的问题

1. 要在手机上显示这份清单吗？
2. 空状态的文案由谁来写？`,
};

const firstLine = (text: string) => text.split("\n", 1)[0];

function mockTranslation(target: string, locale: Locale, whole: boolean) {
  // ponytail: match on the H1 so an edited sample still gets the canned translation; other text only gets a marker.
  // Only for the whole document: a selection that starts with the H1 must not become the full canned doc.
  const known = whole && (Object.keys(CANON) as Locale[]).some((id) => firstLine(CANON[id]) === firstLine(target));
  if (known) return CANON[locale];
  const marked = target.replace(/^(# .+)$/m, `$1 (${locale})`);
  return marked === target ? target.replace(/(\S)(\s*)$/, `$1\n\n(${locale})$2`) : marked;
}

export function mockRewrite(target: string, instruction: string, whole: boolean): string {
  const into = translationLocale(instruction);
  if (into) return mockTranslation(target, into, whole);

  const ask = instruction.toLowerCase();
  let out = target
    .replace(/\b(very|really|just|quite|basically|actually)\s+/gi, "")
    .replace(/\bin order to\b/gi, "to")
    .replace(/\butili[sz]e\b/gi, "use")
    .replace(/\ba lot of\b/gi, "many");

  if (/short|concise|tight/.test(ask)) out = dropLastSentence(out);
  if (/expand|longer|example/.test(ask)) {
    out = out.replace(/(\S)(\s*)$/, "$1 For example, this is where a concrete detail would go.$2");
  }
  if (/formal/.test(ask)) {
    out = out
      .replace(/\bcan't\b/gi, "cannot")
      .replace(/\bdon't\b/gi, "do not")
      .replace(/\bit's\b/gi, "it is");
  }
  if (/casual/.test(ask)) {
    out = out.replace(/\bcannot\b/gi, "can't").replace(/\bdo not\b/gi, "don't");
  }
  if (out === target) out = target.replace(/(\S)(\s*)$/, "$1 (Reviewed by the mock co-author.)$2");
  return out;
}

function dropLastSentence(text: string) {
  const sentences = text.match(/[^.!?]+[.!?]+(\s+|$)/g);
  if (!sentences || sentences.length < 2) return text;
  const trailing = text.match(/\s*$/)?.[0] ?? "";
  return sentences.slice(0, -1).join("").trimEnd() + trailing;
}
