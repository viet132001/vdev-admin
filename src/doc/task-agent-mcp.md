# VDEV Task Agent — Claude lập kế hoạch & thực hiện task

Giải pháp cho phép Claude **lập kế hoạch từ mô tả**, chờ người dùng duyệt, rồi **tự làm từng task trong thư mục code của project**, cập nhật trạng thái và để lại bản thay đổi code cho người dùng review.

Tài liệu mở rộng `tasks-api.md`; quy ước chung (Base URL, định dạng phản hồi / lỗi, xóa mềm, `position`) giữ nguyên như tài liệu đó.

---

## 1. Phạm vi & giả định

* VDEV Admin (trình duyệt), thư mục code của project và Claude **chạy trên cùng một máy**. BE có thể chạy ở máy đó hoặc ở server (hiện tại là server) — runner chỉ gọi **ra** BE nên không cần mở cổng.
* Claude **không** chạy git. Từ mục 15 (git flow): **runner** đặt nhánh riêng cho mỗi task, commit + push và mở pull request; người dùng review rồi Merge (trên VDEV hoặc GitHub). Trước git flow, thay đổi nằm nguyên trong thư mục làm việc để người dùng tự commit.
* Mỗi project (workspace) có **một hoặc nhiều repo** (mục 15); tại một thời điểm chỉ có **một** lượt chạy của Claude trên một project.
* Người dùng là người duy nhất được: duyệt kế hoạch, chốt task **Done**, yêu cầu làm lại. Claude không có quyền làm các việc này.

---

## 2. Thành phần

```
┌──────────────┐   REST (JWT người dùng)   ┌──────────────┐
│  VDEV Admin  │ ────────────────────────► │      BE      │
│  (browser)   │                           │  /api/...    │
└──────────────┘                           └──────▲───────┘
                                                  │ REST (token runner / token lượt chạy)
                                                  │ poll việc, báo kết quả, gửi diff
┌─────────────────────────── Máy của người dùng ──┴──────────────────────────────┐
│  vdev-agent (runner, chạy nền)                                                   │
│    ├─ nhận việc (AgentRun) từ BE                                                 │
│    ├─ chụp trạng thái thư mục trước / sau (để tạo diff)                          │
│    └─ chạy Claude bằng Claude Agent SDK, cwd = thư mục project                   │
│          └─ VDEV MCP tools (in-process): đọc task, tạo plan, cập nhật trạng thái │
│  Thư mục project (repo git)  ◄── Claude đọc / sửa file                           │
└──────────────────────────────────────────────────────────────────────────────────┘
```

| Thành phần | Vai trò | Ai làm |
|---|---|---|
| **BE** | Lưu workspace, plan, hàng đợi lượt chạy (`AgentRun`), changeset, kiểm soát chuyển trạng thái & phân quyền | BE |
| **vdev-agent** | Tiến trình Node chạy nền: nhận việc, khởi chạy Claude, tạo diff, gửi log | Repo mới `vdev-agent` |
| **VDEV MCP tools** | Bộ tool Claude dùng để làm việc với VDEV, gắn với **một lượt chạy** | Nằm trong `vdev-agent` |
| **VDEV Admin** | Cấu hình thư mục, tạo yêu cầu, duyệt plan, xem tiến trình, review diff, Done / làm lại | FE |

---

## 3. Luồng làm việc

```
1. Tạo project ─ chọn thư mục làm việc (runner xác nhận thư mục hợp lệ)
2. Tạo yêu cầu: mô tả việc cần làm ─ bấm "Nhờ Claude lập kế hoạch"
        └─► BE tạo AgentRun(PLAN) ─► runner chạy Claude (chỉ đọc) ─► create_plan
3. Plan [Chờ duyệt] ─ người dùng sửa / bỏ mục ─ Duyệt  (hoặc Từ chối + góp ý ─► Claude lập lại)
        └─► BE tạo task cha "Plan: …" + task con cho từng mục, tạo AgentRun(EXECUTE)
4. Runner chạy Claude trong thư mục project, lần lượt từng task:
        Cần làm ─► Đang làm ─► (code + tự kiểm tra) ─► Chờ review   + changeset (diff)
5. Người dùng mở task, xem tab "Thay đổi code":
        ├─ Done                      ─► task Hoàn thành (Done)
        └─ Ghi chú + "Làm lại"       ─► task về Cần làm, BE tạo AgentRun(REWORK)
                                        ─► Claude sửa theo ghi chú ─► Chờ review (revision mới)
```

### 3.1 Trạng thái task

Thêm `IN_REVIEW` vào `TaskStatus`. Nhãn hiển thị theo đúng cách gọi của người dùng:

| `TaskStatus` | Nhãn trên giao diện | Ai đặt |
|---|---|---|
| `PENDING` | Cần làm | Hệ thống (task mới), người dùng (làm lại) |
| `IN_PROGRESS` | Đang làm | Claude (`start_task`) |
| `IN_REVIEW` | **Claude đã xong · chờ review** | Claude (`finish_task`) |
| `COMPLETED` | **Done** | **Chỉ người dùng** |
| `CANCELLED` | Đã hủy | Người dùng |

> Lý do không để Claude đặt `COMPLETED`: `completedAt`, thống kê và cột Done phải phản ánh việc **người dùng đã chấp nhận**. "Hoàn thành" của Claude = `IN_REVIEW`.

* Project tạo mới có 4 cột mặc định: `Cần làm` (PENDING) · `Đang làm` (IN_PROGRESS) · `Chờ review` (IN_REVIEW) · `Done` (COMPLETED).
* Project cũ: BE migration thêm cột `Chờ review` (category `IN_REVIEW`) trước cột `COMPLETED` đầu tiên.
* Quy tắc đồng bộ cột ↔ status ở `tasks-api.md` mục 2 áp dụng nguyên cho `IN_REVIEW`.
* Token agent chỉ được đi theo các bước: `PENDING → IN_PROGRESS → IN_REVIEW`. Mọi chuyển trạng thái khác bằng token agent ⇒ `403`.

### 3.2 Trạng thái plan

`DRAFTING` (Claude đang lập) → `PENDING_APPROVAL` → `APPROVED` → `DONE` (mọi task con `COMPLETED`)
Nhánh: `PENDING_APPROVAL → REJECTED` (kèm góp ý) → `DRAFTING` (lập lại) · bất kỳ lúc nào → `CANCELLED`.

### 3.3 Trạng thái lượt chạy (`AgentRun`)

`QUEUED → RUNNING → SUCCEEDED | FAILED | CANCELLED`. Runner gửi heartbeat mỗi 15s; quá 2 phút không có heartbeat ⇒ BE đánh dấu `FAILED` (lý do `RUNNER_LOST`) và trả task đang `IN_PROGRESS` về `PENDING`.

---

## 4. Mô hình dữ liệu

### 4.1 Bổ sung vào bảng có sẵn

| Bảng | Trường mới | Ghi chú |
|---|---|---|
| `TaskProject` | `workspacePath?`, `workspaceStatus` (`UNKNOWN / OK / INVALID`), `workspaceCheckedAt?`, `workspaceMessage?`, `agentSettings` (JSON, xem 4.3) | Thư mục làm việc trên máy runner |
| `Task` | `planId?`, `assignee` (`USER / AGENT`, mặc định `USER`), `reworkNote?` | |
| `TaskComment` | `authorType` (`USER / AGENT / SYSTEM`), `runId?` | Nhật ký của Claude hiển thị như bình luận |
| enum `TaskStatus` | `IN_REVIEW` | |

### 4.2 Bảng mới

