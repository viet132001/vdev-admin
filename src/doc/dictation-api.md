# VDEV Dictation Module — Yêu cầu Backend & Đặc tả API

Tài liệu yêu cầu backend cho tính năng **Luyện chính tả tiếng Anh (Dictation)**. Web Admin đã tích hợp sẵn theo đặc tả này (đang chạy bằng mock `src/services/dictationMock.ts`); khi BE triển khai đúng contract, FE chỉ cần bật API thật.

---

## 1. Mô tả tính năng

Người dùng nghe một câu tiếng Anh, gõ lại, hệ thống chỉ ra chỗ sai và nghĩa của câu.

```
Session (bộ luyện tập)  ──<  Lesson (bài)  ──<  Sentence (câu)  ──<  Attempt (lượt gõ)
```

Luồng thao tác trên **một câu**:

1. Phát audio tiếng Anh (phát lại nhiều lần, tốc độ thường / chậm).
2. Người dùng gõ lại câu nghe được.
3. Kiểm tra → hiển thị từ đúng / sai / thiếu / thừa, độ chính xác (%).
4. Hiển thị nghĩa tiếng Việt và ghi chú (từ vựng, ngữ pháp).
5. **Đúng** → sang câu tiếp theo hoặc làm lại (redo). **Sai** → sửa và kiểm tra lại, hoặc xem đáp án / bỏ qua.

Cuối bài có màn tổng kết (số câu đúng, độ chính xác trung bình, số lượt thử) và cho phép làm lại toàn bộ bài.

---

## 2. Thông tin chung

* **Base URL:** `/api/dictation`
* **Xác thực:** Header `Authorization: Bearer <JWT_TOKEN>` cho tất cả API. Dữ liệu thuộc về user (`ownerId`), user chỉ thấy dữ liệu của mình.
* **Định dạng phản hồi:** `{ "success": true, "data": <payload>, "message": "Success" }` (ví dụ bên dưới chỉ mô tả `data`).
* **Định dạng lỗi:** `{ "success": false, "message": "...", "errorCode": "NOT_FOUND | BAD_REQUEST | ...", "errors": [] }`.
* **Quy tắc xóa:** Xóa mềm `Session`, `Lesson` (kèm toàn bộ con). `Sentence` xóa mềm để giữ lịch sử `Attempt`.
* **Thứ tự:** `Session`, `Lesson`, `Sentence` có `position` (số nguyên, khoảng cách 1024 như Task module). FE gửi toàn bộ danh sách ID cho API reorder.

---

## 3. Mô hình dữ liệu

### 3.1 Bảng đề xuất

| Bảng | Trường | Ghi chú |
|---|---|---|
| `DictationSession` | `id`, `ownerId`, `title`, `description?`, `level` (enum), `position`, `createdAt`, `updatedAt`, `deletedAt` | |
| `DictationLesson` | `id`, `sessionId`, `title`, `description?`, `position`, timestamps, `deletedAt` | |
| `DictationSentence` | `id`, `lessonId`, `text`, `translation?`, `note?`, `vocabularies` (JSON, mặc định `[]`), `audioFileId?`, `position`, timestamps, `deletedAt` | `text` ≤ 500 ký tự, bắt buộc. `vocabularies` xem 7.3 |
| `DictationProgress` | `id`, `userId`, `sentenceId` (unique cùng `userId`), `status`, `attemptCount`, `bestAccuracy`, `lastInput?`, `completedAt?`, `updatedAt` | 1 dòng / user / câu |
| `DictationAttempt` | `id`, `userId`, `sentenceId`, `input`, `isCorrect`, `accuracy`, `playCount`, `hintCount`, `revealed`, `durationMs`, `createdAt` | Lịch sử từng lượt kiểm tra |

### 3.2 Enum

* `DictationLevel`: `A1`, `A2`, `B1`, `B2`, `C1`, `C2`
* `DictationProgressStatus`: `NOT_STARTED`, `IN_PROGRESS`, `COMPLETED`, `SKIPPED`

### 3.3 Quy tắc tính tiến độ

