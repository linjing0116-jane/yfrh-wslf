/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc,
  updateDoc,
  doc,
  query, 
  orderBy, 
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { onAuthStateChanged, User } from 'firebase/auth';
import { db, auth, login, logout } from './firebase';
import { Article, Category } from './types';
import ArticleCard from './components/ArticleCard';
import { extractArticleInfo } from './services/geminiService';
import { 
  Plus, 
  Search, 
  Loader2, 
  LogOut, 
  LogIn, 
  Filter,
  ShieldCheck,
  ChevronRight,
  Sparkles,
  Trash2,
  Edit2,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export default function App() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [newUrl, setNewUrl] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [activeCategory, setActiveCategory] = useState<Category | 'all'>('all');
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<Category | 'auto'>('auto');
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [deletingArticleId, setDeletingArticleId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Article>>({});

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    const q = query(collection(db, 'articles'), orderBy('createdAt', 'desc'));
    const unsubscribeFirestore = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Article[];
      setArticles(docs);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'articles');
      setLoading(false);
    });

    return () => {
      unsubscribeAuth();
      unsubscribeFirestore();
    };
  }, []);

  const handleAddArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl || isExtracting) return;

    setIsExtracting(true);
    try {
      const info = await extractArticleInfo(newUrl);
      
      // Use manual category if selected, otherwise use AI extracted one
      const finalCategory = selectedCategory === 'auto' ? info.category : selectedCategory;

      await addDoc(collection(db, 'articles'), {
        ...info,
        category: finalCategory,
        url: newUrl,
        createdAt: serverTimestamp(),
        thumbnail: `https://picsum.photos/seed/${encodeURIComponent(info.title)}/800/450`
      });
      setNewUrl('');
      setSelectedCategory('auto');
      setShowAdminPanel(false);
    } catch (error) {
      if (error instanceof Error && error.message.includes('operationType')) {
        // Already handled by handleFirestoreError
        alert("数据库写入失败，请检查权限。");
      } else {
        console.error("Failed to add article:", error);
        handleFirestoreError(error, OperationType.CREATE, 'articles');
      }
    } finally {
      setIsExtracting(false);
    }
  };

  const handleDeleteArticle = async (id: string) => {
    setDeletingArticleId(id);
  };

  const confirmDelete = async () => {
    if (!deletingArticleId) return;
    try {
      await deleteDoc(doc(db, 'articles', deletingArticleId));
      setDeletingArticleId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `articles/${deletingArticleId}`);
    }
  };

  const handleEditArticle = (article: Article) => {
    setEditingArticle(article);
    setEditForm(article);
    setShowAdminPanel(false);
  };

  const handleUpdateArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingArticle || !editForm.title) return;

    try {
      const { id, ...data } = editForm as Article;
      await updateDoc(doc(db, 'articles', editingArticle.id), {
        title: data.title,
        summary: data.summary,
        category: data.category,
        source: data.source,
        publishDate: data.publishDate,
        type: data.type
      });
      setEditingArticle(null);
      setEditForm({});
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `articles/${editingArticle.id}`);
    }
  };

  const handleLogin = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    try {
      await login();
    } catch (error: any) {
      if (error.code === 'auth/popup-blocked') {
        alert("登录窗口被浏览器拦截，请在浏览器地址栏右侧允许弹出窗口，然后重试。");
      } else if (error.code === 'auth/cancelled-popup-request') {
        // Multiple clicks, ignore
      } else {
        console.error("Login error:", error);
        alert("登录失败: " + (error.message || "未知错误"));
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const filteredArticles = articles.filter(a => {
    const matchesCategory = activeCategory === 'all' || a.category === activeCategory;
    const matchesSearch = a.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         a.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         a.source.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-[#FFFBF7] text-gray-900 font-sans">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-orange-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-orange-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-orange-200">
                <ShieldCheck size={24} />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-gray-900 leading-none">E防融合</h1>
                <p className="text-[10px] text-orange-600 font-bold uppercase tracking-widest mt-1">Med-Prev Integration</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {user ? (
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setShowAdminPanel(!showAdminPanel)}
                    className="flex items-center gap-2 bg-orange-50 text-orange-600 px-4 py-2 rounded-full text-sm font-semibold hover:bg-orange-100 transition-colors"
                  >
                    <Plus size={16} />
                    添加报道
                  </button>
                  <div className="h-8 w-px bg-gray-200 mx-1" />
                  <button 
                    onClick={logout}
                    className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                    title="退出登录"
                  >
                    <LogOut size={20} />
                  </button>
                </div>
              ) : (
                <button 
                  onClick={handleLogin}
                  disabled={isLoggingIn}
                  className="flex items-center gap-2 bg-gray-900 text-white px-5 py-2 rounded-full text-sm font-semibold hover:bg-gray-800 transition-all shadow-lg shadow-gray-200 disabled:opacity-50"
                >
                  {isLoggingIn ? <Loader2 className="animate-spin" size={16} /> : <LogIn size={16} />}
                  {isLoggingIn ? '正在登录...' : '管理员登录'}
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero Section */}
        <div className="mb-12 relative overflow-hidden rounded-[2rem] bg-gray-900 p-8 md:p-16 text-white">
          <div className="absolute top-0 right-0 w-1/2 h-full opacity-20 pointer-events-none">
            <div className="absolute inset-0 bg-gradient-to-l from-orange-500 to-transparent" />
            <img 
              src="https://picsum.photos/seed/medical/1200/800" 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
              alt="Hero background"
            />
          </div>
          
          <div className="relative z-10 max-w-2xl">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 bg-orange-500/20 text-orange-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-6 border border-orange-500/30"
            >
              <Sparkles size={14} />
              权威科普 · 媒体合集
            </motion.div>
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-4xl md:text-6xl font-bold mb-6 leading-[1.1]"
            >
              汇聚专业力量<br />
              <span className="text-orange-500 text-stroke-white">共筑健康防线</span>
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-gray-400 text-lg mb-8 leading-relaxed"
            >
              “医防融合”致力于整合各大媒体的疾病预防与疫苗科普报道，为您提供最权威、最及时的健康资讯合集。
            </motion.p>
          </div>
        </div>

        {/* Admin Panel */}
        <AnimatePresence>
          {showAdminPanel && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mb-8"
            >
              <div className="bg-white p-6 rounded-2xl border-2 border-orange-100 shadow-xl">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                  <Plus className="text-orange-500" /> 添加新的媒体报道
                </h3>
                <form onSubmit={handleAddArticle} className="space-y-4">
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1 relative">
                      <input 
                        type="url" 
                        required
                        placeholder="粘贴文章或视频链接 (URL)..."
                        className="w-full pl-4 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all"
                        value={newUrl}
                        onChange={(e) => setNewUrl(e.target.value)}
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                        <Search size={18} />
                      </div>
                    </div>
                    <div className="w-full md:w-48">
                      <select 
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none appearance-none cursor-pointer font-medium"
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value as any)}
                      >
                        <option value="auto">🤖 智能自动分类</option>
                        <option value="disease">疾病科普</option>
                        <option value="vaccine">疫苗知识</option>
                        <option value="video">视频科普</option>
                        <option value="shingles-month">带状疱疹行动月</option>
                        <option value="other">其他</option>
                      </select>
                    </div>
                    <button 
                      type="submit"
                      disabled={isExtracting}
                      className="bg-orange-500 text-white px-8 py-3 rounded-xl font-bold hover:bg-orange-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2 min-w-[160px]"
                    >
                      {isExtracting ? (
                        <>
                          <Loader2 className="animate-spin" size={18} />
                          AI 提取中...
                        </>
                      ) : (
                        <>
                          <Sparkles size={18} />
                          一键发布
                        </>
                      )}
                    </button>
                  </div>
                </form>
                <p className="mt-3 text-xs text-gray-400">
                  * 默认使用 AI 智能分析分类，您也可以手动指定栏目。
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search & Filters */}
        <div className="mb-12">
          <div className="relative max-w-2xl mx-auto mb-8">
            <input 
              type="text"
              placeholder="搜索报道标题、摘要或媒体来源..."
              className="w-full pl-12 pr-4 py-4 bg-white border-2 border-orange-100 rounded-2xl shadow-sm focus:ring-4 focus:ring-orange-500/10 focus:border-orange-500 outline-none transition-all text-lg"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-orange-500">
              <Search size={24} />
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 no-scrollbar">
            <button 
              onClick={() => setActiveCategory('all')}
              className={`px-6 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${activeCategory === 'all' ? 'bg-orange-500 text-white shadow-lg shadow-orange-200' : 'bg-white text-gray-500 hover:bg-orange-50 border border-gray-100'}`}
            >
              全部报道
            </button>
            <button 
              onClick={() => setActiveCategory('disease')}
              className={`px-6 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${activeCategory === 'disease' ? 'bg-orange-500 text-white shadow-lg shadow-orange-200' : 'bg-white text-gray-500 hover:bg-orange-50 border border-gray-100'}`}
            >
              疾病科普
            </button>
            <button 
              onClick={() => setActiveCategory('vaccine')}
              className={`px-6 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${activeCategory === 'vaccine' ? 'bg-orange-500 text-white shadow-lg shadow-orange-200' : 'bg-white text-gray-500 hover:bg-orange-50 border border-gray-100'}`}
            >
              疫苗知识
            </button>
            <button 
              onClick={() => setActiveCategory('video')}
              className={`px-6 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${activeCategory === 'video' ? 'bg-orange-500 text-white shadow-lg shadow-orange-200' : 'bg-white text-gray-500 hover:bg-orange-50 border border-gray-100'}`}
            >
              视频科普
            </button>
            <button 
              onClick={() => setActiveCategory('shingles-month')}
              className={`px-6 py-2 rounded-full text-sm font-bold transition-all whitespace-nowrap ${activeCategory === 'shingles-month' ? 'bg-orange-500 text-white shadow-lg shadow-orange-200' : 'bg-white text-gray-500 hover:bg-orange-50 border border-gray-100'}`}
            >
              带状疱疹行动月
            </button>
          </div>
          
          <div className="text-sm text-gray-400 font-medium flex items-center gap-2">
            <Filter size={16} />
            共收录 {filteredArticles.length} 篇报道
          </div>
        </div>
      </div>

      {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="animate-spin text-orange-500" size={48} />
            <p className="text-gray-400 font-medium">正在加载权威科普内容...</p>
          </div>
        ) : filteredArticles.length > 0 ? (
          <motion.div 
            layout
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8"
          >
            <AnimatePresence mode="popLayout">
              {filteredArticles.map((article) => (
                <motion.div
                  key={article.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.3 }}
                >
                  <ArticleCard 
                    article={article} 
                    isAdmin={!!user}
                    onDelete={() => handleDeleteArticle(article.id)}
                    onEdit={() => handleEditArticle(article)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        ) : (
          <div className="bg-white rounded-[2rem] border border-dashed border-gray-200 py-20 flex flex-col items-center justify-center text-center px-4">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mb-4">
              <Search size={32} />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">暂无相关报道</h3>
            <p className="text-gray-400 max-w-xs">
              目前该分类下还没有收录任何内容，请稍后再来查看。
            </p>
          </div>
        )}
        {/* Delete Confirmation Modal */}
        <AnimatePresence>
          {deletingArticleId && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden"
              >
                <div className="p-8 text-center">
                  <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Trash2 size={32} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">确认删除？</h3>
                  <p className="text-gray-500 mb-8">此操作无法撤销，确定要永久删除这篇报道吗？</p>
                  <div className="flex gap-4">
                    <button 
                      onClick={() => setDeletingArticleId(null)}
                      className="flex-1 px-6 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-all"
                    >
                      取消
                    </button>
                    <button 
                      onClick={confirmDelete}
                      className="flex-1 px-6 py-3 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-200"
                    >
                      确定删除
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Edit Modal */}
        <AnimatePresence>
          {editingArticle && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden"
              >
                <div className="p-8">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-bold text-gray-900">调整文章报道</h3>
                    <button onClick={() => setEditingArticle(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                      <X size={24} />
                    </button>
                  </div>
                  <form onSubmit={handleUpdateArticle} className="space-y-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">标题</label>
                      <input 
                        type="text" 
                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                        value={editForm.title || ''}
                        onChange={(e) => setEditForm({...editForm, title: e.target.value})}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">摘要</label>
                      <textarea 
                        rows={3}
                        className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                        value={editForm.summary || ''}
                        onChange={(e) => setEditForm({...editForm, summary: e.target.value})}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">分类</label>
                        <select 
                          className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                          value={editForm.category || ''}
                          onChange={(e) => setEditForm({...editForm, category: e.target.value as Category})}
                        >
                          <option value="disease">疾病科普</option>
                          <option value="vaccine">疫苗知识</option>
                          <option value="video">视频科普</option>
                          <option value="shingles-month">带状疱疹行动月</option>
                          <option value="other">其他</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">媒体来源</label>
                        <input 
                          type="text" 
                          className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                          value={editForm.source || ''}
                          onChange={(e) => setEditForm({...editForm, source: e.target.value})}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">发布日期</label>
                        <input 
                          type="date" 
                          className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                          value={editForm.publishDate || ''}
                          onChange={(e) => setEditForm({...editForm, publishDate: e.target.value})}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1">类型</label>
                        <select 
                          className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 outline-none"
                          value={editForm.type || ''}
                          onChange={(e) => setEditForm({...editForm, type: e.target.value as any})}
                        >
                          <option value="text">文字</option>
                          <option value="image-text">图文</option>
                          <option value="video">视频</option>
                        </select>
                      </div>
                    </div>
                    <div className="pt-4 flex gap-4">
                      <button 
                        type="button"
                        onClick={() => setEditingArticle(null)}
                        className="flex-1 px-6 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold hover:bg-gray-200 transition-all"
                      >
                        取消
                      </button>
                      <button 
                        type="submit"
                        className="flex-1 px-6 py-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 transition-all shadow-lg shadow-orange-200"
                      >
                        保存修改
                      </button>
                    </div>
                  </form>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </main>

      <footer className="bg-white border-t border-gray-100 py-12 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center text-white">
              <ShieldCheck size={18} />
            </div>
            <span className="font-bold text-gray-900">E防协同</span>
          </div>
          <p className="text-gray-400 text-sm mb-8 max-w-md mx-auto">
            致力于通过媒体的力量，传播科学的疾病预防与疫苗接种知识，提升全民健康素养。
          </p>
          <div className="flex items-center justify-center gap-8 text-xs font-bold uppercase tracking-widest text-gray-400">
            <a href="#" className="hover:text-orange-500 transition-colors">关于我们</a>
            <a href="#" className="hover:text-orange-500 transition-colors">内容合作</a>
            <a href="#" className="hover:text-orange-500 transition-colors">版权说明</a>
          </div>
          <p className="mt-12 text-[10px] text-gray-300 uppercase tracking-[0.2em]">
            &copy; 2026 Medical-Prevention Synergy. All Rights Reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
