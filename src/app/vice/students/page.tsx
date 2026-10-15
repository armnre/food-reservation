import React from 'react';
import { listStudents, getStudentFaculties } from '@/server/dal/data';
import { PageHeader } from '@/components/layout/app-shell';
import { StudentsClient } from '@/components/students/students-client';
import { toPersianDigits } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q : '';
  const status = typeof sp.status === 'string' ? sp.status : 'ALL';
  const faculty = typeof sp.faculty === 'string' ? sp.faculty : 'ALL';
  const entryYear = typeof sp.entryYear === 'string' ? sp.entryYear : 'ALL';
  const page = Number.parseInt(typeof sp.page === 'string' ? sp.page : '1', 10) || 1;

  const [data, faculties] = await Promise.all([
    listStudents({ q, status, faculty, entryYear, page, pageSize: 20 }),
    getStudentFaculties(),
  ]);

  return (
    <div>
      <PageHeader
        title="مدیریت دانشجویان"
        description={`مجموع ${toPersianDigits(data.total)} دانشجو — جستجو، فیلتر، مشاهده جزئیات و ریست رمز`}
      />
      <StudentsClient
        initial={data.items}
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        faculties={faculties}
        initialQuery={{ q, status, faculty, entryYear }}
      />
    </div>
  );
}
