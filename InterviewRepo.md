# RepoRadar — Kế hoạch website khám phá GitHub repo

## 1. Mục tiêu và phạm vi

**Mục tiêu:** Website giới thiệu GitHub repo hữu ích theo chủ đề dành cho developer. Mỗi topic hiển thị tối đa 10 repo phù hợp, ưu tiên độ phổ biến; người xem có thể mở chi tiết và truy cập nguồn để tìm hiểu công năng.

**Định hướng:** Website tĩnh, dữ liệu JSON, cập nhật bằng GitHub Actions, xuất bản lên GitHub Pages. Không cần database hay backend chạy liên tục trong MVP.

Tài liệu này thay thế plan cũ về ứng dụng cá nhân có Auth, watchlist, scoring 100 điểm và Telegram. Đây là kế hoạch triển khai, không phải mô tả các chức năng đã hoàn thành.

### Yêu cầu đã chốt

- Sáu menu riêng: Agent Skills, MCP Servers, Developer Tools, DevOps, Self-hosted, Trending.
- Mỗi topic có **tối đa 10 repo được tuyển chọn**, không phải 10 repo mới phát hiện hay lịch sử 10 lần quét.
- Giới thiệu công dụng cơ bản, metadata, link GitHub và giao diện xem chi tiết.
- Không dùng AI; không tự đọc, phân tích hay trích tính năng từ README trong pipeline.
- Không clone, build hoặc chạy source code của các repo được giới thiệu.
- Job cập nhật hằng ngày, dự kiến kích hoạt lúc **00:00 giờ Việt Nam — Asia/Ho_Chi_Minh, UTC+7**.
- Cho phép maintainer chạy job thủ công; giữ dữ liệu cũ khi cập nhật lỗi.
- Áp dụng hướng dẫn thiết kế của skill `frontend-design` từ Anthropic.
- Ưu tiên không mất phí dịch vụ trong giới hạn sử dụng miễn phí; không cam kết free tier hoặc SLA tồn tại vĩnh viễn.

### Không thuộc MVP

- Supabase, database migrations, Auth, đăng ký hoặc dữ liệu theo người dùng.
- Quản trị topic qua UI; cấu hình topic được sửa trong repository của website.
- Telegram, email, lưu repo muốn thử/đã thử/bỏ qua.
- API quét công khai, worker, queue hoặc server riêng.
- Tự dịch, tóm tắt, phân tích README hay đánh giá độ an toàn bằng AI.
- Tìm kiếm toàn bộ GitHub theo yêu cầu từ trình duyệt.
- Theo dõi thời gian thực hoặc bảo đảm job chạy chính xác từng phút.

### Các lựa chọn cần chốt trước khi triển khai phần tương ứng

| Vấn đề | Đề xuất hiện tại | Trạng thái |
|---|---|---|
| Công năng chi tiết ngay trong website | Nội dung biên tập thủ công có nguồn, tách khỏi metadata tự động | Chưa được xác nhận; không tự thêm quy trình biên tập |
| Trending | Repo tạo trong 90 ngày gần đây thuộc các chủ đề quan tâm, xếp theo tổng star | Định nghĩa và cửa sổ 90 ngày là đề xuất cần chốt |
| Bộ lọc từng topic | Alias, keyword, min star và danh sách loại trừ riêng | Cần kiểm chứng trên kết quả thật |
| Frontend production | Tái sử dụng prototype HTML/CSS/JavaScript, không bắt buộc thêm framework | Chọn cách đơn giản nhất; dependency mới cần được đồng ý |

## 2. Topic và cách chọn top 10

### Phạm vi nội dung

| Menu | Phạm vi mong muốn |
|---|---|
| Agent Skills | Skill và bộ skill dùng với coding agent; tránh trộn mọi agent framework vào cùng nhóm |
| MCP Servers | Server tích hợp Git, database, browser, tài liệu và công cụ hỗ trợ dev |
| Developer Tools | CLI, testing, debugging, code review và công cụ phát triển |
| DevOps | CI/CD, containers, Kubernetes, IaC, công cụ vận hành |
| Self-hosted | Ứng dụng có thể tự triển khai trên hạ tầng cá nhân hoặc công ty |
| Trending | Repo mới nổi trong các nhóm quan tâm, theo định nghĩa công bố riêng |

