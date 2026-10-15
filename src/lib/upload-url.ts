/** نگاشت مسیر نسبی فایل آپلودشده به URL قابل نمایش */
export function uploadUrl(relativePath: string | null | undefined): string | null {
  if (!relativePath) return null;
  return `/api/uploads?p=${encodeURIComponent(relativePath)}`;
}
