// 全局变量
let currentPage = 1;
let totalPages = 1;
let currentSort = 'newest';
let currentSearch = '';
let isDebugMode = false; // 调试模式标志
let allowedFileTypes = ['*/*']; // 默认允许所有文件类型

// 保存原始控制台方法的引用
const originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug
};

// 创建自定义控制台处理器
function setupConsoleHandling() {
    // 检查调试模式
    isDebugMode = localStorage.getItem('debugMode') === 'true' || 
                  new URLSearchParams(window.location.search).has('debug');
    
    // 重写控制台方法
    console.log = function(...args) {
        if (isDebugMode) {
            originalConsole.log.apply(console, args);
        }
    };
    
    console.info = function(...args) {
        if (isDebugMode) {
            originalConsole.info.apply(console, args);
        }
    };
    
    console.warn = function(...args) {
        if (isDebugMode) {
            originalConsole.warn.apply(console, args);
        }
    };
    
    console.debug = function(...args) {
        if (isDebugMode) {
            originalConsole.debug.apply(console, args);
        }
    };
    
    // 错误日志始终保留，不受调试模式影响
    console.error = function(...args) {
        originalConsole.error.apply(console, args);
    };
    
    // 如果开启了调试模式，添加调试CSS类
    if (isDebugMode) {
        originalConsole.log('调试模式已启用');
        document.body.classList.add('debug-mode');
    }
    
    // 添加键盘快捷键(Alt+D)来切换调试模式
    document.addEventListener('keydown', function(e) {
        // Alt+D组合键
        if (e.altKey && e.key === 'd') {
            // 检查是否是管理页面
            if (window.location.pathname.includes('/admin/')) {
                e.preventDefault(); // 阻止默认行为
                toggleDebugMode();
                
                // 更新调试按钮（如果存在）
                const debugBtn = document.querySelector('.debug-toggle-btn');
                if (debugBtn) {
                    debugBtn.innerHTML = `<i class="fas fa-bug"></i> ${isDebugMode ? '关闭调试' : '开启调试'}`;
                    debugBtn.title = isDebugMode ? '关闭调试模式' : '开启调试模式';
                    debugBtn.style.backgroundColor = isDebugMode ? '#f44336' : '#4CAF50';
                }
            }
        }
    });
}

// 切换调试模式的函数
function toggleDebugMode() {
    isDebugMode = !isDebugMode;
    localStorage.setItem('debugMode', isDebugMode);
    
    // 显示状态提示
    showNotification(isDebugMode ? '调试模式已开启' : '调试模式已关闭', isDebugMode ? 'info' : 'success');
    
    // 如果启用了调试模式，输出一条消息确认
    if (isDebugMode) {
        originalConsole.log('调试模式已手动开启');
        document.body.classList.add('debug-mode');
    } else {
        document.body.classList.remove('debug-mode');
    }
    
    // 可选：刷新页面以确保所有组件都正确应用调试模式
    // window.location.reload();
}

// 批量删除相关变量和函数
let selectAllCheckbox;
let batchDeleteButton;
let imageGrid; // 定义全局变量，用于引用图片网格

// DOM 加载完成后执行
document.addEventListener('DOMContentLoaded', () => {
    try {
        // 设置控制台处理
        setupConsoleHandling();
        
        console.log('DOM加载完成，开始初始化');
        
        // 移动端设备优化
        optimizeForMobileDevices();
        
        // 注意：这里不再需要检查调试模式，因为setupConsoleHandling已经处理了

        // 获取图片网格和分页元素
        imageGrid = document.getElementById('folderGrid');
        
        // 确保元素存在
        if (!imageGrid) {
            console.warn('未找到文件夹网格元素，将创建一个新的');
            imageGrid = document.createElement('div');
            imageGrid.id = 'folderGrid';
            imageGrid.className = 'folder-grid';
            
            // 尝试找到合适的位置插入这个元素
            const imagesSection = document.getElementById('images');
            if (imagesSection) {
                const toolbar = imagesSection.querySelector('.toolbar');
                if (toolbar) {
                    toolbar.after(imageGrid);
                } else {
                    imagesSection.appendChild(imageGrid);
                }
            } else {
                document.querySelector('.main-content').appendChild(imageGrid);
            }
        }

        // 初始化基本页面功能
        console.log('初始化导航');
    initNavigation();
        
        // 异步初始化其他功能，确保不会阻塞UI
        setTimeout(() => {
            console.log('初始化控制面板');
    initDashboard();
            
            // 根据当前页面初始化相应的功能
            const currentPage = document.querySelector('.nav-menu li.active');
            if (currentPage) {
                const pageType = currentPage.getAttribute('data-page');
                console.log('当前页面类型:', pageType);
                
                if (pageType === 'images') {
                    console.log('初始化文件夹管理');
                    initFolderManagement();
                    console.log('加载文件夹列表');
                    loadFolders();
                } else if (pageType === 'dashboard') {
                    console.log('初始化控制面板');
                    // 控制面板不需要额外初始化
                } else {
                    console.log('初始化其他页面功能');
                    // 其他页面保持原有功能
                }
            } else {
                // 默认初始化文件夹管理（而不是图片管理）
                console.log('默认初始化文件夹管理');
                initFolderManagement();
                console.log('加载文件夹列表');
                loadFolders();
                
                // 设置默认激活的导航项
                const imagesNavItem = document.querySelector('.nav-menu li[data-page="images"]');
                if (imagesNavItem) {
                    imagesNavItem.classList.add('active');
                }
                
                // 设置默认显示的页面
                const imagesPage = document.getElementById('images');
                const dashboardPage = document.getElementById('dashboard');
                if (imagesPage && dashboardPage) {
                    dashboardPage.classList.remove('active');
                    imagesPage.classList.add('active');
                }
                
                // 更新页面标题
                const pageTitle = document.getElementById('pageTitle');
                if (pageTitle) {
                    pageTitle.textContent = '文件夹管理';
                }
            }
            
            console.log('初始化仓库管理');
    initRepositoryManagement();
            console.log('初始化批量操作');
            initBatchOperations();
            console.log('初始化系统设置');
    initSettings();
            
            // 初始化上传模态框
            console.log('初始化上传模态框');
    initUploadModal();
            
            // 添加图片复选框变化事件委托
            document.addEventListener('change', function(e) {
                if (e.target.classList.contains('image-checkbox')) {
                    updateBatchButtonsState();
                }
            });
            
            // 最后尝试加载文件类型，如果失败不影响基本功能
            console.log('加载允许的文件类型');
            loadAllowedFileTypes().catch(err => {
                console.error('加载文件类型失败，使用默认值:', err);
            });
            
            // 添加调试模式切换按钮
            addDebugModeToggle();
        }, 100);

        // 添加全屏预览容器
        const fullsizePreview = document.createElement('div');
        fullsizePreview.className = 'fullsize-preview';
        fullsizePreview.innerHTML = `
            <div class="preview-controls">
                <button class="zoom-in" title="放大"><i class="fas fa-search-plus"></i></button>
                <button class="zoom-out" title="缩小"><i class="fas fa-search-minus"></i></button>
                <button class="zoom-reset" title="重置缩放"><i class="fas fa-sync-alt"></i></button>
                <button class="close-preview">&times;</button>
            </div>
            <div class="preview-container">
                <img src="" alt="Full size preview" />
            </div>
            <div class="image-info-panel"></div>
        `;
        document.body.appendChild(fullsizePreview);
        
        // 缩放与拖动控制变量
        let currentZoom = 1;
        const zoomStep = 0.2;
        const previewContainer = fullsizePreview.querySelector('.preview-container');
        const previewImg = previewContainer.querySelector('img');
        
        // 拖动状态变量
        let isDragging = false;
        let dragStart = { x: 0, y: 0 };
        let currentTranslate = { x: 0, y: 0 };
        
        // 重置预览状态
        function resetPreview() {
            currentZoom = 1;
            currentTranslate = { x: 0, y: 0 };
            previewImg.style.transform = `scale(${currentZoom}) translate(${currentTranslate.x / currentZoom}px, ${currentTranslate.y / currentZoom}px)`;
            previewImg.style.cursor = 'default';
        }
        
        // 缩放按钮功能
        fullsizePreview.querySelector('.zoom-in').addEventListener('click', function(e) {
            e.stopPropagation();
            currentZoom = Math.min(8, currentZoom + zoomStep);
            previewImg.style.transform = `scale(${currentZoom}) translate(${currentTranslate.x / currentZoom}px, ${currentTranslate.y / currentZoom}px)`;
            
            // 放大时启用拖动样式
            if (currentZoom > 1.2) {
                previewImg.style.cursor = 'grab';
            }
        });
        
        fullsizePreview.querySelector('.zoom-out').addEventListener('click', function(e) {
            e.stopPropagation();
            currentZoom = Math.max(0.5, currentZoom - zoomStep);
            previewImg.style.transform = `scale(${currentZoom}) translate(${currentTranslate.x / currentZoom}px, ${currentTranslate.y / currentZoom}px)`;
            
            // 缩小到一定程度时关闭拖动样式
            if (currentZoom <= 1.2) {
                previewImg.style.cursor = 'default';
            }
        });
        
        fullsizePreview.querySelector('.zoom-reset').addEventListener('click', function(e) {
            e.stopPropagation();
            resetPreview();
        });
        
        // 拖动功能
        previewImg.addEventListener('mousedown', function(e) {
            // 只有放大到一定程度才启用拖动
            if (currentZoom <= 1.2) return;
            
            isDragging = true;
            dragStart = {
                x: e.clientX - currentTranslate.x,
                y: e.clientY - currentTranslate.y
            };
            previewImg.style.cursor = 'grabbing';
            e.preventDefault(); // 防止图片被拖拽
        });
        
        document.addEventListener('mousemove', function(e) {
            if (!isDragging) return;
            
            currentTranslate = {
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y
            };
            
            previewImg.style.transform = `scale(${currentZoom}) translate(${currentTranslate.x / currentZoom}px, ${currentTranslate.y / currentZoom}px)`;
        });
        
        document.addEventListener('mouseup', function() {
            if (!isDragging) return;
            
            isDragging = false;
            previewImg.style.cursor = currentZoom > 1.2 ? 'grab' : 'default';
        });
        
        // 点击关闭按钮隐藏预览
        fullsizePreview.querySelector('.close-preview').addEventListener('click', function() {
            fullsizePreview.classList.remove('active');
            resetPreview();
        });
        
        // 点击背景也可以关闭预览
        fullsizePreview.addEventListener('click', function(e) {
            if (e.target === fullsizePreview || e.target === previewContainer) {
                fullsizePreview.classList.remove('active');
                resetPreview();
            }
        });
        
        // ESC键关闭预览
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && fullsizePreview.classList.contains('active')) {
                fullsizePreview.classList.remove('active');
                resetPreview();
            }
        });
        
        // 鼠标滚轮缩放
        fullsizePreview.addEventListener('wheel', function(e) {
            if (fullsizePreview.classList.contains('active')) {
                e.preventDefault();
                
                // 记录旧的缩放值
                const oldZoom = currentZoom;
                
                // 根据滚轮方向调整缩放
                if (e.deltaY < 0) {
                    currentZoom = Math.min(8, currentZoom + zoomStep); // 限制最大缩放8倍
                } else {
                    currentZoom = Math.max(0.5, currentZoom - zoomStep); // 限制最小缩放0.5倍
                }
                
                // 如果缩放值没变，则不需要更新变换
                if (oldZoom === currentZoom) return;

                // 应用缩放
                previewImg.style.transform = `scale(${currentZoom}) translate(${currentTranslate.x / currentZoom}px, ${currentTranslate.y / currentZoom}px)`;
                
                // 更新鼠标样式
                previewImg.style.cursor = currentZoom > 1.2 ? 'grab' : 'default';
            }
        }, { passive: false });

        // 添加全局下拉菜单容器 - 这将用于所有下拉菜单
        const globalDropdownContainer = document.createElement('div');
        globalDropdownContainer.className = 'global-dropdown-container';
        document.body.appendChild(globalDropdownContainer);

        // 点击页面其他地方关闭所有下拉菜单
        document.addEventListener('click', function(e) {
            // 如果点击的不是下拉菜单触发器，则关闭所有下拉菜单
            if (!e.target.closest('.dropdown-toggle')) {
                closeAllDropdowns();
            }
        });
    } catch (error) {
        console.error('初始化页面时出错:', error);
    }
});

