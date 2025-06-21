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
    const isDebugMode = localStorage.getItem('debugMode') === 'true' || 
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
    
    // 如果开启了调试模式，输出提示
    if (isDebugMode) {
        originalConsole.log('调试模式已启用');
    }
}

// 初始化控制台处理
setupConsoleHandling();

document.addEventListener('DOMContentLoaded', async () => {
    const dropZone = document.getElementById('dropZone');
    const fileInput = document.getElementById('fileInput');
    const uploadBtn = document.getElementById('uploadBtn');
    const resultContainer = document.querySelector('.result-container');
    const closeResult = document.getElementById('closeResult');
    const progressBar = document.querySelector('.progress-fill');
    const progressText = document.querySelector('.progress-text');
    const progressSpeed = document.querySelector('.progress-speed');
    const toast = document.getElementById('toast');
    const uploadContainer = document.querySelector('.upload-container');

    // 如果页面上没有上传相关元素，则不执行任何操作
    if (!dropZone || !fileInput || !uploadBtn) {
        console.log('当前页面不是上传页面，跳过上传功能初始化。');
        return;
    }

    // 存储待上传的文件
    let pendingFiles = [];
    // 活跃的上传器列表
    let activeUploaders = [];

    // 初始化文件上传功能
    function initUpload() {
        // 点击上传按钮触发文件选择
        uploadBtn.addEventListener('click', (e) => {
            // 检查是否禁用了上传，但跳过覆盖层的提示
            if (uploadBtn.disabled || dropZone.classList.contains('disabled')) {
                // 不显示提示，由覆盖层本身提供足够的视觉反馈
                return;
            }
            e.stopPropagation();
            fileInput.click();
        });

        // 点击上传区域触发文件选择
        dropZone.addEventListener('click', (e) => {
            // 检查是否是覆盖层或其子元素被点击
            if (e.target.closest('.disabled-overlay')) {
                return; // 如果点击的是覆盖层，不做任何处理
            }
            
            // 检查是否禁用了上传
            if (dropZone.classList.contains('disabled')) {
                // 不显示提示，由覆盖层本身提供足够的视觉反馈
                return;
            }
            
            if (e.target === uploadBtn || uploadBtn.contains(e.target)) {
                return;
            }
            fileInput.click();
        });

        // 处理文件选择
        fileInput.addEventListener('change', (e) => {
            // 检查是否禁用了上传
            if (dropZone.classList.contains('disabled')) {
                // 不显示提示，这里一般不会被触发，因为按钮已被禁用
                return;
            }
            handleFiles(e.target.files);
        });

        // 处理拖放
        dropZone.addEventListener('dragover', (e) => {
            // 检查是否禁用了上传
            if (dropZone.classList.contains('disabled')) {
                e.preventDefault();
                return;
            }
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            if (!dropZone.classList.contains('disabled')) {
                dropZone.classList.remove('dragover');
            }
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            // 检查是否禁用了上传
            if (dropZone.classList.contains('disabled')) {
                // 不显示提示，由覆盖层本身提供足够的视觉反馈
                return;
            }
            dropZone.classList.remove('dragover');
            handleFiles(e.dataTransfer.files);
        });

        // 处理粘贴
        document.addEventListener('paste', (e) => {
            // 检查是否禁用了上传
            if (dropZone.classList.contains('disabled')) {
                // 不显示提示，上传已禁用的视觉反馈已足够
                return;
            }
            
            const items = e.clipboardData.items;
            const files = [];
            
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    files.push(items[i].getAsFile());
                }
            }
            
            if (files.length > 0) {
                handleFiles(files);
            }
        });

        // 关闭结果面板
        closeResult.addEventListener('click', () => {
            resultContainer.style.display = 'none';
        });
    }

    // 处理文件
    function handleFiles(files) {
        // 确认游客上传权限
        if (document.getElementById('dropZone').classList.contains('disabled')) {
            // 不显示提示，由覆盖层本身提供足够的视觉反馈
            return;
        }

        // 清空之前的文件列表
        const existingFileList = document.querySelector('.file-list');
        if (existingFileList) {
            existingFileList.remove();
        }
        
        // 清除现有的确认上传按钮
        const existingUploadBtn = document.querySelector('.confirm-upload-btn');
        if (existingUploadBtn) {
            existingUploadBtn.remove();
        }

        // 创建文件列表容器
        const fileList = document.createElement('div');
        fileList.className = 'file-list';
        
        // 存储待上传的文件
        pendingFiles = Array.from(files);

        // 显示每个文件的信息
        pendingFiles.forEach(file => {
            if (!file.type.startsWith('image/')) {
                showToast('只支持上传图片文件');
                return;
            }

            const fileInfo = document.createElement('div');
            fileInfo.className = 'file-info-container';
            fileInfo.innerHTML = `
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${formatFileSize(file.size)}</div>
                </div>
            `;
            fileList.appendChild(fileInfo);
        });

        // 添加确认上传按钮
        const confirmUploadBtn = document.createElement('button');
        confirmUploadBtn.className = 'confirm-upload-btn';
        confirmUploadBtn.textContent = '确认上传';
        confirmUploadBtn.addEventListener('click', () => {
            uploadFiles(pendingFiles);
        });

        // 添加到上传容器
        uploadContainer.appendChild(fileList);
        uploadContainer.appendChild(confirmUploadBtn);
    }

    // 格式化文件大小
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // 上传文件 - 使用分块上传
    async function uploadFiles(files) {
        // 再次确认游客上传权限
        if (document.getElementById('dropZone').classList.contains('disabled')) {
            // 不显示提示，由覆盖层本身提供足够的视觉反馈
            return;
        }

        const startTime = Date.now();
        let uploadedCount = 0;
        let failedCount = 0;
        let uploadedBytes = 0;
        const totalFiles = files.length;
        const totalBytes = Array.from(files).reduce((total, file) => total + file.size, 0);
        const uploadedResults = [];
        const failedFiles = [];

        // 显示进度条并重置
        const uploadProgress = document.querySelector('.upload-progress');
        progressBar.style.width = '0%';
        progressText.textContent = '0%';
        progressSpeed.textContent = '0 KB/s';
        uploadProgress.style.display = 'block';

        // 清除现有的上传器
        activeUploaders.forEach(uploader => {
            if (uploader.status === 'uploading') {
                uploader.cancel();
            }
        });
        activeUploaders = [];

        // 定义文件大小阈值，超过此值使用分块上传，否则使用普通上传
        const CHUNK_SIZE_THRESHOLD = 5 * 1024 * 1024; // 5MB

        // 创建上传队列
        const uploadQueue = Array.from(files).map((file, index) => ({
            file,
            index,
            isLastFile: index === files.length - 1,
            skipDeploy: index !== files.length - 1, // 除了最后一个文件，其他都跳过部署
            status: 'pending', // pending, uploading, completed, failed
            retries: 0,
            maxRetries: 3
        }));

        // 并发上传函数
        async function uploadFileFromQueue(queueItem) {
            const { file, index, isLastFile, skipDeploy } = queueItem;
            
            try {
                console.log(`开始上传文件: ${file.name}, 大小: ${file.size}, 是否跳过部署: ${skipDeploy}`);
                
                // 判断是否使用分块上传
                if (file.size > CHUNK_SIZE_THRESHOLD) {
                    console.log(`文件大小超过${formatFileSize(CHUNK_SIZE_THRESHOLD)}，使用分块上传`);
                    
                    // 创建分块上传器
                    const uploader = new ChunkedUploader(file, {
                        skipDeploy: skipDeploy,
                        // 进度更新回调
                        onProgress: (progressData) => {
                            // 计算总体进度 (已上传完成的文件 + 当前文件的进度)
                            const fileContribution = progressData.uploadedSize / totalBytes;
                            const completedContribution = uploadedBytes / totalBytes;
                            const overallProgress = completedContribution + fileContribution;
                            const percent = Math.min(100, Math.round(overallProgress * 100));
                            
                            // 更新进度条
                            progressBar.style.width = percent + '%';
                            progressText.textContent = percent + '%';
                            
                            // 计算上传速度
                            const elapsedSeconds = (Date.now() - startTime) / 1000;
                            if (elapsedSeconds > 0) {
                                const speed = (uploadedBytes + progressData.uploadedSize) / elapsedSeconds;
                                progressSpeed.textContent = formatSpeed(speed);
                            }
                        },
                        // 上传完成回调
                        onComplete: (result) => {
                            queueItem.status = 'completed';
                            uploadedCount++;
                            uploadedBytes += file.size;
                            uploadedResults.push(result.data);
                            
                            // 检查是否所有文件都处理完成
                            checkAllFilesCompleted();
                        },
                        // 错误处理回调
                        onError: (error) => {
                            handleFileUploadError(queueItem, error);
                        }
                    });
                    
                    activeUploaders.push(uploader);
                    uploader.start();
                } else {
                    // 小文件，使用普通上传方式
                    console.log(`文件大小小于${formatFileSize(CHUNK_SIZE_THRESHOLD)}，使用普通上传`);
                    
                    const result = await uploadFileWithXHR(file, (loaded, total) => {
                        // 计算总体进度
                        const fileContribution = loaded / totalBytes;
                        const completedContribution = uploadedBytes / totalBytes;
                        const overallProgress = completedContribution + fileContribution;
                        const percent = Math.min(100, Math.round(overallProgress * 100));
                        
                        // 更新进度条
                        progressBar.style.width = percent + '%';
                        progressText.textContent = percent + '%';
                        
                        // 计算上传速度
                        const elapsedSeconds = (Date.now() - startTime) / 1000;
                        if (elapsedSeconds > 0) {
                            const speed = (uploadedBytes + loaded) / elapsedSeconds;
                            progressSpeed.textContent = formatSpeed(speed);
                        }
                    }, skipDeploy);
                    
                    if (result.success) {
                        queueItem.status = 'completed';
                        uploadedCount++;
                        uploadedBytes += file.size;
                        uploadedResults.push(result.data);
                    } else {
                        throw new Error(result.error || '上传失败');
                    }
                    
                    // 检查是否所有文件都处理完成
                    checkAllFilesCompleted();
                }
                
            } catch (error) {
                handleFileUploadError(queueItem, error);
            }
        }

        // 处理文件上传错误
        function handleFileUploadError(queueItem, error) {
            const { file, retries, maxRetries } = queueItem;
            
            // 检查是否是游客上传禁用的错误
            if (error.message && error.message.includes('游客上传已禁用')) {
                showToast('游客上传已禁用，请登录后再试');
                resetUploadArea();
                return;
            }
            
            // 检查重试次数
            if (retries < maxRetries) {
                queueItem.retries++;
                console.log(`文件 ${file.name} 上传失败，正在重试 (${retries}/${maxRetries})...`);
                
                // 延迟重试
                setTimeout(() => {
                    uploadFileFromQueue(queueItem);
                }, 1000 * retries); // 递增延迟
            } else {
                // 超过重试次数，标记为失败
                queueItem.status = 'failed';
                failedCount++;
                failedFiles.push({
                    name: file.name,
                    error: error.message || '上传失败'
                });
                
                console.log(`文件 ${file.name} 上传失败，超过最大重试次数`);
                
                // 检查是否所有文件都处理完成
                checkAllFilesCompleted();
            }
        }

        // 检查所有文件是否都处理完成
        function checkAllFilesCompleted() {
            const totalProcessed = uploadedCount + failedCount;
            
            if (totalProcessed === totalFiles) {
                // 清理上传队列和活跃上传器
                uploadQueue.length = 0;
                activeUploaders.forEach(uploader => {
                    if (uploader.status === 'uploading') {
                        uploader.cancel();
                    }
                });
                activeUploaders.length = 0;
                
                // 隐藏文件列表和确认按钮
                const fileList = document.querySelector('.file-list');
                const confirmBtn = document.querySelector('.confirm-upload-btn');
                if (fileList) fileList.remove();
                if (confirmBtn) confirmBtn.remove();
                
                // 所有文件都处理完成
                if (failedCount > 0) {
                    // 有文件上传失败，显示部分成功的结果
                    if (uploadedCount > 0) {
                        showPartialResult(uploadedResults, failedFiles);
                    } else {
                        // 所有文件都失败了
                        showToast(`所有文件上传失败 (${failedCount}/${totalFiles})`);
                        resetUploadArea();
                    }
                } else {
                    // 所有文件都上传成功
                    showResult(uploadedResults);
                }
            }
        }

        // 开始上传所有文件（并发）
        uploadQueue.forEach(queueItem => {
            uploadFileFromQueue(queueItem);
        });
    }

    // 使用XMLHttpRequest上传小文件
    function uploadFileWithXHR(file, onProgress, skipDeploy) {
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
                            errorMessage = errorResponse.error || `文件 "${file.name}" 已存在，请重命名后重试`;
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
                        
                        // 添加更详细的错误细节
                        if (errorResponse.message) {
                            errorDetails = errorResponse.message;
                        }
                        if (errorResponse.details && typeof errorResponse.details === 'string') {
                            errorDetails = errorResponse.details;
                        } else if (errorResponse.details && typeof errorResponse.details === 'object') {
                            errorDetails = JSON.stringify(errorResponse.details);
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
            
            // 发送请求
            xhr.open('POST', '/api/upload?action=upload', true);
            xhr.send(formData);
        });
    }

    // 显示上传结果
    function showResult(results) {
        // 隐藏进度条
        const uploadProgress = document.querySelector('.upload-progress');
        uploadProgress.style.display = 'none';
        
        if (results.length === 0 || !results[0]) {
            showToast('上传成功，但未返回链接信息');
            return;
        }
        
        // 清空原有链接显示区域
        const resultContent = document.querySelector('.result-content');
        const linkGroups = resultContent.querySelectorAll('.link-group, .link-item');
        linkGroups.forEach(group => group.remove());
        
        // 按照格式分组创建链接
        
        // URL链接组
        const urlItem = document.createElement('div');
        urlItem.className = 'link-item';
        let urlLinks = '';
        results.forEach(result => {
            urlLinks += result.url + '\n';
        });
        urlItem.innerHTML = `
            <label>直接链接</label>
            <div class="input-group">
                <textarea class="link-input" readonly>${urlLinks.trim()}</textarea>
                <button class="copy-btn" data-type="url">复制</button>
            </div>
        `;
        resultContent.appendChild(urlItem);
        
        // Markdown链接组
        const markdownItem = document.createElement('div');
        markdownItem.className = 'link-item';
        let markdownLinks = '';
        results.forEach(result => {
            // 获取原始URL和文件名
            let url = result.url;
            let filename = '';
            
            // 从markdown格式中提取文件名
            const filenameMatch = result.markdown.match(/!\[(.*?)\]/);
            if (filenameMatch && filenameMatch[1]) {
                filename = filenameMatch[1];
            }
            
            // 对URL进行编码处理，确保Markdown能正确解析
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
            
            // 创建处理过的markdown链接
            const processedMarkdown = `![${filename}](${encodedUrl})`;
            markdownLinks += processedMarkdown + '\n';
        });
        markdownItem.innerHTML = `
            <label>Markdown</label>
            <div class="input-group">
                <textarea class="link-input" readonly>${markdownLinks.trim()}</textarea>
                <button class="copy-btn" data-type="markdown">复制</button>
            </div>
        `;
        resultContent.appendChild(markdownItem);
        
        // HTML链接组
        const htmlItem = document.createElement('div');
        htmlItem.className = 'link-item';
        let htmlLinks = '';
        results.forEach(result => {
            htmlLinks += result.html + '\n';
        });
        htmlItem.innerHTML = `
            <label>HTML</label>
            <div class="input-group">
                <textarea class="link-input" readonly>${htmlLinks.trim()}</textarea>
                <button class="copy-btn" data-type="html">复制</button>
            </div>
        `;
        resultContent.appendChild(htmlItem);
        
        // BBCode链接组
        const bbcodeItem = document.createElement('div');
        bbcodeItem.className = 'link-item';
        let bbcodeLinks = '';
        results.forEach(result => {
            bbcodeLinks += result.bbcode + '\n';
        });
        bbcodeItem.innerHTML = `
            <label>BBCode</label>
            <div class="input-group">
                <textarea class="link-input" readonly>${bbcodeLinks.trim()}</textarea>
                <button class="copy-btn" data-type="bbcode">复制</button>
            </div>
        `;
        resultContent.appendChild(bbcodeItem);
        
        // 显示结果容器
        document.querySelector('.result-container').style.display = 'block';
        
        // 添加复制按钮事件
        document.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const inputElement = btn.previousElementSibling;
                copyToClipboard(inputElement.value);
                showToast('链接已复制到剪贴板', 'success');
            });
        });
    }

    // 显示错误提示
    function showToast(message, type = 'error') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        // 添加显示类
        setTimeout(() => {
            toast.classList.add('show');
        }, 100);
        
        // 3秒后移除
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3000);
    }
    
    // 重置上传区
    function resetUploadArea() {
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');
        const uploadProgress = document.querySelector('.upload-progress');
        const fileList = document.querySelector('.file-list');
        const confirmBtn = document.querySelector('.confirm-upload-btn');
        
        // 重置文件输入
        if (fileInput) {
            fileInput.value = '';
        }
        
        // 隐藏进度条
        if (uploadProgress) {
            uploadProgress.style.display = 'none';
        }
        
        // 移除文件列表和确认按钮
        if (fileList) fileList.remove();
        if (confirmBtn) confirmBtn.remove();
        
        // 重置拖放区域样式
        if (dropZone) {
            dropZone.classList.remove('dragover');
        }
    }
    
    // 复制到剪贴板
    function copyToClipboard(text) {
        // 创建一个临时输入框
        const input = document.createElement('textarea');
        input.style.position = 'fixed';
        input.style.opacity = 0;
        input.value = text;
        document.body.appendChild(input);
        
        // 选择并复制
        input.select();
        document.execCommand('copy');
        
        // 移除临时元素
        document.body.removeChild(input);
    }
    
    // 格式化上传速度
    function formatSpeed(bytesPerSecond) {
        if (bytesPerSecond === 0) return '0 B/s';
        
        const k = 1024;
        const sizes = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
        const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
        
        return parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    // 检查是否允许游客上传
    async function checkGuestUpload() {
        try {
            const response = await fetch('/api/settings/guest-upload');
            
            if (response.ok) {
                const data = await response.json();
                
                if (data.success && data.data) {
                    const { allowGuestUpload } = data.data;
                    
                    if (!allowGuestUpload) {
                        console.log('游客上传已禁用');
                        return false;
                    }
                }
            } else {
                // 无法获取设置，为安全起见，禁止上传
                console.warn('无法获取游客上传设置，默认禁止上传');
                return false;
            }
            
            return true; // 允许上传
        } catch (error) {
            console.error('检查游客上传设置失败:', error);
            // 出错时为安全起见禁止上传
            return false;
        }
    }
    
    // 禁用上传功能
    function disableUpload() {
        if (!uploadBtn || !dropZone || !fileInput) return;

        // 禁用上传按钮
        uploadBtn.disabled = true;
        uploadBtn.classList.add('disabled');
        
        // 阻止所有拖放相关事件
        const preventDrag = (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        };
        
        dropZone.addEventListener('dragover', preventDrag, { capture: true });
        dropZone.addEventListener('dragenter', preventDrag, { capture: true });
        dropZone.addEventListener('dragleave', preventDrag, { capture: true });
        dropZone.addEventListener('drop', preventDrag, { capture: true });
        
        // 修改样式，使禁用状态更加明显
        dropZone.classList.add('disabled');
        uploadBtn.textContent = '上传已禁用';
        
        // 显示禁用覆盖层
        const overlay = document.createElement('div');
        overlay.className = 'disabled-overlay';
        overlay.innerHTML = `
            <div class="disabled-message">
                <i class="fas fa-lock"></i>
                <p>游客上传已禁用</p>
                <p class="sub-message">请登录后再试</p>
            </div>
        `;
        
        // 为覆盖层添加点击事件，阻止事件冒泡
        overlay.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        });
        
        // 确保只添加一个覆盖层
        const existingOverlay = dropZone.querySelector('.disabled-overlay');
        if (!existingOverlay) {
            dropZone.appendChild(overlay);
        }
        
        // 清除可能存在的文件列表和确认按钮
        const fileList = document.querySelector('.file-list');
        const confirmBtn = document.querySelector('.confirm-upload-btn');
        if (fileList) fileList.remove();
        if (confirmBtn) confirmBtn.remove();
        
        // 禁用文件输入
        fileInput.disabled = true;
    }
    
    // 初始化
    // 首先检查游客上传权限，然后再允许用户操作
    async function initializeUpload() {
        if (!dropZone || !fileInput || !uploadBtn) return;
        const canUpload = await checkGuestUpload();
        console.log('游客上传权限检查结果:', canUpload);
        
        // 只有在允许上传时才初始化上传功能
        if (canUpload) {
            initUpload();
        } else {
            // 如果禁止上传，直接禁用上传功能
            disableUpload();
        }
    }
    
    initializeUpload();

    // 显示部分成功的结果
    function showPartialResult(successResults, failedFiles) {
        const resultContainer = document.querySelector('.result-container');
        if (!resultContainer) return;

        const resultContent = resultContainer.querySelector('.result-content');
        if (!resultContent) return;
        
        let html = '<div class="upload-summary">';
        html += `<h3>上传完成 (${successResults.length} 成功, ${failedFiles.length} 失败)</h3>`;
        
        if (successResults.length > 0) {
            html += '<div class="success-files">';
            html += '<h4>成功上传的文件:</h4>';
            successResults.forEach(result => {
                html += `<div class="file-result">`;
                html += `<div class="file-info">`;
                html += `<span class="file-name">${result.fileName}</span>`;
                html += `<span class="file-size">${formatFileSize(result.fileSize)}</span>`;
                html += `</div>`;
                html += `<div class="file-url">`;
                html += `<input type="text" value="${result.url}" readonly>`;
                html += `<button onclick="copyToClipboard('${result.url}')">复制</button>`;
                html += `</div>`;
                html += `</div>`;
            });
            html += '</div>';
        }
        
        if (failedFiles.length > 0) {
            html += '<div class="failed-files">';
            html += '<h4>上传失败的文件:</h4>';
            failedFiles.forEach(failed => {
                html += `<div class="file-error">`;
                html += `<span class="file-name">${failed.name}</span>`;
                html += `<span class="error-message">${failed.error}</span>`;
                html += `</div>`;
            });
            html += '</div>';
        }
        
        html += '</div>';
        
        resultContent.innerHTML = html;
        resultContainer.style.display = 'block';
        
        // 隐藏进度条
        const uploadProgress = document.querySelector('.upload-progress');
        if (uploadProgress) {
            uploadProgress.style.display = 'none';
        }
        
        // 重置上传区域
        resetUploadArea();
    }
}); 
