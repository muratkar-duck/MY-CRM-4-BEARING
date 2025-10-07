import { useEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, FormEvent, ReactNode, SetStateAction } from 'react';
import {
  Plus,
  Calendar,
  MapPin,
  Phone,
  Mail,
  Edit,
  Trash2,
  Clock,
  AlertCircle,
  Upload,
  Download,
  Search,
  Bell,
  Sun,
  Moon,
  CheckCircle2,
  Link as LinkIcon,
  Tag,
  X,
  Filter,
  LayoutGrid,
  Table as TableIcon,
  Flame,
} from 'lucide-react';

/**
 * CustomerTrackerPro – kişisel CRM (tek dosya komponent)
 * Özellikler:
 * - localStorage persist
 * - Arama + filtreler (durum, şehir, etiket)
 * - Quick Add (hızlı ekleme)
 * - CSV dışa aktar / içe aktar
 * - Aktivite Timeline (tüm statü değişiklikleri ve önemli olaylar)
 * - Hatırlatıcı paneli: bugün mesaj atılacaklar, bugünkü ziyaretler, takip zamanı gelenler
 * - Pipeline progress bar
 * - Basit takvim görünümü (yaklaşan 30 gün)
 * - Mobil kart görünümü + tablo görünümü arasında geçiş
 * - Dark mode toggle
 * - (Opsiyonel) Tarayıcı bildirimi izni + uyarı gönderme
 */

const STATUS_OPTIONS = {
  connection_sent: {
    label: 'Bağlantı İsteği Gönderildi',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  },
  connection_accepted: {
    label: 'Bağlantı Kabul Edildi',
    color:
      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  },
  message_sent: {
    label: 'Mesaj Gönderildi',
    color:
      'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
  },
  replied: {
    label: 'Geri Dönüş Aldı',
    color:
      'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200',
  },
  visit_requested: {
    label: 'Ziyaret Talep Edildi',
    color:
      'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200',
  },
  visit_pending: {
    label: 'Ziyaret Beklemede (Optimizasyon İçin)',
    color:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200',
  },
  visit_scheduled: {
    label: 'Ziyaret Planlandı',
    color:
      'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-200',
  },
  email_redirect: {
    label: 'E-posta Yönlendirmesi',
    color: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-200',
  },
  completed: {
    label: 'Tamamlandı',
    color:
      'bg-emerald-200 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200',
  },
} as const;

type StatusKey = keyof typeof STATUS_OPTIONS;

const PROGRESS_ORDER: StatusKey[] = [
  'connection_sent',
  'connection_accepted',
  'message_sent',
  'replied',
  'visit_requested',
  'visit_pending',
  'visit_scheduled',
  'email_redirect',
  'completed',
];

const PRIORITY_OPTIONS = {
  high: {
    label: 'Acil',
    color:
      'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200 border-red-200 dark:border-red-700',
    description: 'Öncelikli takip gerekli',
  },
  medium: {
    label: 'Normal',
    color:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 border-amber-200 dark:border-amber-700',
    description: 'Planlanan takvime göre ilerliyor',
  },
  low: {
    label: 'Düşük',
    color:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 border-emerald-200 dark:border-emerald-700',
    description: 'Bekleme modunda veya tamamlandı',
  },
} as const;

type PriorityLevel = keyof typeof PRIORITY_OPTIONS;

interface ActivityEntry {
  date: string;
  type: string;
  detail: string;
}

type CustomerForm = {
  companyName: string;
  contactName: string;
  city: string;
  phone: string;
  email: string;
  status: StatusKey;
  priority: PriorityLevel;
  connectionDate: string;
  messageDate: string;
  visitDate: string;
  notes: string;
  tags: string[];
};

interface Customer extends CustomerForm {
  id: number;
  createdAt?: string;
  updatedAt?: string;
  activityLog?: ActivityEntry[];
}

const STORAGE_KEY = 'customer_tracker_pro_v1';
const todayISO = () => new Date().toISOString().split('T')[0];
const daysSince = (iso?: string | null) => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = Date.now() - date.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

const createBlankForm = (): CustomerForm => ({
  companyName: '',
  contactName: '',
  city: '',
  phone: '',
  email: '',
  status: 'connection_sent',
  priority: 'medium',
  connectionDate: '',
  messageDate: '',
  visitDate: '',
  notes: '',
  tags: [],
});

const toFormState = (customer: Customer): CustomerForm => ({
  companyName: customer.companyName ?? '',
  contactName: customer.contactName ?? '',
  city: customer.city ?? '',
  phone: customer.phone ?? '',
  email: customer.email ?? '',
  status: customer.status ?? 'connection_sent',
  priority: customer.priority ?? 'medium',
  connectionDate: customer.connectionDate ?? '',
  messageDate: customer.messageDate ?? '',
  visitDate: customer.visitDate ?? '',
  notes: customer.notes ?? '',
  tags: [...(customer.tags ?? [])],
});

const CSV_HEADERS = [
  'id',
  'companyName',
  'contactName',
  'city',
  'phone',
  'email',
  'status',
  'priority',
  'connectionDate',
  'messageDate',
  'visitDate',
  'notes',
  'tags',
] as const;

type CsvHeader = (typeof CSV_HEADERS)[number];

const isStatus = (value: string): value is StatusKey =>
  value in STATUS_OPTIONS;

const isCsvHeader = (value: string): value is CsvHeader =>
  (CSV_HEADERS as readonly string[]).includes(value);

const isPriority = (value: string): value is PriorityLevel =>
  value in PRIORITY_OPTIONS;

function resolvePriority(value: unknown): PriorityLevel {
  return typeof value === 'string' && isPriority(value) ? value : 'medium';
}

const parseCsvLine = (line: string): string[] => {
  const row: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      row.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  row.push(cur);
  return row;
};

function useLocalStorageState<T>(
  key: string,
  initialValue: T
): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* ignore persistence errors */
    }
  }, [key, state]);
  return [state, setState];
}