// 系统设置功能
function initSettings() {
    console.log('初始化系统设置');
    const settingsForm = document.getElementById('settingsForm');
    const repositorySettingsForm = document.getElementById('repositorySettingsForm');
    const uploadSettingsForm = document.getElementById('uploadSettingsForm');
    const imageProcessingSettingsForm = document.getElementById('imageProcessingSettingsForm');
    const passwordForm = document.getElementById('passwordForm');
    
    if (!settingsForm) {
        console.error('未找到设置表单元素');
        return;
    }
    
    try {
        // 尝试从API获取当前设置
        safeApiCall('/api/settings')
            .then(settings => {
                if (!settings.error) {
                    console.log('已加载设置:', settings);
                    
                    // 填充基本设置
                    const siteName = document.getElementById('siteName');
                    const allowGuestUpload = document.getElementById('allowGuestUpload');
                    
                    if (siteName) {
                        siteName.value = settings.site_name || '';
                    }
                    
                    if (allowGuestUpload) {
                        // 确保使用严格比较，string类型的'true'转换为布尔值
                        allowGuestUpload.checked = settings.allow_guest_upload === 'true';
                        console.log('设置游客上传状态:', allowGuestUpload.checked);
                    }
                    
                    // 填充仓库设置
                    const repositorySizeThreshold = document.getElementById('repositorySizeThreshold');
                    const repositoryNameTemplate = document.getElementById('repositoryNameTemplate');
                    
                    if (repositorySizeThreshold) {
                        // 不自动填充 value，只设置 placeholder
                        repositorySizeThreshold.value = '';
                        repositorySizeThreshold.placeholder = '输入阈值 (MB)';
                    }
                    
                    if (repositoryNameTemplate) {
                        repositoryNameTemplate.value = settings.repository_name_template || '';
                    }
                    
                    // 填充上传设置
                    const maxFileSize = document.getElementById('maxFileSize');
                    const allowedTypes = document.getElementById('allowedTypes');
                    
                    if (maxFileSize) {
                        const maxFileSizeMB = Math.round(parseInt(settings.max_file_size || '10485760') / (1024 * 1024));
                        maxFileSize.value = maxFileSizeMB;
                    }
                    
                    if (allowedTypes) {
                        allowedTypes.value = settings.allowed_types || '*/*';
                    }
                    
                    // 填充图像处理设置
                    const enableCompression = document.getElementById('enableCompression');
                    const compressionQuality = document.getElementById('compressionQuality');
                    
                    if (enableCompression) {
                        // 确保正确处理字符串值
                        enableCompression.checked = settings.enable_compression === 'true' || settings.enable_compression === true;
                        console.log('图像压缩设置:', settings.enable_compression, '复选框状态:', enableCompression.checked);
                    }
                    
                    if (compressionQuality) {
                        compressionQuality.value = settings.compression_quality || '80';
                    }
                }
            })
            .catch(err => {
                console.error('加载设置失败:', err);
                showNotification('加载设置失败', 'error');
            });
        
        // 处理基本设置表单提交
        settingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // 安全获取siteName值，如果元素不存在则使用空字符串
            const siteNameElement = document.getElementById('siteName');
            const siteName = siteNameElement ? siteNameElement.value : '';
            
            const settings = {
                site_name: siteName,
                allow_guest_upload: document.getElementById('allowGuestUpload').checked ? 'true' : 'false'
            };
            
            console.log('保存基本设置:', settings);
            
            try {
                const response = await safeApiCall('/api/settings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(settings)
                });
                
                if (!response.error) {
                    console.log('基本设置保存成功');
                    showNotification('基本设置已保存', 'success');
                } else {
                    console.error('保存基本设置失败:', response.error);
                    showNotification('保存基本设置失败: ' + response.error, 'error');
                }
            } catch (error) {
                showNotification('保存基本设置失败', 'error');
                console.error('保存基本设置出错:', error);
            }
        });
        
        // 处理仓库设置表单提交
        if (repositorySettingsForm) {
            repositorySettingsForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const thresholdMB = parseInt(document.getElementById('repositorySizeThreshold').value);
                const nameTemplate = document.getElementById('repositoryNameTemplate').value;
                
                // 验证阈值
                if (thresholdMB > 1000) {
                    showNotification('仓库大小阈值不能超过1GB', 'error');
                    return;
                }
                
                if (thresholdMB > 900) {
                    const confirm = window.confirm('不建议将仓库大小阈值设置超过900MB，这可能导致GitHub仓库被警告。是否继续？');
                    if (!confirm) {
                        return;
                    }
                }
                
                const settings = {
                    repository_size_threshold: (thresholdMB * 1024 * 1024).toString(),
                    repository_name_template: nameTemplate
                };
                
                console.log('保存仓库设置:', settings);
                
                try {
                    const response = await safeApiCall('/api/settings', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(settings)
                    });
                    
                    if (!response.error) {
                        console.log('仓库设置保存成功');
                        showNotification('仓库设置已保存', 'success');
                    } else {
                        console.error('保存仓库设置失败:', response.error);
                        showNotification('保存仓库设置失败: ' + response.error, 'error');
                    }
                } catch (error) {
                    showNotification('保存仓库设置失败', 'error');
                    console.error('保存仓库设置出错:', error);
                }
            });
        }
        
        // 处理上传设置表单提交
        if (uploadSettingsForm) {
            uploadSettingsForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const maxFileSizeMB = parseInt(document.getElementById('maxFileSize').value);
                const allowedTypesValue = document.getElementById('allowedTypes').value;
                
                const settings = {
                    max_file_size: (maxFileSizeMB * 1024 * 1024).toString(),
                    allowed_types: allowedTypesValue
                };
                
                console.log('保存上传设置:', settings);
                
                try {
                    const response = await safeApiCall('/api/settings', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(settings)
                    });
                    
                    if (!response.error) {
                        console.log('上传设置保存成功');
                        showNotification('上传设置已保存', 'success');
                        
                        // 更新全局允许的文件类型
                        if (allowedTypesValue) {
                            // 如果设置为允许所有类型，使用通配符
                            if (allowedTypesValue === '*/*' || allowedTypesValue === '*') {
                                allowedFileTypes = ['*/*'];
                            } else {
                            allowedFileTypes = allowedTypesValue.split(',');
                            }
                        }
                    } else {
                        console.error('保存上传设置失败:', response.error);
                        showNotification('保存上传设置失败: ' + response.error, 'error');
                    }
                } catch (error) {
                    showNotification('保存上传设置失败', 'error');
                    console.error('保存上传设置出错:', error);
                }
            });
        }
        
        // 处理图像处理设置表单提交
        if (imageProcessingSettingsForm) {
            imageProcessingSettingsForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const enableCompression = document.getElementById('enableCompression').checked;
                const compressionQuality = document.getElementById('compressionQuality').value;
                
                const settings = {
                    enable_compression: enableCompression ? 'true' : 'false',
                    compression_quality: compressionQuality
                };
                
                console.log('保存图像处理设置:', settings);
                
                try {
                    const response = await safeApiCall('/api/settings', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(settings)
                    });
                    
                    if (!response.error) {
                        console.log('图像处理设置保存成功');
                        showNotification('图像处理设置已保存', 'success');
                        
                        // 立即更新复选框状态
                        document.getElementById('enableCompression').checked = enableCompression;
                    } else {
                        console.error('保存图像处理设置失败:', response.error);
                        showNotification('保存图像处理设置失败: ' + response.error, 'error');
                    }
                } catch (error) {
                    showNotification('保存图像处理设置失败', 'error');
                    console.error('保存图像处理设置出错:', error);
                }
            });
        }

        // 处理密码修改表单提交
        if (passwordForm) {
            passwordForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const currentPassword = document.getElementById('currentPassword').value;
                const newPassword = document.getElementById('newPassword').value;
                const confirmPassword = document.getElementById('confirmPassword').value;
                
                // 清除可能存在的错误提示
                document.querySelectorAll('.password-error').forEach(el => el.remove());
                
                // 验证新密码和确认密码是否一致
                if (newPassword !== confirmPassword) {
                    const errorMessage = document.createElement('div');
                    errorMessage.className = 'password-error error-message';
                    errorMessage.textContent = '两次输入的新密码不一致';
                    document.getElementById('confirmPassword').parentNode.appendChild(errorMessage);
                    showNotification('两次输入的新密码不一致', 'error');
                    return;
                }
                
                // 验证新密码长度
                if (newPassword.length < 6) {
                    const errorMessage = document.createElement('div');
                    errorMessage.className = 'password-error error-message';
                    errorMessage.textContent = '新密码长度不能少于6个字符';
                    document.getElementById('newPassword').parentNode.appendChild(errorMessage);
                    showNotification('新密码长度不能少于6个字符', 'error');
                    return;
                }
                
                try {
                    // 显示加载状态
                    const submitButton = passwordForm.querySelector('button[type="submit"]');
                    submitButton.disabled = true;
                    submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 修改中...';
                    
                    const response = await safeApiCall('/api/admin/change-password', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            currentPassword,
                            newPassword
                        })
                    });
                    
                    // 恢复按钮状态
                    submitButton.disabled = false;
                    submitButton.innerHTML = '<i class="fas fa-key"></i> 修改密码';
                    
                    if (!response.error) {
                        console.log('密码修改成功');
                        showNotification('密码已成功修改', 'success');
                        
                        // 清空表单
                        passwordForm.reset();
                    } else {
                        console.error('密码修改失败:', response.error);
                        showNotification('密码修改失败: ' + response.error, 'error');
                    }
                } catch (error) {
                    // 恢复按钮状态
                    submitButton.disabled = false;
                    submitButton.innerHTML = '<i class="fas fa-key"></i> 修改密码';
                    
                    console.error('密码修改请求失败:', error);
                    showNotification('密码修改请求失败', 'error');
                }
            });
        } else {
            console.warn('未找到密码修改表单');
        }
    } catch (error) {
        console.error('初始化设置功能失败:', error);
    }
}

// 加载允许的文件类型
async function loadAllowedFileTypes() {
    try {
        // 添加超时控制
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        
        const response = await safeApiCall('/api/settings', {
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.error && response.allowed_types) {
            // 如果设置为允许所有类型，使用通配符
            if (response.allowed_types === '*/*' || response.allowed_types === '*') {
                allowedFileTypes = ['*/*'];
            } else {
            allowedFileTypes = response.allowed_types.split(',');
            }
            console.log('已加载允许的文件类型:', allowedFileTypes);
        } else {
            // 默认允许所有文件类型
            allowedFileTypes = ['*/*'];
            console.log('使用默认的允许文件类型:', allowedFileTypes);
        }
    } catch (error) {
        console.error('加载允许的文件类型失败，使用默认值:', error);
        // 出错不影响继续使用默认值
    }
}

// 安全的API调用函数，包含错误处理
async function safeApiCall(url, options = {}) {
    try {
        // 在调试模式下添加debug参数
        if (isDebugMode) {
            url = url.includes('?') ? `${url}&debug=true` : `${url}?debug=true`;
        }
        
        // 提取自定义选项
        const { timeout, ...fetchOptions } = options;
        const requestTimeout = timeout || 30000; // 默认30秒
        
        // 设置请求选项
        const finalOptions = {
            ...fetchOptions,
            credentials: 'include',
            headers: {
                ...fetchOptions.headers,
                'X-Debug-Mode': isDebugMode ? 'true' : 'false'
            }
        };
        
        // 添加超时处理
        const controller = new AbortController();
        if (!finalOptions.signal) {
            finalOptions.signal = controller.signal;
        }
        const timeoutId = setTimeout(() => controller.abort(), requestTimeout);
        
        try {
            console.log(`发送请求: ${url}`, finalOptions);
            const response = await fetch(url, finalOptions);
            clearTimeout(timeoutId);
            
            // 尝试获取响应内容
            let responseData;
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                try {
                    responseData = await response.json();
                } catch (jsonError) {
                    console.error('解析JSON响应失败:', jsonError);
                    responseData = null;
                }
            } else {
                try {
                    responseData = await response.text();
                } catch (textError) {
                    console.error('获取响应文本失败:', textError);
                    responseData = null;
                }
            }
            
            if (!response.ok) {
                console.error(`API错误: ${url} 返回状态码 ${response.status}`, responseData);
                
                // 如果有JSON响应且包含错误信息，使用它
                if (responseData && typeof responseData === 'object' && responseData.error) {
                    return { error: responseData.error };
                }
                
                // 否则使用状态码
                return { error: `服务器错误 (${response.status})${responseData && typeof responseData === 'string' ? ': ' + responseData : ''}` };
            }
            
            return responseData;
        } catch (fetchError) {
            clearTimeout(timeoutId);
            throw fetchError;
        }
    } catch (error) {
        if (error.name === 'AbortError') {
            console.error(`API请求超时: ${url}`);
            return { error: '请求超时，请稍后再试' };
        }
        console.error(`API调用错误:`, error);
        return { error: '网络请求失败，请检查连接: ' + error.message };
    }
}

// 导航功能
function initNavigation() {
    const navItems = document.querySelectorAll('.nav-menu li');
    const pages = document.querySelectorAll('.page');
    const pageTitle = document.getElementById('pageTitle');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetPage = item.getAttribute('data-page');
            
            // 更新导航状态
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            
            // 更新页面显示
            pages.forEach(page => {
                page.classList.remove('active');
                if (page.id === targetPage) {
                    page.classList.add('active');
                    pageTitle.textContent = item.querySelector('span').textContent;
                }
            });
            
            // 根据页面类型初始化相应的功能
            if (targetPage === 'images') {
                console.log('切换到文件夹管理页面');
                initFolderManagement();
                loadFolders();
            } else if (targetPage === 'dashboard') {
                console.log('切换到控制面板');
                initDashboard();
            } else {
                console.log('切换到其他页面');
                // 其他页面保持原有功能
            }
        });
    });

    // 退出登录
    document.getElementById('logoutBtn').addEventListener('click', async () => {
        try {
            // 直接使用原生 cookie API 删除 session_id cookie
            document.cookie = 'session_id=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
                window.location.href = '/admin/login.html';
        } catch (error) {
            console.error('退出登录失败:', error);
        }
    });
}

// 控制面板功能
async function initDashboard() {
    try {
        // 获取文件夹统计信息
        const foldersResponse = await safeApiCall('/api/folders', {
            method: 'GET',
            credentials: 'include'
        });
        
        if (foldersResponse.success) {
            const folders = foldersResponse.data || [];
            
            // 计算总文件夹数
            const totalFolders = folders.length;
            
            // 计算总文件数和总大小
            let totalFiles = 0;
            let totalSize = 0;
            
            folders.forEach(folder => {
                totalFiles += folder.file_count || 0;
                totalSize += folder.total_size || 0;
            });
            
            // 更新DOM
            const totalFoldersElement = document.getElementById('totalFolders');
            const totalFilesElement = document.getElementById('totalFiles');
            const totalSizeElement = document.getElementById('totalSize');
            
            if (totalFoldersElement) {
                totalFoldersElement.textContent = totalFolders.toLocaleString();
            }
            
            if (totalFilesElement) {
                totalFilesElement.textContent = totalFiles.toLocaleString();
            }
            
            if (totalSizeElement) {
                totalSizeElement.textContent = formatFileSize(totalSize);
            }
            
            console.log('控制面板统计信息更新完成:', {
                totalFolders,
                totalFiles,
                totalSize: formatFileSize(totalSize)
            });
        } else {
            console.error('获取文件夹统计信息失败:', foldersResponse.error);
            // 使用默认值
            const totalFoldersElement = document.getElementById('totalFolders');
            const totalFilesElement = document.getElementById('totalFiles');
            const totalSizeElement = document.getElementById('totalSize');
            
            if (totalFoldersElement) {
                totalFoldersElement.textContent = '0';
            }
            if (totalFilesElement) {
                totalFilesElement.textContent = '0';
            }
            if (totalSizeElement) {
                totalSizeElement.textContent = '0 MB';
            }
        }
    } catch (error) {
        console.error('加载控制面板数据失败:', error);
        showToast('加载控制面板数据失败', 'error');
        
        // 使用默认值
        const totalFoldersElement = document.getElementById('totalFolders');
        const totalFilesElement = document.getElementById('totalFiles');
        const totalSizeElement = document.getElementById('totalSize');
        
        if (totalFoldersElement) {
            totalFoldersElement.textContent = '0';
        }
        if (totalFilesElement) {
            totalFilesElement.textContent = '0';
        }
        if (totalSizeElement) {
            totalSizeElement.textContent = '0 MB';
        }
    }
}

// 图片管理功能
function initImageManagement() {
    const searchInput = document.getElementById('searchInput');
    const sortSelect = document.getElementById('sortSelect');
    const uploadBtn = document.getElementById('uploadBtn');

    if (searchInput) {
    // 搜索功能
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
                currentSearch = e.target.value.trim();
            currentPage = 1;
            loadImages();
        }, 300);
    });

        // 确保回车键也能触发搜索
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                currentSearch = e.target.value.trim();
                currentPage = 1;
                loadImages();
            }
        });
    } else {
        console.warn('未找到搜索输入框');
    }

    if (sortSelect) {
    // 排序功能
    sortSelect.addEventListener('change', (e) => {
        currentSort = e.target.value;
        currentPage = 1;
        loadImages();
    });
    } else {
        console.warn('未找到排序选择框');
    }

    if (uploadBtn) {
    // 上传按钮
    uploadBtn.addEventListener('click', () => {
            const uploadModal = document.getElementById('uploadModal');
            if (uploadModal) {
                uploadModal.style.display = 'block';
            } else {
                console.error('未找到上传模态框');
            }
        });
    } else {
        console.warn('未找到上传按钮');
    }
}

// 初始化仓库管理功能
function initRepositoryManagement() {
    const createRepoBtn = document.getElementById('createRepoBtn');
    if (createRepoBtn) {
        createRepoBtn.addEventListener('click', showCreateRepositoryModal);
    }
    
    // 初始加载仓库列表
    loadRepositories();
}

