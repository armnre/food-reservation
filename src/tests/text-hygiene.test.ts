import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * بهداشت متن (فاز ۱-۱۰) — هیچ نویسهٔ چینی/سیریلیک/کره‌ای/فرانسوی در سورس نباید باشد.
 * «رزوشده» با حروف سیریلیک قبلاً در UI دیده می‌شد؛ این تست جلوگیری از بازگشت است.
 */
const FORBIDDEN = /[\u0400-\u04FF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u00C0-\u00FF]/;

// مجاز: علامت ضربدر × (U+00D7) در کپچای ریاضی
const ALLOWED_LINE = /^.*\u00D7.*$/;

function collectFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) collectFiles(p, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(p);
  }
  return acc;
}

describe('بهداشت متن سورس', () => {
  it('هیچ نویسهٔ غیرمجاز (چینی/سیریلیک/کره‌ای/فرانسوی) در src وجود ندارد', () => {
    const violations: string[] = [];
    for (const file of collectFiles('src')) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (FORBIDDEN.test(line) && !ALLOWED_LINE.test(line)) {
          violations.push(`${file}:${i + 1}: ${line.trim().slice(0, 70)}`);
        }
      });
    }
    expect(violations.join('\n'), `نویسه‌های غیرمجاز پیدا شدند:\n${violations.join('\n')}`).toBe('');
  });
});