* Lượt kiểm tra đúng (`isCorrect = true`) ⇒ `status = COMPLETED`, đặt `completedAt` (nếu chưa có).
* Lượt kiểm tra sai ⇒ `status = IN_PROGRESS` (nếu chưa `COMPLETED`).
* `revealed = true` (người dùng xem đáp án) hoặc gọi API skip ⇒ `status = SKIPPED` nếu chưa `COMPLETED`. Câu `SKIPPED` **không** tính là hoàn thành.
* `bestAccuracy` = max các `accuracy`; `attemptCount` += 1 mỗi lượt.
* Đã `COMPLETED` thì không bị hạ trạng thái khi làm lại (redo).

---

## 4. Quy tắc so sánh câu (BE và FE phải giống nhau)

FE tự chấm ngay để phản hồi tức thì; BE **chấm lại** khi nhận attempt và dùng kết quả của BE để lưu (không tin `isCorrect` từ client).

**Chuẩn hóa** (áp dụng cho cả đáp án và câu người dùng gõ):
1. Đổi `’ ‘ ʼ` thành `'`; `“ ”` thành `"`; `– —` thành khoảng trắng.
2. Chuyển về chữ thường.
3. Bỏ dấu câu `. , ! ? ; : " ( ) [ ] { } …` và dấu `'` / `-` ở đầu hoặc cuối từ (giữ `'` và `-` nằm giữa từ, ví dụ `don't`, `well-known`).
4. Tách từ theo khoảng trắng, bỏ token rỗng.
5. Đưa dạng rút gọn và dạng đầy đủ về một dạng chuẩn để gõ kiểu nào cũng đúng (`I am` = `I'm`, `it is not` = `it isn't` = `it's not`, `do not` = `don't`, `cannot` = `can't`, `let us` = `let's`):
   1. Tách `n't` thành `<trợ động từ> not` (`won't` → `will not`, `can't` / `cannot` → `can not`, `shan't` → `shall not`; `is are was were do does did has have had would should could must need might` + `n't`).
   2. Rút gọn đại từ + trợ động từ: `i am` → `i'm`; `you/we/they are` → `'re`; `he/she/it/that/there/here/what/where/who/how/when/why is|has` → `'s`; `i/you/we/they have` → `'ve`; `i/you/he/she/it/we/they/that/there/who/what will` → `'ll`, `would|had` → `'d`; `let us` → `let's`. Không rút gọn `has/have/had/will/would` khi ngay sau là `not` (giữ `he hasn't`, `i won't`).
   3. Ghép lại `<trợ động từ> not` còn lại thành dạng `n't` (`do not` → `don't`, `will not` → `won't`).
   `'s` sau danh từ (sở hữu, `John's`) giữ nguyên. Diff trả về token ở dạng chuẩn này. `vocabularyKey` (game) dùng cùng quy tắc.
6. Viết số bằng chữ: chữ số `0`–`999999` (không có số 0 ở đầu) và cụm từ chỉ số đều đổi về dạng chữ chuẩn — `7` = `seven`, `21` = `twenty one` = `twenty-one`, `105` = `one hundred and five` = `one hundred five`, `100` = `a hundred`, `7:30` = `seven thirty`. Hai số đứng cạnh nhau không ghép được thì giữ riêng (`seven seven`, `one two three`). Số có số 0 ở đầu (`0912`) hoặc ≥ 1 000 000 giữ nguyên. Diff hiện số bằng chữ (`seven`).

**Đánh giá:**
* `isCorrect` ⇔ hai dãy token giống hệt nhau.
* Diff theo từ bằng LCS; kết quả là danh sách thao tác:
  * `MATCH` (đúng), `WRONG` (gõ sai từ, có `expected` + `actual`), `MISSING` (thiếu từ), `EXTRA` (thừa từ).
  * Một cụm `MISSING` + `EXTRA` liền nhau được ghép thành `WRONG` theo cặp.