// 加载仓库列表
async function loadRepositories() {
    const container = document.getElementById('repoGrid');
    if (!container) {
        console.error('未找到仓库容器元素');
        return;
    }
    
    try {
        console.log('开始加载仓库列表...');
        // 显示加载状态
        container.innerHTML = `
            <div class="loading-indicator">
                <i class="fas fa-spinner fa-spin"></i>
                <span>正在加载仓库列表...</span>
            </div>
        `;
        
        console.log('发送API请求...');
        const response = await safeApiCall('/api/repositories?include_stats=true');
        console.log('API响应:', response);
        
        if (response.error) {
            console.error('API返回错误:', response.error);
            throw new Error(response.error);
        }
        
        const repositories = response.data || [];
        console.log('获取到仓库列表:', repositories);
        
        container.innerHTML = '';
        
        if (repositories.length === 0) {
            console.log('没有找到仓库');
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-folder-open"></i>
                    <p>暂无仓库</p>
                    <button class="btn btn-primary" onclick="showCreateRepositoryModal()">
                        <i class="fas fa-plus"></i> 创建仓库
                    </button>
                </div>
            `;
            return;
        }
        
        console.log('开始渲染仓库卡片...');
        repositories.forEach(repo => {
            const card = createRepositoryCard(repo);
            container.appendChild(card);
        });
        console.log('仓库列表加载完成');
    } catch (error) {
        console.error('加载仓库列表失败:', error);
        container.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>加载仓库列表失败</p>
                <p class="error-message">${error.message}</p>
                <button class="btn btn-secondary" onclick="loadRepositories()">
                    <i class="fas fa-redo"></i> 重试
                </button>
            </div>
        `;
    }
}

function createRepositoryCard(repo) {
    const card = document.createElement('div');
    card.className = 'repo-card';
    card.dataset.repoId = repo.id;
    
    // 调试信息：查看仓库状态
    console.log('创建仓库卡片，仓库状态:', {
        repoId: repo.id,
        repoName: repo.name,
        status: repo.status,
        statusType: typeof repo.status,
        isActive: repo.status === 'active'
    });
    
    // 计算仓库的文件数量和总大小
    const fileCount = repo.file_count || 0;
    const totalSize = repo.total_size || 0;
    const threshold = repo.size_limit || 0;
    
    // 格式化大小显示
    const formattedSize = formatSize(totalSize);
    const formattedThreshold = threshold ? formatSize(threshold) : '未设置';
    
    // 计算使用百分比
    const usagePercent = threshold ? Math.min((totalSize / threshold) * 100, 100) : 0;
    
    // 确定仓库状态样式和文本
    const statusBadgeClass = 
        repo.status === 'active' ? 'status-active' : 
        (repo.status === 'inactive' ? 'status-inactive' : 'status-full');
    
    const statusText = 
        repo.status === 'active' ? '活跃' : 
        (repo.status === 'inactive' ? '禁用' : '已满');
    
    // 确定进度条颜色
    const progressClass = usagePercent < 70 ? 'bg-success' : (usagePercent < 90 ? 'bg-warning' : 'bg-danger');
    
    card.innerHTML = `
        <div class="repo-header">
            <h3>${repo.name}</h3>
            <span class="badge ${statusBadgeClass} status-badge">${statusText}</span>
        </div>
        <div class="repo-info">
            <p><strong>所有者:</strong> ${repo.owner}</p>
            <p><strong>优先级:</strong> ${repo.priority || 0}</p>
            <p><strong>创建时间:</strong> ${formatDate(repo.created_at)}</p>
            <p><strong>最后更新:</strong> ${formatDate(repo.updated_at)}</p>
            <p><strong>已用空间:</strong> ${formattedSize} / ${formattedThreshold}</p>
            <p><strong>文件数量:</strong> <span id="card-file-count-${repo.id}">${fileCount}</span> 个文件</p>
            
            <div class="progress-bar-wrapper">
                <div class="progress">
                    <div class="progress-bar ${progressClass}" role="progressbar" style="width: ${usagePercent}%" 
                        aria-valuenow="${usagePercent}" aria-valuemin="0" aria-valuemax="100"></div>
                </div>
                <small class="text-muted">${Math.round(usagePercent)}% 已使用</small>
            </div>
        </div>
        <div class="repo-actions">
            <div class="actions-container">
                <button class="btn btn-sm btn-outline-success btn-icon create-folder-btn" data-repo-id="${repo.id}" data-repo-name="${repo.name}" data-repo-owner="${repo.owner}" ${repo.status === 'active' ? '' : 'disabled style="background-color: #6c757d !important; border-color: #6c757d !important; color: #fff !important; opacity: 0.6; cursor: not-allowed;"'}>
                    <i class="fas fa-folder-plus"></i> 新建文件夹
                </button>
                
                ${repo.status !== 'active' ? `
                    <button class="btn btn-sm btn-outline-success btn-icon status-btn" data-repo-id="${repo.id}" data-status="active">
                        <i class="fas fa-play-circle"></i> 激活
                    </button>
                ` : ''}
                
                ${repo.status !== 'inactive' ? `
                    <button class="btn btn-sm btn-outline-secondary btn-icon status-btn" data-repo-id="${repo.id}" data-status="inactive">
                        <i class="fas fa-pause-circle"></i> 禁用
                    </button>
                ` : ''}
                
                ${repo.status !== 'full' ? `
                    <button class="btn btn-sm btn-outline-danger btn-icon status-btn" data-repo-id="${repo.id}" data-status="full">
                        <i class="fas fa-x-circle"></i> 标记已满
                    </button>
                ` : ''}
            </div>
        </div>
    `;
    
    // 添加事件监听器 - 只保留状态按钮的事件监听器
    const statusBtns = card.querySelectorAll('.status-btn');
    statusBtns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const repoId = e.currentTarget.dataset.repoId;
            const status = e.currentTarget.dataset.status;
            await updateRepositoryStatus(repoId, status, e.currentTarget);
        });
    });
    
    // 为新建文件夹按钮添加事件监听器（只在仓库状态为active时）
    const createFolderBtn = card.querySelector('.create-folder-btn');
    if (createFolderBtn && repo.status === 'active') {
        createFolderBtn.addEventListener('click', (e) => {
            const repoId = e.currentTarget.dataset.repoId;
            const repoName = e.currentTarget.dataset.repoName;
            const repoOwner = e.currentTarget.dataset.repoOwner;
            showCreateFolderModal(repoId, repoName, repoOwner);
        });
    }
    
    return card;
}

// 激活仓库
async function activateRepository(repoId) {
    try {
        const loadingToast = showNotification('正在设置活跃仓库...', 'info', 0);
        
        const response = await safeApiCall(`/api/repositories/${repoId}/activate`, {
            method: 'POST'
        });
        
        // 关闭加载提示
        document.body.removeChild(loadingToast);
        
        if (response.error) {
            throw new Error(response.error);
        }

        showNotification('已成功设置活跃仓库', 'success');
        loadRepositories(); // 重新加载仓库列表
    } catch (error) {
        console.error('设置活跃仓库失败:', error);
        showNotification('设置活跃仓库失败: ' + error.message, 'error');
    }
}

