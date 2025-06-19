import { Octokit } from 'octokit';
import bcrypt from 'bcryptjs';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { 
  decreaseRepositorySizeEstimate,
  syncRepositoryFileCount
} from './repository-manager.js';

// CORS头
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  'Pragma': 'no-cache',
  'Expires': '0'
};

// 生成JSON响应的帮助函数
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
}

// 检查用户会话
async function checkSession(request, env) {
  // 从Cookie中获取会话ID
  let sessionId = null;
  const cookieHeader = request.headers.get('Cookie');
  
  if (cookieHeader) {
    const cookies = cookieHeader.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'session_id') {
        sessionId = value;
        break;
      }
    }
  }
  
  if (!sessionId || !env.DB) {
    console.log('未找到有效的会话ID或数据库未配置');
    return null;
  }
  
  try {
    console.log('检查会话ID:', sessionId);
    // 检查会话是否有效
    const session = await env.DB.prepare(
      'SELECT * FROM sessions WHERE id = ? AND expires_at > CURRENT_TIMESTAMP'
    ).bind(sessionId).first();
    
    if (!session) {
      console.log('会话不存在或已过期');
      return null;
    }
    
    console.log('会话有效，用户:', session.username);
    return session;
  } catch (error) {
    console.error('验证用户会话状态失败:', error);
    return null;
  }
}

/**
 * 触发Cloudflare Pages部署钩子
 * @param {Object} env 环境变量
 * @returns {Object} 部署结果
 */
async function triggerDeployHook(env) {
  // 检查部署钩子是否正确配置
  if (!env.DEPLOY_HOOK || !env.DEPLOY_HOOK.startsWith('https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/')) {
    console.error('DEPLOY_HOOK环境变量未正确设置或格式不正确');
    return { success: false, error: 'DEPLOY_HOOK环境变量未正确设置或格式不正确' };
  }

  try {
    // GitHub API已经确认了文件上传成功，无需额外延时
    console.log('正在触发Cloudflare Pages部署钩子...');
    const response = await fetch(env.DEPLOY_HOOK, {
      method: 'POST',
    });

    if (response.ok) {
      const result = await response.json();
      console.log('部署触发成功:', result);
      return { success: true, result };
    } else {
      const error = await response.text();
      console.error('部署触发失败:', response.status, error);
      return { success: false, error: `部署触发失败: ${response.status} ${error}` };
    }
  } catch (error) {
    console.error('部署触发过程中出错:', error);
    return { success: false, error: `部署触发过程中出错: ${error.message}` };
  }
}

