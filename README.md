## Submission Details

- Names with Roll Numbers: Kushagra Juneja (2210990533), Janvi Jain (2210990430), Vishal Raj (2210992537)
- Project Title: ERP Flow Studios - An Intelligent Clinic Management System
- Project Type: Copyright
- Team Details: Kushagra Juneja (2210990533), Janvi Jain (2210990430), Vishal Raj (2210992537)
- Submission Status: Waiting

## Status Screenshot

![Submission Status Screenshot](IPR_Document/Status_Screenshot.png)

# ERP Flow Studios — An Intelligent Clinic Management System

> **Version 2.7.0** · Full-stack clinic ERP · Web + Android + iOS + Desktop

A production-ready, multi-tenant healthcare ERP platform built for modern clinics. Covers the full patient lifecycle — from appointment tokens to prescriptions, pharmacy inventory, billing, analytics, and AI-powered tools.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (TypeScript) |
| Database | PostgreSQL via Prisma ORM |
| Styling | Tailwind CSS |
| Mobile | Capacitor (Android & iOS) |
| Desktop | Electron |
| Deployment | Vercel (web) + GitHub Actions |
| AI | Google Gemini (bill parsing) |
| OCR | Tesseract.js + Google Vision API |
| Auth | Custom JWT + session tokens |

---

## Features

### Patient Management
- Patient registration with Aadhaar scan (OCR)
- Visit history, diagnosis notes, prescriptions
- Prescription-to-bill conversion
- Patient token queue system with real-time status
- Import patients via CSV

### Pharmacy & Inventory
- Full product catalog with batch tracking
- Receive goods via AI-parsed bill upload (PDF / photo)
- Demand forecasting with visual analytics
- Low-stock alerts and reorder suggestions
- Sales recording with GST support

### AI Bill Processing
- **Pro plan**: Google Vision OCR → Gemini AI structured extraction
- **Basic plan**: Tesseract OCR (incl. scanned PDFs via pdfjs-dist) → Gemini AI
- Intelligent product name fuzzy-matching against inventory
- 3-step modal UI: Upload → Processing → Results with animated reveal

### Billing & Finance
- Customer invoice generation (PDF export)
- GST-aware sales (CGST / SGST / IGST)
- Supplier bill management
- Google Drive upload for bill archiving

### Clinic Management
- Multi-user roles: Admin, Doctor, Receptionist, Pharmacist
- Multi-account fast-switch
- Geo-access approval for remote logins
- Subscription plans (Basic / Pro) with feature gating
- Clinic public page editor (about, services, gallery, contact)

### Analytics & Reports
- Revenue, patient visit, and product sales charts
- Demand trend graphs
- Exportable reports

### Cross-Platform
- **Web**: Deployed on Vercel at `erpflowstudios.com`
- **Android / iOS**: Capacitor wrapper with video splash screen
- **Desktop**: Electron app with custom splash screen and auto-updater
- **PWA-ready**: Offline banner, service worker compatible

---

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL database
- (Optional) Google Vision API key for Pro OCR
- (Optional) Gemini API key for AI bill parsing

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Fill in DATABASE_URL, GEMINI_API_KEY, and other vars

# 3. Push database schema
npx prisma db push

# 4. Start development server
npm run dev
```

Visit `http://localhost:3000`

---

## Environment Variables

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/erpflow"

# Auth
JWT_SECRET="your-jwt-secret"
SESSION_SECRET="your-session-secret"

# AI / OCR
GEMINI_API_KEY="AIza..."
GOOGLE_VISION_API_KEY="AIza..."             # Pro plan Vision OCR
GOOGLE_APPLICATION_CREDENTIALS="./vision-key.json"  # Alternative: service account

# App
NEXT_PUBLIC_APP_URL="https://erpflowstudios.com"
```

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm start` | Start production server |
| `npm run lint` | ESLint check |
| `npx prisma db push` | Sync schema to database |
| `npx prisma studio` | Open Prisma database GUI |
| `npx cap sync android` | Sync web build to Android |
| `npx cap open android` | Open Android project in Android Studio |

---

## Project Structure

```
├── pages/              # Next.js pages (routes)
│   ├── api/            # API endpoints (patients, visits, billing, auth, …)
│   ├── app.tsx         # Mobile entry point (Capacitor)
│   ├── dashboard.tsx   # Main clinic dashboard
│   ├── patients.tsx    # Patient list & management
│   ├── pharmacy.tsx    # Pharmacy / inventory
│   └── …
├── components/         # Shared React components
│   ├── ReceiveGoodsBillUploadModal.tsx   # AI bill upload with 3-step UX
│   └── …
├── services/
│   └── billParserAI.ts # Gemini AI bill parser (dynamic model discovery)
├── lib/
│   ├── visionService.ts  # Google Vision OCR wrapper + usage tracking
│   └── …
├── prisma/
│   └── schema.prisma   # Full database schema
├── android/            # Capacitor Android project
├── ios/                # Capacitor iOS project
├── electron.js         # Electron desktop entry
├── splash.html         # Desktop splash screen
├── public/
│   ├── mobile-splash-screen.mp4  # Mobile app splash video
│   └── …
└── styles/             # Global CSS + Tailwind config
```

---

## Mobile (Android / iOS)

The mobile app is a Capacitor wrapper pointing at the live Vercel deployment.

```bash
# Build and sync
npm run build
npx cap sync

# Android
npx cap open android   # Opens Android Studio
# Then: Build > Generate Signed APK/Bundle

# iOS
npx cap open ios       # Opens Xcode
```

Key mobile features:
- Video splash screen on launch (`/public/mobile-splash-screen.mp4`) with version overlay
- Full-screen WebView with proper status bar handling (solid black, content below)
- Camera access for bill scanning

---

## Desktop (Electron)

```bash
npm run electron       # Dev mode
npm run electron:build # Package as .exe / .dmg
```

Features: custom video splash screen, auto-updater, native file access, offline support.

---

## Subscription Plans

| Feature | Basic | Pro |
|---|---|---|
| Patient management | ✓ | ✓ |
| Pharmacy & inventory | ✓ | ✓ |
| AI bill parsing (Gemini) | ✓ | ✓ |
| OCR engine | Tesseract (local) | Google Vision (cloud) |
| Scanned PDF OCR | ✓ (pdfjs-dist) | ✓ (Vision API) |
| Vision API monthly limit | — | 950 scans |
| Analytics | ✓ | ✓ |
| Multi-user | ✓ | ✓ |

---

## License

Copyright © 2026 ERP Flow Studios. All rights reserved.  
See [LICENSE](LICENSE) and [COPYRIGHT](COPYRIGHT) for details.