// 显示仓库详情
function showRepositoryDetails(repo) {
    // 创建模态框
    const modal = document.createElement('div');
    modal.className = 'modal';
    
    const usedSizeMB = Math.round(repo.size_estimate / (1024 * 1024) * 100) / 100;
    const maxSizeMB = Math.round(parseInt(repo.max_size || '943718400') / (1024 * 1024));
    const usagePercent = Math.min(Math.round((repo.size_estimate / parseInt(repo.max_size || '943718400')) * 100), 100);
    
    // 确定仓库状态样式和文本
    let statusClass = 'inactive';
    let statusText = '未使用';
    
    if (repo.status === 'active') {
        statusClass = 'active';
        statusText = '当前使用';
    } else if (repo.status === 'inactive') {
        statusClass = 'inactive';
        statusText = '未使用';
    } else if (repo.status === 'full') {
        statusClass = 'full';
        statusText = '已满';
    }
    
    // 确定使用率颜色
    let usageFillClass = '';
    if (usagePercent > 90) {
        usageFillClass = 'danger';
    } else if (usagePercent > 70) {
        usageFillClass = 'warning';
    }
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>仓库详情: ${repo.name}</h3>
                <button class="close-btn">&times;</button>
            </div>
            <div class="modal-body">
                <div class="repo-details">
                    <div class="detail-item">
                        <strong>仓库ID:</strong> ${repo.id}
                    </div>
                    <div class="detail-item">
                        <strong>状态:</strong> 
                        <span class="repo-status ${statusClass}">
                            ${statusText}
                        </span>
                    </div>
                    <div class="detail-item">
                        <strong>文件数量:</strong> ${repo.file_count || 0}
                    </div>
                    <div class="detail-item">
                        <strong>使用空间:</strong> ${usedSizeMB} MB / ${maxSizeMB} MB (${usagePercent}%)
                    </div>
                    <div class="detail-item">
                        <strong>创建时间:</strong> ${formatDate(repo.created_at)}
                    </div>
                    <div class="detail-item">
                        <strong>最后更新:</strong> ${formatDate(repo.updated_at)}
                    </div>
                    <div class="detail-item">
                        <strong>GitHub仓库:</strong> 
                        <a href="${repo.html_url}" target="_blank">${repo.full_name || repo.name}</a>
                    </div>
                </div>
                
                <div class="repo-usage-bar">
                    <div class="usage-fill ${usageFillClass}" style="width: ${usagePercent}%"></div>
                    <span class="usage-text">${usagePercent}%</span>
                </div>
                
                <div class="repo-actions">
                    ${repo.status !== 'active' ? `
                        <button class="btn btn-primary" id="activateRepoBtn">
                            <i class="fas fa-check-circle"></i> 设为活跃仓库
                        </button>
                    ` : ''}
                </div>
            </div>
                </div>
            `;
    
    document.body.appendChild(modal);
    
    // 添加事件监听
    const closeBtn = modal.querySelector('.close-btn');
    closeBtn.addEventListener('click', () => {
        document.body.removeChild(modal);
    });
    
    const activateRepoBtn = modal.querySelector('#activateRepoBtn');
    if (activateRepoBtn) {
        activateRepoBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
            activateRepository(repo.id);
        });
    }
}

// 初始化批量操作按钮
function initBatchOperations() {
    // 创建批量操作工具栏
    const batchOpsToolbar = document.createElement('div');
    batchOpsToolbar.className = 'batch-operations';
    batchOpsToolbar.innerHTML = `
        <div class="select-all-container">
            <input type="checkbox" id="selectAllImages">
            <label for="selectAllImages">全选</label>
        </div>
        <div class="batch-buttons">
            <div class="dropdown batch-copy-dropdown">
                <button id="batchCopyBtn" class="btn-primary dropdown-toggle" disabled>
                    <i class="fas fa-copy"></i> 批量复制
                </button>
            </div>
            <button id="batchDeleteBtn" class="btn-danger" disabled>
                <i class="fas fa-trash"></i> 批量删除
                </button>
        </div>
    `;
    
    // 将工具栏插入到图片网格上方
    const imageSection = document.querySelector('.image-section');
    if (imageSection) {
        imageSection.insertBefore(batchOpsToolbar, imageSection.firstChild);
    } else {
        // 如果找不到.image-section，则插入到图片网格上方
        if (imageGrid && imageGrid.parentNode) {
            imageGrid.parentNode.insertBefore(batchOpsToolbar, imageGrid);
        } else {
            console.warn('无法找到合适的位置插入批量操作工具栏');
            return; // 提前退出，避免后续出错
        }
    }
    
    // 获取引用
    selectAllCheckbox = document.getElementById('selectAllImages');
    batchDeleteButton = document.getElementById('batchDeleteBtn');
    const batchCopyButton = document.getElementById('batchCopyBtn');
    const batchCopyDropdown = document.querySelector('.batch-copy-dropdown');
    
    if (selectAllCheckbox) {
        // 添加全选事件监听
        selectAllCheckbox.addEventListener('change', function() {
            const checkboxes = document.querySelectorAll('.image-checkbox');
            checkboxes.forEach(checkbox => {
                checkbox.checked = selectAllCheckbox.checked;
            });
            
            updateBatchButtonsState();
        });
    } else {
        console.warn('未找到全选复选框元素');
    }
    
    if (batchDeleteButton) {
        // 添加批量删除事件监听
        batchDeleteButton.addEventListener('click', batchDeleteImages);
    } else {
        console.warn('未找到批量删除按钮元素');
    }
    
    // 批量复制下拉菜单
    batchCopyButton.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        
        // 如果当前按钮已经激活，则关闭菜单并返回
        if (batchCopyButton.classList.contains('active')) {
            closeAllDropdowns();
                return;
            }
            
        // 先关闭所有已打开的下拉菜单
        closeAllDropdowns();
        
        // 获取选中的图片
        const checkedBoxes = document.querySelectorAll('.image-checkbox:checked');
        const selectedImages = [];
        
        // 获取所有选中图片信息
        checkedBoxes.forEach(checkbox => {
            const card = checkbox.closest('.image-card');
            const id = checkbox.dataset.id;
            
            // 查找图片URL和文件名
            const imageElement = card.querySelector('.image-preview img');
            const url = imageElement ? imageElement.getAttribute('data-original-url') : '';
            const filename = card.querySelector('.image-filename').getAttribute('title');
            
            selectedImages.push({ id, url, filename });
        });
        
        if (selectedImages.length === 0) {
            showNotification('请选择要复制的图片', 'warning');
            return;
        }
        
        // 标记当前按钮为激活状态
        batchCopyButton.classList.add('active');
        
        // 创建下拉菜单项
        const menuItems = [
            { label: '复制URL', format: 'url' },
            { label: '复制Markdown', format: 'markdown' },
            { label: '复制BBCode', format: 'bbcode' },
            { label: '复制HTML', format: 'html' }
        ];
        
        // 使用全局下拉菜单
        showGlobalDropdown(menuItems, batchCopyButton, (format) => {
            // 根据格式生成复制内容，每个链接一行
            let copyText = '';
            selectedImages.forEach(img => {
                // 对URL进行处理，编码特殊字符以确保Markdown能正确解析
                const encodedUrl = img.url
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
                
                switch(format) {
                    case 'url':
                        copyText += `${img.url}\n`;
                        break;
                    case 'markdown':
                        copyText += `![${img.filename}](${encodedUrl})\n`;
                        break;
                    case 'bbcode':
                        copyText += `[img]${img.url}[/img]\n`;
                        break;
                    case 'html':
                        copyText += `<img src="${img.url}" alt="${img.filename}">\n`;
                        break;
                }
            });
            
            // 移除最后一个换行符
            copyText = copyText.trim();
            
            navigator.clipboard.writeText(copyText)
                .then(() => {
                    showNotification(`已复制${selectedImages.length}张图片的${format.toUpperCase()}格式链接`, 'success');
                    closeAllDropdowns();
                })
                .catch(err => {
                    showNotification('复制失败: ' + err, 'error');
                });
        });
    });
}

// 更新批量操作按钮状态
function updateBatchButtonsState() {
    const checkedBoxes = document.querySelectorAll('.image-checkbox:checked');
    const hasCheckedItems = checkedBoxes.length > 0;
    
    if (batchDeleteButton) {
        batchDeleteButton.disabled = !hasCheckedItems;
    }
    
    const batchCopyButton = document.getElementById('batchCopyBtn');
    if (batchCopyButton) {
        batchCopyButton.disabled = !hasCheckedItems;
    }
}

// 点击页面其他地方关闭所有下拉菜单
document.addEventListener('click', function(e) {
    // 如果点击的不是下拉菜单触发器，则关闭所有下拉菜单
    if (!e.target.closest('.dropdown-toggle')) {
        closeAllDropdowns();
    }
});

// 添加一个新函数，用于单独更新控制面板上的统计数据
async function updateDashboardStats() {
    try {
        // 获取统计数据
        const stats = await safeApiCall('/api/stats/summary');
        
        if (stats.error) {
            console.error('更新统计数据失败:', stats.error);
            return;
        }
        
        // 更新统计卡片
        const totalImagesElement = document.getElementById('totalImages');
        const todayUploadsElement = document.getElementById('todayUploads');
        const totalSizeElement = document.getElementById('totalSize');
        
        if (totalImagesElement) {
            totalImagesElement.textContent = stats.total_images || '0';
        }
        
        if (todayUploadsElement) {
            todayUploadsElement.textContent = stats.today_uploads || '0';
        }
        
        if (totalSizeElement) {
            const sizeInBytes = stats.total_size || 0;
            totalSizeElement.textContent = formatFileSize(sizeInBytes, 2);
        }
        } catch (error) {
        console.error('更新控制面板统计数据失败:', error);
    }
}

// 修改单个图片删除函数
async function deleteImage(id) {
    try {
        const response = await safeApiCall(`/api/images/${id}`, {
            method: 'DELETE'
        });
        
        // 修复响应判断逻辑
        if (!response.error) {  // 改为判断是否有error字段，而不是判断ok属性
            // 从DOM中移除对应的图片卡片
            const card = document.querySelector(`.image-card[data-id="${id}"]`);
            if (card) {
                card.remove();
            }
            
            showNotification('图片已成功删除', 'success');
            
            // 更新仪表盘统计数据
            await updateDashboardStats();
            
            // 检查并加载更多图片
            await checkAndLoadMoreImages();
        } else {
            console.error('删除图片失败:', response.error);
            showNotification(`删除图片失败: ${response.error || '未知错误'}`, 'error');
        }
    } catch (error) {
        console.error('删除图片时出错:', error);
        showNotification('删除图片失败: ' + error.message, 'error');
    }
}

// 批量删除图片
async function batchDeleteImages() {
    const checkedBoxes = document.querySelectorAll('.image-checkbox:checked');
    const imageIds = Array.from(checkedBoxes).map(checkbox => checkbox.dataset.id);
    
    if (imageIds.length === 0) {
        showNotification('请选择要删除的图片', 'warning');
        return;
    }
    
    if (confirm(`确定要删除选中的 ${imageIds.length} 张图片吗？此操作不可逆。`)) {
        try {
            batchDeleteButton.disabled = true;
            batchDeleteButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 删除中...';
            
            console.log('准备批量删除图片:', imageIds);
            
            // 图片ID分批，每批6张
            const batchSize = 6;
            const batches = [];
            for (let i = 0; i < imageIds.length; i += batchSize) {
                batches.push(imageIds.slice(i, i + batchSize));
            }
            
            console.log(`将${imageIds.length}张图片分成${batches.length}批处理`);
            
            // 存储所有批次的结果
            const allResults = {
                success: [],
                failed: []
            };
            
            // 逐批处理
            for (let i = 0; i < batches.length; i++) {
                const batchIds = batches[i];
                const isLastBatch = i === batches.length - 1; // 判断是否为最后一批
                
                // 显示当前处理批次进度
                showNotification(`正在处理第${i + 1}/${batches.length}批，共${batchIds.length}张图片...`, 'info', 2000);
                
                console.log(`处理第${i + 1}/${batches.length}批，ID:`, batchIds);
                
                // 发送当前批次请求，除了最后一批，其他都跳过部署
                const response = await safeApiCall('/api/images/batch-delete', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ 
                        imageIds: batchIds,
                        skipDeploy: !isLastBatch // 除了最后一批都跳过部署
                    }),
                    timeout: 30000 // 30秒超时，对于6张图片应该足够
                });
                
                console.log(`第${i + 1}批响应:`, response);
                
                if (!response.error && response.results) {
                    // 汇总成功和失败结果
                    if (response.results.success && response.results.success.length > 0) {
                        allResults.success.push(...response.results.success);
                        
                        // 从DOM中移除成功删除的图片卡片
                        response.results.success.forEach(id => {
                            const card = document.querySelector(`.image-card[data-id="${id}"]`);
                            if (card) {
                                card.remove();
                            }
                        });
                    }
                    
                    if (response.results.failed && response.results.failed.length > 0) {
                        allResults.failed.push(...response.results.failed);
                    }
                } else {
                    // 如果整批失败，将所有ID添加到失败列表
                    allResults.failed.push(...batchIds.map(id => ({
                        id,
                        error: response.error || '未知错误'
                    })));
                    console.error(`第${i + 1}批处理失败:`, response.error);
                }
                
                // 小间隔，避免请求过于频繁
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            // 批处理全部完成后的操作
            const successCount = allResults.success.length;
            const failCount = allResults.failed.length;
            
            // 更新仪表盘统计数据
            await updateDashboardStats();
            
            // 重置全选状态
            if (selectAllCheckbox) {
                selectAllCheckbox.checked = false;
            }
            
            // 如果当前页图片不足，尝试加载更多图片填充
            await checkAndLoadMoreImages();
            
            // 显示最终结果
            let message = '';
            if (successCount > 0) {
                message += `成功删除 ${successCount} 张图片。`;
            }
            if (failCount > 0) {
                message += `${failCount} 张图片删除失败。`;
            }
            
            showNotification(message, successCount > 0 ? 'success' : 'error');
            console.log('批量删除最终结果:', allResults);

            // 重新加载仓库列表以更新文件数和大小
            await loadRepositories();
            
        } catch (error) {
            console.error('批量删除图片失败:', error);
            showNotification('批量删除操作失败: ' + error.message, 'error');
        } finally {
            batchDeleteButton.disabled = false;
            batchDeleteButton.innerHTML = '<i class="fas fa-trash"></i> 批量删除';
            updateBatchButtonsState();
        }
    }
}

// 检查当前页图片数量并加载更多图片
async function checkAndLoadMoreImages() {
    const currentImageCards = document.querySelectorAll('.image-card');
    const currentCount = currentImageCards.length;
    
    // 如果当前页面没有图片，但可能还有更多页面
    if (currentCount === 0) {
        // 先检查是否有更多页面
        if (currentPage < totalPages) {
            // 当前页已经空了，加载下一页
            loadImages(currentPage);
        } else if (currentPage > 1) {
            // 如果是最后一页且为空，加载前一页
            loadImages(currentPage - 1);
        } else {
            // 如果只有一页且为空，显示无图片提示
            imageGrid.innerHTML = '<div class="no-images">暂无图片</div>';
            const paginationContainer = document.getElementById('pagination');
            if (paginationContainer) {
                paginationContainer.innerHTML = '';
            }
        }
        return;
    }
    
    // 如果当前页图片数量少于一页的容量（通常是36张），且还有更多页面
    if (currentCount < 36 && currentPage < totalPages) {
        // 构建加载下一页图片的请求
        const searchInput = document.getElementById('searchInput');
        const search = searchInput ? searchInput.value.trim() : '';
        
        let url = `/api/images?page=${currentPage + 1}&limit=${36 - currentCount}`;
        if (search) {
            url += `&search=${encodeURIComponent(search)}`;
        }
        if (currentSort) {
            url += `&sort=${currentSort}`;
        }
        
        // 加载下一页的部分图片
        const data = await safeApiCall(url);
        
        if (!data.error && data.images && data.images.length > 0) {
            // 添加新图片到当前页面
            data.images.forEach(image => {
                const normalizedImage = {
                    id: image.id,
                    filename: image.name || image.filename,
                    url: image.url,
                    thumbnail_url: image.thumbnail_url || image.url,
                    size: image.size,
                    type: image.type,
                    views: image.views || 0,
                    created_at: image.upload_time || image.created_at,
                    sha: image.sha || ''
                };
                
                const card = createImageCard(normalizedImage);
                imageGrid.appendChild(card);
            });
            
            // 更新分页信息，当前页面的总数可能减少了
            if (data.total_pages < totalPages) {
                totalPages = data.total_pages;
                setupPagination(data.total, currentPage, totalPages);
            }
        }
    }
}

// 显示通知消息
function showNotification(message, type = 'info', duration = 5000) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    
    // 处理复杂的错误对象
    if (message instanceof Error) {
        let errorContent = `<div class="notification-title">${message.message}</div>`;
        if (message.details) {
            errorContent += `<div class="notification-details">${message.details}</div>`;
        }
        notification.innerHTML = errorContent;
    } else {
        notification.textContent = message;
    }
    
    // 添加关闭按钮
    const closeButton = document.createElement('span');
    closeButton.className = 'notification-close';
    closeButton.innerHTML = '&times;';
    closeButton.onclick = function(e) {
        e.stopPropagation();
        notification.classList.add('fade-out');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    };
    notification.appendChild(closeButton);
    
    // 添加到页面
    document.body.appendChild(notification);
    
    // 点击整个通知也可以关闭
    notification.onclick = function() {
        notification.classList.add('fade-out');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    };
    
    // 自动关闭
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, duration);
}

// 设置分页
function setupPagination(total, currentPage, totalPages) {
    const paginationContainer = document.getElementById('pagination');
    if (!paginationContainer) return;
    
    paginationContainer.innerHTML = '';
    
    if (totalPages <= 1) return;
    
    const createPageButton = (page, text, isActive = false, isDisabled = false) => {
        const button = document.createElement('button');
        button.className = `page-btn ${isActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`;
        button.textContent = text;
        
        if (!isDisabled) {
            button.addEventListener('click', () => {
                loadImages(page, document.getElementById('searchInput')?.value || '');
            });
        }
        
        return button;
    };
    
    // 上一页按钮
    paginationContainer.appendChild(
        createPageButton(currentPage - 1, '上一页', false, currentPage === 1)
    );
    
    // 页码按钮
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
        paginationContainer.appendChild(
            createPageButton(i, i.toString(), i === currentPage)
        );
    }
    
    // 下一页按钮
    paginationContainer.appendChild(
        createPageButton(currentPage + 1, '下一页', false, currentPage === totalPages)
    );
}

async function loadImages(page = 1, search = '') {
    if (!imageGrid) {
        console.error('图片网格元素不存在');
        return;
    }
    
    try {
        imageGrid.innerHTML = '<div class="loading-spinner"></div>';
        
        // 获取当前的搜索关键词
        const searchInput = document.getElementById('searchInput');
        search = search || (searchInput ? searchInput.value.trim() : '');
        
        // 构建API URL
        let url = `/api/images?page=${page}&limit=36`;
        if (search) {
            // 确保正确编码搜索参数
            url += `&search=${encodeURIComponent(search)}`;
            console.log(`执行搜索: "${search}"`);
        }
        
        if (currentSort) {
            url += `&sort=${currentSort}`;
        }
        
        console.log('加载图片，URL:', url);
        const data = await safeApiCall(url);
        
        if (data.error) {
            throw new Error(`Failed to load images: ${data.error}`);
        }
        
        // 更新全局分页变量
        currentPage = data.page || page;
        totalPages = data.total_pages || Math.ceil(data.total / 36);
        
        // 清除当前显示
        imageGrid.innerHTML = '';
        
        if (data.images && data.images.length > 0) {
            // 显示图片
            data.images.forEach(image => {
                // 修复字段名称不匹配的问题并添加调试信息
                console.log('服务器返回的图片数据:', image);
                
                const normalizedImage = {
                    id: image.id,
                    filename: image.name || image.filename,
                    url: image.url,
                    thumbnail_url: image.thumbnail_url || image.url,
                    size: image.size,
                    type: image.type,
                    views: image.views || 0,
                    created_at: image.upload_time || image.created_at,
                    sha: image.sha || ''
                };
                
                console.log('规范化后的图片数据:', normalizedImage);
                
                const card = createImageCard(normalizedImage);
                imageGrid.appendChild(card);
            });
            
            // 更新选中状态
            updateBatchButtonsState();
            
            // 设置分页
            setupPagination(data.total, currentPage, totalPages);
        } else {
            // 没有图片时显示提示
            if (search) {
                imageGrid.innerHTML = `<div class="no-images">没有找到匹配"${search}"的图片</div>`;
            } else {
                imageGrid.innerHTML = '<div class="no-images">暂无图片</div>';
            }
            const paginationContainer = document.getElementById('pagination');
            if (paginationContainer) {
                paginationContainer.innerHTML = '';
            }
        }
    } catch (error) {
        console.error('Error loading images:', error);
        imageGrid.innerHTML = `<div class="error-message">加载图片失败: ${error.message}</div>`;
    }
}

function createImageCard(image) {
    const card = document.createElement('div');
    card.className = 'image-card';
    card.dataset.id = image.id;
    
    // 截断文件名，超过18个字符显示...
    const displayName = image.filename.length > 18 
        ? image.filename.substring(0, 18) + '...' 
        : image.filename;
    
    // 格式化文件大小，保留2位小数
    const formattedSize = formatFileSize(image.size, 2);
    
    // 为缩略图添加哈希参数，防止缓存问题
    // 确保使用完整URL并添加强制缓存破坏参数
    const thumbnailUrl = `${image.url}?hash=${image.sha || Date.now()}&t=${Date.now()}`;
    console.log('生成缩略图URL:', thumbnailUrl);
    
    card.innerHTML = `
        <div class="image-preview">
            <img src="${thumbnailUrl}" alt="${image.filename}" loading="lazy" data-original-url="${image.url}">
            <div class="image-error-overlay" style="display:none">
                <button class="reload-image-btn" title="重新加载图片">
                    <i class="fas fa-sync-alt"></i>
                </button>
            </div>
        </div>
        <div class="image-info">
            <div class="filename-container">
                <input type="checkbox" class="image-checkbox" data-id="${image.id}">
                <span class="image-filename" title="${image.filename}">${displayName}</span>
            </div>
            <div class="image-meta">
                <span class="upload-date">${formatDate(image.created_at)}</span>
                <span class="file-size">${formattedSize}</span>
            </div>
        </div>
        <div class="image-actions">
            <div class="dropdown">
                <button class="btn-copy dropdown-toggle" title="复制链接">
                    <i class="fas fa-copy"></i> 复制
                </button>
            </div>
            <button class="btn-delete" data-id="${image.id}" title="删除图片">
                <i class="fas fa-trash"></i> 删除
                    </button>
                </div>
            `;
            
    // 文件名提示工具
    const filenameSpan = card.querySelector('.image-filename');
    
    filenameSpan.addEventListener('mouseenter', function() {
        if (image.filename.length > 18) {
            // 使用浏览器原生的title属性来显示完整文件名
            // 而不是创建额外的tooltip元素
        }
    });
    
    // 处理图片加载错误
    const imgElement = card.querySelector('.image-preview img');
    const errorOverlay = card.querySelector('.image-error-overlay');
    
    // 图片加载失败时显示重新加载按钮
    imgElement.addEventListener('error', function() {
        console.error('图片加载失败:', thumbnailUrl);
        errorOverlay.style.display = 'flex';
        imgElement.style.display = 'none';
    });
    
    // 重新加载按钮点击事件
    const reloadBtn = card.querySelector('.reload-image-btn');
    reloadBtn.addEventListener('click', function(e) {
        e.stopPropagation(); // 阻止事件冒泡，避免触发预览
        
        // 生成新的缓存破坏URL
        const newUrl = `${image.url}?hash=${image.sha}&t=${Date.now()}&nocache=true`;
        console.log('重新加载图片:', newUrl);
        
        // 重置图片
        imgElement.style.display = '';
        errorOverlay.style.display = 'none';
        imgElement.src = newUrl;
    });
    
    // 获取图片预览容器，下面添加点击和右键菜单功能
    const imagePreview = card.querySelector('.image-preview');
    
    // 添加右键菜单功能
    imagePreview.addEventListener('contextmenu', function(e) {
        e.preventDefault(); // 阻止默认右键菜单
        
        // 创建上下文菜单
        const contextMenu = document.createElement('div');
        contextMenu.className = 'image-context-menu';
        contextMenu.innerHTML = `
            <div class="context-menu-item" data-action="open">
                <i class="fas fa-external-link-alt"></i> 在新窗口打开图片
            </div>
            <div class="context-menu-item" data-action="copy">
                <i class="fas fa-copy"></i> 复制图片链接
            </div>
        `;
        
        // 设置菜单位置
        contextMenu.style.position = 'fixed';
        contextMenu.style.top = `${e.clientY}px`;
        contextMenu.style.left = `${e.clientX}px`;
        contextMenu.style.zIndex = '9999';
        document.body.appendChild(contextMenu);
        
        // 点击菜单项
        contextMenu.querySelectorAll('.context-menu-item').forEach(item => {
            item.addEventListener('click', function() {
                const action = this.dataset.action;
                const originalURL = imgElement.getAttribute('data-original-url');
                
                if (action === 'open') {
                    // 在新窗口打开原始URL
                    window.open(originalURL, '_blank');
                } else if (action === 'copy') {
                    // 复制原始URL
                    navigator.clipboard.writeText(originalURL)
                        .then(() => showNotification('已复制图片链接', 'success'))
                        .catch(err => showNotification('复制失败: ' + err, 'error'));
                }
                
                // 移除菜单
                contextMenu.remove();
            });
        });
        
        // 点击其他地方关闭菜单
        const closeMenu = function(e) {
            if (!contextMenu.contains(e.target)) {
                contextMenu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        
        // 使用setTimeout确保当前右键点击不会立即关闭菜单
        setTimeout(() => {
            document.addEventListener('click', closeMenu);
        }, 0);
    });
    
    // 添加点击预览大图功能
    imagePreview.addEventListener('click', function() {
        const fullsizePreview = document.querySelector('.fullsize-preview');
        const previewImg = fullsizePreview.querySelector('img');
        const infoPanel = fullsizePreview.querySelector('.image-info-panel');
        
        // 重置预览状态
        previewImg.style.transform = '';
        
        // 设置原图URL
        previewImg.src = image.url;
        
        // 设置图片信息
        infoPanel.innerHTML = `
            <div>文件名: ${image.filename}</div>
            <div>上传时间: ${formatDate(image.created_at)}</div>
            <div>尺寸: <span id="img-dimensions">加载中...</span></div>
        `;
        
        // 显示预览
        fullsizePreview.classList.add('active');
        
        // 图片加载完成后获取尺寸并可能调整初始显示大小
        previewImg.onload = function() {
            document.getElementById('img-dimensions').textContent = 
                `${previewImg.naturalWidth} × ${previewImg.naturalHeight}`;
            
            // 检查图片尺寸，对于较大图片可以适当默认放大一些
            if (previewImg.naturalWidth > window.innerWidth * 1.5 || 
                previewImg.naturalHeight > window.innerHeight * 1.5) {
                // 大图不做特殊处理，使用默认缩放
            } else {
                // 小图可以适当放大初始显示
                currentZoom = 1.2;
                previewImg.style.transform = `scale(${currentZoom})`;
            }
        };
    });
    
    // 复制按钮下拉菜单
    const dropdown = card.querySelector('.dropdown');
    const dropdownToggle = dropdown.querySelector('.dropdown-toggle');
    
    // 点击按钮显示下拉菜单
    dropdownToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        
        // 如果当前按钮已经激活，则关闭菜单并返回
        if (dropdownToggle.classList.contains('active')) {
            closeAllDropdowns();
            return;
        }
        
        // 先关闭所有已打开的下拉菜单
        closeAllDropdowns();
        
        // 标记当前按钮为激活状态
        dropdownToggle.classList.add('active');
        
        // 获取下拉菜单内容
        const menuItems = [];
        const formats = [
            { key: 'url', label: 'URL', url: image.url, filename: '' },
            { key: 'markdown', label: 'Markdown', url: image.url, filename: image.filename },
            { key: 'bbcode', label: 'BBCode', url: image.url, filename: '' },
            { key: 'html', label: 'HTML', url: image.url, filename: image.filename }
        ];
        
        formats.forEach(format => {
            menuItems.push({
                label: format.label,
                format: format.key,
                url: format.url,
                filename: format.filename
            });
        });
        
        // 使用全局下拉菜单
        showGlobalDropdown(menuItems, dropdownToggle, (format, url, filename) => {
            let copyText = '';
            switch(format) {
                case 'url':
                    copyText = url;
                    break;
                case 'markdown':
                    // 对URL进行处理，编码特殊字符以确保Markdown能正确解析
                    const encodedUrl = url
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
                    copyText = `![${filename}](${encodedUrl})`;
                    break;
                case 'bbcode':
                    copyText = `[img]${url}[/img]`;
                    break;
                case 'html':
                    copyText = `<img src="${url}" alt="${filename}">`;
                    break;
            }
            
            navigator.clipboard.writeText(copyText)
                .then(() => {
                    showNotification(`已复制${format.toUpperCase()}格式链接`, 'success');
                    closeAllDropdowns();
                })
                .catch(err => {
                    showNotification('复制失败: ' + err, 'error');
                });
        });
    });
    
    // 删除按钮
    card.querySelector('.btn-delete').addEventListener('click', function(e) {
        e.stopPropagation();
        const imageId = this.dataset.id;
        if (confirm('确定要删除这张图片吗？此操作不可逆。')) {
            deleteImage(imageId);
        }
    });
    
    return card;
}

// 工具函数
function formatDate(timestamp) {
    if (!timestamp) {
        return '未知日期';
    }
    
    try {
        // 创建日期对象
        const date = new Date(timestamp);
        
        // 检查是否为有效日期
        if (isNaN(date.getTime())) {
            return '无效日期';
        }
        
        // 使用toLocaleString格式化日期，采用中文格式和北京时间
        return date.toLocaleString('zh-CN', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'Asia/Shanghai' // 使用北京时间时区
        });
    } catch (error) {
        console.error('日期格式化错误:', error, timestamp);
        return '日期错误';
    }
}

function formatFileSize(bytes, decimals = 2) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 3000);
}

// 新增全局函数用于关闭所有下拉菜单
function closeAllDropdowns() {
    // 移除全局下拉菜单
    const globalContainer = document.querySelector('.global-dropdown-container');
    if (globalContainer) {
        globalContainer.innerHTML = '';
    }
    
    // 重置所有下拉菜单触发器的激活状态
    document.querySelectorAll('.dropdown-toggle').forEach(toggle => {
        toggle.classList.remove('active');
    });
}

// 新增函数：显示全局下拉菜单
function showGlobalDropdown(items, triggerElement, onItemClick) {
    const globalContainer = document.querySelector('.global-dropdown-container');
    if (!globalContainer) return;
    
    // 创建下拉菜单
    const menu = document.createElement('div');
    menu.className = 'dropdown-menu global-dropdown-menu show';
    
    // 添加菜单项
    items.forEach(item => {
        const menuItem = document.createElement('a');
        menuItem.href = "#";
        menuItem.className = 'dropdown-item';
        menuItem.textContent = item.label;
        
        menuItem.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (onItemClick) {
                onItemClick(item);
            }
        });
        
        menu.appendChild(menuItem);
    });
    
    // 将菜单添加到全局容器
    globalContainer.appendChild(menu);
    
    // 定位菜单
    positionDropdownMenu(menu, triggerElement);
}

// 新增函数：定位下拉菜单
function positionDropdownMenu(menu, triggerElement) {
    // 获取触发元素的位置信息
    const triggerRect = triggerElement.getBoundingClientRect();
    const isMobile = window.innerWidth <= 768;
    
    // 设置菜单初始位置 - 相对于视口
    menu.style.position = 'fixed'; // 使用fixed而不是absolute，避免滚动问题
    
    if (isMobile) {
        // 移动设备上，在点击位置附近居中显示
        const menuWidth = 200; // 预估菜单宽度
        let leftPosition = triggerRect.left + (triggerRect.width / 2) - (menuWidth / 2);
        
        // 确保不会超出屏幕边缘
        leftPosition = Math.max(10, leftPosition);
        leftPosition = Math.min(window.innerWidth - menuWidth - 10, leftPosition);
        
        menu.style.left = leftPosition + 'px';
        
        // 在触发元素上方或下方显示，优先显示在下方
        if (triggerRect.bottom + 200 > window.innerHeight && triggerRect.top > 200) {
            // 如果下方空间不足且上方空间足够，则显示在上方
            menu.style.bottom = (window.innerHeight - triggerRect.top + 10) + 'px';
            menu.style.top = 'auto';
        } else {
            // 否则显示在下方
            menu.style.top = (triggerRect.bottom + 10) + 'px';
            menu.style.bottom = 'auto';
        }
    } else {
        // 桌面设备上，跟随触发元素定位
        menu.style.top = triggerRect.bottom + 'px';
        menu.style.left = triggerRect.left + 'px';
        
        // 确保菜单可见
        setTimeout(() => {
            const menuRect = menu.getBoundingClientRect();
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;
            
            // 检查水平方向 - 确保不超出右边界
            if (menuRect.right > windowWidth) {
                menu.style.left = 'auto';
                menu.style.right = (windowWidth - triggerRect.right) + 'px';
            }
            
            // 检查垂直方向 - 如果下方空间不足，则向上显示
            if (menuRect.bottom > windowHeight && triggerRect.top > menuRect.height) {
                menu.style.top = 'auto';
                menu.style.bottom = (windowHeight - triggerRect.top) + 'px';
            }
        }, 10); // 稍微延长超时确保DOM更新
    }
    }
    
    // 清理上传状态的函数
    function resetUploadState() {
        console.log('重置上传状态');
    const modal = document.getElementById('uploadModal');
    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadArea');
    
        // 清除文件输入框值
        if (fileInput) fileInput.value = '';
        
        // 重新显示上传区域
        if (uploadArea) uploadArea.style.display = 'block';
        
        // 清除文件列表和确认按钮
    if (modal) {
        const modalBody = modal.querySelector('.modal-body');
        if (modalBody) {
            const fileList = modalBody.querySelector('.file-list');
            const confirmBtn = modalBody.querySelector('.confirm-upload-btn');
            
            if (fileList) fileList.remove();
            if (confirmBtn) confirmBtn.remove();
        }
        }
        
        // 隐藏进度条
        const uploadProgress = document.querySelector('.upload-progress');
        if (uploadProgress) uploadProgress.style.display = 'none';
}

// 初始化上传模态框
function initUploadModal() {
    console.log('正在初始化上传模态框');
    const modal = document.getElementById('uploadModal');
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const closeBtn = document.querySelector('.close-btn');
    const uploadBtn = document.getElementById('uploadBtn');
    
    if (!modal || !uploadArea || !fileInput || !closeBtn) {
        console.error('上传模态框元素不存在:', {
            modal: !!modal,
            uploadArea: !!uploadArea,
            fileInput: !!fileInput,
            closeBtn: !!closeBtn
        });
        return;
    }
    
    // 关闭模态框
    closeBtn.addEventListener('click', (e) => {
        console.log('点击关闭按钮');
        e.stopPropagation(); // 阻止事件冒泡
        modal.style.display = 'none';
        resetUploadState(); // 重置上传状态
    });
    
    // 点击外部关闭
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            console.log('点击模态框外部，关闭模态框');
            modal.style.display = 'none';
            resetUploadState(); // 重置上传状态
        }
    });
    
    // ESC键关闭模态框
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display === 'block') {
            console.log('按下ESC键，关闭模态框');
            modal.style.display = 'none';
            resetUploadState(); // 重置上传状态
        }
    });
    
    // 打开模态框
    if (uploadBtn) {
        uploadBtn.addEventListener('click', () => {
            console.log('点击上传按钮，显示模态框');
            modal.style.display = 'block';
            // 确保每次打开都是干净的状态
            resetUploadState();
        });
    } else {
        console.error('未找到上传按钮元素');
    }
    
    // 拖放上传
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        handleFiles(files);
    });
    
    // 点击上传区域触发文件选择
    uploadArea.addEventListener('click', (e) => {
        console.log('点击上传区域，触发文件选择');
        e.stopPropagation(); // 阻止事件冒泡，防止干扰关闭按钮
        fileInput.click();
    });
    
    // 文件选择变化
    fileInput.addEventListener('change', (e) => {
        console.log('文件输入变化，处理选择的文件');
        handleFiles(e.target.files);
    });
    
    // 添加粘贴上传功能
    document.addEventListener('paste', (e) => {
        // 只有当上传模态框显示时才处理粘贴事件
        if (modal.style.display === 'block') {
            console.log('检测到粘贴事件');
            const items = e.clipboardData.items;
            const files = [];
            
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    console.log('从剪贴板获取到图片:', file.name);
                    files.push(file);
                }
            }
            
            if (files.length > 0) {
                console.log('处理粘贴的图片文件');
                handleFiles(files);
            } else {
                console.log('剪贴板中没有图片文件');
            }
        } else {
            console.log('上传模态框未显示，不处理粘贴事件');
        }
    });
    
    console.log('上传模态框初始化完成');
}

// 处理上传文件
function handleFiles(files) {
    console.log('处理上传文件:', files.length, '个文件');
    const modal = document.getElementById('uploadModal');
    const modalBody = modal.querySelector('.modal-body');
    
    if (!files || files.length === 0) {
        console.warn('没有选择文件');
        return;
    }
    
    // 清除现有的文件列表和确认按钮
    const existingFileList = modalBody.querySelector('.file-list');
    if (existingFileList) {
        existingFileList.remove();
    }
    
    const existingConfirmBtn = modalBody.querySelector('.confirm-upload-btn');
    if (existingConfirmBtn) {
        existingConfirmBtn.remove();
    }
    
    // 创建文件列表容器
    const fileList = document.createElement('div');
    fileList.className = 'file-list';
    
    // 有效文件计数和数组
    let validFiles = [];
    
    // 显示每个文件的信息
    Array.from(files).forEach(file => {
        // 移除文件类型限制，允许上传任何类型的文件
        validFiles.push(file);
        
        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-info-container';
        fileInfo.innerHTML = `
            <div class="file-info">
                <div class="file-name">${file.name}</div>
                <div class="file-size">${formatFileSize(file.size, 2)}</div>
            </div>
        `;
        fileList.appendChild(fileInfo);
    });
    
    if (validFiles.length === 0) {
        return;
    }
    
    // 添加确认上传按钮
    const confirmUploadBtn = document.createElement('button');
    confirmUploadBtn.className = 'confirm-upload-btn';
    confirmUploadBtn.innerHTML = '<i class="fas fa-upload"></i> 确认上传';
    confirmUploadBtn.addEventListener('click', () => {
        uploadSelectedFiles(validFiles);
    });
    
    // 添加到模态框
    modalBody.appendChild(fileList);
    modalBody.appendChild(confirmUploadBtn);
    
    // 隐藏上传区域，仅显示文件列表和确认按钮
    const uploadArea = document.getElementById('uploadArea');
    if (uploadArea) {
        uploadArea.style.display = 'none';
    }
    
    console.log('已显示文件列表，等待用户确认上传');
}

// 处理上传选定的文件
async function uploadSelectedFiles(files) {
    const uploadArea = document.getElementById('uploadArea');
    const progressBar = document.querySelector('.upload-progress');
    const progressFill = document.querySelector('.progress-fill');
    const progressText = document.querySelector('.progress-text');
    const progressSpeed = document.querySelector('.progress-speed');
    
    if (!uploadArea || !progressBar || !progressFill || !progressText || !progressSpeed) {
        console.error('未找到上传相关元素');
        return;
    }
    
    // 显示进度条
    uploadArea.style.display = 'none';
    progressBar.style.display = 'block';
    
    let totalSize = 0;
    let uploadedBytes = 0;
    let startTime = Date.now();
    
    // 计算总大小
    for (const file of files) {
        totalSize += file.size;
    }
    
    // 更新进度条
    function updateProgress(uploaded, currentFileSize = null) {
        // 计算总体进度
        let overallProgress;
        
        if (currentFileSize) {
            // 分块上传：计算当前文件的进度贡献
            const currentFileProgress = uploaded / currentFileSize;
            const completedContribution = uploadedBytes / totalSize;
            const currentFileContribution = currentFileSize / totalSize;
            overallProgress = completedContribution + (currentFileProgress * currentFileContribution);
        } else {
            // 普通上传：直接计算
        const fileContribution = uploaded / totalSize;
        const completedContribution = uploadedBytes / totalSize;
            overallProgress = completedContribution + fileContribution;
        }
        
        const percent = Math.min(100, Math.round(overallProgress * 100));
        
        progressFill.style.width = `${percent}%`;
        progressText.textContent = `${percent}%`;
        
        // 计算上传速度
        const elapsedTime = (Date.now() - startTime) / 1000; // 转换为秒
        const speed = (uploadedBytes + uploaded) / elapsedTime; // 字节/秒
        progressSpeed.textContent = `${formatSize(speed)}/s`;
    }
    
    try {
        for (const file of files) {
            // 定义文件大小阈值，超过此值使用分块上传
            const CHUNK_SIZE_THRESHOLD = 5 * 1024 * 1024; // 5MB
            
            if (file.size > CHUNK_SIZE_THRESHOLD && window.ChunkedUploader) {
                console.log(`文件大小超过${formatSize(CHUNK_SIZE_THRESHOLD)}，使用分块上传`);
                
                // 创建分块上传实例
                const uploader = new window.ChunkedUploader(file, {
                    onProgress: (progress) => {
                        // 分块上传器返回的是已上传的字节数
                        updateProgress(progress.uploadedSize, file.size);
                    },
                    onComplete: (result) => {
                        console.log('分块上传完成:', result);
                        uploadedBytes += file.size;
                    },
                    onError: (error) => {
                        console.error('分块上传失败:', error);
                        throw error;
                    }
                });
                
                // 开始上传
                await uploader.start();
            } else {
                console.log(`使用普通上传方式`);
                await uploadFileWithProgress(file, (loaded, total) => {
                    updateProgress(loaded);
                });
                uploadedBytes += file.size;
            }
        }
        
        // 上传完成后，更新仓库统计信息
        const repoGrid = document.getElementById('repoGrid');
        if (repoGrid) {
            // 重新加载仓库列表以更新统计信息
            await loadRepositories();
        }
        
        // 更新仪表盘统计信息
        await updateDashboardStats();
        
        // 如果当前在图片管理页面，重新加载图片列表
        const imageGrid = document.getElementById('imageGrid');
        if (imageGrid) {
            await loadImages();
        }
        
        showNotification('文件上传成功', 'success');
        
        // 关闭模态框
        const modal = document.getElementById('uploadModal');
        if (modal) {
            modal.style.display = 'none';
            resetUploadState(); // 重置上传状态
        }
    } catch (error) {
        console.error('上传文件失败:', error);
        showNotification('上传文件失败: ' + error.message, 'error');
    } finally {
        // 重置上传状态
        uploadArea.style.display = 'block';
        progressBar.style.display = 'none';
        progressFill.style.width = '0%';
        progressText.textContent = '0%';
        progressSpeed.textContent = '0 KB/s';
    }
}

// 使用XMLHttpRequest上传文件并显示进度
function uploadFileWithProgress(file, onProgress, skipDeploy = false) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const formData = new FormData();
        formData.append('file', file);
        formData.append('skipDeploy', skipDeploy ? 'true' : 'false');
        
        // 监听上传进度
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable && onProgress) {
                onProgress(e.loaded, e.total);
            }
        });
        
        // 监听请求完成
        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    resolve(response);
                } catch (error) {
                    reject(new Error('解析响应失败: ' + error.message));
                }
            } else {
                let errorMessage = '上传失败';
                let errorDetails = '';
                try {
                    const errorResponse = JSON.parse(xhr.responseText);
                    errorMessage = errorResponse.error || `服务器错误 (${xhr.status})`;
                    errorDetails = errorResponse.details || '';
                    
                    // 处理特定类型的错误
                    if (xhr.status === 409) {
                        // 文件已存在冲突
                        errorMessage = `文件 "${file.name}" 已存在，请重命名后重试`;
                    } else if (xhr.status === 413) {
                        // 文件太大
                        errorMessage = '文件大小超过服务器限制';
                    } else if (xhr.status === 403) {
                        // 权限不足
                        errorMessage = '您没有权限上传文件';
                        if (errorResponse.error && errorResponse.error.includes('游客上传已禁用')) {
                            errorMessage = '游客上传已禁用，请登录后再试';
                        }
                    }
                } catch (e) {
                    errorMessage = `服务器错误 (${xhr.status})`;
                }
                
                const error = new Error(errorMessage);
                error.details = errorDetails;
                error.status = xhr.status;
                reject(error);
            }
        });
        
        // 监听错误
        xhr.addEventListener('error', () => {
            const error = new Error('网络连接错误，请检查您的网络连接');
            error.isNetworkError = true;
            reject(error);
        });
        
        xhr.addEventListener('abort', () => {
            reject(new Error('上传已取消'));
        });
        
        // 发送请求 - 使用查询参数
        xhr.open('POST', '/api/upload?action=upload', true);
        xhr.withCredentials = true; // 包含凭据
        xhr.send(formData);
    });
}

// 使用分块上传处理大文件
function uploadLargeFileWithChunks(file, onProgress, skipDeploy = false) {
    return new Promise((resolve, reject) => {
        try {
            console.log(`初始化分块上传: ${file.name}, 是否跳过部署: ${skipDeploy}`);
            
            // 创建分块上传器
            const uploader = new ChunkedUploader(file, {
                skipDeploy: skipDeploy, // 添加skipDeploy参数
                // 进度更新回调
                onProgress: (progressData) => {
                    if (onProgress) {
                        onProgress(progressData);
                    }
                },
                // 上传完成回调
                onComplete: (result) => {
                    console.log('分块上传完成:', result);
                    resolve(result);
                },
                // 错误处理回调
                onError: (error) => {
                    console.error('分块上传失败:', error);
                    reject(error);
                }
            });
            
            // 开始上传
            uploader.start();
            
        } catch (error) {
            console.error('初始化分块上传失败:', error);
            reject(error);
        }
    });
}

// 确保在页面加载时动态加载分块上传模块
document.addEventListener('DOMContentLoaded', function() {
    // 检查是否已经加载ChunkedUploader
    if (!window.ChunkedUploader) {
        console.log('加载分块上传模块...');
        // 创建脚本标签
        const script = document.createElement('script');
        script.src = '/js/chunked-uploader.js';
        script.async = true;
        script.onload = function() {
            console.log('分块上传模块加载完成');
        };
        script.onerror = function() {
            console.error('无法加载分块上传模块');
        };
        document.head.appendChild(script);
    }
});

// 新增函数，用于在移动端设备上优化初始加载
function optimizeForMobileDevices() {
    // 检测是否为移动设备
    const isMobile = window.innerWidth <= 768;
    
    if (isMobile) {
        console.log('检测到移动设备，应用移动端优化设置');
        
        // 立即设置更小的初始缩放比例，确保一开始就是最小状态
        const metaViewport = document.querySelector('meta[name="viewport"]');
        if (metaViewport) {
            // 根据屏幕方向设置不同的缩放比例
            if (window.orientation === 90 || window.orientation === -90) {
                // 横屏
                metaViewport.setAttribute('content', 'width=device-width, initial-scale=0.55, maximum-scale=1.0, user-scalable=yes');
            } else {
                // 竖屏
                metaViewport.setAttribute('content', 'width=device-width, initial-scale=0.6, maximum-scale=1.0, user-scalable=yes');
            }
        }
        
        // 1. 设置DOM元素适应小屏幕
        document.body.classList.add('mobile-view');
        
        // 2. 加载完后略微延迟滚动到顶部，确保界面显示正确
        setTimeout(() => {
            window.scrollTo(0, 0);
        }, 100);
        
        // 3. 为导航菜单添加触摸友好的间距
        const navItems = document.querySelectorAll('.nav-menu li a');
        navItems.forEach(item => {
            item.style.padding = '14px 16px';
        });
        
        // 4. 监听屏幕方向变化，优化横屏模式
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                // 横屏模式下调整布局
                if (window.orientation === 90 || window.orientation === -90) {
                    console.log('横屏模式，调整布局');
                    document.body.classList.add('landscape');
                    // 横屏模式使用较小的初始缩放
                    const metaViewport = document.querySelector('meta[name="viewport"]');
                    if (metaViewport) {
                        metaViewport.setAttribute('content', 'width=device-width, initial-scale=0.55, maximum-scale=1.0, user-scalable=yes');
                    }
                } else {
                    console.log('竖屏模式，恢复布局');
                    document.body.classList.remove('landscape');
                    // 竖屏模式恢复较大的初始缩放
                    const metaViewport = document.querySelector('meta[name="viewport"]');
                    if (metaViewport) {
                        metaViewport.setAttribute('content', 'width=device-width, initial-scale=0.6, maximum-scale=1.0, user-scalable=yes');
                    }
                }
            }, 300); // 等待一段时间以确保方向改变后的DOM更新
        });
        
        // 5. 减少某些动画效果以提高性能
        document.querySelectorAll('.image-card').forEach(card => {
            card.style.transition = 'transform 0.2s ease';
        });
        
        // 6. 优化触摸响应
        document.addEventListener('touchstart', function(){}, {passive: true});
    }
} 

// 添加调试模式切换按钮
function addDebugModeToggle() {
    // 检查是否是管理页面
    if (!window.location.pathname.includes('/admin/')) {
        return; // 只在管理页面显示
    }
    
    // 创建调试按钮
    const debugBtn = document.createElement('button');
    debugBtn.className = 'debug-toggle-btn';
    debugBtn.innerHTML = `<i class="fas fa-bug"></i> ${isDebugMode ? '关闭调试' : '开启调试'}`;
    debugBtn.title = `${isDebugMode ? '关闭' : '开启'}调试模式 (快捷键: Alt+D)`;
    
    // 设置按钮样式，使其在页面顶部右侧显示
    Object.assign(debugBtn.style, {
        position: 'fixed',
        top: '10px',
        right: '10px',
        zIndex: '1000',
        padding: '6px 12px',
        backgroundColor: isDebugMode ? '#f44336' : '#4CAF50',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '14px',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        opacity: '0.8'
    });
    
    // 添加鼠标悬停效果
    debugBtn.addEventListener('mouseenter', () => {
        debugBtn.style.opacity = '1';
    });
    
    debugBtn.addEventListener('mouseleave', () => {
        debugBtn.style.opacity = '0.8';
    });
    
    // 添加点击事件
    debugBtn.addEventListener('click', () => {
        toggleDebugMode();
        
        // 更新按钮文本和样式
        debugBtn.innerHTML = `<i class="fas fa-bug"></i> ${isDebugMode ? '关闭调试' : '开启调试'}`;
        debugBtn.title = `${isDebugMode ? '关闭' : '开启'}调试模式 (快捷键: Alt+D)`;
        debugBtn.style.backgroundColor = isDebugMode ? '#f44336' : '#4CAF50';
    });
    
    // 添加到页面
    document.body.appendChild(debugBtn);
    
    // 首次加载时，显示一个提示
    if (!localStorage.getItem('debugTipShown')) {
        setTimeout(() => {
            showNotification('提示：您可以使用 Alt+D 快捷键切换调试模式', 'info', 8000);
            localStorage.setItem('debugTipShown', 'true');
        }, 2000);
    }
}

// 在删除图片后更新仓库文件数
async function updateRepositoryFileCount(repoId) {
    try {
        const response = await safeApiCall(`/api/repositories/${repoId}`);
        if (response.error) {
            throw new Error(response.error);
        }
        
        const repo = response.data;
        const repoCard = document.querySelector(`.repo-card[data-repo-id="${repoId}"]`);
        if (repoCard) {
            const fileCountElement = repoCard.querySelector('.repo-info p:first-child');
            if (fileCountElement) {
                fileCountElement.innerHTML = `<i class="fas fa-file"></i> ${repo.file_count || 0} 个文件`;
            }
        }
    } catch (error) {
        console.error('更新仓库文件数失败:', error);
    }
}

// 格式化文件大小显示
function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 显示创建仓库模态框
function showCreateRepositoryModal() {
    const modal = document.getElementById('createRepoModal');
    if (modal) {
        modal.style.display = 'block';
    }
}

// 关闭创建仓库模态框
function closeCreateRepositoryModal() {
    const modal = document.getElementById('createRepoModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// 创建新仓库
async function createRepository() {
    const baseName = document.getElementById('baseRepoName').value.trim();
    if (!baseName) {
        showNotification('请输入基础仓库名称', 'error');
        return;
    }
    
    try {
        const response = await safeApiCall('/api/repositories/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ baseName })
        });
        
        if (response.error) {
            throw new Error(response.error);
        }
        
        showNotification('新仓库创建成功', 'success');
        closeCreateRepositoryModal();
        loadRepositories(); // 重新加载仓库列表
    } catch (error) {
        console.error('创建仓库失败:', error);
        showNotification('创建仓库失败: ' + error.message, 'error');
    }
}

// 同步仓库大小
async function syncRepositorySize(repoId, button) {
    try {
        // 显示加载状态
        const originalContent = button.innerHTML;
        button.disabled = true;
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 同步中...`;
        
        const response = await safeApiCall(`/api/repositories/sync-size/${repoId}`, {
            method: 'POST'
        });
        
        if (response.error) {
            throw new Error(response.error);
        }
        
        // 重新加载仓库列表
        await loadRepositories();
        
        // 显示成功消息
        showNotification('仓库大小同步成功', 'success');
        
    } catch (error) {
        console.error('同步仓库大小失败:', error);
        showNotification(`同步仓库大小失败: ${error.message}`, 'error');
        
        // 恢复按钮状态
        button.disabled = false;
        button.innerHTML = originalContent;
    }
}