| Bảng | Trường |
|---|---|
| `TaskPlan` | `id`, `ownerId`, `projectId`, `title`, `goal` (mô tả người dùng nhập), `content` (markdown kế hoạch), `status`, `feedback?`, `parentTaskId?`, `approvedAt?`, timestamps |
| `TaskPlanItem` | `id`, `planId`, `title`, `description`, `acceptanceCriteria` (string[]), `priority`, `position`, `included` (bool, người dùng bỏ chọn khi duyệt), `taskId?` |
| `AgentRunner` | `id`, `ownerId`, `name` (hostname), `tokenHash`, `version`, `lastSeenAt`, `revokedAt?` |
| `AgentRun` | `id`, `ownerId`, `projectId`, `type` (`PLAN / EXECUTE / REWORK`), `planId?`, `taskId?`, `status`, `runnerId?`, `claimedAt?`, `heartbeatAt?`, `finishedAt?`, `error?`, `costUsd?`, `numTurns?`, `claudeSessionId?`, `cancelRequested` |
| `AgentRunLog` | `id`, `runId`, `seq`, `level` (`INFO / TOOL / ERROR`), `message`, `createdAt` — tối đa 2000 dòng / lượt |
| `TaskChangeSet` | `id`, `taskId`, `runId`, `revision` (1, 2, 3… theo task), `baseTree`, `headTree`, `stats` (`files`, `additions`, `deletions`), `summary`, `selfReview` (JSON, xem 6.3), `createdAt` |
| `TaskChangeFile` | `id`, `changeSetId`, `path`, `oldPath?`, `status` (`A / M / D / R`), `additions`, `deletions`, `isBinary`, `truncated`, `patch` (text) |
| `TaskReviewNote` | `id`, `taskId`, `changeSetId?`, `filePath?`, `line?`, `side?` (`OLD / NEW`), `body`, `resolvedInRevision?`, `createdAt` |

### 4.3 `agentSettings` của project

```json
{
  "enabled": true,
  "testCommand": "npm test",
  "lintCommand": "npm run lint",
  "buildCommand": "npm run build",
  "excludePatterns": [".env*", "*.pem", "*.key", "node_modules/", "dist/"],
  "maxTurnsPerTask": 80,
  "maxBudgetUsdPerRun": 5
}
```
Lệnh nào để trống thì Claude bỏ qua bước đó khi tự kiểm tra.

---

## 5. API (BE)

### 5.1 Workspace của project
| Method | Endpoint | Ghi chú |
|---|---|---|
| PATCH | `/api/task-projects/:id` | Thêm `workspacePath`, `agentSettings`. Đổi `workspacePath` ⇒ `workspaceStatus = UNKNOWN`, runner kiểm tra lại |
| POST | `/api/task-projects/:id/workspace/verify` | Yêu cầu runner kiểm tra ngay. Phản hồi `{ workspaceStatus, workspaceMessage, workspaceCheckedAt }` (BE đợi tối đa 10s, quá hạn trả `UNKNOWN`) |

Runner kiểm tra: đường dẫn tuyệt đối, tồn tại, là git repo, có quyền ghi. `workspaceMessage` ví dụ: `"Không phải git repo"`, `"OK · branch main · 3 file chưa commit"`.

### 5.2 Kế hoạch
| Method | Endpoint | Quyền | Ghi chú |
|---|---|---|---|
| POST | `/api/task-plans` | User | `{ "projectId", "title", "goal" }` ⇒ plan `DRAFTING` + `AgentRun(PLAN)`. Lỗi `409` nếu workspace chưa `OK` hoặc runner offline |
| GET | `/api/task-plans?projectId=&status=` | User | |
| GET | `/api/task-plans/:id` | User, Agent | Plan + `items` + run gần nhất |
| PATCH | `/api/task-plans/:id/items/:itemId` | User | Sửa `title`, `description`, `acceptanceCriteria`, `priority`, `included` khi `PENDING_APPROVAL` |
| POST | `/api/task-plans/:id/approve` | **Chỉ User** | Tạo task cha + task con (các item `included`), `assignee = AGENT`, rồi tạo `AgentRun(EXECUTE)`. Một transaction |
| POST | `/api/task-plans/:id/reject` | **Chỉ User** | `{ "feedback": "..." }` ⇒ `REJECTED`, tạo `AgentRun(PLAN)` mới kèm góp ý |
| POST | `/api/task-plans/:id/cancel` | User | Hủy plan + hủy run đang chờ / đang chạy |
| POST | `/api/task-plans/:id/retry` | User | *(bổ sung)* Chạy lại sau khi run lỗi / bị hủy: plan `DRAFTING` / `REJECTED` ⇒ `AgentRun(PLAN)`; plan `APPROVED` còn task agent chưa xong ⇒ `AgentRun(EXECUTE)`. `409` nếu đang có run chờ / chạy |

### 5.3 Review task (người dùng)
| Method | Endpoint | Ghi chú |
|---|---|---|
| GET | `/api/tasks/:id/changesets` | Danh sách revision (không kèm `patch`) |
| GET | `/api/changesets/:id/files?path=` | Patch của một file (tải khi mở file) |
| GET | `/api/tasks/:id/review-notes` | *(bổ sung)* Danh sách ghi chú, kèm `resolvedInRevision` |
| POST | `/api/tasks/:id/review-notes` | `{ "body", "changeSetId?", "filePath?", "line?", "side?" }` — ghi chú chung hoặc theo dòng |
| POST | `/api/tasks/:id/accept` | **Chỉ User.** `IN_REVIEW → COMPLETED` (Done) |
| POST | `/api/tasks/:id/request-rework` | **Chỉ User.** `{ "note": "..." }` ⇒ lưu `reworkNote`, task về `PENDING`, tạo `AgentRun(REWORK)` cho task đó. Các review note chưa `resolvedInRevision` được gửi kèm cho Claude |

### 5.4 Lượt chạy (người dùng xem / điều khiển)
| Method | Endpoint | Ghi chú |
|---|---|---|
| GET | `/api/agent/runs?projectId=&status=` | |
| GET | `/api/agent/runs/:id/logs?afterSeq=` | FE poll 2s khi đang `RUNNING` |
| POST | `/api/agent/runs/:id/cancel` | Đặt `cancelRequested`; runner dừng Claude ở lần heartbeat kế tiếp |
| GET | `/api/agent/runners` | Runner đã đăng ký + online (`lastSeenAt` < 60s) |
| POST | `/api/agent/runners` | Tạo runner, trả **token một lần** để dán vào cấu hình `vdev-agent` |
| DELETE | `/api/agent/runners/:id` | Thu hồi token |

### 5.5 Endpoint dành cho runner (token runner)
| Method | Endpoint | Ghi chú |
|---|---|---|
| POST | `/api/agent/runner/heartbeat` | `{ version, runningRunId?, workspaces: [{ projectId, workspacePath, status: "OK" \| "INVALID", message }] }` ⇒ `{ verifyWorkspaces: [{ projectId, workspacePath }], cancelRunIds: [] }`. Kết quả workspace bị bỏ qua nếu `workspacePath` đã đổi trong lúc kiểm tra |
| POST | `/api/agent/runner/claim` | Nhận 1 run `QUEUED` (khóa nguyên tử, bỏ qua project đang có run `RUNNING`). Trả `{ run, runToken, project: { id, name, workspacePath, agentSettings } }`, hoặc `{ run: null }` khi không có việc |
| POST | `/api/agent/runs/:id/logs` | `{ entries: [{ level, message }] }` |
| POST | `/api/agent/runs/:id/finish` | `{ status: "SUCCEEDED" \| "FAILED" \| "CANCELLED", error?, costUsd, numTurns, claudeSessionId }` |
| POST | `/api/tasks/:id/changesets` | Gửi changeset (6.2). Chỉ token lượt chạy của task đó |

