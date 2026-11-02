# Glossary (vi / en)

The terms agents and humans must use consistently in code, docs and UI copy. Code identifiers use the English term. UI copy uses the localized strings in `packages/localization` (topic 03 owns the final Vietnamese wording; entries marked † need native-speaker review).

| Term (code) | English | Tiếng Việt | Meaning |
|---|---|---|---|
| `salon` | Salon / business | Salon / cơ sở | A tenant: a business listed on GuGu. Every tenant-owned record has `salonId`. |
| `tenant` | Tenant | Đơn vị thuê bao † | Technical term for a salon's isolated data space. Not shown in UI. |
| `customer` | Customer | Khách hàng | End user who books services. |
| `member` | Team member | Thành viên | A user with a role in a salon (owner, manager, receptionist, staff). |
| `staff` | Staff / specialist | Nhân viên / thợ † | A member who performs services. |
| `owner` | Owner | Chủ salon | Salon role with full control. |
| `receptionist` | Receptionist | Lễ tân | Salon role that manages bookings and customers. |
| `service` | Service | Dịch vụ | Something a salon sells, with price and duration. |
| `serviceVariant` | Variant | Tùy chọn dịch vụ † | Variation of a service (e.g. long hair) with its own price/duration. |
| `category` | Category | Danh mục | Marketplace taxonomy (nails, hair…), stored in the DB. |
| `booking` | Booking / appointment | Lịch hẹn / đặt lịch | A reserved time with one or more services. |
| `slot` | Time slot | Khung giờ | A bookable start time computed by the backend. |
| `hold` | Hold | Giữ chỗ | Temporary reservation of a slot during checkout, with a TTL. |
| `availability` | Availability | Lịch trống | The set of bookable slots; computed only by the backend. |
| `buffer` | Buffer time | Thời gian đệm | Gap added after (or before) a service. |
| `timeOff` | Time off | Ngày nghỉ | Staff unavailability. |
| `holiday` | Holiday / closure | Ngày nghỉ lễ | Salon-wide closure. |
| `resource` | Resource / room | Phòng / thiết bị | Limited room or equipment a service needs. |
| `noShow` | No-show | Khách không đến | Customer did not arrive. |
| `checkIn` | Check-in | Khách đã đến | Customer arrived. |
| `payAtSalon` | Pay at the salon | Thanh toán tại salon | The only MVP payment method; GuGu processes no payment. |
| `estimatedRevenue` | Estimated revenue | Doanh thu ước tính | Sum of booking snapshot prices. Never presented as verified payment. |
| `reportedRevenue` | Reported revenue | Doanh thu salon báo cáo | Entered by the salon. |
| `attribution` | Acquisition source | Nguồn khách | Where a booking came from (marketplace, QR, Zalo…). |
| `commission` | Commission | Hoa hồng | Optional future fee for a newly acquired customer. |
| `subscription` | Subscription / plan | Gói dịch vụ | Salon plan; gates features such as the AI assistant. |
| `assistant` | AI assistant | Trợ lý AI | In-product AI agent for salon members (topic 08). |
| `agentTool` | Agent tool | Công cụ của trợ lý † | A typed, permission-checked operation the assistant may call. |
| `ward` | Ward / commune | Phường / xã | Administrative unit. After the 2025 reform it sits directly under the province. |
| `province` | Province / city | Tỉnh / thành phố | Top-level administrative unit. |
| `zaloOA` | Zalo Official Account | Zalo OA | A business account on Zalo (topic 09). |
| `zalo_template` | Zalo Template Message (ZBS) | Tin nhắn mẫu Zalo (ZBS) | Template-based transactional Zalo messages by phone number. Formerly "ZNS"; since 2026-01-01 part of ZBS (X2). Use `zalo_template` in code; "ZNS" only as a historical alias. |
| `otp` | One-time code | Mã OTP | Phone verification code; stored only as a hash. **Not required to book** (X11). Used only for account sign-in/recovery and sensitive changes. |
| `identityVerified` | Verified phone | Đã xác minh số điện thoại † | Flag on a customer/booking. Self-service bookings start as `identity_verified=false` until the phone is verified (X11). |