// 同步仓库文件数量
async function syncRepositoryFileCount(repoId, button) {
    try {
        // 显示加载状态
        const originalContent = button.innerHTML;
        button.disabled = true;
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 同步中...`;
        
        const response = await safeApiCall(`/api/repositories/sync-file-count/${repoId}`, {
            method: 'POST'
        });
        
        if (response.error) {
            throw new Error(response.error);
        }
        
        // 更新文件计数显示
        const countElement = document.getElementById(`card-file-count-${repoId}`);
        if (countElement) {
            countElement.textContent = response.file_count;
        }
        
        // 显示成功消息
        showNotification(`仓库文件数同步成功，实际文件数: ${response.file_count}`, 'success');
        
    } catch (error) {
        console.error('同步仓库文件数失败:', error);
        showNotification(`同步仓库文件数失败: ${error.message}`, 'error');
    } finally {
        // 恢复按钮状态
        button.disabled = false;
        button.innerHTML = originalContent;
    }
}

// 更新仓库状态
async function updateRepositoryStatus(repoId, status, button) {
    let originalContent = '';
    try {
        // 显示加载状态
        originalContent = button.innerHTML;
        button.disabled = true;
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 更新中...`;
        
        const response = await safeApiCall(`/api/repositories/status/${repoId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status })
        });
        
        if (response.error) {
            throw new Error(response.error);
        }
        
        // 重新加载仓库列表
        await loadRepositories();
        
        // 显示成功消息
        showNotification(`仓库状态已更新为 ${status}`, 'success');
        
    } catch (error) {
        console.error('更新仓库状态失败:', error);
        showNotification(`更新仓库状态失败: ${error.message}`, 'error');
        
        // 恢复按钮状态
        if (originalContent) {
            button.disabled = false;
            button.innerHTML = originalContent;
        }
    }
}

// 显示新建文件夹模态框
function showCreateFolderModal(repoId, repoName, repoOwner) {
    console.log('显示创建文件夹模态框:', { repoId, repoName, repoOwner });
    try {
        // 设置目标仓库信息
        const targetRepoInfo = document.getElementById('targetRepoInfo');
        if (targetRepoInfo) {
            targetRepoInfo.textContent = `${repoOwner}/${repoName}`;
        } else {
            console.error('未找到targetRepoInfo元素');
        }

        // 设置仓库ID到确认按钮
        let confirmBtn = document.getElementById('confirmCreateFolder');
        if (confirmBtn) {
            confirmBtn.dataset.repoId = repoId;
        } else {
            console.error('未找到confirmCreateFolder元素');
        }

        // 清空输入框
        const folderNameInput = document.getElementById('folderName');
        if (folderNameInput) {
            folderNameInput.value = '';
        } else {
            console.error('未找到folderName元素');
        }
        
        // 显示模态框
        const modal = document.getElementById('createFolderModal');
        if (modal) {
            modal.style.display = 'block';
            console.log('模态框已显示');
        } else {
            console.error('未找到createFolderModal元素');
            showNotification('模态框加载失败', 'error');
        return;
    }
    
        // 聚焦到输入框
        setTimeout(() => {
            if (folderNameInput) {
                folderNameInput.focus();
                
                // 添加回车键事件监听器
                const handleEnterKey = (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        console.log('回车键被按下，触发创建文件夹');
                        
                        const folderName = folderNameInput.value.trim();
                        if (!folderName) {
                            showNotification('请输入文件夹名称', 'error');
                            return;
                        }
                        
                        const repoId = confirmBtn.dataset.repoId;
                        console.log('仓库ID:', repoId, '文件夹名称:', folderName);
                        if (repoId) {
                            createFolder(repoId, folderName);
                        } else {
                            showNotification('仓库信息丢失，请重试', 'error');
                        }
                    }
                };
                
                // 移除之前的事件监听器（如果存在）
                folderNameInput.removeEventListener('keydown', handleEnterKey);
                // 添加新的事件监听器
                folderNameInput.addEventListener('keydown', handleEnterKey);
            }
            
            // 确保创建按钮事件正确绑定
            const confirmBtn = document.getElementById('confirmCreateFolder');
            if (confirmBtn && !confirmBtn.hasAttribute('data-event-bound')) {
                console.log('重新绑定创建文件夹按钮事件');
                confirmBtn.setAttribute('data-event-bound', 'true');
                confirmBtn.addEventListener('click', () => {
                    console.log('创建文件夹按钮被点击（重新绑定）');
                    const folderName = document.getElementById('folderName').value.trim();
                    if (!folderName) {
                        showNotification('请输入文件夹名称', 'error');
                        return;
                    }
                    
                    const repoId = confirmBtn.dataset.repoId;
                    console.log('仓库ID:', repoId, '文件夹名称:', folderName);
                    if (repoId) {
                        createFolder(repoId, folderName);
                    } else {
                        showNotification('仓库信息丢失，请重试', 'error');
                    }
                });
            }
        }, 500);
        
    } catch (error) {
        console.error('显示创建文件夹模态框失败:', error);
        showNotification('显示模态框失败: ' + error.message, 'error');
    }
}

// 创建文件夹
async function createFolder(repoId, folderName) {
    try {
        // 显示加载状态
        const confirmBtn = document.getElementById('confirmCreateFolder');
        const originalContent = confirmBtn.innerHTML;
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 创建中...`;
        
        const response = await safeApiCall(`/api/repositories/create-folder/${repoId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ folderName })
        });
        
        if (response.success) {
            // 显示成功消息
            showNotification('文件夹创建成功', 'success');
            
            // 关闭模态框
            closeModal('createFolderModal');
            
            // 刷新文件夹列表
            console.log('刷新文件夹列表');
            await loadFolders();
            
            // 刷新控制面板统计
            console.log('刷新控制面板统计');
            await initDashboard();
        } else {
            throw new Error(response.error || '创建文件夹失败');
        }
    } catch (error) {
        console.error('创建文件夹失败:', error);
        showNotification(`创建文件夹失败: ${error.message}`, 'error');
    } finally {
        // 恢复按钮状态
        const confirmBtn = document.getElementById('confirmCreateFolder');
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '创建';
    }
}

// 关闭模态框
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        console.log('关闭模态框:', modalId);
    }
}

// 初始化仓库管理按钮事件
function initRepositoryButtons() {
    console.log('初始化仓库管理按钮事件');
    
    // 创建新仓库按钮
    const createRepoBtn = document.getElementById('createRepoBtn');
    if (createRepoBtn) {
        createRepoBtn.addEventListener('click', () => {
            const modal = document.getElementById('createRepoModal');
            if (modal) {
                modal.style.display = 'block';
            }
        });
    }
    
    // 确认创建仓库按钮
    const confirmCreateRepo = document.getElementById('confirmCreateRepo');
    if (confirmCreateRepo) {
        confirmCreateRepo.addEventListener('click', createRepository);
    }
    
    
    // 关闭模态框按钮 - 使用事件委托
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('close-btn')) {
            const modal = e.target.closest('.modal');
            if (modal) {
                modal.style.display = 'none';
                console.log('通过关闭按钮关闭模态框');
            }
        }
    });
    
    // 点击模态框外部关闭 - 使用事件委托
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal')) {
            e.target.style.display = 'none';
            console.log('通过点击外部关闭模态框');
        }
    });
    
    // 为所有模态框添加ESC键关闭功能
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const visibleModals = document.querySelectorAll('.modal[style*="block"]');
            visibleModals.forEach(modal => {
                modal.style.display = 'none';
                console.log('通过ESC键关闭模态框');
            });
        }
    });
    
    // 同步所有仓库大小按钮
    const syncAllSizesBtn = document.getElementById('syncAllSizesBtn');
    if (syncAllSizesBtn) {
        syncAllSizesBtn.addEventListener('click', syncAllRepositoriesSizes);
    }
    
    // 同步所有仓库文件数按钮
    const syncAllFileCountsBtn = document.getElementById('syncAllFileCountsBtn');
    if (syncAllFileCountsBtn) {
        syncAllFileCountsBtn.addEventListener('click', syncAllRepositoriesFileCounts);
    }
    
    console.log('仓库管理按钮事件初始化完成');
}

// 在页面加载完成后初始化仓库管理按钮
document.addEventListener('DOMContentLoaded', () => {
    // 延迟初始化，确保DOM完全加载
    setTimeout(() => {
        initRepositoryButtons();
    }, 1000);
});

// 同步所有仓库大小
async function syncAllRepositoriesSizes() {
    try {
        const button = document.getElementById('syncAllSizesBtn');
        const originalContent = button.innerHTML;
        button.disabled = true;
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 同步中...`;
        
        const response = await safeApiCall('/api/repositories/sync-all-sizes', {
            method: 'POST'
        });
        
        if (response.error) {
            throw new Error(response.error);
        }
        
        // 重新加载仓库列表
        await loadRepositories();
        
        // 显示成功消息
        showNotification('所有仓库大小同步成功', 'success');
        
    } catch (error) {
        console.error('同步所有仓库大小失败:', error);
        showNotification(`同步所有仓库大小失败: ${error.message}`, 'error');
    } finally {
        // 恢复按钮状态
        const button = document.getElementById('syncAllSizesBtn');
        button.disabled = false;
        button.innerHTML = `<i class="fas fa-arrow-repeat"></i> 同步所有仓库大小`;
    }
}

// 同步所有仓库文件数
async function syncAllRepositoriesFileCounts() {
    try {
        const button = document.getElementById('syncAllFileCountsBtn');
        const originalContent = button.innerHTML;
        button.disabled = true;
        button.innerHTML = `<i class="fas fa-spinner fa-spin"></i> 同步中...`;
        
        const response = await safeApiCall('/api/repositories/sync-all-file-counts', {
            method: 'POST'
        });
        
        if (response.error) {
            throw new Error(response.error);
        }
        
        // 重新加载仓库列表
        await loadRepositories();
        
        // 显示成功消息
        showNotification('所有仓库文件数同步成功', 'success');
        
    } catch (error) {
        console.error('同步所有仓库文件数失败:', error);
        showNotification(`同步所有仓库文件数失败: ${error.message}`, 'error');
    } finally {
        // 恢复按钮状态
        const button = document.getElementById('syncAllFileCountsBtn');
        button.disabled = false;
        button.innerHTML = `<i class="fas fa-hash"></i> 同步所有文件数`;
    }
}

// 文件夹管理功能
function initFolderManagement() {
    console.log('初始化文件夹管理功能');
    
    // 获取搜索输入框
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        // 添加搜索功能
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                currentSearch = e.target.value.trim();
                currentPage = 1;
                loadFolders();
            }, 500);
        });
        
        // 添加回车搜索
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                currentSearch = e.target.value.trim();
                currentPage = 1;
                loadFolders();
            }
        });
    }
    
    // 获取排序选择框
    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            currentSort = e.target.value;
            currentPage = 1;
            loadFolders();
        });
    }
    
    // 获取上传按钮
    const uploadBtn = document.getElementById('uploadBtn');
    if (uploadBtn) {
        uploadBtn.addEventListener('click', () => {
            showUploadModal();
        });
    }
    
    console.log('文件夹管理功能初始化完成');
}