**Token lượt chạy:** sinh khi claim, hết hạn khi run kết thúc, chỉ có quyền trên `projectId` (và `planId` / `taskId`) của run đó. Mọi MCP tool dùng token này.

**Định dạng token:** runner `vdr_…`, lượt chạy `vdx_…`; BE chỉ lưu SHA-256. Gửi qua `Authorization: Bearer <token>`. Token agent gọi vào API người dùng ⇒ `403`; token lượt chạy đã kết thúc ⇒ `401`.

### 5.6 Endpoint phía sau MCP tools (token lượt chạy)
| Tool | Method | Endpoint | Body |
|---|---|---|---|
| `get_context` | GET | `/api/agent/run/context` | — ⇒ `{ run, project, plan, tasks[] }`; mỗi task có `acceptanceCriteria`, `subtasks`, `reworkNote`, `unresolvedReviewNotes`, `firstBaseTree` (baseTree của revision 1 — dùng làm gốc diff khi làm lại), `latestChangeSet` |
| `submit_plan` | POST | `/api/agent/run/plan` | `{ content, items: [{ title, description, acceptanceCriteria[], priority? }] }` (1–20 mục, ≤ 20 tiêu chí / mục) |
| `start_task` | POST | `/api/agent/run/tasks/:taskId/start` | — |
| `log_progress` | POST | `/api/agent/run/tasks/:taskId/log` | `{ message }` |
| `toggle_subtask` | PATCH | `/api/agent/run/tasks/:taskId/subtasks/:subtaskId` | `{ isCompleted }` |
| `finish_task` | POST | `/api/tasks/:taskId/changesets` | `{ baseTree, headTree, summary, selfReview, files: [{ path, oldPath?, status, additions, deletions, isBinary?, truncated?, patch? }] }` (≤ 2000 file) ⇒ `{ changeSet, task }` |
| `report_blocked` | POST | `/api/agent/run/tasks/:taskId/blocked` | `{ reason }` |

Phạm vi: run `EXECUTE` chỉ đụng được task con `assignee = AGENT` của đúng plan; run `REWORK` chỉ đúng task của run; ngoài phạm vi ⇒ `403`. Chuyển status sai bước (vd. `finish_task` khi task chưa `IN_PROGRESS`) ⇒ `403`. Thiếu tiêu chí trong `selfReview.criteria` ⇒ `400` liệt kê từng tiêu chí (so khớp không phân biệt hoa thường / khoảng trắng thừa).

---

## 6. vdev-agent (runner)

### 6.1 Vòng làm việc
```
khởi động (đọc config: BE URL, token runner)
loop:
  heartbeat  ─► kiểm tra workspace được yêu cầu, hủy run nếu cancelRequested
  claim      ─► có run?
       PLAN    : Claude chỉ đọc (Read, Grep, Glob) + MCP get_plan / submit_plan
       EXECUTE : với từng task con theo thứ tự (bỏ qua task đã IN_REVIEW / COMPLETED):
                   snapshot trước ─► Claude làm task ─► snapshot sau ─► gửi changeset
       REWORK  : như EXECUTE cho 1 task, prompt kèm reworkNote + review notes
  finish     ─► báo kết quả, chi phí
```
* Chạy bằng **Claude Agent SDK** (TypeScript), `cwd = workspacePath`. Mỗi task là một phiên mới (ngữ cảnh sạch); lưu `claudeSessionId` để tra lại.
* Prompt hệ thống gồm: mục tiêu plan, mô tả + tiêu chí task, lệnh test / lint / build của project, quy tắc: **không chạy git commit / push / reset / checkout**, không sửa file ngoài thư mục, gọi `finish_task` kèm tự đánh giá khi xong.

### 6.2 Quyền của Claude khi chạy không có người giám sát
| | PLAN | EXECUTE / REWORK |
|---|---|---|
| Đọc file | ✔ | ✔ |
| Sửa / tạo file trong thư mục | ✘ | ✔ |
| Bash | ✘ | Chỉ `testCommand`, `lintCommand`, `buildCommand` và lệnh đọc (`ls`, `cat`, `git status`, `git diff`) |
| Luôn chặn | `git commit/push/reset/checkout/stash`, `rm -rf`, `curl/wget`, `sudo`, ghi ngoài `workspacePath` | |
| Giới hạn | `maxTurnsPerTask`, `maxBudgetUsdPerRun` (vượt ⇒ run `FAILED`, task về `PENDING` kèm log) | |

### 6.3 Tạo diff mà không commit
Runner (không phải Claude) chụp cây thư mục bằng **index tạm**, không đụng tới index, branch hay lịch sử git của người dùng:
```bash
export GIT_INDEX_FILE=$TMP/vdev.index   # index tạm, xóa trước mỗi lần chụp
git read-tree HEAD                      # bắt đầu từ HEAD cho nhanh
git add -A -- . ':!.env*' ':!*.pem'     # mỗi excludePatterns thành một pathspec ':!<pattern>'
git write-tree                          # ⇒ <tree-sha>
unset GIT_INDEX_FILE
```
Đã thử trên repo mẫu: diff chỉ chứa thay đổi phát sinh giữa hai lần chụp, file loại trừ không xuất hiện, index (staged) và lịch sử commit của người dùng giữ nguyên.
* Chụp `baseTree` ngay trước khi Claude bắt đầu task, `headTree` ngay sau `finish_task`.
* `git diff --numstat` và `git diff --patch <baseTree> <headTree>` ⇒ `TaskChangeFile`. File nhị phân / lockfile ⇒ chỉ ghi `isBinary`; patch > 200KB / file hoặc > 2MB / changeset ⇒ cắt và đặt `truncated`.
* Mỗi lần `finish_task` (kể cả làm lại) ⇒ một revision mới; revision sau so với `baseTree` của **lần đầu** để luôn thấy toàn bộ thay đổi của task, FE có thể so 2 revision với nhau.
* Lưu ý cho người dùng (hiển thị trên UI khi run đang chạy): sửa file trong thư mục lúc Claude đang chạy sẽ lẫn vào diff của task.

`selfReview` do Claude gửi trong `finish_task`:
```json
{
  "criteria": [{ "text": "Form validate email", "met": true, "evidence": "LoginForm.tsx:42" }],
  "checks": [{ "name": "test", "command": "npm test", "passed": true, "output": "…(rút gọn)" }],
  "notes": "Chưa xử lý trường hợp …"
}
```
BE từ chối `finish_task` nếu thiếu `criteria` cho tiêu chí nào của task.

### 6.4 MCP tools (gắn với token lượt chạy)
| Tool | Dùng trong | Mô tả |
|---|---|---|
| `get_context` | Mọi run | Project, plan, task hiện tại, tiêu chí, `reworkNote`, review notes chưa xử lý |
| `submit_plan` | PLAN | `{ content, items: [{ title, description, acceptanceCriteria[], priority }] }` (1–20 mục) ⇒ plan `PENDING_APPROVAL` |
| `start_task` | EXECUTE / REWORK | `PENDING → IN_PROGRESS` |
| `log_progress` | EXECUTE / REWORK | Ghi bình luận `AGENT` vào task |
| `toggle_subtask` | EXECUTE / REWORK | Đánh dấu checklist |
| `finish_task` | EXECUTE / REWORK | `{ summary, selfReview }` ⇒ runner chụp `headTree`, gửi changeset, task `IN_PROGRESS → IN_REVIEW` |
| `report_blocked` | EXECUTE / REWORK | `{ reason }` ⇒ task về `PENDING`, ghi bình luận, run chuyển sang task tiếp theo |