function csvEscape(value: unknown) {
  if (value == null) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('\n') || s.includes('"')) {
    return '"' + s.replaceAll('"', '""') + '"';
  }
  return s;
}

function toCSV(rows: Customer[]) {
  const lines = [CSV_HEADERS.join(',')];
  rows.forEach((row) => {
    const values = CSV_HEADERS.map((header) => {
      switch (header) {
        case 'id':
          return row.id ? String(row.id) : '';
        case 'companyName':
          return row.companyName ?? '';
        case 'contactName':
          return row.contactName ?? '';
        case 'city':
          return row.city ?? '';
        case 'phone':
          return row.phone ?? '';
        case 'email':
          return row.email ?? '';
        case 'status':
          return row.status ?? 'connection_sent';
        case 'priority':
          return row.priority ?? 'medium';
        case 'connectionDate':
          return row.connectionDate ?? '';
        case 'messageDate':
          return row.messageDate ?? '';
        case 'visitDate':
          return row.visitDate ?? '';
        case 'notes':
          return row.notes ?? '';
        case 'tags':
          return (row.tags ?? []).join('|');
        default:
          return '';
      }
    });
    lines.push(values.map(csvEscape).join(','));
  });
  return lines.join('\n');
}

function fromCSV(text: string): Customer[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  const headerCells = parseCsvLine(lines[0]);
  const out: Customer[] = [];
  for (let i = 1; i < lines.length; i++) {
    const rowValues = parseCsvLine(lines[i]);
    const partial: Partial<Customer> = {};
    headerCells.forEach((headerCell, idx) => {
      if (!isCsvHeader(headerCell)) return;
      const value = rowValues[idx] ?? '';
      switch (headerCell) {
        case 'id': {
          const parsed = Number(value);
          if (Number.isFinite(parsed)) partial.id = parsed;
          break;
        }
        case 'companyName':
          partial.companyName = value;
          break;
        case 'contactName':
          partial.contactName = value;
          break;
        case 'city':
          partial.city = value;
          break;
        case 'phone':
          partial.phone = value;
          break;
        case 'email':
          partial.email = value;
          break;
        case 'status':
          if (isStatus(value)) partial.status = value;
          break;
        case 'priority':
          if (isPriority(value)) partial.priority = value;
          break;
        case 'connectionDate':
          partial.connectionDate = value;
          break;
        case 'messageDate':
          partial.messageDate = value;
          break;
        case 'visitDate':
          partial.visitDate = value;
          break;
        case 'notes':
          partial.notes = value;
          break;
        case 'tags':
          partial.tags = value
            ? value.split('|').map((tag) => tag.trim()).filter(Boolean)
            : [];
          break;
        default:
          break;
      }
    });
    const {
      id: parsedId,
      tags: parsedTags,
      status: parsedStatus,
      priority: parsedPriority,
      activityLog,
      createdAt,
      updatedAt,
      ...rest
    } = partial;
    const id =
      typeof parsedId === 'number' && Number.isFinite(parsedId)
        ? parsedId
        : Date.now() + Math.random();
    const now = new Date().toISOString();
    const customer: Customer = {
      ...createBlankForm(),
      ...rest,
      id,
      tags: parsedTags ?? [],
      status: parsedStatus ?? 'connection_sent',
      priority: parsedPriority ?? 'medium',
      activityLog: activityLog ?? [],
      createdAt: createdAt ?? now,
      updatedAt: updatedAt ?? now,
    };
    out.push(customer);
  }
  return out;
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
      <div
        className="h-full bg-blue-600"
        style={{ width: `${Math.round(value * 100)}%` }}
      />
    </div>
  );
}

function TagChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove?: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 mr-1 mb-1">
      <Tag size={12} /> {label}
      {onRemove && (
        <button onClick={onRemove} className="opacity-70 hover:opacity-100">
          <X size={12} />
        </button>
      )}
    </span>
  );
}