async function loadFolders(page = 1, search = '') {
    try {
        console.log('开始加载文件夹列表');
        
        // 显示加载状态
        if (imageGrid) {
            imageGrid.innerHTML = `
                <div class="loading-indicator">
                    <i class="fas fa-spinner fa-spin"></i>
                    <span>正在加载文件夹列表...</span>
                </div>
            `;
        }
        
        // 构建API URL
        let url = '/api/folders';
        const params = new URLSearchParams();
        
        if (page > 1) {
            params.append('page', page);
        }
        
        if (search) {
            params.append('search', search);
        }
        
        if (currentSort && currentSort !== 'newest') {
            params.append('sort', currentSort);
        }
        
        if (params.toString()) {
            url += '?' + params.toString();
        }
        
        console.log('发送请求:', url);
        
        const response = await safeApiCall(url, {
            method: 'GET',
            credentials: 'include'
        });
        
        if (!response.success) {
            throw new Error(response.error || '加载文件夹列表失败');
        }
        
        const folders = response.data || [];
        console.log(`加载到 ${folders.length} 个文件夹`);
        
        // 渲染文件夹列表
        renderFolderList(folders);
        
    } catch (error) {
        console.error('加载文件夹列表失败:', error);
        
        if (imageGrid) {
            imageGrid.innerHTML = `
                <div class="error-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>加载文件夹列表失败</p>
                    <button class="btn btn-primary" onclick="loadFolders()">重试</button>
                </div>
            `;
        }
        
        showNotification('加载文件夹列表失败: ' + error.message, 'error');
    }
}