Không có tool duyệt plan, chốt Done, xóa hay đổi project.

### 6.5 Cài đặt
* Repo `vdev-agent` (Node 20+, TypeScript, Claude Agent SDK) — hướng dẫn chi tiết trong `vdev-agent/README.md`.
* `vdev-agent init --api-url <url> --token <vdr_…> [--claude-token …|--api-key …]` lưu `~/.vdev-agent/config.json` (quyền 600).
* Xác thực Claude: gói Pro / Max qua `claude setup-token` (`CLAUDE_CODE_OAUTH_TOKEN`) hoặc API key (`ANTHROPIC_API_KEY`); có cả hai thì dùng API key. Giới hạn USD chỉ áp dụng khi dùng API key.
* `vdev-agent doctor [--live]`, `vdev-agent verify <thư-mục>`, `vdev-agent start`, `vdev-agent install-service` (launchd, log ở `~/.vdev-agent/logs/`).
* Quyền của Claude được kiểm tra trong hook `PreToolUse` (chạy trước cả cơ chế tự cho phép của Claude Code); runner không nạp settings / hook / MCP server của repo.
* `finish_task` do runner chạy lệnh test / lint / build; lệnh lỗi thì trả lỗi để Claude sửa (tối đa 3 vòng) trước khi gửi review.
* Lỗi lượt chạy có dạng `MÃ: mô tả` — `USAGE_LIMIT`, `AUTH_FAILED`, `BUDGET_EXCEEDED`, `WORKSPACE_INVALID`, `RUNNER_STOPPED`.

---

## 7. Thay đổi VDEV Admin (FE)

* **Project:** form tạo / sửa có mục *Thư mục làm việc* (đường dẫn tuyệt đối, nút *Kiểm tra* gọi 5.1) và *Cài đặt agent* (lệnh test / lint / build, file loại trừ). Hiển thị trạng thái runner (online / offline).
* **Kế hoạch:** nút *Nhờ Claude lập kế hoạch* (nhập mô tả) trong project; trang plan hiển thị markdown + danh sách mục (sửa, bỏ chọn), nút *Duyệt* / *Từ chối + góp ý*; sidebar có số plan chờ duyệt.
* **Board:** cột `Chờ review`; card task của agent có nhãn "Claude", số `+/−` của revision mới nhất; khi đang chạy hiện "Claude đang làm".
* **Chi tiết task:** tab *Thay đổi code* (cây file, diff unified / split, chọn revision, ghi chú theo dòng, kết quả tự kiểm tra), tab *Hoạt động* (log lượt chạy + bình luận agent). Nút **Done** và **Ghi chú & làm lại** khi task `IN_REVIEW`.
* **Cài đặt:** tạo / thu hồi runner token.

---

## 8. Bảo mật

* Duyệt plan, Done, làm lại, tạo / thu hồi runner chỉ chấp nhận **JWT người dùng**; token runner / lượt chạy gọi vào ⇒ `403`.
* Token lượt chạy chỉ có hiệu lực trong phạm vi project / plan / task của run và hết hạn khi run kết thúc.
* `excludePatterns` áp dụng **ở runner** trước khi gửi diff — nội dung `.env`, khóa bí mật không rời khỏi máy.
* Runner kiểm tra mọi đường dẫn file nằm trong `workspacePath` (chống `../`).
* Log run và diff chỉ chủ project xem được.

---

## 9. Thứ tự triển khai

- [x] **BE 1:** `IN_REVIEW` + cột mặc định + migration project cũ; `workspacePath`, `agentSettings`; `assignee`, `authorType`
- [x] **BE 2:** `AgentRunner`, `AgentRun`, `AgentRunLog`, endpoint runner (5.5) + token lượt chạy
- [ ] **Runner 1:** heartbeat, kiểm tra workspace, claim, chạy run `PLAN`
- [ ] **BE 3 + FE 1:** plan (5.2) + màn duyệt plan + cấu hình workspace — *BE xong*
- [ ] **Runner 2 + BE 4:** run `EXECUTE`, snapshot diff, `TaskChangeSet`, MCP tools 6.4 — *BE xong (5.3, 5.6)*
- [ ] **FE 2:** tab *Thay đổi code*, *Hoạt động*, Done / làm lại (5.3)
- [ ] **Runner 3:** `REWORK`, hủy run, giới hạn turn / chi phí

---

## 10. Điểm còn mở

* Lần đầu nên chạy thử với project nhỏ, `maxBudgetUsdPerRun` thấp để ước lượng chi phí mỗi task.
* Nếu sau này BE chạy cùng máy, có thể bỏ cơ chế poll và để BE gọi runner trực tiếp — contract mục 5.5 không đổi.

---

## 11. Ghi chú triển khai BE

* **Module:** `src/modules/agent` (plan, run, runner, review, MCP). Logic đổi status ↔ cột dùng chung `TasksService.changeStatus` để agent và người dùng đi cùng một quy tắc.
* **Migration:** `20261023000000_add_task_in_review_status` (chỉ thêm giá trị enum — Postgres không cho dùng giá trị enum mới trong cùng transaction) và `20261023000100_add_task_agent` (bảng mới + chèn cột `Chờ review` cho project cũ; chạy lại không tạo trùng).
* **Tiêu chí nghiệm thu:** khi duyệt, `acceptanceCriteria` của mỗi mục thành **checklist (subtask)** của task con, nhờ đó `toggle_subtask` có tác dụng; `finish_task` đối chiếu với `TaskPlanItem.acceptanceCriteria`.
* **Kết thúc run:** task agent còn `IN_PROGRESS` thuộc phạm vi run luôn được trả về `PENDING` kèm bình luận `SYSTEM` (kể cả run `SUCCEEDED` mà Claude bỏ dở). Run `PLAN` báo `SUCCEEDED` nhưng chưa `submit_plan` ⇒ `FAILED` (`PLAN_NOT_SUBMITTED`).
* **RUNNER_LOST:** BE quét mỗi 30s ⇒ phát hiện trong 2–2,5 phút. Heartbeat chỉ gia hạn run được báo trong `runningRunId`; gửi log cũng gia hạn.
* **Review note** có trước lúc yêu cầu làm lại được đánh `resolvedInRevision` = revision mà lượt `REWORK` gửi lên.
* **Plan DONE:** khi task con cuối cùng (không tính task đã hủy) được Done, plan ⇒ `DONE` và task cha "Plan: …" ⇒ `COMPLETED`.
* **Kích thước:** body JSON tối đa 10MB (changeset). BE vẫn tự cắt patch > 200KB / file, > 2MB / changeset (`truncated = true`) và không lưu patch file nhị phân.
* **Board:** card task có thêm `assignee`, `planId` và `latestChangeSet` (`revision`, `stats` +/−). Bình luận có `authorType` (`USER / AGENT / SYSTEM`) và `runId`.
* **`workspaceVerifyRequestedAt`** (trường nội bộ) để heartbeat biết project nào cần kiểm tra ngay.

---

## 12. Đề xuất: trạng thái cho góp ý review *(chờ BE)*

Thay cơ chế `resolvedInRevision` (suy ra theo thời gian tạo) bằng **trạng thái rõ ràng cho từng góp ý** và **luồng trao đổi** giữa người dùng và Claude. Giải quyết luôn trường hợp lượt làm lại lỗi rồi chạy lại bằng `EXECUTE` mà góp ý không được đánh dấu.

### 12.1 Trạng thái

