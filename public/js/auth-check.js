// 通用认证状态检查脚本
async function checkAuthStatus() {
  try {
    const response = await fetch('/api/auth-status');
    const data = await response.json();
    
    // 如果系统未配置，跳转到设置页面
    if (!data.isConfigured) {
      window.location.href = '/setup';
      return;
    }
    
    // 如果用户未认证，跳转到登录页面
    if (!data.isAuthenticated) {
      window.location.href = '/login';
      return;
    }
  } catch (error) {
    console.error('检查认证状态失败:', error);
    // 如果检查失败，也跳转到登录页面
    window.location.href = '/login';
  }
}

// 页面加载时自动检查认证状态
document.addEventListener('DOMContentLoaded', function() {
  checkAuthStatus();
}); 