function renderFolderList(folders) {
    if (!imageGrid) {
        console.error('文件夹网格元素不存在');
        return;
    }
    
    if (folders.length === 0) {
        imageGrid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-folder-open"></i>
                <h3>暂无文件夹</h3>
                <p>还没有创建任何文件夹</p>
            </div>
        `;
        return;
    }
    
    const folderCards = folders.map(folder => createFolderCard(folder)).join('');
    imageGrid.innerHTML = folderCards;
}

function createFolderCard(folder) {
    const size = formatFileSize(folder.total_size || 0);
    const fileCount = folder.file_count || 0;
    const createdAt = formatDate(folder.created_at);
    
    return `
        <div class="folder-card" data-folder-id="${folder.id}">
            <div class="folder-header">
                <div class="folder-icon">
                    <i class="fas fa-folder"></i>
                </div>
                <div class="folder-info">
                    <h3 class="folder-name" onclick="openFolder('${folder.id}', '${folder.name}')">
                        ${folder.name}
                    </h3>
                    <p class="folder-path">${folder.path}</p>
                </div>
                <div class="folder-actions">
                    <button class="btn btn-sm btn-outline" onclick="showFolderMenu(event, ${folder.id})">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                </div>
            </div>
            <div class="folder-stats">
                <div class="stat-item">
                    <i class="fas fa-file"></i>
                    <span>${fileCount} 个文件</span>
                </div>
                <div class="stat-item">
                    <i class="fas fa-hdd"></i>
                    <span>${size}</span>
                </div>
                <div class="stat-item">
                    <i class="fas fa-calendar"></i>
                    <span>${createdAt}</span>
                </div>
            </div>
        </div>
    `;
}

function openFolder(folderId, folderName) {
    console.log('打开文件夹:', folderId, folderName);
    
    // 显示加载状态
    showNotification('正在加载文件夹内容...', 'info');
    
    // 调用API获取文件夹内容
    safeApiCall(`/api/folders/${folderId}/files`, {
        method: 'GET',
        credentials: 'include'
    }).then(response => {
        if (response.success) {
            const { folder, files } = response.data;
            displayFolderContents(folder, files);
        } else {
            throw new Error(response.error || '获取文件夹内容失败');
        }
    }).catch(error => {
        console.error('获取文件夹内容失败:', error);
        showNotification(`获取文件夹内容失败: ${error.message}`, 'error');
    });
}

// 显示文件夹内容
function displayFolderContents(folder, files) {
    // 创建模态框显示文件夹内容
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'folderContentsModal';
    
    const filesList = files.length > 0 ? 
        files.map(file => `
            <div class="file-item" data-file-id="${file.id}">
                <div class="file-info">
                    <div class="file-icon">
                        <i class="fas fa-file"></i>
                    </div>
                    <div class="file-details">
                        <div class="file-name">${file.filename}</div>
                        <div class="file-meta">
                            <span class="file-size">${formatFileSize(file.size)}</span>
                            <span class="file-repo">${file.repository_name}</span>
                            <span class="file-date">${formatDate(file.created_at)}</span>
                        </div>
                    </div>
                </div>
                <div class="file-actions">
                    <button class="btn btn-sm btn-outline-primary" onclick="copyFileUrl('${file.github_path}')">
                        <i class="fas fa-copy"></i> 复制链接
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteFile(${file.id})">
                        <i class="fas fa-trash"></i> 删除
                    </button>
                </div>
            </div>
        `).join('') : 
        `<div class="empty-folder">
            <i class="fas fa-folder-open"></i>
            <h3>当前文件夹暂无文件</h3>
            <p>请上传文件到此文件夹</p>
            <button class="btn btn-primary" onclick="uploadToFolder('${folder.name}')">
                <i class="fas fa-upload"></i> 上传文件
            </button>
        </div>`;
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>文件夹: ${folder.name}</h3>
                <button class="close-btn" onclick="closeFolderModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="folder-info-bar">
                    <span class="folder-path">${folder.path}</span>
                    <span class="file-count">${files.length} 个文件</span>
                </div>
                <div class="files-container">
                    ${filesList}
                </div>
            </div>
        </div>
    `;
    
    // 存储文件夹ID用于刷新
    modal.dataset.folderId = folder.id;
    modal.dataset.folderName = folder.name;
    
    document.body.appendChild(modal);
    modal.style.display = 'block';
    
    // 添加关闭事件
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeFolderModal();
        }
    });
    
    // ESC键关闭
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.style.display === 'block') {
            closeFolderModal();
        }
    });
}

