import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../contexts/AuthContext'
import LandingHeader from '../components/LandingHeader'
import Hero from '../components/modern-landing/Hero'
import Services from '../components/modern-landing/Services'
import Benefits from '../components/modern-landing/Benefits'
import TrustSection from '../components/modern-landing/TrustSection'
import Pricing from '../components/modern-landing/Pricing'
import Contact from '../components/modern-landing/Contact'
import FooterSection from '../components/modern-landing/Footer'
import SEO from '../components/SEO'

export default function LandingPage() {
  const router = useRouter()

  const { user } = useAuth()

  useEffect(() => {
    // Native apps should never see the landing page.
    const cap = typeof window !== 'undefined' ? (window as any).Capacitor : null
    const isNativeCapacitor = !!cap && (
      (typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) ||
      (typeof cap.getPlatform === 'function' && cap.getPlatform() !== 'web')
    )
    if (typeof window !== 'undefined' && ((window as any).electronAPI || isNativeCapacitor)) {
      router.replace('/login')
      return
    }
  }, [])

  useEffect(() => {
    // Redirect receptionist to patients page
    if (user && user.role === 'receptionist') {
      router.push('/patients')
    }
  }, [user])

  return (
    <>
      <SEO
        canonicalPath="/"
        description="ERP Flow Studios is a modern clinic management ERP designed to help healthcare teams manage doctors, staff, billing, tasks, and workflows efficiently in one secure platform."
        keywords={[
          'clinic ERP India',
          'small clinic software',
          'medical ERP system India',
          'clinic management software India',
        ]}
        openGraph={{
          description: 'Streamline clinic operations with ERP Flow Studios. Manage doctors, staff, billing, and clinic workflows in one platform.',
        }}
      />
      <main className="min-h-screen bg-white dark:bg-[#0a0a0a] relative">
        <LandingHeader />
        <Hero />
        <Services />
        <Benefits />
        <TrustSection />
        <Pricing />
        <Contact />
        <FooterSection />
      </main>
    </>
  )
}


