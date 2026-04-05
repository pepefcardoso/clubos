/**
 * Frontend copy of the LGPD consent document shown to guardians in the
 * ParentalConsentModal.
 *
 * SYNC CONTRACT:
 *   This text MUST be byte-for-byte identical with the text in
 *   apps/api/src/modules/tryout/consent-text.ts for version "v1.0".
 *
 *   The API computes a SHA-256 hash of the text shown to the guardian
 *   (along with other metadata) and stores it in audit_log for tamper-evidence.
 *   If this file drifts from the API version, the hashes will not match and
 *   auditors will be unable to verify which document version was accepted.
 *
 *   Any text change MUST be accompanied by:
 *     1. A new version key in apps/api/src/modules/tryout/consent-text.ts
 *     2. A corresponding update to CURRENT_CONSENT_VERSION in both files
 *     3. A new export const in this file for the new version
 */
export const CONSENT_V1_TEXT = `TERMO DE CONSENTIMENTO PARA TRATAMENTO DE DADOS PESSOAIS DE MENOR DE IDADE

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
Ao prosseguir, declaro ter lido e compreendido este Termo, e consinto, de forma livre, informada e inequívoca, com o tratamento dos dados do(a) menor sob minha responsabilidade legal, para as finalidades acima descritas.`;

export const CURRENT_CONSENT_VERSION = "v1.0";