* `accuracy` = `số MATCH / số từ của đáp án` × 100, làm tròn 0 chữ số thập phân (đáp án rỗng ⇒ 0).
* Viết số bằng chữ số hay bằng chữ đều đúng (`10` = `ten`, xem bước 6).

Ví dụ: đáp án `I don't think so.`, người dùng gõ `i dont think` ⇒
```json
{
  "isCorrect": false,
  "accuracy": 50,
  "diff": [
    { "type": "MATCH", "expected": "i", "actual": "i" },
    { "type": "WRONG", "expected": "don't", "actual": "dont" },
    { "type": "MATCH", "expected": "think", "actual": "think" },
    { "type": "MISSING", "expected": "so" }
  ]
}
```

---

## 5. Session (`/api/dictation/sessions`)

### 5.1 Danh sách
* **Endpoint:** `GET /api/dictation/sessions`
* **Phản hồi:** Mảng theo `position`, kèm số liệu tổng hợp:
```json
[
  {
    "id": "uuid", "title": "Daily Conversation", "description": "...", "level": "A2", "position": 1024,
    "lessonCount": 3, "sentenceCount": 24,
    "progress": { "completed": 10, "total": 24 },
    "createdAt": "...", "updatedAt": "..."
  }
]
```

### 5.2 Tạo / chi tiết / cập nhật / xóa / sắp xếp
| Method | Endpoint | Body / Ghi chú |
|---|---|---|
| POST | `/api/dictation/sessions` | `{ "title": "...", "description": "...", "level": "A2" }` (`title` bắt buộc) |
| GET | `/api/dictation/sessions/:id` | Session + `lessons` (mảng Lesson tóm tắt, xem 6.1) |
| PATCH | `/api/dictation/sessions/:id` | `title`, `description`, `level` |
| DELETE | `/api/dictation/sessions/:id` | Xóa mềm session + lesson + sentence |
| PATCH | `/api/dictation/sessions/reorder` | `{ "ids": ["uuid-1", "uuid-2"] }` |

---

## 6. Lesson

### 6.1 Lesson tóm tắt (dùng trong chi tiết session)
```json
{
  "id": "uuid", "sessionId": "uuid", "title": "At the coffee shop", "description": null, "position": 1024,
  "sentenceCount": 8,
  "progress": { "completed": 3, "skipped": 1, "total": 8, "averageAccuracy": 87, "lastPracticedAt": "..." }
}
```
`averageAccuracy` = trung bình `bestAccuracy` của các câu đã có attempt (null nếu chưa luyện).

### 6.2 API
| Method | Endpoint | Body / Ghi chú |
|---|---|---|
| POST | `/api/dictation/sessions/:id/lessons` | `{ "title": "...", "description": "..." }` — thêm vào cuối |
| PATCH | `/api/dictation/sessions/:id/lessons/reorder` | `{ "ids": [...] }` |
| GET | `/api/dictation/lessons/:id` | Lesson tóm tắt + `session` (`id`, `title`) + `sentences` (mảng Sentence, xem 7.1) |
| PATCH | `/api/dictation/lessons/:id` | `title`, `description` |
| DELETE | `/api/dictation/lessons/:id` | Xóa mềm lesson + sentence |
| POST | `/api/dictation/lessons/:id/reset-progress` | Xóa `DictationProgress` của user cho mọi câu trong bài (giữ lịch sử `Attempt`). Dùng cho "Làm lại cả bài". Phản hồi: lesson như GET |

---

## 7. Sentence

### 7.1 Sentence object
```json
{
  "id": "uuid", "lessonId": "uuid", "position": 1024,
  "text": "Could I get a large latte, please?",
  "translation": "Cho tôi một ly latte lớn được không?",
  "note": "Could I get...? — cách gọi món lịch sự",
  "vocabularies": [
    { "term": "large latte", "meaning": "ly latte lớn" },
    { "term": "please", "meaning": "làm ơn" }
  ],
  "audioFileId": null,
  "audioUrl": null,
  "progress": { "status": "COMPLETED", "attemptCount": 2, "bestAccuracy": 100, "lastInput": "...", "completedAt": "..." }
}
```
* `audioUrl`: URL phát được (`/api/storage/files/:fileId/download`) nếu có `audioFileId`, ngược lại `null` — FE sẽ đọc bằng Web Speech API (giọng en-US) của trình duyệt.
* `progress`: luôn có; câu chưa luyện trả `{ "status": "NOT_STARTED", "attemptCount": 0, "bestAccuracy": null, "lastInput": null, "completedAt": null }`.

