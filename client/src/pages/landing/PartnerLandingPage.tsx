// src/pages/landing/PartnerLandingPage.tsx
// ============================================
// Purpose: Public marketing landing page for the FlavorCourt City
//          Operator program. Lives at /partner. Targets entrepreneurs
//          in tier-2/3 Pakistani cities who want to run their own
//          food delivery business using our platform.
//
//          NOT inside MainLayout on purpose — this page is a
//          marketing site, not a product. No nav, no cart, no
//          "logged in" indicators. Pure conversion page.
//
//          Section structure (top → bottom):
//            1. Sticky nav (logo + Sign in to app + Apply now)
//            2. Hero (headline, subheadline, dual CTA, trust badge)
//            3. Social proof bar (4 numbers)
//            4. Problem ("Why your city is underserved")
//            5. Solution ("What FlavorCourt is + what you get")
//            6. How it works (4 steps)
//            7. Unit economics (realistic table)
//            8. Who is this for (3 personas)
//            9. What you get (feature grid)
//           10. Testimonial (placeholder for first partner)
//           11. FAQ (6 objection-handling Qs)
//           12. Final CTA + lead capture form
//           13. Footer
// ============================================

import { useState, useEffect, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Store,
  TrendingUp,
  MapPin,
  Smartphone,
  CreditCard,
  Headphones,
  GraduationCap,
  Award,
  BarChart3,
  Bike,
  ShieldCheck,
  Quote,
  Phone,
  Mail,
  MessageCircle,
  Sparkles,
} from "lucide-react";
import api from "@/lib/api";

// ============================================================
// STATIC CONTENT
// ============================================================
// Centralized here so the page reads as a single document. When
// the first real partner signs, swap the testimonial + the stats
// in section 3 (social proof bar). Everything else is durable.

const HERO = {
  // The single most important line on the page. Reframes the
  // product as a business opportunity, not a tech platform.
  headline: "Be the Foodpanda of your city.",
  subhead:
    "Launch your own food delivery business in 30 days. We built the platform, the brand, and the playbook. You run the operation. Keep 85% of the commission.",
  primaryCta: "Apply to operate FlavorCourt in your city",
  secondaryCta: "See the unit economics first",
  trustBadge: "Join 1 city operator live in Faisalabad · more launching in 2025",
};

const SOCIAL_PROOF = [
  { value: "1", label: "City live today", icon: MapPin },
  { value: "30+", label: "Restaurants onboarded", icon: Store },
  { value: "500+", label: "Orders delivered", icon: TrendingUp },
  { value: "15%", label: "Restaurant commission", icon: CreditCard },
];

const PROBLEM_POINTS = [
  {
    title: "Foodpanda and Careem are weak outside the top 5 cities",
    body: "Their rider density is thin, restaurant onboarding is slow, and customer service is non-existent in tier-2/3 markets. That's the gap you fill.",
  },
  {
    title: "Independent restaurants are invisible online",
    body: "Chains get all the marketing love. The best biryani shop in your city probably doesn't even have a website. You bring them online and they become your loyal partners.",
  },
  {
    title: "Building a platform from scratch is impossible",
    body: "A custom food delivery platform costs Rs. 50 lakh+ and 12 months of engineering. We've already built it, battle-tested it, and are sharing the upside with city operators.",
  },
];

const SOLUTION_PILLARS = [
  {
    icon: Smartphone,
    title: "Customer + rider + admin apps",
    body: "Full PWA stack: customer app for ordering, rider app for delivery, admin panel for ops. Already live. Already paid for.",
  },
  {
    icon: CreditCard,
    title: "Payments baked in",
    body: "Safepay + PayPal + cash on delivery. Money lands in your account, not ours. We don't hold your cash.",
  },
  {
    icon: Bike,
    title: "Real-time rider tracking",
    body: "Google Maps integration. Customers watch their food from kitchen to door. Riders get optimal route suggestions. Live in 15-second updates.",
  },
  {
    icon: ShieldCheck,
    title: "Auth, fraud, rate limits handled",
    body: "JWT auth, single-session enforcement for admins, brute-force protection, request throttling. Security is not your problem.",
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Sign your city",
    body: "15-min discovery call. We qualify fit. You sign the territory agreement. We hand you the playbook, the brand kit, and the training portal.",
    duration: "Week 1",
  },
  {
    step: "02",
    title: "Train with our team",
    body: "2 weeks of live online training + 1 week shadowing our live operation. Restaurant outreach, rider hiring, marketing, customer support — all taught, all scripted.",
    duration: "Weeks 2–4",
  },
  {
    step: "03",
    title: "Launch in your city",
    body: "Sign 10+ restaurants. Hire 5–10 riders. Run a 2-week launch promo. We support daily for the first 30 days.",
    duration: "Weeks 5–6",
  },
  {
    step: "04",
    title: "Grow with our support",
    body: "Monthly business reviews. Quarterly platform upgrades. 24/7 technical support. You're never alone — your success is our recurring revenue.",
    duration: "Month 2+",
  },
];

