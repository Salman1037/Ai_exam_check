export type Question = {
  q: number;
  question: string;
  student_answer: string;
  correct_answer: string;
  marks: number;
  out_of: number;
  reason: string;
  confidence: 'high' | 'low';
};
export type Paper = {
  id: string;
  file_name: string;
  file_path?: string;
  status: 'pending' | 'checking' | 'done' | 'error';
  subject: string | null;
  total: number | null;
  out_of: number | null;
  results?: Question[] | null;
  error_message: string | null;
  created_at: string;
  checked_at: string | null;
  preview_url?: string;
};
export type PaperList = {
  papers: Paper[];
  has_more: boolean;
  has_pending: boolean;
};