### 7.2 API
| Method | Endpoint | Body / Ghi chú |
|---|---|---|
| POST | `/api/dictation/lessons/:id/sentences` | `{ "text": "...", "translation": "...", "note": "...", "vocabularies": [{ "term": "...", "meaning": "..." }], "audioFileId": "uuid" }` — thêm vào cuối |
| POST | `/api/dictation/lessons/:id/sentences/bulk` | `{ "items": [{ "text": "...", "translation": "..." }] }` — tối đa 200 câu / lần, thêm vào cuối theo thứ tự. Phản hồi: mảng Sentence đã tạo |
| PATCH | `/api/dictation/lessons/:id/sentences/reorder` | `{ "ids": [...] }` |
| PATCH | `/api/dictation/sentences/:id` | `text`, `translation`, `note`, `vocabularies` (gửi `[]` để xoá hết, bỏ trường = không đổi), `audioFileId` (gửi `null` để gỡ audio) |
| DELETE | `/api/dictation/sentences/:id` | Xóa mềm |

> FE tự tách đoạn văn thành câu trước khi gọi bulk (tách theo `.`, `!`, `?` và xuống dòng; dòng dạng `English | Tiếng Việt` được hiểu là câu + nghĩa).

### 7.3 Từ vựng của câu (`vocabularies`)

Một câu có thể có nhiều từ / cụm từ mới, dùng cho game thủ thành (mục 13) và hiển thị sau khi luyện câu.

* Dạng lưu và trả về: `[{ "term": "large latte", "meaning": "ly latte lớn" }]` — `term` là tiếng Anh, `meaning` là nghĩa tiếng Việt.
* Giới hạn: tối đa **20** từ / câu; `term` ≤ 100 ký tự, `meaning` ≤ 200 ký tự; cả hai bắt buộc.
* **Khoá so sánh** của `term` = chuẩn hoá giống mục 4 rồi nối bằng một dấu cách (`"Large latte!"` ≡ `"large latte"`). Từ trùng khoá trong cùng câu ⇒ giữ mục đầu tiên. `term` chỉ gồm dấu câu ⇒ lỗi.
* Không bắt buộc `term` phải xuất hiện nguyên văn trong câu (cho phép dạng gốc, ví dụ câu có `ran` còn từ vựng là `run`).

**Audio:** dùng lại luồng upload sẵn có — `POST /api/storage/upload` (multipart, trường `file`) lấy `fileId`, sau đó PATCH `audioFileId` cho câu. Chấp nhận `audio/mpeg`, `audio/wav`, `audio/webm`, `audio/ogg`, tối đa 5MB.

---

## 8. Luyện tập (Attempt)

### 8.1 Gửi lượt kiểm tra
* **Endpoint:** `POST /api/dictation/sentences/:id/attempts`
* **Payload:**
```json
{
  "input": "could i get a large latte please",
  "playCount": 3,
  "hintCount": 0,
  "revealed": false,
  "durationMs": 18450
}
```
* BE chấm theo mục 4, lưu `DictationAttempt`, cập nhật `DictationProgress` theo mục 3.3.
* **Phản hồi:**
```json
{
  "attempt": { "id": "uuid", "isCorrect": true, "accuracy": 100, "diff": [ { "type": "MATCH", "expected": "could", "actual": "could" } ], "createdAt": "..." },
  "progress": { "status": "COMPLETED", "attemptCount": 2, "bestAccuracy": 100, "lastInput": "...", "completedAt": "..." }
}
```

### 8.2 Bỏ qua câu
* **Endpoint:** `POST /api/dictation/sentences/:id/skip`
* Đặt `status = SKIPPED` nếu chưa `COMPLETED`. Phản hồi: `progress`.

