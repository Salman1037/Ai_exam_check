export const config = {
  apiUrl: (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(
    /\/$/,
    '',
  ),
  maxFileBytes: 10 * 1024 * 1024,
  maxImageDimension: 1600,
  jpegQuality: 0.85,
  pollMs: 2000,
  pageSize: 20,
  accept: '.pdf,.jpg,.jpeg,.png,.webp',
};
