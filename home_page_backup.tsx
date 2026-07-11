import Link from "next/link";
import Image from "next/image";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0f0f0f] text-white selection:bg-emerald-500/30">
      {/* Navigation */}
      <nav className="border-b border-white/[0.06] bg-[#0f0f0f]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Image src="/logo.png" alt="Cenexa Logo" width={32} height={32} className="w-8 h-8 object-contain" />
            <span className="text-xl font-bold tracking-tight text-white">Cenexa Chatflow</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-white/60 hover:text-white transition-colors hidden sm:block">
              Sign In
            </Link>
            <Link href="/login" className="text-sm px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium transition-colors">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs sm:text-sm font-medium mb-8">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          WhatsApp Cloud API v19.0 Supported
        </div>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6 bg-gradient-to-br from-white to-white/40 bg-clip-text text-transparent leading-tight">
          Automate your support<br />with AI on WhatsApp.
        </h1>
        <p className="text-lg md:text-xl text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed">
          Connect your WhatsApp Business number in 2 minutes. Let our intelligent AI handle customer support, sales, and booking inquiries 24/7 without lifting a finger.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link href="/login" className="w-full sm:w-auto px-8 py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium text-lg transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)]">
            Start Free Trial
          </Link>
          <a href="#features" className="w-full sm:w-auto px-8 py-3.5 bg-white/[0.05] hover:bg-white/[0.1] text-white rounded-lg font-medium text-lg transition-colors border border-white/[0.06]">
            View Features
          </a>
        </div>
        
        {/* Preview Image/Dashboard Mockup */}
        <div className="mt-24 relative mx-auto max-w-5xl">
          <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/20 to-transparent blur-3xl opacity-20 -z-10" />
          <div className="rounded-2xl border border-white/[0.08] bg-[#141414] p-2 shadow-2xl overflow-hidden relative text-left">
             <div className="absolute top-0 left-0 w-full h-12 bg-white/[0.02] border-b border-white/[0.06] flex items-center px-4 gap-2">
               <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
               <div className="w-3 h-3 rounded-full bg-amber-500/20 border border-amber-500/50" />
               <div className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/50" />
             </div>
             
             {/* Dashboard Mockup */}
             <div className="h-[400px] mt-12 flex bg-[#0f0f0f] rounded-b-xl overflow-hidden">
                {/* Sidebar */}
                <div className="w-64 border-r border-white/[0.06] flex flex-col hidden md:flex">
                  <div className="p-4 border-b border-white/[0.06]">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center">
                         <Image src="/logo.png" alt="Logo" width={16} height={16} className="w-4 h-4 brightness-0 invert" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-white/90">Cenexa Chatflow</div>
                        <div className="text-xs text-white/40">3 active chats</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 p-3 space-y-1">
                    <div className="p-3 bg-white/[0.05] rounded-lg border border-white/[0.05]">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm text-white/90 font-medium">+1 (555) 0192</span>
                        <span className="text-xs text-emerald-400">Now</span>
                      </div>
                      <div className="text-xs text-white/50 truncate">Perfect, see you tomorrow!</div>
                    </div>
                    <div className="p-3 hover:bg-white/[0.02] rounded-lg transition-colors">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm text-white/70 font-medium">Sarah Jenkins</span>
                        <span className="text-xs text-white/30">2m</span>
                      </div>
                      <div className="text-xs text-white/40 truncate">Do you have any availability?</div>
                    </div>
                  </div>
                </div>
                
                {/* Chat Area */}
                <div className="flex-1 flex flex-col bg-[#141414]">
                  <div className="h-14 border-b border-white/[0.06] flex items-center justify-between px-6 bg-[#0f0f0f]">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-medium text-sm">+1</div>
                      <span className="text-sm font-medium text-white/90">+1 (555) 0192-834</span>
                    </div>
                    <div className="px-2 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded text-xs">AI Active</div>
                  </div>
                  <div className="flex-1 p-6 space-y-6 overflow-y-auto">
                     <div className="flex gap-4">
                        <div className="w-8 h-8 rounded-full bg-white/10 flex-shrink-0 flex items-center justify-center text-xs text-white/50">C</div>
                        <div className="max-w-[80%] bg-white/[0.03] p-4 rounded-2xl rounded-tl-none border border-white/[0.06] text-sm text-white/80 leading-relaxed shadow-sm">
                           Hi! I'm looking to book a consultation for next week. What days are you available?
                        </div>
                     </div>
                     <div className="flex gap-4 flex-row-reverse">
                        <div className="w-8 h-8 rounded-full bg-emerald-500 flex-shrink-0 flex items-center justify-center">
                          <Image src="/logo.png" alt="Bot" width={16} height={16} className="w-4 h-4 brightness-0 invert" />
                        </div>
                        <div className="max-w-[80%] bg-emerald-500/10 p-4 rounded-2xl rounded-tr-none border border-emerald-500/20 text-sm text-emerald-50/90 leading-relaxed shadow-sm">
                           Hello! I'd be happy to help you with that. We currently have openings on <strong>Tuesday at 2:00 PM</strong> and <strong>Thursday at 10:00 AM</strong>. Do either of those times work for you?
                        </div>
                     </div>
                  </div>
                </div>
             </div>

          </div>
        </div>
      </main>

      {/* Features Section */}
      <section id="features" className="py-24 border-t border-white/[0.06] bg-[#141414]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything you need to scale</h2>
            <p className="text-white/50 text-lg">Built for agencies and businesses that want to dominate conversational commerce.</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard 
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
              title="Instant Meta Setup"
              desc="Connect any phone number directly to the official WhatsApp Cloud API in under 2 minutes using Meta's Embedded Signup."
            />
            <FeatureCard 
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>}
              title="Intelligent AI Agent"
              desc="Train the bot on your business data. It automatically handles FAQs, books appointments, and captures leads seamlessly."
            />
            <FeatureCard 
              icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
              title="Multi-Tenant Architecture"
              desc="Perfect for SaaS and Agencies. Manage hundreds of clients and bots from a single, unified admin dashboard."
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] bg-[#0f0f0f] py-12 text-center text-white/40 text-sm">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Image src="/logo.png" alt="Cenexa Logo" width={24} height={24} className="w-6 h-6 opacity-50 grayscale hover:grayscale-0 hover:opacity-100 transition-all" />
          <span className="font-semibold text-white/60">Cenexa Systems</span>
        </div>
        <p>┬⌐ {new Date().getFullYear()} Cenexa Systems. All rights reserved.</p>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) {
  return (
    <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-all hover:-translate-y-1 hover:shadow-lg hover:shadow-emerald-500/5 group">
      <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-6 border border-emerald-500/20 group-hover:bg-emerald-500/20 group-hover:scale-110 transition-all">
        {icon}
      </div>
      <h3 className="text-xl font-semibold text-white mb-3">{title}</h3>
      <p className="text-white/50 leading-relaxed">{desc}</p>
    </div>
  );
}
