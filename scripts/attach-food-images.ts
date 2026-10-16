/**
 * اتصال تصاویر غذا به رکوردهای کتابخانه — اسکریپت یکبار مصرف توسعه.
 *   npx tsx scripts/attach-food-images.ts
 */
import 'dotenv/config';
import { db } from '../src/db/index';
import { foods } from '../src/db/schema';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { env } from '../src/lib/env';

const MAPPING: Record<string, string> = {
  'قورمه سبزی': 'qormeh-sabzi',
  'زرشک پلو با مرغ': 'zereshk-polo',
  'کباب کوبیده': 'kebab-koobideh',
  'عدس پلو': 'adas-polo',
  'سالاد فصل': 'salad-fasel',
  'ماست و خیار': 'mast-khiar',
  شله‌زرد: 'sholeh-zard',
  دوغ: 'doogh',
};

async function main() {
  const all = await db.select().from(foods);
  for (const f of all) {
    const slug = MAPPING[f.name];
    if (!slug) continue;

    const srcPath = path.resolve(`public/foods/${slug}.jpg`);
    let imagePath: string;
    let thumbPath: string;

    if (f.imagePath && f.imagePath.startsWith('foods/')) {
      // 이미 저장되었습니다 — только لینک
      imagePath = f.imagePath;
      thumbPath = f.thumbPath ?? f.imagePath;
    } else {
      const key = `${Date.now()}-${randomBytes(6).toString('hex')}`;
      const dir = path.join(env.uploadDir, 'foods');
      await fs.mkdir(dir, { recursive: true });

      const buf = await fs.readFile(srcPath);
      const destImg = path.join('foods', `${key}.webp`);
      const destThumb = path.join('foods', `${key}-thumb.webp`);
      await sharp(buf)
        .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(path.join(env.uploadDir, destImg));
      await sharp(buf)
        .resize(200, 200, { fit: 'cover' })
        .webp({ quality: 78 })
        .toFile(path.join(env.uploadDir, destThumb));
      imagePath = destImg;
      thumbPath = destThumb;
    }

    await db.update(foods).set({ imagePath, thumbPath, updatedAt: new Date() }).where(eq(foods.id, f.id));
    console.log(`  ${f.name} ← ${slug}`);
  }
  console.log('✔ تصاویر غذا متصل شدند');
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
