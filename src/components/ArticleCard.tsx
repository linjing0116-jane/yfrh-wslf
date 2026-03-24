import React from 'react';
import { Article } from '../types';
import { FileText, Video, Image as ImageIcon, ExternalLink, Calendar, Trash2, Edit2 } from 'lucide-react';

interface ArticleCardProps {
  article: Article;
  isAdmin?: boolean;
  onDelete?: () => void;
  onEdit?: () => void;
}

const ArticleCard: React.FC<ArticleCardProps> = ({ article, isAdmin, onDelete, onEdit }) => {
  const Icon = article.type === 'video' ? Video : 
               article.type === 'image-text' ? ImageIcon : FileText;

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'disease': return '疾病科普';
      case 'vaccine': return '疫苗知识';
      case 'video': return '视频科普';
      case 'shingles-month': return '带状疱疹行动月';
      default: return '其他';
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-orange-100 overflow-hidden hover:shadow-xl transition-all duration-300 group relative">
      {isAdmin && (
        <div className="absolute top-3 left-3 z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={(e) => { e.preventDefault(); onEdit?.(); }}
            className="p-2 bg-white/90 backdrop-blur shadow-sm rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
            title="编辑"
          >
            <Edit2 size={16} />
          </button>
          <button 
            onClick={(e) => { e.preventDefault(); onDelete?.(); }}
            className="p-2 bg-white/90 backdrop-blur shadow-sm rounded-lg text-red-600 hover:bg-red-50 transition-colors"
            title="删除"
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}
      {article.thumbnail && (
        <div className="aspect-video overflow-hidden relative">
          <img 
            src={article.thumbnail} 
            alt={article.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            referrerPolicy="no-referrer"
          />
          <div className="absolute top-3 right-3 bg-orange-500 text-white px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1">
            <Icon size={14} />
            {article.type === 'video' ? '视频' : article.type === 'image-text' ? '图文' : '文字'}
          </div>
        </div>
      )}
      <div className="p-5">
        <div className="flex items-center gap-2 text-orange-600 text-xs font-medium mb-2">
          <span className="bg-orange-50 px-2 py-1 rounded uppercase tracking-wider">
            {getCategoryLabel(article.category)}
          </span>
          <span className="flex items-center gap-1 text-gray-400">
            <Calendar size={12} />
            {article.publishDate}
          </span>
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2 line-clamp-2 leading-tight group-hover:text-orange-600 transition-colors">
          {article.title}
        </h3>
        <p className="text-gray-500 text-sm mb-4 line-clamp-3 leading-relaxed">
          {article.summary}
        </p>
        <div className="flex items-center justify-between mt-auto pt-4 border-t border-gray-50">
          <span className="text-xs text-gray-400 font-medium">{article.source}</span>
          <a 
            href={article.url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-orange-600 text-sm font-semibold hover:gap-2 transition-all"
          >
            阅读全文 <ExternalLink size={14} />
          </a>
        </div>
      </div>
    </div>
  );
};

export default ArticleCard;