// 从GitHub删除图片的辅助函数
async function deleteImageFromGithub(env, image, repositoryInfo) {
  try {
    const octokit = new Octokit({
      auth: repositoryInfo.token
    });

    try {
      // 尝试删除GitHub上的文件
      console.log(`尝试从仓库删除: owner=${repositoryInfo.owner}, repo=${repositoryInfo.repo}, path=${image.github_path}`);
      
      const githubResponse = await octokit.repos.deleteFile({
        owner: repositoryInfo.owner,
        repo: repositoryInfo.repo,
        path: image.github_path,
        message: `Delete ${image.filename}`,
        sha: image.sha,
        branch: 'main'
      });

      console.log('从GitHub删除图片成功:', githubResponse);
      return true;
    } catch (githubError) {
      console.error('从GitHub删除图片失败:', githubError);
      
      // 检查是否是"文件不存在"错误
      const isNotFoundError = 
        githubError.message?.includes('Not Found') || 
        githubError.status === 404 ||
        (githubError.response && githubError.response.status === 404);
        
      if (!isNotFoundError) {
        // 如果不是"文件不存在"错误，返回失败
        throw new Error(`从GitHub删除图片失败: ${githubError.message}`);
      }
      
      // 如果是"文件不存在"错误，记录日志但继续处理
      console.log('GitHub上文件已不存在，继续删除数据库记录');
      return true;
    }
  } catch (error) {
    console.error('删除操作失败:', error);
    throw error;
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/', '').replace(/^\/+|\/+$/g, '');
  
  // 添加 CORS 头
  const corsHeaders = {
    'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Cookie',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  };

  // 详细日志
  console.log('API 请求详情:', {
    fullUrl: request.url,
    pathname: url.pathname,
    path: path,
    method: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    hasDB: !!env.DB,
    env: {
      hasGithubToken: !!env.GITHUB_TOKEN,
      hasGithubOwner: !!env.GITHUB_OWNER,
      hasGithubRepo: !!env.GITHUB_REPO,
      hasSiteUrl: !!env.SITE_URL
    }
  });

  // 处理 OPTIONS 请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }

  try {
    // 添加调试模式检查
    const isDebugMode = request.headers.get('X-Debug-Mode') === 'true' || url.searchParams.has('debug');
    
    // 处理管理员登出请求
    if (path.toLowerCase() === 'admin/logout') {
      try {
        console.log('处理管理员登出请求');
        
        // 设置一个空值的Cookie来删除session_id，使用简单格式
        const cookieHeader = `session_id=; Path=/; Max-Age=0`;
        
        return new Response(JSON.stringify({ success: true }), {
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': cookieHeader,
            ...corsHeaders
          }
        });
      } catch (error) {
        console.error('登出错误:', error);
        return new Response(JSON.stringify({ error: '登出失败' }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    }

    // 处理管理员登录请求
    if (path.toLowerCase() === 'admin/login') {
      // 只允许 POST 方法
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
          status: 405,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      try {
        console.log('处理管理员登录请求');
        const data = await request.json();
        const { username, password, recaptchaResponse } = data;
        
        console.log(`尝试登录: 用户名=${username}, 密码长度=${password ? password.length : 0}, reCAPTCHA响应长度=${recaptchaResponse ? recaptchaResponse.length : 0}`);
        
        if (!username || !password) {
          return new Response(JSON.stringify({ error: '用户名和密码不能为空' }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }

        // 验证reCAPTCHA
        const recaptchaSiteKey = env.RECAPTCHA_SITE_KEY;
        const recaptchaSecretKey = env.RECAPTCHA_SECRET_KEY;
        const recaptchaEnabled = !!(recaptchaSiteKey && recaptchaSecretKey);
        
        if (recaptchaEnabled) {
          console.log('reCAPTCHA已启用，开始验证');
          
          if (!recaptchaResponse) {
            console.log('reCAPTCHA验证失败: 没有提供响应');
            return new Response(JSON.stringify({ error: '请完成人机验证' }), {
              status: 400,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
              }
            });
          }
          
          try {
            // 验证reCAPTCHA响应
            const verifyURL = 'https://recaptcha.net/recaptcha/api/siteverify';
            const verifyParams = new URLSearchParams({
              secret: recaptchaSecretKey,
              response: recaptchaResponse
            });
            
            console.log('正在验证reCAPTCHA响应...');
            const verifyResponse = await fetch(verifyURL, {
              method: 'POST',
              body: verifyParams
            });
            
            const verifyResult = await verifyResponse.json();
            console.log('reCAPTCHA验证结果:', verifyResult);
            
            if (!verifyResult.success) {
              console.log('reCAPTCHA验证失败');
              return new Response(JSON.stringify({ error: '人机验证失败，请重试' }), {
                status: 400,
                headers: {
                  'Content-Type': 'application/json',
                  ...corsHeaders
                }
              });
            }
            
            console.log('reCAPTCHA验证成功');
          } catch (recaptchaError) {
            console.error('验证reCAPTCHA时出错:', recaptchaError);
            // 如果我们无法验证reCAPTCHA，暂时允许继续（在生产环境中可能需要更严格的处理）
            console.log('无法验证reCAPTCHA，但允许继续登录流程');
          }
        } else {
          console.log('reCAPTCHA未启用，跳过验证');
        }

        // 查询用户
        console.log('查询用户:', username);
        if (!env.DB) {
          console.error('数据库未连接');
          return new Response(JSON.stringify({ error: '服务器错误: 数据库未连接' }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }
        
        const user = await env.DB.prepare(
          'SELECT * FROM users WHERE username = ?'
        ).bind(username).first();
        
        console.log('查询结果:', user ? '用户存在' : '用户不存在');
        if (user) {
          console.log('用户ID:', user.id);
          console.log('密码哈希:', user.password);
        }
        
        if (!user) {
          console.log('用户不存在');
          return new Response(JSON.stringify({ error: '用户名或密码错误' }), {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }
        
        // 验证当前密码是否正确
        let isValid = false;
        try {
            console.log('验证当前密码');
            isValid = await bcrypt.compare(password, user.password);
        } catch (error) {
            console.error('密码验证出错:', error);
            isValid = false;
        }
        
        if (!isValid) {
            console.log('当前密码验证失败');
            return new Response(JSON.stringify({ error: '当前密码不正确' }), {
                status: 400,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders
                }
            });
        }
        
        console.log('密码验证成功，开始创建会话...');
        // 创建会话，使用 Web Crypto API 的 randomUUID 方法
        const sessionId = crypto.randomUUID();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // 7天后过期
        
        await env.DB.prepare(`
          INSERT INTO sessions (id, user_id, username, expires_at)
          VALUES (?, ?, ?, ?)
        `).bind(
          sessionId,
          user.id,
          user.username,
          expiresAt.toISOString()
        ).run();
        
        // 设置 cookie - 使用更可靠的格式
        // 避免使用任何高级选项，只设置必要的信息
        const cookieHeader = `session_id=${sessionId}; Path=/`;
        
        console.log('设置Cookie:', cookieHeader);
        
        // 创建响应
        const responseBody = JSON.stringify({ 
          success: true,
          message: '登录成功',
          sessionId: sessionId,  // 添加会话ID以便调试
          user: {
            id: user.id,
            username: user.username
          }
        });
        
        console.log('登录响应:', responseBody);
        
        return new Response(responseBody, {
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': cookieHeader,
            ...corsHeaders
          }
        });
      } catch (error) {
        console.error('登录错误:', error);
        return new Response(JSON.stringify({ error: '登录失败: ' + error.message }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    }

    // 处理文件上传 - 优化路径匹配
    if (path.toLowerCase() === 'upload') {
      // 只允许 POST 方法
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
          status: 405,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      try {
        // 检查游客上传权限
        console.log('检查游客上传权限');
        
        // 检查是否存在会话(已登录)
        const isLoggedIn = request.headers.get('cookie')?.includes('session_id=');
        console.log('用户登录状态:', isLoggedIn ? '已登录' : '未登录');
        
        // 如果未登录，检查是否允许游客上传
        if (!isLoggedIn) {
          console.log('用户未登录，检查游客上传权限');
          
          const setting = await env.DB.prepare(
            'SELECT value FROM settings WHERE key = ?'
          ).bind('allow_guest_upload').first();
          
          const allowGuestUpload = setting?.value === 'true';
          console.log('游客上传权限设置:', allowGuestUpload ? '允许' : '禁止');
          
          if (!allowGuestUpload) {
            console.log('游客上传已禁用，拒绝请求');
            return new Response(JSON.stringify({ 
              success: false,
              error: '游客上传已禁用，请登录后再试'
            }), {
              status: 403,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
              }
            });
          }
        }

        console.log('开始处理文件上传');
        const formData = await request.formData();
        const file = formData.get('file');
        
        if (!file) {
          console.error('未找到文件');
          return new Response(JSON.stringify({ error: '未找到文件' }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }

        console.log('文件信息:', {
          name: file.name,
          type: file.type,
          size: file.size
        });

        // 检查文件类型
        try {
          console.log('检查文件类型');
          const allowedTypesSettings = await env.DB.prepare(
            'SELECT value FROM settings WHERE key = ?'
          ).bind('allowed_types').first();
          
          const allowedTypes = allowedTypesSettings?.value 
            ? allowedTypesSettings.value.split(',') 
            : ['*/*']; // 允许所有文件类型
          
          console.log('允许的文件类型:', allowedTypes);
          
          // 如果设置为允许所有类型，跳过类型检查
          if (allowedTypes.includes('*/*') || allowedTypes.includes('*')) {
            console.log('允许所有文件类型，跳过类型检查');
          } else if (!allowedTypes.includes(file.type)) {
            console.error('不支持的文件类型:', file.type);
            return new Response(JSON.stringify({ 
              error: '不支持的文件类型',
              allowedTypes: allowedTypes.join(', ')
            }), {
              status: 400,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
              }
            });
          }
        } catch (error) {
          console.error('检查文件类型时出错:', error);
          // 如果出错，允许所有文件类型
          console.log('文件类型检查出错，允许所有文件类型');
        }

        // 检查文件大小
        const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
        if (file.size > MAX_FILE_SIZE) {
          return new Response(JSON.stringify({ error: '文件大小超过限制 (最大 25MB)' }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }

        // 初始化 Octokit
        console.log('初始化 Octokit');
        const octokit = new Octokit({
          auth: env.GITHUB_TOKEN
        });

        // 验证 GitHub 配置
        console.log('验证 GitHub 配置');
        try {
          const repoInfo = await octokit.repos.get({
            owner: env.GITHUB_OWNER,
            repo: env.GITHUB_REPO
          });
          console.log('仓库信息:', {
            name: repoInfo.data.name,
            full_name: repoInfo.data.full_name,
            private: repoInfo.data.private,
            permissions: repoInfo.data.permissions
          });
        } catch (error) {
          console.error('GitHub 仓库验证失败:', error);
          return new Response(JSON.stringify({ 
            error: 'GitHub 仓库验证失败，请检查仓库名称和权限设置',
            details: error.message
          }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }

        // 上传到 GitHub
        console.log('开始上传到 GitHub');
        const buffer = await file.arrayBuffer();
        
        // 使用更高效的方式将 ArrayBuffer 转换为 base64
        const base64 = btoa(
          new Uint8Array(buffer)
            .reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        
        // 获取当前时间并转换为北京时间
        const now = new Date();
        // 调整为北京时间（UTC+8）
        const beijingNow = new Date(now.getTime() + (8 * 60 * 60 * 1000));
        
        // 构建按年/月/日的目录结构
        const year = beijingNow.getUTCFullYear();
        const month = String(beijingNow.getUTCMonth() + 1).padStart(2, '0');
        const day = String(beijingNow.getUTCDate()).padStart(2, '0');
        const datePath = `${year}/${month}/${day}`;
        
        // 构建文件存储路径
        const filePath = `public/${datePath}/${file.name}`;
        
        console.log('构建的文件存储路径:', filePath);
        
        console.log('GitHub 配置:', {
          owner: env.GITHUB_OWNER,
          repo: env.GITHUB_REPO,
          path: filePath
        });

        try {
          // 首先检查GitHub配置是否存在
          if (!env.GITHUB_TOKEN) {
            console.error('GitHub Token未配置');
            return new Response(JSON.stringify({ 
              error: 'GitHub Token未配置，请联系管理员设置系统配置',
              details: 'Missing GitHub Token'
            }), {
              status: 500,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
              }
            });
          }
          
          if (!env.GITHUB_OWNER || !env.GITHUB_REPO) {
            console.error('GitHub仓库信息未配置完整');
            return new Response(JSON.stringify({ 
              error: 'GitHub仓库配置不完整，请联系管理员设置系统配置',
              details: 'Missing GitHub Repository Information'
            }), {
              status: 500,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
              }
            });
          }

          // 尝试获取已存在的文件信息，用于检查文件是否已存在
          try {
            const existingFile = await octokit.repos.getContent({
              owner: env.GITHUB_OWNER,
              repo: env.GITHUB_REPO,
              path: filePath,
              ref: 'main'
            });
            
            if (existingFile.status === 200) {
              console.error('文件已存在:', filePath);
              return new Response(JSON.stringify({ 
                error: `文件 "${file.name}" 已存在，请重命名后再上传或选择其他文件`,
                details: 'File already exists'
              }), {
                status: 409, // Conflict
                headers: {
                  'Content-Type': 'application/json',
                  ...corsHeaders
                }
              });
            }
          } catch (existingFileError) {
            // 如果文件不存在，会抛出404错误，这是我们希望的情况
            if (existingFileError.status !== 404) {
              // 如果是其他错误，记录下来，但继续尝试上传
              console.warn('检查文件是否存在时出错:', existingFileError);
            }
          }

          const response = await octokit.repos.createOrUpdateFileContents({
            owner: env.GITHUB_OWNER,
            repo: env.GITHUB_REPO,
            path: filePath,
            message: `Upload ${file.name} to ${datePath}`,
            content: base64,
            branch: 'main'
          });

          console.log('GitHub 上传成功:', response.data);

          // 保存到数据库
          console.log('开始保存到数据库');
          
          // 正确格式化为 YYYY-MM-DD HH:MM:SS 格式
          // 不要使用toISOString()，因为它会将时间转回UTC时间
          const beijingYear = beijingNow.getUTCFullYear();
          const beijingMonth = String(beijingNow.getUTCMonth() + 1).padStart(2, '0');
          const beijingDay = String(beijingNow.getUTCDate()).padStart(2, '0');
          const beijingHour = String(beijingNow.getUTCHours()).padStart(2, '0');
          const beijingMinute = String(beijingNow.getUTCMinutes()).padStart(2, '0');
          const beijingSecond = String(beijingNow.getUTCSeconds()).padStart(2, '0');
          const beijingTimeString = `${beijingYear}-${beijingMonth}-${beijingDay} ${beijingHour}:${beijingMinute}:${beijingSecond}`;
          
          console.log('北京时间字符串:', beijingTimeString);
          
          await env.DB.prepare(`
            INSERT INTO images (filename, size, mime_type, github_path, sha, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `).bind(
            file.name,
            file.size,
            file.type,
            filePath,
            response.data.content.sha,
            beijingTimeString,
            beijingTimeString
          ).run();

          console.log('数据库保存成功');

          // 返回各种格式的链接 - 使用包含年月日的完整路径
          const imageUrl = `${env.SITE_URL}/${datePath}/${file.name}`;
          console.log('返回图片链接:', imageUrl);
          
          // 对URL进行编码处理，解决Markdown中特殊字符的问题
          const encodedUrl = imageUrl
            .replace(/\(/g, '%28')
            .replace(/\)/g, '%29')
            .replace(/\[/g, '%5B')
            .replace(/\]/g, '%5D')
            .replace(/</g, '%3C')
            .replace(/>/g, '%3E')
            .replace(/"/g, '%22')
            .replace(/'/g, '%27')
            .replace(/\\/g, '%5C')
            .replace(/#/g, '%23')
            .replace(/\|/g, '%7C')
            .replace(/`/g, '%60')
            .replace(/\s/g, '%20');

          // 触发Cloudflare Pages部署钩子
          const deployResult = await triggerDeployHook(env);
          if (deployResult.success) {
            console.log('部署已成功触发');
          } else {
            console.error('部署失败:', deployResult.error);
          }

          return new Response(JSON.stringify({
            success: true,
            data: {
              url: imageUrl,
              markdown: `![${file.name}](${encodedUrl})`,
              html: `<img src="${imageUrl}" alt="${file.name}">`,
              bbcode: `[img]${imageUrl}[/img]`
            }
          }), {
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        } catch (error) {
          console.error('GitHub API 错误:', error);
          console.error('错误详情:', {
            status: error.status,
            message: error.message,
            response: error.response?.data,
            request: {
              owner: env.GITHUB_OWNER,
              repo: env.GITHUB_REPO,
              path: filePath
            }
          });
          
          // 处理不同类型的GitHub API错误
          if (error.status === 404) {
            return new Response(JSON.stringify({ 
              error: 'GitHub 仓库配置错误，请检查仓库名称和权限设置',
              details: error.message
            }), {
              status: 500,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
              }
            });
          } else if (error.status === 409) {
            return new Response(JSON.stringify({ 
              error: `文件 "${file.name}" 已存在，请重命名后再上传或选择其他文件`,
              details: 'File name conflict'
            }), {
              status: 409,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
              }
            });
          } else if (error.status === 401 || error.status === 403) {
            return new Response(JSON.stringify({ 
              error: 'GitHub 授权失败，请检查Token是否正确或是否有足够的权限',
              details: error.message
            }), {
              status: 500,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
              }
            });
          } else if (error.message && error.message.includes('network')) {
            return new Response(JSON.stringify({ 
              error: '网络连接错误，无法连接到GitHub服务器',
              details: error.message
            }), {
              status: 500,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
              }
            });
          }
          throw error;
        }
      } catch (error) {
        console.error('上传错误:', error);
        console.error('错误详情:', {
          message: error.message,
          stack: error.stack,
          env: {
            hasGithubToken: !!env.GITHUB_TOKEN,
            hasGithubOwner: !!env.GITHUB_OWNER,
            hasGithubRepo: !!env.GITHUB_REPO,
            hasSiteUrl: !!env.SITE_URL,
            hasDB: !!env.DB
          }
        });
        
        // 提供更具体的错误信息
        let errorMessage = '上传失败';
        
        if (!env.GITHUB_TOKEN) {
          errorMessage = 'GitHub Token未配置，请联系管理员';
        } else if (!env.GITHUB_OWNER || !env.GITHUB_REPO) {
          errorMessage = 'GitHub仓库配置不完整，请联系管理员';
        } else if (!env.SITE_URL) {
          errorMessage = '站点URL未配置，请联系管理员';
        } else if (!env.DB) {
          errorMessage = '数据库连接失败，请联系管理员';
        } else if (error.message) {
          // 自定义一些常见错误的更友好描述
          if (error.message.includes('already exists')) {
            errorMessage = `文件 "${file.name}" 已存在，请重命名后重试`;
          } else if (error.message.includes('network')) {
            errorMessage = '网络连接错误，请检查您的网络连接';
          } else if (error.message.includes('permission') || error.message.includes('权限')) {
            errorMessage = 'GitHub权限不足，请联系管理员检查配置';
          } else {
            errorMessage = `上传失败: ${error.message}`;
          }
        }

        return new Response(JSON.stringify({ 
          success: false,
          error: errorMessage,
          message: error.message,
          details: {
            stack: error.stack,
            env: {
              hasGithubToken: !!env.GITHUB_TOKEN,
              hasGithubOwner: !!env.GITHUB_OWNER,
              hasGithubRepo: !!env.GITHUB_REPO,
              hasSiteUrl: !!env.SITE_URL,
              hasDB: !!env.DB
            }
          }
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    }

    // 处理 settings/guest-upload 请求
    if (path.toLowerCase() === 'settings/guest-upload') {
      console.log('Entering /settings/guest-upload handler');
      try {
        if (!env.DB) {
          return new Response(JSON.stringify({ error: 'Database not configured' }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }

        const result = await env.DB.prepare('SELECT value FROM settings WHERE key = ?')
          .bind('allow_guest_upload')
          .first();
        
        console.log('Guest upload setting:', result);
        
        return new Response(JSON.stringify({
          success: true,
          data: {
            allowGuestUpload: result?.value === 'true'
          }
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      } catch (error) {
        console.error('Error fetching guest upload settings:', error);
        return new Response(JSON.stringify({
          success: false,
          error: 'Failed to fetch settings'
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    }
    
    // 处理 admin/recaptcha-config 请求 - 获取验证码配置
    if (path.toLowerCase() === 'admin/recaptcha-config') {
      console.log('获取reCAPTCHA配置');
      
      // 检查是否有完整的reCAPTCHA配置（需要同时配置站点密钥和密钥）
      const recaptchaSiteKey = env.RECAPTCHA_SITE_KEY;
      const recaptchaSecretKey = env.RECAPTCHA_SECRET_KEY;
      const recaptchaEnabled = !!(recaptchaSiteKey && recaptchaSecretKey);
      
      console.log('reCAPTCHA配置状态:', {
        enabled: recaptchaEnabled,
        hasSiteKey: !!recaptchaSiteKey,
        hasSecretKey: !!recaptchaSecretKey
      });
      
      return new Response(JSON.stringify({
        enabled: recaptchaEnabled,
        siteKey: recaptchaEnabled ? recaptchaSiteKey : ''
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    // 处理 stats/summary 请求 - 获取基本统计数据（不包含访问统计）
    if (path.toLowerCase() === 'stats/summary') {
      console.log('处理图片统计数据请求');
      
      try {
        if (!env.DB) {
          return new Response(JSON.stringify({ error: '数据库未连接' }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }
        
        // 获取图片总数
        const totalImagesResult = await env.DB.prepare('SELECT COUNT(*) as count FROM images').first();
        const totalImages = totalImagesResult ? totalImagesResult.count : 0;
        
        // 获取图片总大小
        const totalSizeResult = await env.DB.prepare('SELECT SUM(size) as total_size FROM images').first();
        const totalSize = totalSizeResult && totalSizeResult.total_size ? totalSizeResult.total_size : 0;
        
        // 获取今日上传数量 - 数据库中的时间已经是北京时间格式
        // 获取今天的日期字符串（格式：YYYY-MM-DD）
        const now = new Date();
        // 调整为北京时间
        const beijingNow = new Date(now.getTime() + (8 * 60 * 60 * 1000));
        const year = beijingNow.getUTCFullYear();
        const month = String(beijingNow.getUTCMonth() + 1).padStart(2, '0');
        const day = String(beijingNow.getUTCDate()).padStart(2, '0');
        const todayDateString = `${year}-${month}-${day}`;
        
        console.log('今日日期字符串:', todayDateString);
        
        // 使用LIKE查询来匹配今天的日期
        const todayUploadsResult = await env.DB.prepare(
          "SELECT COUNT(*) as count FROM images WHERE created_at LIKE ?"
        ).bind(`${todayDateString}%`).first();
        
        const todayUploads = todayUploadsResult ? todayUploadsResult.count : 0;
        
        console.log('统计结果:', {
          total_images: totalImages,
          today_uploads: todayUploads,
          total_size: totalSize
        });
        
        return new Response(JSON.stringify({
          total_images: totalImages,
          today_uploads: todayUploads,
          total_size: totalSize
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      } catch (error) {
        console.error('获取统计数据失败:', error);
        return new Response(JSON.stringify({
          error: '获取统计数据失败'
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    }

    // 处理管理员修改密码请求
    if (path.toLowerCase() === 'admin/change-password') {
      console.log('处理管理员修改密码请求');
      
      // 只允许 POST 方法
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
          status: 405,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      try {
        console.log('开始处理修改密码请求');
        const data = await request.json();
        const { currentPassword, newPassword } = data;
        
        if (!currentPassword || !newPassword) {
          console.error('缺少必要参数');
          return new Response(JSON.stringify({ error: '当前密码和新密码不能为空' }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }

        // 获取会话信息，检查用户是否已登录
        let sessionId = null;
        const cookieHeader = request.headers.get('Cookie') || '';
        const cookies = cookieHeader.split(';').map(cookie => cookie.trim());
        
        for (const cookie of cookies) {
          if (cookie.startsWith('session_id=')) {
            sessionId = cookie.substring('session_id='.length);
            break;
          }
        }
        
        console.log('从Cookie获取的sessionId:', sessionId);
        
        if (!sessionId) {
          return new Response(JSON.stringify({ error: '未登录，无法修改密码' }), {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }
        
        // 检查会话是否有效
        const session = await env.DB.prepare(
          'SELECT * FROM sessions WHERE id = ? AND expires_at > CURRENT_TIMESTAMP'
        ).bind(sessionId).first();
        
        if (!session) {
          console.log('会话已过期或无效');
          return new Response(JSON.stringify({ error: '会话已过期，请重新登录' }), {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }
        
        // 获取用户信息
        const userId = session.user_id;
        const user = await env.DB.prepare(
          'SELECT * FROM users WHERE id = ?'
        ).bind(userId).first();
        
        if (!user) {
          console.error('找不到用户:', userId);
          return new Response(JSON.stringify({ error: '用户不存在' }), {
            status: 404,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }
        
        // 验证当前密码是否正确
        let isValid = false;
        try {
            console.log('验证当前密码');
            isValid = await bcrypt.compare(currentPassword, user.password);
        } catch (error) {
            console.error('密码验证出错:', error);
            isValid = false;
        }
        
        if (!isValid) {
            console.log('当前密码验证失败');
            return new Response(JSON.stringify({ error: '当前密码不正确' }), {
                status: 400,
                headers: {
                    'Content-Type': 'application/json',
                    ...corsHeaders
                }
            });
        }
        
        // 对新密码进行哈希处理
        console.log('对新密码进行哈希处理');
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        // 更新密码
        console.log('更新用户密码');
        await env.DB.prepare(
          'UPDATE users SET password = ? WHERE id = ?'
        ).bind(hashedPassword, userId).run();
        
        console.log('密码修改成功');
        return new Response(JSON.stringify({ 
          success: true,
          message: '密码已成功修改'
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      } catch (error) {
        console.error('修改密码错误:', error);
        return new Response(JSON.stringify({ error: '修改密码失败: ' + error.message }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    }

    // 处理 settings 请求 - 获取系统设置
    if (path.toLowerCase() === 'settings') {
      console.log('处理系统设置请求');
      try {
        if (!env.DB) {
          return new Response(JSON.stringify({ error: '数据库未连接' }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }

        if (request.method === 'GET') {
          // 获取所有设置
          const settings = await env.DB.prepare('SELECT key, value FROM settings').all();
          const settingsObj = {};
          
          if (settings && settings.results) {
            settings.results.forEach(setting => {
              settingsObj[setting.key] = setting.value;
            });
          }
          
          console.log('返回设置数据:', settingsObj);
          
          return new Response(JSON.stringify(settingsObj), {
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        } else if (request.method === 'POST') {
          // 更新设置
          const data = await request.json();
          console.log('接收到设置更新请求:', data);
          
          const updates = [];
          
          for (const [key, value] of Object.entries(data)) {
            console.log(`更新设置: ${key} = ${value}`);
            updates.push(
              env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
                .bind(key, String(value))
                .run()
            );
          }
          
          await Promise.all(updates);
          console.log('设置已成功更新');
          
          return new Response(JSON.stringify({ 
            success: true,
            message: '设置已成功保存',
            data: data
          }), {
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        } else {
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }
      } catch (error) {
        console.error('处理系统设置请求失败:', error);
        return new Response(JSON.stringify({ error: '处理设置请求失败' }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    }

    // 处理 images 请求 - 获取图片列表
    if (path.toLowerCase() === 'images') {
      console.log('处理图片列表请求');
      try {
        if (!env.DB) {
          return new Response(JSON.stringify({ error: '数据库未连接' }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }

        if (request.method === 'GET') {
          // 获取查询参数
          const params = new URL(request.url).searchParams;
          const page = parseInt(params.get('page') || '1');
          const limit = parseInt(params.get('limit') || '10');
          const sort = params.get('sort') || 'newest';
          const search = params.get('search') || '';
          
          const offset = (page - 1) * limit;
          
          // 构建排序语句
          let orderBy = '';
          switch (sort) {
            case 'oldest':
              orderBy = 'created_at ASC';
              break;
            case 'most_viewed':
              orderBy = 'views DESC';
              break;
            case 'name_asc':
              orderBy = 'filename ASC';
              break;
            case 'name_desc':
              orderBy = 'filename DESC';
              break;
            default:
              orderBy = 'created_at DESC'; // newest
          }
          
          // 构建查询条件
          let whereClause = '';
          let queryParams = [];
          
          if (search) {
            whereClause = 'WHERE filename LIKE ?';
            queryParams.push(`%${search}%`);
          }
          
          // 查询总记录数
          const countQuery = `
            SELECT COUNT(*) as total 
            FROM images 
            ${whereClause}
          `;
          
          const totalResult = await env.DB.prepare(countQuery).bind(...queryParams).first();
          const total = totalResult ? totalResult.total : 0;
          
          // 查询分页数据
          const query = `
            SELECT id, filename, size, mime_type, github_path, sha, views, created_at 
            FROM images 
            ${whereClause}
            ORDER BY ${orderBy}
            LIMIT ? OFFSET ?
          `;
          
          queryParams.push(limit, offset);
          
          const imagesResult = await env.DB.prepare(query).bind(...queryParams).all();
          const images = imagesResult ? (imagesResult.results || []) : [];
          
          // 处理结果
          const formattedImages = images.map(img => {
            // 从github_path提取图片的相对路径
            const relativePath = img.github_path.replace('public/', '');
            
            return {
              id: img.id,
              name: img.filename,
              url: `${env.SITE_URL}/${relativePath}`,
              size: img.size,
              type: img.mime_type,
              views: img.views || 0,
              upload_time: img.created_at,
              sha: img.sha
            };
          });
          
          // 如果没有图片且启用了调试模式，返回模拟数据
          if (isDebugMode && formattedImages.length === 0) {
            console.log('返回模拟图片列表数据');
            const mockImages = [];
            
            // 生成一些模拟图片数据
            for (let i = 1; i <= 10; i++) {
              const mockDate = new Date();
              mockDate.setDate(mockDate.getDate() - i);
              
              mockImages.push({
                id: i,
                name: `sample-image-${i}.jpg`,
                url: `https://picsum.photos/id/${i + 10}/800/600`,
                size: 12345 * i,
                type: 'image/jpeg',
                views: 100 - i * 5,
                upload_time: mockDate.toISOString()
              });
            }
            
            return new Response(JSON.stringify({
              images: mockImages,
              total: 25,
              page: page,
              limit: limit,
              total_pages: 3
            }), {
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
              }
            });
          }
          
          return new Response(JSON.stringify({
            images: formattedImages,
            total: total,
            page: page,
            limit: limit,
            total_pages: Math.ceil(total / limit)
          }), {
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        } else {
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }
      } catch (error) {
        console.error('处理图片列表请求失败:', error);
        
        // 在出错时，如果启用了调试模式，返回模拟数据
        if (isDebugMode) {
          console.log('出错时返回模拟图片列表数据');
          const mockImages = [];
          
          // 生成一些模拟图片数据
          for (let i = 1; i <= 10; i++) {
            const mockDate = new Date();
            mockDate.setDate(mockDate.getDate() - i);
            
            mockImages.push({
              id: i,
              name: `sample-image-${i}.jpg`,
              url: `https://picsum.photos/id/${i + 10}/800/600`,
              size: 12345 * i,
              type: 'image/jpeg',
              views: 100 - i * 5,
              upload_time: mockDate.toISOString()
            });
          }
          
          return new Response(JSON.stringify({
            images: mockImages,
            total: 25,
            page: 1,
            limit: 10,
            total_pages: 3
          }), {
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }
        
        return new Response(JSON.stringify({ error: '获取图片列表失败' }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    }

    // 处理 images/{id} 请求 - 获取或删除指定图片
    if (path.match(/^images\/\d+$/i)) {
      console.log('处理单个图片请求:', path);
      try {
        if (!env.DB) {
          return new Response(JSON.stringify({ error: '数据库未连接' }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }

        const imageId = path.split('/')[1];
        console.log('图片ID:', imageId);

        if (request.method === 'DELETE') {
          // 获取图片信息，包括repository_id
          const image = await env.DB.prepare('SELECT * FROM images WHERE id = ?').bind(imageId).first();

          if (!image) {
            return new Response(JSON.stringify({ error: '图片不存在' }), {
              status: 404,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
              }
            });
          }

          console.log('要删除的图片信息:', image);
          
          // 获取仓库信息
          let repositoryInfo;
          if (image.repository_id) {
            // 如果图片有repository_id，获取对应仓库信息
            const repository = await env.DB.prepare(`
              SELECT * FROM repositories WHERE id = ?
            `).bind(image.repository_id).first();
            
            if (repository) {
              repositoryInfo = {
                owner: repository.owner || env.GITHUB_OWNER,
                repo: repository.name,
                token: repository.token || env.GITHUB_TOKEN
              };
              console.log(`使用图片对应的仓库: ${repository.name} (ID: ${repository.id})`);
            } else {
              console.log(`图片的仓库ID ${image.repository_id} 不存在，使用默认仓库`);
            }
          }
          
          // 如果没有找到对应仓库，使用默认仓库信息
          if (!repositoryInfo) {
            repositoryInfo = {
              owner: env.GITHUB_OWNER,
              repo: env.GITHUB_REPO,
              token: env.GITHUB_TOKEN
            };
            console.log('使用默认仓库信息');
          }

          // 从GitHub删除图片
          await deleteImageFromGithub(env, image, repositoryInfo);

          // 从数据库中删除图片记录
          await env.DB.prepare('DELETE FROM images WHERE id = ?').bind(imageId).run();

          // 更新仓库大小和文件计数
          if (image.repository_id) {
            await env.DB.prepare(`
              UPDATE repositories 
              SET size_estimate = size_estimate - ?,
                  file_count = file_count - 1,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).bind(image.size, image.repository_id).run();
          }

          return new Response(JSON.stringify({ success: true }), {
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        } else if (request.method === 'GET') {
          // 获取单个图片详情
          const image = await env.DB.prepare('SELECT * FROM images WHERE id = ?').bind(imageId).first();

          if (!image) {
            return new Response(JSON.stringify({ error: '图片不存在' }), {
              status: 404,
              headers: {
                'Content-Type': 'application/json',
                ...corsHeaders
              }
            });
          }

          // 从github_path提取图片的相对路径
          // github_path格式如: public/2023/06/01/example.jpg
          const relativePath = image.github_path.replace('public/', '');

          return new Response(JSON.stringify({
            id: image.id,
            name: image.filename,
            url: `${env.SITE_URL}/${relativePath}`,
            size: image.size,
            type: image.mime_type,
            views: image.views || 0,
            upload_time: image.created_at
          }), {
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        } else {
          return new Response(JSON.stringify({ error: 'Method not allowed' }), {
            status: 405,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }
      } catch (error) {
        console.error('处理单个图片请求失败:', error);
        return new Response(JSON.stringify({ error: '处理图片请求失败' }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
    }

    // 批量删除图片
    if (path.toLowerCase() === 'images/batch-delete' && request.method === 'POST') {
      try {
        console.log('处理批量删除请求，路径:', path);
        
        // 获取用户会话
        const session = await checkSession(request, env);
        if (!session) {
          return jsonResponse({ error: '未授权访问' }, 401);
        }
        
        // 安全解析请求体
        let imageIds;
        let skipDeploy = false;
        try {
          const requestBody = await request.json();
          console.log('解析请求体:', requestBody);
          imageIds = requestBody.imageIds;
          skipDeploy = !!requestBody.skipDeploy;
          console.log('是否跳过部署:', skipDeploy);
        } catch (parseError) {
          console.error('解析请求体失败:', parseError);
          return jsonResponse({ 
            error: '无法解析请求体', 
            details: parseError.message 
          }, 400);
        }
        
        if (!Array.isArray(imageIds) || imageIds.length === 0) {
          return jsonResponse({ error: '未提供有效的图片ID列表' }, 400);
        }
        
        console.log(`批量删除 ${imageIds.length} 张图片:`, imageIds);
        
        // 初始化结果计数
        const results = {
          success: [],
          failed: [],
          repositoryUpdates: {}
        };
        
        // 先获取所有要删除的图片信息
        const images = [];
        const affectedRepositories = new Set();
        
        for (const imageId of imageIds) {
          const image = await env.DB.prepare('SELECT * FROM images WHERE id = ?').bind(imageId).first();
          if (image) {
            images.push(image);
            if (image.repository_id) {
              affectedRepositories.add(image.repository_id);
            }
          }
        }
        
        // 按仓库分组处理图片
        const repoGroups = new Map();
        for (const image of images) {
          if (!image.repository_id) continue;
          
          if (!repoGroups.has(image.repository_id)) {
            repoGroups.set(image.repository_id, []);
          }
          repoGroups.get(image.repository_id).push(image);
        }
        
        // 处理每个仓库的图片
        for (const [repoId, repoImages] of repoGroups) {
          // 获取仓库信息
          const repository = await env.DB.prepare(`
            SELECT * FROM repositories WHERE id = ?
          `).bind(repoId).first();
          
          if (!repository) {
            console.log(`仓库 ID ${repoId} 不存在，跳过处理`);
            continue;
          }
          
          const repositoryInfo = {
            owner: repository.owner || env.GITHUB_OWNER,
            repo: repository.name,
            token: repository.token || env.GITHUB_TOKEN
          };
          
          // 计算该仓库中要删除的图片总大小
          const totalSize = repoImages.reduce((sum, img) => sum + img.size, 0);
          
          // 从GitHub删除图片
          for (const image of repoImages) {
            try {
              await deleteImageFromGithub(env, image, repositoryInfo);
              results.success.push(image.id);
            } catch (error) {
              console.error(`删除图片 ${image.id} 失败:`, error);
              results.failed.push({
                id: image.id,
                error: error.message
              });
            }
          }
          
          // 从数据库中删除图片记录
          await env.DB.prepare(`
            DELETE FROM images 
            WHERE id IN (${repoImages.map(img => '?').join(',')})
          `).bind(...repoImages.map(img => img.id)).run();
          
          // 更新仓库大小和文件计数
          await env.DB.prepare(`
            UPDATE repositories 
            SET size_estimate = size_estimate - ?,
                file_count = file_count - ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(totalSize, repoImages.length, repoId).run();
          
          // 记录仓库更新
          results.repositoryUpdates[repoId] = {
            sizeReduced: totalSize,
            filesRemoved: repoImages.length
          };
        }
        
        // 处理没有仓库ID的图片
        const noRepoImages = images.filter(img => !img.repository_id);
        if (noRepoImages.length > 0) {
          // 从数据库中删除这些图片记录
          await env.DB.prepare(`
            DELETE FROM images 
            WHERE id IN (${noRepoImages.map(img => '?').join(',')})
          `).bind(...noRepoImages.map(img => img.id)).run();
          
          results.success.push(...noRepoImages.map(img => img.id));
        }
        
        // 如果不是跳过部署，触发部署钩子
        if (!skipDeploy) {
          const deployResult = await triggerDeployHook(env);
          if (deployResult.success) {
            console.log('批量删除后部署已成功触发');
          } else {
            console.error('批量删除后部署失败:', deployResult.error);
          }
        }
        
        return jsonResponse({
          success: true,
          results
        });
      } catch (error) {
        console.error('批量删除失败:', error);
        return jsonResponse({ 
          error: '批量删除失败', 
          details: error.message 
        }, 500);
      }
    }

    // 同步仓库文件计数（支持 /repositories/sync-file-count/{repoId} 格式）
    if (path.match(/^repositories\/sync-file-count\/(\d+)$/) && request.method === 'POST') {
      try {
        // 检查用户会话
        const session = await checkSession(request, env);
        if (!session) { return jsonResponse({ error: '未授权访问' }, 401); }

        // 利用正则提取仓库ID（例如，从"repositories/sync-file-count/2"中提取"2"）
        const repoId = parseInt(path.match(/^repositories\/sync-file-count\/(\d+)$/)[1], 10);
        if (isNaN(repoId)) { return jsonResponse({ error: '无效的仓库ID' }, 400); }

        // 调用同步函数，传入解析出的仓库ID
        const result = await syncRepositoryFileCount(env, repoId);
        return jsonResponse(result);
      } catch (error) {
        console.error('同步仓库文件计数失败:', error);
        return jsonResponse({ 
          success: false, 
          error: '同步仓库文件计数失败', 
          details: error.message 
        }, 500);
      }
    }

    // 更新仓库状态
    if (path.match(/^repositories\/status\/(\d+)$/) && request.method === 'PUT') {
      try {
        console.log('处理更新仓库状态请求:', path);
        
        // 检查用户会话
        const session = await checkSession(request, env);
        if (!session) { 
          return jsonResponse({ error: '未授权访问' }, 401); 
        }

        // 提取仓库ID
        const repoId = parseInt(path.match(/^repositories\/status\/(\d+)$/)[1], 10);
        if (isNaN(repoId)) { 
          return jsonResponse({ error: '无效的仓库ID' }, 400); 
        }

        // 解析请求体
        const requestData = await request.json();
        const { status } = requestData;
        
        if (!status) {
          return jsonResponse({ error: '状态值不能为空' }, 400);
        }
        
        if (!['active', 'inactive', 'full'].includes(status)) {
          return jsonResponse({ 
            error: '无效的状态值，必须为 active、inactive 或 full' 
          }, 400);
        }
        
        console.log(`更新仓库状态: 仓库ID=${repoId}, 新状态=${status}`);
        
        // 更新状态
        await env.DB.prepare(`
          UPDATE repositories 
          SET status = ?, updated_at = datetime('now', '+8 hours')
          WHERE id = ?
        `).bind(status, repoId).run();
        
        return jsonResponse({
          success: true,
          message: `仓库状态已更新为 ${status}`
        });
        
      } catch (error) {
        console.error('更新仓库状态失败:', error);
        return jsonResponse({ 
          error: '更新仓库状态失败: ' + error.message 
        }, 500);
      }
    }

    // 创建仓库
    if (path === 'repositories/create' && request.method === 'POST') {
      try {
        console.log('处理创建仓库请求:', path);
        
        // 检查用户会话
        const session = await checkSession(request, env);
        if (!session) { 
          return jsonResponse({ error: '未授权访问' }, 401); 
        }

        // 解析请求体
        const requestData = await request.json();
        const { baseName } = requestData;
        
        if (!baseName || !baseName.trim()) {
          return jsonResponse({ error: '仓库名称不能为空' }, 400);
        }
        
        // 验证仓库名称格式
        const repoNameRegex = /^[a-zA-Z0-9_-]+$/;
        if (!repoNameRegex.test(baseName.trim())) {
          return jsonResponse({ 
            error: '仓库名称只能包含字母、数字、下划线和连字符' 
          }, 400);
        }
        
        console.log(`创建仓库请求: 仓库名称=${baseName}`);
        
        // 检查GitHub相关环境变量
        if (!env.GITHUB_TOKEN) {
          return jsonResponse({ 
            error: '服务器配置错误: 缺少GitHub令牌' 
          }, 500);
        }
        
        if (!env.GITHUB_OWNER) {
          return jsonResponse({ 
            error: '服务器配置错误: 缺少GitHub所有者' 
          }, 500);
        }
        
        // 直接使用用户输入的仓库名称，不添加序号
        const repoName = baseName.trim();
        
        console.log(`尝试创建新仓库: ${repoName}`);
        
        // 创建Octokit实例
        const octokit = new Octokit({
          auth: env.GITHUB_TOKEN
        });
        
        // 检查仓库是否已存在
        let repoExists = false;
        try {
          const existingRepo = await octokit.rest.repos.get({
            owner: env.GITHUB_OWNER,
            repo: repoName
          });
          
          if (existingRepo.status === 200) {
            console.log(`仓库 ${repoName} 已存在，跳过创建`);
            repoExists = true;
          }
        } catch (error) {
          if (error.status !== 404) {
            console.error(`检查仓库是否存在时出错:`, error);
          }
          // 404错误表示仓库不存在，继续创建
        }
        
        // 如果仓库不存在，创建它
        if (!repoExists) {
          try {
            console.log(`尝试创建组织仓库: ${env.GITHUB_OWNER}/${repoName}`);
            
            // 尝试创建组织仓库
            const repoResponse = await octokit.rest.repos.createInOrg({
              org: env.GITHUB_OWNER,
              name: repoName,
              auto_init: true,
              private: true,
              description: `图片存储仓库`
            });
            
            console.log(`成功创建组织仓库: ${env.GITHUB_OWNER}/${repoName}`);
            
            // 在数据库中创建仓库记录
            const dbResult = await env.DB.prepare(`
              INSERT INTO repositories (name, owner, token, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))
            `).bind(
              repoName,
              env.GITHUB_OWNER,
              env.GITHUB_TOKEN,
              'active'
            ).run();
            
            const repoId = dbResult.meta.last_row_id;
            console.log('仓库记录已保存到数据库，ID:', repoId);
            
            return jsonResponse({
              success: true,
              message: '仓库创建成功',
              data: {
                id: repoId,
                name: repoName,
                owner: env.GITHUB_OWNER,
                status: 'active',
                html_url: repoResponse.data.html_url,
                clone_url: repoResponse.data.clone_url
              }
            });
            
          } catch (orgError) {
            console.log(`创建组织仓库失败，尝试创建个人仓库: ${orgError.message}`);
            
            // 如果创建组织仓库失败，尝试创建个人仓库
            const repoResponse = await octokit.rest.repos.createForAuthenticatedUser({
              name: repoName,
              description: `图片存储仓库`,
              private: true,
              auto_init: true
            });
            
            console.log(`成功创建个人仓库: ${repoName}`);
            
            // 在数据库中创建仓库记录
            const dbResult = await env.DB.prepare(`
              INSERT INTO repositories (name, owner, token, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, datetime('now', '+8 hours'), datetime('now', '+8 hours'))
            `).bind(
              repoName,
              env.GITHUB_OWNER,
              env.GITHUB_TOKEN,
              'active'
            ).run();
            
            const repoId = dbResult.meta.last_row_id;
            console.log('仓库记录已保存到数据库，ID:', repoId);
            
            return jsonResponse({
              success: true,
              message: '仓库创建成功',
              data: {
                id: repoId,
                name: repoName,
                owner: env.GITHUB_OWNER,
                status: 'active',
                html_url: repoResponse.data.html_url,
                clone_url: repoResponse.data.clone_url
              }
            });
          }
        } else {
          // 仓库已存在，返回错误
          return jsonResponse({ 
            error: `仓库 ${repoName} 已存在` 
          }, 409);
        }
        
      } catch (error) {
        console.error('处理创建仓库请求失败:', error);
        return jsonResponse({ 
          error: '处理创建仓库请求失败: ' + error.message 
        }, 500);
      }
    }

    // 获取文件夹列表
    if (path === 'folders' && request.method === 'GET') {
      try {
        console.log('处理获取文件夹列表请求');
        
        // 检查用户会话
        const session = await checkSession(request, env);
        if (!session) { 
          return jsonResponse({ error: '未授权访问' }, 401); 
        }

        // 获取所有文件夹及其统计信息
        const folders = await env.DB.prepare(`
          SELECT 
            f.id,
            f.name,
            f.path,
            f.created_at,
            COALESCE(SUM(i.size), 0) as total_size,
            COUNT(i.id) as file_count
          FROM folders f
          LEFT JOIN images i ON i.github_path LIKE f.path || '/%'
          GROUP BY f.id, f.name, f.path, f.created_at
          ORDER BY f.created_at DESC
        `).all();
        
        console.log(`找到 ${folders.results.length} 个文件夹`);
        
        return jsonResponse({
          success: true,
          data: folders.results
        });
        
      } catch (error) {
        console.error('获取文件夹列表失败:', error);
        return jsonResponse({ 
          error: '获取文件夹列表失败: ' + error.message 
        }, 500);
      }
    }

    // 获取文件夹内的文件列表
    if (path.match(/^folders\/(\d+)\/files$/) && request.method === 'GET') {
      try {
        console.log('处理获取文件夹文件列表请求');
        
        // 检查用户会话
        const session = await checkSession(request, env);
        if (!session) { 
          return jsonResponse({ error: '未授权访问' }, 401); 
        }

        // 提取文件夹ID
        const folderId = parseInt(path.match(/^folders\/(\d+)\/files$/)[1], 10);
        if (isNaN(folderId)) { 
          return jsonResponse({ error: '无效的文件夹ID' }, 400); 
        }

        // 获取文件夹信息
        const folder = await env.DB.prepare(`
          SELECT * FROM folders WHERE id = ?
        `).bind(folderId).first();
        
        if (!folder) {
          return jsonResponse({ error: '文件夹不存在' }, 404);
        }

        // 获取该文件夹下的所有文件（从所有仓库中查找）
        const files = await env.DB.prepare(`
          SELECT 
            i.id,
            i.filename,
            i.github_path,
            i.size,
            i.created_at,
            i.updated_at,
            r.name as repository_name,
            r.owner as repository_owner
          FROM images i
          JOIN repositories r ON i.repository_id = r.id
          WHERE i.github_path LIKE ?
          ORDER BY i.created_at DESC
        `).bind(`${folder.path}/%`).all();
        
        console.log(`找到 ${files.results.length} 个文件`);
        
        return jsonResponse({
          success: true,
          data: {
            folder: folder,
            files: files.results
          }
        });
        
      } catch (error) {
        console.error('获取文件夹文件列表失败:', error);
        return jsonResponse({ 
          error: '获取文件夹文件列表失败: ' + error.message 
        }, 500);
      }
    }

    // 重命名文件夹（在所有仓库中同步）
    if (path.match(/^folders\/(\d+)\/rename$/) && request.method === 'PUT') {
      try {
        console.log('处理重命名文件夹请求');
        
        // 检查用户会话
        const session = await checkSession(request, env);
        if (!session) { 
          return jsonResponse({ error: '未授权访问' }, 401); 
        }

        // 提取文件夹ID
        const folderId = parseInt(path.match(/^folders\/(\d+)\/rename$/)[1], 10);
        if (isNaN(folderId)) { 
          return jsonResponse({ error: '无效的文件夹ID' }, 400); 
        }

        // 解析请求体
        const requestData = await request.json();
        const { newName } = requestData;
        
        if (!newName || !newName.trim()) {
          return jsonResponse({ error: '新文件夹名称不能为空' }, 400);
        }
        
        // 验证文件夹名称格式
        const invalidChars = /[<>:"/\\|?*\x00-\x1F]/g;
        if (invalidChars.test(newName.trim())) {
          return jsonResponse({ 
            error: '文件夹名称包含非法字符（不能包含 < > : " / \\ | ? * 和控制字符）' 
          }, 400);
        }
        
        // 检查文件夹名称长度
        if (newName.trim().length > 100) {
          return jsonResponse({ 
            error: '文件夹名称过长（最大100个字符）' 
          }, 400);
        }

        // 获取文件夹信息
        const folder = await env.DB.prepare(`
          SELECT * FROM folders WHERE id = ?
        `).bind(folderId).first();
        
        if (!folder) {
          return jsonResponse({ error: '文件夹不存在' }, 404);
        }

        const oldName = folder.name;
        const newNameTrimmed = newName.trim();
        
        if (oldName === newNameTrimmed) {
          return jsonResponse({ error: '新名称与当前名称相同' }, 400);
        }

        console.log(`重命名文件夹: ${oldName} -> ${newNameTrimmed}`);

        // 获取所有仓库
        const repositories = await env.DB.prepare(`
          SELECT * FROM repositories WHERE status != 'deleted'
        `).all();

        const octokit = new Octokit({
          auth: env.GITHUB_TOKEN
        });

        let successCount = 0;
        let errorCount = 0;
        const errors = [];

        // 遍历所有仓库，重命名文件夹
        for (const repo of repositories.results) {
          try {
            const oldPath = `public/${oldName}`;
            const newPath = `public/${newNameTrimmed}`;
            
            // 检查旧文件夹是否存在
            try {
              await octokit.rest.repos.getContent({
                owner: repo.owner,
                repo: repo.name,
                path: oldPath
              });
            } catch (error) {
              if (error.status === 404) {
                console.log(`仓库 ${repo.name} 中不存在文件夹 ${oldName}，跳过`);
                continue;
              }
              throw error;
            }

            // 获取旧文件夹中的所有文件
            const contents = await octokit.rest.repos.getContent({
              owner: repo.owner,
              repo: repo.name,
              path: oldPath
            });

            if (Array.isArray(contents.data)) {
              // 文件夹中有文件，需要逐个移动
              for (const item of contents.data) {
                if (item.type === 'file') {
                  // 获取文件内容
                  const fileContent = await octokit.rest.repos.getContent({
                    owner: repo.owner,
                    repo: repo.name,
                    path: item.path
                  });

                  // 在新位置创建文件
                  await octokit.rest.repos.createOrUpdateFileContents({
                    owner: repo.owner,
                    repo: repo.name,
                    path: item.path.replace(oldPath, newPath),
                    message: `移动文件: ${item.name} (重命名文件夹 ${oldName} -> ${newNameTrimmed})`,
                    content: fileContent.data.content,
                    sha: fileContent.data.sha,
                    branch: 'main'
                  });

                  // 删除旧文件
                  await octokit.rest.repos.deleteFile({
                    owner: repo.owner,
                    repo: repo.name,
                    path: item.path,
                    message: `删除旧文件: ${item.name} (重命名文件夹 ${oldName} -> ${newNameTrimmed})`,
                    sha: fileContent.data.sha,
                    branch: 'main'
                  });
                }
              }
            }

            // 删除旧文件夹（通过删除 .gitkeep 文件）
            try {
              const gitkeepContent = await octokit.rest.repos.getContent({
                owner: repo.owner,
                repo: repo.name,
                path: `${oldPath}/.gitkeep`
              });
              
              await octokit.rest.repos.deleteFile({
                owner: repo.owner,
                repo: repo.name,
                path: `${oldPath}/.gitkeep`,
                message: `删除旧文件夹: ${oldName} (重命名为 ${newNameTrimmed})`,
                sha: gitkeepContent.data.sha,
                branch: 'main'
              });
            } catch (error) {
              // .gitkeep 文件可能不存在，忽略错误
              console.log(`仓库 ${repo.name} 中 ${oldPath}/.gitkeep 不存在，跳过删除`);
            }

            // 创建新文件夹（通过创建 .gitkeep 文件）
            await octokit.rest.repos.createOrUpdateFileContents({
              owner: repo.owner,
              repo: repo.name,
              path: `${newPath}/.gitkeep`,
              message: `创建新文件夹: ${newNameTrimmed} (从 ${oldName} 重命名)`,
              content: btoa(''),
              branch: 'main'
            });

            successCount++;
            console.log(`成功重命名仓库 ${repo.name} 中的文件夹`);
            
          } catch (error) {
            errorCount++;
            const errorMsg = `仓库 ${repo.name} 重命名失败: ${error.message}`;
            errors.push(errorMsg);
            console.error(errorMsg);
          }
        }

        // 更新数据库中的文件夹信息
        await env.DB.prepare(`
          UPDATE folders 
          SET name = ?, path = ?, updated_at = datetime('now', '+8 hours')
          WHERE id = ?
        `).bind(newNameTrimmed, `public/${newNameTrimmed}`, folderId).run();

        // 更新所有相关文件的路径
        await env.DB.prepare(`
          UPDATE images 
          SET github_path = REPLACE(github_path, ?, ?)
          WHERE github_path LIKE ?
        `).bind(`public/${oldName}/`, `public/${newNameTrimmed}/`, `public/${oldName}/%`).run();

        return jsonResponse({
          success: true,
          message: `文件夹重命名完成。成功: ${successCount} 个仓库，失败: ${errorCount} 个仓库`,
          data: {
            successCount,
            errorCount,
            errors: errors.length > 0 ? errors : undefined
          }
        });
        
      } catch (error) {
        console.error('重命名文件夹失败:', error);
        return jsonResponse({ 
          error: '重命名文件夹失败: ' + error.message 
        }, 500);
      }
    }

    // 删除文件夹（在所有仓库中同步）
    if (path.match(/^folders\/(\d+)\/delete$/) && request.method === 'DELETE') {
      try {
        console.log('处理删除文件夹请求');
        
        // 检查用户会话
        const session = await checkSession(request, env);
        if (!session) { 
          return jsonResponse({ error: '未授权访问' }, 401); 
        }

        // 提取文件夹ID
        const folderId = parseInt(path.match(/^folders\/(\d+)\/delete$/)[1], 10);
        if (isNaN(folderId)) { 
          return jsonResponse({ error: '无效的文件夹ID' }, 400); 
        }

        // 获取文件夹信息
        const folder = await env.DB.prepare(`
          SELECT * FROM folders WHERE id = ?
        `).bind(folderId).first();
        
        if (!folder) {
          return jsonResponse({ error: '文件夹不存在' }, 404);
        }

        console.log(`删除文件夹: ${folder.name}`);

        // 获取所有仓库
        const repositories = await env.DB.prepare(`
          SELECT * FROM repositories WHERE status != 'deleted'
        `).all();

        const octokit = new Octokit({
          auth: env.GITHUB_TOKEN
        });

        let successCount = 0;
        let errorCount = 0;
        const errors = [];

        // 遍历所有仓库，删除文件夹
        for (const repo of repositories.results) {
          try {
            const folderPath = `public/${folder.name}`;
            
            // 检查文件夹是否存在
            try {
              await octokit.rest.repos.getContent({
                owner: repo.owner,
                repo: repo.name,
                path: folderPath
              });
            } catch (error) {
              if (error.status === 404) {
                console.log(`仓库 ${repo.name} 中不存在文件夹 ${folder.name}，跳过`);
                continue;
              }
              throw error;
            }

            // 获取文件夹中的所有文件
            const contents = await octokit.rest.repos.getContent({
              owner: repo.owner,
              repo: repo.name,
              path: folderPath
            });

            if (Array.isArray(contents.data)) {
              // 文件夹中有文件，需要逐个删除
              for (const item of contents.data) {
                if (item.type === 'file') {
                  await octokit.rest.repos.deleteFile({
                    owner: repo.owner,
                    repo: repo.name,
                    path: item.path,
                    message: `删除文件: ${item.name} (删除文件夹 ${folder.name})`,
                    sha: item.sha,
                    branch: 'main'
                  });
                }
              }
            }

            successCount++;
            console.log(`成功删除仓库 ${repo.name} 中的文件夹`);
            
          } catch (error) {
            errorCount++;
            const errorMsg = `仓库 ${repo.name} 删除失败: ${error.message}`;
            errors.push(errorMsg);
            console.error(errorMsg);
          }
        }

        // 删除数据库中的文件夹记录
        await env.DB.prepare(`
          DELETE FROM folders WHERE id = ?
        `).bind(folderId).run();

        // 删除数据库中该文件夹下的所有文件记录
        await env.DB.prepare(`
          DELETE FROM images WHERE github_path LIKE ?
        `).bind(`${folder.path}/%`).run();

        return jsonResponse({
          success: true,
          message: `文件夹删除完成。成功: ${successCount} 个仓库，失败: ${errorCount} 个仓库`,
          data: {
            successCount,
            errorCount,
            errors: errors.length > 0 ? errors : undefined
          }
        });
        
      } catch (error) {
        console.error('删除文件夹失败:', error);
        return jsonResponse({ 
          error: '删除文件夹失败: ' + error.message 
        }, 500);
      }
    }

    
    // 处理 repositories/create-folder 路径
    if (path.match(/^repositories\/create-folder\/(\d+)$/) && request.method === 'POST') {
      console.log('=== 在[[path]].js中处理create-folder请求 ===');
      
      try {
        // 检查用户会话
        const session = await checkSession(request, env);
        if (!session) { 
          return jsonResponse({ error: '未授权访问' }, 401); 
        }

        // 提取仓库ID
        const repoId = parseInt(path.match(/^repositories\/create-folder\/(\d+)$/)[1], 10);
        if (isNaN(repoId)) { 
          return jsonResponse({ error: '无效的仓库ID' }, 400); 
        }

        // 解析请求体
        const requestData = await request.json();
        const { folderName } = requestData;
        
        if (!folderName || !folderName.trim()) {
          return jsonResponse({ error: '文件夹名称不能为空' }, 400);
        }
        
        console.log(`创建文件夹请求: 仓库ID=${repoId}, 文件夹名=${folderName}`);
        
        // 获取仓库信息
        const repo = await env.DB.prepare(`
          SELECT * FROM repositories WHERE id = ?
        `).bind(repoId).first();
        
        if (!repo) {
          return jsonResponse({ error: '仓库不存在' }, 404);
        }
        
        // 创建Octokit实例
        const octokit = new Octokit({
          auth: repo.token || env.GITHUB_TOKEN
        });
        
        console.log('Octokit实例创建成功:', {
          hasOctokit: !!octokit,
          hasRepos: !!octokit.repos,
          hasRest: !!octokit.rest,
          reposKeys: octokit.repos ? Object.keys(octokit.repos) : 'undefined',
          restKeys: octokit.rest ? Object.keys(octokit.rest) : 'undefined',
          hasGetContent: octokit.repos ? !!octokit.repos.getContent : 'undefined'
        });
        
        // 创建文件夹路径
        const folderPath = `public/${folderName.trim()}`;
        
        // 检查文件夹是否已存在
        try {
          await octokit.rest.repos.getContent({
            owner: repo.owner,
            repo: repo.name,
            path: folderPath
          });
          
          return jsonResponse({ error: '文件夹已存在' }, 409);
        } catch (error) {
          if (error.status !== 404) {
            console.error('检查文件夹是否存在时出错:', error);
            return jsonResponse({ error: '检查文件夹状态失败' }, 500);
          }
          // 404表示文件夹不存在，继续创建
        }
        
        // 创建文件夹（通过创建一个占位文件）
        const placeholderContent = `# ${folderName}\n\n此文件夹用于存储图片文件。`;

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
            path: `${folderPath}/README.md`,
          });
          sha = fileInfo.data.sha;
          console.log('README.md已存在，sha:', sha);
        } catch (e) {
          if (e.status !== 404) {
            console.error('getContent查sha出错:', e);
            return jsonResponse({
              error: '查sha失败: ' + e.message
            }, 500);
          } else {
            console.log('README.md不存在，将新建');
          }
        }

        const params = {
          owner: repo.owner,
          repo: repo.name,
          path: `${folderPath}/README.md`,
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
          return jsonResponse({
            error: '创建文件夹失败: ' + createError.message
          }, 500);
        }
        
        // 保存文件夹信息到数据库
        let dbSuccess = false;
        try {
          console.log(`准备插入数据库: repoId=${repoId}, folderName=${folderName.trim()}, folderPath=${folderPath}`);
          
          // 检查仓库是否存在
          const repoCheck = await env.DB.prepare(`
            SELECT id, name FROM repositories WHERE id = ?
          `).bind(repoId).first();
          
          console.log(`仓库检查结果:`, repoCheck);
          
          if (!repoCheck) {
            console.error(`仓库ID ${repoId} 不存在`);
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
        return jsonResponse({
          success: true,
          message: '文件夹创建成功',
          folderPath: folderPath,
          dbSuccess: dbSuccess
        });
        
      } catch (error) {
        console.error('处理创建文件夹请求失败:', error);
        return jsonResponse({ 
          error: '处理创建文件夹请求失败: ' + error.message 
        }, 500);
      }
    }

    // 如果没有匹配的路由，返回 404
    console.log('未找到匹配的路由:', path);
    return new Response(JSON.stringify({
      error: 'Not Found',
      message: `API endpoint ${path} not found`
    }), {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  } catch (error) {
    console.error('API request error:', error);
    return new Response(JSON.stringify({
      error: 'Internal Server Error',
      message: error.message
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
} 