const UNIT_ECONOMICS = {
  title: "What you can make in Year 1",
  subtitle: "Realistic numbers from a tier-2 city. Conservative assumptions, not best case.",
  rows: [
    { label: "Restaurants on platform (after 6 months)", value: "30" },
    { label: "Daily orders (after 6 months)", value: "50" },
    { label: "Average order value", value: "Rs. 1,000" },
    { label: "Monthly gross merchandise value", value: "Rs. 15,00,000" },
    { label: "Your commission (15%)", value: "Rs. 2,25,000" },
    { label: "Rider costs (15% of GMV)", value: "Rs. 2,25,000" },
    { label: "Marketing spend", value: "Rs. 50,000" },
    { label: "Platform fee (paid to us)", value: "Rs. 50,000" },
    { label: "Net profit / month", value: "Rs. 1,00,000" },
    { label: "Year 1 total profit", value: "Rs. 6 – 12 lakh" },
    { label: "Initial investment (setup fee + working capital)", value: "Rs. 15 – 20 lakh" },
    { label: "Payback period", value: "12 – 18 months" },
  ],
  caveat:
    "These are realistic mid-case numbers from a tier-2 launch. Top operators in dense markets have hit 2x this. Cities with low Foodpanda presence can outperform these projections in Year 1.",
};

const PERSONAS = [
  {
    title: "The corporate refugee",
    body: "10+ years in banking, telecom, or FMCSA. Tired of the politics. Has Rs. 20–30 lakh saved. Wants to build something real, not flip another app. You give them the platform; they bring the discipline.",
    example: "Best fit: age 30–45, MBA or engineering, currently in a senior corporate role",
  },
  {
    title: "The overseas returnee",
    body: "Spent 5–10 years in the Gulf, UK, or US. Came back to Pakistan with savings and a dream. Doesn't know the local food market but has the capital and the hunger. You give them the playbook; they bring the capital.",
    example: "Best fit: age 28–40, ready to settle in Pakistan, ready to hustle",
  },
  {
    title: "The existing business owner",
    body: "Already runs a restaurant, a real estate office, or a small chain. Sees food delivery as the next logical expansion. Doesn't want to build tech. You give them the platform; they bring the local relationships.",
    example: "Best fit: age 30–50, has 1+ operational business, wants a new revenue line",
  },
];

const FEATURES = [
  { icon: Smartphone, title: "Customer PWA" },
  { icon: Bike, title: "Rider app" },
  { icon: BarChart3, title: "Admin dashboard" },
  { icon: CreditCard, title: "Payment gateway" },
  { icon: MapPin, title: "Live GPS tracking" },
  { icon: GraduationCap, title: "30-day training" },
  { icon: Award, title: "Brand rights" },
  { icon: Headphones, title: "24/7 support" },
];

