// Centralized API client with localStorage mock fallback

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

const getAuthHeaders = (): Record<string, string> => {
  const token = localStorage.getItem('vdev_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

let useMockFallback = false;

// --- MOCK DATABASE IMPLEMENTATION ---
const initMockDB = () => {
  if (!localStorage.getItem('mock_users')) {
    localStorage.setItem('mock_users', JSON.stringify([]));
  }
  if (!localStorage.getItem('mock_notes')) {
    localStorage.setItem('mock_notes', JSON.stringify([
      {
        id: '1',
        title: 'Học lập trình NestJS',
        summary: 'Tài liệu ghi chú tổng hợp buổi 1',
        isPinned: true,
        createdAt: new Date().toISOString(),
        noteBlocks: [
          { id: 'b1', type: 'TEXT', content: 'NestJS là một framework Node.js rất mạnh mẽ.', orderIndex: 1 },
          { id: 'b2', type: 'CODE', content: '@Controller(\'notes\')\nexport class NotesController {}', orderIndex: 2 }
        ],
        tags: ['nestjs', 'backend']
      },
      {
        id: '2',
        title: 'Lên kế hoạch tuần này',
        summary: 'Kế hoạch học tập và quản lý tài chính',
        isPinned: false,
        createdAt: new Date().toISOString(),
        noteBlocks: [
          { id: 'b3', type: 'CHECKLIST', content: 'Học xong khóa tiếng Anh', orderIndex: 1 },
          { id: 'b4', type: 'CHECKLIST', content: 'Thanh toán tiền điện nước', orderIndex: 2 }
        ],
        tags: ['todo']
      }
    ]));
  }
  if (!localStorage.getItem('mock_wallets')) {
    localStorage.setItem('mock_wallets', JSON.stringify([
      { id: 'w1', name: 'Tài khoản Techcombank', type: 'BANK', currency: 'VND', initialBalance: 5000000, currentBalance: 5000000, icon: 'credit-card', color: '#1A73E8' },
      { id: 'w2', name: 'Ví Tiền Mặt', type: 'CASH', currency: 'VND', initialBalance: 1000000, currentBalance: 950000, icon: 'wallet', color: '#34A853' }
    ]));
  }
  if (!localStorage.getItem('mock_transactions')) {
    localStorage.setItem('mock_transactions', JSON.stringify([
      { id: 't1', walletId: 'w2', categoryId: 'c1', amount: 50000, type: 'EXPENSE', title: 'Mua giáo trình Tiếng Anh', note: 'Mua tại nhà sách', transactionDate: new Date().toISOString() }
    ]));
  }
  if (!localStorage.getItem('mock_budgets')) {
    localStorage.setItem('mock_budgets', JSON.stringify([
      { id: 'bd1', name: 'Ngân Sách Học Tập Tháng 7', startDate: '2026-07-01T00:00:00.000Z', endDate: '2026-07-31T23:59:59.000Z', totalAmount: 2000000, items: [{ categoryId: 'c1', amount: 1000000 }] }
    ]));
  }
  if (!localStorage.getItem('mock_courses')) {
    localStorage.setItem('mock_courses', JSON.stringify([
      {
        id: 'course-1',
        title: 'Tiếng Anh Giao Tiếp Cơ Bản',
        description: 'Lộ trình học tiếng Anh từ con số 0 với 5 bài học thực tế',
        coverFileId: null,
        difficulty: 'BEGINNER',
        language: 'vi',
        estimatedMinutes: 180,
        isPublished: true,
        sections: [
          {
            id: 'sec-1',
            title: 'Chương 1: Khởi động',
            description: 'Các bài học nhập môn đầu tiên',
            orderIndex: 1,
            lessons: [
              { id: 'les-1', title: 'Bài 1: Giới thiệu bản thân', summary: 'Học cách chào hỏi cơ bản', content: '# Bài 1: Giới thiệu bản thân\nChào bạn! Để bắt đầu giới thiệu bản thân bằng tiếng Anh, chúng ta sử dụng cấu trúc:\n- "Hello, my name is..."\n- "I am ... years old."\n- "I live in ..."', durationSeconds: 300, orderIndex: 1, isCompleted: true, completedAt: new Date().toISOString() },
              { id: 'les-2', title: 'Bài 2: Giao tiếp công việc', summary: 'Chào hỏi đồng nghiệp và đối tác', content: '# Bài 2: Giao tiếp công việc\nTrong môi trường công sở:\n- "Nice to meet you."\n- "How are you doing today?"', durationSeconds: 400, orderIndex: 2, isCompleted: false, completedAt: null }
            ]
          }
        ]
      }
    ]));
  }
};

initMockDB();

const cache = new Map<string, any>();

export const clearApiCache = () => {
  cache.clear();
};

export const api = {
  async get(url: string) {
    const token = localStorage.getItem('vdev_token') || '';
    const cacheKey = `${url}::${token}`;
    if (!useMockFallback && cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }
    if (!useMockFallback) {
      try {
        const response = await fetch(`${BASE_URL}${url}`, {
          headers: { ...getAuthHeaders() }
        });
        if (!response.ok) throw new Error(await response.text() || 'API Error');
        const json = await response.json();
        const data = json && typeof json === 'object' && 'success' in json && 'data' in json ? json.data : json;
        cache.set(cacheKey, data);
        return data;
      } catch (err: any) {
        if (err.name === 'TypeError' || err.message.includes('fetch') || err.message.includes('NetworkError')) {
          useMockFallback = true;
        } else {
          throw err;
        }
      }
    }
    
    // MOCK IMPLEMENTATION
    if (url.includes('/api/auth/profile')) {
      const token = localStorage.getItem('vdev_token');
      if (!token) throw new Error('Unauthorized');
      return {
        id: '7b2d5a3f-1d89-4e78-ba2e-3f890ad67a12',
        email: localStorage.getItem('vdev_user_email') || 'user@vdev.local',
        fullName: localStorage.getItem('vdev_user_name') || 'Nguyen Van A',
        avatarFileId: null,
        status: 'ACTIVE'
      };
    }
    if (url.includes('/api/notes')) {
      return JSON.parse(localStorage.getItem('mock_notes') || '[]');
    }
    if (url.includes('/api/finance/wallets')) {
      return JSON.parse(localStorage.getItem('mock_wallets') || '[]');
    }
    if (url.includes('/api/finance/transactions')) {
      return JSON.parse(localStorage.getItem('mock_transactions') || '[]');
    }
    if (url.includes('/api/finance/budgets')) {
      const budgets = JSON.parse(localStorage.getItem('mock_budgets') || '[]');
      // Inject actualSpent
      const txs = JSON.parse(localStorage.getItem('mock_transactions') || '[]');
      const actualSpent = txs.reduce((sum: number, t: any) => t.type === 'EXPENSE' ? sum + t.amount : sum, 0);
      return budgets.map((b: any) => ({
        ...b,
        totalBudgetAmount: b.totalAmount,
        budgetItems: (b.items || []).map((item: any) => ({
          ...item,
          categoryName: 'Học tập & Giáo dục',
          budgetAmount: item.amount,
          actualSpent,
          remaining: item.amount - actualSpent
        }))
      }));
    }
    if (url.includes('/api/learning/courses')) {
      const courses = JSON.parse(localStorage.getItem('mock_courses') || '[]');
      const courseId = url.split('/').pop();
      if (courseId && courseId !== 'courses') {
        const found = courses.find((c: any) => c.id === courseId);
        if (found) return found;
      }
      return courses;
    }
    if (url.includes('/api/learning/lessons/')) {
      const lessonId = url.split('/').pop();
      const courses = JSON.parse(localStorage.getItem('mock_courses') || '[]');
      for (const course of courses) {
        for (const sec of (course.sections || [])) {
          const les = (sec.lessons || []).find((l: any) => l.id === lessonId);
          if (les) {
            return {
              ...les,
              assets: les.assets || []
            };
          }
        }
      }
    }
    
    throw new Error(`Endpoint not mocked or found: ${url}`);
  },

  async post(url: string, body: any) {
    cache.clear();
    if (!useMockFallback) {
      try {
        const response = await fetch(`${BASE_URL}${url}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders()
          },
          body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error(await response.text() || 'API Error');
        const json = await response.json();
        return json && typeof json === 'object' && 'success' in json && 'data' in json ? json.data : json;
      } catch (err: any) {
        if (err.name === 'TypeError' || err.message.includes('fetch') || err.message.includes('NetworkError')) {
          useMockFallback = true;
        } else {
          throw err;
        }
      }
    }

    // MOCK IMPLEMENTATION
    if (url.includes('/api/auth/login')) {
      localStorage.setItem('vdev_token', 'mock_jwt_token');
      localStorage.setItem('vdev_user_email', body.email);
      localStorage.setItem('vdev_user_name', body.email.split('@')[0].toUpperCase());
      return {
        user: { id: '7b2d5a3f-1d89-4e78-ba2e-3f890ad67a12', email: body.email, fullName: body.email.split('@')[0].toUpperCase(), avatarFileId: null },
        accessToken: 'mock_jwt_token'
      };
    }
    if (url.includes('/api/auth/register')) {
      return {
        id: '7b2d5a3f-1d89-4e78-ba2e-3f890ad67a12',
        email: body.email,
        fullName: body.fullName,
        status: 'ACTIVE'
      };
    }
    if (url.includes('/api/notes') && !url.includes('/blocks')) {
      const notes = JSON.parse(localStorage.getItem('mock_notes') || '[]');
      const newNote = {
        id: Math.random().toString(36).substring(7),
        title: body.title,
        summary: body.summary || '',
        isPinned: body.isPinned || false,
        createdAt: new Date().toISOString(),
        noteBlocks: [],
        tags: body.tags || []
      };
      notes.unshift(newNote);
      localStorage.setItem('mock_notes', JSON.stringify(notes));
      return newNote;
    }
    if (url.match(/\/api\/notes\/([a-zA-Z0-9-]+)\/blocks/)) {
      const match = url.match(/\/api\/notes\/([a-zA-Z0-9-]+)\/blocks/);
      const noteId = match ? match[1] : '';
      const notes = JSON.parse(localStorage.getItem('mock_notes') || '[]');
      const noteIndex = notes.findIndex((n: any) => n.id === noteId);
      if (noteIndex !== -1) {
        const newBlock = {
          id: Math.random().toString(36).substring(7),
          type: body.type,
          content: body.content,
          orderIndex: body.orderIndex || 1
        };
        notes[noteIndex].noteBlocks.push(newBlock);
        localStorage.setItem('mock_notes', JSON.stringify(notes));
        return newBlock;
      }
    }
    if (url.includes('/api/finance/wallets')) {
      const wallets = JSON.parse(localStorage.getItem('mock_wallets') || '[]');
      const newWallet = {
        id: Math.random().toString(36).substring(7),
        ...body,
        currentBalance: body.initialBalance
      };
      wallets.push(newWallet);
      localStorage.setItem('mock_wallets', JSON.stringify(wallets));
      return newWallet;
    }
    if (url.includes('/api/finance/transactions')) {
      const txs = JSON.parse(localStorage.getItem('mock_transactions') || '[]');
      const wallets = JSON.parse(localStorage.getItem('mock_wallets') || '[]');
      
      const newTx = {
        id: Math.random().toString(36).substring(7),
        ...body,
        transactionDate: body.transactionDate || new Date().toISOString()
      };
      txs.unshift(newTx);
      
      // Update wallet balance
      const walletIdx = wallets.findIndex((w: any) => w.id === body.walletId);
      if (walletIdx !== -1) {
        if (body.type === 'EXPENSE') {
          wallets[walletIdx].currentBalance -= body.amount;
        } else {
          wallets[walletIdx].currentBalance += body.amount;
        }
      }
      
      localStorage.setItem('mock_transactions', JSON.stringify(txs));
      localStorage.setItem('mock_wallets', JSON.stringify(wallets));
      return newTx;
    }
    if (url.includes('/api/learning/courses') && url.includes('/sections')) {
      // Create section
      const match = url.match(/\/api\/learning\/courses\/([a-zA-Z0-9-]+)\/sections/);
      const courseId = match ? match[1] : '';
      const courses = JSON.parse(localStorage.getItem('mock_courses') || '[]');
      const cIdx = courses.findIndex((c: any) => c.id === courseId);
      if (cIdx !== -1) {
        const newSec = {
          id: Math.random().toString(36).substring(7),
          title: body.title,
          description: body.description || '',
          orderIndex: body.orderIndex || 1,
          lessons: []
        };
        if (!courses[cIdx].sections) courses[cIdx].sections = [];
        courses[cIdx].sections.push(newSec);
        localStorage.setItem('mock_courses', JSON.stringify(courses));
        return newSec;
      }
    }
    if (url.includes('/api/learning/sections') && url.includes('/lessons')) {
      // Create lesson
      const match = url.match(/\/api\/learning\/sections\/([a-zA-Z0-9-]+)\/lessons/);
      const sectionId = match ? match[1] : '';
      const courses = JSON.parse(localStorage.getItem('mock_courses') || '[]');
      for (const course of courses) {
        const sec = (course.sections || []).find((s: any) => s.id === sectionId);
        if (sec) {
          const newLes = {
            id: Math.random().toString(36).substring(7),
            title: body.title,
            summary: body.summary || '',
            content: body.content || '',
            durationSeconds: body.durationSeconds || 300,
            orderIndex: body.orderIndex || 1,
            isCompleted: false,
            completedAt: null
          };
          if (!sec.lessons) sec.lessons = [];
          sec.lessons.push(newLes);
          localStorage.setItem('mock_courses', JSON.stringify(courses));
          return newLes;
        }
      }
    }
    if (url.includes('/progress')) {
      // Update progress
      const match = url.match(/\/api\/learning\/lessons\/([a-zA-Z0-9-]+)\/progress/);
      const lessonId = match ? match[1] : '';
      const courses = JSON.parse(localStorage.getItem('mock_courses') || '[]');
      for (const course of courses) {
        for (const sec of (course.sections || [])) {
          const les = (sec.lessons || []).find((l: any) => l.id === lessonId);
          if (les) {
            les.isCompleted = body.progressPercent === 100;
            les.completedAt = les.isCompleted ? new Date().toISOString() : null;
            localStorage.setItem('mock_courses', JSON.stringify(courses));
            return { success: true };
          }
        }
      }
    }
    if (url.includes('/api/storage/upload')) {
      return {
        message: 'File uploaded successfully',
        file: {
          id: 'mock-file-id-' + Math.random().toString(36).substring(7),
          originalName: body instanceof FormData ? (body.get('file') as File)?.name || 'audio.mp3' : 'audio.mp3',
          storedName: 'mock_audio.mp3',
          size: '102400',
          mimeType: 'audio/mpeg',
          provider: 'LOCAL',
          path: '/uploads/mock_audio.mp3'
        }
      };
    }
    if (url.match(/\/api\/learning\/lessons\/([a-zA-Z0-9-]+)\/assets/)) {
      const match = url.match(/\/api\/learning\/lessons\/([a-zA-Z0-9-]+)\/assets/);
      const lessonId = match ? match[1] : '';
      const courses = JSON.parse(localStorage.getItem('mock_courses') || '[]');
      for (const course of courses) {
        for (const sec of (course.sections || [])) {
          const les = (sec.lessons || []).find((l: any) => l.id === lessonId);
          if (les) {
            if (!les.assets) les.assets = [];
            const newAsset = {
              id: 'mock-asset-id-' + Math.random().toString(36).substring(7),
              lessonId,
              fileId: body.fileId,
              assetType: body.assetType,
              orderIndex: body.orderIndex || 1,
              file: {
                id: body.fileId,
                originalName: 'audio.mp3',
                storedName: 'mock_audio.mp3',
                size: '102400',
                mimeType: 'audio/mpeg',
                provider: 'LOCAL',
                path: '/uploads/mock_audio.mp3'
              }
            };
            les.assets.push(newAsset);
            localStorage.setItem('mock_courses', JSON.stringify(courses));
            return newAsset;
          }
        }
      }
    }

    throw new Error(`Endpoint not mocked or found: ${url}`);
  },

  async patch(url: string, body: any) {
    cache.clear();
    if (!useMockFallback) {
      try {
        const response = await fetch(`${BASE_URL}${url}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders()
          },
          body: JSON.stringify(body)
        });
        if (!response.ok) throw new Error(await response.text() || 'API Error');
        const json = await response.json();
        return json && typeof json === 'object' && 'success' in json && 'data' in json ? json.data : json;
      } catch (err: any) {
        if (err.name === 'TypeError' || err.message.includes('fetch') || err.message.includes('NetworkError')) {
          useMockFallback = true;
        } else {
          throw err;
        }
      }
    }

    // MOCK IMPLEMENTATION
    if (url.includes('/api/notes/blocks/')) {
      const blockId = url.split('/').pop();
      const notes = JSON.parse(localStorage.getItem('mock_notes') || '[]');
      for (const note of notes) {
        const block = (note.noteBlocks || []).find((b: any) => b.id === blockId);
        if (block) {
          Object.assign(block, body);
          localStorage.setItem('mock_notes', JSON.stringify(notes));
          return block;
        }
      }
    }
    if (url.includes('/api/notes/')) {
      const noteId = url.split('/').pop();
      const notes = JSON.parse(localStorage.getItem('mock_notes') || '[]');
      const noteIdx = notes.findIndex((n: any) => n.id === noteId);
      if (noteIdx !== -1) {
        Object.assign(notes[noteIdx], body);
        localStorage.setItem('mock_notes', JSON.stringify(notes));
        return notes[noteIdx];
      }
    }
    if (url.includes('/api/learning/courses/')) {
      const courseId = url.split('/').pop();
      const courses = JSON.parse(localStorage.getItem('mock_courses') || '[]');
      const cIdx = courses.findIndex((c: any) => c.id === courseId);
      if (cIdx !== -1) {
        Object.assign(courses[cIdx], body);
        localStorage.setItem('mock_courses', JSON.stringify(courses));
        return courses[cIdx];
      }
    }
    if (url.includes('/api/learning/sections/')) {
      const sectionId = url.split('/').pop();
      const courses = JSON.parse(localStorage.getItem('mock_courses') || '[]');
      for (const course of courses) {
        const secIdx = (course.sections || []).findIndex((s: any) => s.id === sectionId);
        if (secIdx !== -1) {
          Object.assign(course.sections[secIdx], body);
          localStorage.setItem('mock_courses', JSON.stringify(courses));
          return course.sections[secIdx];
        }
      }
    }
    if (url.includes('/api/learning/lessons/')) {
      const lessonId = url.split('/').pop();
      const courses = JSON.parse(localStorage.getItem('mock_courses') || '[]');
      for (const course of courses) {
        for (const sec of (course.sections || [])) {
          const lesIdx = (sec.lessons || []).findIndex((l: any) => l.id === lessonId);
          if (lesIdx !== -1) {
            Object.assign(sec.lessons[lesIdx], body);
            localStorage.setItem('mock_courses', JSON.stringify(courses));
            return sec.lessons[lesIdx];
          }
        }
      }
    }

    throw new Error(`Endpoint not mocked or found: ${url}`);
  },

  async delete(url: string) {
    cache.clear();
    if (!useMockFallback) {
      try {
        const response = await fetch(`${BASE_URL}${url}`, {
          method: 'DELETE',
          headers: { ...getAuthHeaders() }
        });
        if (!response.ok) throw new Error(await response.text() || 'API Error');
        const json = await response.json();
        return json && typeof json === 'object' && 'success' in json && 'data' in json ? json.data : json;
      } catch (err: any) {
        if (err.name === 'TypeError' || err.message.includes('fetch') || err.message.includes('NetworkError')) {
          useMockFallback = true;
        } else {
          throw err;
        }
      }
    }

    // MOCK IMPLEMENTATION
    if (url.includes('/api/notes/blocks/')) {
      const blockId = url.split('/').pop();
      const notes = JSON.parse(localStorage.getItem('mock_notes') || '[]');
      for (const note of notes) {
        const idx = (note.noteBlocks || []).findIndex((b: any) => b.id === blockId);
        if (idx !== -1) {
          note.noteBlocks.splice(idx, 1);
          localStorage.setItem('mock_notes', JSON.stringify(notes));
          return { success: true };
        }
      }
    }
    if (url.includes('/api/notes/')) {
      const noteId = url.split('/').pop();
      const notes = JSON.parse(localStorage.getItem('mock_notes') || '[]');
      const filtered = notes.filter((n: any) => n.id !== noteId);
      localStorage.setItem('mock_notes', JSON.stringify(filtered));
      return { message: 'Note soft deleted successfully' };
    }
    if (url.includes('/api/finance/wallets/')) {
      const id = url.split('/').pop();
      const wallets = JSON.parse(localStorage.getItem('mock_wallets') || '[]');
      const filtered = wallets.filter((w: any) => w.id !== id);
      localStorage.setItem('mock_wallets', JSON.stringify(filtered));
      return { success: true };
    }
    if (url.includes('/api/finance/transactions/')) {
      const id = url.split('/').pop();
      const txs = JSON.parse(localStorage.getItem('mock_transactions') || '[]');
      const wallets = JSON.parse(localStorage.getItem('mock_wallets') || '[]');
      const tx = txs.find((t: any) => t.id === id);
      if (tx) {
        const walletIdx = wallets.findIndex((w: any) => w.id === tx.walletId);
        if (walletIdx !== -1) {
          if (tx.type === 'EXPENSE') {
            wallets[walletIdx].currentBalance += tx.amount;
          } else {
            wallets[walletIdx].currentBalance -= tx.amount;
          }
        }
        const filtered = txs.filter((t: any) => t.id !== id);
        localStorage.setItem('mock_transactions', JSON.stringify(filtered));
        localStorage.setItem('mock_wallets', JSON.stringify(wallets));
      }
      return { success: true };
    }
    if (url.includes('/api/learning/courses/')) {
      const id = url.split('/').pop();
      const courses = JSON.parse(localStorage.getItem('mock_courses') || '[]');
      const filtered = courses.filter((c: any) => c.id !== id);
      localStorage.setItem('mock_courses', JSON.stringify(filtered));
      return { success: true };
    }
    if (url.includes('/api/learning/sections/')) {
      const sectionId = url.split('/').pop();
      const courses = JSON.parse(localStorage.getItem('mock_courses') || '[]');
      for (const course of courses) {
        const idx = (course.sections || []).findIndex((s: any) => s.id === sectionId);
        if (idx !== -1) {
          course.sections.splice(idx, 1);
          localStorage.setItem('mock_courses', JSON.stringify(courses));
          return { success: true };
        }
      }
      return { success: true };
    }
    if (url.includes('/api/learning/lessons/') && !url.includes('/assets/')) {
      const lessonId = url.split('/').pop();
      const courses = JSON.parse(localStorage.getItem('mock_courses') || '[]');
      for (const course of courses) {
        for (const sec of (course.sections || [])) {
          const idx = (sec.lessons || []).findIndex((l: any) => l.id === lessonId);
          if (idx !== -1) {
            sec.lessons.splice(idx, 1);
            localStorage.setItem('mock_courses', JSON.stringify(courses));
            return { success: true };
          }
        }
      }
      return { success: true };
    }
    if (url.includes('/api/learning/lessons/assets/')) {
      const assetId = url.split('/').pop();
      const courses = JSON.parse(localStorage.getItem('mock_courses') || '[]');
      for (const course of courses) {
        for (const sec of (course.sections || [])) {
          for (const les of (sec.lessons || [])) {
            if (les.assets) {
              const idx = les.assets.findIndex((a: any) => a.id === assetId);
              if (idx !== -1) {
                les.assets.splice(idx, 1);
                localStorage.setItem('mock_courses', JSON.stringify(courses));
                return { success: true };
              }
            }
          }
        }
      }
      return { success: true };
    }

    throw new Error(`Endpoint not mocked or found: ${url}`);
  }
};