Tên menu không nhất thiết là một GitHub topic duy nhất. Mỗi menu có cấu hình các query và alias. Với ý nghĩa khớp ít nhất một query, truy vấn riêng rồi hợp nhất, không ghép qualifier tùy tiện làm sai ngữ nghĩa.

Metadata chỉ là tín hiệu phù hợp, không đủ xác nhận mọi khả năng của repo. Cần thử kết quả thật và điều chỉnh cấu hình. Quyết định rõ SDK, framework, tutorial và awesome list có được nhận vào từng menu hay không; không loại tất cả theo một quy tắc chung.

### Quy tắc xếp hạng MVP đề xuất

1. Tìm ứng viên phù hợp bằng GitHub topics, tên và description; không tìm hoặc phân tích README.
2. Chỉ nhận repo public; mặc định loại archived và fork.
3. Áp dụng ngưỡng star, keyword và danh sách loại trừ của từng topic.
4. Loại trùng theo GitHub repository ID trong cùng topic.
5. Sắp theo tổng star giảm dần; bằng star thì ưu tiên `pushed_at` mới hơn; tiếp tục bằng thì dùng repository ID tăng dần. Giá trị push thiếu xếp sau giá trị hợp lệ.
6. Lấy tối đa 10 repo. Không đủ 10 thì hiển thị số thực tế, không thêm repo sai chủ đề để đủ số lượng.

Một repo có thể xuất hiện ở nhiều topic. Không gọi thứ hạng này là chứng nhận chất lượng, bảo mật, khả năng bảo trì hoặc mức phù hợp của license.

Nhãn giải thích: **“Repo nhiều star nhất trong tập kết quả phù hợp với chủ đề.”** Không hứa tìm hết GitHub hoặc đây là 10 repo tốt nhất toàn nền tảng.

### Ngân sách tìm kiếm đề xuất

- Tối đa 3 query/topic; lấy tối đa 100 ứng viên/query, sắp theo star ở nguồn trước khi hợp nhất.
- Tập ứng viên phải lớn hơn 10 để còn lọc và loại trùng.
- Giới hạn này là phạm vi tuyển chọn, không phải bảo đảm độ phủ toàn bộ.
- Ngân sách request, timeout và retry có giới hạn; điều chỉnh sau khi đo lượt chạy thật.
- Nếu hoàn thành đủ ngân sách đã cấu hình, có thể publish và ghi rõ phạm vi giới hạn.
- Nếu request bắt buộc bị lỗi hoặc GitHub báo kết quả không hoàn chỉnh, không coi topic đó là cập nhật thành công; giữ danh sách cũ.
- Không ép tất cả nhóm dùng cùng min star hoặc cùng cửa sổ push; tránh loại hết nhóm mới và công cụ ổn định ít thay đổi.

### Trending

Phương án đơn giản đang đề xuất: repo được tạo trong 90 ngày gần đây, thuộc các nhóm quan tâm và xếp theo tổng star. Tính mốc ngày tại mỗi lượt chạy, không hardcode ngày cụ thể.

Nếu chọn phương án này, ghi rõ trên trang: **“Repo mới nổi trong 90 ngày gần đây, xếp theo tổng star.”** Không tuyên bố đây là GitHub Trending chính thức hoặc tăng trưởng star 7 ngày.

Trước khi định nghĩa được xác nhận và có dữ liệu thật, menu Trending hiển thị trạng thái chưa có dữ liệu, không lấy top star toàn thời gian để thay thế ngầm.

Nếu sau này chọn tăng trưởng star thực tế, phải thêm snapshot bền vững, khoảng đo và xử lý thiếu lịch sử; đó là phạm vi bổ sung, chưa thuộc pipeline MVP.