| `ReviewNoteStatus` | Nhãn | Ai đặt | Khi nào |
|---|---|---|---|
| `OPEN` | Góp ý mới | Người dùng | Tạo góp ý |
| `ADDRESSED` | Claude đã thực hiện | Claude (qua `finish_task`) | Claude trả lời góp ý ở revision mới |
| `FOLLOW_UP` | Góp thêm | Người dùng | Trả lời thêm vào góp ý đã `ADDRESSED` / `RESOLVED` |
| `RESOLVED` | Đã đóng | Người dùng | Chấp nhận cách Claude xử lý; hoặc tự động khi task **Done** |

```
OPEN ──(Claude trả lời ở rev N)──► ADDRESSED ──(người dùng đóng)──► RESOLVED
  ▲                                   │                               │
  └──────── FOLLOW_UP ◄──(góp thêm)───┴───────────(góp thêm)──────────┘
             └──(Claude trả lời ở rev N+1)──► ADDRESSED
```

### 12.2 Dữ liệu
* `TaskReviewNote`: thêm `status` (mặc định `OPEN`), `addressedInRevision?` (thay `resolvedInRevision`), `resolvedAt?`. Migration: góp ý có `resolvedInRevision` ⇒ `ADDRESSED` + chép sang `addressedInRevision`.
* Bảng mới `TaskReviewReply`: `id`, `noteId`, `authorType` (`USER / AGENT`), `body`, `revision?` (revision Claude trả lời), `createdAt`.
* `Task.reworkNote` giữ để tương thích, nhưng "Ghi chú & làm lại" từ nay tạo một góp ý chung (`filePath = null`, `status = OPEN`).

### 12.3 API người dùng
| Method | Endpoint | Ghi chú |
|---|---|---|
| GET | `/api/tasks/:id/review-notes` | Kèm `status`, `addressedInRevision`, `replies[]` |
| POST | `/api/tasks/:id/review-notes` | Tạo góp ý `OPEN` (chung hoặc theo dòng) |
| POST | `/api/review-notes/:id/replies` | **Chỉ User.** `{ body }` ⇒ thêm reply; note đang `ADDRESSED` / `RESOLVED` ⇒ `FOLLOW_UP` |
| PATCH | `/api/review-notes/:id` | **Chỉ User.** `{ status: "RESOLVED" }` (đóng) hoặc `{ body }` khi note còn `OPEN` |
| POST | `/api/tasks/:id/request-rework` | `{ note? }`: có `note` ⇒ tạo góp ý chung. Bắt buộc có ít nhất một góp ý `OPEN` / `FOLLOW_UP`, nếu không ⇒ `400` |
| POST | `/api/tasks/:id/accept` | Done ⇒ mọi góp ý chưa `RESOLVED` chuyển `RESOLVED` |

### 12.4 Phía Claude
* `get_context`: mỗi task trả `openReviewNotes` = góp ý `OPEN` / `FOLLOW_UP` kèm toàn bộ `replies` (để Claude đọc cả lịch sử trao đổi).
* `finish_task` thêm `noteResponses: [{ noteId, action: "FIXED" | "NOT_CHANGED", reply }]`:
  * Bắt buộc có đủ phản hồi cho mọi góp ý `OPEN` / `FOLLOW_UP` của task (giống cách kiểm tra `selfReview.criteria`), thiếu ⇒ `400`.
  * Mỗi phản hồi ⇒ tạo `TaskReviewReply` (`AGENT`, `revision` = revision mới) và note ⇒ `ADDRESSED`.
  * Áp dụng cho **mọi loại run** (`EXECUTE` lẫn `REWORK`), không còn dựa vào `run.createdAt`.
  * `NOT_CHANGED` dùng khi Claude không đồng ý / không làm được — `reply` phải giải thích lý do.

### 12.5 Chống gọi hai lần
FE khóa nút trong lúc chờ phản hồi. Ngoài ra đề xuất BE: `POST /api/task-plans/:id/retry` kiểm tra và tạo run trong **cùng transaction có khóa** (giống `approve`) để hai request đồng thời chỉ tạo một run.

---

## 13. Tài liệu & ngữ cảnh cho Claude *(chờ BE)*

Người dùng đính kèm tài liệu / hình ảnh để Claude lập kế hoạch tốt hơn. **File chỉ nằm trên máy người dùng**; server chỉ lưu đường dẫn và thông tin file. Có hai nguồn ngữ cảnh:

| Nguồn | Dùng cho | Cách khai báo |
|---|---|---|
| Tài liệu **trong repo** | Spec, guideline, kiến trúc — đi cùng code | `agentSettings.contextPaths` (đường dẫn tương đối trong `workspacePath`), Claude luôn đọc trước |
| Tài liệu **ngoài repo** | Ảnh chụp, mockup, PDF / Excel yêu cầu | Thư mục tài liệu (13.1), đính kèm vào kế hoạch hoặc thư viện project |

### 13.1 Thư mục tài liệu
* Người dùng cấu hình **một** thư mục gốc `docsRoot` (đường dẫn tuyệt đối, cấp user — dùng chung mọi project), ví dụ `/Users/viet/VDEV Docs`. Nên nằm **ngoài** mọi repo.
* Mỗi project có một thư mục con `docsFolder`, **tạo tự động lần upload đầu tiên**, tên theo tên project:
  * Bỏ ký tự không hợp lệ `/ \ : * ? " < > |` và ký tự điều khiển, gộp khoảng trắng, cắt tối đa 80 ký tự; rỗng ⇒ `project-<6 ký tự đầu của id>`.
  * Trùng tên với thư mục của project khác ⇒ thêm hậu tố ` (2)`, ` (3)`…
  * Đã tạo thì **giữ nguyên** kể cả khi đổi tên project (đường dẫn tài liệu không bị lệch).
* Cấu trúc:
```
<docsRoot>/
  .vdev-docs.json                      { "ownerId": "…", "version": 1 }
  <docsFolder>/                        ví dụ "VDEV Workspace"
    .vdev-project.json                 { "projectId": "…" }
    yeu-cau-nghiep-vu.pdf              thư viện tài liệu của project
    plans/2026-10-23-trang-quen-mat-khau/
      man-hinh-loi.png                 đính kèm của kế hoạch
```
* FE ghi file bằng **File System Access API** (Chrome / Edge): người dùng chọn thư mục gốc một lần trên mỗi trình duyệt; handle lưu ở IndexedDB; file đánh dấu `.vdev-docs.json` để nhận đúng thư mục. Trùng tên file trong cùng thư mục ⇒ FE thêm hậu tố ` (2)`.

### 13.2 Dữ liệu
| Bảng / trường | Ghi chú |
|---|---|
| User: `docsRoot?`, `docsRootStatus` (`UNKNOWN / OK / INVALID`), `docsRootMessage?`, `docsRootCheckedAt?` | Có thể đặt trong bảng cài đặt agent của user |
| `TaskProject.docsFolder?` | Tên thư mục con, unique theo user |
| `ProjectDocument`: `id`, `projectId`, `relativePath` (tương đối trong `docsFolder`), `name`, `mimeType`, `size`, `sha256`, `alwaysInclude` (bool), `note?`, `missing` (bool), `createdAt`, `deletedAt?` | Thư viện + file đính kèm kế hoạch đều là document |
| `TaskPlanAttachment`: `id`, `planId`, `documentId`, `note?`, `source` (`GOAL / FEEDBACK`) | Đính kèm lúc tạo kế hoạch (`GOAL`) hoặc lúc từ chối (`FEEDBACK`) |
| `agentSettings.contextPaths: string[]` | Mặc định `[]`; mỗi mục ≤ 300 ký tự, không chứa `..`, tối đa 20 mục |

