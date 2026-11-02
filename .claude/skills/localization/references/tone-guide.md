# Tone guide (vi / en)

## Voice
GuGu sounds friendly, young, clear and confident. It is playful in marketing and calm and precise in operations (CRM, errors, policies).

## Vietnamese
- **Customers.** Address customers as "bạn" throughout the customer app. Don't use "quý khách": it is too formal for the brand.
- **Salon staff.** Address staff in the CRM as "bạn" too. Open question Q5 asks whether to use "anh/chị" instead.
- **Brevity.** Prefer short, natural phrases that a 22-year-old would actually say. For example, write "Đặt lịch thành công!", not "Việc đặt lịch của bạn đã được hoàn tất thành công".
- **Buttons.** Use verb-first button labels: "Đặt lịch", "Hủy lịch", "Xem thêm".
- **English loanwords.** Allow them only when they are the everyday term: "spa", "nail", "check-in", "voucher". Otherwise use Vietnamese.
- **Diacritics.** Diacritics are mandatory everywhere except generated `vi-ascii` SMS.
- **Tone-mark placement.** Use one tone-mark convention everywhere. Current choice: **"hòa", "thủy", "khỏe"** (the style most common in apps), not "hoà", "thuỷ", "khoẻ". The native reviewer confirms this.
- **Errors.** Errors say what happened and what to do, without blame. For example: "Số điện thoại chưa đúng. Bạn kiểm tra lại nhé."
- **Particles and emoji.** Use the softening particles "nhé" and "nha" sparingly and only in customer-facing friendly copy, never in policies or errors about money or cancellations. Emoji are allowed in marketing and push notifications, never in errors or legal text.

## Two registers: marketing vs CRM

GuGu speaks in two registers. Pick one per screen and never mix them in one string.

| | Marketing (homepage, hero, campaigns, push promos, social) | CRM / operations (salon workspace, booking states, errors, policies) |
|---|---|---|
| Goal | Make people feel something and tap | Make the next action obvious |
| Voice | Playful, warm, self-care, a little cheeky | Calm, short, factual, reassuring |
| Address | "bạn", or implied (no pronoun) | "bạn" (pending Q5), mostly implied |
| Particles | "nha", "nè", "thôi", "đi" are allowed | None, except a soft "nhé" in empty states |
| Loanwords | gen-z mix allowed: "glow up", "self-love", "chill", "vibe" (max one per line) | Only standard ones: "check-in", "no-show" in tooltips |
| Emoji | OK in push and social, never in hero type | Never |
| Punctuation | Lowercase and script styling are allowed visually; the string itself stays properly cased | Sentence case, no exclamation marks except on success toasts |
| Length | Short, rhythmic, 2–7 words | As short as the meaning allows |

### Marketing copy: how to write vi natively
- Write the vi line from the feeling, not from the en words. English and Vietnamese accents can say different things as long as they share the mood.
- Use rhythm and pairing, which Vietnamese loves: "Xinh hơn, vui hơn", "Thư giãn đi, đẹp để lo".
- Use self-care framing with "mình" (the speaker includes the reader): "Thương mình thêm chút nữa".
- Avoid textbook and translationese constructions such as "Hãy…" chains, "được + verb" passives, and "của bạn" everywhere.
- Avoid ad clichés from the 2000s: "uy tín – chất lượng – giá rẻ", "hàng đầu", "số 1".

Hero accent drafts (⚠ native gen-z copywriter must approve, Q7):

| en accent (reference) | vi options |
|---|---|
| More self love please | "Thương mình nhiều hơn nha" · "Yêu bản thân thêm chút nữa" · "Self-love thêm xíu nha" |
| Good beauty brighter you | "Đẹp từ tâm, rạng rỡ từng ngày" · "Đẹp hơn, tươi hơn, là bạn" · "Xinh xắn mỗi ngày" |

### CRM copy: calm and readable
- One idea per string; numbers first: "3 lịch hẹn hôm nay", not "Hôm nay bạn có tổng cộng 3 lịch hẹn".
- Statuses are short nouns or past participles from the glossary: "Đã xác nhận", "Đã check-in", "Không đến".
- Confirmations name the consequence: "Hủy lịch này? Khách sẽ nhận thông báo."
- Empty states are helpful, with one action: "Chưa có lịch hẹn nào hôm nay. Tạo lịch hẹn".
- Never use marketing particles or slang in money, cancellation, no-show or policy text.

## English
Use sentence case, contractions are OK, and keep it plain and warm. Example: "You're booked!" and "Couldn't load salons. Try again."

## Formatting conventions
| Thing | vi | en |
|---|---|---|
| Price | `150.000đ` | `₫150,000` |
| Price range | `150.000–250.000đ` | `₫150,000–250,000` |
| Time | `09:00` (24h) | `9:00 AM` |
| Date (short) | `T2, 03/11` | `Mon, Nov 3` |
| Date (long) | `Thứ Hai, 3 tháng 11, 2026` | `Monday, November 3, 2026` |
| Duration | `1 giờ 30 phút` | `1 h 30 min` |
| Phone | `0901 234 567` | `+84 90 123 4567` |
| Week start | Monday | Monday |
