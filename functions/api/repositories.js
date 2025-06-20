import { Octokit } from 'octokit';
import { 
  getActiveRepository, 
  getAllRepositories, 
  createNewRepository,
  updateRepositorySizeEstimate,
  syncRepositoryFileCount,
  syncAllRepositoriesFileCount
} from './repository-manager.js';

// CORS头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * 验证管理员权限
 * @param {Request} request - 请求对象
 * @param {Object} env - 环境变量
 * @returns {Promise<boolean>} - 是否有权限
 */
async function checkAdminAuth(request, env) {
  try {
    // 从Cookie中获取会话ID
    const cookies = request.headers.get('cookie') || '';
    const sessionIdMatch = cookies.match(/session_id=([^;]+)/);
    
    if (!sessionIdMatch) {
      return false;
    }
    
    const sessionId = sessionIdMatch[1];
    
    // 验证会话
    const session = await env.DB.prepare(
      'SELECT * FROM sessions WHERE id = ? AND expires_at > CURRENT_TIMESTAMP'
    ).bind(sessionId).first();
    
    if (!session) {
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('验证管理员权限失败:', error);
    return false;
  }
}

/**
 * 同步仓库大小
 * @param {Object} env - 环境变量
 * @param {number} repoId - 仓库ID
 * @returns {Promise<Object>} - 同步结果
 */
async function syncRepositorySize(env, repoId) {
  try {
    // 获取仓库信息
    const repo = await env.DB.prepare(`
      SELECT * FROM repositories WHERE id = ?
    `).bind(repoId).first();
    
    if (!repo) {
      return { success: false, error: '仓库不存在' };
    }
    
    // 直接从folder_files表获取实际文件数量和总大小
    const statsResult = await env.DB.prepare(`
      SELECT 
        COUNT(*) as file_count,
        COALESCE(SUM(size), 0) as total_size
      FROM folder_files 
      WHERE repository_id = ?
    `).bind(repoId).first();
    
    const actualSize = statsResult.total_size || 0;
    const fileCount = statsResult.file_count || 0;
    
    // 更新数据库中的大小估算
    await env.DB.prepare(`
      UPDATE repositories 
      SET size_estimate = ?, 
          updated_at = datetime('now', '+8 hours')
      WHERE id = ?
    `).bind(actualSize, repoId).run();
    
    // 检查是否达到阈值
    const thresholdSetting = await env.DB.prepare(`
      SELECT value FROM settings WHERE key = 'repository_size_threshold'
    `).first();
    
    // 确保解析为整数，使用默认值900MB如果没有设置
    const repoSizeThreshold = thresholdSetting && !isNaN(parseInt(thresholdSetting.value)) ? 
      parseInt(thresholdSetting.value) : 
      900 * 1024 * 1024; // 默认900MB
    
    console.log(`使用仓库大小阈值: ${repoSizeThreshold} 字节 (${Math.round(repoSizeThreshold / (1024 * 1024))}MB)`);
    console.log(`当前仓库实际大小: ${actualSize} 字节 (${Math.round(actualSize / (1024 * 1024))}MB)`);
    
    // 如果达到或超过阈值，更新状态
    if (actualSize >= repoSizeThreshold && repo.status !== 'full') {
      await env.DB.prepare(`
        UPDATE repositories SET status = 'full', updated_at = datetime('now', '+8 hours')
        WHERE id = ?
      `).bind(repoId).run();
      
      console.log(`仓库 ${repo.name} 已达到大小阈值 ${Math.round(repoSizeThreshold / (1024 * 1024))}MB，状态更新为 'full'`);
    } else if (actualSize < repoSizeThreshold && repo.status === 'full') {
      // 如果之前标记为满但现在未满，恢复状态
      await env.DB.prepare(`
        UPDATE repositories SET status = 'active', updated_at = datetime('now', '+8 hours')
        WHERE id = ?
      `).bind(repoId).run();
      
      console.log(`仓库 ${repo.name} 大小低于阈值 ${Math.round(repoSizeThreshold / (1024 * 1024))}MB，状态更新为 'active'`);
    }
    
    return { 
      success: true, 
      size: actualSize,
      file_count: fileCount,
      threshold: repoSizeThreshold,
      isFull: actualSize >= repoSizeThreshold
    };
  } catch (error) {
    console.error('同步仓库大小失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 处理请求
 * @param {Object} context - 请求上下文
 * @returns {Promise<Response>} - 响应对象
 */
export async function onRequest(context) {
  try {
  const { request, env } = context;
  const url = new URL(request.url);
      const path = url.pathname.replace('/api/repositories', '').replace(/^\/+/, '');
      
      console.log('处理仓库管理请求:', {
        fullPath: url.pathname,
        method: request.method,
        path: path,
        url: request.url,
        pathStartsWithCreateFolder: path.startsWith('create-folder/'),
        pathLength: path.length
      });
  
  // 处理OPTIONS请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }
  
  // 验证管理员权限
  const isAdmin = await checkAdminAuth(request, env);
  
  if (!isAdmin) {
    return new Response(JSON.stringify({
      success: false,
      error: '需要管理员权限'
    }), {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
  
  // 获取所有仓库列表
  if (path === '' && request.method === 'GET') {
      console.log('匹配到获取仓库列表路径');
    try {
      const repos = await getAllRepositories(env);
      
      // 获取每个仓库的文件数量和总大小
      for (const repo of repos) {
        const stats = await env.DB.prepare(`
          SELECT 
            COUNT(*) as file_count,
            COALESCE(SUM(size), 0) as total_size
          FROM folder_files 
          WHERE repository_id = ?
        `).bind(repo.id).first();
        
        repo.file_count = stats.file_count;
        repo.total_size = stats.total_size;
        
        // 获取仓库大小阈值
        const thresholdSetting = await env.DB.prepare(`
          SELECT value FROM settings WHERE key = 'repository_size_threshold'
        `).first();
        
        repo.size_limit = thresholdSetting && !isNaN(parseInt(thresholdSetting.value)) ? 
          parseInt(thresholdSetting.value) : 
          900 * 1024 * 1024; // 默认900MB
      }
      
      return new Response(JSON.stringify({
        success: true,
        data: repos
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    } catch (error) {
      console.error('获取仓库列表失败:', error);
      return new Response(JSON.stringify({
        success: false,
        error: error.message
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  }
  
  // 同步仓库文件计数
    if (path.startsWith('sync-file-count/') && request.method === 'POST') {
      console.log('匹配到同步文件计数路径');
    try {
        const repoId = parseInt(path.replace('sync-file-count/', ''));
      
      if (isNaN(repoId)) {
        return new Response(JSON.stringify({
          success: false,
          error: '无效的仓库ID'
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      console.log(`同步仓库(ID: ${repoId})的文件计数`);
      const result = await syncRepositoryFileCount(env, repoId);
      
      return new Response(JSON.stringify(result), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    } catch (error) {
      console.error('同步仓库文件计数失败:', error);
      return new Response(JSON.stringify({
        success: false,
        error: '同步仓库文件计数失败: ' + error.message
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  }
  
  // 同步所有仓库文件计数
    if (path === 'sync-all-file-counts' && request.method === 'POST') {
      console.log('匹配到同步所有文件计数路径');
    try {
      console.log('同步所有仓库的文件计数');
      const result = await syncAllRepositoriesFileCount(env);
      
      return new Response(JSON.stringify(result), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    } catch (error) {
      console.error('同步所有仓库文件计数失败:', error);
      return new Response(JSON.stringify({
        success: false,
        error: '同步所有仓库文件计数失败: ' + error.message
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  }
  
  // 创建新仓库
    if (path === 'create' && request.method === 'POST') {
      console.log('匹配到创建仓库路径');
    try {
      console.log('收到创建仓库请求');
      
      // 检查数据库连接
      if (!env.DB) {
        console.error('缺少数据库连接');
        return new Response(JSON.stringify({
          success: false,
          error: '服务器配置错误: 数据库未连接'
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // 尝试检查数据库连接
      try {
        await env.DB.prepare('SELECT 1').first();
      } catch (dbTestError) {
        console.error('数据库连接测试失败:', dbTestError);
        return new Response(JSON.stringify({
          success: false,
          error: '数据库连接失败: ' + dbTestError.message
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      let baseName = 'images-repo';
      
      try {
        const data = await request.json();
        if (data && data.baseName) {
          baseName = data.baseName;
        }
        console.log('解析请求JSON成功:', data);
      } catch (parseError) {
        console.warn('解析请求JSON失败，使用默认仓库名称:', parseError);
      }
      
      console.log(`创建新仓库，使用基础名称: ${baseName}`);
      
      try {
        // 检查GitHub相关环境变量
        if (!env.GITHUB_TOKEN) {
          console.error('缺少GITHUB_TOKEN环境变量');
          return new Response(JSON.stringify({
            success: false,
            error: '服务器配置错误: 缺少GitHub令牌'
          }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }
        
        if (!env.GITHUB_OWNER) {
          console.error('缺少GITHUB_OWNER环境变量');
          return new Response(JSON.stringify({
            success: false,
            error: '服务器配置错误: 缺少GitHub所有者'
          }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }
        
        // 使用GitHub API创建仓库
        const newRepo = await createNewRepository(env, baseName);
        
        console.log('仓库创建成功:', newRepo);
        
        return new Response(JSON.stringify({
          success: true,
          data: newRepo
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      } catch (repoError) {
        console.error('创建仓库失败:', repoError);
        return new Response(JSON.stringify({
          success: false,
          error: '创建仓库失败: ' + repoError.message
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
        
    } catch (error) {
      console.error('处理创建仓库请求失败:', error);
      return new Response(JSON.stringify({
        success: false,
        error: '处理创建仓库请求失败: ' + error.message
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  }
  
    // 创建文件夹
    if (path.startsWith('create-folder/') && request.method === 'POST') {
      console.log('匹配到创建文件夹路径:', {
        path: path,
        method: request.method,
        startsWithCreateFolder: path.startsWith('create-folder/'),
        isPost: request.method === 'POST'
      });
      
      try {
        const repoId = parseInt(path.replace('create-folder/', ''));
        
        if (isNaN(repoId)) {
          return new Response(JSON.stringify({
            success: false,
            error: '无效的仓库ID'
          }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }
        
        // 解析请求体
        const requestData = await request.json();
        const { folderName } = requestData;
        
        if (!folderName || !folderName.trim()) {
          return new Response(JSON.stringify({
            success: false,
            error: '文件夹名称不能为空'
          }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }
        
        // 验证文件夹名称格式 - 允许中文字符和其他Unicode字符
        const folderNameRegex = /^[\u4e00-\u9fa5a-zA-Z0-9_-]+$/;
        if (!folderNameRegex.test(folderName.trim())) {
          return new Response(JSON.stringify({
            success: false,
            error: '文件夹名称只能包含中文、字母、数字、下划线和连字符'
          }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }
        
        console.log(`创建文件夹请求: 仓库ID=${repoId}, 文件夹名=${folderName}`);
        
        // 获取仓库信息
        const repo = await env.DB.prepare(`
          SELECT * FROM repositories WHERE id = ?
        `).bind(repoId).first();
        
        if (!repo) {
          return new Response(JSON.stringify({
            success: false,
            error: '仓库不存在'
          }), {
            status: 404,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }
        
        // 创建Octokit实例
        const octokit = new Octokit({
          auth: repo.token || env.GITHUB_TOKEN
        });
        
        // 创建文件夹路径
        const folderPath = `public/${folderName.trim()}`;
        
        // 创建文件夹（通过创建一个占位文件）
        const placeholderContent = '';
        const fileName = '.gitkeep';

        // 先检查要创建的文件夹路径在GitHub上的真实状态
        try {
          const folderInfo = await octokit.rest.repos.getContent({
            owner: repo.owner,
            repo: repo.name,
            path: folderPath,
            ref: 'main'
          });
          console.log('getContent public/量子力学32 结果:', folderInfo);
        } catch (e) {
          console.error('getContent public/量子力学32 出错:', e);
        }

        console.log('准备调用octokit.createOrUpdateFileContents');
        let sha = undefined;
        try {
          const fileInfo = await octokit.rest.repos.getContent({
            owner: repo.owner,
            repo: repo.name,
            path: `${folderPath}/${fileName}`,
          });
          sha = fileInfo.data.sha;
          console.log(`${fileName}已存在，sha:`, sha);
        } catch (e) {
          if (e.status !== 404) {
            console.error(`getContent查sha出错:`, e);
            return new Response(JSON.stringify({
              success: false,
              error: '查sha失败: ' + e.message
            }), {
              status: 500,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
              }
            });
          } else {
            console.log(`${fileName}不存在，将新建`);
          }
        }

        const params = {
          owner: repo.owner,
          repo: repo.name,
          path: `${folderPath}/${fileName}`,
          message: `创建文件夹: ${folderName}`,
          content: btoa(unescape(encodeURIComponent(placeholderContent))),
          branch: 'main'
        };
        if (sha) params.sha = sha;

        try {
          const result = await Promise.race([
            octokit.rest.repos.createOrUpdateFileContents(params),
            new Promise((_, reject) => setTimeout(() => reject(new Error('octokit超时')), 10000))
          ]);
          console.log('octokit.createOrUpdateFileContents调用完成', result);
        } catch (createError) {
          console.error('octokit.createOrUpdateFileContents调用出错:', createError);
          return new Response(JSON.stringify({
            success: false,
            error: '创建文件夹失败: ' + createError.message
          }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }
        
        // 保存文件夹信息到数据库
        let dbSuccess = false;
        try {
          console.log(`准备插入数据库: repoId=${repoId}, folderName=${folderName.trim()}, folderPath=${folderPath}`);
          console.log(`repoId类型: ${typeof repoId}, 值: ${repoId}`);
          console.log(`folderName类型: ${typeof folderName.trim()}, 值: ${folderName.trim()}`);
          console.log(`folderPath类型: ${typeof folderPath}, 值: ${folderPath}`);
          
          // 检查仓库是否存在
          const repoCheck = await env.DB.prepare(`
            SELECT id, name FROM repositories WHERE id = ?
          `).bind(repoId).first();
          
          console.log(`仓库检查结果:`, repoCheck);
          
          if (!repoCheck) {
            console.error(`仓库ID ${repoId} 不存在`);
            // 不返回错误，只记录警告，因为GitHub上的文件夹已经创建成功
            console.warn('仓库不存在，但GitHub文件夹已创建成功');
          } else {
            // 确保repoId是数字类型
            const numericRepoId = parseInt(repoId, 10);
            console.log(`转换后的repoId: ${numericRepoId}, 类型: ${typeof numericRepoId}`);
            
            // 检查文件夹是否已存在
            const existingFolder = await env.DB.prepare(`
              SELECT id FROM folders WHERE path = ?
            `).bind(folderPath).first();
            
            if (!existingFolder) {
              const insertResult = await env.DB.prepare(`
                INSERT INTO folders (name, path, repository_id, created_at, updated_at)
                VALUES (?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))
              `).bind(folderName.trim(), folderPath, numericRepoId).run();
              
              console.log(`插入结果:`, insertResult);
              console.log(`文件夹信息已保存到数据库: ${folderName}, repository_id: ${numericRepoId}`);
              dbSuccess = true;
            } else {
              console.log('文件夹已存在于数据库中，跳过插入');
              dbSuccess = true;
            }
          }
        } catch (dbError) {
          console.error('保存文件夹信息到数据库失败:', dbError);
          console.error('数据库错误详情:', {
            message: dbError.message,
            code: dbError.code,
            errno: dbError.errno
          });
          // 不影响创建结果，只记录警告
        }
        
        // 返回成功响应，因为GitHub上的文件夹已经创建成功
        return new Response(JSON.stringify({
          success: true,
          message: '文件夹创建成功',
          folderPath: folderPath,
          dbSuccess: dbSuccess
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
        
      } catch (error) {
        console.error('处理创建文件夹请求失败:', error);
        console.error('错误详情:', {
          message: error.message,
          stack: error.stack,
          name: error.name,
          cause: error.cause
        });
        return new Response(JSON.stringify({
          success: false,
          error: '处理创建文件夹请求失败: ' + error.message,
          details: error.stack
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    }
  
  // 更新仓库状态
  if (path.startsWith('/status/') && request.method === 'PUT') {
    try {
      const repoId = parseInt(path.replace('/status/', ''));
      
      if (isNaN(repoId)) {
        return new Response(JSON.stringify({
          success: false,
          error: '无效的仓库ID'
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      const requestData = await request.json();
      const { status } = requestData;
      
      if (!status) {
        return new Response(JSON.stringify({
          success: false,
          error: '状态值不能为空'
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      if (!['active', 'inactive', 'full'].includes(status)) {
        return new Response(JSON.stringify({
          success: false,
          error: '无效的状态值，必须为 active、inactive 或 full'
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // 更新状态
      await env.DB.prepare(`
        UPDATE repositories 
          SET status = ?, updated_at = datetime('now', '+8 hours')
        WHERE id = ?
      `).bind(status, repoId).run();
      
      return new Response(JSON.stringify({
        success: true,
        message: `仓库状态已更新为 ${status}`
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    } catch (error) {
      console.error('更新仓库状态失败:', error);
      return new Response(JSON.stringify({
        success: false,
        error: '更新仓库状态失败: ' + error.message
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  }
  
  // 同步仓库大小
  if (path.startsWith('/sync-size/') && request.method === 'POST') {
    try {
      const repoId = parseInt(path.replace('/sync-size/', ''));
      
      if (!repoId || isNaN(repoId)) {
        return new Response(JSON.stringify({
          success: false,
          error: '无效的仓库ID'
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      const result = await syncRepositorySize(env, repoId);
      
      return new Response(JSON.stringify(result), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    } catch (error) {
      console.error('同步仓库大小失败:', error);
      return new Response(JSON.stringify({
        success: false,
        error: '同步仓库大小失败: ' + error.message
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  }
  
  // 同步所有仓库大小
  if (path === '/sync-all-sizes' && request.method === 'POST') {
    try {
      const repos = await getAllRepositories(env);
      const results = [];
      
      for (const repo of repos) {
        const result = await syncRepositorySize(env, repo.id);
        results.push({
          id: repo.id,
          name: repo.name,
          ...result
        });
      }
      
      return new Response(JSON.stringify({
        success: true,
        data: results
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    } catch (error) {
      console.error('同步所有仓库大小失败:', error);
      return new Response(JSON.stringify({
        success: false,
        error: '同步所有仓库大小失败: ' + error.message
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  }
  
  // 激活仓库
  if (path.match(/^\/\d+\/activate$/) && request.method === 'POST') {
    try {
      const repoId = parseInt(path.replace('/activate', '').substring(1));
      
      if (!repoId || isNaN(repoId)) {
        return new Response(JSON.stringify({
          success: false,
          error: '无效的仓库ID'
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // 先将所有仓库设置为非活跃
      await env.DB.prepare(`
          UPDATE repositories SET status = 'inactive', updated_at = datetime('now', '+8 hours')
        WHERE status = 'active'
      `).run();
      
      // 将指定仓库设置为活跃
      await env.DB.prepare(`
          UPDATE repositories SET status = 'active', updated_at = datetime('now', '+8 hours')
        WHERE id = ?
      `).bind(repoId).run();
      
      return new Response(JSON.stringify({
        success: true,
        message: '仓库已设置为活跃状态'
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    } catch (error) {
      console.error('激活仓库失败:', error);
      return new Response(JSON.stringify({
        success: false,
        error: '激活仓库失败: ' + error.message
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  }
  
  // 未找到匹配的路由
    console.log('未找到匹配的路由:', {
      path: path,
      method: request.method,
      fullPath: url.pathname,
      url: request.url
    });
    
  return new Response(JSON.stringify({
    success: false,
      error: 'API endpoint repositories' + path + ' not found',
      debug: {
        path: path,
        method: request.method,
        fullPath: url.pathname
      }
  }), {
    status: 404,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
  } catch (error) {
    console.error('处理请求失败:', error);
    return new Response(JSON.stringify({
      success: false,
      error: '处理请求失败: ' + error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
} 
