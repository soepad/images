import { Octokit } from 'octokit';
import { v4 as uuidv4 } from 'uuid';
import { updateReposVariable } from './cf-manager';

/**
 * 获取当前活跃仓库
 * @param {Object} env - 环境变量
 * @returns {Promise<Object>} - 返回活跃仓库信息
 */
export async function getActiveRepository(env) {
  try {
    // 查询数据库中的活跃仓库
    const repo = await env.DB.prepare(`
      SELECT * FROM repositories 
      WHERE status = 'active' 
      ORDER BY priority ASC, id ASC 
      LIMIT 1
    `).first();
    
    // 如果没有找到活跃仓库
    if (!repo) {
      console.log('没有找到活跃仓库，尝试创建默认仓库');
      
      // 检查是否有环境变量定义的仓库信息
      if (env.GITHUB_REPO && env.GITHUB_OWNER) {
        // 创建默认仓库记录
        await env.DB.prepare(`
          INSERT INTO repositories (name, owner, status, is_default, priority)
          VALUES (?, ?, 'active', 1, 0)
        `).bind(env.GITHUB_REPO, env.GITHUB_OWNER).run();
        
        // 更新设置
        await env.DB.prepare(`
          INSERT OR REPLACE INTO settings (key, value, updated_at)
          VALUES ('initial_repository_name', ?, CURRENT_TIMESTAMP)
        `).bind(env.GITHUB_REPO).run();
        
        await env.DB.prepare(`
          INSERT OR REPLACE INTO settings (key, value, updated_at)
          VALUES ('initial_repository_owner', ?, CURRENT_TIMESTAMP)
        `).bind(env.GITHUB_OWNER).run();
        
        // 重新查询
        const newRepo = await env.DB.prepare(`
          SELECT * FROM repositories 
          WHERE name = ? AND owner = ?
        `).bind(env.GITHUB_REPO, env.GITHUB_OWNER).first();
        
        if (newRepo) {
          return {
            id: newRepo.id,
            owner: newRepo.owner,
            repo: newRepo.name,
            token: newRepo.token || env.GITHUB_TOKEN,
            deployHook: newRepo.deploy_hook || env.DEPLOY_HOOK
          };
        }
      }
      
      throw new Error('没有可用的活跃仓库，且无法创建默认仓库');
    }
    
    // 返回仓库信息
    return {
      id: repo.id,
      owner: repo.owner || env.GITHUB_OWNER,
      repo: repo.name,
      token: repo.token || env.GITHUB_TOKEN,
      deployHook: repo.deploy_hook || env.DEPLOY_HOOK
    };
  } catch (error) {
    console.error('获取活跃仓库失败:', error);
    
    // 回退到环境变量
    if (env.GITHUB_REPO && env.GITHUB_OWNER) {
      return {
        id: null,
        owner: env.GITHUB_OWNER,
        repo: env.GITHUB_REPO,
        token: env.GITHUB_TOKEN,
        deployHook: env.DEPLOY_HOOK
      };
    }
    
    throw error;
  }
}

/**
 * 创建新的GitHub仓库
 * @param {Object} env - 环境变量
 * @param {string} currentRepoName - 当前仓库名称
 * @returns {Promise<Object>} - 返回新仓库信息
 */
