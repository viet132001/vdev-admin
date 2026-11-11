# CLAUDE.md — vdev-admin

Bản đồ code cho phiên Claude làm task trong repo này. Đọc trước khi sửa code.

## 1. Mục đích & tech stack

- **VDEV Admin Portal**: SPA quản trị cá nhân, gọi REST API của BE VDEV. Menu hiện chỉ có **Tasks** (quản lý công việc + Task Agent Claude), **Dự án nhóm** (route `/projects`, mọi user: chỉ thấy dự án được mời; thành viên, mời qua email, source BE/AD/APP, task, kế hoạch, tài liệu, dashboard, kết nối MCP — `src/pages/Projects.tsx` + `src/pages/projects/`, trang nhận lời mời công khai `/invite/:token` ở `src/pages/Invite.tsx`), **Quản lý page** (route `/dictation`: mỗi khoá học là một page có thể loại, luật và kênh đăng riêng → chủ đề, mỗi chủ đề có video, bài đọc, chính tả, game) **Studio** (route `/studio`, chỉ `ADMIN`: video hài ngắn người que, nhập ý tưởng → Claude viết kịch bản (hoặc phòng biên kịch Claude + Codex: cả hai viết, chấm chéo, sửa bản thắng, Codex đóng gói tiêu đề / mô tả / tag YouTube, gợi ý ý tưởng cho kênh) → sửa từng câu, xem thử, render, đăng; `src/pages/Studio.tsx` + `src/pages/studio/WritersRoom.tsx`, gọi `/comedy` của worker vdev-video) **Truyện viễn tưởng** (route `/story`, chỉ `ADMIN`: kênh truyện khoa học viễn tưởng tiếng Việt theo series, trọng tâm là kịch bản: kinh thánh series → dàn ý (Claude viết, Codex chấm, Claude sửa, người dùng duyệt / góp ý) → kịch bản 6–10 phút (Codex chấm chỗ người xem bỏ đi, Claude sửa) → Codex dựng bản ngắn 40–65 giây + đóng gói → Claude vẽ tranh SVG → sửa → render hai bản; bản đầy đủ đăng YouTube, bản ngắn đăng Facebook; `src/pages/Story.tsx` + `src/pages/story/`, gọi `/stories` của worker vdev-video) và **Người dùng** (chỉ role `ADMIN`); Dashboard / Finance / Liabilities / Learning vẫn có route nhưng đã ẩn khỏi menu (`src/components/Layout.tsx`). **User không phải `ADMIN` (người được mời) chỉ có menu Dự án nhóm**; role `PROJECT_CREATOR` ("Tạo dự án nhóm") chỉ thêm nút Tạo dự án, không mở menu khác: mọi route khác bọc `ProtectedRoute roles={['ADMIN']}`, `/` của họ (`HomeRedirect` trong `src/App.tsx`) mở `/projects`, của ADMIN mở `/tasks`.
- React `^19.2.7`, react-router-dom `^7.18.1`, TypeScript `~6.0.2`, Vite `^8.1.1` (`@vitejs/plugin-react`), icon `lucide-react`, lint bằng `oxlint ^1.71.0`. Không dùng thư viện UI / CSS framework, không có state manager (chỉ React state + Context).
- Deploy lên GitHub Pages dưới đường dẫn `/vdev-admin/` (CI: Node 22, pnpm 10).
- `expo` có trong `dependencies` (và thư mục `.expo/`) nhưng không được import ở `src/`.

## 2. Bản đồ thư mục