## 3. Trải nghiệm và chi tiết công năng

### Danh sách trong topic

- Tên repo, owner và description nguyên văn.
- Tổng star, ngôn ngữ chính, tags liên quan.
- Hành động **Xem chi tiết** và **GitHub** tách biệt.
- Giải thích tiêu chí tuyển chọn và lần cập nhật thành công của topic.
- Search theo tên/description/topic và bộ lọc ngôn ngữ chỉ áp dụng trong tối đa 10 repo đã công bố.
- Hiển thị “Đang hiển thị X/N repo”; không làm người dùng hiểu rằng bộ lọc đang tìm lại toàn GitHub.
- Thứ tự mặc định là thứ hạng tuyển chọn. Nếu giữ tùy chọn sort khác, chỉ sắp lại tập đã chọn, không thay membership.

### Panel chi tiết

Desktop dùng panel bên phải; mobile dùng giao diện chi tiết toàn chiều rộng. Nội dung chia thành các mục đọc liên tục, chưa cần nhiều tab.

| Mục | Nội dung và nguồn |
|---|---|
| Nhận diện | Owner, tên repo, link GitHub |
| Giới thiệu | GitHub description nguyên văn |
| Công năng chính | Chỉ hiển thị nếu có nội dung bổ sung đã biên tập và dẫn nguồn |
| Metadata | Star, topics, ngôn ngữ, license nếu GitHub nhận diện, lần push gần nhất |
| Tìm hiểu thêm | GitHub và homepage được chủ repo khai báo, sau khi kiểm tra URL |
| Nguồn và độ mới | Thời điểm lấy metadata; thời điểm review riêng cho nội dung biên tập nếu có |

**Giới hạn dữ liệu:** GitHub API không cung cấp danh sách tính năng chuẩn cho mọi repo. Không biến description ngắn thành danh sách công năng tự suy diễn. UI tiếng Việt không có nghĩa description được tự dịch sang tiếng Việt.

Trước khi quyết định nguồn nội dung bổ sung, panel chỉ hứa hiển thị metadata và đường dẫn nguồn. Khi thiếu phần công năng, ghi: **“Chưa có phần giới thiệu công năng bổ sung. Xem nguồn gốc để tìm hiểu đầy đủ.”**

Nếu người dùng chọn biên tập thủ công, lưu nội dung riêng theo repository ID, có `source_url` và `reviewed_at`. Job không ghi đè nội dung này. Repo mới lọt top 10 có thể chỉ có description cho đến khi được biên tập. Không yêu cầu người dùng biên tập mọi repo khi chưa chốt phương án này.

### Điều hướng và accessibility

- Tên repo hoặc nút Xem chi tiết mở panel nội bộ; link GitHub mở tab mới và có nhãn rõ ràng.
- Đóng panel không mất bộ lọc hay vị trí cuộn.
- Hỗ trợ nút đóng, `Esc`, focus trap khi là modal và trả focus về mục vừa mở.
- Back của trình duyệt đóng panel trước khi rời topic.
- Đề xuất hash routing tương thích GitHub Pages, ví dụ `/#/topic/mcp-servers/repo/123456`; mọi asset/link phải hoạt động dưới project base path.
- Repo không còn trong dữ liệu hiện tại: thông báo rõ và cho quay lại topic.
- Responsive, keyboard focus rõ, dark mode đủ tương phản, tôn trọng reduced motion.

### Trạng thái cần có

| Trạng thái | Hành vi |
|---|---|
| Chưa có dữ liệu lần đầu | Thông báo chưa có danh sách, không trình bày như không khớp bộ lọc |
| Lọc không ra kết quả | Hướng dẫn bỏ lọc hoặc thay từ khóa trong danh sách đã chọn |
| Description trống | “Chủ repo chưa cung cấp mô tả.” |
| Không nhận diện license | “GitHub chưa nhận diện license.”, không kết luận repo không có license |
| Metadata hoặc nội dung công năng thiếu | Hiển thị phần có dữ liệu và link nguồn; không tự bổ sung |
| Dữ liệu cũ | Hiển thị lần cập nhật thành công; đề xuất cảnh báo khi quá 48 giờ |
| Tải JSON lỗi | Thông báo lỗi tải và cho thử lại; không thay bằng danh sách rỗng |

