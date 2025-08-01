import type { BlogAuthor } from '@nx/nx-dev-data-access-documents/node-only';

export interface Course {
  id: string;
  title: string;
  description: string;
  content: string;
  authors: BlogAuthor[];
  repository?: string;
  lessons: Lesson[];
  lessonCount?: number;
  filePath: string;
  externalLink?: string;
  totalDuration: string;
  order?: number;
}

export interface Lesson {
  id: string;
  title: string;
  description: string;
  videoUrl: string;
  duration: string;
  filePath: string;
}