### 8.3 Lịch sử
* **Endpoint:** `GET /api/dictation/sentences/:id/attempts?limit=20` — các lượt gần nhất (mới → cũ).

### 8.4 Thống kê (phase 2, chưa bắt buộc)
* `GET /api/dictation/stats?from=2026-10-01&to=2026-10-31` — số câu hoàn thành theo ngày, độ chính xác trung bình, chuỗi ngày luyện liên tục (streak), top từ hay sai (từ các `WRONG` / `MISSING`).

---

## 9. Phase 2 (đề xuất, chưa cần cho bản đầu)

* **TTS phía server:** `POST /api/dictation/sentences/:id/tts` `{ "voice": "en-US-female", "speed": 1 }` sinh file audio, lưu `audioFileId`. Giúp giọng đọc đồng nhất giữa các thiết bị (Web Speech API phụ thuộc trình duyệt / hệ điều hành).
* **Tự dịch:** khi tạo câu không có `translation`, BE gọi dịch vụ dịch để điền sẵn (người dùng sửa lại được).
* **Cài đặt luyện tập theo user:** `GET/PATCH /api/dictation/settings` — `playbackRate`, `autoPlay`, `autoReplayTimes`, `showTranslation` (`AFTER_CHECK` / `ALWAYS`). Hiện FE lưu ở `localStorage`.
* **Chấp nhận biến thể:** cho phép mỗi câu có `alternatives: string[]` (ví dụ `I'm` / `I am`) được coi là đúng.

---

## 10. Checklist cho BE

- [x] Prisma models + migration cho 5 bảng ở mục 3.1
- [x] CRUD + reorder Session / Lesson / Sentence (mục 5–7), kèm số liệu `lessonCount`, `sentenceCount`, `progress`
- [x] Bulk tạo câu (≤ 200 câu / request)
- [x] Hàm chuẩn hóa + diff theo mục 4, có unit test với các ví dụ: dấu câu, viết hoa, `don't`, `well-known`, thiếu / thừa / sai từ
- [x] Attempt, skip, reset-progress, lịch sử (mục 6.2, 8.1–8.3)
- [x] `audioUrl` trả về từ `audioFileId`, kiểm tra loại file / dung lượng khi gán
- [x] Phân quyền theo `ownerId` cho mọi endpoint

---

## 11. Ghi chú triển khai BE

* **Module:** `src/modules/dictation`. Migration `20261022100000_add_dictation`, `20261026000200_add_dictation_vocabularies` (cột `vocabularies` JSONB).
* **Từ vựng:** `dictation-vocabulary.util.ts` (parse / chuẩn hoá / bỏ trùng) dùng chung cho API câu, import JSON và Excel. FE có bản tương ứng `vocabularyKey` / `parseVocabularyText` trong `grading.ts`.
* **Level:** dùng lại enum `CEFRLevel` (`A1`…`C2`) đã có trong schema thay vì tạo `DictationLevel` — giá trị API không đổi. Mặc định `A1`.
* **Chấm câu:** `dictation-grading.util.ts` là bản port 1:1 của `vdev-admin/src/pages/dictation/grading.ts`. Sửa quy tắc ở một bên thì phải sửa bên kia.
* **Attempt lưu `diff`** (JSON) để `GET /sentences/:id/attempts` trả lại được và phục vụ thống kê "từ hay sai" ở phase 2.
* **Client không gửi `isCorrect` / `accuracy`** — có gửi cũng bị bỏ qua.
* **Audio:** chấp nhận thêm các alias MIME trình duyệt hay gửi: `audio/mp3`, `audio/x-wav`, `audio/wave`. File phải do chính user upload.
* `GET /sentences/:id/attempts`: `limit` bị giới hạn trong khoảng 1–100.
* `DELETE` trả `{ "success": true }` (không bọc trong `data`, giống các module khác).

---

## 12. Import hàng loạt Session (JSON / Excel)