```
index.html, src/main.tsx      entry: render <App/>, import src/index.css
src/App.tsx                   router (basename "/vdev-admin"), ProtectedRoute / GuestRoute, "/" → "/tasks"
src/context/ThemeContext.tsx  ThemeProvider + useTheme(): Sáng / Tối / Hệ thống, lưu localStorage vdev_theme, ghi <html data-theme>
src/context/AuthContext.tsx   AuthProvider + useAuth(): login / register / logout / Google login, tải /api/auth/profile; hasRole(user, ...roles)
src/services/api.ts           API client duy nhất: api.get/post/patch/delete, authFetch, getErrorMessage, cache, mock fallback
src/services/*Mock.ts         mock localStorage khi BE không kết nối được:
                                taskMock.ts (tasks, task-projects, task-tags) + taskAgentMock.ts (Task Agent),
                                dictationMock.ts, liabilityMock.ts, userMock.ts; auth/finance/learning mock nằm thẳng trong api.ts
src/components/               Layout.tsx (sidebar + mobile header), ThemeToggle.tsx (ThemeSwitch ở sidebar, ThemeToggleButton ở trang đăng nhập / header mobile), MoneyInput.tsx, GoogleLoginButton.tsx
src/pages/*.tsx               một file / trang: Tasks, Dictation, Users, Finance, Liabilities, Learning, Dashboard, Login, Register, GoogleCallback
src/pages/tasks/              màn Tasks: TaskBoard / TaskTable / TaskCalendar (view), TaskDetail, TaskReview (diff),
                                PlanPanel (kế hoạch Claude), ReviewQueue, RunnersModal, AgentSettingsModal,
                                ProjectDocs + localDocs.ts (thư mục tài liệu local qua File System Access API + IndexedDB),
                                BlockEditor, git.tsx (PR / git flow), agent.ts (nhãn trạng thái plan/run/PR, useBusy),
                                shared.tsx (STATUS/PRIORITY options, ConfirmDialog, Popover, TagChip, format ngày)
src/pages/projects/           Dự án nhóm (contract src/doc/team-projects-api.md, tách khỏi Tasks cá nhân): shared.tsx (TEAM_STATUS, TEAM_ROLES,
                                useTasks, ProjectTabProps), ProjectOverview (dashboard), ProjectTasks (+ TaskFormModal), TeamTaskPanel (drawer chi tiết),
                                ProjectPlan (milestone), TeamDocs, ProjectMembers (mời / vai trò), ProjectSettings (source), McpConnectModal (token vdp_)
src/services/afterLogin.ts    đường dẫn quay lại sau đăng nhập (sessionStorage), dùng cho link mời
src/pages/story/              Truyện viễn tưởng: storyWorker.ts (kiểu + gọi /stories của worker, không qua BE), SeriesPanel (tạo series, sửa kinh thánh, tập mới + gợi ý, series nhớ gì),
                                OutlineView (dàn ý + ReviewCard điểm của biên tập viên, góp ý / duyệt), ScriptEditor (từng cảnh: tranh, máy quay, câu, mood; bản ngắn; lưu / render)
src/pages/users/              BlockList (chặn email / IP), blocks.ts (API + thông báo lỗi tiếng Việt)
src/pages/dictation/          PageSettings (cài đặt page của khoá học, lưu ở worker) + BatchGenerator (tạo nhiều bài một lần, xem video rồi duyệt một lần là hẹn giờ cả lô, mỗi ngày một video) + batchRunner.ts (useBatchRunner ở Dictation: trong lúc trang mở, tự đưa bài của lô lên khoá học và gắn link YouTube) + lessonSave.ts (lưu bài lên BE, gắn link, tiêu đề / nội dung bài đăng mặc định, dùng chung với LessonGenerator), VideoLibrary + videoStatus.ts (Quản lý video: mỗi bài học có video, gộp job của worker với videoUrl trên BE; trạng thái đang tạo / chỉ trên máy / đã hẹn / đã đăng, link Facebook, YouTube, link trong bài; gợi ý khung trống của lịch đăng, mở chéo với PublishSchedule) + LessonGenerator + ShotEditor (Chỉnh cảnh video Stick Talk: sửa bối cảnh, zoom, biểu cảm, hành động từng cảnh, xem thử ảnh / đoạn có tiếng do worker render, lưu rồi tạo lại video) + VideoPublish + PublishSchedule (+ FacebookOverview: Reels gần đây của page với lượt xem / thích / bình luận, bài đã lên lịch trên Facebook kể cả bài hẹn ngoài VDEV, đọc qua worker `GET /channels/:owner/facebook-content`) + ChannelManager + schedule.ts + lessonWorker.ts (form tạo bài, kết nối page Facebook và kênh YouTube cho từng thể loại, đăng và hẹn giờ Facebook, YouTube, lịch đăng theo tuần, gắn link vào bài học, gọi worker local của vdev-video), VideoLesson + video.ts (link → player), Reading (ghép câu thành bài đọc), Practice, SentenceManager, ImportSessions, grading.ts (chấm câu), media.ts (upload audio),
                                games/ (VocabGames: màn chờ + kết quả; DefenseGame: luật Thủ thành; defenseScene: đồ hoạ Canvas; defenseSound; common.ts)
src/doc/*.md                  đặc tả API của BE (contract): auth, tasks, task-agent-mcp, team-projects, dictation, finance, learning, notes
src/index.css                 design token (biến CSS sáng/tối) + toàn bộ class dùng chung; App.css gần như rỗng
DesignGuideline.md            chuẩn UI/UX (màu, chữ, bo góc, responsive, modal, empty state)
.github/workflows/main.yml    CI build + deploy GitHub Pages khi push main
```

## 3. Lệnh (từ `package.json` và CI)

```bash
pnpm install            # CI dùng: pnpm install --frozen-lockfile
pnpm dev                # vite
pnpm build              # tsc -b && vite build && cp dist/index.html dist/404.html
pnpm lint               # oxlint (cấu hình .oxlintrc.json: plugin react/typescript/oxc)
pnpm preview            # vite preview
```