### 13.3 API
| Method | Endpoint | Ghi chú |
|---|---|---|
| GET | `/api/agent/settings` | `{ docsRoot, docsRootStatus, docsRootMessage, docsRootCheckedAt }` |
| PATCH | `/api/agent/settings` | `{ docsRoot }` (tuyệt đối hoặc `null`) ⇒ status `UNKNOWN`, runner kiểm tra lại |
| PATCH | `/api/task-projects/:id` | Thêm `docsFolder` — chỉ đặt được khi đang `null` (đổi sau đó ⇒ `409`), `409` nếu trùng project khác |
| GET | `/api/task-projects/:id/documents` | Thư viện (`?includePlan=true` để lấy cả file đính kèm kế hoạch) |
| POST | `/api/task-projects/:id/documents` | `{ relativePath, name, mimeType, size, sha256, alwaysInclude?, note? }`; `relativePath` không chứa `..`, không bắt đầu bằng `/`. Giới hạn 20MB / file (FE kiểm tra trước) |
| PATCH | `/api/task-projects/:id/documents/:docId` | `alwaysInclude`, `note` |
| DELETE | `/api/task-projects/:id/documents/:docId` | Xóa mềm bản ghi (FE tự xóa file trên máy nếu người dùng chọn) |
| POST | `/api/task-plans` | Thêm `attachments: [{ documentId, note? }]` (≤ 10) |
| POST | `/api/task-plans/:id/reject` | Thêm `attachments` (source `FEEDBACK`) |
| GET | `/api/task-plans/:id` | Thêm `attachments: [{ id, note, source, document }]` |

### 13.4 Runner & Claude
* Heartbeat gửi thêm `docsRoot: { path, status, message }` và `missingDocuments: [documentId]` (file không còn trên đĩa). BE trả thêm `verifyDocsRoot: true` khi cần kiểm tra lại.
* `get_context` trả thêm `docsRoot`, `project.docsFolder`, `project.contextPaths`, `documents` (của project, `alwaysInclude = true`) và `plan.attachments`.
* Runner ghép `docsRoot / docsFolder / relativePath` thành đường dẫn tuyệt đối, cấp cho Claude quyền **chỉ đọc** `<docsRoot>/<docsFolder>`. `sha256` khác lúc đính kèm ⇒ ghi log cảnh báo "file đã bị sửa".
* Claude đọc trực tiếp ảnh (png / jpg / webp / gif) và PDF. `.docx` / `.xlsx` / `.pptx` ⇒ runner chuyển sang văn bản vào thư mục tạm của lượt chạy trước khi đưa cho Claude.
* Prompt lập kế hoạch liệt kê đủ file đính kèm kèm `note`, yêu cầu Claude xem hết trước khi đề xuất.

### 13.5 Giới hạn & đánh đổi
* Chỉ xem / mở được tài liệu trên máy có thư mục; máy khác hoặc app iOS chỉ thấy tên file.
* Server không giữ bản sao — gợi ý đặt `docsRoot` trong iCloud Drive / thư mục có Time Machine.
* Đổi tên / di chuyển file bằng Finder ⇒ runner báo `missing`; người dùng thêm lại tài liệu.

---

## 14. Chọn thư mục bằng hộp thoại của máy *(chờ BE)*

Trình duyệt không cho web biết đường dẫn tuyệt đối của thư mục người dùng chọn, nên nút **Chọn…** ở "Thư mục làm việc" nhờ **runner** mở hộp chọn thư mục gốc của hệ điều hành (macOS Finder / Windows / Linux zenity) rồi trả đường dẫn về.

```
FE  POST /api/agent/folder-picks ──► BE tạo yêu cầu (PENDING, hết hạn sau 2 phút)
runner heartbeat ◄── folderPicks: [{ id, prompt }]  (BE chuyển PICKING, chỉ giao 1 lần)
runner mở hộp chọn thư mục → POST /api/agent/runner/folder-picks/:id { status, path?, workspace? }
FE  GET /api/agent/folder-picks/:id (poll 1s) ──► DONE + path → điền vào ô
```

* Có thể lưu trong bộ nhớ BE (Map + TTL 2 phút), không cần bảng mới.

| Method | Endpoint | Quyền | Ghi chú |
|---|---|---|---|
| POST | `/api/agent/folder-picks` | User | `{ prompt? }` (≤ 200 ký tự, ví dụ "Chọn thư mục code cho Satori_ERP") ⇒ `{ id, status: "PENDING", expiresAt }`. `409` nếu không có runner online |
| GET | `/api/agent/folder-picks/:id` | User (chủ yêu cầu) | `{ id, status, path?, message?, workspace?: { ok, message } }`; `status`: `PENDING / PICKING / DONE / CANCELLED / FAILED / EXPIRED` |
| POST | `/api/agent/runner/folder-picks/:id` | Runner | `{ status: "DONE" \| "CANCELLED" \| "FAILED", path?, message?, workspace?: { ok, message } }` — chỉ runner đã nhận yêu cầu |
| — | Heartbeat response | Runner | Thêm `folderPicks: [{ id, prompt }]` — yêu cầu `PENDING` của chủ runner; giao xong chuyển `PICKING` |

* `path` phải là đường dẫn tuyệt đối, ≤ 1000 ký tự. `workspace` là kết quả runner tự kiểm tra (git repo, quyền ghi) để FE hiện luôn.
* `PICKING` quá 2 phút không có kết quả ⇒ `EXPIRED`.

---

## 15. Git flow & workspace nhiều repo

Thay cho "Claude không commit": mỗi task làm trên **nhánh riêng**, runner commit + push và mở **pull request** cho từng repo task sửa. Merge (trên VDEV hoặc GitHub) ⇒ task Done, nhánh / worktree được dọn. Một project (workspace) có **nhiều repo** (BE, FE, runner…) để một task phân tích và sửa xuyên repo.

### 15.1 Luồng

```
Workspace = N repo, mỗi repo có CLAUDE.md trên origin/<nhánh gốc>  (thiếu ⇒ không lập kế hoạch được)
1. Lập kế hoạch: Claude đọc CLAUDE.md của mọi repo, mỗi mục ghi `repos` (bắt buộc khi > 1 repo)
2. Duyệt ⇒ mỗi task có branchName = vdev/<8 ký tự id>-<slug tiêu đề> (cùng tên ở mọi repo)
3. Runner, từng task: fetch ─► nhánh task từ origin/<nhánh gốc> (hoặc nhánh PR của task nó phụ thuộc)
        ─► Claude làm trong các thư mục repo ─► finish_task: context review + lệnh kiểm tra của từng repo
        ─► BE nhận changeset ─► commit + push + PR mỗi repo (PR liên kết nhau) ─► Chờ review
4. Review trên VDEV (diff, góp ý) hoặc GitHub
        ├─ Làm lại ─► cùng nhánh / worktree, commit mới, comment vào PR đang mở
        ├─ Merge (VDEV) ─► AgentRun(MERGE): gh pr merge từng repo ─► xoá nhánh + worktree ─► Done
        ├─ Merge cả kế hoạch ─► AgentRun(MERGE, planId, không taskId): mỗi repo gộp mọi task còn PR mở
        │     thành 1 commit trên vdev/plan-<8 ký tự id> ─► 1 PR / repo ─► merge 1 lần ─► đóng PR lẻ + xoá nhánh ─► Done
        ├─ Merge trên GitHub ─► heartbeat đồng bộ trạng thái PR ─► Done + dọn nhánh
        └─ Đóng PR & hủy ─► AgentRun(ROLLBACK): đóng PR, xoá nhánh (nhánh gốc không bị đụng)
```

Claude **không bao giờ** chạy git / gh (hook chặn `git commit/push/branch/worktree…`, `gh`): runner làm mọi thao tác git. Token GitHub nằm trong `gh` trên máy chạy, server chỉ lưu số / URL / trạng thái PR.