## 4. Kiến trúc và dữ liệu

| Thành phần | Trách nhiệm |
|---|---|
| Website tĩnh | Đọc dữ liệu đã xuất bản, hiển thị topic và chi tiết; không gọi GitHub API mỗi lần mở trang |
| GitHub REST API | Nguồn metadata của repo public |
| Script cập nhật | Query, lọc, xếp hạng, kiểm tra và xuất JSON |
| GitHub Actions | Kích hoạt lịch/thủ công, chạy kiểm tra và deploy |
| GitHub Pages | Phục vụ website tĩnh |
| JSON trong repository website | Lưu dữ liệu bền vững cho lần chạy tiếp theo |

Không cần Supabase hay skill Supabase trong phương án này. Chỉ xem xét database nếu sau này có quản trị trên web, tài khoản hoặc dữ liệu cá nhân.

### Cấu trúc dữ liệu logic

| Nhóm | Trường chính |
|---|---|
| Topic config | Slug, tên, query/alias, điều kiện lọc, danh sách loại trừ, giới hạn 10 |
| Repositories | GitHub ID, full name, description, URLs, topics, stars, language, license, created/pushed/fetched timestamps |
| Topic selections | Topic slug, danh sách repository ID theo thứ hạng, ranking basis, last attempt/success, trạng thái và phạm vi truy vấn |
| Editorial content — tùy chọn | Repository ID, giới thiệu/tính năng thủ công, nguồn, thời điểm review |
| Dataset manifest | Schema version, thời điểm tạo bộ dữ liệu |

- GitHub repository ID là định danh ổn định; không dùng `owner/name` làm khóa duy nhất vì repo có thể đổi tên hoặc chuyển owner.
- Metadata dùng chung giữa các topic; mỗi topic giữ danh sách ID và thứ hạng riêng.
- Nếu topic cập nhật lỗi, giữ nguyên selection và metadata của repo chỉ thuộc dữ liệu cũ. Repo dùng chung có thể nhận metadata mới từ topic thành công; thứ hạng của topic lỗi vẫn là kết quả lần thành công trước.
- Validate mọi ID được selection tham chiếu đều có metadata; merge trước, chỉ dọn metadata không còn được topic nào tham chiếu sau khi validation thành công.
- Không xóa nội dung biên tập thủ công chỉ vì repo rời top 10.
- Giới hạn 10 là số hiển thị mỗi topic, không phải giới hạn Git history, log hay nội dung biên tập lưu trữ.
- Phân biệt `created_at`, `pushed_at`, `fetched_at`, `last_success_at` và `reviewed_at`. Lưu timestamp theo UTC, hiển thị rõ giờ Việt Nam.

## 5. Job hằng ngày lúc 00:00 giờ Việt Nam

### Trigger

GitHub Actions dùng UTC cho biểu thức cron dưới đây. **00:00 giờ Việt Nam tương ứng 17:00 UTC ngày hôm trước.**

```yaml
name: Refresh repositories

on:
  schedule:
    - cron: "0 17 * * *"
  workflow_dispatch:

concurrency:
  group: refresh-repositories
  cancel-in-progress: false
```

Đây là cấu hình trigger đề xuất, chưa phải workflow hoàn chỉnh đã được tạo trong repository.