Tạo nhiều session + bài + câu trong một lần từ file. **Toàn bộ file được kiểm tra trước — có lỗi ở bất kỳ đâu thì không tạo gì.** Session mới được thêm vào cuối danh sách.

### 12.1 Tải file mẫu
* **Endpoint:** `GET /api/dictation/sessions/import/template?format=xlsx` (mặc định) hoặc `format=json`
* Trả về file tải xuống (`Content-Disposition: attachment`). File Excel có sheet `Sentences` (dữ liệu mẫu, dropdown level) và sheet `Hướng dẫn`.

### 12.2 Import
* **Endpoint:** `POST /api/dictation/sessions/import?dryRun=true|false`
* **Body:** `multipart/form-data`, trường `file` — `.json` hoặc `.xlsx`, tối đa 5MB.
* `dryRun=true`: chỉ kiểm tra và trả về bản xem trước, không lưu. Gợi ý FE: upload với `dryRun=true` → hiện preview / lỗi → người dùng xác nhận → upload lại không có `dryRun`.
* **Giới hạn:** 50 session, 5000 câu mỗi lần; title ≤ 200 ký tự; câu ≤ 500 ký tự.

**Phản hồi `dryRun=true`:**
```json
{
  "dryRun": true,
  "summary": { "sessions": 1, "lessons": 2, "sentences": 3 },
  "sessions": [
    {
      "title": "Daily Conversation", "description": "...", "level": "A2",
      "lessonCount": 2, "sentenceCount": 3,
      "lessons": [{ "title": "At the coffee shop", "sentenceCount": 2 }]
    }
  ]
}
```

**Phản hồi khi import thật:** `{ "dryRun": false, "summary": {...}, "sessions": [Session như 5.1] }` — chỉ gồm các session vừa tạo.

**Lỗi (400):** `message = "Validation failed"`, `errors` liệt kê từng lỗi kèm vị trí (tối đa 100 dòng):
```json
{
  "success": false, "message": "Validation failed", "errorCode": "BADREQUEST",
  "errors": [
    "Dòng 5: level \"Z9\" không hợp lệ (A1, A2, B1, B2, C1, C2)",
    "sessions[0].lessons[0].sentences[0]: thiếu câu (text)"
  ]
}
```
Các lỗi khác: file không phải `.json` / `.xlsx`, JSON sai cú pháp, không có trường `file` (400); file > 5MB (`413 PAYLOADTOOLARGE`).

### 12.3 Định dạng JSON
Mảng session, hoặc object `{ "sessions": [...] }`. Câu có thể là chuỗi hoặc object.
```json
{
  "sessions": [
    {
      "title": "Daily Conversation",
      "description": "Hội thoại hằng ngày",
      "level": "A2",
      "lessons": [
        {
          "title": "At the coffee shop",
          "sentences": [
            {
              "text": "Could I get a large latte, please?",
              "translation": "Cho tôi một ly latte lớn được không?",
              "note": "...",
              "vocabularies": [
                { "term": "large latte", "meaning": "ly latte lớn" },
                { "term": "please", "meaning": "làm ơn" }
              ]
            },
            { "text": "Can I pay by card?", "vocabularies": { "pay by card": "trả bằng thẻ" } },
            "Is it for here or to go?"
          ]
        }
      ]
    }
  ]
}
```
`level` không phân biệt hoa thường, bỏ trống ⇒ `A1`. `lessons` / `sentences` có thể rỗng.

`vocabularies` của câu chấp nhận các dạng: mảng `{ term, meaning }`; object `{ "từ": "nghĩa" }`; mảng chuỗi `["large latte: ly latte lớn"]`; hoặc một chuỗi `"large latte: ly latte lớn; please: làm ơn"`. Lỗi ghi theo vị trí, ví dụ `sessions[0].lessons[0].sentences[2].vocabularies [0]: thiếu nghĩa (meaning)`.

### 12.4 Định dạng Excel
Đọc sheet tên `Sentences` (không có thì sheet đầu tiên), dòng 1 là tiêu đề, **mỗi dòng là một câu**.

