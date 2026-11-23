# CMA Study – Part 1

Ứng dụng web (PWA) học tiếng Anh kế toán và luyện thi CMA Part 1. Chạy offline, miễn phí, dữ liệu lưu trên máy.

**Mở và cài đặt:** https://huongnttiengnhat-debug.github.io/cma-study/

## Chức năng
- **Tiếng Anh:** thẻ từ theo chủ đề (lặp lại ngắt quãng 5 hộp Leitner: 1, 2, 4, 7, 14 ngày), đọc song ngữ từng câu, nghe – chép, nói theo (ghi âm và nghe lại). Giọng đọc en-US có sẵn trên máy, chỉnh được tốc độ.
- **Kiến thức:** 48 LOS Section A (IMA, hiệu lực 01/09/2024), tóm tắt Anh – Việt, so sánh VAS và IFRS.
- **Luyện thi:** MCQ có giải thích tiếng Việt và tiếng Anh, đề thử có giờ, Case-Based Questions, theo dõi tiến độ và chủ đề yếu.
- **CFO:** tình huống thực tế với ngân hàng, kiểm toán, nhà đầu tư và mẫu câu email, họp, thuyết trình.

## Dữ liệu
- `data/public.json`: nội dung tự soạn có sẵn trong app.
- `data/CMA_data_public.xlsx`: cùng nội dung dạng Excel, dùng làm file mẫu để thêm dữ liệu (sheet `vocab`, `los`, `sentences`, `mcq`, `cbq`, `cfo`).
- Câu hỏi có bản quyền (Gleim) **không** nằm trong repo này. Nhập file Excel riêng trong mục Dữ liệu của app.

Nội dung gắn nhãn "Soạn bổ sung – cần đối chiếu" là phần soạn thêm ngoài bài giảng, cần người dùng kiểm tra lại.

## Kỹ thuật
HTML/CSS/JavaScript thuần, không cần build. Service worker (`sw.js`) lưu app để chạy offline; tiến độ lưu IndexedDB. Đọc Excel bằng SheetJS Community Edition 0.18.5 (`lib/`, giấy phép Apache 2.0). Khi cập nhật app, đổi `VERSION` trong `sw.js`.
