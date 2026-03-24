export type ContentType = 'text' | 'image-text' | 'media-draft' | 'video';
export type Category = 'disease' | 'vaccine' | 'video' | 'shingles-month' | 'other';

export interface Article {
  id: string;
  title: string;
  summary: string;
  url: string;
  type: ContentType;
  category: Category;
  publishDate: string;
  thumbnail?: string;
  source: string;
}
