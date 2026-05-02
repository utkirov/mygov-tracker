import { LandingNav }  from '@/components/landing/LandingNav';
import { Hero }        from '@/components/landing/Hero';
import { Features }    from '@/components/landing/Features';
import { HowItWorks }  from '@/components/landing/HowItWorks';
import { Pricing }     from '@/components/landing/Pricing';
import { CTASection }  from '@/components/landing/CTASection';
import { Footer }      from '@/components/landing/Footer';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <LandingNav />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Pricing />
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}
