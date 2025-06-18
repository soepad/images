// CORS头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

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
      url: request.url
    });
    
    // 处理OPTIONS请求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }
    
    // 创建文件夹
    if (path.startsWith('/create-folder/') && request.method === 'POST') {
      console.log('匹配到创建文件夹路径');
      
      return new Response(JSON.stringify({
        success: true,
        message: '测试响应 - 创建文件夹功能正常',
        folderPath: 'test/path'
      }), {
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
        // 从数据库获取所有仓库
        const repos = await env.DB.prepare(`
          SELECT * FROM repositories ORDER BY priority ASC, id ASC
        `).all();
        
        // 获取每个仓库的文件数量和总大小
        for (const repo of repos.results) {
          const stats = await env.DB.prepare(`
            SELECT 
              COUNT(*) as file_count,
              COALESCE(SUM(size), 0) as total_size
            FROM images 
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
          data: repos.results
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
    
    // 默认响应
    return new Response(JSON.stringify({
      success: false,
      error: '未找到匹配的路由'
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