export async function createNewRepository(env, currentRepoName) {
  try {
    console.log('开始创建新仓库，参数:', { currentRepoName, githubToken: env.GITHUB_TOKEN ? '已设置' : '未设置', githubOwner: env.GITHUB_OWNER });
    
    // 检查必要的环境变量
    if (!env.GITHUB_TOKEN) {
      throw new Error('缺少GitHub令牌(GITHUB_TOKEN)环境变量');
    }
    
    if (!env.GITHUB_OWNER) {
      throw new Error('缺少GitHub所有者(GITHUB_OWNER)环境变量');
    }
    
    const octokit = new Octokit({
      auth: env.GITHUB_TOKEN
    });
    
    // 获取命名规则设置
    let nameTemplateSetting;
    try {
      nameTemplateSetting = await env.DB.prepare(`
        SELECT value FROM settings WHERE key = 'repository_name_template'
      `).first();
      console.log('获取仓库命名规则设置:', nameTemplateSetting);
    } catch (dbError) {
      console.error('获取仓库命名规则设置失败:', dbError);
      // 继续使用默认值
    }
    
    // 决定基础仓库名称
    let baseRepoName;
    if (nameTemplateSetting && nameTemplateSetting.value && nameTemplateSetting.value.trim() !== '') {
      // 使用设置中的命名规则
      baseRepoName = nameTemplateSetting.value.trim();
      console.log(`使用设置的命名规则: ${baseRepoName}`);
    } else {
      // 使用当前仓库名称作为基础，如果没有提供则使用默认值
      baseRepoName = currentRepoName ? currentRepoName.replace(/-\d+$/, '') : 'images-repo';
      console.log(`使用默认命名规则，基于当前仓库: ${baseRepoName}`);
    }
    
    // 获取已存在的同名仓库
    let maxNumber = 0;
    try {
      // 查询数据库中已存在的同名仓库
      const existingRepos = await env.DB.prepare(`
        SELECT name FROM repositories WHERE name LIKE ?
      `).bind(`${baseRepoName}-%`).all();
      
      // 找出最大序号
      for (const repo of existingRepos.results || []) {
        const match = repo.name.match(/-(\d+)$/);
        if (match) {
          const num = parseInt(match[1]);
          if (num > maxNumber) {
            maxNumber = num;
          }
        }
      }
    } catch (error) {
      console.warn('查询已存在仓库失败，使用默认序号:', error);
    }
    
    // 生成新序号，使用三位数字格式(001, 002, ...)
    const newRepoNumber = maxNumber + 1;
    const paddedNumber = String(newRepoNumber).padStart(3, '0');
    const newRepoName = `${baseRepoName}-${paddedNumber}`;
    
    console.log(`尝试创建新仓库: ${newRepoName} (序号: ${paddedNumber})`);
    
    // 检查仓库是否已存在
    let repoExists = false;
    try {
      const existingRepo = await octokit.repos.get({
        owner: env.GITHUB_OWNER,
        repo: newRepoName
      });
      
      if (existingRepo.status === 200) {
        console.log(`仓库 ${newRepoName} 已存在，跳过创建`);
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
        console.log(`尝试创建组织仓库: ${env.GITHUB_OWNER}/${newRepoName}`);
        
        // 尝试创建组织仓库
        await octokit.repos.createInOrg({
          org: env.GITHUB_OWNER,
          name: newRepoName,
          auto_init: true,
          private: true,
          description: `图片存储仓库 #${newRepoNumber}`
        });
        
        console.log(`成功创建组织仓库: ${env.GITHUB_OWNER}/${newRepoName}`);
      } catch (orgError) {
        // 如果创建组织仓库失败，尝试创建个人仓库
        console.log(`创建组织仓库失败，尝试创建个人仓库: ${env.GITHUB_OWNER}/${newRepoName}`, orgError.message);
        
        await octokit.repos.createForAuthenticatedUser({
          name: newRepoName,
          auto_init: true,
          private: true,
          description: `图片存储仓库 #${newRepoNumber}`
        });
        
        console.log(`成功创建个人仓库: ${env.GITHUB_OWNER}/${newRepoName}`);
      }
      
      // 等待几秒钟，确保仓库初始化完成
      console.log('等待仓库初始化完成...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // 创建必要的目录结构
    try {
      console.log(`为仓库 ${newRepoName} 创建必要的目录结构`);
      
      // 检查public目录是否存在
      try {
        await octokit.repos.getContent({
          owner: env.GITHUB_OWNER,
          repo: newRepoName,
          path: 'public'
        });
        console.log('public目录已存在');
      } catch (error) {
        if (error.status === 404) {
          // 创建public目录
          console.log('创建public目录');
          await octokit.repos.createOrUpdateFileContents({
            owner: env.GITHUB_OWNER,
            repo: newRepoName,
            path: 'public/.gitkeep',
            message: '创建public目录',
            content: btoa(''),
            branch: 'main'
          });
        } else {
          console.error('检查public目录时出错:', error);
        }
      }
      
      // 检查public/images目录是否存在
      try {
        await octokit.repos.getContent({
          owner: env.GITHUB_OWNER,
          repo: newRepoName,
          path: 'public/images'
        });
        console.log('public/images目录已存在');
      } catch (error) {
        if (error.status === 404) {
          // 创建public/images目录
          console.log('创建public/images目录');
          await octokit.repos.createOrUpdateFileContents({
            owner: env.GITHUB_OWNER,
            repo: newRepoName,
            path: 'public/images/.gitkeep',
            message: '创建images目录',
            content: btoa(''),
            branch: 'main'
          });
        } else {
          console.error('检查public/images目录时出错:', error);
        }
      }
      
      console.log(`仓库 ${newRepoName} 的目录结构创建完成`);
    } catch (dirError) {
      console.error('创建目录结构失败:', dirError);
      // 继续执行，不因为创建目录失败而中断
    }
    
    // 获取Cloudflare Pages部署钩子
    let deployHook = env.DEPLOY_HOOK;
    
    // 如果有其他仓库，尝试从中获取部署钩子
    if (!deployHook) {
      try {
        const existingRepo = await env.DB.prepare(`
          SELECT deploy_hook FROM repositories 
          WHERE deploy_hook IS NOT NULL AND deploy_hook != '' 
          LIMIT 1
        `).first();
        
        if (existingRepo && existingRepo.deploy_hook) {
          deployHook = existingRepo.deploy_hook;
          console.log(`从现有仓库获取部署钩子`);
        }
      } catch (error) {
        console.error('获取现有仓库部署钩子失败:', error);
      }
    }
    
    // 在数据库中创建仓库记录
    try {
      const result = await env.DB.prepare(`
        INSERT INTO repositories (
          name, owner, token, deploy_hook, status, is_default, size_estimate, priority, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'active', 0, 0, 0, datetime('now', '+8 hours'), datetime('now', '+8 hours'))
      `).bind(
        newRepoName, 
        env.GITHUB_OWNER, 
        env.GITHUB_TOKEN,
        deployHook
      ).run();
      
      console.log(`仓库 ${newRepoName} 记录已添加到数据库，ID: ${result.meta?.last_row_id || '未知'}`);
      
      // 将其他仓库标记为非活跃
      await env.DB.prepare(`
        UPDATE repositories 
        SET status = 'inactive', updated_at = datetime('now', '+8 hours')
        WHERE name != ?
      `).bind(newRepoName).run();
      
      console.log(`其他仓库已标记为非活跃`);

      // 更新 REPOS 环境变量
      if (env.CF_API_TOKEN && env.CF_ACCOUNT_ID && env.CF_PROJECT_NAME) {
        try {
          console.log(`尝试更新 REPOS 环境变量，添加 ${newRepoName}`);
          const updateResult = await updateReposVariable(env, newRepoName);
          if (updateResult.success) {
            console.log(`REPOS 环境变量更新成功: ${updateResult.message}`);
          } else {
            console.error(`REPOS 环境变量更新失败: ${updateResult.error}`);
          }
        } catch (cfError) {
          console.error('更新 REPOS 环境变量时出错:', cfError);
          // 继续执行，不因为更新环境变量失败而中断
        }
      } else {
        console.log('缺少 Cloudflare API 配置，跳过更新 REPOS 环境变量');
      }
      
      // 返回新仓库信息
      return {
        id: result.meta?.last_row_id,
        owner: env.GITHUB_OWNER,
        repo: newRepoName,
        token: env.GITHUB_TOKEN,
        deployHook: deployHook
      };
    } catch (dbError) {
      console.error('添加仓库记录到数据库失败:', dbError);
      
      // 即使数据库操作失败，也返回仓库信息
      return {
        id: null,
        owner: env.GITHUB_OWNER,
        repo: newRepoName,
        token: env.GITHUB_TOKEN,
        deployHook: deployHook
      };
    }
  } catch (error) {
    console.error('创建新仓库失败:', error);
    throw error;
  }
}

/**
 * 检查仓库空间并处理分配
 * @param {Object} env - 环境变量
 * @param {number} totalUploadSize - 上传文件总大小
 * @returns {Promise<Object>} - 返回分配结果
 */
export async function checkRepositorySpaceAndAllocate(env, totalUploadSize) {
  try {
    // 获取仓库大小阈值设置
    const thresholdSetting = await env.DB.prepare(`
      SELECT value FROM settings WHERE key = 'repository_size_threshold'
    `).first();
    
    const repoSizeThreshold = thresholdSetting ? 
      parseInt(thresholdSetting.value) : 
      900 * 1024 * 1024; // 默认900MB
    
    // 获取当前活跃仓库
    const activeRepo = await env.DB.prepare(`
      SELECT * FROM repositories 
      WHERE status = 'active' 
      ORDER BY priority ASC, id ASC 
      LIMIT 1
    `).first();
    
    if (!activeRepo) {
      console.log('没有可用的活跃仓库，尝试创建新仓库');
      
      // 尝试获取默认仓库名称
      const nameTemplateSetting = await env.DB.prepare(`
        SELECT value FROM settings WHERE key = 'repository_name_template'
      `).first();
      
      let baseName = nameTemplateSetting?.value || 'images-repo';
      
      try {
        // 创建新仓库
        const newRepo = await createNewRepository(env, baseName);
        
        return {
          canUpload: true,
          repository: newRepo,
          needNewRepo: true
        };
      } catch (createError) {
        console.error('自动创建仓库失败:', createError);
        throw new Error('没有可用的活跃仓库，且自动创建失败: ' + createError.message);
      }
    }
    
    // 计算上传后的总大小
    const totalSize = activeRepo.size_estimate + totalUploadSize;
    
    // 如果当前仓库大小已经超过阈值，创建新仓库
    if (activeRepo.size_estimate > repoSizeThreshold) {
      console.log(`当前仓库已超过阈值，创建新仓库: 当前=${activeRepo.size_estimate}, 阈值=${repoSizeThreshold}`);
      const newRepo = await createNewRepository(env, activeRepo.name);
      
      return {
        canUpload: true,
        repository: newRepo,
        needNewRepo: true
      };
    }
    
    // 当前仓库未超过阈值，继续使用
    console.log(`使用当前仓库: ${activeRepo.name}, 当前=${activeRepo.size_estimate}, 上传=${totalUploadSize}, 阈值=${repoSizeThreshold}`);
    return {
      canUpload: true,
      repository: {
        id: activeRepo.id,
        owner: activeRepo.owner || env.GITHUB_OWNER,
        repo: activeRepo.name,
        token: activeRepo.token || env.GITHUB_TOKEN,
        deployHook: activeRepo.deploy_hook || env.DEPLOY_HOOK
      },
      needNewRepo: false
    };
  } catch (error) {
    console.error('检查仓库空间失败:', error);
    return {
      canUpload: false,
      error: error.message
    };
  }
}

/**
 * 更新仓库大小 - 直接从数据库计算实际值
 * @param {Object} env - 环境变量
 * @param {number} repositoryId - 仓库ID
 * @param {number} fileSize - 新上传的文件大小（用于日志）
 * @returns {Promise<Object>} - 返回更新结果
 */
export async function updateRepositorySizeEstimate(env, repositoryId, fileSize) {
  try {
    // 直接从数据库查询实际的文件数量和总大小
    const statsResult = await env.DB.prepare(`
      SELECT 
        COUNT(DISTINCT id) as file_count,
        COALESCE(SUM(size), 0) as total_size
      FROM images 
      WHERE repository_id = ?
    `).bind(repositoryId).first();
    
    if (!statsResult) {
      console.error(`无法获取仓库 ID: ${repositoryId} 的统计信息`);
      throw new Error('无法获取仓库统计信息');
    }
    
    const actualFileCount = statsResult.file_count || 0;
    const actualSize = statsResult.total_size || 0;
    
    // 更新仓库的实际文件数量和大小
    await env.DB.prepare(`
      UPDATE repositories 
      SET size_estimate = ?, 
          updated_at = datetime('now', '+8 hours')
      WHERE id = ?
    `).bind(actualSize, repositoryId).run();
    
    // 获取更新后的仓库信息
    const repo = await env.DB.prepare(`
      SELECT * FROM repositories WHERE id = ?
    `).bind(repositoryId).first();
    
    console.log(`仓库 ${repo.name} 统计信息已更新: ${actualFileCount} 个文件, ${actualSize} 字节 (新增文件: ${fileSize} 字节)`);
    
    return {
      updated: true,
      repositoryId,
      currentSize: actualSize,
      fileCount: actualFileCount
    };
  } catch (error) {
    console.error('更新仓库大小失败:', error);
    throw error;
  }
}

/**
 * 减少仓库大小 - 直接从数据库计算实际值
 * @param {Object} env - 环境变量
 * @param {number} repositoryId - 仓库ID
 * @param {number} fileSize - 要删除的文件大小（用于日志）
 * @returns {Promise<Object>} - 返回更新结果
 */
export async function decreaseRepositorySizeEstimate(env, repositoryId, fileSize) {
  try {
    if (!repositoryId) {
      console.log('无仓库ID，跳过更新仓库大小');
      return { updated: false, reason: 'no_repository_id' };
    }

    console.log(`正在更新仓库 ID: ${repositoryId} 的统计信息 (删除文件: ${fileSize} 字节)`);
    
    // 获取当前仓库信息
    const repo = await env.DB.prepare(`
      SELECT * FROM repositories WHERE id = ?
    `).bind(repositoryId).first();
    
    if (!repo) {
      console.log(`仓库 ID: ${repositoryId} 不存在`);
      return { updated: false, reason: 'repository_not_found' };
    }
    
    // 直接从数据库查询实际的文件数量和总大小
    const statsResult = await env.DB.prepare(`
      SELECT 
        COUNT(DISTINCT id) as file_count,
        COALESCE(SUM(size), 0) as total_size
      FROM images 
      WHERE repository_id = ?
    `).bind(repositoryId).first();
    
    if (!statsResult) {
      console.error(`无法获取仓库 ID: ${repositoryId} 的统计信息`);
      return { updated: false, error: '无法获取统计信息' };
    }
    
    const actualFileCount = statsResult.file_count || 0;
    const actualSize = statsResult.total_size || 0;
    
    // 更新仓库的实际文件数量和大小
    await env.DB.prepare(`
      UPDATE repositories 
      SET size_estimate = ?, updated_at = datetime('now', '+8 hours')
      WHERE id = ?
    `).bind(actualSize, repositoryId).run();
    
    console.log(`仓库 ${repo.name} (ID: ${repositoryId}) 统计信息已更新: ${actualFileCount} 个文件, ${actualSize} 字节`);
    
    // 获取仓库大小阈值
    const thresholdSetting = await env.DB.prepare(`
      SELECT value FROM settings WHERE key = 'repository_size_threshold'
    `).first();
    
    // 确保解析为整数，使用默认值900MB如果没有设置
    const repoSizeThreshold = thresholdSetting && !isNaN(parseInt(thresholdSetting.value)) ? 
      parseInt(thresholdSetting.value) : 
      900 * 1024 * 1024;
    
    console.log(`使用仓库大小阈值: ${repoSizeThreshold} 字节 (${Math.round(repoSizeThreshold / (1024 * 1024))}MB)`);
    
    // 如果仓库之前是不活跃的，但现在大小低于阈值，更新为活跃
    if (repo.status === 'inactive' && actualSize < repoSizeThreshold * 0.9) {
      console.log(`仓库 ${repo.name} 大小现在低于阈值的90%，更新状态为 'active'`);
      
      await env.DB.prepare(`
        UPDATE repositories SET status = 'active', updated_at = datetime('now', '+8 hours')
        WHERE id = ?
      `).bind(repositoryId).run();
    }
    
    return {
      updated: true,
      repositoryId,
      oldSize: repo.size_estimate,
      newSize: actualSize,
      fileCount: actualFileCount
    };
  } catch (error) {
    console.error('更新仓库大小失败:', error);
    return { updated: false, error: error.message };
  }
}

/**
 * 同步仓库的文件计数和大小
 * @param {Object} env - 环境变量
 * @param {number} repositoryId - 仓库ID
 * @returns {Promise<Object>} - 返回同步结果
 */
export async function syncRepositoryFileCount(env, repositoryId) {
  try {
    console.log(`开始同步仓库 ID: ${repositoryId} 的文件数量和大小`);
    
    // 确保仓库存在
    const repo = await env.DB.prepare(`
      SELECT * FROM repositories WHERE id = ?
    `).bind(repositoryId).first();
    
    if (!repo) {
      console.error(`仓库 ID: ${repositoryId} 不存在`);
      return { success: false, error: '仓库不存在' };
    }
    
    // 直接从数据库查询实际文件数量和总大小
    const statsResult = await env.DB.prepare(`
      SELECT 
        COUNT(DISTINCT id) as file_count,
        COALESCE(SUM(size), 0) as total_size
      FROM images 
      WHERE repository_id = ?
    `).bind(repositoryId).first();
    
    if (!statsResult) {
      console.error(`无法获取仓库 ID: ${repositoryId} 的统计信息`);
      return { success: false, error: '无法获取统计信息' };
    }
    
    const actualFileCount = statsResult.file_count || 0;
    const actualSize = statsResult.total_size || 0;
    
    console.log(`仓库 ${repo.name} (ID: ${repositoryId}) 实际文件数量: ${actualFileCount}, 总大小: ${actualSize} 字节`);
    
    // 更新仓库的文件计数和大小
    await env.DB.prepare(`
      UPDATE repositories 
      SET size_estimate = ?,
          updated_at = datetime('now', '+8 hours')
      WHERE id = ?
    `).bind(actualSize, repositoryId).run();
    
    console.log(`仓库 ${repo.name} (ID: ${repositoryId}) 的统计信息已同步: ${actualFileCount} 个文件, ${actualSize} 字节`);
    
    return { 
      success: true,
      file_count: actualFileCount,
      total_size: actualSize,
      repository_id: repositoryId,
      repository_name: repo.name
    };
  } catch (error) {
    console.error(`同步仓库 ID: ${repositoryId} 统计信息失败:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * 同步所有仓库的文件计数
 * @param {Object} env - 环境变量
 * @returns {Promise<Object>} - 返回同步结果
 */
export async function syncAllRepositoriesFileCount(env) {
  try {
    // 获取所有仓库
    const repos = await env.DB.prepare(`
      SELECT id, name FROM repositories
    `).all();
    
    if (!repos.results || repos.results.length === 0) {
      return { success: false, error: '未找到仓库' };
    }
    
    const results = [];
    
    // 同步每个仓库的文件计数
    for (const repo of repos.results) {
      try {
        const result = await syncRepositoryFileCount(env, repo.id);
        results.push({
          repository_id: repo.id,
          repository_name: repo.name,
          success: result.success,
          file_count: result.file_count
        });
      } catch (error) {
        results.push({
          repository_id: repo.id,
          repository_name: repo.name,
          success: false,
          error: error.message
        });
      }
    }
    
    return {
      success: true,
      results
    };
  } catch (error) {
    console.error('同步所有仓库文件计数失败:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 获取所有仓库列表
 * @param {Object} env - 环境变量
 * @returns {Promise<Array>} - 返回仓库列表
 */
export async function getAllRepositories(env) {
  try {
    const repos = await env.DB.prepare(`
      SELECT * FROM repositories ORDER BY priority ASC, id ASC
    `).all();
    
    return repos.results || [];
  } catch (error) {
    console.error('获取仓库列表失败:', error);
    return [];
  }
}

/**
 * 触发所有仓库的部署钩子
 * @param {Object} env - 环境变量
 * @returns {Promise<Object>} - 返回部署结果
 */
export async function triggerAllRepositoriesDeployHooks(env) {
  const results = [];
  
  try {
    console.log('开始触发所有仓库的部署钩子...');
    
    // 获取所有仓库的部署钩子，包括活跃和非活跃的仓库
    const repos = await env.DB.prepare(`
      SELECT id, name, owner, deploy_hook, status FROM repositories
      ORDER BY status ASC, id DESC
    `).all();
    
    console.log(`找到 ${repos.results?.length || 0} 个仓库`);
    
    // 如果没有仓库，尝试使用环境变量中的部署钩子
    if (!repos.results || repos.results.length === 0) {
      console.log('没有找到仓库，尝试使用环境变量中的部署钩子');
      if (env.DEPLOY_HOOK) {
        try {
          console.log(`触发环境变量中的部署钩子...`);
          const response = await fetch(env.DEPLOY_HOOK, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          const responseText = await response.text();
          let responseData;
          try {
            responseData = JSON.parse(responseText);
          } catch (e) {
            responseData = responseText;
          }

          if (response.ok) {
            results.push({
              repoId: 'env',
              repoName: 'environment-hook',
              success: true,
              result: responseData
            });
            
            console.log(`环境变量部署钩子触发成功:`, responseData);
          } else {
            results.push({
              repoId: 'env',
              repoName: 'environment-hook',
              success: false,
              error: `部署触发失败: ${response.status} ${responseText}`,
              response: responseData
            });
            
            console.error(`环境变量部署钩子触发失败: ${response.status}`, responseData);
          }
        } catch (error) {
          results.push({
            repoId: 'env',
            repoName: 'environment-hook',
            success: false,
            error: `部署钩子请求异常: ${error.message}`
          });
          
          console.error(`环境变量部署钩子请求异常:`, error);
        }
      } else {
        console.error('没有找到任何可用的部署钩子');
      }
      
      return {
        success: results.some(r => r.success),
        results
      };
    }
    
    // 优先触发活跃仓库的部署钩子
    const activeRepos = repos.results.filter(repo => repo.status === 'active');
    console.log(`找到 ${activeRepos.length} 个活跃仓库`);
    
    // 如果没有活跃仓库，触发所有仓库的部署钩子
    const reposToTrigger = activeRepos.length > 0 ? activeRepos : repos.results;
    
    for (const repo of reposToTrigger) {
      const deployHook = repo.deploy_hook || env.DEPLOY_HOOK;
      
      if (!deployHook) {
        console.log(`仓库 ${repo.name} (ID: ${repo.id}) 没有配置部署钩子`);
        results.push({
          repoId: repo.id,
          repoName: repo.name,
          success: false,
          error: '没有配置部署钩子'
        });
        continue;
      }
      
      try {
        console.log(`触发仓库 ${repo.name} (ID: ${repo.id}, 状态: ${repo.status}) 的部署钩子...`);
        const response = await fetch(deployHook, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        const responseText = await response.text();
        let responseData;
        try {
          responseData = JSON.parse(responseText);
        } catch (e) {
          responseData = responseText;
        }

        if (response.ok) {
          results.push({
            repoId: repo.id,
            repoName: repo.name,
            success: true,
            result: responseData
          });
          
          console.log(`仓库 ${repo.name} 部署钩子触发成功:`, responseData);
        } else {
          results.push({
            repoId: repo.id,
            repoName: repo.name,
            success: false,
            error: `部署触发失败: ${response.status} ${responseText}`,
            response: responseData
          });
          
          console.error(`仓库 ${repo.name} 部署钩子触发失败: ${response.status}`, responseData);
        }
      } catch (error) {
        results.push({
          repoId: repo.id,
          repoName: repo.name,
          success: false,
          error: `部署钩子请求异常: ${error.message}`
        });
        
        console.error(`仓库 ${repo.name} 部署钩子请求异常:`, error);
      }
    }
    
    // 检查是否有任何成功的部署触发
    const hasSuccess = results.some(r => r.success);
    console.log(`部署钩子触发完成，${hasSuccess ? '有' : '没有'}成功的触发`);
    
    return {
      success: hasSuccess,
      results
    };
  } catch (error) {
    console.error('触发所有仓库部署钩子失败:', error);
    return {
      success: false,
      error: error.message,
      results
    };
  }
} 
