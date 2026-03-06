/**
 * Canonical keys for the three trigger moments in the billing reminder flow.
 *
 *   charge_reminder_d3     → sent 3 days before the due date
 *   charge_reminder_d0     → sent on the due date itself
 *   overdue_notice         → sent 3 days after the due date (D+3)
 *   charge_reminder_manual → sent on-demand via the "Cobrar agora" dashboard action (T-041)
 *
 * These keys are stored verbatim in Message.template for auditability.
 */
export const TEMPLATE_KEYS = {
  CHARGE_REMINDER_D3: "charge_reminder_d3",
  CHARGE_REMINDER_D0: "charge_reminder_d0",
  OVERDUE_NOTICE: "overdue_notice",
  CHARGE_REMINDER_MANUAL: "charge_reminder_manual",
} as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[keyof typeof TEMPLATE_KEYS];

/**
 * Default template bodies used when a club has not configured a custom template.
 *
 * Language: Portuguese (product strings).
 * Placeholders: {nome}, {valor}, {pix_link}, {vencimento}
 *   — all four must remain present in every default template.
 */
export const DEFAULT_TEMPLATES: Record<TemplateKey, string> = {
  charge_reminder_d3:
    "Olá, {nome}! 👋\n\n" +
    "Sua mensalidade do clube no valor de *{valor}* vence em *3 dias* ({vencimento}).\n\n" +
    "Pague com Pix usando o código abaixo:\n\n" +
    "{pix_link}\n\n" +
    "Qualquer dúvida, estamos à disposição! 🏆",

  charge_reminder_d0:
    "Olá, {nome}! ⚠️\n\n" +
    "Sua mensalidade no valor de *{valor}* vence *hoje* ({vencimento}).\n\n" +
    "Evite a inadimplência e pague agora com Pix:\n\n" +
    "{pix_link}\n\n" +
    "Obrigado! 🙏",

  overdue_notice:
    "Olá, {nome}. Identificamos que sua mensalidade de *{valor}* " +
    "(vencimento: {vencimento}) está em *atraso*.\n\n" +
    "Regularize sua situação pelo Pix abaixo e mantenha seus benefícios:\n\n" +
    "{pix_link}\n\n" +
    "Em caso de dúvidas, entre em contato conosco.",

  charge_reminder_manual:
    "Olá, {nome}! 👋\n\n" +
    "Identificamos que sua mensalidade de *{valor}* está em atraso " +
    "(vencimento: {vencimento}).\n\n" +
    "Regularize sua situação pelo Pix abaixo e continue aproveitando os benefícios do clube:\n\n" +
    "{pix_link}\n\n" +
    "Em caso de dúvidas, entre em contato conosco. 🏆",
};