- `schedule`: kích hoạt hằng ngày theo lịch trên default branch.
- `workflow_dispatch`: maintainer chạy thủ công trong GitHub Actions; không tạo nút quét công khai trên website.
- `concurrency`: tránh các lượt cùng nhóm chạy đồng thời; không coi đây là cơ chế bảo đảm mọi lượt chờ đều được chạy.
- 00:00 là giờ dự kiến kích hoạt, không phải cam kết website đã có dữ liệu mới lúc đó.
- Scheduled run có thể trễ hoặc bị bỏ lỡ khi hệ thống bận. Không có SLA chính xác từng phút.
- Lịch đầu giờ có thể đông tải; chỉ đổi sang giờ lệch phút nếu được đồng ý, không tự thay lịch đã chốt.
- Kiểm tra chính sách vô hiệu hóa schedule khi public repository không hoạt động trong thời gian dài, trạng thái workflow và điều kiện gói trước deploy.

### Pipeline một lượt chạy

1. Checkout trạng thái mới nhất của repository website, đọc config và bộ JSON hợp lệ đã lưu từ trước.
2. Kiểm tra cấu hình, credentials, thời hạn chạy và ngân sách request.
3. Tìm ứng viên từng topic qua API; metadata không yêu cầu đọc README.
4. Lọc, hợp nhất theo GitHub ID, xếp hạng rồi lấy tối đa 10/topic.
5. Topic thành công nhận selection mới; topic lỗi giữ selection cũ và đánh dấu cập nhật thất bại nếu có thể xuất bản trạng thái.
6. Merge metadata và giữ nội dung biên tập riêng nếu có; tạo bộ JSON dự kiến trong vùng staging.
7. Validate schema, tham chiếu ID, thứ hạng và giới hạn số lượng; chạy các kiểm tra liên quan và build website.
8. Lưu bộ JSON hợp lệ vào repository website nếu có thay đổi. Không force-push khi có commit cạnh tranh; dừng hoặc chạy lại từ trạng thái mới.
9. Deploy chính artifact đã kiểm tra trong cùng workflow; xác nhận trạng thái deploy và kiểm tra website.

Bộ JSON lưu trong Git là đầu vào bền vững cho lượt tiếp theo, không dựa vào thư mục runner tạm hoặc cache có thể mất. Nếu dữ liệu đã lưu nhưng deploy lỗi, website vẫn phục vụ artifact cũ; lượt sau có thể build/deploy lại bộ dữ liệu đã lưu.

Không dựa vào commit tạo bởi `GITHUB_TOKEN` để kích hoạt workflow deploy thứ hai. Workflow cập nhật phải chủ động build/deploy trong cùng luồng. Các đường deploy khác nếu bổ sung phải dùng chung cơ chế tuần tự hóa publication.

### Xử lý lỗi và độ mới

| Tình huống | Cách xử lý |
|---|---|
| Topic hoàn thành đủ query/ngân sách, có kết quả hợp lệ | Thay bằng top tối đa 10 mới |
| Query hoàn tất hợp lệ nhưng chỉ có 6 repo | Hiển thị 6, không thêm repo không đạt |
| Query hoàn tất hợp lệ và không có repo | Có thể publish danh sách rỗng, khác với lỗi API |
| Một topic timeout, rate limit hoặc incomplete result | Giữ danh sách cũ, không tăng `last_success_at` |
| Topic chưa từng thành công và lần này lỗi | Hiển thị chưa có dữ liệu, không bịa kết quả |
| Toàn bộ topic cập nhật lỗi | Không thay nội dung đã publish; báo workflow thất bại |
| JSON sai schema, build lỗi, persist lỗi | Dừng trước deploy, không thay website đang hoạt động |
| Deploy lỗi | Giữ bản deploy cũ; maintainer có thể chạy lại |
| Job không được kích hoạt hoặc bị trễ | Website giữ dữ liệu cũ và suy ra cảnh báo từ timestamp đã có |

- Đọc rate-limit headers, tôn trọng `Retry-After` và thời điểm reset; retry có giới hạn cho lỗi tạm thời, không retry mù lỗi xác thực.
- Một topic lỗi không ngăn topic khác cập nhật nếu bộ dữ liệu merge vẫn hợp lệ.
- Partial failure phải xuất hiện trong Actions summary; sau deploy phần thành công, báo trạng thái lỗi rõ cho maintainer.
- Browser tính tuổi dữ liệu từ timestamp, không cần chờ một lượt job mới để biết dữ liệu đã cũ.
- Ghi số request, số ứng viên, số được chọn, thời gian và lỗi từng topic. Không đưa log nhạy cảm ra JSON public.