| Cột | Tên chấp nhận (không phân biệt hoa thường) | Bắt buộc |
|---|---|---|
| Session | `Session`, `Bộ luyện tập` | ✔ |
| Level | `Level`, `Trình độ` | |
| Session description | `Session description`, `Mô tả bộ` | |
| Lesson | `Lesson`, `Bài` | ✔ |
| Lesson description | `Lesson description`, `Mô tả bài` | |
| Text | `Text`, `Sentence`, `Câu` | ✔ |
| Translation | `Translation`, `Nghĩa` | |
| Note | `Note`, `Ghi chú` | |
| Vocabulary | `Vocabulary`, `Vocabularies`, `Từ vựng` | |

Quy tắc:
* Ô `Session` / `Lesson` để trống ⇒ dùng giá trị của dòng trên (tiện khi merge ô). Đổi session mà không ghi `Lesson` ⇒ lỗi.
* Cùng tên session / bài (không phân biệt hoa thường) ⇒ gộp chung, giữ thứ tự xuất hiện.
* `Level`, mô tả: lấy giá trị không rỗng đầu tiên của session / bài.
* Dòng không có `Text` (chỉ có Session hoặc Session + Lesson) ⇒ tạo session / bài rỗng; dòng trống hoàn toàn bị bỏ qua.
* Lỗi ghi theo số dòng Excel (`Dòng 5: ...`).
* Cột `Vocabulary`: các cặp `từ: nghĩa` (hoặc `từ = nghĩa`) cách nhau bằng `;` hoặc xuống dòng trong ô, ví dụ `large latte: ly latte lớn; please: làm ơn`. Lỗi: `Dòng 3: từ vựng "oops": cần dạng "từ: nghĩa" hoặc { term, meaning }`.
* Chỉ hỗ trợ `.xlsx`; file `.xls` / `.csv` cần lưu lại thành `.xlsx`.

Phản hồi `summary` có thêm `vocabularies` (tổng số từ vựng sẽ tạo).

---

## 13. Game từ vựng

Năm trò chơi dùng chung danh sách từ vựng (7.3). Mọi trò đều đọc to từ tiếng Anh khi trả lời đúng (Web Speech API giọng en-US, theo cài đặt giọng / tốc độ của màn luyện tập; có nút tắt âm thanh).

### 13.1 Lấy danh sách từ
| Method | Endpoint | Ghi chú |
|---|---|---|
| GET | `/api/dictation/lessons/:id/vocabularies` | Từ vựng của một bài |
| GET | `/api/dictation/sessions/:id/vocabularies` | Từ vựng của cả session (mọi bài) |

Thứ tự theo bài → câu; bỏ trùng theo khoá so sánh (7.3), giữ lần xuất hiện đầu. Câu / bài đã xoá mềm bị bỏ qua.
```json
[
  {
    "term": "large latte", "meaning": "ly latte lớn",
    "sentenceId": "uuid", "lessonId": "uuid",
    "sentence": "Could I get a large latte, please?",
    "translation": "Cho tôi một ly latte lớn được không?"
  }
]
```

### 13.2 Các trò chơi (FE — `vdev-admin/src/pages/dictation/games/`)