// 关闭文件夹模态框
function closeFolderModal() {
    const modal = document.getElementById('folderContentsModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.removeChild(modal);
    }
}

// 复制文件链接
function copyFileUrl(filePath) {
    const url = `${window.location.origin}/${filePath}`;
    navigator.clipboard.writeText(url).then(() => {
        showNotification('文件链接已复制到剪贴板', 'success');
    }).catch(() => {
        showNotification('复制失败，请手动复制', 'error');
    });
}

// 删除文件
async function deleteFile(fileId) {
    if (!confirm('确定要删除这个文件吗？此操作不可恢复。')) {
        return;
    }
    
    try {
        showNotification('正在删除文件...', 'info');
        
        const response = await safeApiCall(`/api/images/${fileId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (response.success) {
            showNotification('文件删除成功', 'success');
            // 刷新当前文件夹内容
            const modal = document.getElementById('folderContentsModal');
            if (modal && modal.dataset.folderId) {
                const folderId = modal.dataset.folderId;
                const folderName = modal.dataset.folderName;
                // 重新加载文件夹内容
                openFolder(folderId, folderName);
            }
        } else {
            throw new Error(response.error || '删除文件失败');
        }
    } catch (error) {
        console.error('删除文件失败:', error);
        showNotification(`删除文件失败: ${error.message}`, 'error');
    }
}

// 上传到指定文件夹（重构：直接选择文件并上传到该文件夹）
function uploadToFolder(folderName) {
    // 创建一个临时的 input[type=file]
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.multiple = true;
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(fileInput.files);
        if (files.length === 0) {
            document.body.removeChild(fileInput);
            return;
        }
        showNotification(`正在上传到文件夹: ${folderName} ...`, 'info');
        try {
            for (const file of files) {
                // 构造 FormData
                const formData = new FormData();
                formData.append('file', file);
                formData.append('folderName', folderName);
                // 可选：可以加仓库ID等参数
                // 发起上传请求
                const response = await fetch('/api/upload', {
                    method: 'POST',
                    body: formData,
                    credentials: 'include'
                });
                const result = await response.json();
                if (result.success) {
                    showNotification(`文件 ${file.name} 上传成功`, 'success');
                } else {
                    showNotification(`文件 ${file.name} 上传失败: ${result.error || '未知错误'}`, 'error');
                }
            }
            // 上传完成后刷新当前文件夹内容
            const modal = document.getElementById('folderContentsModal');
            if (modal && modal.dataset.folderId && modal.dataset.folderName) {
                openFolder(modal.dataset.folderId, modal.dataset.folderName);
            }
        } catch (error) {
            showNotification(`上传失败: ${error.message}`, 'error');
        } finally {
            document.body.removeChild(fileInput);
        }
    });
    // 触发文件选择
    fileInput.click();
}

function showFolderMenu(event, folderId) {
    event.stopPropagation();
    
    const menuItems = [
        {
            label: '查看文件',
            icon: 'fas fa-list',
            action: () => openFolder(folderId)
        },
        {
            label: '重命名',
            icon: 'fas fa-edit',
            action: () => renameFolder(folderId)
        },
        {
            label: '删除',
            icon: 'fas fa-trash',
            action: () => deleteFolder(folderId),
            danger: true
        }
    ];
    
    showGlobalDropdown(menuItems, event.target, (item) => {
        if (item && item.action) {
            item.action();
        }
    });
}

function renameFolder(folderId) {
    // 获取文件夹信息
    safeApiCall('/api/folders', {
        method: 'GET',
        credentials: 'include'
    }).then(response => {
        if (response.success) {
            const folder = response.data.find(f => f.id == folderId);
            if (folder) {
                showRenameFolderModal(folder);
            } else {
                showNotification('文件夹不存在', 'error');
            }
        } else {
            throw new Error(response.error || '获取文件夹信息失败');
        }
    }).catch(error => {
        console.error('获取文件夹信息失败:', error);
        showNotification(`获取文件夹信息失败: ${error.message}`, 'error');
    });
}

// 显示重命名文件夹模态框
function showRenameFolderModal(folder) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'renameFolderModal';
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>重命名文件夹</h3>
                <button class="close-btn" onclick="closeRenameModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label for="newFolderName">新文件夹名称</label>
                    <input type="text" id="newFolderName" class="form-control" value="${folder.name}" placeholder="请输入新的文件夹名称">
                    <small class="form-text">此操作将在所有仓库中同步重命名该文件夹</small>
                </div>
                <div class="warning-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>注意：重命名操作将在所有仓库中同步进行，请确保新名称在所有仓库中都是唯一的。</p>
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeRenameModal()">取消</button>
                <button type="button" class="btn btn-primary" onclick="confirmRenameFolder(${folder.id})">确认重命名</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.style.display = 'block';
    
    // 聚焦到输入框
    setTimeout(() => {
        const input = document.getElementById('newFolderName');
        if (input) {
            input.focus();
            input.select();
        }
    }, 100);
    
    // 添加回车键支持
    const input = document.getElementById('newFolderName');
    if (input) {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                confirmRenameFolder(folder.id);
            }
        });
    }
}

// 确认重命名文件夹
async function confirmRenameFolder(folderId) {
    const newName = document.getElementById('newFolderName').value.trim();
    
    if (!newName) {
        showNotification('请输入新的文件夹名称', 'error');
        return;
    }
    
    try {
        showNotification('正在重命名文件夹...', 'info');
        
        const response = await safeApiCall(`/api/folders/${folderId}/rename`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ newName })
        });
        
        if (response.success) {
            showNotification(response.message, 'success');
            closeRenameModal();
            // 刷新文件夹列表
            await loadFolders();
            // 刷新控制面板统计
            await updateDashboardStats();
        } else {
            throw new Error(response.error || '重命名文件夹失败');
        }
    } catch (error) {
        console.error('重命名文件夹失败:', error);
        showNotification(`重命名文件夹失败: ${error.message}`, 'error');
    }
}

// 关闭重命名模态框
function closeRenameModal() {
    const modal = document.getElementById('renameFolderModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.removeChild(modal);
    }
}

function deleteFolder(folderId) {
    // 获取文件夹信息
    safeApiCall('/api/folders', {
        method: 'GET',
        credentials: 'include'
    }).then(response => {
        if (response.success) {
            const folder = response.data.find(f => f.id == folderId);
            if (folder) {
                showDeleteFolderModal(folder);
            } else {
                showNotification('文件夹不存在', 'error');
            }
        } else {
            throw new Error(response.error || '获取文件夹信息失败');
        }
    }).catch(error => {
        console.error('获取文件夹信息失败:', error);
        showNotification(`获取文件夹信息失败: ${error.message}`, 'error');
    });
}

// 显示删除文件夹模态框
function showDeleteFolderModal(folder) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'deleteFolderModal';
    
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>删除文件夹</h3>
                <button class="close-btn" onclick="closeDeleteModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="danger-message">
                    <i class="fas fa-exclamation-triangle"></i>
                    <h4>警告：此操作不可恢复！</h4>
                    <p>您即将删除文件夹 <strong>"${folder.name}"</strong></p>
                    <p>此操作将：</p>
                    <ul>
                        <li>在所有仓库中删除该文件夹</li>
                        <li>删除文件夹中的所有文件</li>
                        <li>从数据库中删除相关记录</li>
                    </ul>
                    <p>请确认您要执行此操作。</p>
                </div>
                <div class="form-group">
                    <label for="confirmDelete">请输入文件夹名称以确认删除：</label>
                    <input type="text" id="confirmDelete" class="form-control" placeholder="${folder.name}">
                </div>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="closeDeleteModal()">取消</button>
                <button type="button" class="btn btn-danger" onclick="confirmDeleteFolder(${folder.id})" disabled>确认删除</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    modal.style.display = 'block';
    
    // 添加确认输入验证
    const input = document.getElementById('confirmDelete');
    const confirmBtn = modal.querySelector('.btn-danger');
    
    if (input && confirmBtn) {
        input.addEventListener('input', () => {
            confirmBtn.disabled = input.value !== folder.name;
        });
        
        // 添加回车键支持
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && input.value === folder.name) {
                e.preventDefault();
                confirmDeleteFolder(folder.id);
            }
        });
    }
    
    // 聚焦到输入框
    setTimeout(() => {
        if (input) {
            input.focus();
        }
    }, 100);
}

// 确认删除文件夹
async function confirmDeleteFolder(folderId) {
    const confirmText = document.getElementById('confirmDelete').value;
    
    if (confirmText !== document.querySelector('#deleteFolderModal .danger-message strong').textContent.replace(/"/g, '')) {
        showNotification('确认文本不匹配', 'error');
        return;
    }
    
    try {
        showNotification('正在删除文件夹...', 'info');
        
        const response = await safeApiCall(`/api/folders/${folderId}/delete`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (response.success) {
            showNotification(response.message, 'success');
            closeDeleteModal();
            // 刷新文件夹列表
            await loadFolders();
            // 刷新控制面板统计
            await updateDashboardStats();
        } else {
            throw new Error(response.error || '删除文件夹失败');
        }
    } catch (error) {
        console.error('删除文件夹失败:', error);
        showNotification(`删除文件夹失败: ${error.message}`, 'error');
    }
}

// 关闭删除模态框
function closeDeleteModal() {
    const modal = document.getElementById('deleteFolderModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.removeChild(modal);
    }
}

// 修改控制面板统计信息更新函数，支持文件夹统计
async function updateDashboardStats() {
    try {
        console.log('更新控制面板统计信息');
        
        // 获取文件夹统计信息
        const foldersResponse = await safeApiCall('/api/folders', {
            method: 'GET',
            credentials: 'include'
        });
        
        if (foldersResponse.success) {
            const folders = foldersResponse.data || [];
            
            // 计算总文件夹数
            const totalFolders = folders.length;
            
            // 计算总文件数和总大小
            let totalFiles = 0;
            let totalSize = 0;
            
            folders.forEach(folder => {
                totalFiles += folder.file_count || 0;
                totalSize += folder.total_size || 0;
            });
            
            // 更新DOM
            const totalFoldersElement = document.getElementById('totalFolders');
            const totalFilesElement = document.getElementById('totalFiles');
            const totalSizeElement = document.getElementById('totalSize');
            
            if (totalFoldersElement) {
                totalFoldersElement.textContent = totalFolders.toLocaleString();
            }
            
            if (totalFilesElement) {
                totalFilesElement.textContent = totalFiles.toLocaleString();
            }
            
            if (totalSizeElement) {
                totalSizeElement.textContent = formatFileSize(totalSize);
            }
            
            console.log('控制面板统计信息更新完成:', {
                totalFolders,
                totalFiles,
                totalSize: formatFileSize(totalSize)
            });
        } else {
            console.error('获取文件夹统计信息失败:', foldersResponse.error);
            // 使用默认值
            const totalFoldersElement = document.getElementById('totalFolders');
            const totalFilesElement = document.getElementById('totalFiles');
            const totalSizeElement = document.getElementById('totalSize');
            
            if (totalFoldersElement) {
                totalFoldersElement.textContent = '0';
            }
            if (totalFilesElement) {
                totalFilesElement.textContent = '0';
            }
            if (totalSizeElement) {
                totalSizeElement.textContent = '0 MB';
            }
        }
    } catch (error) {
        console.error('更新控制面板统计信息失败:', error);
        showToast('加载控制面板数据失败', 'error');
        
        // 使用默认值
        const totalFoldersElement = document.getElementById('totalFolders');
        const totalFilesElement = document.getElementById('totalFiles');
        const totalSizeElement = document.getElementById('totalSize');
        
        if (totalFoldersElement) {
            totalFoldersElement.textContent = '0';
        }
        if (totalFilesElement) {
            totalFilesElement.textContent = '0';
        }
        if (totalSizeElement) {
            totalSizeElement.textContent = '0 MB';
        }
    }
}

// 显示上传模态框
function showUploadModal() {
    const uploadModal = document.getElementById('uploadModal');
    if (uploadModal) {
        uploadModal.style.display = 'block';
    } else {
        console.error('未找到上传模态框');
        showNotification('上传功能暂时不可用', 'error');
    }
}