## 6. Bảo mật và chi phí

- Dùng credentials trong môi trường GitHub Actions, không đưa xuống HTML/JavaScript/JSON public.
- Ưu tiên `GITHUB_TOKEN` sẵn có nếu đủ cho tác vụ; chỉ thêm token riêng khi thực sự cần, lưu trong Actions secrets.
- Cấp quyền tối thiểu theo job: đọc/ghi nội dung chỉ khi cần persist, Pages và OIDC chỉ cho deploy.
- Không cho workflow từ pull request không tin cậy ghi dữ liệu hoặc deploy production.
- Pin các Actions bên ngoài tới commit đã kiểm tra khi tạo workflow production.
- Chỉ xuất bản metadata public; escape văn bản từ GitHub, không render raw HTML của description.
- Kiểm tra URL bằng parser và allowlist scheme HTTP/HTTPS; GitHub link chỉ tới nguồn GitHub hợp lệ. Loại `javascript:`, `data:` và URL không hợp lệ.
- Link homepage là địa chỉ chủ repo khai báo, không mặc định đó là tài liệu chính thức hay website an toàn.
- Không embed trang bên ngoài, không thực thi hướng dẫn hoặc lệnh từ repo.
- Không ghi credentials vào log; không commit secrets hoặc `.env`.
- Giữ phạm vi miễn phí bằng public repository và điều kiện GitHub Actions/Pages phù hợp; kiểm tra quota, điều khoản và billing trước deploy. Không tự bật dịch vụ trả phí hoặc mua domain.
- Có hướng dẫn tắt workflow, chạy lại và deploy lại dữ liệu hợp lệ khi cần phục hồi.

## 7. Kiểm thử và tiêu chí nghiệm thu

### Unit tests

- Query đúng ngữ nghĩa OR; không tìm README ngoài phạm vi.
- Bộ lọc theo topic, archived/fork, ngưỡng star và danh sách loại trừ.
- Hợp nhất theo ID, xếp hạng và tie-break ổn định.
- Mỗi topic không vượt 10; cùng repo có thể thuộc nhiều topic.
- Filter UI chỉ lọc tập đã chọn, không thay membership.
- Metadata thiếu, đổi tên repo, escape văn bản và validation URL.
- Tính ngày cutoff Trending nếu phương án này được xác nhận; tính tuổi dữ liệu và múi giờ.

### Integration tests

- GitHub trả rỗng hợp lệ, timeout, lỗi xác thực, rate limit và incomplete result.
- Một topic lỗi, tất cả topic lỗi và lần đầu chưa có dữ liệu.
- Merge dữ liệu cũ/mới không mất metadata được selection cũ tham chiếu.
- Nội dung biên tập nếu có không bị job ghi đè.
- JSON sai hoặc vượt 10 bị chặn trước persist/deploy.
- Chạy lại cùng dữ liệu không tạo bản ghi trùng.
- Hai lượt cập nhật gần nhau, conflict khi persist và deploy lỗi.
- JSON bền vững có thể được dùng lại trên runner mới; không phụ thuộc cache.

### Kiểm thử trình duyệt

- Topic → search/filter → xem chi tiết → đóng mà không mất trạng thái.
- Deep link, Back, reload, project base path và repo không còn trong selection.
- Mobile, keyboard, focus trap/restore, `Esc`, dark mode và tương phản.
- Tên/mô tả dài, ký tự đặc biệt, dữ liệu thiếu, lỗi tải và stale state.
- Không có nội dung tính năng suy diễn hoặc số liệu minh họa trên production.

Chạy **type check nếu dùng TypeScript → lint theo công cụ đã cấu hình → tests → build/kiểm tra static artifact → kiểm tra trình duyệt**. Không tuyên bố pass bước chưa có công cụ hoặc chưa thực hiện.