### 15.2 Dữ liệu

| Bảng / trường | Ghi chú |
|---|---|
| `ProjectRepo` | `projectId`, `name` (slug `^[a-z0-9][a-z0-9._-]{0,39}$`, unique theo project), `path`, `defaultBranch` (`main`), `contextFile` (`CLAUDE.md`), `checkoutMode` (`WORKTREE` / `IN_PLACE`), `setupCommand?`, `testCommand?`, `lintCommand?`, `buildCommand?`, `position`, `status` (`UNKNOWN / OK / INVALID`), `message`, `hasContext`, `remoteUrl?`, `checkedAt?`, `verifyRequestedAt?` |
| `TaskPullRequest` | `taskId`, `repoId` (unique cặp), `branch`, `baseBranch`, `number?`, `url?`, `state` (`OPEN / MERGED / CLOSED`), `headSha?`, `reviewDecision?`, `error?` (push / tạo PR / merge lỗi), `mergedAt?`, `syncedAt?` |
| `Task.branchName` | Đặt khi duyệt plan |
| `TaskPlanItem.repos` (`string[]`), `kind` (`TASK / CONTEXT`) | `repos` rỗng = mọi repo. `CONTEXT` = mục "tạo file context" (Claude được khám phá repo) |
| `TaskChangeSet.repos` (JSON) | `[{ repo, baseTree, headTree, branch, baseBranch }]`; `baseTree/headTree` cũ = của repo đầu tiên |
| `TaskChangeSet.contextReview` (JSON) | `[{ repo, needsUpdate, updated, reason }]` |
| `TaskChangeFile.repo` | Workspace > 1 repo: `path` = `<repo>/<đường dẫn trong repo>` |
| `AgentRunType.MERGE` | Run merge PR của một task |
| `agentSettings.mergeMethod` | `squash` (mặc định) / `merge` / `rebase` |

* **TaskProject** giữ `workspacePath / workspaceStatus / workspaceMessage` làm **trạng thái gộp**: `workspacePath` = repo đầu tiên; `OK` chỉ khi mọi repo `OK` **và** có file context. Lệnh test / lint / build chuyển xuống repo (project 1 repo vẫn dùng lệnh của project nếu repo chưa có).
* **Migration** `20261104000100_add_git_workflow`: project cũ có `workspacePath` ⇒ một repo `IN_PLACE` (giữ cách app / Docker chạy từ thư mục đó), chép lệnh test / lint / build; mọi project về `UNKNOWN` để runner kiểm tra lại (thêm điều kiện remote, gh, file context). Task cũ không có PR vẫn Done / Rollback như trước.

### 15.3 API

| Method | Endpoint | Quyền | Ghi chú |
|---|---|---|---|
| GET | `/api/task-projects/:id/repos` | User | |
| POST | `/api/task-projects/:id/repos` | User | `{ name, path, defaultBranch?, contextFile?, checkoutMode?, setupCommand?, testCommand?, lintCommand?, buildCommand? }`. Trùng tên ⇒ `409` |
| PATCH | `/api/task-projects/:id/repos/:repoId` | User | Đổi `path / defaultBranch / contextFile` ⇒ `UNKNOWN`, kiểm tra lại. Đổi tên khi đã có plan / PR dùng ⇒ `409` |
| DELETE | `/api/task-projects/:id/repos/:repoId` | User | Còn PR `OPEN` ⇒ `409` |
| POST | `/api/task-projects/:id/repos/:repoId/init-context` | User | Repo `OK` mà thiếu file context ⇒ plan `APPROVED` một mục `CONTEXT` + `AgentRun(EXECUTE)`. Đã có / đang có task tạo ⇒ `409` |
| POST | `/api/task-projects/:id/workspace/verify` | User | Kiểm tra **mọi repo** (đợi ≤ 10s) ⇒ trạng thái gộp + `repos` |
| PATCH | `/api/task-projects/:id` | User | `workspacePath` (FE cũ) = repo đầu tiên: chưa có repo ⇒ tạo, 1 repo ⇒ đổi path, > 1 repo ⇒ `400` |
| POST | `/api/task-plans` | User | Thêm `409 CONTEXT_MISSING: repo "x" has no CLAUDE.md on origin/main` |
| PATCH | `/api/task-plans/:id/items/:itemId` | User | Thêm `repos` |
| GET | `/api/tasks/:id/pull-requests` | User | Card / chi tiết task cũng có `pullRequests` (`repo` = tên) |
| POST | `/api/tasks/:id/merge` | **Chỉ User** | Task `IN_REVIEW / TESTING` có PR `OPEN` ⇒ `AgentRun(MERGE)`. PR đã `CLOSED` ⇒ `409`; task cần trước (dependsOn) còn PR mở ⇒ `409 Merge first: "…"` |
| POST | `/api/task-plans/:id/merge` | **Chỉ User** | Merge cả kế hoạch ⇒ `AgentRun(MERGE)` theo plan. Mọi task agent còn dở phải `IN_REVIEW / TESTING`, ≥ 1 task có PR `OPEN`, không PR nào `CLOSED`; đang có merge của plan ⇒ `409`. Trong lúc đó merge lẻ một task ⇒ `409` |
| POST | `/api/tasks/:id/accept` | User | Còn PR `OPEN` ⇒ `409` (Done đi qua Merge) |

Runner:

| Method | Endpoint | Ghi chú |
|---|---|---|
| POST | `/api/agent/runner/heartbeat` | Body thêm `repos: [{ repoId, path, status, message, hasContext, remoteUrl }]`. Phản hồi thêm `verifyRepos: [{ repoId, projectId, path, defaultBranch, contextFile }]`, `syncPullRequests: [{ id, url, branch, taskId, projectId, repo: { name, path, checkoutMode, defaultBranch } }]` (PR `OPEN`, mỗi PR tối đa 1 lần / phút, 20 / lần). `verifyWorkspaces` luôn rỗng |
| POST | `/api/agent/runner/pull-requests` | `{ results: [{ id, state, mergedAt?, headSha?, reviewDecision? }] }` ⇒ PR `MERGED` hết ⇒ task Done (+ plan DONE), `CLOSED` ⇒ bình luận SYSTEM |
| POST | `/api/agent/runner/claim` | `project.repos` (đủ trường của 15.2) |
| GET | `/api/agent/run/context` | `project.repos`; mỗi task thêm `kind`, `repos`, `branchName`, `pullRequests` (kèm `basePullRequest` khi PR xếp chồng), `dependsOnPullRequests`, `firstRepos` |
| POST | `/api/tasks/:id/changesets` | Thêm `repos`, `contextReview`, `files[].repo`. Thiếu context review cho repo trong `repos`, hoặc `needsUpdate && !updated` ⇒ `400` |
| POST | `/api/agent/run/tasks/:taskId/pull-requests` | `{ pullRequests: [{ repo, branch, baseBranch, number?, url?, state?, headSha?, mergedAt?, error? }] }` (upsert theo repo). Run `MERGE`: mọi PR `MERGED` ⇒ task Done |

### 15.4 Runner