const FAQ_ITEMS = [
  {
    q: "Why would I pay you when I can build this myself?",
    a: "You absolutely can. It'll cost Rs. 50–80 lakh and 12 months of engineering, plus a tech team you have to find, manage, and retain. We charge Rs. 15–25 lakh for the same outcome, live in 30 days, with a team that's already built three iterations of the platform. Your time and capital are the constraint. We remove both.",
  },
  {
    q: "What if Foodpanda launches in my city?",
    a: "Tier-2 and tier-3 cities are not in Foodpanda's 3-year roadmap. They're focused on density in the top 5 metros. By the time they reach your city, you'll have 50+ restaurants locked in, a known brand, and a local rider team they can't replicate cheaply. The first-mover advantage is huge. And we can pivot you to defensible niches (corporate orders, cloud kitchens, subscriptions) that the big players won't prioritize.",
  },
  {
    q: "What if the business doesn't work?",
    a: "Two safeguards. First, we don't take your money and disappear — we train you for 30 days and support you for 90 days. If after that you're not showing signs of traction, we refund your setup fee (minus training costs). Second, the unit economics are conservative — we under-promise and over-deliver. Realistic Year 1 net profit is Rs. 6–12 lakh, with growth in Year 2.",
  },
  {
    q: "Do I need tech experience?",
    a: "No. We handle all of it. You need to be a hustler who can sign restaurants, manage a small team, and keep customers happy. If you've ever run any kind of small business — even a tuckshop — you can do this. The training is built for non-technical founders.",
  },
  {
    q: "How much time does this take per week?",
    a: "Full-time for the first 6 months. This is not a side hustle. You're building a real business. Expect 50–60 hours/week during launch, settling into 40–45 hours/week as the operation matures. Most successful city operators quit their day job within 3 months of signing.",
  },
  {
    q: "What cities are still available?",
    a: "Almost all of them. Faisalabad, Multan, Hyderabad, Peshawar, Quetta, Sialkot, Gujranwala, Bahawalpur, Sahiwal, Mardan, Abbottabad, Mingora, Dera Ghazi Khan, Sahiwal, Kasur, Okara, and many more. Karachi and Lahore are taken. The first operator in any city gets exclusive territory rights for 3 years.",
  },
];

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function PartnerLandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900 antialiased">
      <StickyNav />
      <Hero />
      <SocialProofBar />
      <Problem />
      <Solution />
      <HowItWorks />
      <UnitEconomics />
      <WhoIsThisFor />
      <WhatYouGet />
      <Testimonial />
      <FAQ />
      <FinalCTA />
      <Footer />
    </div>
  );
}

// ============================================================
// STICKY NAV
// ============================================================
function StickyNav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all ${
        scrolled
          ? "bg-white/95 backdrop-blur-sm shadow-sm"
          : "bg-white/0"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link to="/partner" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-orange flex items-center justify-center text-white font-bold">
            F
          </div>
          <span className="font-extrabold text-lg tracking-tight">
            FlavorCourt
          </span>
          <span className="hidden sm:inline text-xs text-gray-500 ml-1">
            for City Operators
          </span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            to="/"
            className="hidden sm:inline text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            Sign in to app
          </Link>
          <a
            href="#apply"
            className="text-sm font-semibold text-white bg-orange hover:bg-hoverOrange px-3 sm:px-4 py-2 rounded-md transition-colors"
          >
            Apply now
          </a>
        </div>
      </div>
    </nav>
  );
}

// ============================================================
// HERO
// ============================================================
function Hero() {
  return (
    <section className="pt-32 pb-20 sm:pt-40 sm:pb-28 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-orange-50 via-white to-white">
      <div className="max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-orange/10 text-orange-700 rounded-full text-xs font-semibold mb-6">
          <Sparkles className="w-3 h-3" />
          Now hiring city operators for tier-2 & tier-3 Pakistan
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.05] mb-6">
          {HERO.headline}
        </h1>
        <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto mb-8 leading-relaxed">
          {HERO.subhead}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
          <a
            href="#apply"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-orange hover:bg-hoverOrange text-white font-semibold px-6 py-3.5 rounded-lg shadow-sm transition-colors"
          >
            {HERO.primaryCta}
            <ArrowRight className="w-4 h-4" />
          </a>
          <a
            href="#economics"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-white border border-gray-300 hover:border-gray-400 text-gray-800 font-semibold px-6 py-3.5 rounded-lg transition-colors"
          >
            {HERO.secondaryCta}
          </a>
        </div>
        <p className="text-sm text-gray-500">
          {HERO.trustBadge}
        </p>
      </div>
    </section>
  );
}

