import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Eye, 
  Ear, 
  MapPin, 
  Phone, 
  Hospital as HospitalIcon, 
  Accessibility,
  ChevronLeft,
  Info,
  Home,
  Search,
  Menu,
  X
} from 'lucide-react';
import { getHospitalsNearMe } from './services/geminiService';
import { HOSPITAL_DATABASE } from './data/hospitals';

type DisabilityType = 'blind' | 'deaf' | null;

interface Hospital {
  name: string;
  address: string;
  phone: string;
  services: string[];
  governorate: string;
}

const GOVERNORATES = [
  "القاهرة", "الجيزة", "الإسكندرية", "الدقهلية", "البحر الأحمر", 
  "البحيرة", "الفيوم", "الغربية", "الإسماعيلية", "المنوفية", 
  "المنيا", "القليوبية", "الوادي الجديد", "السويس", "الشرقية", 
  "دمياط", "بورسعيد", "جنوب سيناء", "كفر الشيخ", "مطروح", 
  "الأقصر", "قنا", "شمال سيناء", "سوهاج", "بني سويف", "أسيوط", "أسوان"
];

export default function App() {
  const [disability, setDisability] = useState<DisabilityType>(null);
  const [governorate, setGovernorate] = useState<string>('');
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const [showSignInfo, setShowSignInfo] = useState(false);
  const [activeTab, setActiveTab] = useState('home');
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showOfflineDb, setShowOfflineDb] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [locationStatus, setLocationStatus] = useState<'idle' | 'requesting' | 'granted' | 'denied'>('idle');
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [cachedHospitals, setCachedHospitals] = useState<Hospital[]>([]);

  const [showLocationPrompt, setShowLocationPrompt] = useState(true);

  React.useEffect(() => {
    // Load cache
    const saved = localStorage.getItem('hospital_cache');
    if (saved) {
      try {
        setCachedHospitals(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load cache", e);
      }
    }

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' as PermissionName }).then((result) => {
        setLocationStatus(result.state as any);
        result.onchange = () => setLocationStatus(result.state as any);
      });
    }
    const hasSeenWelcome = localStorage.getItem('hasSeenWelcome');
    if (!hasSeenWelcome && window.innerWidth < 768) {
      setShowWelcome(true);
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowInstallBanner(true);
    });

    window.addEventListener('appinstalled', () => {
      setDeferredPrompt(null);
      setShowInstallBanner(false);
    });
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
        setShowInstallBanner(false);
      }
    } else {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
      if (isIOS) {
        alert('لتثبيت التطبيق على iPhone: اضغط على زر "مشاركة" (Share) ثم اختر "إضافة إلى الشاشة الرئيسية" (Add to Home Screen).');
      } else {
        alert('لتثبيت التطبيق، اضغط على زر "إضافة إلى الشاشة الرئيسية" في متصفحك.');
      }
    }
  };

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      setActiveTab(id);
    }
  };

  const handleNearMe = () => {
    if (navigator.geolocation) {
      setLocationStatus('requesting');
      setLoading(true);
      navigator.geolocation.getCurrentPosition(async (position) => {
        setLocationStatus('granted');
        setShowLocationPrompt(false);
        const { latitude, longitude } = position.coords;
        
        if (isOffline) {
          // If offline, we can't search dynamically, so we show some local data
          setHospitals(HOSPITAL_DATABASE.slice(0, 5));
          setGovernorate("بالقرب مني (أوفلاين)");
          setShowOfflineDb(true);
        } else {
          const rawResults = await getHospitalsNearMe(latitude, longitude);
          const results = rawResults.map((h: any) => ({ ...h, governorate: "بالقرب مني" }));
          setHospitals(results);
          setGovernorate("بالقرب مني");
          setShowOfflineDb(false);
        }
        
        setStep(3);
        setLoading(false);
        // Scroll to results
        document.getElementById('search-tool')?.scrollIntoView({ behavior: 'smooth' });
      }, (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setLocationStatus('denied');
          alert("تم رفض الوصول للموقع. يرجى تفعيل الإذن من إعدادات المتصفح.");
        } else {
          alert("تعذر الحصول على الموقع. يرجى التأكد من تفعيل الجي بي إس.");
        }
        setLoading(false);
      });
    }
  };

  const handleDisabilitySelect = (type: DisabilityType) => {
    setDisability(type);
    setStep(2);
  };

  const handleGovernorateSelect = async (gov: string) => {
    setGovernorate(gov);
    setStep(3);
    setLoading(true);
    
    // Simulate a small delay for UX consistency
    // The user wants to search in stored data only
    setTimeout(() => {
      const results = HOSPITAL_DATABASE.filter(h => {
        const matchesGov = h.governorate === gov;
        if (!matchesGov) return false;
        
        if (disability === 'blind') {
          return h.services.some(s => 
            s.includes('بصر') || s.includes('مكفوف') || s.includes('ميسرة') || s.includes('همم') || s.includes('عيون') || s.includes('رمد')
          );
        }
        if (disability === 'deaf') {
          return h.services.some(s => 
            s.includes('إشارة') || s.includes('صم') || s.includes('بكم') || s.includes('همم') || s.includes('سمع') || s.includes('تخاطب')
          );
        }
        return true;
      }).sort((a, b) => {
        const getScore = (h: Hospital) => {
          let score = 0;
          const name = h.name.toLowerCase();
          const services = h.services.join(' ').toLowerCase();
          
          if (disability === 'blind') {
            if (services.includes('وحدة إعاقة بصرية') || services.includes('تجهيزات للمكفوفين') || services.includes('دعم تعليمي للمكفوفين')) score += 100;
            if (name.includes('معهد') || name.includes('مركز رعاية') || name.includes('مركز المكفوفين')) score += 50;
            if (services.includes('بصر') || services.includes('مكفوف')) score += 30;
            if (name.includes('رمد') || name.includes('عيون')) score += 20;
          } else if (disability === 'deaf') {
            if (services.includes('مترجمين لغة إشارة') || services.includes('وحدة تخاطب') || services.includes('تخصص سمعيات') || services.includes('تخصص تخاطب')) score += 100;
            if (name.includes('معهد') || name.includes('مركز السمع') || name.includes('وحدة التخاطب')) score += 50;
            if (services.includes('صم') || services.includes('بكم') || services.includes('إشارة')) score += 30;
            if (name.includes('سمع') || name.includes('تخاطب')) score += 20;
          }
          
          if (name.includes('جامعي') || name.includes('تعليمي') || name.includes('تخصصي')) score += 10;
          
          return score;
        };
        
        return getScore(b) - getScore(a);
      });
      
      setHospitals(results);
      setShowOfflineDb(true); // Mark as offline/local database
      setLoading(false);
    }, 500);
  };

  const reset = () => {
    setDisability(null);
    setGovernorate('');
    setHospitals([]);
    setStep(1);
    setShowSignInfo(false);
    setShowOfflineDb(false);
  };

  const closeWelcome = () => {
    setShowWelcome(false);
    localStorage.setItem('hasSeenWelcome', 'true');
  };

  const handleBrowseOffline = () => {
    // Combine static DB with user cache
    const combined = [...HOSPITAL_DATABASE];
    cachedHospitals.forEach(h => {
      if (!combined.find(existing => existing.name === h.name)) {
        combined.push(h);
      }
    });
    setHospitals(combined);
    setGovernorate("قاعدة البيانات المخزنة");
    setShowOfflineDb(true);
    setStep(3);
    scrollToSection('search-tool');
  };

  return (
    <div className="min-h-screen bg-white text-neutral-900 font-sans selection:bg-emerald-100 pb-20 md:pb-0">
      {/* Location Permission Prompt for Mobile */}
      <AnimatePresence>
        {showLocationPrompt && (locationStatus === 'idle' || locationStatus === 'denied') && (
          <motion.div 
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="md:hidden sticky top-[73px] z-40 px-4 py-3 bg-blue-600 text-white shadow-lg flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-lg">
                <MapPin className="w-5 h-5" />
              </div>
              <div className="text-xs">
                <p className="font-bold">فعل الموقع الجغرافي</p>
                <p className="opacity-90">للعثور على أقرب المستشفيات إليك</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={handleNearMe}
                className="bg-white text-blue-600 px-4 py-2 rounded-lg text-xs font-bold whitespace-nowrap active:scale-95 transition-transform"
              >
                تفعيل الآن
              </button>
              <button 
                onClick={() => setShowLocationPrompt(false)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Offline Banner */}
      <AnimatePresence>
        {isOffline && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-amber-500 text-white text-center py-2 text-sm font-bold flex items-center justify-center gap-2 overflow-hidden"
          >
            <Info className="w-4 h-4" />
            أنت الآن في وضع الأوفلاين. يتم استخدام قاعدة البيانات المحلية.
          </motion.div>
        )}
      </AnimatePresence>

      {/* PWA Install Banner */}
      <AnimatePresence>
        {showInstallBanner && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-24 left-4 right-4 z-[60] md:bottom-8 md:left-auto md:right-8 md:w-96"
          >
            <div className="bg-emerald-600 text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-xl">
                  <HospitalIcon className="w-6 h-6" />
                </div>
                <div>
                  <p className="font-bold text-sm">ثبّت تطبيق رعاية</p>
                  <p className="text-xs text-emerald-100">لسهولة الوصول والعمل أوفلاين</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleInstall}
                  className="bg-white text-emerald-600 px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-50 transition-colors"
                >
                  تثبيت
                </button>
                <button 
                  onClick={() => setShowInstallBanner(false)}
                  className="p-2 hover:bg-white/10 rounded-xl transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Welcome Modal for Mobile */}
      <AnimatePresence>
        {showWelcome && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full text-center space-y-6 shadow-2xl"
            >
              <div className="w-20 h-20 bg-emerald-100 rounded-3xl flex items-center justify-center mx-auto">
                <HospitalIcon className="w-10 h-10 text-emerald-600" />
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-bold text-neutral-900">أهلاً بك في رعاية</h2>
                <p className="text-neutral-500 leading-relaxed">
                  تطبيقك الموثوق للوصول إلى الرعاية الصحية الميسرة لذوي الهمم في مصر.
                </p>
              </div>
              <div className="space-y-3">
                <button 
                  onClick={closeWelcome}
                  className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all active:scale-95 shadow-lg shadow-emerald-100"
                >
                  ابدأ الاستخدام
                </button>
                <button 
                  onClick={() => {
                    handleInstall();
                    closeWelcome();
                  }}
                  className="w-full py-4 bg-emerald-50 text-emerald-700 rounded-2xl font-bold hover:bg-emerald-100 transition-all active:scale-95"
                >
                  تثبيت التطبيق على هاتفي
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 z-50 px-6 py-3 flex justify-around items-center shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
        <button 
          onClick={() => scrollToSection('home')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'home' ? 'text-emerald-600' : 'text-neutral-400'}`}
        >
          <Home className="w-6 h-6" />
          <span className="text-[10px] font-medium">الرئيسية</span>
        </button>
        <button 
          onClick={() => scrollToSection('search-tool')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'search-tool' ? 'text-emerald-600' : 'text-neutral-400'}`}
        >
          <Search className="w-6 h-6" />
          <span className="text-[10px] font-medium">البحث</span>
        </button>
        <button 
          onClick={() => scrollToSection('features')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'features' ? 'text-emerald-600' : 'text-neutral-400'}`}
        >
          <Accessibility className="w-6 h-6" />
          <span className="text-[10px] font-medium">المميزات</span>
        </button>
        <button 
          onClick={handleInstall}
          className="flex flex-col items-center gap-1 text-neutral-400"
        >
          <Accessibility className="w-6 h-6" />
          <span className="text-[10px] font-medium">تثبيت</span>
        </button>
        <button 
          onClick={() => scrollToSection('footer')}
          className={`flex flex-col items-center gap-1 ${activeTab === 'footer' ? 'text-emerald-600' : 'text-neutral-400'}`}
        >
          <Info className="w-6 h-6" />
          <span className="text-[10px] font-medium">تواصل</span>
        </button>
      </div>

      {/* Navbar */}
      <nav className="bg-white/80 backdrop-blur-md border-b border-neutral-100 sticky top-0 z-50 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 p-2 rounded-xl shadow-lg shadow-emerald-200">
              <HospitalIcon className="text-white w-6 h-6" />
            </div>
            <span className="text-2xl font-bold tracking-tight text-emerald-900">رعاية</span>
          </div>
          
          <div className="hidden md:flex items-center gap-8">
            <a href="#" className="text-neutral-600 hover:text-emerald-600 font-medium transition-colors">الرئيسية</a>
            <a href="#features" className="text-neutral-600 hover:text-emerald-600 font-medium transition-colors">المميزات</a>
            <a href="#search-tool" className="text-neutral-600 hover:text-emerald-600 font-medium transition-colors">ابحث الآن</a>
            <a href="#about" className="text-neutral-600 hover:text-emerald-600 font-medium transition-colors">عن التطبيق</a>
          </div>

          <div className="flex items-center gap-4">
            {disability === 'deaf' && (
              <button 
                onClick={() => setShowSignInfo(true)}
                className="px-4 py-2 bg-blue-50 text-blue-600 rounded-xl text-sm font-bold hover:bg-blue-100 transition-colors"
              >
                لغة الإشارة
              </button>
            )}
            <button 
              onClick={() => document.getElementById('search-tool')?.scrollIntoView({ behavior: 'smooth' })}
              className="bg-emerald-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-md shadow-emerald-100"
            >
              ابدأ الآن
            </button>
            <button 
              onClick={handleInstall}
              className="hidden md:flex items-center gap-2 px-4 py-2 border border-emerald-200 text-emerald-700 rounded-xl text-sm font-bold hover:bg-emerald-50 transition-colors"
            >
              <Accessibility className="w-4 h-4" />
              تثبيت التطبيق
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section id="home" className="relative overflow-hidden pt-20 pb-32 bg-neutral-50">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full opacity-10 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-400 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-400 rounded-full blur-3xl"></div>
        </div>

        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8 text-center lg:text-right">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-full text-sm font-bold"
              >
                <Accessibility className="w-4 h-4" />
                تكنولوجيا من أجل الإنسانية
              </motion.div>
              
              <motion.h1 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-5xl lg:text-7xl font-bold leading-tight text-neutral-900"
              >
                رعاية صحية <span className="text-emerald-600">ميسرة</span> للجميع في مصر
              </motion.h1>
              
              <motion.p 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-xl text-neutral-500 leading-relaxed max-w-2xl mx-auto lg:mx-0"
              >
                نساعد الصم والبكم والمكفوفين في العثور على المستشفيات المجهزة طبياً وهندسياً لاستقبالهم بكرامة واحترافية.
              </motion.p>

              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex flex-wrap justify-center lg:justify-start gap-4"
              >
                <button 
                  onClick={() => document.getElementById('search-tool')?.scrollIntoView({ behavior: 'smooth' })}
                  className="px-8 py-4 bg-emerald-600 text-white rounded-2xl text-lg font-bold hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-200 active:scale-95"
                >
                  ابحث عن مستشفى
                </button>
                <button 
                  onClick={handleBrowseOffline}
                  className="px-8 py-4 bg-white border border-neutral-200 text-neutral-700 rounded-2xl text-lg font-bold hover:bg-neutral-50 transition-all active:scale-95"
                >
                  تصفح المستشفيات أوفلاين
                </button>
              </motion.div>
            </div>

            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
              className="relative"
            >
              <div className="relative z-10 rounded-[2.5rem] overflow-hidden shadow-2xl border-8 border-white">
                <img 
                  src="https://picsum.photos/seed/medical/800/600" 
                  alt="Medical Care" 
                  className="w-full h-auto object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-emerald-100 rounded-full -z-10"></div>
              <div className="absolute -bottom-10 -left-10 w-60 h-60 bg-blue-50 rounded-full -z-10"></div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-20 space-y-4">
            <h2 className="text-4xl font-bold">لماذا تختار تطبيق رعاية؟</h2>
            <p className="text-neutral-500 text-lg">صممنا كل تفصيلة لتكون رحلتك العلاجية أسهل وأكثر أماناً.</p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: MapPin, title: "تحديد الموقع الذكي", desc: "العثور على أقرب المستشفيات المجهزة لموقعك الحالي بدقة عالية." },
              { icon: Eye, title: "دعم المكفوفين", desc: "واجهات مخصصة ومعلومات واضحة تضمن سهولة الوصول للمعلومات." },
              { icon: Ear, title: "دعم الصم والبكم", desc: "توفير معلومات عن المستشفيات التي توفر مترجمي لغة إشارة." }
            ].map((feature, i) => (
              <div key={i} className="p-8 rounded-3xl border border-neutral-100 hover:border-emerald-200 hover:shadow-xl transition-all group">
                <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <feature.icon className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold mb-4">{feature.title}</h3>
                <p className="text-neutral-500 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Main Search Tool Section */}
      <section id="search-tool" className="py-24 bg-neutral-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="bg-white rounded-[3rem] shadow-2xl overflow-hidden border border-neutral-100">
            <div className="grid lg:grid-cols-5 min-h-[600px]">
              {/* Left Side: Info */}
              <div className="lg:col-span-2 bg-emerald-900 p-12 text-white flex flex-col justify-between">
                <div className="space-y-6">
                  <h2 className="text-4xl font-bold">أداة البحث الذكية</h2>
                  <p className="text-emerald-100 text-lg leading-relaxed">
                    استخدم الأداة للعثور على المستشفى المناسب في ثوانٍ. يمكنك البحث حسب موقعك الحالي أو اختيار المحافظة يدوياً.
                  </p>
                  <ul className="space-y-4">
                    <li className="flex items-center gap-3">
                      <div className="w-6 h-6 bg-emerald-700 rounded-full flex items-center justify-center text-xs">✓</div>
                      <span>أكثر من 500 مستشفى مسجل</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <div className="w-6 h-6 bg-emerald-700 rounded-full flex items-center justify-center text-xs">✓</div>
                      <span>تحديث يومي للبيانات</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <div className="w-6 h-6 bg-emerald-700 rounded-full flex items-center justify-center text-xs">✓</div>
                      <span>دعم فني على مدار الساعة</span>
                    </li>
                  </ul>
                </div>
                <div className="pt-12">
                  <div className="bg-emerald-800/50 p-6 rounded-2xl border border-emerald-700">
                    <p className="text-sm italic opacity-80">"هدفنا هو أن لا يشعر أي مواطن مصري بالعجز عند طلب الرعاية الصحية."</p>
                  </div>
                </div>
              </div>

              {/* Right Side: Interactive Tool */}
              <div className="lg:col-span-3 p-8 lg:p-16">
                <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-2xl flex items-start gap-3 mb-8">
                  <Info className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                  <p className="text-sm text-emerald-800 leading-relaxed">
                    <strong>يعمل أوفلاين:</strong> يمكنك استخدام قاعدة البيانات المحلية حتى بدون إنترنت. التطبيق يحفظ البيانات تلقائياً على هاتفك عند تثبيته.
                  </p>
                </div>
                <AnimatePresence mode="wait">
                  {/* Step 1: Disability Selection */}
                  {step === 1 && (
                    <motion.div 
                      key="step1"
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className="space-y-8"
                    >
                      <div className="space-y-2">
                        <h3 className="text-3xl font-bold">ابدأ البحث</h3>
                        <p className="text-neutral-500">اختر الطريقة التي تفضلها للبحث</p>
                      </div>

                      <div className="grid gap-4">
                        <button
                          onClick={handleNearMe}
                          className={`group relative overflow-hidden p-8 rounded-3xl flex items-center justify-center gap-6 transition-all active:scale-95 shadow-lg ${
                            locationStatus === 'denied' 
                              ? 'bg-red-50 border-2 border-red-100 text-red-600' 
                              : 'bg-emerald-600 text-white hover:bg-emerald-700 hover:shadow-xl'
                          }`}
                        >
                          <div className="relative">
                            <MapPin className="w-10 h-10" />
                            {locationStatus === 'granted' && (
                              <div className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center">
                                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            <span className="text-2xl font-bold block">
                              {locationStatus === 'denied' ? 'إذن الموقع مرفوض' : 'البحث بالقرب مني الآن'}
                            </span>
                            <span className={locationStatus === 'denied' ? 'text-red-400' : 'text-emerald-100'}>
                              {locationStatus === 'denied' 
                                ? 'يرجى تفعيل الموقع من إعدادات المتصفح للمتابعة' 
                                : 'استخدام الـ GPS للعثور على أقرب النتائج'}
                            </span>
                          </div>
                        </button>

                        <div className="relative py-4">
                          <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-neutral-200"></span></div>
                          <div className="relative flex justify-center text-xs uppercase"><span className="bg-white px-4 text-neutral-400 font-bold">أو اختر حسب الفئة</span></div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-4">
                          <button
                            onClick={() => handleDisabilitySelect('blind')}
                            className="group bg-white border-2 border-neutral-100 p-8 rounded-3xl flex flex-col items-center gap-4 transition-all hover:border-emerald-500 hover:shadow-lg active:scale-95"
                          >
                            <div className="bg-neutral-50 p-4 rounded-2xl group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors">
                              <Eye className="w-12 h-12" />
                            </div>
                            <span className="text-xl font-bold">خدمات المكفوفين</span>
                          </button>

                          <button
                            onClick={() => handleDisabilitySelect('deaf')}
                            className="group bg-white border-2 border-neutral-100 p-8 rounded-3xl flex flex-col items-center gap-4 transition-all hover:border-emerald-500 hover:shadow-lg active:scale-95"
                          >
                            <div className="bg-neutral-50 p-4 rounded-2xl group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors">
                              <Ear className="w-12 h-12" />
                            </div>
                            <span className="text-xl font-bold">خدمات الصم والبكم</span>
                          </button>
                        </div>

                        <button
                          onClick={handleBrowseOffline}
                          className="w-full py-4 bg-neutral-100 text-neutral-600 rounded-2xl font-bold hover:bg-neutral-200 transition-all flex flex-col items-center justify-center gap-1"
                        >
                          <div className="flex items-center gap-2">
                            <Search className="w-5 h-5" />
                            <span>تصفح قاعدة البيانات المخزنة (أوفلاين)</span>
                          </div>
                          <span className="text-[10px] opacity-60">
                            تتضمن {HOSPITAL_DATABASE.length + cachedHospitals.length} مستشفى متاح حالياً
                          </span>
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* Step 2: Governorate Selection */}
                  {step === 2 && (
                    <motion.div 
                      key="step2"
                      initial={{ opacity: 0, x: 50 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -50 }}
                      className="space-y-8"
                    >
                      <div className="flex items-center justify-between">
                        <div className="space-y-2">
                          <h3 className="text-3xl font-bold text-emerald-900">اختر المحافظة</h3>
                          <p className="text-neutral-500">نعرض المستشفيات المجهزة لخدمة {disability === 'blind' ? 'المكفوفين' : 'الصم والبكم'}</p>
                        </div>
                        <button onClick={reset} className="p-3 hover:bg-neutral-100 rounded-full transition-colors">
                          <ChevronLeft className="w-6 h-6 rotate-180" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                        {GOVERNORATES.map((gov) => (
                          <button
                            key={gov}
                            onClick={() => handleGovernorateSelect(gov)}
                            className="bg-white border border-neutral-100 p-4 rounded-2xl font-semibold hover:border-emerald-500 hover:bg-emerald-50 transition-all active:scale-95"
                          >
                            {gov}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Step 3: Hospital List */}
                  {step === 3 && (
                    <motion.div 
                      key="step3"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="space-y-8"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-3xl font-bold text-emerald-900">{governorate}</h3>
                            {showOfflineDb && (
                              <span className="bg-neutral-200 text-neutral-600 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider">
                                أوفلاين
                              </span>
                            )}
                            {governorate === "بالقرب مني" && (
                              <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                GPS نشط
                              </span>
                            )}
                          </div>
                          <p className="text-neutral-500">تم العثور على {hospitals.length} مستشفيات</p>
                        </div>
                        <button 
                          onClick={reset}
                          className="px-4 py-2 text-emerald-600 font-bold hover:bg-emerald-50 rounded-xl transition-colors"
                        >
                          بحث جديد
                        </button>
                      </div>

                      {loading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                          <div className="w-16 h-16 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
                          <p className="text-neutral-500 font-bold">جاري البحث عن أفضل الخيارات...</p>
                        </div>
                      ) : (
                        <div className="space-y-6 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                          {hospitals.length > 0 ? (
                            hospitals.map((hospital, idx) => (
                              <motion.div
                                key={idx}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.1 }}
                                className="bg-neutral-50 border border-neutral-100 p-6 rounded-3xl hover:shadow-md transition-shadow"
                              >
                                <h4 className="text-2xl font-bold text-emerald-900 mb-6">{hospital.name}</h4>
                                
                                <div className="grid md:grid-cols-2 gap-6">
                                  <div className="space-y-4">
                                    <button 
                                      onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hospital.name + ' ' + hospital.address)}`, '_blank')}
                                      className="flex items-center gap-4 w-full text-right hover:text-emerald-600 transition-colors group"
                                    >
                                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                                        <MapPin className="w-5 h-5 text-emerald-500" />
                                      </div>
                                      <span className="text-sm font-medium leading-relaxed">{hospital.address}</span>
                                    </button>
                                    
                                    <a 
                                      href={`tel:${hospital.phone}`}
                                      className="flex items-center gap-4 w-full text-right hover:text-emerald-600 transition-colors group"
                                    >
                                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm group-hover:scale-110 transition-transform">
                                        <Phone className="w-5 h-5 text-emerald-500" />
                                      </div>
                                      <span className="text-lg font-mono font-bold">{hospital.phone}</span>
                                    </a>
                                  </div>

                                  <div className="bg-white p-4 rounded-2xl border border-neutral-100">
                                    <p className="text-xs font-bold text-neutral-400 uppercase tracking-wider mb-3">الخدمات المتاحة</p>
                                    <div className="flex flex-wrap gap-2">
                                      {hospital.services.map((service, sIdx) => (
                                        <span key={sIdx} className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-lg text-xs font-bold">
                                          {service}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </motion.div>
                            ))
                          ) : (
                            <div className="text-center py-20 bg-neutral-50 rounded-3xl border-2 border-dashed border-neutral-200">
                              <Info className="w-16 h-16 text-neutral-300 mx-auto mb-4" />
                              <p className="text-neutral-500 text-xl font-bold">لم يتم العثور على مستشفيات حالياً.</p>
                              <button onClick={reset} className="mt-4 text-emerald-600 font-bold underline">جرب البحث في محافظة أخرى</button>
                            </div>
                          )}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer id="footer" className="bg-neutral-900 text-white py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-12 mb-16">
            <div className="col-span-2 space-y-6">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-600 p-2 rounded-xl">
                  <HospitalIcon className="text-white w-6 h-6" />
                </div>
                <span className="text-2xl font-bold">رعاية</span>
              </div>
              <p className="text-neutral-400 text-lg max-w-md leading-relaxed">
                منصة مصرية رائدة تهدف لتمكين ذوي الهمم من الوصول للخدمات الصحية بكل سهولة ويسر باستخدام أحدث تقنيات الذكاء الاصطناعي.
              </p>
            </div>
            
            <div className="space-y-6">
              <h4 className="text-xl font-bold">روابط سريعة</h4>
              <ul className="space-y-4 text-neutral-400">
                <li><a href="#" className="hover:text-emerald-400 transition-colors">الرئيسية</a></li>
                <li><a href="#features" className="hover:text-emerald-400 transition-colors">المميزات</a></li>
                <li><a href="#search-tool" className="hover:text-emerald-400 transition-colors">أداة البحث</a></li>
                <li><a href="#" className="hover:text-emerald-400 transition-colors">تواصل معنا</a></li>
              </ul>
            </div>

            <div className="space-y-6">
              <h4 className="text-xl font-bold">تواصل معنا</h4>
              <ul className="space-y-4 text-neutral-400">
                <li className="flex items-center gap-3">
                  <Phone className="w-5 h-5 text-emerald-500" />
                  <span>0155039025</span>
                </li>
              </ul>
            </div>
          </div>
          
          <div className="pt-12 border-t border-neutral-800 text-center text-neutral-500">
            <p>© {new Date().getFullYear()} رعاية. جميع الحقوق محفوظة. صنع بكل حب في مصر.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
