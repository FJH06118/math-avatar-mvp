# 高等数学数字人授课智能体

一个使用 Mock API 演示完整课程制作流程的中文前端 MVP：上传 PPT/PPTX、解析课件、逐页编辑讲稿、设置数字人与音色、生成视频并下载 MP4/SRT。

## 本地启动

环境要求：Node.js 20.9 或更高版本。

```bash
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

Windows PowerShell 如果限制执行 `npm.ps1`，可使用：

```powershell
npm.cmd install
npm.cmd run dev
```

### Windows 一键打开

双击项目根目录下的 `打开智数讲堂.cmd`。启动器会：

1. 检查 `localhost:3000` 是否已运行；
2. 必要时启动独立的生产服务器窗口；
3. 自动在默认浏览器打开网页。

保持服务器窗口开启即可持续访问；关闭服务器窗口即可停止服务。修改代码后，先运行 `npm.cmd run build`，再双击启动器查看最新生产版本。

## 质量检查

```bash
npm run typecheck
npm run lint -- --max-warnings=0
npm run build
```

## 演示路径

- `/`：项目首页与最近项目
- `/upload`：PPT/PPTX 上传、校验、进度与失败重试
- `/projects/project-limit`：三栏课程工作台
- `/projects/project-limit/parsing`：课件解析任务
- `/projects/project-limit/generating`：视频生成任务
- `/projects/project-derivative/result`：带种子数据的视频结果页

上传失败演示：选择文件名中包含“失败”的合法 PPT/PPTX，第一次上传会失败，重试后成功。

## 技术栈

- Next.js App Router、React、TypeScript
- Tailwind CSS、shadcn/ui（Base UI）
- TanStack Query
- React Hook Form、Zod
- react-dropzone
- Lucide React

所有业务接口集中在 `src/lib/api`，领域类型集中在 `src/types`。当前版本不解析真实 PPT，也不调用真实数字人、语音或视频服务。