- **Không có test** (không có script `test`, không có file test). Kiểm tra thay đổi bằng `pnpm build` (chạy cả `tsc -b`) và `pnpm lint`.
- Biến môi trường: `VITE_API_URL` trong `.env` (mặc định trong code: `http://localhost:3000`).

## 4. Quy ước code

- **Component**: named export `export const Tên: React.FC<Props> = (...) => {...}` (vd `src/pages/Tasks.tsx`, `src/components/Layout.tsx`). Chỉ `App` dùng `export default`.
- **Đặt tên**: file component PascalCase (`TaskDetail.tsx`), file helper camelCase (`agent.ts`, `localDocs.ts`); hằng số UPPER_SNAKE (`PLAN_STATUS`, `COLOR_PRESETS`).
- **Text giao diện bằng tiếng Việt**; comment trong code bằng tiếng Anh, ngắn, giải thích "vì sao".
- **Gọi API**: luôn qua `api` trong `src/services/api.ts` với path bắt đầu bằng `/api/...` — không tự `fetch` với BASE_URL. Upload `FormData` / tải file dùng `authFetch` (vd `src/pages/dictation/media.ts`, `ImportSessions.tsx`). `api.*` tự bóc `{ success, data }` và trả `data`.
- **Cache**: `api.get` cache theo `url + token`; mọi post/patch/delete xoá toàn bộ cache. Dữ liệu polling / cần mới thì gọi `api.get(url, { noCache: true })`.
- **Xử lý lỗi**: `try { ... } catch (err) { alert(getErrorMessage(err, 'Thông báo tiếng Việt')); }` (mẫu: `src/pages/Tasks.tsx`). `getErrorMessage` đọc body lỗi `{ success, message, errors }` của BE.
- **Xác nhận xoá**: dùng `ConfirmDialog` + `ConfirmState` từ `src/pages/tasks/shared.tsx` (Dictation cũng import từ đây); chỉ vài chỗ còn `window.confirm` (`AgentSettingsModal.tsx`, `ProjectDocs.tsx`), code mới nên dùng `ConfirmDialog`.
- **Nút đang chạy / chống double click**: `useBusy()` trong `src/pages/tasks/agent.ts`.
- **Phân quyền**: route chỉ cho role nào thì `<ProtectedRoute roles={['ADMIN']}>`; ẩn/hiện UI bằng `hasRole(user, 'ADMIN')`. Đây chỉ là tiện ích giao diện, BE mới là nơi chặn quyền (`src/doc/auth-api.md` mục 6).
- **State trên URL**: trang dùng `useSearchParams` cho lựa chọn hiện tại (`?project=&task=` ở Tasks, `?session=&lesson=&tab=` ở Dictation).
- **Sáng / Tối**: CSS tối viết dưới `:root[data-theme="dark"]` (không dùng `@media (prefers-color-scheme)`); script inline ở `index.html` áp theme trước khi vẽ, phải khớp `ThemeContext.tsx`.
- **Style**: class trong `src/index.css` + inline style dùng biến CSS (`var(--primary)`, `var(--text-muted)`, `var(--radius-sm)`…). Không hard-code màu cho trạng thái; theo `DesignGuideline.md` (bảng màu zinc trung tính, không gradient/blur/emoji trang trí, viền 1px).
- **Mock**: mỗi module mock export hàm `mockXxx(method, url, body?) => { handled, data? }`, lỗi ném `Error(JSON.stringify({ success:false, message, errorCode, errors: [] }))` giống BE (mẫu `src/services/taskMock.ts`). Mock bám theo `src/doc/*.md`; thêm endpoint mới mà muốn chạy offline thì thêm vào mock tương ứng.
- **TypeScript** (`tsconfig.app.json`): `noUnusedLocals`, `noUnusedParameters` ⇒ biến/import thừa làm `pnpm build` lỗi; `verbatimModuleSyntax` ⇒ import kiểu phải ghi `type` (`import { ConfirmDialog, type ConfirmState } ...`); `erasableSyntaxOnly` ⇒ không dùng `enum`, namespace, parameter property. Dữ liệu từ API phần lớn để `any`.

## 5. Liên kết với repo khác