* **Kiểm tra repo:** git repo, có quyền ghi, có `origin`, `fetch origin <defaultBranch>` được, `gh auth status` OK, `git cat-file -e origin/<defaultBranch>:<contextFile>` (file có trên máy mà chưa push ⇒ báo rõ). `vdev-agent verify <thư-mục> [--branch] [--context]`, `vdev-agent doctor` kiểm tra thêm `gh`.
* **Nhánh của task** ở mỗi repo: có sẵn (local / origin) ⇒ dùng tiếp (làm lại); chưa có ⇒ tạo từ `origin/<nhánh gốc>`, hoặc từ nhánh PR đang mở của task nó `dependsOn` (PR xếp chồng, base = nhánh đó).
  * `WORKTREE` (mặc định): `~/.vdev-agent/worktrees/<projectId>/<taskId>/<repo>`, chạy `setupCommand` một lần (`{repo}` = thư mục gốc, vd `ln -s {repo}/node_modules node_modules`). Thư mục của người dùng không bị đụng; mẫu loại trừ dạng thư mục (`node_modules/`) loại cả symlink.
  * `IN_PLACE`: thư mục phải sạch (`WORKSPACE_DIRTY` nếu không), `git switch` sang nhánh task, xong trả về nhánh cũ; việc dở được lưu thành commit WIP trên nhánh task. Dùng khi app / Docker chạy từ thư mục repo (ảnh chụp màn hình, test Odoo).
* **Claude:** `cwd` = repo đầu tiên của task, repo khác qua `additionalDirectories`; ghi được trong mọi repo của task, không bao giờ vào `.git` (thư mục hay file worktree).
* **finish_task:** không có thay đổi ⇒ trả lỗi (gọi `report_blocked`). Context review sai ⇒ trả lỗi cho Claude sửa. Lệnh kiểm tra của **từng repo có thay đổi** (tên `repo:test` khi > 1 repo). BE nhận changeset ⇒ **sau đó** mới `git add` (cùng pathspec loại trừ) + `commit --no-verify` (`<tiêu đề>` + `VDEV-Task: <id> · revision N`) + `push -u` + `gh pr create` (body: summary, tiêu chí, kiểm tra, context, ghi chú). PR đã mở ⇒ comment "Revision N". Nhiều repo ⇒ mỗi PR có mục "PR liên quan". Lỗi push / gh ⇒ ghi `error` vào PR, review vẫn có; Merge / làm lại sẽ thử lại.
* **MERGE:** từng PR theo thứ tự repo: chưa có PR ⇒ push + tạo trước; PR xếp chồng ⇒ PR gốc phải `MERGED` (`MERGE_ORDER` nếu chưa), squash / rebase ⇒ `git rebase --onto origin/<gốc> <head PR gốc>` + push `--force-with-lease` (`REBASE_CONFLICT` nếu lỗi), `gh pr edit --base <gốc>`; `gh pr merge --<method>`; GitHub chưa merge (chờ review / check bắt buộc) ⇒ run lỗi kèm lý do. Merge xong ⇒ xoá worktree, nhánh local + origin, ref `refs/vdev/<task>/*`, `IN_PLACE` đang ở nhánh gốc và sạch ⇒ `merge --ff-only`.
* **MERGE cả kế hoạch** (run không có `taskId`): từng repo, worktree tạm `--detach` trên `origin/<gốc>` (`~/.vdev-agent/worktrees/<projectId>/plan-<planId>/<repo>`, thư mục người dùng không bị đụng) ⇒ `git merge --no-ff` nhánh từng task theo thứ tự mục (nhánh local trước, rồi origin; nhánh xếp chồng tự khớp) ⇒ xung đột ⇒ `MERGE_CONFLICT` kèm file, không push gì ⇒ `reset --soft origin/<gốc>` + **một commit** (`VDEV-Plan` + `VDEV-Task` từng task) ⇒ push `--force` `vdev/plan-<8 ký tự>` (bỏ qua nếu tree giống lần trước, để check PR không chạy lại) ⇒ PR gộp (dùng lại PR đang mở) ⇒ `gh pr merge --<method>` ⇒ PR lẻ của task: comment link PR gộp + đóng, dọn nhánh / worktree, báo `MERGED` ⇒ task Done. Diff rỗng (PR gộp đã được merge trên GitHub sau một lượt lỗi) ⇒ coi như đã merge. Một repo lỗi không ảnh hưởng repo đã merge xong; bấm lại chỉ làm phần còn lại.
* **Đồng bộ GitHub:** `syncPullRequests` từ heartbeat chạy nền (`gh pr view`); `MERGED` ⇒ báo BE + dọn nhánh (đợi tới khi run của cùng project kết thúc). `CLOSED` không dọn (người dùng có thể mở lại).
* **ROLLBACK:** task có PR / nhánh ⇒ đóng PR, xoá nhánh, `rollbackDone({ files: [] })`; task trước git flow ⇒ trả file như mục cũ.
* **TEST:** chạy lại lệnh kiểm tra trên nhánh task (worktree hoặc switch tạm) cho từng repo trong `firstRepos`.

### 15.5 File context bắt buộc & context review

* Mọi repo phải có `contextFile` trên `origin/<defaultBranch>` (nơi mọi nhánh task bắt đầu). Thiếu ⇒ workspace `INVALID`, nút **Nhờ Claude tạo CLAUDE.md** (kế hoạch `CONTEXT`: Claude khám phá repo bằng model lập kế hoạch, viết ≤ ~150 dòng gồm mục đích & stack, bản đồ thư mục, lệnh, quy ước, liên kết repo khác, điều cần tránh ⇒ PR). Merge PR rồi Kiểm tra lại ⇒ OK.
* Lập kế hoạch: prompt **bắt buộc** đọc file context của mọi repo trước khi mở code, phân tích luồng xuyên repo (contract API, kiểu dữ liệu) để các mục khớp nhau.
* Làm task: trước `finish_task`, với mỗi repo đã sửa Claude mở file context và tự hỏi thay đổi có làm nó sai / thiếu không (module / endpoint / lệnh / quy ước / phụ thuộc mới). `contextReview` bắt buộc đủ repo; `needsUpdate` ⇒ phải sửa file trong cùng task (runner đối chiếu diff); `updated` mà file không đổi ⇒ lỗi. Kết quả hiện ở tab Thay đổi code và trong PR.

### 15.6 VDEV Admin

* **Workspace & Claude:** danh sách repo (trạng thái, nhánh gốc, chế độ checkout), thêm / sửa / bỏ repo (nút Chọn… qua runner, tên tự gợi ý từ thư mục), Kiểm tra, Nhờ Claude tạo CLAUDE.md, cách merge.
* **Kế hoạch:** chip repo trên từng mục; sửa mục chọn repo (bắt buộc khi > 1 repo).
* **Board:** chip PR (`repo #số`, màu theo trạng thái, link GitHub); task Claude đang làm có viền chạy quanh card, robot nhún nhảy + câu trạng thái vui; cột có task đang làm có robot nhỏ; task vừa Chờ review / Done ⇒ card bật nhẹ + pháo hoa ✨ / 🎉. Header có pill "Claude · <loại run>: <task>" + dòng log mới nhất. `prefers-reduced-motion` ⇒ tắt hết hiệu ứng.
* **Chi tiết task:** nhánh + PR (trạng thái, GitHub review decision, lỗi push), **Merge** thay cho Done khi có PR, "Đóng PR & hủy" thay Rollback, file nhóm theo repo, mục "File context của repo".

### 15.7 Giới hạn

* Chỉ GitHub (qua `gh`). Remote khác cần thêm một `GitHost`.
* Góp ý review trên GitHub chưa được kéo về VDEV (chỉ hiện review decision); góp ý trên VDEV không đăng lên GitHub.
* Worktree không có app chạy ⇒ ảnh chụp "sau" chỉ đúng với repo `IN_PLACE`.
* Dọn nhánh khi PR được merge trên GitHub chạy trong bộ nhớ runner: runner tắt giữa chừng ⇒ có thể sót worktree (xoá thư mục `~/.vdev-agent/worktrees/…` + `git worktree prune`).
