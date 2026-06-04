// packages/shared/src/sms/parser.ts
import type { SmsInput, ParseResult } from './types.js';
import { PARSER_RULES, FALLBACK_RULE } from './parserRules.js';
import { normalizeAmount, normalizeDate, normalizeMerchant } from './normalize.js';
import { dedupeHash as computeHash } from './dedupeHash.js';

const OTP_RE = /\bOTP\b|one.time.pass|verification code/i;

export async function parseSms(input: SmsInput): Promise<ParseResult | null> {
  // Step 1: Reject OTP / non-transaction messages immediately
  if (OTP_RE.test(input.body)) return null;

  // Step 2: Find matching bank rule by sender
  const matchedRule =
    PARSER_RULES.find((rule) => rule.senderPatterns.some((p) => input.sender.includes(p))) ?? null;

  // Step 3: Try bank rule first, then fallback
  const rulesToTry = matchedRule ? [matchedRule, FALLBACK_RULE] : [FALLBACK_RULE];

  for (const rule of rulesToTry) {
    for (const patternSrc of rule.patterns) {
      const regex = new RegExp(patternSrc, rule.flags ?? 'i');
      const match = regex.exec(input.body);
      if (!match?.groups) continue;

      const { amount: rawAmt, last4, date: rawDate, merchant: rawMerchant } = match.groups;

      // Must capture at least an amount to be a transaction
      if (!rawAmt) continue;

      const isFallback = rule.bank === 'UNKNOWN';
      const hasAll = !!(rawAmt && last4 && rawDate && rawMerchant);
      const confidence: 'high' | 'low' = !isFallback && hasAll ? 'high' : 'low';

      const hash = await computeHash(input);

      return {
        bank: rule.bank,
        last4: last4 ?? '',
        amount: normalizeAmount(rawAmt),
        merchant: normalizeMerchant(rawMerchant ?? ''),
        date: rawDate
          ? normalizeDate(rawDate)
          : new Date(input.timestamp ?? Date.now()).toISOString().split('T')[0],
        confidence,
        dedupeHash: hash,
        raw: input,
      };
    }
  }

  return null;
}