| Trò | File | Cách chơi | Độ khó (Dễ / Vừa / Khó) | Tối thiểu |
|---|---|---|---|---|
| Thủ thành | `DefenseGame.tsx` | Nghĩa tiếng Việt rơi xuống thành, gõ từ tiếng Anh + Enter để phá hủy. 5 mạng; nghĩa chạm thành ⇒ mất mạng, hiện đáp án; combo mỗi 10 từ ⇒ hồi 1 mạng. Rơi quá nửa sân ⇒ hiện chữ cái đầu (`l____ l____`). Tốc độ tự điều chỉnh: mỗi từ phá được +1.5% (tối đa ×1.4), mỗi từ chạm thành −15% (không dưới ×1) | rơi 16 / 11 / 7.5 s; xuất hiện mỗi 3.4 / 2.4 / 1.6 s; tối đa 3 / 4 / 6 ô trên sân | 1 từ |
| Đánh quái | `MonsterGame.tsx` | Từ chia thành các màn 3–4 quái (chia đều, ví dụ 330 từ ⇒ 83 màn). Mỗi quái đọc một từ (quái đang chọn đọc khi vào màn / khi được chọn; chạm quái hoặc "Nghe lại" để nghe lại), chỉ hiện số ký tự. Gõ đúng từ của bất kỳ quái nào còn sống ⇒ hạ quái đó. Hạ hết quái mới qua màn; hết từ ⇒ thắng (không có thua). Gõ sai tính vào quái đang chọn và mở dần gợi ý; "Xem đáp án" hiện từ nhưng vẫn phải gõ lại để hạ. Quái phải gợi ý / sai / xem đáp án ⇒ vào danh sách ôn, không tính "Đúng"; +5 điểm nếu hạ ngay lần đầu | hiện nghĩa sau 0 / 1 / 2 lần sai; hiện chữ cái đầu sau 1 / 2 / 4 lần sai | 1 từ |
| Trắc nghiệm tốc độ | `QuizGame.tsx` | Mỗi từ một câu, ngẫu nhiên chiều Việt → Anh hoặc Anh → Việt (chiều Anh → Việt đọc to từ hỏi). 4 lựa chọn (đáp án nhiễu lấy từ các từ khác); phím 1–4 trên máy tính | 12 / 8 / 5 s mỗi câu | 2 từ |
| Ghép cặp | `MatchGame.tsx` | Hai cột Anh / Việt xáo trộn, chạm từ rồi chạm nghĩa. Chia lượt; hết giờ ⇒ cặp còn lại tính là sai. Ghép nhầm ⇒ cả hai từ vào danh sách ôn | 4 / 5 / 6 cặp mỗi lượt, 12 / 8 / 5 s mỗi cặp | 2 từ |
| Xếp chữ | `ScrambleGame.tsx` | Chữ cái của từ bị xáo thành ô; chạm (hoặc gõ phím) theo thứ tự, chạm ô đã điền để gỡ. Gợi ý khoá chữ đúng tiếp theo (−5 điểm); bỏ qua / hết giờ ⇒ hiện đáp án | không giới hạn / 40 s / 20 s mỗi từ | 1 từ |

* So khớp đáp án gõ phím bằng khoá so sánh (7.3): không phân biệt hoa thường, dấu câu.
* Ô đáp án của các trò gõ phím (`AnswerForm` trong `GameStage.tsx`) có nút **EN**: đổi ô sang `type="password"` (chữ vẫn hiện nhờ `-webkit-text-security: none`) để bàn phím điện thoại tắt gõ Telex/VNI; lựa chọn lưu ở `localStorage`.
* Điểm: mỗi câu đúng khoảng 10 điểm + thưởng thời gian (trả lời càng nhanh càng cao) + `min(combo, 10) × 2`. Sai / hết giờ ⇒ combo về 0.
* Kết thúc: điểm, số đúng / tổng, combo cao nhất, tỉ lệ chính xác, danh sách "từ cần ôn lại" (chạm để nghe), nút "Ôn từ sai" (chơi lại chỉ với các từ đó), "Chơi lại", "Trò khác".
* Kỷ lục theo trò + bài / session + độ khó, độ khó đã chọn và bật / tắt âm thanh lưu ở `localStorage`. Phase 1 **không** lưu kết quả game lên BE.
* **Mobile:** khi đang chơi, game chiếm toàn màn hình và co theo `visualViewport` để sân chơi + ô nhập luôn nằm trên bàn phím ảo; rung nhẹ (`navigator.vibrate`) khi đúng / sai; các trò chạm (trắc nghiệm, ghép cặp, xếp chữ) không cần bàn phím.

### 13.3 Phase 2 (đề xuất)
* `POST /api/dictation/game-results` lưu điểm theo trò, từ cần ôn ⇒ kỷ lục đồng bộ giữa thiết bị, thống kê "từ hay quên" để ôn lại.
