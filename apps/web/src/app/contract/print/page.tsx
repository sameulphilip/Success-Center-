'use client';

import { CENTER_NAME, CENTER_TAGLINE, FOUNDER_NAME } from '@/lib/brand';

/**
 * Printable subscription contract: Cowdlly ↔ Success Center
 * Open /contract/print then Ctrl+P → Save as PDF
 */
export default function ContractPrintPage() {
  return (
    <div className="contract-print min-h-screen bg-gradient-to-b from-navy-mist via-sand to-navy-mist/80 text-navy print:bg-white">
      <style jsx global>{`
        @media print {
          @page {
            size: A4;
            margin: 12mm 11mm;
          }
          html,
          body {
            background: white !important;
            height: auto !important;
            overflow: visible !important;
            overflow-x: visible !important;
            overflow-y: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          * {
            overflow: visible !important;
            scrollbar-width: none !important;
            -ms-overflow-style: none !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          *::-webkit-scrollbar {
            display: none !important;
            width: 0 !important;
            height: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          .contract-print {
            background: white !important;
            min-height: 0 !important;
            overflow: visible !important;
          }
          .contract-sheet {
            box-shadow: none !important;
            margin: 0 !important;
            max-width: none !important;
            border: none !important;
            overflow: visible !important;
          }
          .screen-scroll {
            overflow: visible !important;
          }
          .avoid-break {
            break-inside: avoid;
            page-break-inside: avoid;
          }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 border-b border-navy/10 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-[860px] flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-navy">عقد اشتراك Cowdlly × {CENTER_NAME}</p>
            <p className="text-xs text-navy/50">اطبع أو احفظ PDF للتوقيع</p>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={() => window.print()}
          >
            طباعة / PDF
          </button>
        </div>
      </div>

      <article className="contract-sheet mx-auto my-6 max-w-[860px] overflow-hidden rounded-2xl border border-navy/10 bg-white shadow-panel print:my-0 print:overflow-visible print:rounded-none print:border-0 print:shadow-none">
        <div className="h-1.5 bg-gradient-to-l from-gold via-gold-deep to-navy" />

        <header className="avoid-break bg-gradient-to-b from-navy to-navy-soft px-6 pb-5 pt-6 text-center text-white sm:px-10">
          <div className="flex items-center justify-center gap-6 sm:gap-12">
            <LogoBlock
              src="/cowdlly-mark.png"
              alt="Cowdlly"
              caption="Cowdlly"
              invert
            />
            <span className="h-10 w-px bg-white/25 sm:h-12" aria-hidden />
            <LogoBlock
              src="/success-logo.png"
              alt={`${CENTER_NAME} Center`}
              caption={CENTER_NAME}
              sub={FOUNDER_NAME}
              rounded
              invert
            />
          </div>
          <div className="mx-auto mt-5 h-px w-44 bg-gradient-to-l from-transparent via-gold to-transparent" />
          <p className="mt-4 text-[11px] font-semibold tracking-[0.2em] text-gold-soft/90">
            عقد اشتراك وترخيص استخدام برمجي
          </p>
          <h1 className="mt-2 font-display text-[1.55rem] font-bold leading-snug sm:text-[1.8rem]">
            نظام إدارة السنتر التعليمي
          </h1>
          <p className="mt-1.5 text-[13px] font-medium tracking-wide text-white/70">
            Success Center ERP
          </p>
          <p className="mt-3 text-[13px] text-white/75">
            بين <strong className="text-gold-soft">Cowdlly</strong>
            <span className="mx-1.5 text-white/35">و</span>
            <strong className="text-gold-soft">{CENTER_NAME} Center</strong>
          </p>
          <p className="mt-4 inline-block rounded-full border border-white/20 bg-white/10 px-4 py-1 text-[12px] text-white/85">
            التاريخ: ____ / ____ / 20____
          </p>
        </header>

        <div className="px-7 py-7 sm:px-10 sm:py-8">
        <Section title="تمهيد">
          <p>
            حيث إن الطرف الأول (<strong>Cowdlly</strong>) يمتلك ويطوّر ويشغّل نظامًا
            برمجيًا سحابيًا لإدارة المراكز التعليمية تحت اسم{' '}
            <strong>Success Center ERP</strong> («النظام»).
          </p>
          <p className="mt-2">
            وحيث إن الطرف الثاني (<strong>{CENTER_NAME} Center</strong> —{' '}
            {CENTER_TAGLINE}، بإدارة <strong>{FOUNDER_NAME}</strong>) يرغب في
            الاشتراك في استخدام النظام.
          </p>
          <p className="mt-2">
            وحيث اتفق الطرفان على أن المقابل المالي يكون{' '}
            <strong>حسب عدد الطلاب المشتركين لكل ترم دراسي</strong> بواقع{' '}
            <strong>30 جنيهًا مصريًا للطالب عن الترم الكامل</strong>، شاملًا
            السيرفرات والدومين، على <strong>دفعتين</strong> (25/9 / نهاية
            الترم).
          </p>
          <p className="mt-2">
            فقد اتفق الطرفان وهما بكامل الأهلية على البنود التالية، ويُعدّ التمهيد
            جزءًا لا يتجزأ من العقد.
          </p>
        </Section>

        <Section title="البند (1): أطراف العقد">
          <div className="grid gap-3 sm:grid-cols-2">
            <PartyCard
              side="الطرف الأول — المورّد"
              name="Cowdlly"
              logoSrc="/cowdlly-mark.png"
              accent="navy"
              lines={[
                'الصفة: مزوّد ومطوّر ومشغّل النظام',
                'الموقع: cowdlly.com',
                'الممثل: ____________________',
                'الصفة: ____________________',
              ]}
            />
            <PartyCard
              side="الطرف الثاني — العميل"
              name={`${CENTER_NAME} Center`}
              logoSrc="/success-logo.png"
              logoRounded
              accent="gold"
              lines={[
                `الإدارة: ${FOUNDER_NAME}`,
                'النطاق: success.cowdlly.com',
                'الممثل: ____________________',
                'الصفة: ____________________',
              ]}
            />
          </div>
        </Section>

        <Section title="البند (2): تعريفات">
          <Ol>
            <li>
              <strong>النظام:</strong> منصة Success Center ERP (ويب + API)
              ووحداتها في الملحق (أ).
            </li>
            <li>
              <strong>الترم الدراسي:</strong> الفترة الدراسية المعتمدة لدى الطرف
              الثاني، وتُحدَّد تواريخها في الملحق التنفيذي.
            </li>
            <li>
              <strong>الطالب المشترك:</strong> كل طالب مسجّل فعليًا في النظام خلال
              الترم ويُحتسب وفق البند (5).
            </li>
            <li>
              <strong>الاشتراك:</strong> حق استخدام غير حصري وغير قابل للتحويل خلال
              مدة العقد.
            </li>
            <li>
              <strong>الاستضافة والدومين:</strong> تشغيل النظام وربط النطاق ضمن
              السعر المتفق عليه.
            </li>
          </Ol>
        </Section>

        <Section title="البند (3): موضوع العقد">
          <p>
            يلتزم الطرف الأول بمنح الطرف الثاني اشتراكًا في استخدام وتشغيل النظام
            لصالح مركز {CENTER_NAME}، مع الاستضافة والدومين والدعم الفني الأساسي،
            مقابل المبالغ في البند (5)، ووفق المزايا في الملحق (أ).
          </p>
        </Section>

        <Section title="البند (4): نطاق الترخيص والخدمة">
          <Ol>
            <li>
              الترخيص شخصي لأنشطة مركز الطرف الثاني فقط، وغير قابل للتنازل أو إعادة
              البيع دون موافقة كتابية من الطرف الأول.
            </li>
            <li>
              يشمل الاشتراك جميع المزايا في الملحق (أ) المفعّلة على بيئة الإنتاج،
              والتحديثات التحسينية المعتادة.
            </li>
            <li>
              لا يشمل — ما لم يُتفق كتابةً — التخصيصات الجوهرية خارج النطاق، أو
              الأجهزة المادية، أو رسوم مزوّدين خارجيين (اتصالات/واتساب رسمي إن
              فُرضت).
            </li>
            <li>
              تبقى علامة «Powered by Cowdlly» ظاهرة وفق المنتج ما لم يُتفق خلاف ذلك.
            </li>
          </Ol>
        </Section>

        <Section title="البند (5): المقابل المالي وطريقة الدفع">
          <SubTitle>5/1 أساس الاحتساب</SubTitle>
          <ul className="list-disc space-y-1 pr-5 text-[13px] leading-relaxed text-navy/80">
            <li>
              سعر الترم الكامل = <strong>30 ج.م × عدد الطلاب المشتركين</strong>
            </li>
            <li>
              السعر <strong>شامل</strong> السيرفرات (الاستضافة) واسم النطاق
              (الدومين)
            </li>
          </ul>

          <SubTitle>5/2 عدد الطلاب المعتمد</SubTitle>
          <p className="text-[13px] leading-relaxed text-navy/80">
            الأسلوب الافتراضي: عدد الطلاب المسجّلين في النظام في{' '}
            <strong>تاريخ استحقاق كل دفعة</strong>، مع استبعاد الملغي/التجريبي
            المتفق عليه. يُستخرج كشف من النظام ويُراجع خلال 7 أيام من الإخطار.
          </p>

          <SubTitle>5/3 مواعيد الدفع</SubTitle>
          <div className="screen-scroll overflow-x-auto print:overflow-visible">
            <table className="w-full overflow-hidden rounded-lg border border-navy/15 text-[12px]">
              <thead>
                <tr className="bg-gradient-to-l from-navy to-navy-soft text-right text-white">
                  <th className="px-2.5 py-2.5 font-semibold">الدفعة</th>
                  <th className="px-2.5 py-2.5 font-semibold">الموعد</th>
                  <th className="px-2.5 py-2.5 font-semibold">النسبة</th>
                  <th className="px-2.5 py-2.5 font-semibold">المبلغ</th>
                </tr>
              </thead>
              <tbody>
                <tr className="bg-gold-soft/35">
                  <td className="border-t border-navy/10 px-2.5 py-2 font-semibold text-navy">
                    الأولى
                  </td>
                  <td className="border-t border-navy/10 px-2.5 py-2">
                    25/9
                  </td>
                  <td className="border-t border-navy/10 px-2.5 py-2 font-bold text-gold-deep">
                    50%
                  </td>
                  <td className="border-t border-navy/10 px-2.5 py-2">
                    (عدد الطلاب × 30) × 50%
                  </td>
                </tr>
                <tr className="bg-navy-mist/70">
                  <td className="border-t border-navy/10 px-2.5 py-2 font-semibold text-navy">
                    الثانية
                  </td>
                  <td className="border-t border-navy/10 px-2.5 py-2">
                    نهاية الترم
                  </td>
                  <td className="border-t border-navy/10 px-2.5 py-2 font-bold text-navy">
                    50%
                  </td>
                  <td className="border-t border-navy/10 px-2.5 py-2">
                    (عدد الطلاب × 30) × 50%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <SubTitle>5/4 أحكام مالية</SubTitle>
          <Ol>
            <li>السداد بالجنيه المصري للحساب/المحفظة التي يحددها الطرف الأول كتابةً.</li>
            <li>
              تأخير يتجاوز 15 يومًا يخوّل الطرف الأول — بعد إخطار — تقييد أو إيقاف
              الخدمة حتى السداد دون إسقاط المستحقات.
            </li>
            <li>
              الأسعار خاصة بمركز {CENTER_NAME}؛ أي فرع إضافي يحتاج اتفاقًا مستقلاً.
            </li>
          </Ol>
        </Section>

        <Section title="البند (6): المدة والتجديد">
          <Ol>
            <li>يسري من تاريخ التوقيع ويستمر ترمًا فترمًا ما لم يُنهَ.</li>
            <li>
              يتجدد تلقائيًا ما لم يُخطر أحد الطرفين بعدم التجديد قبل نهاية الترم
              بـ 15 يومًا على الأقل.
            </li>
            <li>
              تُثبَّت تواريخ الترم ونهاية الترم في الملحق التنفيذي (ب)، مع استحقاق
              الدفعة الأولى في 25/9.
            </li>
          </Ol>
        </Section>

        <Section title="البند (7): التزامات الطرف الأول (Cowdlly)">
          <Ol>
            <li>تشغيل النظام على بيئة الإنتاج المعتمدة.</li>
            <li>توفير الاستضافة والدومين ضمن الاشتراك.</li>
            <li>الدعم الفني الأساسي والعناية المعقولة بتوافر الخدمة.</li>
            <li>نسخ احتياطي معقول لبيانات النظام.</li>
            <li>الإخطار المسبق قدر الإمكان بالصيانة الجوهرية.</li>
            <li>عدم استخدام بيانات العميل خارج غرض تشغيل الخدمة إلا بموافقة.</li>
          </Ol>
        </Section>

        <Section title="البند (8): التزامات الطرف الثاني (Success)">
          <Ol>
            <li>استخدام النظام لأغراض المركز التعليمية والإدارية المشروعة فقط.</li>
            <li>المحافظة على سرية بيانات الدخول وتحمل مسؤولية حساباته.</li>
            <li>تزويد الطرف الأول بتواريخ الترم والممثلين المخوّلين.</li>
            <li>سداد الاشتراك في المواعيد.</li>
            <li>عدم اختراق أو نسخ أو إعادة هندسة النظام أو إزالة علامات Cowdlly دون اتفاق.</li>
            <li>الالتزام بالقوانين عند معالجة بيانات الطلاب والمراسلات.</li>
          </Ol>
        </Section>

        <Section title="البند (9): الدعم والتطوير">
          <Ol>
            <li>
              دعم أساسي: أعطال التشغيل، استعادة الوصول، استفسارات الاستخدام عبر
              القناة المتفق عليها.
            </li>
            <li>
              التطويرات الجوهرية الجديدة تُقيَّم وقد تكون بمقابل إضافي أو ضمن
              التحديثات العامة باتفاق.
            </li>
            <li>
              استجابة مستهدفة غير طارئة خلال يومي عمل؛ والأعطال الحرجة في أقرب وقت
              ممكن خلال ساعات العمل.
            </li>
          </Ol>
        </Section>

        <Section title="البند (10): الملكية الفكرية والبيانات">
          <Ol>
            <li>
              حقوق النظام والكود والتصميم والعلامات تعود لـ Cowdlly؛ الاشتراك لا
              ينقل الملكية.
            </li>
            <li>
              بيانات تشغيل العميل ملك له، ويُرخص لـ Cowdlly بمعالجتها لتشغيل الخدمة
              والنسخ والدعم فقط.
            </li>
            <li>
              عند الانتهاء: تسليم نسخة بيانات بصيغة متعارف عليها بطلب كتابي خلال
              مدة معقولة، ثم إيقاف الوصول.
            </li>
          </Ol>
        </Section>

        <Section title="البند (11): السرية">
          <p>
            يلتزم كل طرف بسرية المعلومات التجارية والتقنية والمالية لمدة سنتين بعد
            انتهاء العقد، ما لم تكن عامة أو مفروضة بالإفصاح قانونًا.
          </p>
        </Section>

        <Section title="البند (12): إنهاء العقد">
          <Ol>
            <li>الإنهاء في نهاية أي ترم بإخطار وفق البند (6).</li>
            <li>
              للطرف الأول التعليق/الإنهاء عند إخلال جسيم (عدم سداد ممتد، إساءة
              استخدام) مع احتفاظه بالمستحقات.
            </li>
            <li>
              عند الإنهاء يُسدَّد ما استُحق ويُوقف الوصول بعد مهلة معقولة لتصدير
              البيانات إن طُلب.
            </li>
          </Ol>
        </Section>

        <Section title="البند (13): حدود المسؤولية">
          <Ol>
            <li>
              يُقدَّم النظام مع بذل العناية المعقولة؛ ولا يضمن الطرف الأول انعدام
              انقطاع ناتج عن الإنترنت أو مزوّدين خارجيين أو قوة قاهرة.
            </li>
            <li>
              لا يُسأل الطرف الأول عن قرارات إدارية/مالية يتخذها العميل بناءً على
              التقارير.
            </li>
            <li>
              حد أقصى للمسؤولية — إن ثبتت — إجمالي ما سُدد عن الترم محل النزاع.
            </li>
          </Ol>
        </Section>

        <Section title="البند (14): القوة القاهرة">
          <p>
            لا يُعدّ الطرف مخلًّا إذا استحال التنفيذ لظرف قاهر خارج عن إرادته، مع
            الإخطار السريع وبذل الجهد المعقول لاستئناف التنفيذ.
          </p>
        </Section>

        <Section title="البند (15): التعديل والملاحق">
          <p>
            التعديل كتابةً فقط. الملحقان (أ) و(ب) جزء لا يتجزأ من العقد.
          </p>
        </Section>

        <Section title="البند (16): القانون والاختصاص">
          <p>
            يخضع العقد لقوانين جمهورية مصر العربية، ويختص بنظر النزاع محاكم
            _______________ بعد محاولة تسوية ودية خلال 15 يومًا.
          </p>
        </Section>

        <Section title="البند (17): أحكام عامة">
          <Ol>
            <li>نسختان أصليتان بيد كل طرف نسخة.</li>
            <li>بطلان بند لا يبطل بقية البنود.</li>
            <li>
              الإخطارات عبر البريد الرسمي أو واتساب الأرقام المعتمدة، منتجة من تاريخ
              الإرسال الموثّق.
            </li>
          </Ol>
        </Section>

        <Section title="الملحق (أ): المزايا المشمولة في الاشتراك">
          <FeatureGroup title="المنصة والوصول">
            نظام سحابي عربي · أدوار وصلاحيات · دخول طالب QR/موبايل
          </FeatureGroup>
          <FeatureGroup title="لوحة التحكم">
            تشغيل وتحليلات يومية للدخل والحصص والمصادر
          </FeatureGroup>
          <FeatureGroup title="الطلاب والمدرسون">
            سجلات كاملة · بيانات المدرسين وأسعار الحصص
          </FeatureGroup>
          <FeatureGroup title="المجموعات والجدول">
            مجموعات مادة/صف/مدرس/قاعة · تسجيل طلاب · تقويم السنتر
          </FeatureGroup>
          <FeatureGroup title="الحضور وكشك الدخول">
            حضور يدوي · مسح QR · check-in · QR بوابة السنتر
          </FeatureGroup>
          <FeatureGroup title="الحجز والاستمارات">
            استمارات سنتر/أونلاين · تأكيد دفع · إيصالات · كشوف وطباعة · استيراد عند
            التفعيل
          </FeatureGroup>
          <FeatureGroup title="المحفظة الإلكترونية">
            تحويلات فودافون كاش/إنستاباي · تحويل الرصيد لصاحب السنتر
          </FeatureGroup>
          <FeatureGroup title="تشغيل الحصص (Ops)">
            فتح جلسة · تحصيل · تقسيم سنتر/مدرس · حضور · استرجاع · قفل · تسوية · حظر
          </FeatureGroup>
          <FeatureGroup title="الحسابات والخزنة">
            إيصالات · درج استقبال · قفل يوم · محضر مطبوع · مصروفات · تسليم · تصفية
            مدرسين
          </FeatureGroup>
          <FeatureGroup title="إيرادات إضافية">
            أكواد أونلاين (بيع/إرجاع) · ملازم (مخزون/بيع/إرجاع) · تأجير قاعات · تقارير
          </FeatureGroup>
          <FeatureGroup title="التقارير والامتحانات">
            أرباح ومصروفات وربحية ومالي واستمارات ومدرسين · Excel/طباعة · امتحانات
            ودرجات
          </FeatureGroup>
          <FeatureGroup title="التواصل والبوابة">
            واتساب/SMS/إشعارات · قوالب وتذكيرات · بوابة طالب وولي أمر
          </FeatureGroup>
          <FeatureGroup title="المستخدمون والإعدادات">
            إدارة مستخدمين وصلاحيات · مواد وصفوف وقاعات · QR البوابة
          </FeatureGroup>
          <FeatureGroup title="البنية ضمن السعر (30 ج.م / طالب / ترم)">
            استضافة السيرفرات · الدومين المعتمد · قاعدة البيانات وطوابير الرسائل
            اللازمة للتشغيل
          </FeatureGroup>
          <p className="mt-3 text-[12px] text-navy/55">
            أي ميزة تُضاف لاحقًا ضمن التحديثات العامة لبيئة الإنتاج تُعدّ مشمولة ما
            لم يُعلن الطرف الأول أنها إضافة مدفوعة منفصلة.
          </p>
        </Section>

        <Section title="الملحق (ب): ملحق تنفيذي — ترم دراسي">
          <div className="screen-scroll overflow-x-auto print:overflow-visible">
            <table className="w-full border-collapse text-[12px]">
              <tbody>
                {[
                  ['العام الدراسي', '____________________'],
                  ['اسم الترم', '□ أول  □ ثانٍ  □ صيفي  □ أخرى'],
                  ['بداية الترم', '____ / ____ / ______'],
                  ['موعد الدفعة 1', '25/9'],
                  ['نهاية الترم (دفعة 2)', '____ / ____ / ______'],
                  ['عدد الطلاب — دفعة 1', '__________'],
                  ['مبلغ الدفعة 1 (50%)', '__________ ج.م'],
                  ['عدد الطلاب — دفعة 2', '__________'],
                  ['مبلغ الدفعة 2 (50%)', '__________ ج.م'],
                  ['إجمالي اشتراك الترم', '__________ ج.م'],
                  ['وسيلة السداد', '____________________'],
                ].map(([k, v], i) => (
                  <tr
                    key={k}
                    className={i % 2 === 0 ? 'bg-navy-mist/50' : 'bg-white'}
                  >
                    <td className="w-[42%] border border-navy/10 bg-navy/5 px-2.5 py-2 font-semibold text-navy">
                      {k}
                    </td>
                    <td className="border border-navy/10 px-2.5 py-2 text-navy/70">
                      {v}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12px] text-navy/65">
            اعتماد الملحق — الطرف الأول: _____________ التاريخ: _______ · الطرف
            الثاني: _____________ التاريخ: _______
          </p>
        </Section>

        <Section title="التوقيعات">
          <p className="mb-4 text-[13px] text-navy/75">
            بإمضائهما أدناه يقرّ الطرفان بقراءة العقد وفهم بنوده والموافقة عليها.
          </p>
          <div className="grid gap-6 sm:grid-cols-2">
            <SignBlock
              title="الطرف الأول — Cowdlly"
              logoSrc="/cowdlly-mark.png"
              accent="navy"
            />
            <SignBlock
              title={`الطرف الثاني — ${CENTER_NAME} Center`}
              logoSrc="/success-logo.png"
              logoRounded
              accent="gold"
            />
          </div>
        </Section>

        </div>

        <footer className="border-t border-navy/10 bg-gradient-to-l from-navy-mist via-gold-soft/40 to-navy-mist px-7 py-3 sm:px-10">
          <div className="flex items-center justify-between gap-3 text-[10px] font-medium text-navy/50">
            <span className="text-navy/60">Cowdlly × {CENTER_NAME} Center</span>
            <span className="rounded-full bg-navy px-2.5 py-0.5 text-[9px] text-gold-soft">
              Success Center ERP
            </span>
          </div>
        </footer>
      </article>
    </div>
  );
}


function SubTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-2 mt-4 flex items-center gap-2 text-[13px] font-bold text-navy first:mt-0">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-gold" />
      {children}
    </h3>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="avoid-break mt-6 first:mt-0">
      <h2 className="mb-3 flex items-center gap-0 overflow-hidden rounded-lg border border-navy/10 bg-gradient-to-l from-navy-mist to-white">
        <span className="w-1.5 self-stretch bg-gradient-to-b from-gold to-gold-deep" />
        <span className="px-3 py-2 font-display text-[13.5px] font-bold tracking-tight text-navy">
          {title}
        </span>
      </h2>
      <div className="text-[13px] leading-[1.75] text-navy/80">{children}</div>
    </section>
  );
}

function Ol({ children }: { children: React.ReactNode }) {
  return (
    <ol className="list-decimal space-y-2 pr-5 text-[13px] leading-[1.75] text-navy/80 marker:font-semibold marker:text-gold-deep">
      {children}
    </ol>
  );
}

function LogoBlock({
  src,
  alt,
  caption,
  sub,
  rounded,
  invert,
}: {
  src: string;
  alt: string;
  caption: string;
  sub?: string;
  rounded?: boolean;
  invert?: boolean;
}) {
  return (
    <div className="flex min-w-[104px] flex-col items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={`h-[68px] w-[68px] object-contain sm:h-[76px] sm:w-[76px] ${
          rounded
            ? 'rounded-full bg-white p-0.5 ring-2 ring-gold/50'
            : 'rounded-xl bg-[#0b0f1a] p-1.5 ring-2 ring-white/15'
        }`}
      />
      <p
        className={`text-[13px] font-bold leading-none tracking-tight ${
          invert ? 'text-white' : 'text-navy'
        }`}
      >
        {caption}
      </p>
      {sub ? (
        <p
          className={`text-[10px] font-medium leading-none ${
            invert ? 'text-gold-soft/90' : 'text-gold-deep'
          }`}
        >
          {sub}
        </p>
      ) : null}
    </div>
  );
}

function PartyCard({
  side,
  name,
  lines,
  logoSrc,
  logoRounded,
  accent = 'navy',
}: {
  side: string;
  name: string;
  lines: string[];
  logoSrc?: string;
  logoRounded?: boolean;
  accent?: 'navy' | 'gold';
}) {
  const top =
    accent === 'gold'
      ? 'from-gold-soft/80 to-white border-gold/30'
      : 'from-navy-mist to-white border-navy/15';
  const bar = accent === 'gold' ? 'bg-gold' : 'bg-navy';
  return (
    <div className={`overflow-hidden rounded-xl border bg-gradient-to-b ${top}`}>
      <div className={`h-1 ${bar}`} />
      <div className="p-3.5">
        <div className="flex items-start gap-3 border-b border-navy/10 pb-2.5">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoSrc}
              alt=""
              className={`h-11 w-11 shrink-0 object-contain ${
                logoRounded
                  ? 'rounded-full bg-white p-0.5 ring-1 ring-gold/40'
                  : 'rounded-lg bg-[#0b0f1a] p-1 ring-1 ring-navy/15'
              }`}
            />
          ) : null}
          <div className="min-w-0 pt-0.5">
            <p className="text-[10px] font-semibold tracking-wide text-navy/45">
              {side}
            </p>
            <p className="mt-0.5 text-[14px] font-bold text-navy">{name}</p>
          </div>
        </div>
        <ul className="mt-2.5 space-y-1.5 text-[11.5px] leading-relaxed text-navy/65">
          {lines.map((l) => (
            <li key={l} className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-gold" />
              <span>{l}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function FeatureGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1.5 grid grid-cols-[7.5rem_1fr] items-start gap-x-3 rounded-lg border border-navy/8 bg-navy-mist/40 px-2.5 py-2 last:mb-0 sm:grid-cols-[9.5rem_1fr]">
      <p className="text-[12px] font-bold text-navy">{title}</p>
      <p className="text-[12px] leading-relaxed text-navy/60">{children}</p>
    </div>
  );
}

function SignBlock({
  title,
  logoSrc,
  logoRounded,
  accent = 'navy',
}: {
  title: string;
  logoSrc?: string;
  logoRounded?: boolean;
  accent?: 'navy' | 'gold';
}) {
  const border =
    accent === 'gold' ? 'border-gold/35 bg-gold-soft/20' : 'border-navy/15 bg-navy-mist/50';
  const bar = accent === 'gold' ? 'bg-gold' : 'bg-navy';
  return (
    <div className={`overflow-hidden rounded-xl border ${border}`}>
      <div className={`h-1 ${bar}`} />
      <div className="p-4">
        <div className="flex items-center gap-2.5 border-b border-navy/10 pb-2.5">
          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoSrc}
              alt=""
              className={`h-9 w-9 shrink-0 object-contain ${
                logoRounded
                  ? 'rounded-full bg-white p-0.5 ring-1 ring-gold/40'
                  : 'rounded-lg bg-[#0b0f1a] p-1 ring-1 ring-navy/15'
              }`}
            />
          ) : null}
          <p className="text-[13px] font-bold text-navy">{title}</p>
        </div>
        <div className="mt-4 space-y-3.5 text-[12px] text-navy/65">
          {['الاسم', 'الصفة', 'التوقيع', 'التاريخ'].map((label) => (
            <p key={label} className="flex gap-2">
              <span className="w-14 shrink-0 font-medium text-navy/45">{label}</span>
              <span className="flex-1 border-b border-navy/25" />
            </p>
          ))}
          <div>
            <p className="mb-1.5 font-medium text-navy/45">الختم (إن وُجد)</p>
            <div className="h-16 rounded-lg border border-dashed border-navy/20 bg-white/70" />
          </div>
        </div>
      </div>
    </div>
  );
}
