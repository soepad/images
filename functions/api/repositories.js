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
      
      return new Response(JSON.stringify({
        success: true,
        data: []
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
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