- **BE VDEV** (repo riêng, không nằm ở đây): mọi endpoint `/api/auth`, `/api/tasks`, `/api/task-projects`, `/api/task-tags`, `/api/agent/...`, `/api/team-projects`, `/api/team-tasks`, `/api/team-docs`, `/api/team-invites`, `/api/access-tokens`, `/api/dictation`, `/api/finance`, `/api/learning`, `/api/storage`, `/api/notes`. Contract nằm ở `src/doc/*.md` — đọc file tương ứng trước khi sửa tích hợp API.
- Auth: JWT Bearer lưu `localStorage` (`vdev_token`, `vdev_refresh_token`); 401 ⇒ `authFetch` gọi `/api/auth/refresh` một lần rồi thử lại, thất bại ⇒ phát event `vdev:session-expired` để `AuthContext` đăng xuất.
- **vdev-agent** (runner chạy trên máy người dùng, Claude Agent SDK + VDEV MCP tools): FE không gọi trực tiếp, chỉ đọc/ghi trạng thái plan / run / changeset / PR qua BE. Mô tả đầy đủ ở `src/doc/task-agent-mcp.md` (mục 15: git flow, workspace nhiều repo, `CLAUDE.md` của từng repo).
- **vdev-video** (thư mục cạnh repo này, Remotion, chạy trên máy cá nhân): tạo video bài học từ các câu rồi gắn vào `videoUrl` của lesson. Mỗi thể loại (Giao tiếp, Stickman...) cấu hình trong `src/genres.ts` của vdev-video, gồm kiểu video, series và kênh đăng riêng; form và lịch đăng đọc danh sách từ `/health` của worker, không định nghĩa lại ở đây. Form "Tạo bài bằng Claude" gọi `pnpm worker` tại `http://localhost:4599` để lập kế hoạch, soạn bài, render; bài và task được trang lưu lên BE bằng phiên đăng nhập, video chỉ nằm trên máy. Đăng Reels và YouTube cũng đi qua worker, token nhập ở màn Quản lý kênh đi thẳng vào worker (không qua BE, không bao giờ đọc lại được), token chỉ nằm ở worker; đăng YouTube xong trang tự PATCH `videoUrl` của bài học.
- **Dự án nhóm**: chưa có mock offline (gọi lỗi khi BE không chạy). Quyền theo vai trò dự án (`roleAtLeast` trong `src/pages/projects/shared.tsx`) chỉ để ẩn / hiện UI, BE kiểm tra lại. MCP là remote trên BE (`/api/mcp`), FE chỉ tạo token và hiển thị lệnh `claude mcp add`.
- **Chấm câu Dictation**: `src/pages/dictation/grading.ts` phải khớp 1:1 với `dictation-grading.util.ts` của BE và quy tắc ở `src/doc/dictation-api.md` mục 4 — sửa một bên thì phải sửa bên kia và cập nhật tài liệu.

## 6. Điều cần tránh / bẫy

- **Mock fallback âm thầm**: lỗi mạng (`TypeError` / "fetch" / "NetworkError") ở bất kỳ request nào sẽ bật `useMockFallback = true` cho đến khi tải lại trang ⇒ app chạy bằng dữ liệu localStorage giả (`mock_*`). Khi thấy dữ liệu "lạ", kiểm tra BE có chạy không trước khi sửa code.
- `base: '/vdev-admin/'` (`vite.config.ts`) và `basename="/vdev-admin"` (`src/App.tsx`) phải đổi cùng nhau. Dev server phục vụ ở `/vdev-admin/`.
- Bước `cp dist/index.html dist/404.html` trong build là để GitHub Pages trả SPA cho mọi route — đừng bỏ.
- `.github/workflows/.github/workflows/deploy.yml` nằm sai chỗ nên GitHub không chạy; workflow thật là `.github/workflows/main.yml`.
- Có cả `package-lock.json` và `pnpm-lock.yaml`; CI dùng pnpm với `--frozen-lockfile` ⇒ thêm/bỏ dependency thì phải cập nhật `pnpm-lock.yaml`.
- `.env` được commit (chứa `VITE_API_URL` trỏ BE thật); đừng thêm secret vào đó. Một số chỗ đọc `import.meta.env.VITE_API_URL` trực tiếp (`src/pages/Learning.tsx`, `src/pages/tasks/RunnersModal.tsx`).
- `Walkthrough.md` nhắc tới `src/pages/Notes.tsx` — file này không còn; `/notes` redirect sang `/tasks`.
- `src/doc/update_v1.01.md` là bản bổ sung cũ dạng text thô; ưu tiên `tasks-api.md` / `notes-api.md` khi mâu thuẫn.
- Trạng thái task `COMPLETED` (Done) chỉ người dùng đặt; luồng của Claude dừng ở `IN_REVIEW` (xem `src/doc/task-agent-mcp.md` mục 3.1). Nhãn/màu trạng thái lấy từ `STATUS_OPTIONS` (`shared.tsx`) và `PLAN_STATUS` / `RUN_STATUS` (`agent.ts`), đừng định nghĩa lại.
- Google login redirect về `FRONTEND_URL` của BE (`src/doc/auth-api.md` mục 5): chạy FE local trỏ vào BE thật sẽ bị đưa về site production sau khi đăng nhập.
- `localDocs.ts` dùng File System Access API — chỉ chạy trên Chrome / Edge; kiểm tra `isLocalDocsSupported()`.