function PriorityBadge({ level }: { level?: PriorityLevel }) {
  const resolvedLevel = resolvePriority(level);
  const option = PRIORITY_OPTIONS[resolvedLevel];
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${option.color}`}
    >
      <Flame size={12} /> {option.label}
    </span>
  );
}

function StatCard({
  title,
  value,
  description,
}: {
  title: string;
  value: string | number;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm">
      <div className="text-sm uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {title}
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-snug">
        {description}
      </div>
    </div>
  );
}

export default function CustomerTrackerPro() {
  const [customers, setCustomers] = useLocalStorageState<Customer[]>(
    STORAGE_KEY,
    []
  );
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerForm>(() => createBlankForm());
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusKey | 'all'>('all');
  const [cityFilter, setCityFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<PriorityLevel | 'all'>(
    'all'
  );
  const [dark, setDark] = useLocalStorageState<boolean>('ctp_dark', false);
  const [view, setView] = useLocalStorageState<'table' | 'cards'>(
    'ctp_view',
    'table'
  );
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickFeedback, setQuickFeedback] = useState<string | null>(null);
  const hasNormalizedStorage = useRef(false);

  useEffect(() => {
    if (hasNormalizedStorage.current) return;
    hasNormalizedStorage.current = true;
    setCustomers((prev) => {
      let changed = false;
      const upgraded = prev.map((customer) => {
        const resolvedPriority = resolvePriority(customer.priority);
        const activityLog = customer.activityLog ?? [];
        if (
          resolvedPriority !== customer.priority ||
          customer.activityLog == null
        ) {
          changed = true;
          return {
            ...customer,
            priority: resolvedPriority,
            activityLog,
          };
        }
        return customer;
      });
      return changed ? upgraded : prev;
    });
  }, [setCustomers]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (dark) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [dark]);

  const cities = useMemo(
    () => [...new Set(customers.map((c) => c.city).filter(Boolean))].sort(),
    [customers]
  );
  const allTags = useMemo(() => {
    const unique = new Set<string>();
    customers.forEach((customer) => {
      customer.tags?.forEach((tag) => {
        const trimmed = tag.trim();
        if (trimmed) unique.add(trimmed);
      });
    });
    return Array.from(unique).sort((a, b) => a.localeCompare(b, 'tr'));
  }, [customers]);

  const filtered = useMemo(
    () =>
      customers.filter((c) => {
        const q = query.trim().toLowerCase();
        const inText =
          !q ||
          [
            c.companyName,
            c.contactName,
            c.city,
            c.notes,
            (c.tags ?? []).join(' '),
          ]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(q));
        const st = statusFilter === 'all' || c.status === statusFilter;
        const ct = !cityFilter || c.city === cityFilter;
        const tg = !tagFilter || (c.tags ?? []).includes(tagFilter);
        const pr = priorityFilter === 'all' || c.priority === priorityFilter;
        return inText && st && ct && tg && pr;
      }),
    [customers, query, statusFilter, cityFilter, tagFilter, priorityFilter]
  );

  const analytics = useMemo(() => {
    const total = customers.length;
    const completed = customers.filter((c) => c.status === 'completed').length;
    const active = total - completed;
      const repliedIndex = PROGRESS_ORDER.indexOf('replied');
      const responded = repliedIndex === -1
        ? 0
        : customers.filter(
            (c) => PROGRESS_ORDER.indexOf(c.status) >= repliedIndex
          ).length;
    const responseRate = total ? Math.round((responded / total) * 100) : 0;
    const conversionRate = total ? Math.round((completed / total) * 100) : 0;
    const highPriorityOpen = customers.filter(
      (c) => c.priority === 'high' && c.status !== 'completed'
    ).length;
    const highPriorityTotal = customers.filter(
      (c) => c.priority === 'high'
    ).length;
    const scheduledVisits = customers.filter(
      (c) => c.status === 'visit_scheduled'
    ).length;
    const upcomingWeekVisits = customers.filter((c) => {
      if (!c.visitDate) return false;
      const visit = new Date(c.visitDate);
      const diff = visit.getTime() - Date.now();
      return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
    }).length;
    const responseDescription = total
      ? `${responded}/${total} müşteri geri dönüş sağladı`
      : 'Henüz müşteri yok';
    const conversionDescription = total
      ? `${completed}/${total} müşteri tamamlandı`
      : 'Veri bekleniyor';
    return [
      {
        title: 'Aktif Pipeline',
        value: active,
        description: `${completed} tamamlandı`,
      },
      {
        title: 'Yanıt Oranı',
        value: `${responseRate}%`,
        description: responseDescription,
      },
      {
        title: 'Planlı Ziyaretler',
        value: scheduledVisits,
        description: `${upcomingWeekVisits} tanesi 7 gün içinde`,
      },
      {
        title: 'Acil Öncelikler',
        value: highPriorityTotal,
        description: `${highPriorityOpen} aktif takip`,
      },
      {
        title: 'Dönüşüm Oranı',
        value: `${conversionRate}%`,
        description: conversionDescription,
      },
    ];
  }, [customers]);

  const staleCustomers = useMemo(() => {
    return customers
      .filter((c) => c.status !== 'completed')
      .map((customer) => ({
        customer,
        days: daysSince(customer.updatedAt ?? customer.createdAt) ?? 0,
      }))
      .filter((entry) => entry.days >= 10)
      .sort((a, b) => b.days - a.days)
      .slice(0, 5);
  }, [customers]);

  const highPriorityFocus = useMemo(() => {
    return customers
      .filter((c) => c.priority === 'high' && c.status !== 'completed')
      .map((customer) => ({
        customer,
        days: daysSince(customer.updatedAt ?? customer.createdAt) ?? 0,
      }))
      .sort((a, b) => b.days - a.days)
      .slice(0, 5);
  }, [customers]);

  const sameCity = (city: string, excludeId: number) => {
    const relevantStatuses: StatusKey[] = [
      'visit_requested',
      'visit_scheduled',
      'visit_pending',
    ];
    return customers.filter(
      (c) =>
        c.city === city &&
        c.id !== excludeId &&
        relevantStatuses.includes(c.status)
    );
  };

  // Pipeline progress ratio
  const progressOf = (customer: Customer) => {
    const idx = PROGRESS_ORDER.indexOf(customer.status);
    return idx < 0 ? 0 : idx / (PROGRESS_ORDER.length - 1);
  };

  // Activity log helpers
  const addLog = (custId: number, type: string, detail: string) => {
    setCustomers((prev) =>
      prev.map((customer) => {
        if (customer.id !== custId) return customer;
        const entry: ActivityEntry = {
          date: new Date().toISOString(),
          type,
          detail,
        };
        const activityLog = [...(customer.activityLog ?? []), entry];
        return { ...customer, activityLog, updatedAt: entry.date };
      })
    );
  };

  // Form handlers
  const resetForm = () => {
    setForm(createBlankForm());
    setEditing(null);
    setShowForm(false);
    setTagInput('');
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if (!form.companyName || !form.contactName || !form.city) {
      alert('Firma adı, iletişim kişisi ve şehir zorunlu.');
      return;
    }
    if (editing) {
      setCustomers((prev) =>
        prev.map((customer) =>
          customer.id === editing.id
            ? {
                ...customer,
                ...form,
                id: editing.id,
                updatedAt: new Date().toISOString(),
              }
            : customer
        )
      );
      addLog(editing.id, 'update', 'Kayıt güncellendi');
    } else {
      const id = Date.now() + Math.random();
      const now = new Date().toISOString();
      const creationLog: ActivityEntry = {
        date: now,
        type: 'create',
        detail: 'Kayıt oluşturuldu',
      };
      const newRec: Customer = {
        ...form,
        id,
        createdAt: now,
        updatedAt: now,
        activityLog: [creationLog],
      };
      setCustomers((prev) => [...prev, newRec]);
    }
    resetForm();
  };

  const startEdit = (customer: Customer) => {
    setForm(toFormState(customer));
    setEditing(customer);
    setShowForm(true);
    setTagInput('');
  };

  const removeCustomer = (id: number) => {
    if (confirm('Bu müşteriyi silmek istediğinizden emin misiniz?')) {
      setCustomers((prev) => prev.filter((customer) => customer.id !== id));
    }
  };

  const setStatus = (id: number, newStatus: StatusKey) => {
    setCustomers((prev) =>
      prev.map((customer) => {
        if (customer.id !== id) return customer;
        const updates: Customer = {
          ...customer,
          status: newStatus,
          updatedAt: new Date().toISOString(),
        };
        if (newStatus === 'message_sent' && !customer.messageDate) {
          updates.messageDate = todayISO();
        }
        if (newStatus === 'connection_accepted' && !customer.connectionDate) {
          updates.connectionDate = customer.connectionDate || todayISO();
        }
        if (newStatus === 'visit_scheduled' && !customer.visitDate) {
          updates.visitDate = customer.visitDate || todayISO();
        }
        return updates;
      })
    );
    addLog(
      id,
      'status',
      `Durum: ${STATUS_OPTIONS[newStatus]?.label || newStatus}`
    );
  };

  const setPriorityLevel = (id: number, level: PriorityLevel) => {
    setCustomers((prev) =>
      prev.map((customer) =>
        customer.id === id
          ? {
              ...customer,
              priority: level,
              updatedAt: new Date().toISOString(),
            }
          : customer
      )
    );
    addLog(id, 'priority', `Öncelik: ${PRIORITY_OPTIONS[level].label}`);
  };

  // Quick add minimal form state
  const [quick, setQuick] = useState<Pick<
    CustomerForm,
    'companyName' | 'contactName' | 'city' | 'priority'
  >>({
    companyName: '',
    contactName: '',
    city: '',
    priority: 'medium',
  });
  const quickAdd = (): boolean => {
    const companyName = quick.companyName.trim();
    const contactName = quick.contactName.trim();
    const city = quick.city.trim();
    if (!companyName || !contactName || !city) return false;
    const id = Date.now() + Math.random();
    const now = new Date().toISOString();
    const quickLog: ActivityEntry = {
      date: now,
      type: 'create',
      detail: 'Hızlı ekleme',
    };
    const rec: Customer = {
      ...createBlankForm(),
      ...quick,
      companyName,
      contactName,
      city,
      id,
      createdAt: now,
      updatedAt: now,
      activityLog: [quickLog],
    };
    setCustomers((prev) => [rec, ...prev]);
    setQuick({ companyName: '', contactName: '', city: '', priority: 'medium' });
    return true;
  };

  const handleQuickSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (quickAdd()) {
      setQuickError(null);
      setQuickFeedback('Müşteri listeye eklendi.');
    } else {
      setQuickFeedback(null);
      setQuickError('Lütfen firma, kişi ve şehir bilgilerini doldurun.');
    }
  };

  // Message due: connection_accepted + next day = today and not messaged yet
  const messageDue = useMemo(
    () =>
      customers.filter((c) => {
        if (c.status === 'connection_accepted' && c.connectionDate) {
          const d = new Date(c.connectionDate);
          const next = new Date(d);
          next.setDate(next.getDate() + 1);
          return (
            next.toISOString().split('T')[0] === todayISO() && !c.messageDate
          );
        }
        return false;
      }),
    [customers]
  );

  const visitsToday = useMemo(
    () => customers.filter((c) => c.visitDate === todayISO()),
    [customers]
  );

  const followupsDue = useMemo(() => {
    // basit kural: message_sent ise 7 gün sonra takip öner
    return customers
      .filter((c) => c.status === 'message_sent' && c.messageDate)
      .filter((c) => {
        const d = new Date(c.messageDate);
        const next = new Date(d);
        next.setDate(next.getDate() + 7);
        return next.toISOString().split('T')[0] === todayISO();
      });
  }, [customers]);

  // Batch visit schedule by city (pending)
  const pendingByCity = useMemo<Array<[string, Customer[]]>>(() => {
    const groups: Record<string, Customer[]> = {};
    customers
      .filter((c) => c.status === 'visit_pending')
      .forEach((c) => {
        const key = c.city || 'Bilinmeyen';
        groups[key] = groups[key] ?? [];
        groups[key].push(c);
      });
    return Object.entries(groups);
  }, [customers]);

  const scheduleBatchVisit = (list: Customer[], date: string) => {
    if (!date) return;
    const ids = new Set(list.map((c) => c.id));
    const timestamp = new Date().toISOString();
    setCustomers((prev) =>
      prev.map((customer) =>
        ids.has(customer.id)
          ? {
              ...customer,
              status: 'visit_scheduled',
              visitDate: date,
              updatedAt: timestamp,
            }
          : customer
      )
    );
    list.forEach((customer) =>
      addLog(customer.id, 'status', `Toplu planlama: ${date}`)
    );
  };

  // CSV export
  const exportCSV = () => {
    const blob = new Blob([toCSV(customers)], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customers_${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // CSV import
  const importCSV = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        alert('CSV içe aktarma hatası: Geçersiz dosya içeriği');
        return;
      }
      try {
        const rows = fromCSV(result);
        // basit merge: id çakışırsa yeni id ver
        const existingIds = new Set(customers.map((c) => String(c.id)));
        const sanitized: Customer[] = rows.map((row) => {
          const id = existingIds.has(String(row.id))
            ? Date.now() + Math.random()
            : row.id;
          return {
            ...row,
            id,
            activityLog: row.activityLog ?? [],
          };
        });
        setCustomers((prev) => [...prev, ...sanitized]);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        alert('CSV içe aktarma hatası: ' + message);
      }
    };
    reader.onerror = () => {
      alert('CSV dosyası okunamadı.');
    };
    reader.readAsText(file, 'utf-8');
  };

  // Notification permission & trigger
  const notify = (title: string, body: string) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (window.Notification.permission === 'granted')
      new window.Notification(title, { body });
  };

  const checkRemindersAndNotify = () => {
    if (messageDue.length)
      notify('Mesaj zamanı', `${messageDue.length} kişi için mesaj zamanı`);
    if (visitsToday.length)
      notify('Ziyaret bugün', `${visitsToday.length} ziyaret planlı`);
    if (followupsDue.length)
      notify('Takip zamanı', `${followupsDue.length} kişi için takip zamanı`);
  };

  // Upcoming simple calendar (next 30 days)
  const upcoming = useMemo<Array<[string, Customer[]]>>(() => {
    const map: Record<string, Customer[]> = {};
    const now = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().split('T')[0];
      map[key] = [];
    }
    customers
      .filter((c) => c.visitDate)
      .forEach((c) => {
        if (map[c.visitDate]) map[c.visitDate].push(c);
      });
    return Object.entries(map);
  }, [customers]);

  // Helpers for tag entry
  const [tagInput, setTagInput] = useState('');
  const addTagToForm = (tag?: string) => {
    const t = (tag ?? tagInput).trim();
    if (!t) return;
    setForm((prev) => {
      if (prev.tags.includes(t)) return prev;
      return { ...prev, tags: [...prev.tags, t] };
    });
    if (tag === undefined) {
      setTagInput('');
    }
  };
  const suggestedTags = useMemo(
    () => allTags.filter((tag) => !form.tags.includes(tag)),
    [allTags, form.tags]
  );

  const quickReady = useMemo(
    () =>
      Boolean(
        quick.companyName.trim() &&
          quick.contactName.trim() &&
          quick.city.trim()
      ),
    [quick]
  );

  useEffect(() => {
    if (quickError && quickReady) {
      setQuickError(null);
    }
  }, [quickError, quickReady]);

  useEffect(() => {
    if (!quickFeedback) return;
    const timeout = setTimeout(() => setQuickFeedback(null), 3000);
    return () => clearTimeout(timeout);
  }, [quickFeedback]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-bold">
              Hoşgeldiniz, Murat Kar!
            </h1>
            <button
              onClick={() => setDark((d) => !d)}
              className="px-3 py-2 rounded-lg bg-gray-200 dark:bg-gray-800"
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button
              onClick={() =>
                setView((v) => (v === 'table' ? 'cards' : 'table'))
              }
              className="px-3 py-2 rounded-lg bg-gray-200 dark:bg-gray-800"
            >
              {view === 'table' ? (
                <LayoutGrid size={18} />
              ) : (
                <TableIcon size={18} />
              )}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700">
              <Search size={16} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ara: firma, kişi, şehir, not, etiket"
                className="bg-transparent outline-none w-56"
              />
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
            >
              <Plus size={18} /> Yeni Müşteri
            </button>
            <button
              onClick={exportCSV}
              className="bg-gray-200 dark:bg-gray-800 px-3 py-2 rounded-lg flex items-center gap-2"
            >
              <Download size={16} /> CSV
            </button>
            <label className="bg-gray-200 dark:bg-gray-800 px-3 py-2 rounded-lg flex items-center gap-2 cursor-pointer">
              <Upload size={16} /> CSV Yükle
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importCSV(f);
                  e.target.value = '';
                }}
              />
            </label>
            {typeof window !== 'undefined' && 'Notification' in window && (
              <button
                onClick={() => {
                  Notification.requestPermission().then(() =>
                    checkRemindersAndNotify()
                  );
                }}
                className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-2 rounded-lg flex items-center gap-2"
              >
                <Bell size={16} /> Bildirim
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700">
            <Filter size={16} />
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as StatusKey | 'all')
              }
              className="bg-transparent outline-none"
            >
              <option value="all">Tüm Durumlar</option>
              {Object.entries(STATUS_OPTIONS).map(([k, o]) => (
                <option key={k} value={k}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700">
            <MapPin size={16} />
            <select
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
              className="bg-transparent outline-none"
            >
              <option value="">Tüm Şehirler</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700">
            <Tag size={16} />
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="bg-transparent outline-none"
            >
              <option value="">Tüm Etiketler</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700">
            <Flame size={16} />
            <select
              value={priorityFilter}
              onChange={(e) =>
                setPriorityFilter(e.target.value as PriorityLevel | 'all')
              }
              className="bg-transparent outline-none"
            >
              <option value="all">Tüm Öncelikler</option>
              {Object.entries(PRIORITY_OPTIONS).map(([key, option]) => (
                <option key={key} value={key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-300 ml-auto">
            Toplam: {filtered.length} müşteri
          </div>
        </div>

        {/* Analytics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          {analytics.map((card) => (
            <StatCard
              key={card.title}
              title={card.title}
              value={card.value}
              description={card.description}
            />
          ))}
        </div>

        {/* Quick Add */}
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 mb-4">
          <form
            onSubmit={handleQuickSubmit}
            className="grid grid-cols-1 md:grid-cols-5 gap-2"
          >
            <input
              value={quick.companyName}
              onChange={(e) =>
                setQuick((prev) => ({ ...prev, companyName: e.target.value }))
              }
              placeholder="Firma Adı *"
              className="px-3 py-2 border rounded-lg bg-transparent"
              autoComplete="organization"
            />
            <input
              value={quick.contactName}
              onChange={(e) =>
                setQuick((prev) => ({ ...prev, contactName: e.target.value }))
              }
              placeholder="Kişi *"
              className="px-3 py-2 border rounded-lg bg-transparent"
              autoComplete="name"
            />
            <input
              value={quick.city}
              onChange={(e) =>
                setQuick((prev) => ({ ...prev, city: e.target.value }))
              }
              placeholder="Şehir *"
              className="px-3 py-2 border rounded-lg bg-transparent"
              autoComplete="address-level2"
            />
            <select
              value={quick.priority}
              onChange={(e) =>
                setQuick((prev) => ({
                  ...prev,
                  priority: e.target.value as PriorityLevel,
                }))
              }
              className="px-3 py-2 border rounded-lg bg-transparent"
            >
              {Object.entries(PRIORITY_OPTIONS).map(([key, option]) => (
                <option key={key} value={key}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!quickReady}
              className="bg-green-600 hover:bg-green-700 disabled:bg-green-600/50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg flex items-center gap-2 justify-center"
            >
              <CheckCircle2 size={18} /> Hızlı Ekle
            </button>
          </form>
          <div className="mt-2 min-h-[1.25rem]">
            {quickError ? (
              <p
                className="text-sm text-red-600"
                role="alert"
                aria-live="assertive"
              >
                {quickError}
              </p>
            ) : quickFeedback ? (
              <p
                className="text-sm text-green-600"
                role="status"
                aria-live="polite"
              >
                {quickFeedback}
              </p>
            ) : null}
          </div>
        </div>

        {/* Reminder panels */}
        {messageDue.length > 0 && (
          <Panel
            title={`Bugün Mesaj Gönderilecekler (${messageDue.length})`}
            icon={<AlertCircle className="text-yellow-600" size={18} />}
          >
            {messageDue.map((c) => (
              <Row key={c.id} left={`${c.companyName} – ${c.contactName}`}>
                <button
                  onClick={() => setStatus(c.id, 'message_sent')}
                  className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded text-sm"
                >
                  Mesaj Gönderildi
                </button>
              </Row>
            ))}
          </Panel>
        )}

        {visitsToday.length > 0 && (
          <Panel
            title={`Bugünkü Ziyaretler (${visitsToday.length})`}
            icon={<Calendar className="text-indigo-600" size={18} />}
          >
            {visitsToday.map((c) => (
              <Row
                key={c.id}
                left={`${c.companyName} – ${c.contactName} (${c.city})`}
              >
                <span className="text-sm opacity-80">
                  {new Date(c.visitDate).toLocaleDateString('tr-TR')}
                </span>
              </Row>
            ))}
          </Panel>
        )}

        {followupsDue.length > 0 && (
          <Panel
            title={`Takip Zamanı Gelenler (${followupsDue.length})`}
            icon={<Clock className="text-amber-600" size={18} />}
          >
            {followupsDue.map((c) => (
              <Row key={c.id} left={`${c.companyName} – ${c.contactName}`}>
                <button
                  onClick={() => addLog(c.id, 'followup', 'Takip edildi')}
                  className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1 rounded text-sm"
                >
                  Takip Ettim
                </button>
              </Row>
            ))}
          </Panel>
        )}

        {highPriorityFocus.length > 0 && (
          <Panel
            title={`Acil Takip Önerileri (${highPriorityFocus.length})`}
            icon={<Flame className="text-red-600" size={18} />}
          >
            {highPriorityFocus.map(({ customer, days }) => (
              <Row
                key={customer.id}
                left={
                  <div>
                    <div>
                      {customer.companyName} – {customer.contactName}
                    </div>
                    <div className="text-xs text-red-600 dark:text-red-300">
                      {days} gündür güncelleme yok
                    </div>
                  </div>
                }
              >
                <button
                  onClick={() => startEdit(customer)}
                  className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
                >
                  Şimdi İncele
                </button>
              </Row>
            ))}
          </Panel>
        )}

        {staleCustomers.length > 0 && (
          <Panel
            title={`Güncelleme Bekleyenler (${staleCustomers.length})`}
            icon={<AlertCircle className="text-orange-600" size={18} />}
          >
            {staleCustomers.map(({ customer, days }) => (
              <Row
                key={customer.id}
                left={
                  <div>
                    <div>
                      {customer.companyName} – {customer.contactName}
                    </div>
                    <div className="text-xs text-orange-600 dark:text-orange-300">
                      {days} gündür temas yok
                    </div>
                  </div>
                }
              >
                <button
                  onClick={() => startEdit(customer)}
                  className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1 rounded text-sm"
                >
                  Kaydı Aç
                </button>
              </Row>
            ))}
          </Panel>
        )}

        {/* Pending batch scheduling */}
        {pendingByCity.length > 0 && (
          <Panel
            title="Ziyaret Optimizasyonu Bekleyenler"
            icon={<Clock className="text-amber-600" size={18} />}
          >
            {pendingByCity.map(([city, list]) => (
              <div
                key={city}
                className="mb-3 p-3 rounded border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20"
              >
                <div className="font-medium mb-2 text-amber-900 dark:text-amber-200">
                  {city} – {list.length} firma beklemede
                </div>
                <div className="space-y-1 mb-2">
                  {list.map((c) => (
                    <Row
                      key={c.id}
                      left={`${c.companyName} – ${c.contactName}`}
                    >
                      <button
                        onClick={() => setStatus(c.id, 'visit_scheduled')}
                        className="bg-amber-600 hover:bg-amber-700 text-white px-2 py-1 rounded text-xs"
                      >
                        Tekil Planla
                      </button>
                    </Row>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    className="px-3 py-1 border rounded text-sm bg-transparent"
                    min={todayISO()}
                    onChange={(e) => {
                      if (e.target.value)
                        scheduleBatchVisit(list, e.target.value);
                    }}
                  />
                  <span className="text-sm opacity-80">
                    Tüm {city} firmalarını aynı güne planla
                  </span>
                </div>
              </div>
            ))}
          </Panel>
        )}

        {/* Add/Edit Form */}
        {showForm && (
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-6">
            <form
              onSubmit={handleSubmit}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              <input
                value={form.companyName}
                onChange={(e) =>
                  setForm({ ...form, companyName: e.target.value })
                }
                placeholder="Firma Adı *"
                className="px-3 py-2 border rounded-lg bg-transparent"
                required
                autoComplete="organization"
              />
              <input
                value={form.contactName}
                onChange={(e) =>
                  setForm({ ...form, contactName: e.target.value })
                }
                placeholder="İletişim Kişisi *"
                className="px-3 py-2 border rounded-lg bg-transparent"
                required
                autoComplete="name"
              />
              <input
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="Şehir *"
                className="px-3 py-2 border rounded-lg bg-transparent"
                required
                autoComplete="address-level2"
              />
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="Telefon"
                className="px-3 py-2 border rounded-lg bg-transparent"
                autoComplete="tel"
              />
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="E-posta"
                className="px-3 py-2 border rounded-lg bg-transparent"
                autoComplete="email"
              />
              <select
                value={form.status}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    status: e.target.value as StatusKey,
                  }))
                }
                className={`px-3 py-2 border rounded-lg bg-transparent`}
              >
                {Object.entries(STATUS_OPTIONS).map(([k, o]) => (
                  <option key={k} value={k}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                value={form.priority}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    priority: e.target.value as PriorityLevel,
                  }))
                }
                className="px-3 py-2 border rounded-lg bg-transparent"
              >
                {Object.entries(PRIORITY_OPTIONS).map(([key, option]) => (
                  <option key={key} value={key}>
                    {option.label}
                  </option>
                ))}
              </select>
              <div className="flex flex-col">
                <label className="text-sm mb-1">LinkedIn Bağlantı Tarihi</label>
                <input
                  type="date"
                  value={form.connectionDate}
                  onChange={(e) =>
                    setForm({ ...form, connectionDate: e.target.value })
                  }
                  className="px-3 py-2 border rounded-lg bg-transparent"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-sm mb-1">Mesaj Gönderim Tarihi</label>
                <input
                  type="date"
                  value={form.messageDate}
                  onChange={(e) =>
                    setForm({ ...form, messageDate: e.target.value })
                  }
                  className="px-3 py-2 border rounded-lg bg-transparent"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-sm mb-1">Ziyaret Tarihi</label>
                <input
                  type="date"
                  value={form.visitDate}
                  onChange={(e) =>
                    setForm({ ...form, visitDate: e.target.value })
                  }
                  className="px-3 py-2 border rounded-lg bg-transparent"
                />
              </div>
              <div className="col-span-full">
                <label className="text-sm mb-1">Etiketler</label>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="etiket yaz ve ekle"
                    className="px-3 py-2 border rounded-lg bg-transparent"
                    autoComplete="off"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTagToForm();
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => addTagToForm()}
                    className="px-3 py-2 rounded-lg bg-gray-200 dark:bg-gray-700"
                  >
                    Ekle
                  </button>
                </div>
                <div>
                  {form.tags.map((t) => (
                    <TagChip
                      key={t}
                      label={t}
                      onRemove={() =>
                        setForm((prev) => ({
                          ...prev,
                          tags: prev.tags.filter((x) => x !== t),
                        }))
                      }
                    />
                  ))}
                </div>
                {suggestedTags.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Önceden kullanılan etiketler
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {suggestedTags.map((tag) => (
                        <button
                          type="button"
                          key={tag}
                          onClick={() => addTagToForm(tag)}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border border-transparent bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition"
                        >
                          <Tag size={12} />
                          {tag}
                          <Plus size={12} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Notlar (Markdown serbest)"
                rows={3}
                className="px-3 py-2 border rounded-lg bg-transparent col-span-full"
              />
              <div className="col-span-full flex gap-2">
                <button
                  type="submit"
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg"
                >
                  {editing ? 'Güncelle' : 'Ekle'}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg"
                >
                  İptal
                </button>
              </div>
            </form>
          </div>
        )}

        {/* List */}
        {view === 'table' ? (
          <div className="overflow-x-auto">
            <table className="w-full table-auto">
              <thead className="bg-gray-100 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left">Firma</th>
                  <th className="px-4 py-3 text-left">Kişi</th>
                  <th className="px-4 py-3 text-left">Şehir</th>
                  <th className="px-4 py-3 text-left">Durum</th>
                  <th className="px-4 py-3 text-left">Öncelik</th>
                  <th className="px-4 py-3 text-left">İlerleme</th>
                  <th className="px-4 py-3 text-left">Tarihler</th>
                  <th className="px-4 py-3 text-left">İletişim</th>
                  <th className="px-4 py-3 text-left">Etiketler</th>
                  <th className="px-4 py-3 text-left">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const same = sameCity(c.city, c.id);
                  return (
                    <tr
                      key={c.id}
                      className="border-b dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">{c.companyName}</div>
                        {c.notes && (
                          <div className="text-sm opacity-80 mt-1 line-clamp-2">
                            {c.notes}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">{c.contactName}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <MapPin size={16} />
                          {c.city}
                          {same.length > 0 && (
                            <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 text-xs px-2 py-1 rounded-full ml-2">
                              +{same.length} firma
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={c.status}
                          onChange={(e) =>
                            setStatus(c.id, e.target.value as StatusKey)
                          }
                          className={`px-2 py-1 rounded-full text-sm ${
                            STATUS_OPTIONS[c.status]?.color || ''
                          }`}
                        >
                          {Object.entries(STATUS_OPTIONS).map(([k, o]) => (
                            <option key={k} value={k}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={resolvePriority(c.priority)}
                          onChange={(e) =>
                            setPriorityLevel(
                              c.id,
                              e.target.value as PriorityLevel
                            )
                          }
                          className="px-2 py-1 rounded-full text-sm border bg-transparent"
                        >
                          {Object.entries(PRIORITY_OPTIONS).map(
                            ([key, option]) => (
                              <option key={key} value={key}>
                                {option.label}
                              </option>
                            )
                          )}
                        </select>
                      </td>
                      <td className="px-4 py-3 w-48">
                        <ProgressBar value={progressOf(c)} />
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {c.connectionDate && (
                          <div className="flex items-center gap-1 mb-1">
                            <Clock size={14} /> Bağlantı:{' '}
                            {new Date(c.connectionDate).toLocaleDateString(
                              'tr-TR'
                            )}
                          </div>
                        )}
                        {c.messageDate && (
                          <div className="flex items-center gap-1 mb-1">
                            <Mail size={14} /> Mesaj:{' '}
                            {new Date(c.messageDate).toLocaleDateString(
                              'tr-TR'
                            )}
                          </div>
                        )}
                        {c.visitDate && (
                          <div className="flex items-center gap-1">
                            <Calendar size={14} /> Ziyaret:{' '}
                            {new Date(c.visitDate).toLocaleDateString('tr-TR')}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {c.phone && (
                            <a
                              href={`tel:${c.phone}`}
                              className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              <Phone size={14} /> {c.phone}
                            </a>
                          )}
                          {c.email && (
                            <a
                              href={`mailto:${c.email}`}
                              className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              <Mail size={14} /> E-posta
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap max-w-[220px]">
                          {(c.tags ?? []).map((t) => (
                            <TagChip key={t} label={t} />
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => startEdit(c)}
                            className="text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900/30 p-1 rounded"
                            title="Düzenle"
                          >
                            <Edit size={16} />
                          </button>
                          <button
                            onClick={() => removeCustomer(c.id)}
                            className="text-red-600 hover:bg-red-100 dark:hover:bg-red-900/30 p-1 rounded"
                            title="Sil"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="text-center py-12 opacity-60">
                Kayıt bulunamadı.
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="font-semibold text-lg">{c.companyName}</div>
                    <div className="text-sm opacity-80">
                      {c.contactName} • {c.city}
                    </div>
                  </div>
                  <button
                    onClick={() => startEdit(c)}
                    className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700"
                  >
                    <Edit size={16} />
                  </button>
                </div>
                <div
                  className={`inline-block px-2 py-1 rounded-full text-xs mb-2 ${
                    STATUS_OPTIONS[c.status]?.color || ''
                  }`}
                >
                  {STATUS_OPTIONS[c.status]?.label || c.status}
                </div>
                <div className="mb-2">
                  <PriorityBadge level={c.priority} />
                </div>
                <div className="mb-2">
                  <ProgressBar value={progressOf(c)} />
                </div>
                <div className="text-sm space-y-1 mb-3">
                  {c.connectionDate && (
                    <div className="flex items-center gap-1">
                      <Clock size={14} />{' '}
                      {new Date(c.connectionDate).toLocaleDateString('tr-TR')}
                    </div>
                  )}
                  {c.messageDate && (
                    <div className="flex items-center gap-1">
                      <Mail size={14} />{' '}
                      {new Date(c.messageDate).toLocaleDateString('tr-TR')}
                    </div>
                  )}
                  {c.visitDate && (
                    <div className="flex items-center gap-1">
                      <Calendar size={14} />{' '}
                      {new Date(c.visitDate).toLocaleDateString('tr-TR')}
                    </div>
                  )}
                </div>
                {(c.tags ?? []).length > 0 && (
                  <div className="mb-3 flex flex-wrap">
                    {(c.tags ?? []).map((t) => (
                      <TagChip key={t} label={t} />
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <select
                    value={c.status}
                    onChange={(e) =>
                      setStatus(c.id, e.target.value as StatusKey)
                    }
                    className="flex-1 px-2 py-2 rounded border bg-transparent"
                  >
                    {Object.entries(STATUS_OPTIONS).map(([k, o]) => (
                      <option key={k} value={k}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                    <select
                      value={resolvePriority(c.priority)}
                      onChange={(e) =>
                        setPriorityLevel(
                          c.id,
                          e.target.value as PriorityLevel
                        )
                      }
                      className="px-2 py-2 rounded border bg-transparent"
                      title="Öncelik"
                    >
                    {Object.entries(PRIORITY_OPTIONS).map(([key, option]) => (
                      <option key={key} value={key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {c.phone && (
                    <a
                      href={`tel:${c.phone}`}
                      className="px-2 py-2 rounded border"
                    >
                      <Phone size={16} />
                    </a>
                  )}
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      className="px-2 py-2 rounded border"
                    >
                      <Mail size={16} />
                    </a>
                  )}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="text-center py-12 opacity-60 col-span-full">
                Kayıt bulunamadı.
              </div>
            )}
          </div>
        )}

        {/* Activity Timeline (accordion per customer) */}
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-3">Aktivite Geçmişi</h3>
          <div className="space-y-3">
            {customers.map((c) => (
              <details
                key={c.id}
                className="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3"
              >
                <summary className="cursor-pointer select-none font-medium">
                  {c.companyName} – {c.contactName}
                </summary>
                <div className="mt-3 space-y-2">
                  {(c.activityLog ?? []).length === 0 && (
                    <div className="opacity-60 text-sm">Kayıt yok</div>
                  )}
                  {(c.activityLog ?? [])
                    .slice()
                    .reverse()
                    .map((e, idx) => (
                      <div
                        key={idx}
                        className="text-sm flex items-center gap-2"
                      >
                        <Clock size={14} />{' '}
                        <span className="opacity-70">
                          {new Date(e.date).toLocaleString('tr-TR')}
                        </span>{' '}
                        – <span className="font-medium">{e.type}</span> •{' '}
                        {e.detail}
                      </div>
                    ))}
                </div>
              </details>
            ))}
          </div>
        </div>

        {/* Upcoming calendar list */}
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Calendar size={18} /> Yaklaşan 30 Gün
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {upcoming.map(([date, list]) => (
              <div
                key={date}
                className="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3"
              >
                <div className="font-medium mb-2">
                  {new Date(date).toLocaleDateString('tr-TR', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </div>
                {list.length === 0 ? (
                  <div className="text-sm opacity-50">Plan yok</div>
                ) : (
                  <ul className="text-sm space-y-1">
                    {list.map((c) => (
                      <li key={c.id}>
                        • {c.companyName} – {c.contactName} ({c.city})
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>

        <footer className="mt-10 opacity-60 text-sm flex items-center gap-2">
          <LinkIcon size={14} /> Veriler localStorage'da saklanır. CSV ile yedek
          almayı unutma.
        </footer>
      </div>
    </div>
  );
}

function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <h3 className="font-semibold">{title}</h3>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({
  left,
  children,
}: {
  left: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <div>{left}</div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