### Checklist deploy

- [ ] Kiểm tra free-tier eligibility, quota và cấu hình GitHub Pages của repository.
- [ ] Chốt query từng topic bằng kết quả thật; kiểm tra thủ công độ phù hợp của các danh sách đầu tiên.
- [ ] Chốt định nghĩa Trending trước khi publish thứ hạng cho menu này.
- [ ] Công bố rõ giới hạn nội dung chi tiết nếu chưa có nguồn biên tập bổ sung.
- [ ] Workflow nằm trên default branch; cron là `0 17 * * *`, hiển thị giờ Việt Nam.
- [ ] Permissions, secrets, concurrency và persist/deploy được kiểm tra.
- [ ] Chỉ production được persist dữ liệu và deploy thật.
- [ ] Chạy thủ công thành công, thử lỗi cập nhật và xác nhận dữ liệu cũ vẫn dùng được.
- [ ] Hoàn thành kiểm thử trực quan desktop/mobile và đường dẫn GitHub Pages.
- [ ] Theo dõi ít nhất 2 lượt schedule thực tế; phân biệt hoàn thành code với xác minh vận hành qua đêm.
- [ ] Có tài liệu chỉnh topic, chạy lại, tắt schedule và phục hồi website.

## 8. Lộ trình và hiện trạng

| Giai đoạn | Công việc | Điều kiện hoàn thành |
|---|---|---|
| 1. Chốt nội dung và tuyển chọn | Quyết định nguồn công năng bổ sung, định nghĩa Trending, thử query thật | Không còn hứa nội dung mà dữ liệu không cung cấp |
| 2. Hoàn thiện giao diện | Tái sử dụng prototype, panel chi tiết, routing, trạng thái và accessibility | Luồng topic → chi tiết hoạt động với dữ liệu mẫu có nhãn |
| 3. Tích hợp metadata | Script GitHub, schema JSON, ranking, giới hạn top 10 và xử lý lỗi | Kết quả thật phù hợp, test dữ liệu thành công |
| 4. Tự động hóa và xuất bản | Actions lúc 00:00 Việt Nam, persist JSON, build/deploy Pages | Chạy thủ công end-to-end, lỗi không làm mất website |
| 5. Nghiệm thu | Browser tests, bảo mật đầu ra, tài liệu và theo dõi schedule | Website thật không dùng fixture; xác minh ít nhất 2 lượt lịch |

Không giữ ước lượng 10–14 ngày của plan cũ vì scope đã đổi. Ước lượng lại sau khi chốt nguồn công năng, thử query và kiểm tra môi trường deploy; thời gian chờ schedule là thời gian quan sát, không phải toàn bộ công phát triển.

### Hiện trạng tại thời điểm cập nhật plan

- Đã cài skill Anthropic `frontend-design` và có prototype `index.html`.
- Prototype có sáu menu, search, lọc ngôn ngữ, sort, dark mode và CSS responsive; dữ liệu là minh họa.
- Chưa có pipeline GitHub thật, giới hạn top 10 production, panel chi tiết, persist JSON hoặc workflow/deploy theo plan này.
- Đã kiểm tra cú pháp và một số logic bằng DOM giả lập, chưa kiểm tra trực quan bằng trình duyệt.
- Việc sửa tài liệu không tự tạo hoặc kích hoạt job thật.

### Kết quả bàn giao mong muốn

- Website trên GitHub Pages, menu riêng và tối đa 10 repo/topic.
- Panel chi tiết có nguồn rõ, không bịa công năng; metadata và link nguồn luôn là nền tảng.
- Pipeline metadata không AI/README, cập nhật dự kiến 00:00 giờ Việt Nam mỗi ngày.
- JSON bền vững, fallback khi lỗi và thời điểm cập nhật hiển thị rõ.
- Source, tests, cấu hình workflow và hướng dẫn setup/vận hành; không cần Supabase trong MVP.