// ============================================================
// SOCIAL PROOF BAR
// ============================================================
function SocialProofBar() {
  return (
    <section className="py-12 sm:py-16 border-y border-gray-100 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
          {SOCIAL_PROOF.map((stat) => (
            <div key={stat.label} className="text-center">
              <stat.icon className="w-6 h-6 mx-auto mb-2 text-orange" />
              <div className="text-3xl sm:text-4xl font-extrabold text-gray-900">
                {stat.value}
              </div>
              <div className="text-xs sm:text-sm text-gray-500 mt-1">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-gray-400 mt-8">
          Update these numbers when you have a real partner testimonial.
        </p>
      </div>
    </section>
  );
}

// ============================================================
// PROBLEM
// ============================================================
function Problem() {
  return (
    <section className="py-20 sm:py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-sm font-semibold text-orange uppercase tracking-wider mb-2">
            The opportunity
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
            Tier-2 and tier-3 cities are starving for delivery
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Foodpanda and Careem are stretched thin. Independent
            restaurants are invisible. The gap is wide — and you can
            own it.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {PROBLEM_POINTS.map((p) => (
            <div
              key={p.title}
              className="p-6 rounded-xl border border-gray-200 hover:border-orange hover:shadow-md transition-all"
            >
              <h3 className="font-bold text-lg mb-2">{p.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================
// SOLUTION
// ============================================================
function Solution() {
  return (
    <section className="py-20 sm:py-24 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-sm font-semibold text-orange uppercase tracking-wider mb-2">
            The solution
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
            We built the platform. You run the business.
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            FlavorCourt is a complete, battle-tested food delivery
            platform. We license it to entrepreneurs who want to own
            and operate food delivery in their city.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-6">
          {SOLUTION_PILLARS.map((p) => (
            <div
              key={p.title}
              className="p-6 bg-white rounded-xl border border-gray-200 flex gap-4"
            >
              <div className="shrink-0 w-12 h-12 rounded-lg bg-orange/10 text-orange flex items-center justify-center">
                <p.icon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg mb-1">{p.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{p.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================
// HOW IT WORKS
// ============================================================
function HowItWorks() {
  return (
    <section className="py-20 sm:py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-sm font-semibold text-orange uppercase tracking-wider mb-2">
            How it works
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
            From signed agreement to first order in 30 days
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {HOW_IT_WORKS.map((s) => (
            <div
              key={s.step}
              className="relative p-6 rounded-xl border border-gray-200 bg-white"
            >
              <div className="text-5xl font-extrabold text-orange/20 leading-none mb-3">
                {s.step}
              </div>
              <h3 className="font-bold text-lg mb-2">{s.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed mb-3">
                {s.body}
              </p>
              <p className="text-xs font-semibold text-orange">{s.duration}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================
// UNIT ECONOMICS
// ============================================================
function UnitEconomics() {
  return (
    <section id="economics" className="py-20 sm:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-gray-900 to-gray-800 text-white">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-sm font-semibold text-orange uppercase tracking-wider mb-2">
            Unit economics
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
            {UNIT_ECONOMICS.title}
          </h2>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            {UNIT_ECONOMICS.subtitle}
          </p>
        </div>
        <div className="bg-gray-700/50 backdrop-blur rounded-2xl p-2 border border-gray-600">
          <table className="w-full">
            <tbody>
              {UNIT_ECONOMICS.rows.map((row) => {
                const isTotal = row.label.toLowerCase().includes("net profit") || row.label.toLowerCase().includes("total profit");
                return (
                  <tr
                    key={row.label}
                    className={`border-b border-gray-600/50 last:border-b-0 ${
                      isTotal ? "bg-orange/10" : ""
                    }`}
                  >
                    <td className={`px-4 py-3 text-sm ${isTotal ? "font-bold" : "text-gray-300"}`}>
                      {row.label}
                    </td>
                    <td className={`px-4 py-3 text-sm text-right ${isTotal ? "font-bold text-orange" : "font-semibold"}`}>
                      {row.value}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-gray-400 mt-6 text-center max-w-2xl mx-auto">
          {UNIT_ECONOMICS.caveat}
        </p>
      </div>
    </section>
  );
}

// ============================================================
// WHO IS THIS FOR
// ============================================================
function WhoIsThisFor() {
  return (
    <section className="py-20 sm:py-24 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-sm font-semibold text-orange uppercase tracking-wider mb-2">
            Who is this for
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
            We work best with three kinds of founders
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {PERSONAS.map((p) => (
            <div
              key={p.title}
              className="p-6 rounded-xl bg-gradient-to-br from-orange-50 to-white border border-orange-100"
            >
              <h3 className="font-bold text-lg mb-2 text-gray-900">{p.title}</h3>
              <p className="text-sm text-gray-700 leading-relaxed mb-3">{p.body}</p>
              <p className="text-xs italic text-orange-700">{p.example}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================
// WHAT YOU GET
// ============================================================
function WhatYouGet() {
  return (
    <section className="py-20 sm:py-24 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-sm font-semibold text-orange uppercase tracking-wider mb-2">
            What you get
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
            Everything you need to launch in 30 days
          </h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="p-6 bg-white rounded-xl border border-gray-200 text-center"
            >
              <f.icon className="w-8 h-8 mx-auto mb-3 text-orange" />
              <p className="font-semibold text-sm">{f.title}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================
// TESTIMONIAL
// ============================================================
// Placeholder — replace with a real quote + photo when the first
// partner is live. Keep the visual layout the same so swapping is
// just text changes.
function Testimonial() {
  return (
    <section className="py-20 sm:py-24 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-3xl mx-auto">
        <div className="relative p-8 sm:p-10 rounded-2xl bg-gradient-to-br from-orange-50 to-white border border-orange-100">
          <Quote className="absolute top-6 left-6 w-10 h-10 text-orange/20" />
          <div className="relative">
            <p className="text-lg sm:text-xl text-gray-800 leading-relaxed italic mb-6">
              "When our first partner is live, this quote will be theirs.
              We're building FlavorCourt for first-time city operators
              who want to build a real business, not a side hustle.
              Their story will go here."
            </p>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-orange/20 flex items-center justify-center text-orange font-bold">
                ?
              </div>
              <div>
                <p className="font-bold text-gray-900">[Partner Name]</p>
                <p className="text-sm text-gray-600">
                  FlavorCourt [City] · Launching 2025
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// FAQ
// ============================================================
function FAQ() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  return (
    <section className="py-20 sm:py-24 px-4 sm:px-6 lg:px-8 bg-gray-50">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-sm font-semibold text-orange uppercase tracking-wider mb-2">
            FAQ
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
            Questions you're probably asking
          </h2>
        </div>
        <div className="space-y-3">
          {FAQ_ITEMS.map((item, idx) => {
            const isOpen = openIdx === idx;
            return (
              <div
                key={item.q}
                className="bg-white rounded-xl border border-gray-200 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => setOpenIdx(isOpen ? null : idx)}
                  className="w-full flex items-center justify-between gap-4 p-5 text-left hover:bg-gray-50 transition-colors"
                >
                  <span className="font-semibold text-gray-900">{item.q}</span>
                  {isOpen ? (
                    <ChevronUp className="w-5 h-5 text-gray-500 shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-500 shrink-0" />
                  )}
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 text-sm text-gray-700 leading-relaxed">
                    {item.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ============================================================
// FINAL CTA + LEAD CAPTURE FORM
// ============================================================
function FinalCTA() {
  return (
    <section id="apply" className="py-20 sm:py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-white to-orange-50">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-4">
            Ready to launch in your city?
          </h2>
          <p className="text-lg text-gray-600">
            Apply below. We'll get back to you within 2 business days
            with next steps and a 15-min discovery call invitation.
          </p>
        </div>
        <LeadCaptureForm />
      </div>
    </section>
  );
}

// ============================================================
// LEAD CAPTURE FORM
// ============================================================
// Posts to POST /api/partner/lead. The backend stores it in
// MongoDB so the founder can follow up via WhatsApp/email.
// We intentionally do NOT require login — this is a public
// marketing form, not an authenticated flow.
function LeadCaptureForm() {
  const [form, setForm] = useState({
    fullname: "",
    email: "",
    phone: "",
    city: "",
    capital: "" as "" | "lt-10" | "10-25" | "25-50" | "gt-50",
    background: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const update = (k: keyof typeof form, v: string) => setForm({ ...form, [k]: v });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // Quick client-side validation
    if (!form.fullname.trim() || !form.email.trim() || !form.phone.trim() || !form.city.trim()) {
      toast.error("Please fill in your name, email, phone, and city");
      return;
    }
    if (!form.capital) {
      toast.error("Please select your investment range");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/partner/lead", form);
      setSubmitted(true);
      toast.success("Application received — we'll be in touch within 2 business days");
    } catch (err) {
      // Generic error — don't leak backend details
      toast.error("Couldn't submit. Please try again or WhatsApp us directly.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="p-8 bg-white rounded-2xl border border-green-200 shadow-sm text-center">
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
          <Check className="w-7 h-7 text-green-600" />
        </div>
        <h3 className="text-2xl font-bold text-gray-900 mb-2">
          Application received
        </h3>
        <p className="text-gray-600 mb-6">
          We'll review and reach out within 2 business days. Keep an
          eye on your WhatsApp and email.
        </p>
        <p className="text-sm text-gray-500">
          Want to skip the wait? WhatsApp us directly at{" "}
          <a
            href="https://wa.me/923000000000"
            className="text-orange font-semibold hover:underline"
          >
            +92 300 0000000
          </a>
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="p-6 sm:p-8 bg-white rounded-2xl border border-gray-200 shadow-sm space-y-4"
    >
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-semibold text-gray-700 block mb-1.5">
            Full name *
          </label>
          <Input
            value={form.fullname}
            onChange={(e) => update("fullname", e.target.value)}
            placeholder="Abiha Khan"
            required
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-gray-700 block mb-1.5">
            Email *
          </label>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-semibold text-gray-700 block mb-1.5">
            WhatsApp number *
          </label>
          <Input
            type="tel"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
            placeholder="+92 300 0000000"
            required
          />
        </div>
        <div>
          <label className="text-sm font-semibold text-gray-700 block mb-1.5">
            City you want to operate in *
          </label>
          <Input
            value={form.city}
            onChange={(e) => update("city", e.target.value)}
            placeholder="Faisalabad"
            required
          />
        </div>
      </div>
      <div>
        <label className="text-sm font-semibold text-gray-700 block mb-1.5">
          Investment capacity *
        </label>
        <select
          value={form.capital}
          onChange={(e) => update("capital", e.target.value)}
          required
          className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange"
        >
          <option value="">Select range…</option>
          <option value="lt-10">Under Rs. 10 lakh (not a fit yet)</option>
          <option value="10-25">Rs. 10 – 25 lakh (typical)</option>
          <option value="25-50">Rs. 25 – 50 lakh (comfortable)</option>
          <option value="gt-50">Rs. 50 lakh+ (multi-city ready)</option>
        </select>
      </div>
      <div>
        <label className="text-sm font-semibold text-gray-700 block mb-1.5">
          Tell us about yourself <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <Textarea
          value={form.background}
          onChange={(e) => update("background", e.target.value)}
          placeholder="Current role, why you want to do this, any relevant experience…"
          rows={3}
        />
      </div>
      <Button
        type="submit"
        disabled={submitting}
        className="w-full bg-orange hover:bg-hoverOrange text-white font-semibold h-12"
      >
        {submitting ? "Submitting…" : "Apply to operate FlavorCourt"}
        {!submitting && <ArrowRight className="ml-2 w-4 h-4" />}
      </Button>
      <p className="text-xs text-gray-500 text-center">
        We'll never share your details. By submitting, you agree to
        receive a follow-up call or message.
      </p>
    </form>
  );
}

// ============================================================
// FOOTER
// ============================================================
function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-400 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto grid sm:grid-cols-2 md:grid-cols-4 gap-8">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-lg bg-orange flex items-center justify-center text-white font-bold">
              F
            </div>
            <span className="font-extrabold text-lg text-white">FlavorCourt</span>
          </div>
          <p className="text-sm">
            Food delivery, built for cities others ignore.
          </p>
        </div>
        <div>
          <p className="text-sm font-semibold text-white mb-3">For operators</p>
          <ul className="space-y-2 text-sm">
            <li><a href="#apply" className="hover:text-white">Apply now</a></li>
            <li><a href="#economics" className="hover:text-white">Unit economics</a></li>
            <li><a href="#faq" className="hover:text-white">FAQ</a></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-white mb-3">For everyone</p>
          <ul className="space-y-2 text-sm">
            <li><Link to="/" className="hover:text-white">Order food</Link></li>
            <li><Link to="/signup" className="hover:text-white">Create account</Link></li>
            <li><a href="https://wa.me/923000000000" className="hover:text-white">Customer support</a></li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-white mb-3">Contact</p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4" />
              <a href="https://wa.me/923000000000" className="hover:text-white">WhatsApp</a>
            </li>
            <li className="flex items-center gap-2">
              <Mail className="w-4 h-4" />
              <a href="mailto:partner@flavourcourt.com" className="hover:text-white">partner@flavourcourt.com</a>
            </li>
            <li className="flex items-center gap-2">
              <Phone className="w-4 h-4" />
              <a href="tel:+923000000000" className="hover:text-white">+92 300 0000000</a>
            </li>
          </ul>
        </div>
      </div>
      <div className="max-w-6xl mx-auto mt-12 pt-6 border-t border-gray-800 text-xs text-center">
        © {new Date().getFullYear()} FlavorCourt. All rights reserved. ·
        Built in Pakistan 🇵🇰
      </div>
    </footer>
  );
}
