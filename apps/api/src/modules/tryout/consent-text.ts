/**
 * Versioned consent document for parental consent of minor athletes.
 * Changes to this text REQUIRE a new version identifier.
 * The version is stored in audit_log.metadata.consentVersion.
 *
 * IMPORTANT: The text in this file must stay byte-for-byte identical with
 * apps/web/src/lib/consent/consent-text.ts so the SHA-256 hash computed
 * server-side matches the document the guardian actually read.
 */
export const CONSENT_VERSIONS = {
  "v1.0": {
    version: "v1.0",
    effectiveDate: "2025-01-01",
    text: `TERMO DE CONSENTIMENTO PARA TRATAMENTO DE DADOS PESSOAIS DE MENOR DE IDADE

Eu, na qualidade de responsável legal pelo(a) atleta identificado(a) neste formulário, declaro que:

1. IDENTIFICAÇÃO DO CONTROLADOR
O tratamento de dados pessoais será realizado pelo clube desportivo identificado neste formulário ("Clube"), utilizando a plataforma ClubOS (operada pela ClubOS Ltda., CNPJ a informar), na qualidade de operadora.

2. DADOS TRATADOS
Autorizo o tratamento dos seguintes dados do(a) atleta menor de idade:
• Nome completo, data de nascimento e posição desportiva;
• Telefone de contacto do responsável legal;
• Documentação de identificação enviada (quando aplicável).

3. FINALIDADE E BASE LEGAL
Os dados são tratados com base no consentimento do titular ou de seu responsável legal (Art. 7º, I e Art. 14, §1º, da Lei 13.709/2018 — LGPD), com a finalidade exclusiva de:
• Organização e avaliação do atleta no processo seletivo (peneira);
• Contacto do Clube com o responsável legal para comunicação de resultados.

4. RETENÇÃO E EXPURGO
Os dados serão mantidos pelo prazo máximo de 24 (vinte e quatro) meses a contar da data desta inscrição, findo o qual serão eliminados de forma segura, salvo obrigação legal em contrário.

5. COMPARTILHAMENTO
Os dados não serão vendidos nem compartilhados com terceiros para fins comerciais. Poderão ser compartilhados com entidades regulatórias desportivas (CBF, Federações Estaduais) quando exigido para regularização do atleta.

6. DIREITOS DO TITULAR
Na qualidade de responsável legal, posso exercer os direitos previstos no Art. 18 da LGPD, incluindo: confirmação de tratamento, acesso, correção, eliminação e revogação deste consentimento, mediante solicitação ao Clube.

7. CONSENTIMENTO
Ao prosseguir, declaro ter lido e compreendido este Termo, e consinto, de forma livre, informada e inequívoca, com o tratamento dos dados do(a) menor sob minha responsabilidade legal, para as finalidades acima descritas.`,
  },
} as const;

export type ConsentVersion = keyof typeof CONSENT_VERSIONS;
export const CURRENT_CONSENT_VERSION: ConsentVersion = "v1.0";

export function getConsentText(version: ConsentVersion): string {
  return CONSENT_VERSIONS[version].text;
}
