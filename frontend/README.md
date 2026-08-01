# 前端

这里是高等数学数字人授课智能体的 Next.js 前端，负责 PPT 上传、解析状态、讲稿审核、生成进度和结果页交互。

## 启动

推荐在仓库根目录运行：

```powershell
npm.cmd install
npm.cmd run dev
```

也可以在本目录运行 `npm.cmd run dev`。默认地址为 [http://localhost:3000](http://localhost:3000)。

生产模式：

```powershell
npm.cmd run build
npm.cmd run start
```

Windows 用户可双击本目录的 `打开智数讲堂.cmd`。

## 目录职责

- `src/app/`：页面与路由
- `src/components/`：业务组件和 UI 组件
- `src/lib/api/`：前端 API 适配层（当前主要使用 Mock API）
- `src/types/`：前端领域与接口类型
- `public/`：静态资源

PPT 解析、LLM 调用、TTS 和视频渲染属于后端能力，应放在仓库的 `backend/`，不要放进本目录。
