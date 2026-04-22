/**
 * أوتو جوردن - Arabic Response Templates
 *
 * Single source of truth for formatting tool results into Arabic customer
 * messages. Used by both the sync path (gemini.service.js) and the
 * background function (process-ai-background.js) so they never diverge.
 *
 * Returns null when no template matches — caller should use its own fallback.
 */

function formatToolFallback(toolName, toolResult) {
    try {
        const r = typeof toolResult === 'string' ? JSON.parse(toolResult) : toolResult;
        switch (toolName) {
            case 'check_branch_availability': {
                if (r.is_available === false) {
                    const alts = (r.suggested_dates || []).join('، ') || 'تواريخ قريبة';
                    return `عذراً، فرع ${r.branch || ''} محجوز بالكامل بتاريخ ${r.date || ''}.\n📅 تواريخ بديلة مقترحة: ${alts}\nأي تاريخ يناسبك؟`;
                }
                if (r.is_available === true) {
                    const slots = (r.available_time_slots || []).slice(0, 4).join('، ');
                    return `✅ فرع ${r.branch || ''} متوفر بتاريخ ${r.date || ''}!\nأوقات متاحة: ${slots}\nأي وقت يناسبك؟`;
                }
                return null;
            }
            case 'book_maintenance': {
                if (r.booking_id || (r.details && r.details.booking_id)) {
                    const id     = r.booking_id || r.details?.booking_id;
                    const branch = r.details?.branch || '';
                    const date   = r.details?.date   || '';
                    const car    = r.details?.car    || '';
                    return `✅ تم حجز موعد الصيانة بنجاح!\n📋 رقم الحجز: ${id}\n🏢 الفرع: ${branch}\n📅 التاريخ: ${date}\n🚗 السيارة: ${car}\n\nسنتواصل معك للتأكيد. للاستفسار: 06-5000001`;
                }
                if (r.needs_more_info) {
                    const fields = (r.missing_fields || []).join('، ');
                    return `بحتاج منك معلومات إضافية: ${fields} 🙏`;
                }
                return `تم استلام طلب الحجز ✅\nسنتواصل معك على رقمك للتأكيد.\nأو اتصل: 06-5000001`;
            }
            case 'submit_support_ticket': {
                const id = r.ticket_id || r.id;
                return `✅ تم فتح تذكرة دعم${id ? ` رقم ${id}` : ''}!\nسيتواصل معك فريقنا قريباً 📱`;
            }
            case 'create_purchase_inquiry': {
                const id = r.inquiry_id || r.id;
                return `✅ تم تسجيل اهتمامك${id ? ` (رقم ${id})` : ''}!\nسيتصل بك أحد مستشارينا خلال 24 ساعة 🚗`;
            }
            case 'search_cars': {
                const cars = Array.isArray(r) ? r : (r.cars || r.results || []);
                if (!cars.length) return 'ما لقيتش سيارات بهالمواصفات 😔\nجرب فلتر ثاني أو اتصل: 06-5000001';
                const first = cars[0];
                const price = first.price ? ` — ${Number(first.price).toLocaleString()} دينار` : '';
                return `وجدت ${cars.length} سيارة! مثال:\n🚗 ${first.make} ${first.model} ${first.year || ''}${price}\n\nللمزيد من الخيارات اتصل: 06-5000001`;
            }
            case 'check_parts_inventory': {
                if (r.found || r.available) return `✅ القطعة متوفرة — ${r.name || ''} بسعر ${r.price || '?'} دينار`;
                return `عذراً، هذه القطعة غير متوفرة حالياً.\nاتصل 06-5000001 للاستيراد 🔩`;
            }
            case 'get_branch_info': {
                const branches = Array.isArray(r) ? r : (r.branches || null);
                if (branches && branches.length) {
                    const lines = branches.map((b, i) =>
                        `${['1️⃣','2️⃣','3️⃣','4️⃣'][i] || '•'} ${b.name || b.city || ''} — ${b.address || ''}`
                    ).join('\n');
                    return `📍 أفرعنا:\n${lines}\n\nتلفون: 06-5000001`;
                }
                const name = r.name || r.city || r.branch || '';
                const addr = r.address || '';
                if (name || addr) return `📍 ${name}${addr ? ` — ${addr}` : ''}\nتلفون: 06-5000001`;
                return `عنا 4 أفرع 📍\n1️⃣ عمان - شارع المدينة المنورة\n2️⃣ إربد - شارع الجامعة\n3️⃣ الزرقاء - شارع الأمير محمد\n4️⃣ العقبة - شارع الملك الحسين\n\nتلفون: 06-5000001`;
            }
            case 'get_promotions': {
                const promos = Array.isArray(r) ? r : (r.promotions || r.offers || []);
                if (!promos.length) return `ما في عروض خاصة هلق 😊\nبس عنا تقسيط حتى 60 شهر دايماً!\nاتصل: 06-5000001`;
                const lines = promos.slice(0, 3).map(p => `• ${p.title || p.name || p.description || p}`).join('\n');
                return `🎉 عروضنا الحالية:\n${lines}\n\nللمزيد: 06-5000001`;
            }
            case 'get_customer_bookings': {
                const bookings = Array.isArray(r) ? r : (r.bookings || []);
                if (!bookings.length) return `ما عندك حجوزات نشطة حالياً 📋\nبدك تحجز موعد صيانة جديد؟`;
                const lines = bookings.slice(0, 3).map(b =>
                    `• ${b.service_type || 'صيانة'} | ${b.preferred_date || ''} | ${b.branch || ''} | الحالة: ${b.status || ''}`
                ).join('\n');
                return `📋 حجوزاتك:\n${lines}`;
            }
            default:
                return null;
        }
    } catch {
        return null;
    }
}

module.exports = { formatToolFallback };
