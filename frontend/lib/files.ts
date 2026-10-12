import { config } from './config';
export async function prepareFile(file: File): Promise<File> {
  if (file.size > config.maxFileBytes)
    throw new Error(
      'File is larger than 10 MB. Please upload a smaller photo or PDF.',
    );
  if (!/\.(pdf|jpe?g|png|webp)$/i.test(file.name))
    throw new Error('Please select a PDF, JPG, PNG or WEBP file.');
  if (/\.pdf$/i.test(file.name)) return file;
  // Browsers apply EXIF orientation when decoding with from-image.
  const bitmap = await createImageBitmap(file, {
    imageOrientation: 'from-image',
  });
  try {
    const scale = Math.min(
      1,
      config.maxImageDimension / Math.max(bitmap.width, bitmap.height),
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx)
      throw new Error('Could not prepare photo. Please try another browser.');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (value) =>
          value
            ? resolve(value)
            : reject(new Error('Could not compress photo.')),
        'image/jpeg',
        config.jpegQuality,
      ),
    );
    return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
      type: 'image/jpeg',
    });
  } finally {
    bitmap.close();
  }
}
export function downloadCsv(paper: import('./types').Paper) {
  // Neutralize spreadsheet formulas, including formulas preceded by whitespace.
  const cell = (value: unknown) => {
    let text = String(value ?? '');
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const rows: unknown[][] = [
    [
      'Question',
      'Question text',
      'Student answer',
      'Correct answer',
      'Marks',
      'Out of',
      'Reason',
      'Confidence',
    ],
    ...(paper.results || []).map((q) => [
      q.q,
      q.question,
      q.student_answer,
      q.correct_answer,
      q.marks,
      q.out_of,
      q.reason,
      q.confidence,
    ]),
    ['Total', '', '', '', paper.total, paper.out_of, '', ''],
  ];
  const url = URL.createObjectURL(
    new Blob(
      ['\uFEFF' + rows.map((row) => row.map(cell).join(',')).join('\r\n')],
      { type: 'text/csv;charset=utf-8' },
    ),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = paper.file_name.replace(/\.[^.]+$/, '') + '-results.csv';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
